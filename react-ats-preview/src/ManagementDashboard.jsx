import React, {useEffect, useRef, useState} from 'react';
import RecruitmentFunnel from './RecruitmentFunnel.jsx';
import './ManagementDashboard.css';

export default function ManagementDashboard({jobs,candidates,applications,openJobs,scheduledInterviews,pendingOfferCount,hiresYtd,avgTimeToFill,recruitment,recruiterRows,sourceRows,sourceTotal,acceptedOffers,declinedOffers,offerAcceptanceRate,planRows,openKpiModal,kpis,setPage,hiredApplications}) {
  const [showFill,setShowFill]=useState(false);
  const dialog=useRef(null);
  useEffect(()=>{if(showFill) dialog.current?.showModal();},[showFill]);
  const fillRows=hiredApplications.flatMap(app=>{
    const start=new Date(app.appliedDate||app.appliedAt);
    const end=new Date(app.hiredAt||app.closedAt||app.updatedAt||app.lastActivityAt);
    if(!Number.isFinite(+start)||!Number.isFinite(+end)||end<start)return [];
    return [{id:app.id,name:candidates.find(c=>c.id===app.candidateId)?.name||'Candidate',job:jobs.find(j=>j.id===app.jobId)?.title||'Unassigned role',start,end,days:Math.round((end-start)/86400000)}];
  });
  const cards=[
    ['Open requisitions',openJobs.length,`${jobs.length} total requisitions`,()=>openKpiModal(kpis[0])],
    ['Talent database',candidates.length,'Unique talent profiles',()=>setPage('candidates')],
    ['Scheduled interviews',scheduledInterviews.length,'Current scheduled records',()=>openKpiModal(kpis[1])],
    ['Pending offers',pendingOfferCount,'Candidates in the offer step',()=>openKpiModal(kpis[2])],
    ['Hires YTD',hiresYtd.length,'Year-to-date hired records',()=>openKpiModal(kpis[3])],
    ['Avg time to fill',avgTimeToFill===null?'—':`${avgTimeToFill}d`,'Application to hire',()=>setShowFill(true)]
  ];
  const attention=[['Scheduled interviews',scheduledInterviews.length,()=>openKpiModal(kpis[1])],['Candidates waiting in the offer step',pendingOfferCount,()=>openKpiModal(kpis[2])]];
  return <div className="management-dashboard">
    <header className="md-header"><div><h1>Karm. ATS Dashboard</h1><p>Recruitment overview · Live ATS data</p></div><span className="md-scope">Your accessible entities and departments</span></header>
    <div className="md-kpis">{cards.map(([label,value,note,action])=><button className="md-kpi" key={label} onClick={action}><span>{label}</span><strong>{value}</strong><small>{note}</small><em>View details ↗</em></button>)}</div>
    <div className="md-top"><section className="md-card"><h2>Needs attention</h2><p>Open a row to review the relevant records</p>{attention.map(([label,count,action])=><button className="md-attention" key={label} onClick={action}><span>{label}</span><b>{count}</b></button>)}<div className="md-attention"><span>Incomplete recruitment history</span><b>{recruitment.incomplete}</b></div><p className="md-note">Stage history details are available in Recruitment Analysis. Trend comparisons and overdue alerts will appear only when supported by recorded dates and targets.</p></section><RecruitmentFunnel analysis={recruitment}/></div>
    <div className="md-thirds"><section className="md-card"><h2>Recruiter workload</h2><p>Active applications by owner</p>{recruiterRows.map(row=><div className="md-bar-row" key={row.recruiter}><span>{row.recruiter}</span><div className="md-track"><i style={{width:`${row.activeCandidates/Math.max(1,...recruiterRows.map(r=>r.activeCandidates))*100}%`}}/></div><b>{row.activeCandidates}</b></div>)}</section>
    <section className="md-card"><h2>Talent sources</h2><p>{hiredApplications.length?'Share of hires by source':'Share of active applications by source'}</p>{sourceRows.map(row=><div className="md-bar-row" key={row.source}><span>{row.source}</span><div className="md-track"><i style={{width:`${row.count/Math.max(1,sourceTotal)*100}%`,background:'#55bedd'}}/></div><b>{Math.round(row.count/Math.max(1,sourceTotal)*100)}%</b></div>)}{!sourceRows.length&&<p className="md-note">No source data available.</p>}</section>
    <section className="md-card"><h2>Offer outcomes</h2><p>Recorded accepted and declined offers</p><button className="md-outcome" onClick={()=>openKpiModal(kpis[6])}><strong>{offerAcceptanceRate===null?'—':`${offerAcceptanceRate}%`}</strong><span>Acceptance rate</span><div>{acceptedOffers} accepted · {declinedOffers} declined</div><em>View offers ↗</em></button></section></div>
    <section className="md-card"><h2>Hiring plan vs actual by department</h2><p>Planned headcount and year-to-date hires</p>{planRows.map(row=><div className="md-plan" key={row.department}><span>{row.department}</span><div className="md-track"><i style={{width:`${row.progress}%`}}/><i style={{flex:1,background:'#f8ac28'}}/></div><span><b>{row.filled} / {row.plannedRoles}</b> filled{row.filled>row.plannedRoles?` · ${row.filled-row.plannedRoles} above plan`:''}</span></div>)}<p className="md-note">Green: filled · Amber: remaining planned headcount. Remaining headcount is separate from open requisitions.</p></section>
    {showFill&&<dialog className="md-dialog" ref={dialog} onCancel={()=>setShowFill(false)}><header><h2>Average time to fill</h2><button className="btn" onClick={()=>setShowFill(false)}>Close</button></header><p>{avgTimeToFill===null?'No usable date pairs':`${avgTimeToFill} days across ${fillRows.length} hired applications`}</p><div className="table-wrap"><table><thead><tr><th>Candidate</th><th>Position</th><th>Applied</th><th>Hire / recorded activity date</th><th>Days</th></tr></thead><tbody>{fillRows.map(row=><tr key={row.id}><td>{row.name}</td><td>{row.job}</td><td>{row.start.toLocaleDateString()}</td><td>{row.end.toLocaleDateString()}</td><td>{row.days}</td></tr>)}</tbody></table></div><p className="md-note">Uses hire or closure date where recorded, otherwise the application's latest activity date, matching the existing ATS calculation.</p></dialog>}
  </div>;
}
