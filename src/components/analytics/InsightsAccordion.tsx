import React, { useCallback, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { colors as c, spacing as s, typography as t } from '../../theme';

type Props = {
  title: string;
  initiallyExpanded: boolean;
  children: React.ReactNode;
};

// Keep chart instances alive, but skip their updates while the section is closed.
const AccordionContent = React.memo(function AccordionContent({ children, onLayout }: {
  children: React.ReactNode;
  frozen: boolean;
  onLayout: (height: number) => void;
}) {
  return <View style={styles.content} onLayout={event => onLayout(event.nativeEvent.layout.height)}>
    {children}
  </View>;
}, (previous, next) => previous.frozen && next.frozen);

/** Keeps opened content mounted so chart-local filters and selections survive a collapse. */
export function InsightsAccordion({ title, initiallyExpanded, children }: Props) {
  const [expanded, setExpanded] = useState(initiallyExpanded);
  const [unclipped, setUnclipped] = useState(initiallyExpanded);
  const contentHeight = useRef(0);
  const [height] = useState(() => new Animated.Value(0));
  const [progress] = useState(() => new Animated.Value(initiallyExpanded ? 1 : 0));
  const onContentLayout = useCallback((measured: number) => { contentHeight.current = measured; }, []);

  const toggle = () => {
    const next = !expanded;
    height.stopAnimation(currentHeight => {
      height.setValue(unclipped ? contentHeight.current : currentHeight);
      setUnclipped(false);
      setExpanded(next);
      Animated.parallel([
        Animated.timing(height, { toValue: next ? contentHeight.current : 0,
          duration: 190, useNativeDriver: false }),
        Animated.timing(progress, { toValue: next ? 1 : 0,
          duration: 190, useNativeDriver: false }),
      ]).start(({ finished }) => { if (finished && next) setUnclipped(true); });
    });
  };

  return <View style={styles.section}>
    <Pressable accessibilityRole="button" accessibilityLabel={title}
      accessibilityState={{ expanded }} onPress={toggle} style={styles.header}>
      <Text style={styles.title}>{title}</Text>
      <Animated.View style={{ transform: [{ rotate: progress.interpolate({
        inputRange: [0, 1], outputRange: ['0deg', '90deg'],
      }) }] }}>
        <Svg width={18} height={18} viewBox="0 0 24 24" accessible={false}>
          <Path d="m9 5 7 7-7 7" fill="none" stroke={c.textSecondary}
            strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
        </Svg>
      </Animated.View>
    </Pressable>
    <Animated.View pointerEvents={expanded ? 'auto' : 'none'}
      accessibilityElementsHidden={!expanded}
      importantForAccessibility={expanded ? 'auto' : 'no-hide-descendants'}
      style={unclipped ? styles.open : [styles.clipped, { height, opacity: progress }]}>
      <AccordionContent frozen={!expanded} onLayout={onContentLayout}>
        {children}
      </AccordionContent>
    </Animated.View>
  </View>;
}

const styles = StyleSheet.create({
  section: { gap: s.sm },
  header: { minHeight: 48, flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', gap: s.sm, paddingHorizontal: s.xs },
  title: { ...t.sectionTitle, fontSize: 19, color: c.textPrimary, flex: 1 },
  content: { gap: s.md },
  open: { overflow: 'visible' },
  clipped: { overflow: 'hidden' },
});
