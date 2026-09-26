import { useCallback, useEffect, useRef } from 'react';
import { usePathname } from 'expo-router';
import * as ScreenOrientation from 'expo-screen-orientation';

/** The root layout is the only owner of orientation for both chart and app routes. */
export function PortraitOrientationGuard() {
  const pathname = usePathname();
  const desired = useRef<ScreenOrientation.OrientationLock>(ScreenOrientation.OrientationLock.PORTRAIT_UP);

  const applyDesired = useCallback(() => {
    const target = desired.current;
    void ScreenOrientation.lockAsync(target)
      .then(() => {
        // A late native completion from a previous route must not undo its successor.
        if (target !== desired.current) {
          void ScreenOrientation.lockAsync(desired.current)
            .catch(error => console.warn('Could not restore screen orientation:', error));
        }
      })
      .catch(error => console.warn('Could not set screen orientation:', error));
  }, []);

  useEffect(() => {
    desired.current = pathname === '/trend-expanded'
      ? ScreenOrientation.OrientationLock.LANDSCAPE
      : ScreenOrientation.OrientationLock.PORTRAIT_UP;
    applyDesired();
  }, [pathname, applyDesired]);

  useEffect(() => {
    const subscription = ScreenOrientation.addOrientationChangeListener(event => {
      const orientation = event.orientationInfo.orientation;
      const isLandscape = orientation === ScreenOrientation.Orientation.LANDSCAPE_LEFT ||
        orientation === ScreenOrientation.Orientation.LANDSCAPE_RIGHT;
      const wantsLandscape = desired.current === ScreenOrientation.OrientationLock.LANDSCAPE;
      if (isLandscape !== wantsLandscape) applyDesired();
    });
    return () => subscription.remove();
  }, [applyDesired]);

  return null;
}
