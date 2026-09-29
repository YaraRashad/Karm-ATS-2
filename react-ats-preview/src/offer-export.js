export function offerExportRows(offers, canViewSalary) {
  return offers.map(o => ({
    'Offer ID': o.id,
    'Candidate': o.cand?.name || o.candidateName || '',
    'Email': o.cand?.email || o.candidateEmail || '',
    'Job': o.job?.title || o.jobTitle || '',
    'Department': o.job?.dept || o.jobDept || '',
    'Entity': o.job?.entity || o.jobEntity || '',
    'Offer status': o.status || '',
    'Candidate response': o.candidateStatus || 'Pending candidate',
    'Start date': o.startDate || '',
    'Created date': o.createdDate || '',
    ...(canViewSalary ? { 'Salary': o.salary ?? '', 'Currency': o.currency || '', 'Basic salary': o.basicSalary ?? '', 'Variable pay': o.variablePay ?? '' } : {}),
  }));
}
