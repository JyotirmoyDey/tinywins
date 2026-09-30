import { Pressable, StyleProp, StyleSheet, Text, TextStyle, ViewStyle } from 'react-native';
import { colors as c, radii as r, spacing as s, typography as t } from '../theme';

export function RatingOptionButton({ label, selected, disabled, onPress, style, textStyle }: {
  label: string; selected: boolean; disabled: boolean; onPress: () => void;
  style?: StyleProp<ViewStyle>; textStyle?: StyleProp<TextStyle>;
}) {
  return <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button"
    accessibilityState={{ selected, disabled }} accessibilityLabel={label}
    style={({ pressed }) => [styles.option, selected && styles.selected, style, pressed && { opacity: 0.72, transform: [{ scale: 0.98 }] }]}>
    <Text style={[t.button, { color: selected ? c.selectedText : c.textPrimary, flexShrink: 1 }, textStyle]}>{selected ? '✓  ' : ''}{label}</Text>
  </Pressable>;
}

const styles = StyleSheet.create({
  option: { minHeight: 44, maxWidth: '100%', paddingHorizontal: s.md, paddingVertical: s.sm, borderWidth: 1, borderColor: c.borderStrong, borderRadius: r.md, backgroundColor: c.surface, justifyContent: 'center' },
  selected: { backgroundColor: c.selected, borderColor: c.selected },
});
