import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTasks } from '../../state/TasksProvider';
import { useAnalyticsData } from '../../analytics/useAnalyticsData';
import { useDevInsightsSource } from '../../analytics/devDataSource';
import {  getRecordingConsistency, getWeekdayRecordingPattern } from '../../analytics/service';
import { getRatingDistribution, getRatingScaleVersions, ratingDistributionConfig, RatingDistributionTimeline } from '../../analytics/ratingDistribution';
import { AnalyticsEntry } from '../../analytics/types';
import { AnalyticsCard, BarChart, Placeholder } from '../../components/analytics/Charts';
import { ActivitySelector } from '../../components/analytics/ActivitySelector';
import { InsightsActivityMenu } from '../../components/analytics/InsightsActivityMenu';
import { InsightsDateMenu } from '../../components/analytics/InsightsDateMenu';
import { NativeDateRangePicker } from '../../components/analytics/NativeDateRangePicker';
import { CustomRange, earliestAvailableDate, getInsightsPeriod, validateCustomRange } from '../../analytics/insightsDateRange';
import { MonthCalendar } from '../../components/analytics/MonthCalendar';
import { individualCalendarData } from '../../components/analytics/individualCalendar';
import { RatingTrendChart } from '../../components/analytics/RatingTrendChart';
import { InsightsAccordion } from '../../components/analytics/InsightsAccordion';
import { organizeIndividualCharts } from '../../components/analytics/insightsSections';
import { PeriodComparisonChart } from '../../components/analytics/PeriodComparisonChart';
import { getPeriodComparison, periodComparisonConfig } from '../../analytics/periodComparison';
import { getIndividualRecordingConsistency, individualRecordingConsistencyConfig } from '../../analytics/recordingConsistency';
import { RecordingConsistencyChart } from '../../components/analytics/RecordingConsistencyChart';
import { getWeekdayPatterns, weekdayPatternsConfig } from '../../analytics/weekdayPatterns';
import { WeekdayPatternsChart } from '../../components/analytics/WeekdayPatternsChart';
import combinedConsistencyConfig from '../../analytics/config/recording-consistency.json';
import combinedCalendarConfig from '../../analytics/config/combined-calendar.json';
import weeklyRecordingConfig from '../../analytics/config/weekly-recording-patterns.json';
import activityCalendarConfig from '../../analytics/config/activity-calendar.json';
import { getRatingTrend, ratingTrendConfig } from '../../analytics/ratingTrend';
import { getAdaptiveTrend } from '../../analytics/ratingTrendPresentation';
import { getJourneyTogether, journeyTogetherConfig } from '../../analytics/journeyTogether';
import { JourneyTogetherChart } from '../../components/analytics/JourneyTogetherChart';
import { Button } from '../../components/ui';
import { colors as c, spacing as s, typography as t } from '../../theme';
import { localDate, parseLocalDate, TaskLifecycleTransition } from '../../domain/task';
import { createTaskDayEligibility } from '../../domain/taskLifecycle';
import { archivedInsightsTask, insightsSourceForEntry, selectedInsightsTask } from '../../analytics/insightsScope';

function monthPeriod(month:string){ const start=parseLocalDate(`${month}-01`); const end=new Date(start.getFullYear(),start.getMonth()+1,0,12); return {startDate:`${month}-01`,endDate:localDate(end)}; }
function allMonthCells(tasks:{id:string;name:string;createdAt:string;createdLocalDate?:string|null;archivedAt?:string|null;active:boolean}[],entries:AnalyticsEntry[],transitions:TaskLifecycleTransition[],month:string,today:string){ const period=monthPeriod(month); const days=Number(period.endDate.slice(-2)); const checks=tasks.map(task=>({task,eligibility:createTaskDayEligibility(task,transitions,entries.filter(entry=>entry.taskId===task.id).map(entry=>entry.localDate),today)})); return Array.from({length:days},(_,i)=>{const date=`${month}-${String(i+1).padStart(2,'0')}`;const eligibleTasks=checks.filter(item=>item.eligibility.eligible(date)).map(item=>item.task);const eligible=eligibleTasks.length;const recordedIds=new Set(entries.filter(entry=>entry.localDate===date).map(entry=>entry.taskId));const recordedNames=eligibleTasks.filter(task=>recordedIds.has(task.id)).map(task=>task.name);const missingNames=eligibleTasks.filter(task=>!recordedIds.has(task.id)).map(task=>task.name);const recorded=recordedNames.length;return {date,ratio:eligible?recorded/eligible:0,recorded,eligible,detail:`Recorded: ${recordedNames.join(', ')||'none'} · Missing: ${missingNames.join(', ')||'none'}`,color:'#2A9D8F'};}); }

export default function Insights(){
  const params=useLocalSearchParams<{task?:string;mode?:string}>(); const router=useRouter(); const {today,data:taskState}=useTasks();
  const preferredSource=useDevInsightsSource();
  const archivedMode=params.mode==='archivedTask';
  const source=insightsSourceForEntry(preferredSource,params.mode);
  const selectedId=params.task||'all';
  const [timeline,setTimeline]=useState<RatingDistributionTimeline>('1D');
  const [custom,setCustom]=useState<CustomRange>({startDate:today,endDate:today});
  const [customOpen,setCustomOpen]=useState(false);
  const openingExpanded=useRef(false);
  useFocusEffect(useCallback(() => { openingExpanded.current=false; }, []));
  const [month,setMonth]=useState(today.slice(0,7)); const [scaleVersion,setScaleVersion]=useState('current');
  const {dataset,loading}=useAnalyticsData(source==='demo');
  const tasks=useMemo(()=>dataset.tasks.slice().sort((a,b)=>a.name.localeCompare(b.name)),[dataset.tasks]);
  const activeTasks=useMemo(()=>tasks.filter(task=>task.active),[tasks]);
  const archivedTask=archivedInsightsTask(tasks,selectedId,params.mode);
  const regularTask=selectedInsightsTask(activeTasks,selectedId);
  const selectedTask=archivedMode?archivedTask:regularTask;
  const isAll=!archivedMode&&!regularTask;
  const regularDataset=useMemo(()=>({...dataset,tasks:activeTasks}),[dataset,activeTasks]);
  const earliest=useMemo(()=>earliestAvailableDate(archivedMode?tasks:activeTasks,dataset.entries,today,isAll?undefined:selectedTask?.id),
    [archivedMode,tasks,activeTasks,dataset.entries,today,isAll,selectedTask?.id]);
  const customBoundaryIssue=timeline==='CUSTOM'?
    (earliest ? validateCustomRange(custom,today,earliest) :
      custom.startDate!==today || custom.endDate!==today ? 'No dates are available yet.' : null):null;
  const period=useMemo(()=>getInsightsPeriod(today,timeline,custom),[today,timeline,custom]);
  const allTasks=activeTasks;
  const journey=useMemo(()=>isAll?getJourneyTogether({dataset:regularDataset,period,
    colorTaskIds:source==='demo'?dataset.tasks.map(task=>task.id):[
      ...taskState.tasks.map(task=>task.id),...dataset.tasks.map(task=>task.id)]}):null,
    [isAll,regularDataset,dataset.tasks,period,source,taskState.tasks]);
  const consistency=useMemo(()=>getRecordingConsistency(allTasks,dataset.entries,period,dataset.lifecycle,today),[allTasks,dataset.entries,dataset.lifecycle,period,today]);
  const weekdays=useMemo(()=>getWeekdayRecordingPattern(activeTasks,dataset.entries,period),[activeTasks,dataset.entries,period]);
  const trend=useMemo(()=>selectedTask?getRatingTrend({task:selectedTask,entries:dataset.entries,versions:dataset.scaleVersions,period}):null,[selectedTask,dataset.entries,dataset.scaleVersions,period]);
  const trendView=useMemo(()=>trend?getAdaptiveTrend(trend,timeline):null,[trend,timeline]);
  const scaleVersions=useMemo(()=>selectedTask?getRatingScaleVersions(selectedTask,dataset.entries,dataset.scaleVersions):[],[selectedTask,dataset.entries,dataset.scaleVersions]);
  const activeScaleVersion=scaleVersions.includes(scaleVersion)?scaleVersion:'current';
  const distribution=useMemo(()=>selectedTask?getRatingDistribution(selectedTask,dataset.entries,period,activeScaleVersion,dataset.scaleVersions):[],[selectedTask,dataset.entries,period,activeScaleVersion,dataset.scaleVersions]);
  const comparison=useMemo(()=>selectedTask?getPeriodComparison({task:selectedTask,
    entries:dataset.entries,versions:dataset.scaleVersions,period}):null,
    [selectedTask,dataset.entries,dataset.scaleVersions,period]);
  const recording=useMemo(()=>selectedTask?getIndividualRecordingConsistency({task:selectedTask,
    entries:dataset.entries,lifecycle:dataset.lifecycle,period,today,timeline}):null,
    [selectedTask,dataset.entries,dataset.lifecycle,period,today,timeline]);
  const weekdayPatterns=useMemo(()=>selectedTask?getWeekdayPatterns({task:selectedTask,
    entries:dataset.entries,versions:dataset.scaleVersions,period,timeline}):null,
    [selectedTask,dataset.entries,dataset.scaleVersions,period,timeline]);
  const individualCalendar=useMemo(()=>selectedTask&&!isAll?
    individualCalendarData(selectedTask,dataset.entries,dataset.scaleVersions,month):null,
    [selectedTask,isAll,dataset.entries,dataset.scaleVersions,month]);
  const calendarCells=useMemo(()=>isAll?allMonthCells(activeTasks,dataset.entries,dataset.lifecycle??[],month,today):individualCalendar?.cells||[],
    [isAll,activeTasks,dataset.entries,dataset.lifecycle,month,today,individualCalendar]);
  const totalRecorded=distribution.reduce((sum,row)=>sum+row.count,0);
  const individualCharts=selectedTask?[
    {id:ratingTrendConfig.id,section:ratingTrendConfig.section,
      order:ratingTrendConfig.displayOrder,visible:ratingTrendConfig.visible,
      content:<AnalyticsCard key={ratingTrendConfig.id} title={ratingTrendConfig.title}
        description={ratingTrendConfig.subtitle}
        contextLabel={trendView?.subtitle && trendView.subtitle !== 'Daily trend'
          ? trendView.subtitle : undefined}
        detail={trendView?.subtitle.includes('median')
          ? 'Each point shows the middle recorded rating for its interval, using your own rating order. Missing dates are excluded; gaps and scale changes break the line.'
          : 'Missing dates remain gaps. Changes to your rating scale do not rewrite recorded ratings.'}
        headerAction={<Pressable accessibilityRole="button" accessibilityLabel={`Expand ${ratingTrendConfig.title} chart`}
          onPress={()=>{
            if(openingExpanded.current)return;
            openingExpanded.current=true;
            router.push({pathname:'/trend-expanded',params:{task:selectedTask.id,source,
              start:period.startDate,end:period.endDate,timeline}});
          }} style={styles.expandButton}>
          <Svg width={19} height={19} viewBox="0 0 24 24"><Path d="M9 4H4v5m11 11h5v-5M4 4l6 6m10 10-6-6"
            fill="none" stroke={c.textSecondary} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round"/></Svg>
        </Pressable>}>
        {trend&&trendView&&<RatingTrendChart key={`${source}-${selectedTask.id}-${period.startDate}-${period.endDate}`}
          data={trend} view={trendView} taskName={selectedTask.name}/>}</AnalyticsCard>},
    {id:ratingDistributionConfig.id,section:ratingDistributionConfig.section,
      order:ratingDistributionConfig.displayOrder,visible:ratingDistributionConfig.visible,
      content:<AnalyticsCard key={ratingDistributionConfig.id} title={ratingDistributionConfig.title} description={ratingDistributionConfig.subtitle}>{scaleVersions.length>1&&<View style={styles.scaleSelector}>{scaleVersions.map(version=><Button key={version} label={version==='current'?'Current scale':`Previous scale ${scaleVersions.indexOf(version)}`} onPress={()=>setScaleVersion(version)} subtle={activeScaleVersion!==version}/>)}</View>}{timeline==='1D'?(totalRecorded?<View style={styles.todayRating}><Text style={styles.todayLabel}>Today</Text><Text style={styles.todayValue}>{distribution.find(row=>row.count>0)?.label||'Recorded'}</Text></View>:<Placeholder>No entries for this period.</Placeholder>):totalRecorded===0?<Placeholder>No entries for this period.</Placeholder>:<><Text style={styles.summary}>{totalRecorded} recorded entries</Text><BarChart items={distribution.map(row=>({label:row.label,value:row.count/totalRecorded*100,count:row.count,percentage:row.percentage}))} color={ratingDistributionConfig.style.color}/></>}</AnalyticsCard>},
    {id:activityCalendarConfig.id,section:activityCalendarConfig.section,
      order:activityCalendarConfig.displayOrder,visible:activityCalendarConfig.visible,
      content:<AnalyticsCard key={activityCalendarConfig.id} title={activityCalendarConfig.title}
        description={activityCalendarConfig.subtitle}><MonthCalendar
        key={`${source}-${selectedTask.id}`} month={month} onMonthChange={setMonth} cells={calendarCells}
        levels={individualCalendar?.levels} color={selectedTask.color} kind="individual"/></AnalyticsCard>},
    {id:periodComparisonConfig.id,section:periodComparisonConfig.section,
      order:periodComparisonConfig.displayOrder,visible:periodComparisonConfig.visible,
      content:<AnalyticsCard key={periodComparisonConfig.id} title={periodComparisonConfig.title}
        description={periodComparisonConfig.subtitle}>
        {comparison && <PeriodComparisonChart key={`${source}-${selectedTask.id}`} data={comparison} />}
      </AnalyticsCard>},
    {id:individualRecordingConsistencyConfig.id,section:individualRecordingConsistencyConfig.section,
      order:individualRecordingConsistencyConfig.displayOrder,
      visible:individualRecordingConsistencyConfig.visible,
      content:<AnalyticsCard key={individualRecordingConsistencyConfig.id}
        title={individualRecordingConsistencyConfig.title}
        description={individualRecordingConsistencyConfig.subtitle}>
        {recording && <RecordingConsistencyChart key={`${source}-${selectedTask.id}`} data={recording} />}
      </AnalyticsCard>},
    {id:weekdayPatternsConfig.id,section:weekdayPatternsConfig.section,
      order:weekdayPatternsConfig.displayOrder,visible:weekdayPatternsConfig.visible,
      content:<AnalyticsCard key={weekdayPatternsConfig.id} title={weekdayPatternsConfig.title}
        description={weekdayPatternsConfig.subtitle}>
        {weekdayPatterns && <WeekdayPatternsChart key={`${source}-${selectedTask.id}`} data={weekdayPatterns} />}
      </AnalyticsCard>},
  ]:[];
  const individualSections=organizeIndividualCharts(individualCharts);
  const pageRef=useRef<ScrollView>(null); const headerHeight=useRef(58);
  const [collapsed,setCollapsed]=useState(false); const [collapsedOpacity]=useState(()=>new Animated.Value(0));
  const toolbarCollapsed=collapsed&&!archivedMode;
  const expandedOpacity=collapsedOpacity.interpolate({inputRange:[0,1],outputRange:[1,0]});
  useEffect(()=>{Animated.timing(collapsedOpacity,{toValue:toolbarCollapsed?1:0,duration:140,useNativeDriver:true}).start();},[toolbarCollapsed,collapsedOpacity]);
  const selectActivity=(id:string)=>{
    if(archivedMode)return;
    if(id===(isAll?'all':selectedId))return;
    if((id==='all')!==isAll){pageRef.current?.scrollTo({y:0,animated:false});setCollapsed(false);}
    setScaleVersion('current');router.setParams({task:id,mode:'normal'});
  };
  const dateMenu=()=> <InsightsDateMenu value={timeline} custom={custom} onPreset={setTimeline} onCustom={()=>setCustomOpen(true)}/>;
  return <SafeAreaView style={styles.screen} edges={['top']}>
    <ScrollView ref={pageRef} stickyHeaderIndices={archivedMode?[]:[1]} scrollEventThrottle={16} onScroll={event=>{
      if(archivedMode)return;
      const next=event.nativeEvent.contentOffset.y>=headerHeight.current-6;
      if(next!==collapsed)setCollapsed(next);
    }} contentContainerStyle={styles.page}>
      <View style={styles.header} onLayout={event=>{headerHeight.current=event.nativeEvent.layout.height;}}>
        {archivedMode?<View style={styles.archivedHeader}>
          <Pressable accessibilityRole="button" accessibilityLabel="Back to Archived"
            onPress={()=>router.canGoBack()?router.back():router.navigate('/archived')}
            style={styles.archivedBack}><Text style={styles.archivedBackText}>‹ Archived</Text></Pressable>
          <View style={styles.archivedTitleRow}>
            <Text style={styles.archivedTitle} numberOfLines={2}>{selectedTask?.name||'Not available'}</Text>
            {selectedTask&&<Text style={styles.archivedBadge}>Archived</Text>}
          </View>
        </View>:<Text style={styles.title}>Insights</Text>}
        <View importantForAccessibility={toolbarCollapsed?'no-hide-descendants':'auto'}>{dateMenu()}</View>
      </View>
      {!archivedMode&&<View style={styles.toolbar}>
        <Animated.View pointerEvents={collapsed?'none':'auto'}
          importantForAccessibility={collapsed?'no-hide-descendants':'auto'}
          style={[styles.expandedToolbar,{opacity:expandedOpacity}]}>
          <ActivitySelector tasks={activeTasks} selectedId={isAll?'all':selectedId} onSelect={selectActivity}/>
        </Animated.View>
        <Animated.View pointerEvents={collapsed?'auto':'none'}
          importantForAccessibility={collapsed?'auto':'no-hide-descendants'}
          style={[styles.compactToolbar,{opacity:collapsedOpacity}]}>
          <InsightsActivityMenu tasks={activeTasks} selectedId={isAll?'all':selectedId} onSelect={selectActivity}/>
          <View style={styles.toolbarDate}>{dateMenu()}</View>
        </Animated.View>
      </View>}
      <View style={styles.charts}>
        {customBoundaryIssue&&<View style={styles.rangeNotice}>
          <Text style={styles.rangeNoticeText}>{customBoundaryIssue} Choose another range.</Text>
          <Pressable accessibilityRole="button" onPress={()=>setCustomOpen(true)} style={styles.rangeNoticeAction}>
            <Text style={styles.rangeNoticeLink}>Adjust range</Text>
          </Pressable>
        </View>}
        {loading?<Placeholder>Loading your insights…</Placeholder>:archivedMode&&!selectedTask?<Placeholder>This archived item is no longer available. Return to Archived.</Placeholder>:isAll?<>
          <AnalyticsCard title={journeyTogetherConfig.title} description={journeyTogetherConfig.subtitle}
            detail="Each thing you track keeps its own rating scale. The lines share calendar dates, but ratings are never combined into one score.">
            {journey&&<JourneyTogetherChart data={journey} onSelectTask={selectActivity}/>}
          </AnalyticsCard>
          <AnalyticsCard title={combinedConsistencyConfig.title} description={combinedConsistencyConfig.subtitle}
            detail="An explicitly recorded lowest rating counts as a check-in. A day without an entry does not.">{consistency.recordedDays?<><Text style={styles.summary}>{consistency.recordedDays} recorded · {consistency.eligibleDays} available check-ins</Text><BarChart items={consistency.rows.filter(row=>row.eligibleDays>0).map(row=>({label:row.name,value:row.coverage*100,count:`${row.recordedDays}/${row.eligibleDays}`}))} color="#2A9D8F"/></>:<Placeholder>No entries for this period.</Placeholder>}</AnalyticsCard>
          <AnalyticsCard title={combinedCalendarConfig.title} description={combinedCalendarConfig.subtitle}
            detail="Calendar shades show recording coverage, not the ratings chosen for different things you track."><MonthCalendar month={month} onMonthChange={setMonth} cells={calendarCells} color="#2A9D8F" kind="coverage"/></AnalyticsCard>
          <AnalyticsCard title={weeklyRecordingConfig.title} description={weeklyRecordingConfig.subtitle}>{weekdays.some(row=>row.recorded>0)?<BarChart items={weekdays.map(row=>({label:row.label,value:row.recorded,count:row.observations}))} color="#2A9D8F"/>:<Placeholder>No entries for this period.</Placeholder>}</AnalyticsCard>
        </>:<>{individualSections.map(section=><InsightsAccordion key={section.id}
          title={section.title} initiallyExpanded={section.initiallyExpanded}>
          {section.charts.map(chart=>chart.content)}
        </InsightsAccordion>)}</>}
      </View>
    </ScrollView>
    {customOpen&&<NativeDateRangePicker applied={custom} today={today} earliest={earliest}
      onCancel={()=>setCustomOpen(false)} onApply={range=>{setCustom(range);setTimeline('CUSTOM');setCustomOpen(false);}}/>}
  </SafeAreaView>;
}
const styles=StyleSheet.create({
  screen:{flex:1,backgroundColor:c.background},page:{paddingBottom:s.xxl},
  header:{minHeight:52,paddingHorizontal:s.xl,paddingTop:s.xs,paddingBottom:s.xs,
    flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:s.sm,backgroundColor:c.background},
  title:{fontSize:27,lineHeight:32,fontWeight:'700',letterSpacing:-0.6,color:c.textPrimary,flexShrink:1},
  toolbar:{height:52,backgroundColor:c.surface,borderBottomWidth:1,borderColor:c.border},
  expandedToolbar:{position:'absolute',top:0,right:0,bottom:0,left:0,flexDirection:'row'},
  compactToolbar:{position:'absolute',top:0,right:0,bottom:0,left:0,flexDirection:'row',alignItems:'center',
    paddingLeft:s.sm,paddingRight:s.md},
  toolbarDate:{flexShrink:0,alignItems:'flex-end'},
  charts:{paddingHorizontal:s.xl,paddingTop:s.xs,gap:s.md},
  scaleSelector:{flexDirection:'row',gap:s.sm,flexWrap:'wrap',marginBottom:s.sm},
  summary:{...t.secondary,color:c.textSecondary},todayRating:{backgroundColor:c.surfaceSecondary,borderRadius:12,padding:s.lg,gap:s.xs},todayLabel:{...t.caption,color:c.textSecondary},todayValue:{...t.sectionTitle,color:c.textPrimary},
  expandButton:{minWidth:44,minHeight:44,alignItems:'center',justifyContent:'center'},
  rangeNotice:{backgroundColor:c.surface,borderWidth:1,borderColor:c.border,borderRadius:12,
    padding:s.md,gap:s.xs},
  rangeNoticeText:{...t.secondary,color:c.textSecondary},
  rangeNoticeAction:{minHeight:44,alignSelf:'flex-start',justifyContent:'center'},
  rangeNoticeLink:{...t.secondary,color:c.textPrimary,fontWeight:'600'},
  archivedHeader:{flex:1,minWidth:0,gap:2},
  archivedBack:{minHeight:38,alignSelf:'flex-start',justifyContent:'center'},
  archivedBackText:{...t.secondary,color:c.textPrimary,fontWeight:'600'},
  archivedTitleRow:{flexDirection:'row',alignItems:'center',gap:s.sm,minWidth:0},
  archivedTitle:{...t.sectionTitle,color:c.textPrimary,flexShrink:1},
  archivedBadge:{...t.caption,color:c.textPrimary,borderColor:c.borderStrong,
    borderWidth:1,borderRadius:6,paddingHorizontal:s.sm,paddingVertical:2,overflow:'hidden'},
});
