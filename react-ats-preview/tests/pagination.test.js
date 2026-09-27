import test from "node:test";
import assert from "node:assert/strict";
import { fetchAllPages } from "../src/pagination.js";

test("loads 1,201 profiles across pages and preserves query filters", async () => {
  const candidates = Array.from({ length: 1201 }, (_, id) => ({ id, name: `Candidate ${id}` }));
  const pages = [];
  const result = await fetchAllPages("/candidates?pageSize=500&source=referral", async path => {
    const url = new URL(path, "http://test.local");
    assert.equal(url.searchParams.get("source"), "referral");
    assert.equal(url.searchParams.get("pageSize"), "500");
    const page = Number(url.searchParams.get("page"));
    pages.push(page);
    return { data: candidates.slice((page - 1) * 500, page * 500), meta: { hasNext: page < 3 } };
  });
  assert.deepEqual(pages, [1, 2, 3]);
  assert.deepEqual(result, candidates);
});

test("handles an empty database", async () => {
  assert.deepEqual(await fetchAllPages("/candidates", async () => ({ data: [], meta: { hasNext: false } })), []);
});

test("does not return a partial count when a later page fails", async () => {
  await assert.rejects(fetchAllPages("/candidates", async path => {
    if (path.endsWith("page=2")) throw new Error("Network failure");
    return { data: [{ id: 1 }], meta: { hasNext: true } };
  }), /Network failure/);
});

test("deduplicates overlapping pages", async () => {
  const result = await fetchAllPages("/candidates", async path => path.endsWith("page=1")
    ? { data: [{ id: 1 }, { id: 2 }], meta: { hasNext: true } }
    : { data: [{ id: 2 }, { id: 3 }], meta: { hasNext: false } });
  assert.deepEqual(result.map(row => row.id), [1, 2, 3]);
});

test("rejects missing metadata and repeated pages", async () => {
  await assert.rejects(fetchAllPages("/candidates", async () => ({ data: [] })), /pagination details/);
  await assert.rejects(fetchAllPages("/candidates", async () => ({ data: [{ id: 1 }], meta: { hasNext: true } })), /no progress/);
});
