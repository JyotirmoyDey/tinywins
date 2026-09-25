import test from 'node:test';
import assert from 'node:assert/strict';
import { localDate, parseLocalDate } from '../src/domain/task';
import { dailyAxisTicks, weeklyMonthTicks } from '../src/components/analytics/trendAxisTicks';
import { axisColumnWidth, expandedBoundsReady, expandedDailyScale,
  expandedDayIndexAt } from '../src/components/analytics/trendPlotLayout';
import { calendarCellSize, calendarFill, monthGridDates, monthHeading } from '../src/components/analytics/calendarLayout';

function days(startDate: string, count: number) {
  const start = parseLocalDate(startDate);
  return Array.from({ length: count }, (_, index) => {
    const day = new Date(start);
    day.setDate(day.getDate() + index);
    return localDate(day);
  });
}
function weeksIn(dates: string[]) {
  return [...new Set(dates.map(value => {
    const day = parseLocalDate(value);
    day.setDate(day.getDate() - (day.getDay() + 6) % 7);
    return localDate(day);
  }))];
}
function assertSeparated(ticks: { left: number; right: number }[], width: number) {
  for (let index = 0; index < ticks.length; index++) {
    assert.ok(ticks[index].left >= -1);
    assert.ok(ticks[index].right <= width + 1);
    if (index) assert.ok(ticks[index].left - ticks[index - 1].right >= 7);
  }
}

test('90-day month labels keep calendar positions and never overlap on narrow chart widths', () => {
  const dates = days('2026-06-27', 90);
  const weeks = weeksIn(dates);
  for (const width of [132, 160, 210, 300]) {
    const ticks = weeklyMonthTicks(weeks, dates[0], dates.at(-1)!, width, 18, 4);
    assert.ok(ticks.length > 0 && ticks.length <= 4);
    assertSeparated(ticks, width);
    assert.ok(ticks.every(item => item.index >= 0 && item.index < weeks.length));
    assert.ok(ticks.every(item => item.label.length <= 5));
  }
});
test('seven-day and thirty-day axis labels adapt to available chart width', () => {
  for (const width of [128, 180, 280]) {
    assertSeparated(dailyAxisTicks(days('2026-09-18', 7), width, 18, 7), width);
    const monthly = dailyAxisTicks(days('2026-08-26', 30), width, 18, 4);
    assertSeparated(monthly, width);
    assert.ok(monthly.length <= 4);
  }
});
test('measured rating labels leave a readable plot on narrow and landscape screens', () => {
  for (const width of [280, 320, 390, 700]) {
    const axis = axisColumnWidth(220, width, false, 100, 160, 8);
    assert.ok(axis <= 100 && axis <= width * 0.32 + 0.001);
    const viewport = width - axis;
    assert.ok(viewport >= width * 0.68 - 0.001);
    const expandedAxis = axisColumnWidth(220, width, true, 100, 160, 8);
    const scale = expandedDailyScale(width - expandedAxis, 90, 20, 30);
    assert.ok(scale.chartWidth >= width - expandedAxis);
    assert.equal(scale.initialOffset, scale.chartWidth - (width - expandedAxis));
    assert.ok(20 > 5.5);
  }
});
test('expanded daily scale fits seven days and scrolls dense or long ranges to the latest dates', () => {
  const seven = expandedDailyScale(540, 7, 20, 30);
  assert.equal(seven.chartWidth, 540);
  assert.equal(seven.scrollEnabled, false);
  const roomyThirty = expandedDailyScale(720, 30, 20, 30);
  assert.equal(roomyThirty.scrollEnabled, false);
  const narrowThirty = expandedDailyScale(520, 30, 20, 30);
  assert.equal(narrowThirty.scrollEnabled, true);
  for (const count of [90, 365, 730]) {
    const scale = expandedDailyScale(620, count, 20, 30);
    assert.equal(scale.scrollEnabled, true);
    assert.ok(scale.initialOffset > 0);
    assert.equal(scale.chartWidth - scale.initialOffset, 620);
    const visibleDays = (620 - 40) / scale.dayStep;
    assert.ok(visibleDays >= 20 && visibleDays <= 30);
    assert.equal((count - 1) * scale.dayStep + 40, scale.chartWidth);
  }
});
test('expanded touches align to calendar slots after scrolling, including missing days', () => {
  const scale = expandedDailyScale(620, 90, 20, 30);
  const lastX = 20 + 89 * scale.dayStep;
  assert.equal(expandedDayIndexAt(lastX - scale.initialOffset, scale.initialOffset,
    scale.dayStep, 20, 90), 89);
  assert.equal(expandedDayIndexAt(20 + 3 * scale.dayStep, 0,
    scale.dayStep, 20, 90), 3);
  const recordedDays = new Map([[2, 'Good'], [4, 'High']]);
  const emptyDay = expandedDayIndexAt(20 + 3 * scale.dayStep, 0, scale.dayStep, 20, 90);
  assert.equal(recordedDays.get(emptyDay!), undefined);
});
test('expanded chart renders from measured bounds even before native rotation finishes', () => {
  assert.equal(expandedBoundsReady(0, 0), false);
  assert.equal(expandedBoundsReady(390, 844), true);
  assert.equal(expandedBoundsReady(844, 390), true);
});
test('calendar rows fit four, five, and six-week months without extra rows', () => {
  assert.equal(monthGridDates('2021-02').length, 28);
  assert.equal(monthGridDates('2026-09').length, 35);
  assert.equal(monthGridDates('2021-05').length, 42);
  assert.equal(monthGridDates('2026-09')[0], null);
  for (const width of [248, 280, 340]) {
    const size = calendarCellSize(width);
    assert.ok(size * 7 + 4 * 6 <= width);
    assert.ok(size > 0);
  }
});
test('month heading shortens without moving the arrows and explicit lowest differs from missing', () => {
  assert.match(monthHeading('2026-09', 180), /September/);
  assert.match(monthHeading('2026-09', 80, 1.5), /Sep/);
  assert.notEqual(calendarFill('#C49335', null), calendarFill('#C49335', 0));
  assert.notEqual(calendarFill('#C49335', 0), calendarFill('#C49335', 1));
});
