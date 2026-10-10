import type { TaskRepository } from '../data/repository';
import { trackActivityDeleted } from './analytics';
import { logger } from '../logging/logger';

// The only owner of activity_deleted, including single and bulk deletion.
export async function deleteTaskWithTelemetry(repo: TaskRepository, id: string) {
  await repo.deleteTask(id);
  trackActivityDeleted();
  logger.info('Activity delete completed', { operation: 'delete', activity_count: 1 });
}

export async function deleteArchivedTasksWithTelemetry(repo: TaskRepository, count: number) {
  await repo.deleteArchivedTasks();
  if (count > 0) {
    trackActivityDeleted(count);
    logger.info('Activity delete completed', { operation: 'delete', activity_count: count });
  }
}
