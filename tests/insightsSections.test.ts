import test from 'node:test';
import assert from 'node:assert/strict';
import trend from '../src/analytics/config/rating-trend.json';
import distribution from '../src/analytics/config/rating-distribution.json';
import calendar from '../src/analytics/config/activity-calendar.json';
import comparison from '../src/analytics/config/period-comparison.json';
import recording from '../src/analytics/config/recording-consistency-individual.json';
import weekday from '../src/analytics/config/weekday-patterns.json';
import combinedConsistency from '../src/analytics/config/recording-consistency.json';
import combinedCalendar from '../src/analytics/config/combined-calendar.json';
import weeklyRecording from '../src/analytics/config/weekly-recording-patterns.json';
import { organizeIndividualCharts } from '../src/components/analytics/insightsSections';

test('Your Journey retains its three charts in order and starts expanded', () => {
  const sections = organizeIndividualCharts([calendar, distribution, trend].map(config => ({
    id: config.id, section: config.section, order: config.displayOrder,
    visible: config.visible, content: config.title,
  })));
  assert.equal(sections.length, 1);
  assert.equal(sections[0].title, 'Your Journey');
  assert.equal(sections[0].initiallyExpanded, true);
  assert.deepEqual(sections[0].charts.map(chart => chart.id),
    ['rating-trend', 'rating-distribution', 'activity-calendar']);
});

test('empty future sections stay hidden until a visible chart is configured', () => {
  const sections = organizeIndividualCharts([
    { id: 'hidden-pattern', section: 'patterns', order: 1, visible: false, content: 'hidden' },
    { id: 'future-pattern', section: 'patterns', order: 2, visible: true, content: 'future' },
    { id: 'future-reflection', section: 'reflections', order: 1, visible: true, content: 'reflection' },
  ]);
  assert.deepEqual(sections.map(section => section.title), ['Discover Your Patterns', 'Your Story So Far']);
  assert.ok(sections.every(section => !section.initiallyExpanded));
  assert.deepEqual(sections[0].charts.map(chart => chart.id), ['future-pattern']);
});

test('Discover Your Patterns keeps comparison, consistency and weekday order', () => {
  const sections = organizeIndividualCharts([weekday, recording, trend, comparison].map(config => ({
    id: config.id, section: config.section, order: config.displayOrder,
    visible: config.visible, content: config.title,
  })));
  assert.deepEqual(sections.map(section => section.title), ['Your Journey', 'Discover Your Patterns']);
  assert.equal(sections[1].initiallyExpanded, false);
  assert.deepEqual(sections[1].charts.map(chart => chart.id),
    ['period-comparison', 'recording-consistency-individual', 'weekday-patterns']);
});

test('all six chart names and subtitles change without changing their identifiers or placement', () => {
  const charts = [trend, distribution, calendar, comparison, recording, weekday];
  assert.deepEqual(charts.map(chart => [chart.id, chart.title, chart.subtitle]), [
    ['rating-trend', "How It's Going", 'See how your ratings change over time.'],
    ['rating-distribution', 'Your Rating Mix', 'Discover which levels you record most often.'],
    ['activity-calendar', 'Your Days', 'Look back at your daily journey.'],
    ['period-comparison', 'Then & Now', 'See how this period compares with the last.'],
    ['recording-consistency-individual', 'Check-in Rhythm', 'Explore how regularly you record your activity.'],
    ['weekday-patterns', 'Your Weekly Rhythm', 'Discover how your ratings vary throughout the week.'],
  ]);
  const sections = organizeIndividualCharts(charts.map(chart => ({ id: chart.id,
    section: chart.section, order: chart.displayOrder, visible: chart.visible,
    content: chart.title })));
  assert.equal(sections.length, 2);
  assert.deepEqual(sections.map(section => section.charts.map(chart => chart.id)), [
    ['rating-trend', 'rating-distribution', 'activity-calendar'],
    ['period-comparison', 'recording-consistency-individual', 'weekday-patterns'],
  ]);
});

test('All Activities labels describe recording rather than rating performance', () => {
  assert.equal(combinedConsistency.title, 'Check-in Rhythm');
  assert.equal(combinedCalendar.title, 'Your Days');
  assert.equal(weeklyRecording.title, 'Your Weekly Check-ins');
});

test('a visible chart cannot silently disappear because of an invalid section ID', () => {
  assert.throws(() => organizeIndividualCharts([
    { id: 'future', section: 'unknown', order: 1, visible: true, content: null },
  ]), /Unknown Insights section/);
});
