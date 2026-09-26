export function heatmapCellWidth(containerWidth: number, levelCount: number,
  weekdayWidth: number, totalWidth: number, minimumWidth: number) {
  return Math.max(minimumWidth,
    Math.floor((Math.max(0, containerWidth - weekdayWidth) - totalWidth) / Math.max(1, levelCount)));
}

export function heatmapGridWidth(cellWidth: number, levelCount: number, totalWidth: number) {
  return cellWidth * levelCount + totalWidth;
}
