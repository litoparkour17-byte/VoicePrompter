import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NewMatcher, OldMatcher, NOISE, SCRIPT, read, follow } from './helpers.ts';

// A reader: says words one at a time, the recognizer reports the growing
// transcript after each of them, as interim results do.
class Reader {
    matcher: NewMatcher;
    private heard: string[] = [];

    constructor(script: string) {
        this.matcher = new NewMatcher(script);
    }

    say(phrase: string): this {
        for (const word of phrase.split(' ')) {
            this.heard.push(word);
            this.matcher.feed(this.heard.join(' '));
        }
        return this;
    }

    // A pause: the recognizer starts a new transcript.
    pause(): this {
        this.heard = [];
        return this;
    }

    // The recognizer delivers several words in a single result.
    burst(phrase: string): this {
        this.heard.push(...phrase.split(' '));
        this.matcher.feed(this.heard.join(' '));
        return this;
    }

    get at(): number {
        return this.matcher.index;
    }
}

const wordCount = (text: string) => text.split(/\s+/).length;

test('ровное чтение доходит до конца', () => {
    const script = 'Привет, меня зовут Дима, и сегодня я расскажу про телесуфлёр.';
    const r = new Reader(script).say('привет меня зовут дима и сегодня я расскажу про телесуфлер');
    assert.equal(r.at, wordCount(script));
});

test('распознавание путает окончания', () => {
    const script = 'Мы построили новый дом в большом городе и открыли там магазин';
    const r = new Reader(script).say('мы построил новые дома в большой город и открыл там магазины');
    assert.equal(r.at, wordCount(script));
});

test('числа: в сценарии цифры, услышаны слова', () => {
    const script = 'За 5 лет я записал 300 роликов и потратил 25 тысяч';
    const r = new Reader(script).say('за пять лет я записал триста роликов и потратил двадцать пять тысяч');
    assert.equal(r.at, wordCount(script));
});

test('числа: в сценарии слова, услышаны цифры', () => {
    const script = 'В две тысячи двадцать шестом году нас стало пятьдесят процентов';
    const r = new Reader(script).say('в 2026 году нас стало 50%');
    assert.equal(r.at, wordCount(script));
});

test('число из нескольких слов подсвечено, пока не прочитано целиком', () => {
    const r = new Reader('В 2026 году всё изменится');
    r.say('в две тысячи двадцать');
    assert.equal(r.at, 1);
    r.say('шестом');
    assert.equal(r.at, 2);
});

test('служебные слова сами не вызывают прыжок', () => {
    const script = 'Сегодня важный день для нашей большой дружной команды и в целом не только для неё';
    const r = new Reader(script).say('и в не');
    assert.equal(r.at, 0);
});

test('одно значимое слово рядом двигает, далеко — нет', () => {
    const script = 'Первое второе третье четвёртое пятое шестое седьмое восьмое девятое десятое одиннадцатое двенадцатое';
    assert.equal(new Reader(script).say('третье').at, 3);
    assert.equal(new Reader(script).say('двенадцатое').at, 0);
});

test('пропущенное предложение: догоняет за два-три слова', () => {
    const script = 'Начнём с простого примера. Этот абзац диктор решил пропустить целиком и полностью. '
        + 'Теперь поговорим о настройке камеры и света.';
    const r = new Reader(script).say('начнем с простого примера').pause();
    assert.equal(r.at, 4);
    r.say('теперь поговорим');
    assert.equal(r.at, 14);
    r.say('о настройке камеры');
    assert.equal(r.at, 17);
});

test('отсебятина не двигает сценарий', () => {
    const script = 'Телесуфлёр помогает записывать видео. Следующая тема — монтаж и цветокоррекция роликов.';
    const r = new Reader(script).say('телесуфлер помогает записывать видео').pause();
    const before = r.at;
    r.say('кстати вчера я купил новый микрофон он просто отличный');
    assert.equal(r.at, before);
    r.pause().say('следующая тема');
    assert.equal(r.at, 7); // «монтаж»: тире между словами не читается
});

test('один и тот же текст, доставленный повторно, не двигает дважды', () => {
    const r = new Reader('Мы делаем продукт. Мы делаем продукт для людей.');
    r.say('мы делаем продукт');
    assert.equal(r.at, 3);
    for (let i = 0; i < 5; i++) r.matcher.feed('мы делаем продукт');
    assert.equal(r.at, 3);
    r.say('мы делаем');
    assert.equal(r.at, 5);
});

test('эхо Safari: повтор хвоста одним куском игнорируется', () => {
    const script = 'Сначала включите камеру и проверьте звук. Потом включите свет и проверьте фон. Дальше идёт запись.';
    const r = new Reader(script).say('сначала включите камеру и проверьте звук');
    assert.equal(r.at, 6);
    r.burst('сначала включите камеру и проверьте звук');
    assert.equal(r.at, 6);
    r.say('потом включите');
    assert.equal(r.at, 8);
});

test('оговорка: повтор пары слов не возвращает назад', () => {
    const script = 'Наш новый продукт позволяет экономить время и деньги каждой компании';
    const r = new Reader(script).say('наш новый продукт').say('новый продукт');
    assert.equal(r.at, 3);
    r.say('позволяет экономить');
    assert.equal(r.at, 5);
});

test('дубль два: абзац перечитан заново — возвращаемся', () => {
    const script = 'Вступление закончилось. Главная мысль этого ролика очень простая и понятная каждому. '
        + 'Дальше будет продолжение рассказа.';
    const r = new Reader(script).say('вступление закончилось главная мысль этого ролика очень простая и понятная');
    assert.equal(r.at, 10);
    r.pause().say('главная мысль этого');
    assert.equal(r.at, 10, 'трёх слов ещё мало');
    r.say('ролика');
    assert.equal(r.at, 6);
    r.say('очень простая');
    assert.equal(r.at, 8);
});

test('дубль два не срабатывает на текст, пришедший одним куском', () => {
    const script = 'Вступление закончилось. Главная мысль этого ролика очень простая и понятная каждому. '
        + 'Дальше будет продолжение рассказа.';
    const r = new Reader(script).say('вступление закончилось главная мысль этого ролика очень простая и понятная');
    r.pause().burst('главная мысль этого ролика очень');
    assert.equal(r.at, 10);
});

test('после паузы чтение продолжается с того же места', () => {
    const script = 'Первая часть закончена. Вторая часть начинается прямо сейчас.';
    const r = new Reader(script).say('первая часть закончена').pause().say('вторая часть начинается');
    assert.equal(r.at, 6);
});

test('переход вручную: сказанное до него больше не учитывается', () => {
    const script = 'Один раз отмерь. Семь раз отрежь. Один раз отмерь. Конец.';
    const r = new Reader(script).say('один раз');
    r.matcher.index = 6;
    r.matcher.feed('один раз');
    assert.equal(r.at, 6);
    r.say('один раз отмерь');
    assert.equal(r.at, 9);
});

// The simulated read-throughs, as a regression check: the numbers printed by
// `npm run simulate` must not get worse than these.
for (const style of ['chrome', 'safari'] as const) {
    test(`симуляция, ${style}: новый алгоритм держит позицию при типичном шуме`, () => {
        const runs = 100;
        let close = 0, ranAhead = 0, finished = 0, oldClose = 0;
        for (let seed = 1; seed <= runs; seed++) {
            const steps = read(SCRIPT, NOISE.typical, seed, style);
            const score = follow(new NewMatcher(SCRIPT), steps, SCRIPT);
            close += score.close;
            ranAhead += score.ranAhead;
            if (score.finished) finished++;
            oldClose += follow(new OldMatcher(SCRIPT), steps, SCRIPT).close;
        }
        assert.ok(close / runs > 0.985, `в пределах двух слов: ${close / runs}`);
        assert.ok(ranAhead / runs < 0.005, `убежал вперёд: ${ranAhead / runs}`);
        assert.ok(finished / runs > 0.97, `дошёл до конца: ${finished / runs}`);
        assert.ok(close > oldClose, 'не хуже прежнего алгоритма');
    });
}
