import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tokenize } from '../src/match/normalize.ts';
import { findCommand } from '../src/match/commands.ts';

const command = (heard: string, script = 'Сегодня мы поговорим о телесуфлёрах') =>
    findCommand(tokenize(heard, 'ru-RU'), tokenize(script, 'ru-RU'));

test('русские команды', () => {
    assert.equal(command('назад'), 'back');
    assert.equal(command('и вот тут Назад.'), 'back');
    assert.equal(command('дальше'), 'next');
    assert.equal(command('далее'), 'next');
    assert.equal(command('сначала'), 'start');
    assert.equal(command('с начала'), 'start');
    assert.equal(command('в начало'), 'start');
    assert.equal(command('в конец'), 'finish');
});

test('английские команды остались', () => {
    assert.equal(command('go back'), 'back');
    assert.equal(command('go next'), 'next');
    assert.equal(command('go start'), 'start');
    assert.equal(command('go finish'), 'finish');
});

test('команда — только последние слова', () => {
    assert.equal(command('назад в будущее'), null);
    assert.equal(command('поговорим о телесуфлёрах'), null);
    assert.equal(command(''), null);
});

test('слово из сценария рядом — это чтение, а не команда', () => {
    assert.equal(command('назад', 'Теперь вернёмся назад и посмотрим ещё раз'), null);
    assert.equal(command('сначала', 'Сначала включите камеру'), null);
    assert.equal(command('с начала', 'Прочитайте текст с начала до конца'), null);
    assert.equal(command('дальше', 'Теперь вернёмся назад и посмотрим ещё раз'), 'next');
});
