// The script as the tracker sees it: a flat list of tokens, each remembering
// which displayed word it came from. A word can give several tokens ("25" →
// "двадцать", "пять") or none (a dash, an emoji, a [bracketed note]).

import { tokenizeWords } from './normalize.ts';
import type { Token } from './normalize.ts';

export interface ScriptIndex {
    tokens: Token[];
    wordOf: number[]; // wordOf[i] is the index of the word token i belongs to
    wordCount: number;
}

export function indexScript(words: { word: string; skip: boolean }[], lang: string): ScriptIndex {
    const perWord = tokenizeWords(words.map(w => (w.skip ? '' : w.word)), lang);
    const tokens: Token[] = [];
    const wordOf: number[] = [];
    perWord.forEach((wordTokens, wordIndex) => {
        for (const token of wordTokens) {
            tokens.push(token);
            wordOf.push(wordIndex);
        }
    });
    return { tokens, wordOf, wordCount: words.length };
}

// First token of the given word, or of the nearest word after it that has any.
export function tokenAtWord(index: ScriptIndex, wordIndex: number): number {
    let lo = 0, hi = index.wordOf.length;
    while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (index.wordOf[mid] < wordIndex) lo = mid + 1; else hi = mid;
    }
    return lo;
}

// The word to highlight when the given token is expected next.
export function wordAtToken(index: ScriptIndex, tokenPos: number): number {
    return tokenPos < index.wordOf.length ? index.wordOf[tokenPos] : index.wordCount;
}
