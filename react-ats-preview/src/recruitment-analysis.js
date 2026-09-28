import { normalizePipelineStage } from './pipeline-stages.js';

const stages = ['Applied', 'Screening', 'HR 1 Interview', 'Technical Interview', 'HR 2 Interview', 'ExCom Interview', 'Final Interview', 'Offer', 'Hired'];
const genericLabels = { applied: 'Applied', screening: 'Screening', assessment: 'Technical Interview', offer: 'Offer', hired: 'Hired', rejected: 'Rejected' };
function stageName(display, generic) {
  const label = display ? normalizePipelineStage(display) : genericLabels[generic];
  return ['HR Screening', 'HM Review'].includes(label) ? 'Screening' : label;
}

export function recruitmentAnalysis(candidates, applications) {
  const talents = new Set(candidates.map(c => String(c.id)));
  const linked = new Set();
  const incomplete = new Set();
  const rejected = new Set();
  const transitions = new Map();
  const rows = stages.map(label => ({ label, reached: new Set(), passed: new Set(), rejected: new Set(), current: new Set() }));
  const mark = (label, column, id) => rows.find(row => row.label === label)?.[column].add(id);
  for (const app of applications) {
    const id = String(app.candidateId);
    if (!talents.has(id)) continue;
    linked.add(id);
    mark('Applied', 'reached', id);
    const current = stageName(app.stage);
    mark(current, 'reached', id);
    mark(current, 'current', id);
    if (current === 'Rejected') rejected.add(id);
    if (!Array.isArray(app.stageHistory) || (!app.stageHistory.length && current !== 'Applied')) incomplete.add(id);
    for (const event of app.stageHistory || []) {
      const from = stageName(event.fromDisplayStage, event.fromStage);
      const to = stageName(event.toDisplayStage, event.toStage);
      if ((event.fromStage && !from) || !to) incomplete.add(id);
      mark(from, 'reached', id);
      mark(to, 'reached', id);
      if (to === 'Rejected') mark(from, 'rejected', id);
      if (from && to && from !== to) {
        const key = JSON.stringify([from, to]);
        if (!transitions.has(key)) transitions.set(key, { from, to, candidates: new Set() });
        transitions.get(key).candidates.add(id);
      }
      // A recorded move to another recruitment stage is progression, regardless
      // of its display order. Resetting to Applied, rejection and hold are excluded.
      if (stages.includes(from) && stages.includes(to) && from !== to && to !== 'Applied' && from !== 'Hired') mark(from, 'passed', id);
    }
  }
  const groups = ['Applied', 'Screening', 'HR Interview', 'Technical Interview', 'ExCom Interview', 'Final Interview', 'Offer', 'Hired'];
  const pipelineRows = groups.map(label => {
    const members = rows.filter(row => label === 'HR Interview' ? ['HR 1 Interview', 'HR 2 Interview'].includes(row.label) : row.label === label);
    const union = key => new Set(members.flatMap(row => [...row[key]])).size;
    const reached = union('reached');
    const memberLabels = new Set(members.map(row => row.label));
    const passed = new Set([...transitions.values()].filter(t => memberLabels.has(t.from) && !memberLabels.has(t.to) && stages.includes(t.to) && t.to !== 'Applied' && t.from !== 'Hired').flatMap(t => [...t.candidates])).size;
    return { label, reached, passed, rejected: union('rejected'), current: union('current'), conversion: reached && label !== 'Hired' ? Math.round(passed / reached * 100) : null };
  });
  return {
    pipelineRows,
    transitions: [...transitions.values()].map(({ from, to, candidates }) => ({ from, to, count: candidates.size })).sort((a, b) => b.count - a.count || a.from.localeCompare(b.from) || a.to.localeCompare(b.to)),
    total: talents.size, applied: linked.size, unassigned: talents.size - linked.size,
    incomplete: incomplete.size, rejected: rejected.size,
    rows: rows.map(row => ({ label: row.label, reached: row.reached.size, passed: row.passed.size, rejected: row.rejected.size, current: row.current.size, conversion: row.reached.size && row.label !== 'Hired' ? Math.round(row.passed.size / row.reached.size * 100) : null })),
  };
}
