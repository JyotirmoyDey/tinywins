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
import activityCalendarConfig from '../../analytics/config/activity-calendar.json';
import { getRatingTrend, ratingTrendConfig } from '../../analytics/ratingTrend';
import { getAdaptiveTrend } from '../../analytics/ratingTrendPresentation';
import { Button } from '../../components/ui';
import { colors as c, spacing as s, typography as t } from '../../theme';
import { localDate, parseLocalDate } from '../../domain/task';

function monthPeriod(month:string){ const start=parseLocalDate(`${month}-01`); const end=new Date(start.getFullYear(),start.getMonth()+1,0,12); return {startDate:`${month}-01`,endDate:localDate(end)}; }
function allMonthCells(tasks:{id:string;name:string;createdAt?:string}[],entries:AnalyticsEntry[],month:string){ const period=monthPeriod(month); const days=Number(period.endDate.slice(-2)); return Array.from({length:days},(_,i)=>{const date=`${month}-${String(i+1).padStart(2,'0')}`;const eligible=tasks.filter(task=>!task.createdAt||date>=task.createdAt.slice(0,10)).length;const recordedIds=new Set(entries.filter(entry=>entry.localDate===date).map(entry=>entry.taskId));const recorded=recordedIds.size;const recordedNames=tasks.filter(task=>recordedIds.has(task.id)).map(task=>task.name);const missingNames=tasks.filter(task=>!recordedIds.has(task.id)&&(!task.createdAt||date>=task.createdAt.slice(0,10))).map(task=>task.name);return {date,ratio:eligible?recorded/eligible:0,recorded,eligible,detail:`Recorded: ${recordedNames.join(', ')||'none'} · Missing: ${missingNames.join(', ')||'none'}`,color:'#2A9D8F'};}); }

export default function Insights(){
  const params=useLocalSearchParams<{task?:string}>(); const router=useRouter(); const {today}=useTasks();
  const source=useDevInsightsSource(); const selectedId=params.task||'all';
  const [timeline,setTimeline]=useState<RatingDistributionTimeline>('1D');
  const [custom,setCustom]=useState<CustomRange>({startDate:today,endDate:today});
  const [customOpen,setCustomOpen]=useState(false);
  const openingExpanded=useRef(false);
  useFocusEffect(useCallback(() => { openingExpanded.current=false; }, []));
  const [month,setMonth]=useState(today.slice(0,7)); const [scaleVersion,setScaleVersion]=useState('current');
  const {dataset,loading}=useAnalyticsData(source==='demo');
  const tasks=useMemo(()=>dataset.tasks.slice().sort((a,b)=>a.name.localeCompare(b.name)),[dataset.tasks]);
  const selectedTask=tasks.find(task=>task.id===selectedId); const isAll=selectedId==='all'||!selectedTask;
  const earliest=useMemo(()=>earliestAvailableDate(tasks,dataset.entries,today,isAll?undefined:selectedTask?.id),
    [tasks,dataset.entries,today,isAll,selectedTask?.id]);
  const customBoundaryIssue=timeline==='CUSTOM'?
    (earliest ? validateCustomRange(custom,today,earliest) :
      custom.startDate!==today || custom.endDate!==today ? 'No dates are available for this activity yet.' : null):null;
  const period=useMemo(()=>getInsightsPeriod(today,timeline,custom),[today,timeline,custom]);
  const consistency=useMemo(()=>getRecordingConsistency(tasks,dataset.entries,period),[tasks,dataset.entries,period]);
  const weekdays=useMemo(()=>getWeekdayRecordingPattern(tasks,dataset.entries,period),[tasks,dataset.entries,period]);
  const trend=useMemo(()=>selectedTask?getRatingTrend({task:selectedTask,entries:dataset.entries,versions:dataset.scaleVersions,period}):null,[selectedTask,dataset.entries,dataset.scaleVersions,period]);
  const trendView=useMemo(()=>trend?getAdaptiveTrend(trend,timeline):null,[trend,timeline]);
  const scaleVersions=useMemo(()=>selectedTask?getRatingScaleVersions(selectedTask,dataset.entries,dataset.scaleVersions):[],[selectedTask,dataset.entries,dataset.scaleVersions]);
  const activeScaleVersion=scaleVersions.includes(scaleVersion)?scaleVersion:'current';
  const distribution=useMemo(()=>selectedTask?getRatingDistribution(selectedTask,dataset.entries,period,activeScaleVersion,dataset.scaleVersions):[],[selectedTask,dataset.entries,period,activeScaleVersion,dataset.scaleVersions]);
  const individualCalendar=useMemo(()=>selectedTask&&!isAll?
    individualCalendarData(selectedTask,dataset.entries,dataset.scaleVersions,month):null,
    [selectedTask,isAll,dataset.entries,dataset.scaleVersions,month]);
  const calendarCells=useMemo(()=>isAll?allMonthCells(tasks,dataset.entries,month):individualCalendar?.cells||[],
    [isAll,tasks,dataset.entries,month,individualCalendar]);
  const totalRecorded=distribution.reduce((sum,row)=>sum+row.count,0);
  const individualCharts=selectedTask?[
    {id:ratingTrendConfig.id,order:ratingTrendConfig.displayOrder,visible:ratingTrendConfig.visible,
      element:<AnalyticsCard key={ratingTrendConfig.id} title={ratingTrendConfig.title}
        description={trendView?.subtitle ?? 'Daily trend'}
        headerAction={<Pressable accessibilityRole="button" accessibilityLabel="Expand rating trend"
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
    {id:ratingDistributionConfig.id,order:ratingDistributionConfig.displayOrder,visible:ratingDistributionConfig.visible,
      element:<AnalyticsCard key={ratingDistributionConfig.id} title={ratingDistributionConfig.title} description="Your responses over the selected period.">{scaleVersions.length>1&&<View style={styles.scaleSelector}>{scaleVersions.map(version=><Button key={version} label={version==='current'?'Current scale':`Previous scale ${scaleVersions.indexOf(version)}`} onPress={()=>setScaleVersion(version)} subtle={activeScaleVersion!==version}/>)}</View>}{timeline==='1D'?(totalRecorded?<View style={styles.todayRating}><Text style={styles.todayLabel}>Today</Text><Text style={styles.todayValue}>{distribution.find(row=>row.count>0)?.label||'Recorded'}</Text></View>:<Placeholder>No entries for this period.</Placeholder>):totalRecorded===0?<Placeholder>No entries for this period.</Placeholder>:<><Text style={styles.summary}>{totalRecorded} recorded entries</Text><BarChart items={distribution.map(row=>({label:row.label,value:row.count/totalRecorded*100,count:row.count,percentage:row.percentage}))} color={ratingDistributionConfig.style.color}/></>}</AnalyticsCard>},
    {id:activityCalendarConfig.id,order:activityCalendarConfig.displayOrder,visible:activityCalendarConfig.visible,
      element:<AnalyticsCard key={activityCalendarConfig.id} title={activityCalendarConfig.title}><MonthCalendar
        key={`${source}-${selectedTask.id}`} month={month} onMonthChange={setMonth} cells={calendarCells}
        levels={individualCalendar?.levels} color={selectedTask.color} kind="individual"/></AnalyticsCard>},
  ].filter(item=>item.visible).sort((a,b)=>a.order-b.order).map(item=>item.element):[];
  const pageRef=useRef<ScrollView>(null); const headerHeight=useRef(58);
  const [collapsed,setCollapsed]=useState(false); const [collapsedOpacity]=useState(()=>new Animated.Value(0));
  const expandedOpacity=collapsedOpacity.interpolate({inputRange:[0,1],outputRange:[1,0]});
  useEffect(()=>{Animated.timing(collapsedOpacity,{toValue:collapsed?1:0,duration:140,useNativeDriver:true}).start();},[collapsed,collapsedOpacity]);
  const selectActivity=(id:string)=>{
    if(id===(isAll?'all':selectedId))return;
    if((id==='all')!==isAll){pageRef.current?.scrollTo({y:0,animated:false});setCollapsed(false);}
    setScaleVersion('current');router.setParams({task:id});
  };
  const dateMenu=()=> <InsightsDateMenu value={timeline} custom={custom} onPreset={setTimeline} onCustom={()=>setCustomOpen(true)}/>;
  return <SafeAreaView style={styles.screen} edges={['top']}>
    <ScrollView ref={pageRef} stickyHeaderIndices={[1]} scrollEventThrottle={16} onScroll={event=>{
      const next=event.nativeEvent.contentOffset.y>=headerHeight.current-6;
      if(next!==collapsed)setCollapsed(next);
    }} contentContainerStyle={styles.page}>
      <View style={styles.header} onLayout={event=>{headerHeight.current=event.nativeEvent.layout.height;}}>
        <Text style={styles.title}>Insights</Text>
        <View importantForAccessibility={collapsed?'no-hide-descendants':'auto'}>{dateMenu()}</View>
      </View>
      <View style={styles.toolbar}>
        <Animated.View pointerEvents={collapsed?'none':'auto'}
          importantForAccessibility={collapsed?'no-hide-descendants':'auto'}
          style={[styles.expandedToolbar,{opacity:expandedOpacity}]}>
          <ActivitySelector tasks={tasks} selectedId={isAll?'all':selectedId} onSelect={selectActivity}/>
        </Animated.View>
        <Animated.View pointerEvents={collapsed?'auto':'none'}
          importantForAccessibility={collapsed?'auto':'no-hide-descendants'}
          style={[styles.compactToolbar,{opacity:collapsedOpacity}]}>
          <InsightsActivityMenu tasks={tasks} selectedId={isAll?'all':selectedId} onSelect={selectActivity}/>
          <View style={styles.toolbarDate}>{dateMenu()}</View>
        </Animated.View>
      </View>
      <View style={styles.charts}>
        {customBoundaryIssue&&<View style={styles.rangeNotice}>
          <Text style={styles.rangeNoticeText}>{customBoundaryIssue} Choose a range for this activity.</Text>
          <Pressable accessibilityRole="button" onPress={()=>setCustomOpen(true)} style={styles.rangeNoticeAction}>
            <Text style={styles.rangeNoticeLink}>Adjust range</Text>
          </Pressable>
        </View>}
        {loading?<Placeholder>Loading your insights…</Placeholder>:isAll?<>
          <AnalyticsCard title="Combined trend"><Text style={styles.combinedPlaceholder}>Coming soon.</Text></AnalyticsCard>
          <AnalyticsCard title="Recording consistency" description="Recorded days compared with eligible days in this period.">{consistency.recordedDays?<><Text style={styles.summary}>{consistency.recordedDays} recorded activity-days · {consistency.eligibleDays} eligible activity-days</Text><BarChart items={consistency.rows.map(row=>({label:row.name,value:row.coverage*100,count:`${row.recordedDays}/${row.eligibleDays}`}))} color="#2A9D8F"/></>:<Placeholder>No entries for this period.</Placeholder>}</AnalyticsCard>
          <AnalyticsCard title="Combined calendar" description="Coverage across eligible activities. Rating intensity is not combined."><MonthCalendar month={month} onMonthChange={setMonth} cells={calendarCells} color="#2A9D8F" kind="coverage"/></AnalyticsCard>
          <AnalyticsCard title="Weekly recording patterns" description="Recorded activity-days by local weekday.">{weekdays.some(row=>row.recorded>0)?<BarChart items={weekdays.map(row=>({label:row.label,value:row.recorded,count:row.observations}))} color="#2A9D8F"/>:<Placeholder>No entries for this period.</Placeholder>}</AnalyticsCard>
        </>:<>{individualCharts}</>}
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
  combinedPlaceholder:{...t.secondary,color:c.textSecondary,paddingVertical:s.sm},
  scaleSelector:{flexDirection:'row',gap:s.sm,flexWrap:'wrap',marginBottom:s.sm},
  summary:{...t.secondary,color:c.textSecondary},todayRating:{backgroundColor:c.surfaceSecondary,borderRadius:12,padding:s.lg,gap:s.xs},todayLabel:{...t.caption,color:c.textSecondary},todayValue:{...t.sectionTitle,color:c.textPrimary},
  expandButton:{minWidth:44,minHeight:44,alignItems:'center',justifyContent:'center'},
  rangeNotice:{backgroundColor:c.surface,borderWidth:1,borderColor:c.border,borderRadius:12,
    padding:s.md,gap:s.xs},
  rangeNoticeText:{...t.secondary,color:c.textSecondary},
  rangeNoticeAction:{minHeight:44,alignSelf:'flex-start',justifyContent:'center'},
  rangeNoticeLink:{...t.secondary,color:c.textPrimary,fontWeight:'600'},
});
