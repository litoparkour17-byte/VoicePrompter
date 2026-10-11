// Turns script text and recognized speech into comparable tokens.
//
// Both sides go through the same pipeline, so a form only has to be reduced
// consistently: "5", "пять" and "пятого" all become the token "пять", "ёлка"
// and "елка" both become "елка".

import { stemRu } from './stem.ts';

export interface Token {
    norm: string;  // normalized word, compared for an exact match
    stem: string;  // base of the word, compared for a fuzzy match
    weak: boolean; // function word: too common to locate the reader on its own
}

// ---------------------------------------------------------------------------
// Function words
// ---------------------------------------------------------------------------

const WEAK_RU = `и в во не на я с со что а по к ко у же за бы то от из о об но да ли или как так это он она оно
они мы вы ты его ее их ему ей им нас вас них него нее ним мне меня тебя тебе себя себе для до при над под без
про через ну вот уже еще тоже также там тут здесь был была было были быть будет будут есть нет если чтобы когда
где чем тем только все всех всего мой моя мое мои наш наша наши ваш ваша ваши свой своя свои этот эта эти этого
этой этом тот та те того той том такой очень даже ведь лишь либо ни раз который которая которые которое потом
затем потому поэтому можно надо нужно может вам нам вами нами ими`;

const WEAK_EN = `the a an of to and in is it that for on with as at by be this are was or from but not you i we they
he she his her their our your have has had do does did will would can could so if then than there here what which
who when where why how all any no yes just very also too`;

const WEAK = new Set(`${WEAK_RU} ${WEAK_EN}`.split(/\s+/));

function isWeak(norm: string): boolean {
    return norm.length <= 2 || WEAK.has(norm);
}

// ---------------------------------------------------------------------------
// Russian numerals
// ---------------------------------------------------------------------------

const ADJ = '(?:ый|ий|ой|ая|яя|ое|ее|ые|ие|ого|его|ому|ему|ым|им|ом|ем|ую|юю|ых|их|ыми|ими|ою|ею|ей)';
const CASE = `(?:ь|и|ью|${ADJ})`;

// Each numeral with the word forms that reduce to it: cases ("пяти") and
// ordinals ("пятого", "пятый").
const NUMERAL_FORMS: [string, string][] = [
    ['ноль', `нол[ьяюеи]|нолем|нул[ьяюеи]|нулем|нулев${ADJ}`],
    ['один', `один|одн(?:а|о|у|и|ого|ой|ому|им|ом|их|ими|ою)|перв${ADJ}`],
    ['два', `два|две|двух|двум|двумя|втор${ADJ}`],
    ['три', 'три|трех|трем|тремя|трет(?:ий|ья|ье|ьи|ьего|ьей|ьему|ьим|ьем|ью|ьих|ьими)'],
    ['четыре', `четыре|четырех|четырем|четырьмя|четверт${ADJ}`],
    ['пять', `пят${CASE}`],
    ['шесть', `шест${CASE}`],
    ['семь', `сем(?:ь|и|ью)|седьм${ADJ}`],
    ['восемь', `восемь|восьми|восемью|восьмью|восьм${ADJ}`],
    ['девять', `девят${CASE}`],
    ['десять', `десят${CASE}`],
    ['одиннадцать', `одиннадцат${CASE}`],
    ['двенадцать', `двенадцат${CASE}`],
    ['тринадцать', `тринадцат${CASE}`],
    ['четырнадцать', `четырнадцат${CASE}`],
    ['пятнадцать', `пятнадцат${CASE}`],
    ['шестнадцать', `шестнадцат${CASE}`],
    ['семнадцать', `семнадцат${CASE}`],
    ['восемнадцать', `восемнадцат${CASE}`],
    ['девятнадцать', `девятнадцат${CASE}`],
    ['двадцать', `двадцат${CASE}`],
    ['тридцать', `тридцат${CASE}`],
    ['сорок', `сорок|сорока|сороков${ADJ}`],
    ['пятьдесят', `пятьдесят|пятидесяти|пятьюдесятью|пятидесят${ADJ}`],
    ['шестьдесят', `шестьдесят|шестидесяти|шестьюдесятью|шестидесят${ADJ}`],
    ['семьдесят', `семьдесят|семидесяти|семьюдесятью|семидесят${ADJ}`],
    ['восемьдесят', `восемьдесят|восьмидесяти|восемьюдесятью|восьмидесят${ADJ}`],
    ['девяносто', `девяност(?:о|а|${ADJ})`],
    ['сто', `сто|ста|сот${ADJ}`],
    ['двести', `двести|двухсот|двумстам|двумястами|двухстах|двухсот${ADJ}`],
    ['триста', `триста|трехсот|тремстам|тремястами|трехстах|трехсот${ADJ}`],
    ['четыреста', `четыреста|четырехсот|четыремстам|четырьмястами|четырехстах|четырехсот${ADJ}`],
    ['пятьсот', `пятьсот|пятисот|пятистам|пятьюстами|пятистах|пятисот${ADJ}`],
    ['шестьсот', `шестьсот|шестисот|шестистам|шестьюстами|шестистах|шестисот${ADJ}`],
    ['семьсот', `семьсот|семисот|семистам|семьюстами|семистах|семисот${ADJ}`],
    ['восемьсот', `восемьсот|восьмисот|восьмистам|восемьюстами|восьмистах|восьмисот${ADJ}`],
    ['девятьсот', `девятьсот|девятисот|девятистам|девятьюстами|девятистах|девятисот${ADJ}`],
    ['тысяча', `тысяч(?:а|и|у|е|ей|ью|ам|ами|ах)?|тысячн${ADJ}`],
    ['миллион', `миллион(?:а|у|ом|е|ы|ов|ам|ами|ах)?|миллионн${ADJ}`],
    ['миллиард', `миллиард(?:а|у|ом|е|ы|ов|ам|ами|ах)?|миллиардн${ADJ}`]
];

const NUMERAL_RE: [string, RegExp][] = NUMERAL_FORMS.map(([word, forms]) => [word, new RegExp(`^(?:${forms})$`)]);

function canonNumeral(word: string): string | null {
    for (const [canon, re] of NUMERAL_RE) {
        if (re.test(word)) return canon;
    }
    return null;
}

const UNITS = ['', 'один', 'два', 'три', 'четыре', 'пять', 'шесть', 'семь', 'восемь', 'девять'];
const TEENS = ['десять', 'одиннадцать', 'двенадцать', 'тринадцать', 'четырнадцать', 'пятнадцать', 'шестнадцать',
    'семнадцать', 'восемнадцать', 'девятнадцать'];
const TENS = ['', '', 'двадцать', 'тридцать', 'сорок', 'пятьдесят', 'шестьдесят', 'семьдесят', 'восемьдесят',
    'девяносто'];
const HUNDREDS = ['', 'сто', 'двести', 'триста', 'четыреста', 'пятьсот', 'шестьсот', 'семьсот', 'восемьсот',
    'девятьсот'];

function tripletToWords(n: number): string[] {
    const out: string[] = [];
    if (n >= 100) out.push(HUNDREDS[Math.floor(n / 100)]);
    const rest = n % 100;
    if (rest >= 10 && rest < 20) {
        out.push(TEENS[rest - 10]);
    } else {
        if (rest >= 20) out.push(TENS[Math.floor(rest / 10)]);
        if (rest % 10) out.push(UNITS[rest % 10]);
    }
    return out;
}

// Spells a run of digits with the same numeral tokens canonNumeral() produces,
// so "две тысячи двадцать шестого" and "2026" give identical tokens.
export function digitsToWords(digits: string): string[] {
    // Codes, phone numbers and "007" are read digit by digit.
    if (digits.length > 12 || (digits.length > 1 && digits[0] === '0')) {
        return digits.split('').map(d => UNITS[+d] || 'ноль');
    }
    const n = parseInt(digits, 10);
    if (n === 0) return ['ноль'];

    const out: string[] = [];
    const groups: [number, string][] = [[1e9, 'миллиард'], [1e6, 'миллион'], [1e3, 'тысяча']];
    let rest = n;
    for (const [size, name] of groups) {
        const count = Math.floor(rest / size);
        rest %= size;
        if (count === 0) continue;
        if (count > 1) out.push(...tripletToWords(count)); // "тысяча", not "один тысяча"
        out.push(name);
    }
    out.push(...tripletToWords(rest));
    return out;
}

// ---------------------------------------------------------------------------
// Abbreviations and symbols (Russian)
// ---------------------------------------------------------------------------

// Whole written words, looked up with inner dots kept: "т.е." → "то есть".
const ABBREVIATIONS: Record<string, string> = {
    'т.е': 'то есть',
    'т.к': 'так как',
    'т.д': 'так далее',
    'т.п': 'тому подобное',
    'т.н': 'так называемый'
};

// Letter-only chunks.
const SHORT_FORMS: Record<string, string> = {
    'кг': 'килограмм',
    'км': 'километр',
    'см': 'сантиметр',
    'мм': 'миллиметр',
    'млн': 'миллион',
    'млрд': 'миллиард',
    'тыс': 'тысяча',
    'руб': 'рубль',
    'мин': 'минута',
    'сек': 'секунда'
};

const SYMBOLS: Record<string, string> = {
    '%': 'процент',
    '№': 'номер',
    '&': 'и',
    '+': 'плюс',
    '°': 'градус',
    '$': 'доллар',
    '€': 'евро',
    '₽': 'рубль',
    '£': 'фунт'
};

const SYMBOL_RE = /[%№&+°$€₽£]/g;
// "$100" is read "сто долларов": the sign moves behind its number.
const CURRENCY_FIRST_RE = /([$€₽£])\s*(\d[\d.,]*)/g;

// ---------------------------------------------------------------------------
// Tokenizer
// ---------------------------------------------------------------------------

const CYRILLIC_RE = /[а-я]/;

const tokenCache = new Map<string, Token>();

function makeToken(norm: string): Token {
    let token = tokenCache.get(norm);
    if (!token) {
        if (tokenCache.size > 20000) tokenCache.clear();
        token = { norm, stem: CYRILLIC_RE.test(norm) ? stemRu(norm) : norm, weak: isWeak(norm) };
        tokenCache.set(norm, token);
    }
    return token;
}

function isRussian(lang: string): boolean {
    return lang.toLowerCase().startsWith('ru');
}

// Lowercase, drop stress marks and soft hyphens, ё → е.
export function foldCase(text: string): string {
    return text.normalize('NFC').toLowerCase().replace(/[̀́­]/g, '').replace(/ё/g, 'е');
}

function splitWord(word: string, russian: boolean): Token[] {
    let text = foldCase(word);
    if (!russian) {
        return (text.match(/[\p{L}\p{N}]+/gu) || []).map(makeToken);
    }

    const abbreviation = ABBREVIATIONS[text.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '')];
    if (abbreviation) return abbreviation.split(' ').map(makeToken);

    text = text.replace(CURRENCY_FIRST_RE, '$2$1').replace(SYMBOL_RE, s => ` ${SYMBOLS[s]} `);

    const tokens: Token[] = [];
    // Letters and digits form separate chunks: "5-го" → "5", "го".
    for (const chunk of text.match(/\p{L}+|\p{N}+/gu) || []) {
        if (/^\d+$/.test(chunk)) {
            for (const w of digitsToWords(chunk)) tokens.push(makeToken(w));
        } else {
            tokens.push(makeToken(SHORT_FORMS[chunk] || canonNumeral(chunk) || chunk));
        }
    }
    return tokens;
}

// The recognizer delivers the same transcript again and again with a word or
// two added, so the work done for a written word is kept.
const wordCache = new Map<string, Token[]>();

function tokenizeWord(word: string, russian: boolean): Token[] {
    const key = (russian ? 'ru:' : '--:') + word;
    let tokens = wordCache.get(key);
    if (!tokens) {
        if (wordCache.size > 20000) wordCache.clear();
        tokens = splitWord(word, russian);
        wordCache.set(key, tokens);
    }
    return tokens;
}

// Tokens for each whitespace-separated word, kept per word so the script can
// map tokens back to the words it displays.
export function tokenizeWords(words: string[], lang: string): Token[][] {
    const russian = isRussian(lang);
    const result: Token[][] = [];
    for (let i = 0; i < words.length; i++) {
        let word = words[i];
        let merged = 0;
        // "1 000 000" is one number written as several words.
        if (russian && /^\d{1,3}$/.test(word)) {
            while (/^\d{3}$/.test(words[i + merged + 1] || '')) {
                merged++;
                word += words[i + merged];
            }
        }
        result.push(tokenizeWord(word, russian));
        for (; merged > 0; merged--) {
            result.push([]);
            i++;
        }
    }
    return result;
}

export function tokenize(text: string, lang: string): Token[] {
    return tokenizeWords(text.split(/\s+/), lang).flat();
}
