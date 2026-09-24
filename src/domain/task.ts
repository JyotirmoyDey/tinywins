export interface TaskOption {
  id: string; taskId: string; label: string; position: number; rank: number; normalizedWeight: number;
  active: boolean; createdAt: string; updatedAt: string;
}
export interface Task {
  id: string; name: string; createdAt: string; updatedAt: string; active: boolean;
  currentScaleVersionId: string; currentTrendEpochId: string;
  /** Current choices only. Retired options remain in the database. */
  options: TaskOption[];
}
export interface OptionDraft { id: string; label: string }
export interface TaskDraft { name: string; options: OptionDraft[] }
/** Historical truth. Analytics and history must use these snapshots, never current TaskOption metadata. */
export interface DailyEntry {
  id: string; taskId: string; optionId: string; localDate: string;
  createdAt: string; updatedAt: string;
  optionLabelAtEntry: string; positionAtEntry: number; rankAtEntry: number | null; // null only for pre-snapshot legacy rows
  normalizedWeightAtEntry: number;
  /** Immutable identities captured when this response was explicitly saved. */
  scaleVersionIdAtEntry: string; trendEpochIdAtEntry: string;
}

export interface RatingScaleVersion {
  id: string; taskId: string; trendEpochId: string; createdAt: string; effectiveLocalDate: string;
  /** Immutable ordered options for this version. Current TaskOption rows may later change. */
  options: { id: string; label: string; position: number }[];
}

export interface EntrySnapshot {
  optionId: string; optionLabelAtEntry: string; positionAtEntry: number;
  rankAtEntry: number; normalizedWeightAtEntry: number;
}
export function createEntrySnapshot(option: TaskOption): EntrySnapshot {
  // TaskOption is current configuration. Copy every semantic value now so
  // later edits to this option cannot rewrite a historical DailyEntry.
  return { optionId: option.id, optionLabelAtEntry: option.label,
    positionAtEntry: option.position, rankAtEntry: option.rank, normalizedWeightAtEntry: option.normalizedWeight };
}

export function normalizeOptions(taskId: string, options: OptionDraft[], now = new Date().toISOString()): TaskOption[] {
  if (options.length < 2 || options.length > 7) throw new Error('Choose between 2 and 7 options.');
  return options.map((option, i) => ({ ...option, label: option.label.trim(), taskId,
    position: i + 1, rank: i + 1, normalizedWeight: Math.round((i / (options.length - 1)) * 100),
    active: true, createdAt: now, updatedAt: now }));
}
export function validateDraft(draft: TaskDraft): string | null {
  if (!draft.name.trim()) return 'Give your task a name.';
  if (draft.options.length < 2 || draft.options.length > 7) return 'Choose between 2 and 7 options.';
  if (draft.options.some(option => !option.label.trim() || !option.id)) return 'Give every option a label.';
  if (new Set(draft.options.map(option => option.id)).size !== draft.options.length) return 'Option IDs must be unique.';
  return null;
}
export function localDate(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
export function parseLocalDate(value: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('Invalid calendar date.');
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year, month - 1, day, 12);
  if (localDate(date) !== value) throw new Error('Invalid calendar date.');
  return date;
}
export function recentDates(today = localDate(), count = 30): string[] {
  const date = parseLocalDate(today);
  return Array.from({ length: count }, () => {
    const value = localDate(date); date.setDate(date.getDate() - 1); return value;
  });
}
