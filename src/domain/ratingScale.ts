import { OptionDraft } from './task';

/** Detect only a change to the relative order of identities that survive the edit. */
export function reordersExistingOptions(previous: OptionDraft[], next: OptionDraft[]) {
  const surviving = new Set(next.map(option => option.id));
  const oldOrder = previous.filter(option => surviving.has(option.id)).map(option => option.id);
  const oldIds = new Set(previous.map(option => option.id));
  const newOrder = next.filter(option => oldIds.has(option.id)).map(option => option.id);
  return oldOrder.some((id, index) => id !== newOrder[index]);
}

export function changesScaleStructure(previous: OptionDraft[], next: OptionDraft[]) {
  return previous.length !== next.length ||
    previous.some(option => !next.some(other => other.id === option.id)) ||
    reordersExistingOptions(previous, next);
}
