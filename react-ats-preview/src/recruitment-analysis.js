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
  const rows = stages.map(label => ({ label, reached: new Set(), passed: new Set(), current: new Set() }));
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
      // Only recorded forward moves count as passing. Skipped stages, rejection,
      // return moves and generic historical interviews do not imply a pass.
      if (stages.includes(from) && stages.indexOf(to) > stages.indexOf(from)) mark(from, 'passed', id);
    }
  }
  return {
    total: talents.size, applied: linked.size, unassigned: talents.size - linked.size,
    incomplete: incomplete.size, rejected: rejected.size,
    rows: rows.map(row => ({ label: row.label, reached: row.reached.size, passed: row.passed.size, current: row.current.size })),
  };
}
