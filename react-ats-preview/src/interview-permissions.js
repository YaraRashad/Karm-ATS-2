export function canEditInterviewScore({role, canEditSubmitted}) {
  return !!canEditSubmitted || String(role || '').trim().toLowerCase() === 'recruiter';
}
export function canSubmitInterviewScore({role, canEditSubmitted, ownsInterview}) {
  return canEditInterviewScore({role, canEditSubmitted}) || !!ownsInterview;
}
