import { AnalyticsDataset } from './types';
import { analyticsColors } from './service';
const raw = require('../assets/demo/tinywins_dummy_3months.json');
type DemoOption = { id:string; label:string; position:number; weight:number };
type DemoTask = { id:string; name:string; options: DemoOption[] };
type DemoEntry = { id:string; taskId:string; localDate:string; optionId:string; optionLabelAtEntry:string; positionAtEntry:number; weightAtEntry:number };
export function loadDemoDataset(): AnalyticsDataset {
  const data = raw as { tasks: DemoTask[]; dailyEntries: DemoEntry[] };
  return {
    tasks: data.tasks.map((task,index) => ({ id:task.id, name:task.name, active:true, createdAt:'2026-06-25T12:00:00.000Z', updatedAt:'2026-09-22T12:00:00.000Z', currentScaleVersionId:`demo-scale-${task.id}`, currentTrendEpochId:`demo-epoch-${task.id}`, color:analyticsColors[index % analyticsColors.length], options:task.options.map(option => ({ id:option.id, label:option.label, position:option.position, rank:option.position, normalizedWeight:option.weight })) })),
    entries: data.dailyEntries.map(entry => ({ ...entry, normalizedWeightAtEntry: entry.weightAtEntry, scaleVersionIdAtEntry: `demo-scale-${entry.taskId}`, trendEpochIdAtEntry: `demo-epoch-${entry.taskId}` })),
    scaleVersions: data.tasks.map(task => ({ id: `demo-scale-${task.id}`, taskId: task.id, trendEpochId: `demo-epoch-${task.id}`, createdAt: '2026-06-25T12:00:00.000Z', effectiveLocalDate: '2026-06-25', options: task.options.map(option => ({ id: option.id, label: option.label, position: option.position })) })),
  };
}
