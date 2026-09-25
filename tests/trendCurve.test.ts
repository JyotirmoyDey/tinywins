import test from 'node:test';
import assert from 'node:assert/strict';
import { loadDemoDataset } from '../src/analytics/demoData';
import { getRatingTrend, ratingTrendConfig } from '../src/analytics/ratingTrend';
import { getAdaptiveTrend } from '../src/analytics/ratingTrendPresentation';
import { connectedTrendSegments, isolatedTrendFragments, trendCurvePath, TrendCurvePoint } from '../src/components/analytics/trendCurve';
import { axisColumnWidth } from '../src/components/analytics/trendPlotLayout';

function cubics(path: string) {
  let previous: { x: number; y: number } | null = null;
  const results: { from: { x: number; y: number }; controls: number[]; to: { x: number; y: number } }[] = [];
  for (const command of path.matchAll(/([MC])\s+([^MC]+)/g)) {
    const numbers = (command[2].match(/-?\d+(?:\.\d+)?(?:e[+-]?\d+)?/gi) ?? []).map(Number);
    if (command[1] === 'M') previous = { x: numbers[0], y: numbers[1] };
    else {
      assert.ok(previous);
      const to = { x: numbers[4], y: numbers[5] };
      results.push({ from: previous, controls: numbers.slice(0, 4), to });
      previous = to;
    }
  }
  return results;
}

function assertMonotoneGeometry(points: TrendCurvePoint[]) {
  const curves = cubics(trendCurvePath(points, 'monotoneX'));
  assert.equal(curves.length, connectedTrendSegments(points).reduce((sum, segment) => sum + segment.length - 1, 0));
  for (const curve of curves) {
    const { from, to, controls: [x1, y1, x2, y2] } = curve;
    const low = Math.min(from.y, to.y), high = Math.max(from.y, to.y);
    assert.ok(from.x < x1 && x1 < x2 && x2 < to.x);
    assert.ok(y1 >= low - 1e-8 && y1 <= high + 1e-8);
    assert.ok(y2 >= low - 1e-8 && y2 <= high + 1e-8);
    for (let step = 0; step <= 20; step++) {
      const t = step / 20, other = 1 - t;
      const y = other ** 3 * from.y + 3 * other ** 2 * t * y1 +
        3 * other * t ** 2 * y2 + t ** 3 * to.y;
      assert.ok(y >= low - 1e-8 && y <= high + 1e-8);
    }
  }
  return curves;
}

test('monotoneX passes through observations without overshooting categorical extrema', () => {
  const points = [0, 3, 1, 2, 2, 0, 3].map((y, index) =>
    ({ x: [10, 21, 38, 45, 64, 83, 110][index], y, connectsToPrevious: index > 0 }));
  const curves = assertMonotoneGeometry(points);
  assert.equal(curves.length, points.length - 1);
  curves.forEach((curve, index) => {
    assert.deepEqual(curve.from, { x: points[index].x, y: points[index].y });
    assert.deepEqual(curve.to, { x: points[index + 1].x, y: points[index + 1].y });
  });
});

test('missing days and incompatible scales create independent smooth segments', () => {
  const points = [
    { x: 20, y: 0, connectsToPrevious: false },
    { x: 35, y: 2, connectsToPrevious: true },
    { x: 50, y: 1, connectsToPrevious: false }, // missing day or scale boundary
    { x: 65, y: 3, connectsToPrevious: true },
    { x: 80, y: 0, connectsToPrevious: false }, // isolated observation
  ];
  assert.equal((trendCurvePath(points, 'monotoneX').match(/M /g) ?? []).length, 2);
  assert.equal(assertMonotoneGeometry(points).length, 2);
  assert.equal(trendCurvePath([points[0]], 'monotoneX'), '');
  assert.equal(isolatedTrendFragments(points, 6), 'M 77 0 L 83 0');
  assert.equal(isolatedTrendFragments([points[0]], 6), 'M 17 0 L 23 0');
});

test('demo 7D, 30D and 90D use the configured curve within a narrow iPhone plot', () => {
  const demo = loadDemoDataset();
  const task = demo.tasks.find(item => item.id === 'workout')!;
  assert.equal(ratingTrendConfig.style.curve, 'monotoneX');
  const cardWidth = 280; // 320-point screen minus page margins and card padding
  const axis = axisColumnWidth(80, cardWidth, false, 100, 160, 8);
  const plotWidth = cardWidth - axis;
  const inset = ratingTrendConfig.presentation.plotInset;
  for (const [range, startDate, presentation] of [
    ['7D', '2026-09-16', 'daily-line'],
    ['30D', '2026-08-24', 'daily-line'],
    ['90D', '2026-06-25', 'weekly'],
  ] as const) {
    const data = getRatingTrend({ task, entries: demo.entries, versions: demo.scaleVersions,
      period: { startDate, endDate: '2026-09-22' } });
    const view = getAdaptiveTrend(data, range);
    assert.equal(view.presentation, presentation);
    assert.ok(data.observations.length > 1);
    const points = view.groupedPoints.map(point => ({
      x: inset + point.slotIndex / Math.max(1, view.slots.length - 1) * (plotWidth - inset * 2),
      y: point.medianLevelIndex, connectsToPrevious: point.connectsToPrevious,
    }));
    assert.ok(points.length <= 15);
    assert.ok(points.every(point => point.x >= inset && point.x <= plotWidth - inset));
    assert.ok(assertMonotoneGeometry(points).length > 0);
    const expandedWidth = Math.max(plotWidth, data.dates.length * 30);
    const positions = new Map(data.dates.map((date, index) => [date, index]));
    const expandedPoints = data.observations.map(point => ({
      x: inset + positions.get(point.date)! / Math.max(1, data.dates.length - 1) * (expandedWidth - inset * 2),
      y: point.levelIndex, connectsToPrevious: point.connectsToPrevious,
    }));
    assert.equal(expandedPoints.length, data.observations.length);
    assert.ok(assertMonotoneGeometry(expandedPoints).length > 0);
    assert.equal(data.observations.length, demo.entries.filter(entry =>
      entry.taskId === task.id && entry.localDate >= startDate && entry.localDate <= '2026-09-22').length);
  }
});
