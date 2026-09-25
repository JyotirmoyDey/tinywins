/** Plot geometry stays independent of the chart renderer and device width. */
export function axisColumnWidth(measuredLabelWidth: number, availableWidth: number,
  expanded: boolean, compactMaximum: number, expandedMaximum: number, gap: number) {
  const preferred = Math.max(44, measuredLabelWidth) + gap;
  return Math.min(preferred, expanded ? expandedMaximum : compactMaximum,
    Math.max(44, availableWidth * (expanded ? 0.28 : 0.32)));
}

export function expandedPlotHeight(availableHeight: number, axisFooterHeight = 26) {
  return Math.max(1, Math.floor(availableHeight - axisFooterHeight));
}

/** The expanded chart can render from either measured orientation during rotation. */
export function expandedBoundsReady(width: number, height: number) {
  return width > 0 && height > 0;
}

/** One uniform calendar-day scale across the full selected range. */
export function expandedDailyScale(viewportWidth: number, dayCount: number,
  inset: number, preferredDayWidth: number) {
  const usableWidth = Math.max(1, viewportWidth - inset * 2);
  const intervals = Math.max(0, dayCount - 1);
  const fittedStep = intervals ? usableWidth / intervals : 0;
  const shouldScroll = dayCount > 30 || (dayCount > 7 && fittedStep < 22);
  // On scrollable ranges, roughly 21–30 calendar days fit initially. Missing
  // dates retain their positions because every day uses the same step.
  const scrollStep = Math.max(22, Math.min(preferredDayWidth, usableWidth / 21));
  const chartWidth = shouldScroll ? Math.max(viewportWidth, intervals * scrollStep + inset * 2) : viewportWidth;
  return {
    chartWidth,
    dayStep: intervals ? (chartWidth - inset * 2) / intervals : 0,
    scrollEnabled: chartWidth > viewportWidth + 1,
    initialOffset: Math.max(0, chartWidth - viewportWidth),
  };
}

/** Convert a touch in the scroll viewport to a calendar slot; empty slots stay empty. */
export function expandedDayIndexAt(viewportX: number, scrollX: number, dayStep: number,
  inset: number, dayCount: number) {
  if (dayCount < 1 || dayStep <= 0) return dayCount === 1 ? 0 : null;
  const contentX = viewportX + scrollX;
  const index = Math.round((contentX - inset) / dayStep);
  if (index < 0 || index >= dayCount ||
    Math.abs(inset + index * dayStep - contentX) > Math.max(14, dayStep / 2)) return null;
  return index;
}
