import type { Account } from './data.ts';

export const currentRoute = () => window.location.hash.slice(1) || '/';

export const accountUrl = (account: Account, tab = 'overview') =>
  `#/members/${account.memberId}/accounts/${account.id}/${tab}`;
