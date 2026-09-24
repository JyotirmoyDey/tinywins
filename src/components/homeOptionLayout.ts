/** Rows are planned explicitly so the native flex layout never leaves a stray wrapped choice. */
export function planHomeOptionRows(labels: string[], width: number, fontScale = 1): number[][] {
  if (!labels.length) return [];
  const gap = 6;
  const estimatedWidth = (label: string) => Math.max(44, label.length * 7.2 * fontScale + 22);
  const allFit = labels.reduce((total, label) => total + estimatedWidth(label), 0) + gap * (labels.length - 1) <= width;
  if (allFit) return [labels.map((_, index) => index)];

  const longest = Math.max(...labels.map(label => label.length));
  const columns = longest * fontScale > 22 ? 2 : 3;
  const rowCount = Math.ceil(labels.length / columns);
  const base = Math.floor(labels.length / rowCount);
  const extra = labels.length % rowCount;
  let next = 0;
  return Array.from({ length: rowCount }, (_, row) => {
    const count = base + (row < extra ? 1 : 0);
    return Array.from({ length: count }, () => next++);
  });
}
