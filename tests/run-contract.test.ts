import assert from 'node:assert/strict';
import { test } from 'node:test';
import { transactionOutputSchema } from '../src/contracts/run.ts';

test('transaction outputs preserve UI money and derive exact USD minor units', () => {
  const output = transactionOutputSchema.parse({
    account: { accountType: 'checking', accountLastFour: '4821' },
    transactions: [{
      postedDate: 'Sep 28, 2026', description: 'Payroll', reference: 'TX-100001', status: 'Posted',
      debit: null, credit: '$2,450.00',
    }],
  });
  assert.deepEqual(output.transactions[0]?.amount, { display: '$2,450.00', currency: 'USD', minorUnits: 245000 });
  assert.equal(output.transactions[0]?.direction, 'credit');
});

test('transaction outputs reject malformed or ambiguous amount columns', () => {
  const base = { postedDate: 'Sep 28, 2026', description: 'Payroll', reference: 'TX-100001', status: 'Posted' };
  assert.equal(transactionOutputSchema.safeParse({ account: { accountType: 'checking', accountLastFour: '4821' }, transactions: [{ ...base, debit: '$1.00', credit: '$2.00' }] }).success, false);
  assert.equal(transactionOutputSchema.safeParse({ account: { accountType: 'checking', accountLastFour: '4821' }, transactions: [{ ...base, debit: null, credit: 'USD 2.00' }] }).success, false);
});
