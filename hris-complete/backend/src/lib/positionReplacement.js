export function replacementFields(payload, existing = {}) {
  const type = payload.headcountRationale === undefined ? existing.headcountRationale : payload.headcountRationale;
  const value = payload.replacedEmployeeName === undefined ? existing.replacedEmployeeName : payload.replacedEmployeeName;
  if (value != null && typeof value !== 'string') throw new Error('Person being replaced must be a name.');
  const name = (value || '').trim();
  if (name.length > 200) throw new Error('Person being replaced must be 200 characters or fewer.');
  if (String(type || '').trim().toLowerCase() === 'replacement') {
    if (!name) throw new Error('Person being replaced is required for replacement requisitions.');
    return { replacedEmployeeName: name };
  }
  return { replacedEmployeeName: null };
}
