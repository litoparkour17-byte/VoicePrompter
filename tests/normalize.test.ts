import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tokenize, tokenizeWords, digitsToWords } from '../src/match/normalize.ts';
import { stemRu } from '../src/match/stem.ts';
import { similarity } from '../src/match/similarity.ts';

const norms = (text: string, lang = 'ru-RU') => tokenize(text, lang).map(t => t.norm);
const sim = (a: string, b: string) => similarity(tokenize(a, 'ru-RU')[0], tokenize(b, 'ru-RU')[0]);

test('ё, регистр, ударения и пунктуация', () => {
    assert.deepEqual(norms('Ёлка — это «Ёж»!'), ['елка', 'это', 'еж']);
    assert.deepEqual(norms('за́мок и замо́к'), ['замок', 'и', 'замок']);
    assert.deepEqual(norms('какой-то бизнес-план'), ['какой', 'то', 'бизнес', 'план']);
});

test('цифры становятся словами', () => {
    assert.deepEqual(digitsToWords('5'), ['пять']);
    assert.deepEqual(digitsToWords('25'), ['двадцать', 'пять']);
    assert.deepEqual(digitsToWords('100'), ['сто']);
    assert.deepEqual(digitsToWords('1000'), ['тысяча']);
    assert.deepEqual(digitsToWords('2026'), ['два', 'тысяча', 'двадцать', 'шесть']);
    assert.deepEqual(digitsToWords('1500000'), ['миллион', 'пятьсот', 'тысяча']);
    assert.deepEqual(digitsToWords('007'), ['ноль', 'ноль', 'семь']);
    assert.deepEqual(digitsToWords('0'), ['ноль']);
});

test('число цифрами и число словами дают одни и те же токены', () => {
    assert.deepEqual(norms('5 дней'), norms('пять дней'));
    assert.deepEqual(norms('в 2026 году'), norms('в две тысячи двадцать шестом году'));
    assert.deepEqual(norms('5-го января'), norms('пятого го января'));
    assert.deepEqual(norms('25 человек'), norms('двадцати пяти человек'));
    assert.deepEqual(norms('1 место'), norms('первое место'));
    assert.deepEqual(norms('3 000 рублей'), norms('три тысячи рублей'));
});

test('знаки и сокращения', () => {
    assert.deepEqual(norms('50%'), ['пятьдесят', 'процент']);
    assert.deepEqual(norms('$100'), ['сто', 'доллар']);
    assert.deepEqual(norms('№ 5'), ['номер', 'пять']);
    assert.deepEqual(norms('5 млн руб.'), ['пять', 'миллион', 'рубль']);
    assert.deepEqual(norms('и т.д.'), ['и', 'так', 'далее']);
    assert.deepEqual(norms('10:30'), ['десять', 'тридцать']);
});

test('число из нескольких слов привязано к первому', () => {
    const perWord = tokenizeWords(['всего', '1', '000', '000', 'рублей'], 'ru-RU').map(ts => ts.map(t => t.norm));
    assert.deepEqual(perWord, [['всего'], ['миллион'], [], [], ['рублей']]);
});

test('другие языки не трогаем: цифры остаются цифрами', () => {
    assert.deepEqual(norms('Chapter 5: the End', 'en-US'), ['chapter', '5', 'the', 'end']);
});

test('служебные слова помечены как слабые', () => {
    const weak = (w: string) => tokenize(w, 'ru-RU')[0].weak;
    for (const w of ['и', 'в', 'не', 'что', 'это', 'ещё']) assert.equal(weak(w), true, w);
    for (const w of ['дом', 'суфлёр', 'пять', 'читать']) assert.equal(weak(w), false, w);
});

test('стеммер сводит формы слова к одной основе', () => {
    const groups = [
        ['дом', 'дома', 'домом', 'доме'],
        ['книга', 'книги', 'книгу', 'книгой'],
        ['красивый', 'красивая', 'красивого', 'красивым'],
        ['читает', 'читают', 'читал', 'читали'],
        ['распознавание', 'распознавания', 'распознаванием']
    ];
    for (const group of groups) {
        const stems = new Set(group.map(stemRu));
        assert.equal(stems.size, 1, `${group.join(', ')} → ${[...stems].join(', ')}`);
    }
});

test('нечёткое сравнение: похожие слова совпадают', () => {
    assert.equal(sim('дом', 'дом'), 1);
    assert.ok(sim('дом', 'дома') >= 0.7);
    assert.ok(sim('суфлёр', 'суфлера') >= 0.7);
    assert.ok(sim('компания', 'кампания') >= 0.7);
    assert.ok(sim('распознаёт', 'распознавание') >= 0.7);
    assert.ok(sim('прокрутка', 'прокрутку') >= 0.7);
    assert.ok(sim('переводчик', 'перевозчик') >= 0.7);
    // Созвучные слова из пяти и более букв: распознавание путает именно их.
    assert.ok(sim('город', 'голод') >= 0.7);
});

test('нечёткое сравнение: разные слова не совпадают', () => {
    for (const [a, b] of [['кот', 'код'], ['стол', 'сторона'], ['телефон', 'телесуфлёр'], ['интерес', 'интернет'],
        ['президент', 'презентация'], ['голос', 'город'], ['вода', 'кода'], ['на', 'но']]) {
        assert.equal(sim(a, b), 0, `${a} / ${b}`);
    }
});
