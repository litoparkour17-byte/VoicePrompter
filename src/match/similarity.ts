// How alike two words are, from 0 (different) to 1 (identical). Speech
// recognition often gets a word almost right: another ending ("дом" / "дома"),
// one wrong letter ("компания" / "кампания"), a related form ("распознаёт" /
// "распознавание"). Those still count as the same place in the script.

import type { Token } from './normalize.ts';

function commonPrefix(a: string, b: string): number {
    const max = Math.min(a.length, b.length);
    let i = 0;
    while (i < max && a.charCodeAt(i) === b.charCodeAt(i)) i++;
    return i;
}

// Damerau-Levenshtein distance (a swap of two neighbouring letters counts as
// one edit). Returns limit + 1 as soon as the distance is known to exceed limit.
export function editDistance(a: string, b: string, limit: number): number {
    const la = a.length, lb = b.length;
    if (Math.abs(la - lb) > limit) return limit + 1;

    let prev2: number[] = [];
    let prev: number[] = [];
    let row: number[] = [];
    for (let j = 0; j <= lb; j++) prev[j] = j;

    for (let i = 1; i <= la; i++) {
        row = [i];
        let best = i;
        for (let j = 1; j <= lb; j++) {
            const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
            let d = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + cost);
            if (i > 1 && j > 1 && a.charCodeAt(i - 1) === b.charCodeAt(j - 2) && a.charCodeAt(i - 2) === b.charCodeAt(j - 1)) {
                d = Math.min(d, prev2[j - 2] + 1);
            }
            row[j] = d;
            if (d < best) best = d;
        }
        if (best > limit) return limit + 1;
        prev2 = prev;
        prev = row;
    }
    return row[lb];
}

function compare(a: Token, b: Token): number {
    if (a.norm === b.norm) return 1;

    const longer = Math.max(a.norm.length, b.norm.length);
    const shorter = Math.min(a.norm.length, b.norm.length);
    // Short words differ by a letter too easily ("кот" / "код" / "кто").
    if (shorter < 3) return 0;

    // Same base, different ending.
    if (a.stem === b.stem) return a.stem.length >= 3 ? 0.9 : 0.8;

    // A long shared beginning: forms the stemmer does not bring together.
    const prefix = commonPrefix(a.norm, b.norm);
    if ((prefix >= 6 && prefix >= 0.6 * longer) || (prefix >= 4 && prefix >= 0.75 * longer)) return 0.75;

    // One wrong letter, two in a long word.
    if (longer >= 5) {
        const limit = longer >= 9 ? 2 : 1;
        const distance = editDistance(a.norm, b.norm, limit);
        if (distance <= limit) return distance === 1 ? 0.75 : 0.7;
    }
    if (Math.min(a.stem.length, b.stem.length) >= 4 && editDistance(a.stem, b.stem, 1) <= 1) return 0.7;

    return 0;
}

const cache = new Map<string, number>();

export function similarity(a: Token, b: Token): number {
    if (a.norm === b.norm) return 1;
    const key = a.norm < b.norm ? `${a.norm}|${b.norm}` : `${b.norm}|${a.norm}`;
    let value = cache.get(key);
    if (value === undefined) {
        if (cache.size > 50000) cache.clear();
        value = compare(a, b);
        cache.set(key, value);
    }
    return value;
}
