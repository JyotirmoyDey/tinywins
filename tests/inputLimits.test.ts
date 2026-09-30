import test from 'node:test';
import assert from 'node:assert/strict';
import { characterCount, constrainTextInput, MAX_NAME_CHARACTERS, MAX_OPTION_CHARACTERS } from '../src/domain/inputLimits';
import { validateDraft } from '../src/domain/task';
import { setup } from './sqlite';

const options = [{ id: 'one', label: 'Lowest' }, { id: 'two', label: 'Highest' }];

test('visible-character counts include joined emoji and combining marks as one', () => {
  assert.equal(characterCount('👨‍👩‍👧‍👦'), 1);
  assert.equal(characterCount('👍🏽'), 1);
  assert.equal(characterCount('e\u0301'), 1);
  assert.equal(characterCount('🇮🇳'), 1);
});

test('24-character names and 18-character rating names are valid', () => {
  assert.equal(MAX_NAME_CHARACTERS, 24);
  assert.equal(MAX_OPTION_CHARACTERS, 18);
  assert.equal(validateDraft({ name: 'N'.repeat(MAX_NAME_CHARACTERS), options: [
    { id: 'one', label: '👨‍👩‍👧‍👦'.repeat(MAX_OPTION_CHARACTERS) }, options[1],
  ] }), null);
  assert.match(validateDraft({ name: 'N'.repeat(25), options })!, /24 characters/);
  assert.match(validateDraft({ name: 'Valid', options: [{ id: 'one', label: 'a'.repeat(19) }, options[1]] })!, /18 characters/);
  assert.match(validateDraft({ name: '  ', options })!, /Please enter a name/);
  assert.match(validateDraft({ name: 'Valid', options: [{ id: 'one', label: '  ' }, options[1]] })!, /every option/);
});

test('paste is clipped by grapheme without cutting an emoji or combining character', () => {
  const pasted = 'a'.repeat(23) + '👨‍👩‍👧‍👦' + 'extra';
  assert.deepEqual(constrainTextInput('', pasted, 24), { value: 'a'.repeat(23) + '👨‍👩‍👧‍👦', exceeded: true });
  assert.deepEqual(constrainTextInput('', 'e\u0301'.repeat(19), MAX_OPTION_CHARACTERS),
    { value: 'e\u0301'.repeat(18), exceeded: true });
  assert.deepEqual(constrainTextInput('a'.repeat(24), `b${'a'.repeat(24)}`, 24),
    { value: 'a'.repeat(24), exceeded: true });
});

test('legacy over-limit input can shrink but cannot grow', () => {
  const old = 'a'.repeat(30);
  assert.deepEqual(constrainTextInput(old, old.slice(0, 29), 24), { value: old.slice(0, 29), exceeded: false });
  assert.deepEqual(constrainTextInput(old, `${old}b`, 24), { value: old, exceeded: true });
  assert.deepEqual(constrainTextInput(old, 'New name', 24), { value: 'New name', exceeded: false });
});

test('repository enforces new limits, preserving unchanged legacy values and history', async () => {
  const { tasks, entries, db, native } = await setup();
  try {
    await assert.rejects(tasks.create({ name: 'N'.repeat(25), options }));
    await assert.rejects(tasks.create({ name: 'Valid', options: [{ id: 'one', label: 'a'.repeat(19) }, options[1]] }));
    const fiveOptions = Array.from({ length: 5 }, (_, index) => ({ id: `long-${index}`, label: `${index}${'W'.repeat(17)}` }));
    const task = await tasks.create({ name: 'Original', options: fiveOptions });
    assert.deepEqual(task.options.map(option => option.label), fiveOptions.map(option => option.label));
    const trimmed = await tasks.create({ name: '  Trimmed  ', options: [{ id: 'trim-one', label: '  Low  ' }, { id: 'trim-two', label: 'High' }] });
    assert.equal(trimmed.name, 'Trimmed');
    assert.equal(trimmed.options[0].label, 'Low');
    const entry = await entries.upsert(task.id, '2026-09-20', task.options[0].id);
    const longName = 'Older name longer than 24';
    const longLabel = 'Older rating label beyond the new limit';
    await db.runAsync('UPDATE tasks SET name = ? WHERE id = ?', longName, task.id);
    await db.runAsync('UPDATE task_options SET label = ? WHERE id = ?', longLabel, task.options[0].id);
    const legacy = (await tasks.getById(task.id))!;
    await assert.rejects(tasks.update(task.id, { name: `${longName}!`, options: legacy.options }));
    await assert.rejects(tasks.update(task.id, { name: legacy.name, options: legacy.options.map(o => o.id === legacy.options[0].id ? { ...o, label: `${longLabel}!` } : o) }));
    const renamed = await tasks.update(task.id, { name: 'New name', options: legacy.options });
    assert.equal(renamed.options[0].label, longLabel);
    const fixed = await tasks.update(task.id, { name: renamed.name, options: renamed.options.map(o => o.id === task.options[0].id ? { ...o, label: 'Good' } : o) });
    assert.equal(fixed.options[0].label, 'Good');
    assert.deepEqual(await entries.getForTaskAndDate(task.id, '2026-09-20'), entry);
  } finally { native.close(); }
});
