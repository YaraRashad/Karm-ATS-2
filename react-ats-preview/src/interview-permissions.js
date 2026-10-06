export function canSubmitInterviewScore({ role, canEditSubmitted, ownsInterview }) {
  return !!canEditSubmitted || !!ownsInterview || String(role || '').toLowerCase() === 'recruiter';
}
