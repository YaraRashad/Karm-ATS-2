export function canSetHired(role) {
  return role === 'admin';
}

export function requestsHired(stage, displayStage) {
  return [stage, displayStage].some(value => String(value || '').trim().toLowerCase() === 'hired');
}
