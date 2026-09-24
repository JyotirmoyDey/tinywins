import { localDate, parseLocalDate } from '../../domain/task';

export function monthGridDates(month: string): (string | null)[] {
  const first = parseLocalDate(month + '-01');
  const leading = (first.getDay() + 6) % 7;
  const days = new Date(first.getFullYear(), first.getMonth() + 1, 0, 12).getDate();
  const rows = Math.ceil((leading + days) / 7);
  return Array.from({ length: rows * 7 }, (_, index) =>
    index < leading || index >= leading + days ? null :
      localDate(new Date(first.getFullYear(), first.getMonth(), index - leading + 1, 12)));
}

export function calendarCellSize(width: number, gap = 4) {
  return Math.max(0, Math.floor((width - gap * 6) / 7));
}

export function monthHeading(month: string, availableWidth: number, fontScale = 1) {
  const first = parseLocalDate(month + '-01');
  const full = first.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  return full.length * 8.5 * fontScale <= availableWidth ? full :
    first.toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
}

function hexRgb(value: string) {
  const hex = value.replace('#', '');
  if (hex.length !== 6) return [215, 215, 210];
  return [0, 2, 4].map(index => parseInt(hex.slice(index, index + 2), 16));
}

/** Recorded zero gets a tinted cell; absence alone uses the neutral color. */
export function calendarFill(color: string, ratio: number | null) {
  if (ratio === null) return '#E9E9E5';
  const strength = 0.2 + Math.max(0, Math.min(1, ratio)) * 0.45;
  const rgb = hexRgb(color).map(channel => Math.round(255 * (1 - strength) + channel * strength));
  return '#' + rgb.map(channel => channel.toString(16).padStart(2, '0')).join('').toUpperCase();
}
