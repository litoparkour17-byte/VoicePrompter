// Shared by the tracker tests and the simulation: a reader, a noisy speech
// recognizer, and the two matchers being compared.

import { tokenize } from '../src/match/normalize.ts';
import { indexScript, tokenAtWord, wordAtToken } from '../src/match/script.ts';
import type { ScriptIndex } from '../src/match/script.ts';
import { Tracker } from '../src/match/tracker.ts';

export const LANG = 'ru-RU';

export interface Matcher {
    index: number; // word expected next
    feed(transcript: string): void;
}

// The new tracker, driven the way src/speech.ts drives it.
export class NewMatcher implements Matcher {
    script: ScriptIndex;
    tracker: Tracker;

    constructor(text: string, near = 5) {
        const words = text.split(/\s+/).filter(Boolean).map(word => ({ word, skip: false }));
        this.script = indexScript(words, LANG);
        this.tracker = new Tracker(this.script.tokens, near);
    }

    get index(): number {
        return wordAtToken(this.script, this.tracker.pos);
    }

    set index(wordIndex: number) {
        this.tracker.jumpTo(tokenAtWord(this.script, wordIndex));
    }

    feed(transcript: string): void {
        this.tracker.feed(tokenize(transcript, LANG));
    }
}

// The matcher this fork started from (matchWords in the original
// src/speech.ts), kept as the baseline to measure against.
export class OldMatcher implements Matcher {
    index = 0;
    private words: string[];
    private last = '';
    private lookahead: number;

    constructor(text: string, lookahead = 5) {
        this.words = text.split(/\s+/).filter(Boolean).map(w => w.replace(/[^\p{L}\p{N}]/gu, '').toLowerCase());
        this.lookahead = lookahead;
    }

    feed(transcript: string): void {
        const spoken = new Set(
            transcript.trim().toLowerCase().split(/\s+/).slice(-5)
                .map(w => w.replace(/[^\p{L}\p{N}]/gu, '').toLowerCase())
                .filter(w => w.length > 0)
        );
        if (this.index >= this.words.length || spoken.size === 0) return;

        for (let ptr = this.index, checked = 0; ptr < this.words.length && checked < this.lookahead; ptr++, checked++) {
            const word = this.words[ptr];
            if (!spoken.has(word)) continue;
            if (word === this.last && checked > 0) continue;
            this.last = word;
            this.index = ptr + 1;
            return;
        }
    }
}

// Deterministic random numbers, so a failing run can be repeated.
export function random(seed: number): () => number {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6D2B79F5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

export interface Noise {
    ending: number;  // a word comes back with another ending
    wrong: number;   // a word comes back as a different word
    dropped: number; // a word is not heard at all
    filler: number;  // the reader adds "ну", "вот" before a word
    digits: number;  // a spelled number comes back as digits and the other way round
}

export const NOISE: Record<string, Noise> = {
    clean: { ending: 0, wrong: 0, dropped: 0, filler: 0, digits: 0 },
    typical: { ending: 0.15, wrong: 0.05, dropped: 0.04, filler: 0.03, digits: 0.5 },
    heavy: { ending: 0.3, wrong: 0.12, dropped: 0.1, filler: 0.08, digits: 1 }
};

const ENDINGS = ['а', 'у', 'ы', 'е', 'ом', 'ой', 'ам', 'ов', 'и', 'ах', 'ую', 'ые', 'ого'];
const FILLERS = ['ну', 'вот', 'значит', 'короче', 'так', 'это'];
const WRONG = ['погода', 'машина', 'завтра', 'кофе', 'лампа', 'берег', 'окно', 'сорок', 'быстро', 'зелёный'];
const DIGIT_WORDS: Record<string, string> = {
    'один': '1', 'два': '2', 'три': '3', 'четыре': '4', 'пять': '5', 'шесть': '6', 'семь': '7', 'восемь': '8',
    'девять': '9', 'десять': '10', 'двадцать': '20', 'тридцать': '30', 'сто': '100'
};
const DIGIT_SPELLED: Record<string, string> = {
    '3': 'три', '5': 'пять', '10': 'десять', '15': 'пятнадцать', '20': 'двадцать', '25': 'двадцать пять',
    '30': 'тридцать', '50': 'пятьдесят', '100': 'сто', '300': 'триста', '2026': 'две тысячи двадцать шестом'
};

const pick = <T>(list: T[], rnd: () => number): T => list[Math.floor(rnd() * list.length)];

// What the recognizer returns for one script word: zero, one or several words.
function hear(word: string, noise: Noise, rnd: () => number): string[] {
    const bare = word.replace(/[^\p{L}\p{N}%$-]/gu, '');
    const lower = bare.toLowerCase();
    const out: string[] = [];
    if (rnd() < noise.filler) out.push(pick(FILLERS, rnd));
    if (rnd() < noise.dropped) return out;

    if (DIGIT_SPELLED[lower] && rnd() < noise.digits) {
        out.push(...DIGIT_SPELLED[lower].split(' '));
    } else if (DIGIT_WORDS[lower] && rnd() < noise.digits) {
        out.push(DIGIT_WORDS[lower]);
    } else if (rnd() < noise.wrong) {
        out.push(pick(WRONG, rnd));
    } else if (bare.length >= 5 && /[а-яё]$/i.test(bare) && rnd() < noise.ending) {
        out.push(bare.replace(/[аеёиоуыэюяйь]{1,2}$/i, '') + pick(ENDINGS, rnd));
    } else {
        out.push(bare);
    }
    return out;
}

export interface Step {
    transcript: string; // what the recognizer reports at this moment
    truth: number;      // script word the reader says next
}

// Dashes and other marks are not read aloud. Positions are compared after
// moving past them, so a matcher is not penalised for resting on a dash.
function nextSpoken(words: string[], index: number): number {
    while (index < words.length && !/[\p{L}\p{N}]/u.test(words[index])) index++;
    return index;
}

// One read-through of the script as a series of recognition results.
// "chrome" starts a new transcript after each sentence; "safari" keeps one
// growing transcript and now and then repeats its tail, as iOS does.
export function read(text: string, noise: Noise, seed: number, style: 'chrome' | 'safari' = 'chrome'): Step[] {
    const rnd = random(seed);
    const words = text.split(/\s+/).filter(Boolean);
    const steps: Step[] = [];
    let heard: string[] = [];

    words.forEach((word, i) => {
        if (nextSpoken(words, i) !== i) return;
        const truth = nextSpoken(words, i + 1);
        for (const w of hear(word, noise, rnd)) {
            heard.push(w);
            steps.push({ transcript: heard.join(' '), truth });
        }
        if (/[.!?]$/.test(word)) {
            if (style === 'chrome') {
                heard = [];
            } else if (rnd() < 0.3 && heard.length >= 6) {
                heard = heard.concat(heard.slice(-6));
                steps.push({ transcript: heard.join(' '), truth });
            }
        }
    });
    return steps;
}

export interface Score {
    exact: number;    // share of moments the highlighted word is the right one
    close: number;    // ... or at most 2 words off
    ranAhead: number; // share of moments the script is more than 2 words ahead of the reader
    worst: number;    // largest distance from the right word
    finished: boolean;
}

export function follow(matcher: Matcher, steps: Step[], text: string): Score {
    const words = text.split(/\s+/).filter(Boolean);
    let exact = 0, close = 0, ranAhead = 0, worst = 0;
    for (const step of steps) {
        matcher.feed(step.transcript);
        const off = nextSpoken(words, matcher.index) - step.truth;
        if (off === 0) exact++;
        if (Math.abs(off) <= 2) close++;
        if (off > 2) ranAhead++;
        if (Math.abs(off) > worst) worst = Math.abs(off);
    }
    return {
        exact: exact / steps.length,
        close: close / steps.length,
        ranAhead: ranAhead / steps.length,
        worst,
        finished: words.length - matcher.index <= 2
    };
}

export const SCRIPT = `Привет! Сегодня я расскажу, как записывать видео с телесуфлёром и не выглядеть при этом роботом.
Меня зовут Дима, и за последние 5 лет я записал больше 300 роликов для разных проектов.
Первое правило простое: текст должен звучать так, как вы говорите в жизни.
Если в сценарии написано «осуществляется производство», а вы так никогда не говорите, зритель это услышит.
Поэтому перед записью прочитайте текст вслух и замените все слова, на которых спотыкаетесь.
Второе правило: камера должна стоять на уровне глаз, а текст — как можно ближе к объективу.
Тогда взгляд не бегает по экрану, и кажется, что вы смотрите прямо на зрителя.
Третье правило касается скорости. Обычный темп речи — примерно 120 слов в минуту.
Если читать быстрее, зритель устаёт, если медленнее — ему становится скучно.
Телесуфлёр с прокруткой по голосу решает эту проблему сам: он ждёт, пока вы говорите, и не убегает вперёд.
Можно остановиться, сделать паузу, добавить пару слов от себя, и текст останется на месте.
В 2026 году такие программы работают прямо в браузере телефона и не требуют установки.
Четвёртое правило: делайте короткие абзацы. Один абзац — одна мысль.
После каждого абзаца делайте паузу, это поможет на монтаже и даст зрителю время подумать.
И последнее. Не бойтесь ошибок: если оговорились, просто вернитесь к началу фразы и повторите её.
Запись всегда можно порезать, а живую интонацию потом не добавишь.
На этом всё. Подписывайтесь на канал, ставьте лайки и до встречи в следующем видео!`;
