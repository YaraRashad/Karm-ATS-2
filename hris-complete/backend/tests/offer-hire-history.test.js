import test from 'node:test';
import assert from 'node:assert/strict';
import { offerHireHistory } from '../src/lib/offerHireHistory.js';
import { dashboardMetrics, periodRange } from '../../../react-ats-preview/src/dashboard-metrics.js';
test('acceptance records the hire event consumed by dashboard without manual edits', () => {
  const now = new Date('2026-11-11T10:00:00Z');
  const application = {id:'a',candidateId:'c',jobId:'j',stage:'offer',displayStage:'Offer',stageHistory:[]};
  const data = offerHireHistory(application, now, 'admin');
  assert.equal(data.stageHistory.create.movedById, 'admin');
  const hired = {...application,stage:'Hired',stageHistory:[data.stageHistory.create]};
  const metrics=dashboardMetrics({jobs:[{id:'j',headcount:1}],applications:[hired],range:periodRange('YTD','','',now)});
  assert.equal(metrics.hires.length,1);
  assert.equal(metrics.monthly.at(-1).rows.length,1);
  assert.deepEqual(offerHireHistory(hired, new Date('2026-11-12'), 'admin'),{});
});
