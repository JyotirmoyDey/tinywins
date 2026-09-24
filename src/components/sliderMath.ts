import type { DailyEntry, TaskOption } from '../domain/task';
export const SLIDER_INSET = 12;
const stops = [
  { at: 0, color: '#B8DCD2' },
  { at: 1 / 3, color: '#79BDAE' },
  { at: 2 / 3, color: '#398F80' },
  { at: 1, color: '#20695D' },
];
function clamp(value: number, low: number, high: number) { 'worklet'; return Math.max(low, Math.min(high, value)); }

/** Only option position matters; labels and historical weights never determine slider color. */
export function sliderColor(index: number, count: number): string {
  if (count < 2) throw new Error('A slider needs at least two options.');
  const ratio = clamp(index, 0, count - 1) / (count - 1);
  const right = stops.findIndex(stop => stop.at >= ratio);
  if (right <= 0) return stops[0].color;
  const from = stops[right - 1], to = stops[right];
  const fraction = (ratio - from.at) / (to.at - from.at);
  const channels = [1, 3, 5].map(offset => {
    const start = parseInt(from.color.slice(offset, offset + 2), 16);
    const end = parseInt(to.color.slice(offset, offset + 2), 16);
    return Math.round(start + (end - start) * fraction).toString(16).padStart(2, '0');
  });
  return `#${channels.join('')}`.toUpperCase();
}

export function sliderIndexFromX(x: number, width: number, count: number): number {
  'worklet';
  if (count < 2 || width <= SLIDER_INSET * 2) return 0;
  const ratio = clamp((x - SLIDER_INSET) / (width - SLIDER_INSET * 2), 0, 1);
  return Math.round(ratio * (count - 1));
}

export function sliderXForIndex(index: number, width: number, count: number): number {
  'worklet';
  if (count < 2) return SLIDER_INSET;
  return SLIDER_INSET + clamp(index, 0, count - 1) / (count - 1) * Math.max(0, width - SLIDER_INSET * 2);
}

export function sliderDisplay(options: TaskOption[], entry?: DailyEntry) {
  if (!entry) return { selectedIndex: -1, label: 'Not recorded' };
  const selectedIndex = options.findIndex(option => option.id === entry.optionId);
  return { selectedIndex, label: selectedIndex >= 0 ? options[selectedIndex].label : entry.optionLabelAtEntry };
}
