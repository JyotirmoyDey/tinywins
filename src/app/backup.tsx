import { useRef, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet,
  Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Button } from '../components/ui';
import { useTasks } from '../state/TasksProvider';
import { createLocalBackup, unlockLocalBackup } from '../backup/service';
import { BackupPayload, backupPreview } from '../backup/data';
import { pickEncryptedBackup, saveEncryptedBackup, shareEncryptedBackup } from '../backup/files';
import { localDate } from '../domain/task';
import { hasNativeBackupModule } from '../backup/deviceCrypto';
import { colors as c, spacing as s, typography as t } from '../theme';
import { trackBackupExported, trackBackupFailed, trackBackupImported, withPerformanceTrace } from '../telemetry';
import { logger } from '../logging/logger';

type Stage = 'choice' | 'create' | 'ready' | 'password' | 'preview';
function PasswordField({ label, value, onChange, visible, onToggle }: {
  label: string; value: string; onChange: (value: string) => void;
  visible: boolean; onToggle: () => void;
}) {
  return <View style={styles.field}>
    <Text style={styles.fieldLabel}>{label}</Text>
    <View style={styles.passwordRow}>
      <TextInput value={value} onChangeText={onChange} secureTextEntry={!visible}
        autoCapitalize="none" autoCorrect={false} textContentType="password"
        accessibilityLabel={label} placeholder="Password" placeholderTextColor={c.textTertiary}
        style={styles.input} returnKeyType="done" />
      <Pressable accessibilityRole="button" accessibilityLabel={visible ? `Hide ${label}` : `Show ${label}`}
        onPress={onToggle} style={styles.show}><Text style={styles.showText}>{visible ? 'Hide' : 'Show'}</Text></Pressable>
    </View>
  </View>;
}

export default function BackupScreen() {
  const router = useRouter();
  const backupAvailable = hasNativeBackupModule();
  const { restoreBackup } = useTasks();
  const [stage, setStage] = useState<Stage>('choice');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [visible, setVisible] = useState(false);
  const [file, setFile] = useState<string | null>(null);
  const [encrypted, setEncrypted] = useState<string | null>(null);
  const [payload, setPayload] = useState<BackupPayload | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const cancelRequested = useRef(false);
  const operation = useRef(false);
  const clear = () => {
    setPassword(''); setConfirmation(''); setFile(null); setEncrypted(null); setPayload(null);
    setVisible(false); setError(null); setStage('choice');
  };
  const cancel = () => {
    if (busy) {
      if (stage === 'create') { cancelRequested.current = true; setNotice('Finishing the current step, then cancelling…'); }
      return;
    }
    clear();
  };
  const message = (cause: unknown) => cause instanceof Error ? cause.message : 'Please try again.';
  const create = async () => {
    if (operation.current) return;
    if (password.length < 12) { setError('Use a password of at least 12 characters.'); return; }
    if (password !== confirmation) { setError('The passwords do not match.'); return; }
    operation.current = true;
    cancelRequested.current = false; setError(null); setNotice(null); setBusy('Preparing your backup…');
    logger.info('Backup export started', { operation: 'export', screen: 'backup' });
    try {
      const result = await withPerformanceTrace('backup_export', () => createLocalBackup(password, setBusy));
      if (cancelRequested.current) { clear(); return; }
      setEncrypted(result); setPassword(''); setConfirmation(''); setStage('ready');
      setNotice('Encrypted backup ready. Choose where to save it or share it.');
    } catch (cause) { logger.error('Backup export failed', { operation: 'backup_export', failure_category: 'encryption' }, cause); trackBackupFailed('export', 'encryption'); if (!cancelRequested.current) setError(message(cause)); else clear(); }
    finally { setBusy(null); cancelRequested.current = false; operation.current = false; }
  };
  const save = async () => {
    if (!encrypted || operation.current) return;
    operation.current = true; setError(null); setNotice(null); setBusy('Opening save location…');
    try {
      const result = await saveEncryptedBackup(encrypted, localDate());
      if (result.status === 'saved') { trackBackupExported(); logger.info('Backup export completed', { operation: 'export' }); setNotice(`${result.filename} was saved to your chosen folder.`); }
      if (result.status === 'unverified') { logger.warn('Backup export unverified', { operation: 'export' }); setNotice(Platform.OS === 'ios'
        ? 'The share sheet closed. Check Files to confirm the backup was saved.'
        : `${result.filename ?? 'The backup'} was written, but could not be read back. Check it before relying on it.`); }
    } catch (cause) { logger.error('Backup export failed', { operation: 'backup_file', failure_category: 'file_io' }, cause); trackBackupFailed('export', 'file_io'); setError(message(cause)); }
    finally { setBusy(null); operation.current = false; }
  };
  const share = async () => {
    if (!encrypted || operation.current) return;
    operation.current = true; setError(null); setNotice(null); setBusy('Opening sharing…');
    try {
      await shareEncryptedBackup(encrypted, localDate());
      setNotice('The share sheet closed. Confirm the backup arrived at its destination.');
    } catch (cause) { logger.error('Backup export failed', { operation: 'backup_file', failure_category: 'file_io' }, cause); trackBackupFailed('export', 'file_io'); setError(message(cause)); }
    finally { setBusy(null); operation.current = false; }
  };
  const chooseFile = async () => {
    if (operation.current) return;
    operation.current = true;
    setError(null); setNotice(null); setBusy('Opening files…');
    try {
      const chosen = await pickEncryptedBackup();
      if (chosen) { setFile(chosen); setPassword(''); setStage('password'); }
    } catch (cause) { logger.error('Backup import failed', { operation: 'backup_file', failure_category: 'file_io' }, cause); trackBackupFailed('import', 'file_io'); setError(message(cause)); }
    finally { setBusy(null); operation.current = false; }
  };
  const inspect = async () => {
    if (!file || operation.current) return;
    operation.current = true;
    setError(null); setBusy('Checking backup…');
    try {
      const result = await unlockLocalBackup(file, password);
      setPayload(result); setFile(null); setPassword(''); setStage('preview');
    } catch (cause) { logger.error('Backup import rejected', { operation: 'backup_import', failure_category: 'validation' }, cause); trackBackupFailed('import', 'validation'); setError(message(cause)); }
    finally { setBusy(null); operation.current = false; }
  };
  const restore = async () => {
    if (!payload || operation.current) return;
    operation.current = true;
    setError(null); setBusy('Restoring your data…');
    logger.info('Backup import started', { operation: 'import', screen: 'backup' });
    try {
      await withPerformanceTrace('backup_import', () => restoreBackup(payload));
      const restored = backupPreview(payload);
      trackBackupImported(restored.items, restored.recordings);
      logger.info('Backup import completed', { operation: 'import', activity_count: restored.items });
      clear();
      Alert.alert('Restore complete', 'Your items and recordings are ready.');
      router.replace('/');
    } catch (cause) { logger.error('Backup import failed', { operation: 'backup_import', failure_category: 'database' }, cause); trackBackupFailed('import', 'database'); setError(message(cause)); }
    finally { setBusy(null); operation.current = false; }
  };
  const confirmRestore = () => Alert.alert('Replace current data?',
    'Restoring this backup will replace your current TinyWins data.',
    [{ text: 'Cancel', style: 'cancel' },
      { text: 'Restore', style: 'destructive', onPress: () => void restore() }]);
  const preview = payload && backupPreview(payload);
  return <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Pressable accessibilityRole="button" accessibilityLabel={stage === 'choice' ? 'Back to Profile' : 'Cancel'}
          onPress={() => stage === 'choice' ? router.back() : cancel()} style={styles.back}>
          <Text style={styles.backText}>{stage === 'choice' ? '‹ Profile' : 'Cancel'}</Text>
        </Pressable>
        <Text style={styles.title}>Backup &amp; Restore</Text>
        {stage === 'choice' && <View style={styles.group}>
          <Text style={styles.body}>Keep a password-protected copy of your TinyWins data in a location you choose.</Text>
          {!backupAvailable && <Text style={styles.note}>Backup &amp; Restore needs a TinyWins development or production build. It is unavailable in Expo Go.</Text>}
          <Button label="Create Backup" onPress={() => { setError(null); setStage('create'); }} disabled={!!busy || !backupAvailable}/>
          <Button label="Restore Backup" onPress={() => void chooseFile()} subtle disabled={!!busy || !backupAvailable}/>
          <Text style={styles.note}>TinyWins cannot recover a forgotten backup password.</Text>
        </View>}
        {stage === 'create' && <View style={styles.group}>
          <Text style={styles.body}>Create an encrypted file, then choose how to save or share it.</Text>
          <PasswordField label="Password" value={password} onChange={setPassword}
            visible={visible} onToggle={() => setVisible(value => !value)}/>
          <PasswordField label="Confirm password" value={confirmation} onChange={setConfirmation}
            visible={visible} onToggle={() => setVisible(value => !value)}/>
          <Text style={styles.note}>At least 12 characters. Keep this password somewhere safe; it cannot be recovered.</Text>
          <Button label="Create encrypted backup" onPress={() => void create()} disabled={!!busy}/>
        </View>}
        {stage === 'ready' && <View style={styles.group}>
          <Text style={styles.body}>Your encrypted backup is ready.</Text>
          <Button label={Platform.OS === 'ios' ? 'Save to Files' : 'Save to Device'}
            onPress={() => void save()} disabled={!!busy || !encrypted}/>
          <Button label="Share Backup" onPress={() => void share()} subtle disabled={!!busy || !encrypted}/>
          {Platform.OS === 'ios' && <Text style={styles.note}>Choose Save to Files in the share sheet. Check Files afterward; iOS does not confirm which action you chose.</Text>}
          <Button label="Done" onPress={clear} subtle disabled={!!busy}/>
        </View>}
        {stage === 'password' && <View style={styles.group}>
          <Text style={styles.body}>Enter the password for the selected backup. Your current data will not change yet.</Text>
          <PasswordField label="Backup password" value={password} onChange={setPassword}
            visible={visible} onToggle={() => setVisible(value => !value)}/>
          <Button label="Preview backup" onPress={() => void inspect()} disabled={!!busy || !password}/>
        </View>}
        {stage === 'preview' && preview && <View style={styles.group}>
          <Text style={styles.sectionTitle}>Ready to restore</Text>
          <View style={styles.preview}>
            <Text style={styles.previewRow}>Created {new Date(preview.createdAt).toLocaleDateString()}</Text>
            <Text style={styles.previewRow}>{preview.items} tracked items</Text>
            <Text style={styles.previewRow}>{preview.archived} archived items</Text>
            <Text style={styles.previewRow}>{preview.recordings} historical recordings</Text>
          </View>
          <Text style={styles.warning}>Restoring this backup will replace your current TinyWins data.</Text>
          <Button label="Restore" onPress={confirmRestore} disabled={!!busy}/>
        </View>}
        {busy && <Text accessibilityLiveRegion="polite" style={styles.status}>{busy}</Text>}
        {error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
        {notice && <Text accessibilityLiveRegion="polite" style={styles.note}>{notice}</Text>}
      </ScrollView>
    </KeyboardAvoidingView>
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: c.background },
  content: { paddingHorizontal: s.xl, paddingTop: s.sm, paddingBottom: s.xxxl, gap: s.lg },
  back: { minHeight: 44, alignSelf: 'flex-start', justifyContent: 'center', paddingRight: s.md },
  backText: { ...t.secondary, color: c.textPrimary, fontWeight: '600' },
  title: { ...t.screenTitle, color: c.textPrimary },
  group: { gap: s.md },
  body: { ...t.body, color: c.textSecondary },
  note: { ...t.secondary, color: c.textSecondary },
  sectionTitle: { ...t.sectionTitle, color: c.textPrimary },
  field: { gap: s.xs }, fieldLabel: { ...t.secondary, color: c.textPrimary, fontWeight: '600' },
  passwordRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: c.surface,
    borderWidth: 1, borderColor: c.border, borderRadius: 12, minHeight: 50 },
  input: { ...t.body, color: c.textPrimary, flex: 1, minWidth: 0, paddingHorizontal: s.md,
    paddingVertical: s.sm },
  show: { minWidth: 52, minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  showText: { ...t.secondary, color: c.textPrimary, fontWeight: '600' },
  preview: { backgroundColor: c.surface, borderWidth: 1, borderColor: c.border,
    borderRadius: 14, padding: s.lg, gap: s.sm },
  previewRow: { ...t.body, color: c.textPrimary },
  warning: { ...t.body, color: c.textPrimary, fontWeight: '600' },
  status: { ...t.secondary, color: c.textSecondary },
  error: { ...t.secondary, color: c.danger },
});
