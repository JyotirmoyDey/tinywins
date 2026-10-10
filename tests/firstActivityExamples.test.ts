import assert from 'node:assert/strict';
import test from 'node:test';
import { createSuggestedDraft, firstActivityExamples } from '../src/config/firstActivityExamples';
import { validateDraft } from '../src/domain/task';
import { setup } from './sqlite';

test('all four first-time examples produce valid, distinct editable drafts', () => {
  assert.deepEqual(firstActivityExamples.map(example => example.name),
    ['Exercise', 'Reading', 'Music Practice', 'Learning']);
  let next = 0;
  for (const example of firstActivityExamples) {
    const draft = createSuggestedDraft(example.id, () => `suggested-${++next}`)!;
    assert.equal(draft.name, example.name);
    assert.equal(validateDraft(draft), null);
    assert.equal(draft.options.length, example.levels.length);
    assert.deepEqual(draft.options.map(option => option.label), example.levels.map(level => level.label));
    assert.deepEqual(draft.options.map(option => option.description), example.levels.map(level => level.description));
    assert.equal(new Set(draft.options.map(option => option.id)).size, draft.options.length);
  }
  assert.equal(createSuggestedDraft('unknown', () => 'unused'), undefined);
  assert.equal(createSuggestedDraft(undefined, () => 'unused'), undefined);
});

test('opening a suggestion writes nothing; edited values are saved only through creation', async () => {
  const db = await setup();
  try {
    let next = 0;
    const draft = createSuggestedDraft('reading', () => `reading-${++next}`)!;
    assert.deepEqual(await db.tasks.getAll(), []);
    draft.name = 'Evening Reading';
    draft.options[1].label = 'Ten pages';
    draft.options[1].description = 'Read for ten minutes.';
    const created = await db.tasks.create(draft);
    assert.equal(created.name, 'Evening Reading');
    assert.equal(created.options[1].label, 'Ten pages');
    assert.equal(created.options[1].description, 'Read for ten minutes.');
    assert.equal((await db.tasks.getAll()).length, 1);
  } finally { db.native.close(); }
});
