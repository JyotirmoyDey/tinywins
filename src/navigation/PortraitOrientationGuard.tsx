import { useEffect } from 'react';
import { usePathname } from 'expo-router';
import * as ScreenOrientation from 'expo-screen-orientation';

/** The chart owns landscape; every other route must remain portrait after dismissal. */
export function PortraitOrientationGuard() {
  const pathname = usePathname();

  useEffect(() => {
    if (pathname === '/trend-expanded') return;

    let active = true;
    let locking = false;
    let requestedAgain = false;
    const lockPortrait = () => {
      if (!active) return;
      if (locking) { requestedAgain = true; return; }
      locking = true;
      void ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP)
        .catch(error => console.warn('Could not restore portrait orientation:', error))
        .finally(() => {
          locking = false;
          if (active && requestedAgain) {
            requestedAgain = false;
            lockPortrait();
          }
        });
    };

    lockPortrait();
    const subscription = ScreenOrientation.addOrientationChangeListener(event => {
      const orientation = event.orientationInfo.orientation;
      if (orientation === ScreenOrientation.Orientation.LANDSCAPE_LEFT ||
        orientation === ScreenOrientation.Orientation.LANDSCAPE_RIGHT) lockPortrait();
    });
    return () => { active = false; subscription.remove(); };
  }, [pathname]);

  return null;
}
