import test from 'node:test';
import assert from 'node:assert/strict';
import { pipelineRecruiters } from '../src/pipeline-stages.js';
import { canSubmitInterviewScore } from '../src/interview-permissions.js';
test('both assigned recruiters match a shared pipeline position', () => {
  const names = pipelineRecruiters({ jobId: 1 }, [{ id: 1, recruiter: 'Islam', recruiterNames: ['Islam', 'Natalie'] }]);
  assert.ok(names.includes('Natalie'));
  assert.ok(names.includes('Islam'));
  assert.equal(names.includes('Unassigned recruiter'), false);
});
test('legacy single-recruiter assignments still work', () => {
  assert.deepEqual(pipelineRecruiters({ jobId: 1 }, [{ id: 1, recruiter: 'Islam' }]), ['Islam']);
});
test('recruiters can submit; unrelated interviewers cannot', () => {
  assert.equal(canSubmitInterviewScore({ role: 'recruiter', ownsInterview: false }), true);
  assert.equal(canSubmitInterviewScore({ role: 'interviewer', ownsInterview: false }), false);
  assert.equal(canSubmitInterviewScore({ role: 'interviewer', ownsInterview: true }), true);
});
