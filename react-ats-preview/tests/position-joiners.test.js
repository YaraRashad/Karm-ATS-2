import test from 'node:test';
import assert from 'node:assert/strict';
import { positionJoiners } from '../src/position-joiners.js';
const job = { id: 'j', status: 'Closed' };
const apps = [{ id: 'a', jobId: 'j', candidateId: 'c', stage: 'Hired' }];
const candidates = [{ id: 'c', name: 'First Joiner' }];
const offer = { applicationId: 'a', jobId: 'j', candidateId: 'c', status: 'Accepted', startDate: '2026-10-01' };
test('matches hired candidates to accepted offer start dates without duplicates', () => {
  assert.deepEqual(positionJoiners(job, apps, candidates, [offer, offer]), [{ name: 'First Joiner', date: '2026-10-01' }]);
});
test('handles multiple joiners and rejects unrelated or unaccepted offers', () => {
  const offers = [offer, { jobId: 'j', candidateId: 'd', candidateName: 'Second', status: 'Accepted', startDate: '2026-11-01' }, { ...offer, candidateId: 'e', applicationId: '', status: 'Declined' }, { ...offer, jobId: 'other', applicationId: 'other', candidateId: 'x' }];
  assert.equal(positionJoiners(job, apps, candidates, offers).length, 2);
});
test('leaves open positions empty and does not invent dates for hired candidates', () => {
  assert.deepEqual(positionJoiners({ ...job, status: 'Open' }, apps, candidates, [offer]), []);
  assert.deepEqual(positionJoiners(job, apps, candidates, []), [{ name: 'First Joiner', date: '' }]);
});
