import { useEffect, useRef } from 'react';
import { usePathname } from 'expo-router';
import * as ScreenOrientation from 'expo-screen-orientation';
import { trackOrientationChanged } from './analytics';
import { createOrientationTransitionTracker, normalizeOrientation } from './orientationState';
import { logger } from '../logging/logger';

export function OrientationTelemetry() {
  const path = usePathname();
  const screen = useRef(path);
  useEffect(() => { screen.current = path; }, [path]);
  const tracker = useRef(createOrientationTransitionTracker());
  useEffect(() => {
    let mounted = true;
    const observe = (value: number) => {
      if (!mounted) return;
      const change = tracker.current.observe(normalizeOrientation(value));
      if (change) {
        trackOrientationChanged(change.from, change.to, screen.current.split('/')[1] || 'home');
        logger.info('Orientation changed', { orientation: change.to });
      }
    };
    void ScreenOrientation.getOrientationAsync().then(orientation => {
      // Do not overwrite a newer callback that arrived while the initial read was pending.
      if (tracker.current.current() === undefined) observe(orientation);
    }).catch(() => {});
    const subscription = ScreenOrientation.addOrientationChangeListener(event => observe(event.orientationInfo.orientation));
    return () => { mounted = false; subscription.remove(); };
  }, []);
  return null;
}
