// Follows the reader through the script.
//
// Every recognition result is the transcript heard so far. Its newest words
// are aligned, in order, against the script around the current position. The
// further a place is from where we are, the more evidence it takes to move
// there:
//   - the next word or the one after it: any match, even "и";
//   - a few words ahead: one content word, or two words in order;
//   - further ahead: two words in a row, at least one of them a content word;
//   - far ahead: three words in a row, at least two content words;
//   - behind (a passage read again): four words in a row, heard one by one.
// A heard word is used once, so a transcript that is delivered again, or
// repeated by the browser, cannot move the script twice.

import type { Token } from './normalize.ts';
import { similarity } from './similarity.ts';

const TAIL = 8;             // newest heard words taken into account
const MIN_SIM = 0.7;        // below this two words are different words
const SURE_SIM = 0.75;      // a word matched on its own has to be at least this close
const WEAK_WEIGHT = 0.3;    // how much a function word adds to a run
const MID = 15;             // tokens past the near zone reachable with two words in a row
const FAR = 80;             // furthest jump ahead
const BACK = 60;            // furthest return to a passage read again
const MAX_HEARD_SKIP = 2;   // heard words that may sit between two matches
const MAX_SCRIPT_SKIP = 3;  // script words that may sit between two matches
const SKIP_COST = 0.25;
const DISTANCE_COST = 0.03;
const BACK_COST = 1.5;
const ECHO = 3;             // a repeated tail at least this long is the browser's echo

// What is known about the best way to match a heard word to a script word.
interface Match {
    // Loose chain: earlier matches in the same order, a few words may be
    // skipped on either side.
    score: number;
    count: number;
    // Streak: matches directly one after another. Only function words of the
    // script may be missing in between.
    streak: number;        // matched words
    streakStrong: number;  // matched content words
    streakEvents: number;  // recognition results those words arrived in
}

export class Tracker {
    // Index of the script token expected next.
    pos = 0;
    // How many tokens ahead a single content word is trusted.
    near: number;

    private script: Token[];
    private transcript: Token[] = []; // the transcript as last delivered
    private carried: Token[] = [];    // unused words of the transcript before it
    private arrival: number[] = [];   // result number each heard word first appeared in
    private used = 0;                 // heard words before this index are spent
    private seq = 0;

    constructor(script: Token[], near = 5) {
        this.script = script;
        this.near = near;
    }

    // Moves to a place chosen by hand; what was heard before no longer counts.
    jumpTo(pos: number): void {
        this.pos = Math.max(0, Math.min(pos, this.script.length));
        this.used = this.carried.length + this.transcript.length;
    }

    // Starts a new listening session.
    forget(): void {
        this.transcript = [];
        this.carried = [];
        this.arrival = [];
        this.used = 0;
    }

    // Takes the transcript heard so far; returns true when the position moved.
    feed(tokens: Token[]): boolean {
        this.seq++;

        // The transcript usually grows at the end while its beginning stays.
        // Words past the unchanged beginning are new or were revised.
        let same = 0;
        const overlap = Math.min(this.transcript.length, tokens.length);
        while (same < overlap && similarity(this.transcript[same], tokens[same]) >= MIN_SIM) same++;

        if (same === 0 && this.transcript.length > 0) {
            // A new transcript began (a pause, a restart). The unused end of
            // the old one still tells where the reader is.
            const old = this.carried.concat(this.transcript);
            const keep = Math.max(this.used, old.length - TAIL);
            this.carried = old.slice(keep);
            this.arrival = this.arrival.slice(keep, old.length);
            this.used = 0;
        }

        const offset = this.carried.length;
        this.arrival.length = offset + same;
        for (let i = same; i < tokens.length; i++) this.arrival[offset + i] = this.seq;
        this.used = Math.min(this.used, offset + same);
        this.transcript = tokens;

        if (this.isEcho(tokens, same)) this.used = offset + tokens.length;

        const heard = offset ? this.carried.concat(tokens) : tokens;
        const from = Math.max(this.used, heard.length - TAIL);
        const count = heard.length - from;
        if (count <= 0) return false;

        const lo = Math.max(0, this.pos - BACK);
        const hi = Math.min(this.script.length, this.pos + FAR);
        const width = hi - lo;
        const matches: (Match | undefined)[] = new Array(count * width);
        let best: { i: number; j: number; value: number } | null = null;

        for (let i = 0; i < count; i++) {
            const word = heard[from + i];
            for (let j = lo; j < hi; j++) {
                const target = this.script[j];
                const sim = similarity(word, target);
                if (sim < MIN_SIM) continue;

                const own = sim * (target.weak ? WEAK_WEIGHT : 1);
                const strong = target.weak ? 0 : 1;
                const match: Match = { score: own, count: 1, streak: 1, streakStrong: strong, streakEvents: 1 };
                let streakScore = 0;

                for (let di = 1; di <= MAX_HEARD_SKIP + 1 && di <= i; di++) {
                    for (let dj = 1; dj <= MAX_SCRIPT_SKIP + 1 && j - dj >= lo; dj++) {
                        const before = matches[(i - di) * width + (j - dj - lo)];
                        if (!before) continue;
                        let skips = di - 1;
                        for (let k = j - dj + 1; k < j; k++) {
                            if (!this.script[k].weak) skips++;
                        }
                        const score = before.score + own - SKIP_COST * skips;
                        if (score > match.score) {
                            match.score = score;
                            match.count = before.count + 1;
                        }
                        if (skips === 0 && before.streak > streakScore) {
                            streakScore = before.streak;
                            match.streak = before.streak + 1;
                            match.streakStrong = before.streakStrong + strong;
                            const newEvent = this.arrival[from + i] !== this.arrival[from + i - 1];
                            match.streakEvents = before.streakEvents + (newEvent ? 1 : 0);
                        }
                    }
                }
                matches[i * width + (j - lo)] = match;

                const value = this.rate(match, j, sim, target);
                if (value !== null && (!best || value > best.value)) best = { i, j, value };
            }
        }

        if (!best) return false;
        this.pos = best.j + 1;
        this.used = from + best.i + 1;
        return true;
    }

    // iOS Safari sometimes appends a copy of what it has just delivered. Words
    // that arrive together and repeat the words right before them are not new.
    private isEcho(tokens: Token[], same: number): boolean {
        const added = tokens.length - same;
        if (added < ECHO || same < added) return false;
        for (let i = 0; i < added; i++) {
            if (tokens[same + i].norm !== tokens[same - added + i].norm) return false;
        }
        return true;
    }

    // Decides whether a match with script token j is enough evidence to move
    // there. Returns its preference among other candidates, or null.
    private rate(match: Match, j: number, sim: number, target: Token): number | null {
        const ahead = j - this.pos;

        if (ahead < 0) {
            if (ahead === -1) return null; // the word just read: nowhere to move
            const reread = match.streak >= 4 && match.streakStrong >= 3 && match.streakEvents >= 3;
            return reread ? match.score - BACK_COST : null;
        }

        let enough: boolean;
        if (ahead <= 1) {
            enough = true;
        } else if (ahead < this.near) {
            enough = match.count >= 2 || (!target.weak && sim >= SURE_SIM);
        } else if (ahead < this.near + MID) {
            enough = match.streak >= 2 && match.streakStrong >= 1;
        } else {
            enough = match.streak >= 3 && match.streakStrong >= 2;
        }
        return enough ? match.score - DISTANCE_COST * ahead : null;
    }
}
