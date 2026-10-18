import test from 'node:test';
import assert from 'node:assert/strict';
import { canSetHired, requestsHired } from '../src/lib/hiringPermissions.js';

test('only the authenticated admin role can set Hired', () => {
  assert.equal(canSetHired('admin'), true);
  for (const role of ['recruiter', 'hiring_manager', 'interviewer', undefined, '', 'Admin']) {
    assert.equal(canSetHired(role), false);
  }
});

test('Hired display label cannot bypass the stage restriction', () => {
  assert.equal(requestsHired('hired', undefined), true);
  assert.equal(requestsHired('applied', 'Hired'), true);
  assert.equal(requestsHired('screening', ' hired '), true);
  for (const stage of ['applied', 'screening', 'interview', 'assessment', 'offer', 'withdrawn', 'rejected']) {
    assert.equal(requestsHired(stage, undefined), false);
  }
});
