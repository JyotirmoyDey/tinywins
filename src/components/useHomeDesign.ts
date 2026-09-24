import { useCallback, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { HomeDesign, readHomeDesign, writeHomeDesign } from './homeDesignPreference';
export type { HomeDesign } from './homeDesignPreference';
export function useHomeDesign() {
  const [stored, setStored] = useState<HomeDesign>('classic');
  const [ready, setReady] = useState(!__DEV__);
  const chosenThisSession = useRef(false);
  const writeQueue = useRef(Promise.resolve());
  useEffect(() => {
    if (!__DEV__) return;
    let mounted = true;
    void readHomeDesign(AsyncStorage).then(value => {
      if (mounted && !chosenThisSession.current) setStored(value);
    }).catch(() => {}).finally(() => { if (mounted) setReady(true); });
    return () => { mounted = false; };
  }, []);
  const choose = useCallback((next: HomeDesign) => {
    if (!__DEV__) return;
    chosenThisSession.current = true;
    setStored(next);
    writeQueue.current = writeQueue.current.catch(() => {}).then(() => writeHomeDesign(AsyncStorage, next));
  }, []);
  return { design: __DEV__ ? stored : 'classic' as HomeDesign, ready, choose };
}
