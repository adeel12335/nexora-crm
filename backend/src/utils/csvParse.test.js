import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCsv, toCsv } from './csvParse.js';

test('parseCsv handles quoted commas and doubled quotes', () => {
  const rows = parseCsv('Name,Email\n"Akbar, Huzoor",a@b.edu\n"Say ""Hi""",c@d.edu\n');
  assert.deepEqual(rows[0], ['Name', 'Email']);
  assert.deepEqual(rows[1], ['Akbar, Huzoor', 'a@b.edu']);
  assert.deepEqual(rows[2], ['Say "Hi"', 'c@d.edu']);
});

test('toCsv quotes fields that need it', () => {
  const csv = toCsv(['Name', 'Note'], [{ Name: 'Ada', Note: 'Hello, world' }]);
  assert.match(csv, /"Hello, world"/);
});
