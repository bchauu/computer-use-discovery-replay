import assert from 'node:assert/strict';
import { chromium } from 'playwright';

// Start `npm run dev:bank` first. These are synthetic UI checks, not AI evidence.
const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('http://127.0.0.1:5174');
  await page.getByRole('heading', { name: 'Service workspace' }).waitFor();
  await page.getByRole('link', { name: 'Find a member', exact: false }).click();
  await page.getByRole('heading', { name: 'Find a member to get started' }).waitFor();
  assert.equal(await page.locator('tbody tr').count(), 0);
  async function verify(name, dob, lastFour) {
    await page.getByLabel('Full name').fill(name);
    await page.getByLabel('Date of birth').fill(dob);
    await page.getByRole('button', { name: 'Search members' }).click();
    await page.getByLabel('Last four digits of SSN').fill(lastFour);
    await page.getByRole('button', { name: 'Verify customer' }).click();
  }
  await verify('Alex Morgan', '1988-04-12', '0000');
  await page.getByRole('alert').waitFor();
  assert.equal(await page.locator('tbody tr').count(), 0);
  await page.getByLabel('Last four digits of SSN').fill('4829');
  await page.getByRole('button', { name: 'Verify customer' }).click();
  await page.getByRole('link', { name: 'Open Everyday Checking ending 4821' }).click();
  await page.getByText('$4,923.98', { exact: true }).waitFor();
  await page.getByRole('link', { name: 'Transaction history', exact: true }).click();
  await page.getByRole('heading', { name: 'Posted transaction history' }).waitFor();
  assert.equal(await page.locator('tbody tr').count(), 8);
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  assert.equal(await page.locator('tbody tr').count(), 6);
  assert.equal(await page.getByRole('button', { name: 'Next', exact: true }).isDisabled(), true);
  await page.getByLabel('Transaction type').selectOption('credits');
  assert.equal(await page.locator('tbody tr').count(), 2);
  await page.getByLabel('History period').selectOption('7');
  assert.equal(await page.locator('tbody tr').count(), 4);
  assert.equal(await page.getByLabel('Transaction type').inputValue(), 'all');
  await page.getByLabel('History period').selectOption('14');
  assert.equal(await page.locator('tbody tr').count(), 8);
  await page.getByLabel('History period').selectOption('latest');
  assert.equal(await page.locator('tbody tr').count(), 1);
  assert.equal(await page.getByLabel('Transaction type').isDisabled(), true);
  await page.getByText('TX-100001', { exact: true }).waitFor();
  await page.getByLabel('History period').selectOption('30');
  assert.equal(await page.getByLabel('Transaction type').isDisabled(), false);
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await page.getByLabel('History period').selectOption('7');
  assert.equal(await page.locator('tbody tr').count(), 4);
  assert.equal(await page.getByRole('button', { name: 'Previous', exact: true }).isDisabled(), true);
  await page.getByRole('link', { name: 'Pending & holds' }).click();
  await page.getByText('Check deposit hold', { exact: true }).waitFor();
  await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: 'Accounts', exact: true }).click();
  await page.getByRole('heading', { name: 'Deposit accounts', exact: true }).waitFor();
  assert.equal(await page.locator('tbody tr').count(), 2);
  await page.getByRole('link', { name: 'Change member', exact: true }).click();
  await page.getByRole('heading', { name: 'Find and verify a member' }).waitFor();
  await page.goto('http://127.0.0.1:5174/#/members/12345/accounts/a101/history');
  await page.getByRole('heading', { name: 'Verify a member first' }).waitFor();
  await page.getByRole('link', { name: 'Find and verify a member', exact: true }).click();
  await verify('Jordan Lee', '1992-09-06', '7150');
  await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: 'Accounts', exact: true }).click();
  await page.getByLabel('Account type').selectOption('Savings');
  await page.getByRole('heading', { name: 'No matching accounts' }).waitFor();
  await page.getByRole('link', { name: 'Change member', exact: true }).click();
  await page.getByRole('heading', { name: 'Find and verify a member' }).waitFor();
  await verify('Taylor Reed', '1995-02-18', '0264');
  await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: 'Transactions', exact: true }).click();
  await page.getByRole('link', { name: 'View history', exact: true }).click();
  await page.getByRole('heading', { name: 'No posted transactions' }).waitFor();
  await page.reload();
  await page.getByRole('heading', { name: 'Verify a member first' }).waitFor();
  // Deliberately mismatched member/account must not open a different member's account.
  await page.goto('http://127.0.0.1:5174/#/members/67890/accounts/a101/overview');
  await page.getByRole('heading', { name: 'Page not found' }).waitFor();
  assert.deepEqual(errors, []);
  console.info('Bank mock: manual navigation, lookup, balances, paging, filters, holds, empty states, and route validation passed.');
} finally {
  await browser.close();
}
