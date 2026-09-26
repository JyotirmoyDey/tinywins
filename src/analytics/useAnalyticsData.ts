import { useCallback, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { getRepositories } from '../data/runtime';
import { useTasks } from '../state/TasksProvider';
import { AnalyticsDataset } from './types';
import { getAnalyticsDataset } from './service';
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
      let next: AnalyticsDataset;
      if (useDemo) {
        const { loadDemoDataset } = await import('./demoData');
        next = loadDemoDataset();
      } else {
        const repos = await getRepositories();
        const [tasks, entries, versions, lifecycle] = await Promise.all([
          repos.tasks.getAll(), repos.entries.getAll(), repos.tasks.getScaleVersions(),
          repos.tasks.getLifecycleTransitions(),
        ]);
        next = getAnalyticsDataset(tasks, entries, versions, lifecycle);
      }
      if (request.current === current) { setDataset(next); setLoadedSource(useDemo); }
    } finally {
      if (request.current === current) { loaded.current = true; setLoading(false); }
    }
  }, [useDemo]);
  useFocusEffect(useCallback(() => { void load(); }, [load]));
  return { dataset, loading: loading || loadedSource !== useDemo, reload: load, hasTasks: data.tasks.length > 0 };
}
