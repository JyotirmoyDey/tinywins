import { JourneySeries, journeyTogetherConfig } from '../../analytics/journeyTogether';
import { ratingTrendConfig } from '../../analytics/ratingTrend';
import { isolatedTrendFragments, trendCurvePath } from './trendCurve';

const presentation = journeyTogetherConfig.presentation;

export function journeyXAt(index: number, count: number, width: number) {
  const inset = presentation.horizontalInset + presentation.markerRadius;
  return count <= 1 ? width / 2 : inset + index * (width - inset * 2) / (count - 1);
}

export function journeyYAt(levelIndex: number, levelCount: number) {
  const height = presentation.miniPlotHeight;
  const inset = presentation.verticalInset + presentation.markerRadius;
  return levelCount <= 1 ? height / 2 :
    height - inset - levelIndex * (height - inset * 2) / (levelCount - 1);
}

/** Match the individual trend's configured interpolation while keeping every
 * miniature marker on its existing calendar slot and categorical level. */
function plotPoints(series: JourneySeries, dateCount: number, width: number) {
  return series.points.map(point => ({
    x: journeyXAt(point.slotIndex, dateCount, width),
    y: journeyYAt(point.levelIndex, series.levelCount),
    connectsToPrevious: point.connectsToPrevious,
  }));
}

export function journeyLinePath(series: JourneySeries, dateCount: number, width: number) {
  return trendCurvePath(plotPoints(series, dateCount, width),
    ratingTrendConfig.style.curve === 'linear' ? 'linear' : 'monotoneX');
}

/** A short dash keeps isolated recordings visible without drawing point markers. */
export function journeyIsolatedFragments(series: JourneySeries, dateCount: number, width: number) {
  return isolatedTrendFragments(plotPoints(series, dateCount, width),
    presentation.markerRadius * 3);
}
