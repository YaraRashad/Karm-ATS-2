import { useState } from 'react';
import './RecruitmentFunnel.css';

const number = value => value.toLocaleString();
export default function RecruitmentFunnel({ analysis }) {
  const [view, setView] = useState('pipeline');
  const rows = analysis.pipelineRows;
  return <section className="chart-card chart-card-wide recruitment-funnel" aria-label="Recruitment analysis">
    <div className="chart-card-head"><div><div className="chart-card-title">Recruitment Analysis</div><div className="chart-card-sub">All time · Unique candidates · Stages may be skipped</div></div></div>
    <div className="rf-summary">
      {[["Talent Database", analysis.total], ["Applied", analysis.applied], ["Hired", rows.find(r => r.label === 'Hired').reached]].map(([label, count]) => <div key={label}><strong>{number(count)}</strong><span>{label}</span></div>)}
    </div>
    <div className="rf-views" role="group" aria-label="Analysis view">
      {[["pipeline", "Recruitment Pipeline"], ["conversion", "Stage Conversion"], ["transitions", "Actual Transitions"]].map(([key, label]) => <button type="button" key={key} className={`btn ${view === key ? 'btn-primary' : ''}`} aria-pressed={view === key} onClick={() => setView(key)}>{label}</button>)}
    </div>
    {view === 'pipeline' && <div className="rf-stages">
      {rows.map(row => <article key={row.label} className="rf-stage">
        <div className="rf-stage-heading"><h3>{row.label}</h3></div>
        <dl className="rf-metrics">
          {[["Reached", row.reached], ["Passed", row.label === 'Hired' ? '—' : row.passed], ["Rejected", row.rejected], ["Currently Here", row.current]].map(([label, count]) => <div key={label} className={label === 'Reached' ? 'rf-reached' : ''}><dt>{label}</dt><dd>{typeof count === 'number' ? number(count) : count}</dd></div>)}
        </dl>
      </article>)}
    </div>}
    {view === 'conversion' && <div>
      <p className="chart-card-sub">Passed from the stage ÷ candidates who reached that same stage</p>
      <div className="rf-stages">{rows.map(row => <article key={row.label} className="rf-stage">
        <div className="rf-stage-heading"><h3>{row.label}</h3><strong className="rf-conversion">{row.label === 'Hired' ? 'Final outcome' : row.conversion === null ? '—' : `${row.conversion}%`}</strong></div>
        {row.label !== 'Hired' && <><p className="chart-card-sub">{number(row.passed)} passed / {number(row.reached)} reached</p><div className="rf-volume" aria-hidden="true"><div style={{ width: `${row.conversion || 0}%` }} /></div></>}
      </article>)}</div>
    </div>}
    {view === 'transitions' && <div>
      <p className="chart-card-sub">Recorded moves · Unique candidates per route</p>
      <div className="rf-stages">{analysis.transitions.length ? analysis.transitions.map(route => <article className="rf-stage rf-route" key={JSON.stringify([route.from, route.to])}><span>{route.from} → {route.to}</span><strong>{number(route.count)}</strong></article>) : <p>No stage transitions have been recorded.</p>}</div>
    </div>}
    <details className="rf-details"><summary>Data details{analysis.incomplete > 0 ? ` · ${number(analysis.incomplete)} talents with incomplete history` : ''}</summary>
      <p>{number(analysis.total)} talents = {number(analysis.applied)} with applications + {number(analysis.unassigned)} without an application.</p>
      <p>HR Interview combines HR 1 and HR 2, counting each candidate once. Actual transitions retain the recorded round names.</p>
      <p>Passed means a recorded move from the stage to another recruitment stage, excluding resets to Applied, rejection and hold. It does not represent an interview score. Hired is the final outcome.</p>
      <p>Each candidate is counted once per stage, metric and transition. Repeat attempts or multiple applications can place a candidate in more than one outcome.</p>
      {analysis.incomplete > 0 && <p>Historical totals include only confirmed stages. Unspecified interview rounds and undocumented routes are not inferred.</p>}
    </details>
  </section>;
}
