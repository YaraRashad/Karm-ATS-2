import test from 'node:test';
import assert from 'node:assert/strict';
import { talentApplications } from '../src/talent-applications.js';
const jobs = [{ id: 'p', title: 'Paralegal', dept: 'Legal' }, { id: 'e', title: 'Engineer', dept: 'Technical' }];
const apps = [{ id: 'a', candidateId: 'c', jobId: 'p', stage: 'Rejected', status: 'Rejected' }, { id: 'b', candidateId: 'c', jobId: 'e', stage: 'Applied', status: 'Active' }];
test('rejected application retains its applied position and matches rejection filters', () => {
  const matches = talentApplications('c', apps, jobs, { job: 'p', stage: 'Rejected', department: 'Legal' });
  assert.equal(matches.length, 1);
  assert.equal(matches[0].job.title, 'Paralegal');
  assert.equal(matches[0].stage, 'Rejected');
});
test('position and stage must match the same application', () => {
  assert.equal(talentApplications('c', apps, jobs, { job: 'e', stage: 'Rejected' }).length, 0);
  assert.equal(talentApplications('c', apps, jobs, { job: 'p', department: 'Technical' }).length, 0);
});
test('unfiltered view retains active and rejected histories, excludes other candidates', () => {
  assert.equal(talentApplications('c', apps, jobs).length, 2);
  assert.equal(talentApplications('other', apps, jobs).length, 0);
});
