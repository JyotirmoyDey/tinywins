import { DailyEntry } from '../domain/task';
/** Keyed subscriptions keep a response change local to its card/history row. */
export class EntryStore {
  private values = new Map<string, DailyEntry>();
  private confirmed = new Map<string, DailyEntry>();
  private listeners = new Map<string, Set<() => void>>();
  private writes = new Map<string, number>();
  private versions = new Map<string, number>();
  private revision = 0;
  key(taskId: string, date: string) { return `${taskId}:${date}`; }
  checkpoint() { return this.revision; }
  get(taskId: string, date: string) { return this.values.get(this.key(taskId, date)); }
  subscribe(taskId: string, date: string, listener: () => void) {
    const key = this.key(taskId, date);
    const group = this.listeners.get(key) ?? new Set(); group.add(listener); this.listeners.set(key, group);
    return () => { group.delete(listener); if (!group.size) this.listeners.delete(key); };
  }
  private remember(taskId: string, date: string, entry?: DailyEntry) {
    const key = this.key(taskId, date);
    if (entry) this.confirmed.set(key, entry); else this.confirmed.delete(key);
  }
  private set(taskId: string, date: string, entry?: DailyEntry) {
    const key = this.key(taskId, date);
    if (JSON.stringify(this.values.get(key)) === JSON.stringify(entry)) return;
    if (entry) this.values.set(key, entry); else this.values.delete(key);
    this.listeners.get(key)?.forEach(listener => listener());
  }
  private hydrate(taskId: string, date: string, entry: DailyEntry | undefined, checkpoint: number) {
    const key = this.key(taskId, date);
    if (this.writes.has(key) || (this.versions.get(key) ?? 0) > checkpoint) return;
    this.remember(taskId, date, entry); this.set(taskId, date, entry);
  }
  hydrateDate(date: string, entries: DailyEntry[], checkpoint = this.revision) {
    const ids = new Set([...entries.map(entry => entry.taskId), ...[...this.values.values()].filter(e => e.localDate === date).map(e => e.taskId)]);
    for (const id of ids) this.hydrate(id, date, entries.find(e => e.taskId === id), checkpoint);
  }
  hydrateHistory(taskId: string, dates: string[], entries: DailyEntry[], checkpoint = this.revision) {
    for (const date of dates) this.hydrate(taskId, date, entries.find(e => e.localDate === date), checkpoint);
  }
  clear() {
    this.values.clear(); this.confirmed.clear(); this.writes.clear(); this.versions.clear();
    this.revision++;
    this.listeners.forEach(group => group.forEach(listener => listener()));
  }
  async optimistic(taskId: string, date: string, next: DailyEntry | undefined,
    persist: () => Promise<DailyEntry | undefined>, recover: () => Promise<DailyEntry | null>) {
    const key = this.key(taskId, date); const revision = ++this.revision;
    this.versions.set(key, revision); this.writes.set(key, revision); this.set(taskId, date, next);
    try {
      const saved = await persist(); this.remember(taskId, date, saved);
      if (this.writes.get(key) === revision) this.set(taskId, date, saved);
    } catch (error) {
      const saved = await recover().catch(() => this.confirmed.get(key) ?? null);
      this.remember(taskId, date, saved ?? undefined);
      if (this.writes.get(key) === revision) this.set(taskId, date, saved ?? undefined);
      throw error;
    } finally { if (this.writes.get(key) === revision) this.writes.delete(key); }
  }
}
