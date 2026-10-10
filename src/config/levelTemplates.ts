import type { OptionDraft } from '../domain/task';
import { MAX_RATING_LEVELS, MIN_RATING_LEVELS } from './ratingLevels';

export type LevelTemplateId = 'time-spent' | 'effort' | 'progress' | 'custom';

interface LevelTemplate {
  id: LevelTemplateId;
  title: string;
  summary: string;
  levels: readonly { label: string; description?: string }[];
}

/** Starting points for new activities only; the resulting levels remain ordinary editable drafts. */
export const levelTemplates: readonly LevelTemplate[] = [
  { id: 'time-spent', title: 'Time spent', summary: 'How long you spent', levels: [
    { label: 'Not today', description: 'Did not spend time on this today.' },
    { label: 'A little', description: 'Spent a few minutes on it.' },
    { label: 'Some time', description: 'Made time for a session.' },
    { label: 'A lot', description: 'Spent an extended period on it.' },
  ] },
  { id: 'effort', title: 'Effort', summary: 'How much you put in', levels: [
    { label: 'Not today', description: 'Did not work on this today.' },
    { label: 'Light', description: 'Gave it a little attention.' },
    { label: 'Steady', description: 'Put in focused effort.' },
    { label: 'Strong', description: 'Gave it sustained effort.' },
  ] },
  { id: 'progress', title: 'Progress', summary: 'How far you got', levels: [
    { label: 'No progress', description: 'Did not move forward today.' },
    { label: 'Small step', description: 'Made a little progress.' },
    { label: 'Moved forward', description: 'Made noticeable progress.' },
    { label: 'Milestone', description: 'Reached an important step.' },
  ] },
  { id: 'custom', title: 'Custom', summary: 'Your own descriptions', levels: [
    { label: 'Not today' }, { label: 'A little' }, { label: 'Quite a bit' },
  ] },
];

export function createLevelTemplateOptions(id: LevelTemplateId, makeId: () => string): OptionDraft[] {
  const template = levelTemplates.find(item => item.id === id);
  if (!template || template.levels.length < MIN_RATING_LEVELS || template.levels.length > MAX_RATING_LEVELS)
    throw new Error('Invalid level template.');
  return template.levels.map(level => ({ id: makeId(), ...level }));
}
