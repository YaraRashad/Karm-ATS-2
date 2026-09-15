export const PIPELINE_STAGE_NAMES = ['Applied', 'HR Screening', 'HM Review', 'HR 1 Interview', 'Technical Interview', 'HR 2 Interview', 'ExCom Interview', 'Final Interview', 'Offer', 'Hired', 'Rejected', 'On Hold'];
export const ACTIVE_PIPELINE_STAGES = PIPELINE_STAGE_NAMES.slice(0, PIPELINE_STAGE_NAMES.indexOf('Offer') + 1);
export const PIPELINE_STAGE_API = { Applied: 'applied', 'HR Screening': 'screening', 'HM Review': 'screening', 'HR 1 Interview': 'interview', 'Technical Interview': 'assessment', 'HR 2 Interview': 'interview', 'ExCom Interview': 'interview', 'Final Interview': 'interview', Offer: 'offer', Hired: 'hired', Rejected: 'rejected' };
export function normalizePipelineStage(stage) {
  return stage === '1st Interview' ? 'HR 1 Interview' : stage;
}
export function pipelineRecruiter(application, jobs) {
  const job = jobs.find(job => String(job.id) === String(application.jobId));
  return String(job?.recruiter || application.recruiter || 'Unassigned').trim() || 'Unassigned';
}
