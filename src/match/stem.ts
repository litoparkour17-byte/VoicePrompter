// Russian stemmer (Snowball / Porter algorithm) used to compare words by their
// base: "дом", "дома" and "домом" all reduce to "дом". Input must already be
// lowercased with ё replaced by е. Written without regex lookbehind so it runs
// on older iOS Safari.

const VOWEL = 'аеиоуыэюя';
const RV = new RegExp(`^(.*?[${VOWEL}])(.*)$`);

// Endings in "group 1" are removed as is; "group 2" endings only count when
// they follow а or я, which stays in the word.
const PERFECTIVE_1 = /(?:ив|ивши|ившись|ыв|ывши|ывшись)$/;
const PERFECTIVE_2 = /([ая])(?:в|вши|вшись)$/;
const REFLEXIVE = /с[яь]$/;
const ADJECTIVE = /(?:ее|ие|ые|ое|ими|ыми|ей|ий|ый|ой|ем|им|ым|ом|его|ого|ему|ому|их|ых|ую|юю|ая|яя|ою|ею)$/;
const PARTICIPLE_1 = /(?:ивш|ывш|ующ)$/;
const PARTICIPLE_2 = /([ая])(?:ем|нн|вш|ющ|щ)$/;
const VERB_1 = /(?:ила|ыла|ена|ейте|уйте|ите|или|ыли|ей|уй|ил|ыл|им|ым|ен|ило|ыло|ено|ят|ует|уют|ит|ыт|ены|ить|ыть|ишь|ую|ю)$/;
const VERB_2 = /([ая])(?:ла|на|ете|йте|ли|й|л|ем|н|ло|но|ет|ют|ны|ть|ешь|нно)$/;
const NOUN = /(?:а|ев|ов|ие|ье|е|иями|ями|ами|еи|ии|и|ией|ей|ой|ий|й|иям|ям|ием|ем|ам|ом|о|у|ах|иях|ях|ы|ь|ию|ью|ю|ия|ья|я)$/;
const DERIVATIONAL = new RegExp(`[^${VOWEL}][${VOWEL}].*ость?$`);
const SUPERLATIVE = /(?:ейше|ейш)$/;

// Removes the longest ending matched by either group; returns the input
// unchanged when nothing matches.
function strip(rv: string, group1: RegExp, group2?: RegExp): string {
    const m1 = group1.exec(rv);
    const m2 = group2 ? group2.exec(rv) : null;
    const cut1 = m1 ? m1[0].length : 0;
    const cut2 = m2 ? m2[0].length - 1 : 0; // the leading а/я is kept
    if (cut1 === 0 && cut2 === 0) return rv;
    return rv.slice(0, rv.length - Math.max(cut1, cut2));
}

export function stemRu(word: string): string {
    const parts = RV.exec(word);
    if (!parts || !parts[2]) return word;
    const start = parts[1];
    let rv = parts[2];

    // Step 1
    let next = strip(rv, PERFECTIVE_1, PERFECTIVE_2);
    if (next !== rv) {
        rv = next;
    } else {
        rv = rv.replace(REFLEXIVE, '');
        next = strip(rv, ADJECTIVE);
        if (next !== rv) {
            rv = strip(next, PARTICIPLE_1, PARTICIPLE_2);
        } else {
            next = strip(rv, VERB_1, VERB_2);
            rv = next !== rv ? next : strip(rv, NOUN);
        }
    }

    // Step 2
    rv = rv.replace(/и$/, '');

    // Step 3
    if (DERIVATIONAL.test(rv)) rv = rv.replace(/ость?$/, '');

    // Step 4
    if (rv.endsWith('ь')) {
        rv = rv.slice(0, -1);
    } else {
        rv = rv.replace(SUPERLATIVE, '').replace(/нн$/, 'н');
    }

    return start + rv;
}
