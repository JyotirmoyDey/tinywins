import { AnalyticsDataset } from './types';
import { colorsByTaskId, fallbackTaskColor } from './taskColors';
const raw = require('../assets/demo/tinywins_dummy_1year_8tasks_organic.json');
type DemoOption = { id:string; label:string; position:number; weight:number };
type DemoTask = { id:string; name:string; options: DemoOption[] };
type DemoEntry = { id:string; taskId:string; localDate:string; optionId:string; optionLabelAtEntry:string; positionAtEntry:number; weightAtEntry:number };
export function loadDemoDataset(): AnalyticsDataset {
  const data = raw as { period: { startDate: string; endDate: string };
    tasks: DemoTask[]; dailyEntries: DemoEntry[] };
  const colorMap = colorsByTaskId(data.tasks.map(task => task.id));
  const createdAt = `${data.period.startDate}T12:00:00.000Z`;
  const updatedAt = `${data.period.endDate}T12:00:00.000Z`;
  return {
    tasks: data.tasks.map(task => ({ id:task.id, name:task.name, active:true,
      createdAt, createdLocalDate:data.period.startDate, updatedAt,
      currentScaleVersionId:`demo-scale-${task.id}`, currentTrendEpochId:`demo-epoch-${task.id}`,
      color:colorMap.get(task.id)??fallbackTaskColor(task.id),
      options:task.options.map(option => ({ id:option.id, label:option.label, position:option.position,
        rank:option.position, normalizedWeight:option.weight })) })),
    entries: data.dailyEntries.map(entry => ({ ...entry, normalizedWeightAtEntry: entry.weightAtEntry, scaleVersionIdAtEntry: `demo-scale-${entry.taskId}`, trendEpochIdAtEntry: `demo-epoch-${entry.taskId}` })),
    scaleVersions: data.tasks.map(task => ({ id: `demo-scale-${task.id}`, taskId: task.id,
      trendEpochId: `demo-epoch-${task.id}`, createdAt, effectiveLocalDate: data.period.startDate,
      options: task.options.map(option => ({ id: option.id, label: option.label,
        position: option.position })) })),
    lifecycle: [],
  };
}
