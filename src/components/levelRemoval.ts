import { OptionDraft } from '../domain/task';

export interface RemovedLevel {
  option: OptionDraft;
  index: number;
}

export function removeDraftLevel(options: OptionDraft[], id: string, minimum: number):
  { options: OptionDraft[]; removed: RemovedLevel } | null {
  if (options.length <= minimum) return null;
  const index = options.findIndex(option => option.id === id);
  if (index < 0) return null;
  return {
    options: options.filter(option => option.id !== id),
    removed: { option: { ...options[index] }, index },
  };
}

export function restoreDraftLevel(options: OptionDraft[], removed: RemovedLevel): OptionDraft[] {
  if (options.some(option => option.id === removed.option.id)) return options;
  const next = [...options];
  next.splice(Math.min(removed.index, next.length), 0, removed.option);
  return next;
}
