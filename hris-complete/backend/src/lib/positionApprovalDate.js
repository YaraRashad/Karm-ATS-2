// Date-only input avoids browser/server timezone shifts. Empty input clears the date.
export function approvalDateUpdate(value) {
  if (value === undefined) return {};
  if (value === null || value === '') return { headcountApprovedAt: null };
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error('Approval date must be a valid date (YYYY-MM-DD).');
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new Error('Approval date must be a valid date (YYYY-MM-DD).');
  }
  return { headcountApprovedAt: date };
}
