import './RecruitmentFunnel.css';

const number = value => value.toLocaleString();
export default function RecruitmentFunnel({ analysis }) {
  return <section className="chart-card chart-card-wide recruitment-funnel" aria-label="Recruitment funnel">
    <div className="chart-card-head"><div><div className="chart-card-title">Recruitment Funnel</div><div className="chart-card-sub">All time · Unique candidates</div></div></div>
    <div className="rf-summary">
      {[["Talent Database", analysis.total], ["Applied", analysis.applied], ["Hired", analysis.rows.find(r => r.label === 'Hired').reached]].map(([label, count]) => <div key={label}><strong>{number(count)}</strong><span>{label}</span></div>)}
    </div>
    <ol className="rf-stages">
      {analysis.rows.map((row, index) => <li key={row.label} className={row.label === 'Hired' ? 'rf-stage rf-hired' : 'rf-stage'}>
        <div className="rf-stage-heading"><span className="rf-step">{index + 1}</span><h3>{row.label}</h3><span className="rf-conversion">{row.label === 'Hired' ? 'Completed' : `${row.conversion === null ? '—' : row.conversion + '%'} conversion`}</span></div>
        <div className="rf-volume" aria-hidden="true"><div style={{ width: `${analysis.applied ? row.reached / analysis.applied * 100 : 0}%` }} /></div>
        <dl className="rf-metrics">
          {[["Reached", row.reached], ["Passed", row.label === 'Hired' ? '—' : row.passed], ["Rejected", row.rejected], ["Currently here", row.current]].map(([label, count]) => <div key={label} className={label === 'Reached' ? 'rf-reached' : ''}><dt>{label}</dt><dd>{typeof count === 'number' ? number(count) : count}</dd></div>)}
        </dl>
      </li>)}
    </ol>
    <details className="rf-details"><summary>Data details{analysis.incomplete > 0 ? ` · ${number(analysis.incomplete)} talents with incomplete history` : ''}</summary>
      <p>{number(analysis.total)} talents = {number(analysis.applied)} with applications + {number(analysis.unassigned)} without an application.</p>
      <p>Conversion = passed ÷ reached. Passed means a recorded move to a later stage. Rejected means a recorded rejection from that stage. Hired is the final stage.</p>
      <p>Each candidate is counted once per stage and metric. Candidates with multiple applications or repeat attempts may appear in more than one outcome.</p>
      {analysis.incomplete > 0 && <p>Historical totals include only confirmed stages. Missing interview rounds and the origin of undocumented rejections cannot be reconstructed.</p>}
    </details>
  </section>;
}
