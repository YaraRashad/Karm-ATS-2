import test from 'node:test';
import assert from 'node:assert/strict';
import { recruitmentAnalysis } from '../src/recruitment-analysis.js';

test('reconciles talents and counts historical forward moves once per talent', () => {
  const history = [
    { fromStage: 'applied', toStage: 'screening' },
    { fromStage: 'screening', toStage: 'interview', toDisplayStage: '1st Interview' },
    { fromStage: 'interview', fromDisplayStage: 'HR 1 Interview', toStage: 'assessment' },
    { fromStage: 'assessment', toStage: 'rejected' },
  ];
  const app = { candidateId: 1, stage: 'Rejected', stageHistory: history };
  const result = recruitmentAnalysis([{ id: 1 }, { id: 2 }], [app, app, { candidateId: 99, stage: 'Hired' }]);
  assert.equal(result.total, 2);
  assert.equal(result.applied, 1);
  assert.equal(result.unassigned, 1);
  assert.equal(result.rejected, 1);
  assert.deepEqual(result.rows.find(r => r.label === 'HR 1 Interview'), { label: 'HR 1 Interview', reached: 1, passed: 1, rejected: 0, current: 0, conversion: 100 });
  assert.equal(result.rows.find(r => r.label === 'Technical Interview').passed, 0);
});

test('does not infer skipped stages or specific historical interview rounds', () => {
  const result = recruitmentAnalysis([{ id: 1 }], [{ candidateId: 1, stage: 'Offer', stageHistory: [{ fromStage: 'interview', toStage: 'offer' }] }]);
  assert.equal(result.incomplete, 1);
  assert.equal(result.rows.find(r => r.label === 'HR 1 Interview').reached, 0);
  assert.equal(result.rows.find(r => r.label === 'HR 2 Interview').passed, 0);
});

test('backward moves and pending interviews do not count as passes', () => {
  const result = recruitmentAnalysis([{ id: 1 }], [{ candidateId: 1, stage: 'HR 1 Interview', stageHistory: [{ fromDisplayStage: 'Technical Interview', toDisplayStage: 'HR 1 Interview' }] }]);
  assert.equal(result.rows.find(r => r.label === 'HR 1 Interview').current, 1);
  assert.equal(result.rows.find(r => r.label === 'HR 1 Interview').passed, 0);
  assert.equal(result.rows.find(r => r.label === 'Technical Interview').passed, 0);
});


test('rejections are attributed to their recorded stage and conversion uses reached', () => {
  const result = recruitmentAnalysis([{ id: 1 }, { id: 2 }, { id: 3 }], [
    { candidateId: 1, stage: 'Offer', stageHistory: [{ fromDisplayStage: 'HR 1 Interview', toDisplayStage: 'Offer' }] },
    { candidateId: 2, stage: 'Rejected', stageHistory: [{ fromDisplayStage: 'HR 1 Interview', toStage: 'rejected' }] },
    { candidateId: 3, stage: 'HR 1 Interview', stageHistory: [] },
  ]);
  assert.deepEqual(result.rows.find(r => r.label === 'HR 1 Interview'), { label: 'HR 1 Interview', reached: 3, passed: 1, rejected: 1, current: 1, conversion: 33 });
  assert.equal(result.rows.find(r => r.label === 'Hired').conversion, null);
});
