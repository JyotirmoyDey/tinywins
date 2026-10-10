import type { TaskDraft } from '../domain/task';

interface FirstActivityExample {
  id: string;
  name: string;
  levels: { label: string; description: string }[];
}

/** Suggestions only. Nothing is written until the person saves the existing form. */
export const firstActivityExamples: readonly FirstActivityExample[] = [
  { id: 'exercise', name: 'Exercise', levels: [
    { label: 'Rest', description: 'Took a planned rest day.' },
    { label: 'Light', description: 'Moved gently, such as walking or stretching.' },
    { label: 'Active', description: 'Completed a workout or active session.' },
    { label: 'Extended', description: 'Spent extra time moving today.' },
  ] },
  { id: 'reading', name: 'Reading', levels: [
    { label: 'Not today', description: 'Did not read today.' },
    { label: 'A few pages', description: 'Read for a short while.' },
    { label: 'A chapter', description: 'Made steady progress in a book.' },
    { label: 'Long session', description: 'Settled in for an extended read.' },
  ] },
  { id: 'music-practice', name: 'Music Practice', levels: [
    { label: 'Not today', description: 'Did not practise today.' },
    { label: 'Warm-up', description: 'Played briefly or reviewed the basics.' },
    { label: 'Focused', description: 'Spent time practising a specific skill.' },
    { label: 'Long session', description: 'Had an extended practice session.' },
  ] },
  { id: 'learning', name: 'Learning', levels: [
    { label: 'Not today', description: 'Did not study this topic today.' },
    { label: 'Quick review', description: 'Revisited one idea or note.' },
    { label: 'Focused study', description: 'Spent time learning something new.' },
    { label: 'Deep dive', description: 'Explored the topic in depth.' },
  ] },
];

export function createSuggestedDraft(exampleId: string | undefined, makeId: () => string): TaskDraft | undefined {
  const example = firstActivityExamples.find(item => item.id === exampleId);
  return example && { name: example.name,
    options: example.levels.map(level => ({ id: makeId(), ...level })) };
}
