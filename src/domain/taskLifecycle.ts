import { TaskLifecycleTransition, localDate, parseLocalDate } from './task';

type LifecycleTask = { id: string; createdAt: string; createdLocalDate?: string | null;
  archivedAt?: string | null; active: boolean };

/** End-of-local-day eligibility. A recorded response keeps an archive day
 * eligible; a fully archived day without a response is not a missed check-in.
 * The final transition on a day wins, including repeated same-day changes. */
export function createTaskDayEligibility(task: LifecycleTask,
  transitions: TaskLifecycleTransition[], recordedDates: Iterable<string>, today = localDate()) {
  const recorded = new Set(recordedDates);
  const firstRecorded = [...recorded].sort()[0] ?? null;
  let creation: string | null = null;
  try {
    if (task.createdLocalDate) { parseLocalDate(task.createdLocalDate); creation = task.createdLocalDate; }
    else {
      const timestamp = new Date(task.createdAt);
      if (Number.isFinite(timestamp.getTime())) creation = localDate(timestamp);
    }
  } catch { /* Unknown import date: use its first real recording. */ }
  const start = creation && creation <= today && (!firstRecorded || creation <= firstRecorded)
    ? creation : firstRecorded;
  const events = transitions.filter(event => event.taskId === task.id).sort((a, b) =>
    a.localDate.localeCompare(b.localDate) || a.occurredAt.localeCompare(b.occurredAt) ||
    (a.sequence ?? 0) - (b.sequence ?? 0));
  const archivedFallback = events.length === 0 && task.archivedAt ?
    localDate(new Date(task.archivedAt)) : null;
  const activeAtEnd = (date: string) => {
    let active = true;
    for (const event of events) {
      if (event.localDate > date) break;
      active = event.type === 'restored';
    }
    if (archivedFallback && date >= archivedFallback) return false;
    return active;
  };
  const eligible = (date: string) => !!start && date >= start && date <= today &&
    (recorded.has(date) || activeAtEnd(date));
  return { start, eligible, activeAtEnd, recorded };
}
