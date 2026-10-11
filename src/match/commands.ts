// Voice commands: words that move the script instead of being matched to it.

import type { Token } from './normalize.ts';

export type VoiceCommand = 'start' | 'finish' | 'next' | 'back';

// Phrases are written the way the tokenizer returns them: lowercase, ё → е.
const PHRASES: [string[], VoiceCommand][] = [
    [['go', 'start'], 'start'],
    [['go', 'finish'], 'finish'],
    [['go', 'next'], 'next'],
    [['go', 'back'], 'back'],
    [['сначала'], 'start'],
    [['с', 'начала'], 'start'],
    [['в', 'начало'], 'start'],
    [['в', 'конец'], 'finish'],
    [['дальше'], 'next'],
    [['далее'], 'next'],
    [['назад'], 'back']
];

function endsWith(tokens: Token[], phrase: string[]): boolean {
    if (tokens.length < phrase.length) return false;
    const start = tokens.length - phrase.length;
    return phrase.every((word, i) => tokens[start + i].norm === word);
}

function contains(tokens: Token[], phrase: string[]): boolean {
    for (let start = 0; start + phrase.length <= tokens.length; start++) {
        if (phrase.every((word, i) => tokens[start + i].norm === word)) return true;
    }
    return false;
}

// The command the transcript ends with, or null. When the same words stand in
// the script around the current position the reader is simply reading them,
// so they are not a command.
export function findCommand(heard: Token[], nearbyScript: Token[]): VoiceCommand | null {
    for (const [phrase, command] of PHRASES) {
        if (endsWith(heard, phrase)) {
            return contains(nearbyScript, phrase) ? null : command;
        }
    }
    return null;
}
