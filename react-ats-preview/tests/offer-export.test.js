import test from 'node:test';
import assert from 'node:assert/strict';
import * as XLSX from 'xlsx';
import { offerExportRows } from '../src/offer-export.js';
const offer = { id: 'offer-1', cand: { name: 'أحمد', email: '=literal@example.com' }, job: { title: 'Engineer', dept: 'Technical', entity: 'Karm Egypt' }, salary: 26000, basicSalary: 26000, variablePay: 0, currency: 'EGP', status: 'Approved', candidateStatus: 'Pending candidate' };
test('Excel round-trip preserves numbers, Arabic and literal text', () => {
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet(offerExportRows([offer], true)), 'Offers');
  const restored = XLSX.read(XLSX.write(book, { type: 'buffer', bookType: 'xlsx' }), { type: 'buffer' });
  const row = XLSX.utils.sheet_to_json(restored.Sheets.Offers)[0];
  assert.equal(row.Candidate, 'أحمد');
  assert.equal(row.Salary, 26000);
  assert.equal(row['Variable pay'], 0);
  assert.equal(restored.Sheets.Offers.C2.t, 's');
  assert.equal(restored.Sheets.Offers.C2.f, undefined);
});
test('salary-restricted export omits all compensation columns', () => {
  const row = offerExportRows([offer], false)[0];
  for (const key of ['Salary', 'Basic salary', 'Variable pay', 'Currency']) assert.equal(key in row, false);
  assert.equal(row['Offer status'], 'Approved');
});
