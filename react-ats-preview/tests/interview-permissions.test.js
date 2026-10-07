import test from 'node:test';
import assert from 'node:assert/strict';
import {canEditInterviewScore,canSubmitInterviewScore} from '../src/interview-permissions.js';
test('recruiters can submit and update scorecards without admin deletion permission',()=>{
 for(const role of ['Recruiter','recruiter',' Recruiter ']){
 assert.equal(canEditInterviewScore({role,canEditSubmitted:false}),true);
 assert.equal(canSubmitInterviewScore({role,canEditSubmitted:false,ownsInterview:false}),true);
 }
});
test('admin editing and assigned interviewer submission stay available',()=>{
 assert.equal(canEditInterviewScore({role:'Admin',canEditSubmitted:true}),true);
 assert.equal(canSubmitInterviewScore({role:'Interviewer',ownsInterview:true}),true);
 assert.equal(canEditInterviewScore({role:'Interviewer',canEditSubmitted:false}),false);
});
test('unassigned non-recruiters cannot submit or unlock existing scorecards',()=>{
 for(const role of ['Interviewer','Hiring Manager','',undefined]){
 assert.equal(canEditInterviewScore({role}),false);
 assert.equal(canSubmitInterviewScore({role,ownsInterview:false}),false);
 }
});
