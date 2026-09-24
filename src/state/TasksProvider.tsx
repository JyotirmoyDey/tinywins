import React, { createContext, useContext, useEffect, useState, useCallback, useMemo, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';
import * as Haptics from 'expo-haptics';
import { randomUUID } from 'expo-crypto';
import { Task, createEntrySnapshot, localDate } from '../domain/task';
import { TaskRepository } from '../data/repository';
import { getRepositories } from '../data/runtime';
import { EntryStore } from './EntryStore';
const entryStore = new EntryStore();
interface Actions {
  mutate: (action: (repo: TaskRepository) => Promise<unknown>) => Promise<void>;
  select: (task: Task, date: string, optionId: string | null, haptic?: boolean) => Promise<void>;
  loadHistory: (taskId: string, dates: string[]) => Promise<void>;
  reload: () => Promise<void>;
}
interface TaskState { data: { tasks: Task[] }; today: string; loading: boolean; error: string | null }
const StateContext = createContext<TaskState | null>(null);
const ActionsContext = createContext<Actions | null>(null);
export function TasksProvider({ children }: React.PropsWithChildren) {
  const [tasks, setTasks] = useState<Task[]>([]); const [today, setToday] = useState(localDate());
  const [loading, setLoading] = useState(true); const [error, setError] = useState<string | null>(null);
  const reload = useCallback(async () => {
    try {
      const checkpoint = entryStore.checkpoint();
      const repos = await getRepositories(); const date = localDate();
      const nextTasks = await repos.tasks.getAll(); const entries = await repos.entries.getForDate(date);
      entryStore.hydrateDate(date, entries, checkpoint);
      setTasks(current => JSON.stringify(current) === JSON.stringify(nextTasks) ? current : nextTasks);
      setToday(date); setError(null);
    } catch { setError('Your saved data could not be loaded. Please try again. Your existing data has not been cleared.'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => {
    void Promise.resolve().then(reload);
    const subscription = AppState.addEventListener('change', state => { if (state === 'active') void reload(); });
    let currentDate = localDate();
    const timer = setInterval(() => { const date = localDate(); if (date !== currentDate) { currentDate = date; void reload(); } }, 1000);
    return () => { subscription.remove(); clearInterval(timer); };
  }, [reload]);
  const mutate = useCallback(async (action: (repo: TaskRepository) => Promise<unknown>) => {
    const repos = await getRepositories(); await action(repos.tasks); await reload();
  }, [reload]);
  const select = useCallback(async (task: Task, date: string, optionId: string | null, haptic = true) => {
    const option = task.options.find(o => o.id === optionId);
    if (optionId !== null && !option) throw new Error('Choice not found.');
    const previous = entryStore.get(task.id, date); const now = new Date().toISOString();
    const next = option ? { id: previous?.id ?? randomUUID(), taskId: task.id, localDate: date,
      createdAt: previous?.createdAt ?? now, updatedAt: now, ...createEntrySnapshot(option),
      scaleVersionIdAtEntry: task.currentScaleVersionId, trendEpochIdAtEntry: task.currentTrendEpochId } : undefined;
    // Paint first; no full-screen state update or waiting for a database round-trip.
    const save = entryStore.optimistic(task.id, date, next, async () => {
      const repos = await getRepositories();
      if (optionId === null) { await repos.entries.deleteEntry(task.id, date); return undefined; }
      return repos.entries.upsert(task.id, date, optionId);
    }, async () => (await getRepositories()).entries.getForTaskAndDate(task.id, date));
    if (haptic) void Haptics.selectionAsync().catch(() => {});
    await save;
  }, []);
  const loadHistory = useCallback(async (taskId: string, dates: string[]) => {
    const checkpoint = entryStore.checkpoint();
    const repos = await getRepositories();
    entryStore.hydrateHistory(taskId, dates, await repos.entries.getHistoryForTask(taskId, { from: dates[dates.length - 1], to: dates[0] }), checkpoint);
  }, []);
  const actions = useMemo(() => ({ mutate, select, loadHistory, reload }), [mutate, select, loadHistory, reload]);
  const state = useMemo(() => ({ data: { tasks }, today, loading, error }), [tasks, today, loading, error]);
  return <ActionsContext.Provider value={actions}><StateContext.Provider value={state}>{children}</StateContext.Provider></ActionsContext.Provider>;
}
export function useTaskActions() {
  const value = useContext(ActionsContext); if (!value) throw new Error('TasksProvider missing'); return value;
}
export function useTasks() {
  const value = useContext(StateContext); const actions = useTaskActions();
  if (!value) throw new Error('TasksProvider missing'); return { ...value, ...actions };
}
export function useEntry(taskId: string, date: string) {
  return useSyncExternalStore(useCallback(listener => entryStore.subscribe(taskId, date, listener), [taskId, date]),
    useCallback(() => entryStore.get(taskId, date), [taskId, date]));
}
