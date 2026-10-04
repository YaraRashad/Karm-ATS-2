export function talentApplications(candidateId, applications, jobs, { job = 'All', department = 'All', stage = 'All' } = {}) {
  return applications.filter(app => String(app.candidateId) === String(candidateId)).map(app => ({
    app,
    job: jobs.find(position => String(position.id) === String(app.jobId)),
    stage: app.status === 'Rejected' ? 'Rejected' : app.stage,
  })).filter(item =>
    (job === 'All' || String(item.app.jobId) === String(job)) &&
    (department === 'All' || item.job?.dept === department) &&
    (stage === 'All' || item.stage === stage)
  ).sort((a, b) => Number(b.app.status === 'Active') - Number(a.app.status === 'Active'));
}
