import test from 'node:test';import assert from 'node:assert/strict';import {dashboardMetrics,periodRange,hiredDate} from '../src/dashboard-metrics.js';
const range=periodRange('Custom','2026-01-01','2026-01-31',new Date('2026-02-15T10:00:00Z'));
const jobs=[{id:'j',title:'Engineer',dept:'A',entity:'Egypt',status:'Open',headcount:3,recordedOpenDate:'2025-12-01',targetCloseDate:'2026-01-01',recruiterIds:['u','v']}];
const candidates=[{id:'c',name:'C',source:'referral'}];const applications=[{id:'a',jobId:'j',candidateId:'c',stage:'Hired',status:'Active',appliedDate:'2026-01-02',stageHistory:[{toStage:'hired',movedAt:'2026-01-21T10:00:00Z'}],lastActivityAt:'2026-02-14'}];
test('hires use event date, not edits; missing event is excluded',()=>{const m=dashboardMetrics({jobs,candidates,applications:[...applications,{...applications[0],id:'b',stageHistory:[]}],range});assert.equal(m.hires.length,1);assert.equal(m.fillMean,51);assert.equal(m.quality[0].rows.length,1);assert.equal(m.totalHC,3)});
test('organization filters cannot retain applications or offers outside eligible jobs',()=>{const m=dashboardMetrics({jobs,candidates,applications,offers:[{id:'o',applicationId:'a',rawStatus:'sent'}],entity:'Cyprus',range});assert.equal(m.apps.length,0);assert.equal(m.offers.length,0);assert.equal(m.totalHC,0)});
test('acceptance is decision dated and pending excludes drafts',()=>{const offers=[{id:'o',jobId:'j',rawStatus:'accepted',acceptedAt:'2026-01-15'},{id:'d',jobId:'j',rawStatus:'declined',declinedAt:'2026-01-16'},{id:'x',jobId:'j',rawStatus:'accepted'},{id:'p',jobId:'j',rawStatus:'sent',sentAt:'2026-02-01'},{id:'draft',jobId:'j',rawStatus:'draft'}];const m=dashboardMetrics({jobs,candidates,applications,offers,range});assert.equal(m.acceptance,50);assert.equal(m.pending.length,1);assert.equal(m.quality[5].rows.length,1)});
test('source cohort counts each candidate once; shared recruiter assignment not lost',()=>{const active=applications.map(a=>({...a,stage:'Technical Interview'}));const m=dashboardMetrics({jobs,candidates,applications:active,range});assert.equal(m.sources[0].applicants.length,1);assert.equal(m.recruiters.length,2);assert.equal(m.recruiters[0].apps.length,1);assert.equal(m.recruiters[1].apps.length,1)});
test('period previous window is equal length and hire date uses earliest event',()=>{assert.equal(range.previousEnd,'2025-12-31');assert.equal(range.previousStart,'2025-12-01');assert.equal(hiredDate({stageHistory:[{toStage:'hired',movedAt:'2026-03-01'},{toStage:'hired',movedAt:'2026-01-02'}]}),'2026-01-02')});
test('period positions include all statuses, opening date takes priority, and category totals reconcile',()=>{
 const positions=[
 {id:'one',status:'Closed',recordedOpenDate:'2026-01-01',positionType:'Manpower',headcount:5},
 {id:'two',status:'Draft',createdAt:'2026-01-03',positionType:'Additional R.'},
 {id:'old',recordedOpenDate:'2025-01-01',createdAt:'2026-01-03',positionType:'Replacement'},
 {id:'undated',positionType:'Replacement'},
 {id:'outside',entity:'Cyprus',recordedOpenDate:'2026-01-05'}
 ].map(j=>({entity:'Egypt',...j}));
 const m=dashboardMetrics({jobs:positions,entity:'Egypt',range});
 assert.deepEqual(m.periodPositions.map(j=>j.id),['one','two']);
 assert.equal(m.positionBreakdown.reduce((s,g)=>s+g.count,0),2);
 assert.equal(m.positionBreakdown.find(g=>g.label==='Additional Resource').count,1);
 assert.equal(m.positionDetailRows[1].dateBasis,'Creation date');
});
test('hire employment breakdown preserves interns and project hires despite legacy full-time default',()=>{
 const types=['Internship','Project Hire','Replacement','Manpower','Additional R.'];
 const positions=types.map((positionType,i)=>({id:String(i),positionType,employmentType:i===4?null:'full_time'}));
 const apps=positions.map((j,i)=>({...applications[0],id:String(i),jobId:j.id}));
 const m=dashboardMetrics({jobs:positions,applications:apps,range});
 assert.deepEqual(Object.fromEntries(m.hireBreakdown.map(g=>[g.label,g.count])),{'FTE':2,'Interns':1,'Not recorded':1,'Project hires':1});
 assert.equal(m.hireBreakdown.reduce((s,g)=>s+g.count,0),m.hires.length);
});
test('hire audit reconciles included, undated and outside-period records; HC categories sum people',()=>{
 const position={...jobs[0],positionType:'Replacement',headcount:4};
 const rows=[applications[0],{...applications[0],id:'undated',stageHistory:[]},{...applications[0],id:'old',stageHistory:[{toStage:'hired',movedAt:'2025-12-01'}]}];
 const m=dashboardMetrics({jobs:[position],applications:rows,range});
 assert.deepEqual(m.hireAudit,{total:3,included:1,missing:1,outside:1,uniqueIncluded:1});
 assert.equal(m.hireAuditRows.filter(r=>r.included==='Included').length,1);
 assert.equal(m.hcBreakdown[0].count,4);
 assert.equal(m.hcBreakdown.reduce((s,g)=>s+g.count,0),m.totalHC);
});
test('confirmed 2026 undated hires enter YTD only, with scope, month and duration safeguards',async()=>{
 const {CONFIRMED_2026_HIRES}=await import('../src/dashboard-metrics.js');
 const id=[...CONFIRMED_2026_HIRES][0];
 const undated={...applications[0],id,stageHistory:[]};
 const args={jobs,candidates,applications:[applications[0],undated,{...undated,id:'unconfirmed'}]};
 const ytd=periodRange('YTD','','',new Date('2026-10-07T10:00:00Z'));
 const m=dashboardMetrics({...args,range:ytd});
 assert.equal(m.hires.length,2);
 assert.equal(m.confirmedUndated.length,1);
 assert.equal(m.fillRows.length,1);
 assert.equal(m.monthly.at(-1).cumulative,1);
 assert.equal(m.hireBreakdown.reduce((s,g)=>s+g.count,0),2);
 assert.equal(m.hireAuditRows.find(r=>r.id===id).included,'Included · confirmed 2026, date missing');
 assert.equal(dashboardMetrics({...args,range:periodRange('Month','','',new Date('2026-10-07T10:00:00Z'))}).confirmedUndated.length,0);
 assert.equal(dashboardMetrics({...args,range:periodRange('YTD','','',new Date('2027-10-07T10:00:00Z'))}).confirmedUndated.length,0);
 assert.equal(dashboardMetrics({...args,entity:'Cyprus',range:ytd}).hires.length,0);
});
test('source hires reconcile to KPI including earlier applicants and confirmed undated; exclude historical hired exits',async()=>{
 const {CONFIRMED_2026_HIRES}=await import('../src/dashboard-metrics.js');
 const range=periodRange('YTD','','',new Date('2026-10-07T10:00:00Z'));
 const cs=[{id:'early',source:'referral'},{id:'missing',source:'direct'},{id:'exit',source:'linkedin'}];
 const rows=[
 {...applications[0],candidateId:'early',appliedDate:'2025-12-01'},
 {...applications[0],id:[...CONFIRMED_2026_HIRES][0],candidateId:'missing',stageHistory:[]},
 {...applications[0],id:'exit',candidateId:'exit',stage:'Rejected'}
 ];
 const m=dashboardMetrics({jobs,candidates:cs,applications:rows,range});
 assert.equal(m.sourceHires,m.hires.length);assert.equal(m.sourceHires,2);
 const early=m.sources.find(r=>r.source==='referral');assert.equal(early.hires.length,1);assert.equal(early.applicants.length,0);
 assert.equal(m.sources.find(r=>r.source==='direct').cohortHires.length,1);
 assert.equal(m.sources.find(r=>r.source==='linkedin').hires.length,0);
 assert.equal(m.sources.find(r=>r.source==='linkedin').cohortHires.length,0);
});
test('historical stage without dated evidence is unknown, not fabricated Applied',()=>{
 const m=dashboardMetrics({jobs,candidates,applications:[{...applications[0],stageHistory:[]}],range});
 assert.equal(m.analysis.pipelineRows.find(r=>r.label==='Applied').current,0);
 assert.equal(m.quality.find(q=>q.label==='Historical stage unknown at selected cutoff').rows.length,1);
});
test('prior unrelated hire does not convert a new application cohort',()=>{
 const rows=[{...applications[0],id:'old',appliedDate:'2025-10-01',stageHistory:[{toStage:'hired',movedAt:'2025-12-01'}]},{...applications[0],id:'new',stage:'Applied',stageHistory:[]}];
 const m=dashboardMetrics({jobs,candidates,applications:rows,range});
 assert.equal(m.sources[0].cohortHires.length,0);
});
test('hire-offer reconciliation uses application links across offer dates',()=>{
 const offers=[{id:'past',jobId:'j',applicationId:'a',rawStatus:'accepted',acceptedAt:'2025-12-20'}];
 const m=dashboardMetrics({jobs,candidates,applications,offers,range});
 assert.equal(m.decisions.length,0);
 assert.equal(m.hireOfferRows[0].acceptedOffers,1);
 assert.equal(m.quality.find(q=>q.label==='Period hires without a linked accepted offer').rows.length,0);
});
test('breakdowns, monthly dates and stage/transition detail counts reconcile',()=>{
 const m=dashboardMetrics({jobs,candidates,applications,range});
 assert.equal(m.departments.reduce((s,r)=>s+r.planned,0),m.totalHC);
 assert.equal(m.departments.reduce((s,r)=>s+r.hires.length,0),m.hires.length);
 assert.equal(m.hireBreakdown.reduce((s,r)=>s+r.count,0),m.hires.length);
 assert.equal(m.sourceHires,m.hires.length);
 assert.equal(m.monthly.reduce((s,r)=>s+r.rows.length,0),m.hires.length);
 for(const r of m.analysis.pipelineRows)for(const key of ['reached','passed','current','rejected'])assert.equal(m.stageRows(r.label,key).length,r[key]);
 for(const r of m.analysis.transitions)assert.equal(m.routeRows(r).length,r.count);
});
test('invalid dates and conflicting inactive stages do not inflate figures',async()=>{
 const {day}=await import('../src/dashboard-metrics.js');
 assert.equal(day('2026-02-31'),null);
 const currentRange=periodRange('YTD','','',new Date('2026-10-07T10:00:00Z'));
 const m=dashboardMetrics({jobs,candidates,applications:[{...applications[0],stage:'Applied',status:'Rejected',stageHistory:[]}],range:currentRange});
 assert.equal(m.analysis.pipelineRows.find(r=>r.label==='Applied').current,0);
});
