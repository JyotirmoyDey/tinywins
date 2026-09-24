import { useEffect, useRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { MenuView } from '@expo/ui/community/menu';
import Svg, { Path, Rect } from 'react-native-svg';
import { RatingDistributionTimeline } from '../../analytics/ratingDistribution';
import { CustomRange, formatLocalDate } from '../../analytics/insightsDateRange';
import { colors as c, spacing as s, typography as t } from '../../theme';

interface Props {
  value: RatingDistributionTimeline;
  custom: CustomRange;
  onPreset: (value: Exclude<RatingDistributionTimeline, 'CUSTOM'>) => void;
  onCustom: () => void;
}

const choices = [
  { id: '1D', title: 'Today (1D)' },
  { id: '7D', title: 'Last 7 days' },
  { id: '30D', title: 'Last 30 days' },
  { id: '90D', title: 'Last 90 days' },
  { id: 'CUSTOM', title: 'Custom range' },
] as const;

export function InsightsDateMenu({ value, custom, onPreset, onCustom }: Props) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  const label = value === 'CUSTOM' ? 'Custom' : value;
  const detail = value === 'CUSTOM' ? `, ${formatLocalDate(custom.startDate)} to ${formatLocalDate(custom.endDate)}` : '';
  return <MenuView
    actions={choices.map(choice => ({ ...choice, title: choice.id === 'CUSTOM' && value === 'CUSTOM' ? `Custom · ${formatLocalDate(custom.startDate)} – ${formatLocalDate(custom.endDate)}` : choice.title, state: value === choice.id ? 'on' as const : 'off' as const }))}
    onPressAction={event => {
      const id = event.nativeEvent.event;
      if (id === 'CUSTOM') {
        // Native menus dismiss asynchronously; wait until the menu is gone before showing a picker.
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(onCustom, 180);
      } else if (id === '1D' || id === '7D' || id === '30D' || id === '90D') onPreset(id);
    }}>
    <View accessible accessibilityRole="button" accessibilityLabel={`Date range, ${label}${detail}`} accessibilityHint="Opens date range options" style={styles.button}>
      <Svg width={17} height={17} viewBox="0 0 24 24" accessible={false}>
        <Rect x={3.5} y={5.5} width={17} height={15} rx={2} fill="none" stroke={c.textPrimary} strokeWidth={1.7} />
        <Path d="M7.5 3.5v4M16.5 3.5v4M3.5 10h17" fill="none" stroke={c.textPrimary} strokeWidth={1.7} strokeLinecap="round" />
      </Svg>
      <Text numberOfLines={1} maxFontSizeMultiplier={1.5} style={styles.label}>{label}</Text>
      <Svg width={12} height={12} viewBox="0 0 12 12" accessible={false}><Path d="m2 4 4 4 4-4" fill="none" stroke={c.textSecondary} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" /></Svg>
    </View>
  </MenuView>;
}

const styles = StyleSheet.create({
  button: { minWidth: 88, minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: s.xs, paddingHorizontal: s.sm, borderWidth: 1, borderColor: c.border, borderRadius: 10, backgroundColor: c.surface },
  label: { ...t.caption, color: c.textPrimary },
});
