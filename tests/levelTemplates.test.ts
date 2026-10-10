import assert from 'node:assert/strict';
import test from 'node:test';
import { createLevelTemplateOptions, levelTemplates } from '../src/config/levelTemplates';
import { MAX_RATING_LEVELS, MIN_RATING_LEVELS } from '../src/config/ratingLevels';
import { MAX_OPTION_CHARACTERS, MAX_OPTION_DESCRIPTION_CHARACTERS, characterCount } from '../src/domain/inputLimits';
import { validateDraft } from '../src/domain/task';
import { setup } from './sqlite';

test('all four templates produce valid editable levels within the supported limits', () => {
  assert.deepEqual(levelTemplates.map(template => template.title), ['Time spent', 'Effort', 'Progress', 'Custom']);
  assert.deepEqual(levelTemplates.map(template => template.summary), [
    'How long you spent', 'How much you put in', 'How far you got', 'Your own descriptions',
  ]);
  assert.deepEqual(createLevelTemplateOptions('custom', () => 'unused').map(option => option.label),
    ['Not today', 'A little', 'Quite a bit']);
  let next = 0;
  for (const template of levelTemplates) {
    const options = createLevelTemplateOptions(template.id, () => `level-${++next}`);
    assert.ok(options.length >= MIN_RATING_LEVELS && options.length <= MAX_RATING_LEVELS);
    assert.deepEqual(options.map(option => option.label), template.levels.map(level => level.label));
    assert.deepEqual(options.map(option => option.description), template.levels.map(level => level.description));
    assert.equal(new Set(options.map(option => option.id)).size, options.length);
    assert.ok(options.every(option => characterCount(option.label) <= MAX_OPTION_CHARACTERS &&
      characterCount(option.description ?? '') <= MAX_OPTION_DESCRIPTION_CHARACTERS));
    assert.equal(validateDraft({ name: 'Test', options }), null);
  }
});

test('creating without a Combined Insights choice uses available slots, then leaves later items unselected', async () => {
  const db = await setup();
  try {
    let next = 0;
    const created = [];
    for (let index = 0; index < 6; index++) {
      const options = createLevelTemplateOptions('custom', () => `choice-${++next}`);
      created.push(await db.tasks.create({ name: `Item ${index + 1}`, options }));
    }
    assert.deepEqual(created.map(task => task.includeInCombinedInsights), [true, true, true, true, true, false]);
  } finally { db.native.close(); }
});

test('applying a template only creates a draft; edited titles and descriptions save normally', async () => {
  const db = await setup();
  try {
    let next = 0;
    const options = createLevelTemplateOptions('effort', () => `effort-${++next}`);
    assert.deepEqual(await db.tasks.getAll(), []);
    options[1].label = 'Gentle';
    options[1].description = 'I made a gentle start.';
    const created = await db.tasks.create({ name: 'Practice', options });
    assert.equal(created.options[1].label, 'Gentle');
    assert.equal(created.options[1].description, 'I made a gentle start.');
    assert.equal((await db.tasks.getAll()).length, 1);
  } finally { db.native.close(); }
});
