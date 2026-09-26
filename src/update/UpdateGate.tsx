import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { AppState, Linking, Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import * as Application from 'expo-application';
import Constants from 'expo-constants';
import * as Updates from 'expo-updates';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, radii, spacing, typography } from '../theme';
import { fetchVersionDecision, shouldEnforceVersionPolicy, type MobilePlatform, type UpdateDecision } from './versionPolicy';

const NONE: UpdateDecision = { kind: 'none' };

// Preview, development-client and Expo Go builds have no production EAS channel.
const shouldCheck = shouldEnforceVersionPolicy(__DEV__, Updates.channel, Platform.OS);

export function UpdateGate({ children }: { children: ReactNode }) {
  const [decision, setDecision] = useState<UpdateDecision>(NONE);
  const [storeError, setStoreError] = useState(false);
  const dismissedBuilds = useRef(new Set<number>());
  const requestNumber = useRef(0);

  const check = useCallback(async () => {
    if (!shouldCheck) return;
    const request = ++requestNumber.current;
    const next = await fetchVersionDecision(
      Constants.expoConfig?.extra?.updatePolicyUrl,
      Platform.OS as MobilePlatform,
      Application.nativeBuildVersion,
    );
    if (request !== requestNumber.current) return;
    setDecision(next.kind === 'optional' && dismissedBuilds.current.has(next.latestBuild) ? NONE : next);
  }, []);

  useEffect(() => {
    void check();
    let previous = AppState.currentState;
    const requests = requestNumber;
    const listener = AppState.addEventListener('change', state => {
      if (previous !== 'active' && state === 'active') void check();
      previous = state;
    });
    return () => { ++requests.current; listener.remove(); };
  }, [check]);

  const dismiss = () => {
    if (decision.kind !== 'optional') return;
    dismissedBuilds.current.add(decision.latestBuild);
    setDecision(NONE);
  };

  const openStore = async () => {
    if (decision.kind === 'none') return;
    // Opening the store backgrounds the app; do not let a later optional prompt
    // reappear when it returns to the foreground during this session.
    if (decision.kind === 'optional') dismiss();
    setStoreError(false);
    try {
      await Linking.openURL(decision.storeUrl);
    } catch {
      if (decision.kind === 'required') setStoreError(true);
    }
  };

  return <>
    {children}
    <Modal visible={decision.kind === 'optional'} transparent animationType="fade" onRequestClose={dismiss}>
      <SafeAreaView style={styles.optionalBackdrop}>
        <View style={styles.optionalCard} accessibilityViewIsModal>
          <Text style={styles.title}>Update Available</Text>
          <Text style={styles.body}>A newer version of TinyWins is ready.</Text>
          {storeError && <Text style={styles.error}>The store could not open. Please try again.</Text>}
          <Pressable style={styles.primaryButton} onPress={() => void openStore()} accessibilityRole="button" accessibilityLabel="Update TinyWins">
            <Text style={styles.primaryButtonText}>Update</Text>
          </Pressable>
          <Pressable style={styles.secondaryButton} onPress={dismiss} accessibilityRole="button" accessibilityLabel="Maybe later">
            <Text style={styles.secondaryButtonText}>Maybe later</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    </Modal>
    <Modal visible={decision.kind === 'required'} animationType="fade" onRequestClose={() => {}}>
      <SafeAreaView style={styles.requiredScreen} accessibilityViewIsModal>
        <View style={styles.requiredContent}>
          <Text style={styles.title}>Update Required</Text>
          <Text style={styles.body}>Please update TinyWins to continue.</Text>
          {storeError && <Text style={styles.error}>The store could not open. Please try again.</Text>}
          <Pressable style={styles.primaryButton} onPress={() => void openStore()} accessibilityRole="button" accessibilityLabel="Update TinyWins">
            <Text style={styles.primaryButtonText}>Update</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    </Modal>
  </>;
}

const styles = StyleSheet.create({
  optionalBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: colors.scrim },
  optionalCard: { backgroundColor: colors.surface, borderTopLeftRadius: radii.xl, borderTopRightRadius: radii.xl,
    paddingHorizontal: spacing.xxl, paddingTop: spacing.xxl, paddingBottom: spacing.xxl, gap: spacing.md },
  requiredScreen: { flex: 1, backgroundColor: colors.background, justifyContent: 'center', paddingHorizontal: spacing.xxl },
  requiredContent: { gap: spacing.lg },
  title: { ...typography.sectionTitle, color: colors.textPrimary },
  body: { ...typography.body, color: colors.textSecondary },
  error: { ...typography.secondary, color: colors.danger },
  primaryButton: { minHeight: 48, borderRadius: radii.md, backgroundColor: colors.selected,
    alignItems: 'center', justifyContent: 'center', marginTop: spacing.sm, paddingHorizontal: spacing.lg },
  primaryButtonText: { ...typography.button, color: colors.selectedText },
  secondaryButton: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  secondaryButtonText: { ...typography.button, color: colors.textPrimary },
});
