import { test } from 'node:test';
import assert from 'node:assert/strict';
import { uniqueLeads, rowsFromCsvText, normalizeLeadInput } from './dataCenter.js';

test('uniqueLeads keeps the first valid email and infers university', () => {
  const { leads, skippedInvalid, skippedDuplicate } = uniqueLeads([
    { name: 'Akbar, Huzoor', email: 'akbar@ohio.edu' },
    { name: 'Dup', email: 'AKBAR@ohio.edu' },
    { name: 'Bad', email: 'not-an-email' },
    { name: 'Nasaw', email: 'dnasaw@gc.cuny.edu' },
    { name: 'Personal', email: 'frank43081@gmail.com' },
  ]);

  assert.equal(leads.length, 3);
  assert.equal(skippedDuplicate, 1);
  assert.equal(skippedInvalid, 1);
  assert.equal(leads[0].university, 'Ohio University');
  assert.equal(leads[0].country, 'United States');
  assert.equal(leads[1].university, 'CUNY Graduate Center');
  assert.equal(leads[2].university, null);
  assert.equal(leads[2].country, null);
});

test('normalizeLeadInput rejects invalid email', () => {
  assert.equal(normalizeLeadInput({ name: 'X', email: '' }), null);
  assert.equal(normalizeLeadInput({ name: 'X', email: 'nope' }), null);
});

test('rowsFromCsvText reads Name/Email/Status and infers notes column', () => {
  const rows = rowsFromCsvText(
    'Name,Email,Status,,\n"Akbar, Huzoor",akbar@ohio.edu,Yes,sent\n',
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0].name, 'Akbar, Huzoor');
  assert.equal(rows[0].email, 'akbar@ohio.edu');
  assert.equal(rows[0].status, 'Yes');
  assert.equal(rows[0].notes, 'sent');
});
