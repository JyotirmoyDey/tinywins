import { Tabs } from 'expo-router';
import { BottomDock } from '../../components/BottomDock';
import { colors } from '../../theme';
export default function PrimaryLayout() {
  return <Tabs tabBar={props => <BottomDock {...props} />}
    screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: colors.background }, animation: 'none', tabBarHideOnKeyboard: true }}>
    <Tabs.Screen name="index" options={{ title: 'Home' }} />
    <Tabs.Screen name="insights" options={{ title: 'Insights' }} />
    <Tabs.Screen name="profile" options={{ title: 'Profile' }} />
  </Tabs>;
}
