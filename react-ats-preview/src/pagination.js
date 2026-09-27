// Keep pagination metadata until every page has loaded. Never present a partial
// result as the full collection if a later request fails.
export async function fetchAllPages(path, request) {
  const url = new URL(path, "http://pagination.local");
  const rows = new Map();
  for (let page = 1; ; page += 1) {
    url.searchParams.set("page", String(page));
    const response = await request(url.pathname + url.search);
    if (!Array.isArray(response?.data) || typeof response?.meta?.hasNext !== "boolean") {
      throw new Error("Unable to load the complete list: missing pagination details.");
    }
    const before = rows.size;
    for (const row of response.data) rows.set(row.id, row);
    if (!response.meta.hasNext) return [...rows.values()];
    if (rows.size === before) {
      throw new Error("Unable to load the complete list: pagination made no progress.");
    }
  }
}
