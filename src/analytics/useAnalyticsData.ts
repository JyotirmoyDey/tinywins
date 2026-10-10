import { useCallback, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { getRepositories } from '../data/runtime';
import { useTasks } from '../state/TasksProvider';
import { AnalyticsDataset } from './types';
import { getAnalyticsDataset } from './service';
import { withPerformanceTrace } from '../telemetry';
import { logger } from '../logging/logger';
export function useAnalyticsData(useDemo = false) {
  const { data } = useTasks();
  const [dataset, setDataset] = useState<AnalyticsDataset>({ tasks: [], entries: [], scaleVersions: [] });
  const [loading, setLoading] = useState(true);
  const [loadedSource, setLoadedSource] = useState<boolean | null>(null);
  const loaded = useRef(false);
  const request = useRef(0);
  const load = useCallback(async () => {
    const current = ++request.current;
    if (!loaded.current) setLoading(true);
    try {
      const next = await withPerformanceTrace('insights_load', async (): Promise<AnalyticsDataset> => {
      if (useDemo) {
        const { loadDemoDataset } = await import('./demoData');
        return loadDemoDataset();
      } else {
        const repos = await getRepositories();
        const [tasks, entries, versions, lifecycle] = await Promise.all([
          repos.tasks.getAll(), repos.entries.getAll(), repos.tasks.getScaleVersions(),
          repos.tasks.getLifecycleTransitions(),
        ]);
        return getAnalyticsDataset(tasks, entries, versions, lifecycle);
      }
      });
      if (request.current === current) { setDataset(next); setLoadedSource(useDemo); logger.info('Insights data loaded', { screen: 'insights' }); }
    } catch (cause) {
      logger.error('Insights data load failed', { operation: 'analytics_read', screen: 'insights' }, cause);
    } finally {
      if (request.current === current) { loaded.current = true; setLoading(false); }
    }
  }, [useDemo]);
  useFocusEffect(useCallback(() => { void load(); }, [load]));
  return { dataset, loading: loading || loadedSource !== useDemo, reload: load, hasTasks: data.tasks.length > 0 };
}
