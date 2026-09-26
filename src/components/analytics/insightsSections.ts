export const individualInsightSections = [
  { id: 'everyday', title: 'Your Journey', initiallyExpanded: true },
  { id: 'patterns', title: 'Discover Your Patterns', initiallyExpanded: false },
  { id: 'reflections', title: 'Your Story So Far', initiallyExpanded: false },
] as const;

export type IndividualInsightSectionId = typeof individualInsightSections[number]['id'];

export type SectionChart<T> = {
  id: string;
  section: string;
  order: number;
  visible: boolean;
  content: T;
};

export function organizeIndividualCharts<T>(charts: SectionChart<T>[]) {
  for (const chart of charts) {
    if (chart.visible && !individualInsightSections.some(section => section.id === chart.section)) {
      throw new Error(`Unknown Insights section for ${chart.id}: ${chart.section}`);
    }
  }
  return individualInsightSections.map(section => ({
    ...section,
    charts: charts.filter(chart => chart.visible && chart.section === section.id)
      .sort((a, b) => a.order - b.order),
  })).filter(section => section.charts.length > 0);
}
