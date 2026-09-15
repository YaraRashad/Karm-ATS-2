import test from 'node:test';
import assert from 'node:assert/strict';
import { letterPreview, confirmLetter } from '../src/lib/thankYouLetters.js';
const sample = () => ({ id: 'app', stage: 'rejected', thankYouStatus: 'pending', updatedAt: new Date(), candidate: { firstName: 'Test', lastName: 'Candidate', email: 'candidate@example.com' }, position: { title: 'Engineer' }, disqualifyReason: 'PRIVATE REASON' });
function harness() {
 const application = sample();
 let status = 'pending'; let sends = 0;
 const prisma = { application: {
  updateMany: async ({ where, data }) => { assert.equal(where.stage, 'rejected'); if(status !== where.thankYouStatus) return {count:0}; status = data.thankYouStatus; return {count:1}; },
  update: async ({data}) => { status = data.thankYouStatus; },
 }};
 const sendEmail = async () => { sends++; return {sent:true}; };
 return { application, prisma, sendEmail, token:letterPreview(application).token, adminId:'admin', stats:()=>({status,sends}) };
}
test('preview omits internal reasons and rejects generated email placeholders',()=>{
 const a=sample(); assert(!letterPreview(a).text.includes(a.disqualifyReason));
 a.candidate.email='candidate@no-email.local'; assert.equal(letterPreview(a).validEmail,false);
});
test('concurrent approvals send only once',async()=>{
 const h=harness();const results=await Promise.allSettled([confirmLetter(h),confirmLetter(h)]);
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1); assert.deepEqual(h.stats(),{status:'sent',sends:1});
});
test('reactivated and already-sent applications cannot send',async()=>{
 for(const patch of [{stage:'applied'},{thankYouStatus:'sent'}]) { const h=harness();Object.assign(h.application,patch); await assert.rejects(confirmLetter(h));assert.equal(h.stats().sends,0); }
});
test('candidate email changes require a fresh review',async()=>{
 const h=harness();h.application.candidate.email='changed@example.com';await assert.rejects(confirmLetter(h),/review/);assert.equal(h.stats().sends,0);
});
test('SMTP uncertainty requires review and cannot automatically retry',async()=>{
 const h=harness();h.sendEmail=async()=>{throw Error('timeout')};assert.equal((await confirmLetter(h)).status,'needs_review');await assert.rejects(confirmLetter(h));
});
test('unconfigured transport leaves letter pending',async()=>{
 const h=harness();h.sendEmail=async()=>({skipped:true});assert.equal((await confirmLetter(h)).status,'pending');assert.equal(h.stats().status,'pending');
});
