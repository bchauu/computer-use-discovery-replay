import assert from 'node:assert/strict';
import { test } from 'node:test';
import { accounts, members, verifyMember, available, searchMembers, history, historyStart, transactions, money, RANGE_START, AS_OF } from '../apps/bank/src/lib/data.ts';

test('lookup requires full name and matching DOB; verification requires a unique exact last-four match', () => {
  assert.equal(searchMembers('  ALEX   MORGAN ', '1988-04-12')[0]?.id, '12345');
  assert.equal(searchMembers('Alex', '1988-04-12').length, 0);
  assert.equal(searchMembers('Alex Morgan', '1988-04-13').length, 0);
  assert.equal(searchMembers('', '').length, 0);
  const matches = searchMembers('Taylor Reed', '1995-02-18');
  assert.equal(verifyMember(matches, '264'), 'no-match');
  assert.deepEqual(verifyMember(matches, '0264'), members[2]);
  assert.equal(verifyMember(matches, '0000'), 'no-match');
  const duplicate = { ...members[0]!, id: 'duplicate', ssnLastFour: '1111' };
  const candidates = searchMembers('Alex Morgan', '1988-04-12', [members[0]!, duplicate]);
  assert.equal(candidates.length, 2);
  assert.deepEqual(verifyMember(candidates, '1111'), duplicate);
  assert.equal(verifyMember([members[0]!, { ...duplicate, ssnLastFour: '4829' }], '4829'), 'ambiguous');
});
test('available balance deducts pending debits and separate holds exactly once', () => {
  assert.equal(available(accounts[0]!), 492398);
  assert.equal(available(accounts[1]!), 1875025);
  assert.equal(money(492398), '$4,923.98');
});
test('history stays within the selected account and inclusive 30-day period', () => {
  const rows = history('a101');
  assert.equal(rows.length, 14);
  assert.ok(rows.some(row => row.date === RANGE_START));
  assert.ok(rows.every(row => row.date >= RANGE_START && row.date <= AS_OF && row.accountId === 'a101'));
  assert.ok(rows.every((row, i) => i === 0 || rows[i-1]!.date >= row.date));
  assert.equal(history('a301').length, 0);
  assert.equal(history('missing').length, 0);
});
test('debit and credit filters partition posted activity without pending items', () => {
  assert.ok(history('a101', 'debits').every(t => t.cents < 0));
  assert.ok(history('a101', 'credits').every(t => t.cents > 0));
  assert.equal(history('a101', 'credits').length + history('a101', 'debits').length, history('a101').length);
});

test('7/14-day periods include the boundary and remain scoped to the account', () => {
  assert.equal(historyStart('7'), '2026-09-23');
  assert.equal(historyStart('14'), '2026-09-16');
  assert.equal(historyStart('30'), RANGE_START);
  assert.equal(history('a101', 'all', '7').length, 4);
  assert.equal(history('a101', 'all', '14').length, 8);
  assert.equal(history('a101', 'all', '14').at(-1)?.date, '2026-09-16');
  assert.equal(history('a201', 'all', '7').at(-1)?.date, '2026-09-23');
  assert.equal(history('a101', 'credits', '7').length, 1);
});

test('latest is posted-only, account-scoped, and not restricted to the last 30 days', () => {
  assert.equal(history('a101', 'all', 'latest')[0]?.id, 'TX-100001');
  assert.equal(history('a102', 'all', 'latest')[0]?.id, 'TX-200001');
  assert.deepEqual(history('a301', 'all', 'latest'), []);
  transactions.push(
    { id: 'old', accountId: 'test-old', date: '2026-07-01', description: 'Older posted entry', cents: -100 },
    { id: 'future', accountId: 'test-old', date: '2026-10-01', description: 'Future entry', cents: 100 },
  );
  try {
    assert.equal(history('test-old').length, 0);
    assert.equal(history('test-old', 'all', 'latest')[0]?.id, 'old');
  } finally {
    transactions.splice(-2);
  }
});
