export function positionJoiners(job, applications, candidates, offers) {
  if (String(job.status).toLowerCase() !== 'closed') return [];
  const byCandidate = new Map();
  const apps = applications.filter(app => String(app.jobId) === String(job.id));
  const matchingOffers = offers.filter(offer => String(offer.jobId) === String(job.id) || apps.some(app => app.id === offer.applicationId));
  const accepted = matchingOffers.filter(offer => String(offer.status).toLowerCase() === 'accepted');
  const add = (candidateId, name, date) => {
    const key = candidateId || name;
    if (!key) return;
    const existing = byCandidate.get(key);
    if (!existing) byCandidate.set(key, { name: name || 'Not recorded', date: date || '' });
    else if (!existing.date && date) existing.date = date;
  };
  for (const app of apps.filter(app => app.stage === 'Hired')) {
    const candidate = candidates.find(c => c.id === app.candidateId);
    const offer = accepted.filter(o => o.applicationId === app.id).sort((a, b) => String(b.createdDate || '').localeCompare(String(a.createdDate || '')))[0];
    add(app.candidateId, candidate?.name || offer?.candidateName, offer?.startDate);
  }
  for (const offer of accepted.sort((a, b) => String(b.createdDate || '').localeCompare(String(a.createdDate || '')))) {
    const app = apps.find(a => a.id === offer.applicationId);
    const id = app?.candidateId || offer.candidateId;
    const candidate = candidates.find(c => c.id === id);
    add(id, candidate?.name || offer.candidateName, offer.startDate);
  }
  return [...byCandidate.values()];
}
