import { Tabs } from 'expo-router';
import { useWindowDimensions } from 'react-native';
import { BottomDock } from '../../components/BottomDock';
import { colors } from '../../theme';
export default function PrimaryLayout() {
  const { width, height } = useWindowDimensions();
  // A native back/removal outside the chart's Close path must not expose a wide dock.
  return <Tabs tabBar={props => height >= width ? <BottomDock {...props} /> : null}
    screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: colors.background }, animation: 'none', tabBarHideOnKeyboard: true }}>
    <Tabs.Screen name="index" options={{ title: 'Home' }} />
    <Tabs.Screen name="insights" options={{ title: 'Insights' }} />
    <Tabs.Screen name="profile" options={{ title: 'Profile' }} />
  </Tabs>;
}
