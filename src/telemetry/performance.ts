export type TraceName = 'home_load' | 'insights_load' | 'chart_render' | 'backup_export' | 'backup_import';
let connectivityTraceStarted = false;

/** Keeps the user operation authoritative even when trace setup or teardown fails. */
export async function runWithTrace<T>(open: () => Promise<{ stop: () => Promise<void> | void }>,
  operation: () => Promise<T>): Promise<T> {
  let running: { stop: () => Promise<void> | void } | undefined;
  try { running = await open(); } catch { /* The operation still runs. */ }
  try { return await operation(); }
  finally { try { await running?.stop(); } catch { /* Preserve the operation result. */ } }
}

/** Temporary development-only native Performance connectivity check. */
export function runPerformanceConnectivityTest() {
  if (!__DEV__ || connectivityTraceStarted) return;
  connectivityTraceStarted = true;
  void (async () => {
    const { getPerformance, trace } = await import('@react-native-firebase/perf');
    const testTrace = trace(getPerformance(), 'tinywins_perf_test');
    await testTrace.start();
    console.info('[Performance Test] trace started');
    try {
      await new Promise<void>(resolve => setTimeout(resolve, 1000));
    } finally {
      await testTrace.stop();
      console.info('[Performance Test] trace stopped');
    }
  })().catch(() => {});
}

export async function withPerformanceTrace<T>(name: TraceName, operation: () => Promise<T>): Promise<T> {
  return runWithTrace(async () => {
    const { getPerformance, trace } = await import('@react-native-firebase/perf');
    const candidate = trace(getPerformance(), name);
    await candidate.start();
    if (__DEV__) console.info(`[Performance] ${name} started`);
    return { stop: async () => {
      try { await candidate.stop(); }
      finally { if (__DEV__) console.info(`[Performance] ${name} stopped`); }
    } };
  }, operation);
}
