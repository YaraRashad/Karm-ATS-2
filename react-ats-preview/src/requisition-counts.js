export function countRequisitions(rows) {
  const normalize = value => String(value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
  const positions = new Set(rows.map(row => JSON.stringify([
    normalize(row.title), normalize(row.dept), normalize(row.entity),
  ]))).size;
  const headcount = rows.reduce((total, row) => {
    const value = row.headcount;
    if (value == null || String(value).trim() === "") return total + 1;
    const number = Number(value);
    return total + (Number.isFinite(number) && number >= 0 ? number : 1);
  }, 0);
  return { positions, headcount };
}
