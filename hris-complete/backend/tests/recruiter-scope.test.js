import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPositionScopeWhere, buildApplicationScopeWhere } from '../src/middleware/auth.js';
test('assigned recruiter scope includes primary and additional recruiters', () => {
  const user = { id: 'natalie', role: 'recruiter', accessScope: 'assigned_jobs' };
  const expected = { OR: [{ recruiterId: 'natalie' }, { recruiterIds: { has: 'natalie' } }] };
  assert.deepEqual(buildPositionScopeWhere(user), expected);
  assert.deepEqual(buildApplicationScopeWhere(user), { position: expected });
});
test('interviewer scope remains restricted to assigned interviews', () => {
  assert.deepEqual(buildApplicationScopeWhere({ id: 'other', role: 'interviewer' }), { interviews: { some: { interviewerId: 'other' } } });
});
