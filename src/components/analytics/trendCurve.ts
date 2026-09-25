export type TrendCurve = 'monotoneX' | 'linear';
export interface TrendCurvePoint {
  x: number;
  y: number;
  connectsToPrevious: boolean;
}

/** Split at missing dates, scale boundaries, and non-increasing X coordinates. */
export function connectedTrendSegments<T extends TrendCurvePoint>(points: T[]): T[][] {
  const segments: T[][] = [];
  let current: T[] = [];
  for (const point of points) {
    const previous = current.at(-1);
    if (!previous || !point.connectsToPrevious || point.x <= previous.x) {
      if (current.length > 1) segments.push(current);
      current = [point];
    } else current.push(point);
  }
  if (current.length > 1) segments.push(current);
  return segments;
}

function sign(value: number) { return value < 0 ? -1 : value > 0 ? 1 : 0; }
function endpointSlope(first: number, second: number, firstWidth: number, secondWidth: number) {
  let slope = ((2 * firstWidth + secondWidth) * first - firstWidth * second) /
    (firstWidth + secondWidth);
  if (sign(slope) !== sign(first)) slope = 0;
  else if (sign(first) !== sign(second) && Math.abs(slope) > 3 * Math.abs(first))
    slope = 3 * first;
  return slope;
}
function monotoneSlopes(points: TrendCurvePoint[]) {
  const widths = points.slice(1).map((point, index) => point.x - points[index].x);
  const secants = widths.map((width, index) => (points[index + 1].y - points[index].y) / width);
  if (points.length === 2) return [secants[0], secants[0]];
  return points.map((_, index) => {
    if (index === 0) return endpointSlope(secants[0], secants[1], widths[0], widths[1]);
    if (index === points.length - 1) return endpointSlope(
      secants.at(-1)!, secants.at(-2)!, widths.at(-1)!, widths.at(-2)!);
    const before = secants[index - 1], after = secants[index];
    if (before === 0 || after === 0 || sign(before) !== sign(after)) return 0;
    const left = widths[index - 1], right = widths[index];
    const firstWeight = 2 * right + left, secondWeight = right + 2 * left;
    return (firstWeight + secondWeight) / (firstWeight / before + secondWeight / after);
  });
}

/** Piecewise monotone cubic Hermite path. Each cubic passes through both actual
 * observations. Clamping its control points to their endpoint ratings keeps
 * the entire Bézier segment inside those rating levels. */
export function trendCurvePath(points: TrendCurvePoint[], curve: TrendCurve): string {
  return connectedTrendSegments(points).map(segment => {
    let path = `M ${segment[0].x} ${segment[0].y}`;
    const slopes = curve === 'monotoneX' ? monotoneSlopes(segment) : [];
    for (let index = 0; index < segment.length - 1; index++) {
      const from = segment[index], to = segment[index + 1];
      if (curve === 'linear') { path += ` L ${to.x} ${to.y}`; continue; }
      const third = (to.x - from.x) / 3;
      const low = Math.min(from.y, to.y), high = Math.max(from.y, to.y);
      const clamp = (value: number) => Math.max(low, Math.min(high, value));
      const control1 = clamp(from.y + slopes[index] * third);
      const control2 = clamp(to.y - slopes[index + 1] * third);
      path += ` C ${from.x + third} ${control1} ${to.x - third} ${control2} ${to.x} ${to.y}`;
    }
    return path;
  }).join(' ');
}

/** A disconnected observation has no curve on either side. Show it as a short
 * line fragment so removing circular markers does not erase recorded data. */
export function isolatedTrendFragments(points: TrendCurvePoint[], length: number): string {
  const half = length / 2;
  return points.flatMap((point, index) => {
    const previous = points[index - 1], next = points[index + 1];
    const linkedBefore = !!previous && point.connectsToPrevious && point.x > previous.x;
    const linkedAfter = !!next && next.connectsToPrevious && next.x > point.x;
    return linkedBefore || linkedAfter ? [] : [`M ${point.x - half} ${point.y} L ${point.x + half} ${point.y}`];
  }).join(' ');
}
