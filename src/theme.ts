export const colors = {
  background: '#F7F7F4', surface: '#FFFFFF', surfaceSecondary: '#F1F1EE',
  primary: '#1F1F1D', primaryMuted: '#F1F1EE', primaryText: '#1E1E1C',
  selected: '#1F1F1D', selectedText: '#FFFFFF', navigationInactive: '#92928D', scrim: '#1E1E1C55',
  textPrimary: '#1E1E1C', textSecondary: '#74746F', textTertiary: '#A2A29D',
  border: '#E4E4DF', borderStrong: '#D4D4CE', danger: '#C94B45', dangerMuted: '#F8E9E7', success: '#1F1F1D',
};
export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24, xxxl: 32, huge: 40 };
export const radii = { sm: 8, md: 10, lg: 16, xl: 24 };
export const typography = {
  screenTitle: { fontSize: 30, lineHeight: 34, fontWeight: '700' as const, letterSpacing: -0.8 },
  sectionTitle: { fontSize: 20, lineHeight: 25, fontWeight: '600' as const, letterSpacing: -0.25 },
  taskTitle: { fontSize: 17, lineHeight: 22, fontWeight: '600' as const },
  body: { fontSize: 16, lineHeight: 23 }, secondary: { fontSize: 14, lineHeight: 20 },
  caption: { fontSize: 12, lineHeight: 17, fontWeight: '500' as const },
  button: { fontSize: 15, fontWeight: '600' as const },
};
export const shadows = { subtle: { shadowColor: '#1E1E1C', shadowOpacity: 0.04, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 1 } };
