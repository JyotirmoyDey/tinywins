import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { TasksProvider } from '../state/TasksProvider';
import { colors } from '../theme';
import { PortraitOrientationGuard } from '../navigation/PortraitOrientationGuard';

export const unstable_settings = { anchor: '(tabs)' };
export default function RootLayout() {
  return <GestureHandlerRootView style={{ flex: 1 }}><SafeAreaProvider><TasksProvider><StatusBar style="dark" />
    <PortraitOrientationGuard />
    <Stack screenOptions={{ headerShown: false, orientation: 'portrait_up',
      contentStyle: { backgroundColor: colors.background }, animation: 'slide_from_right', animationDuration: 220 }}>
      <Stack.Screen name="(tabs)" />
      {/* The mounted chart opts into landscape; its fallback must be portrait when it unmounts. */}
      <Stack.Screen name="trend-expanded" options={{ orientation: 'portrait_up',
        presentation: 'fullScreenModal', gestureEnabled: false, animation: 'fade' }} />
      <Stack.Screen name="task/new" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
      <Stack.Screen name="task/[id]" />
      <Stack.Screen name="history/[id]" />
      <Stack.Screen name="archived" />
    </Stack>
  </TasksProvider></SafeAreaProvider></GestureHandlerRootView>;
}
