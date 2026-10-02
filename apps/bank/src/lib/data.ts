// Public synthetic fixtures only. Never put real banking data in a frontend bundle.
export const AS_OF = '2026-09-29';
export const RANGE_START = '2026-08-31';
export type AccountType = 'Checking' | 'Savings';
export interface Member {
  id: string;
  name: string;
  initials: string;
  since: string;
  branch: string;
  birthDate: string;
  ssnLastFour: string;
}
export interface Hold {
  id: string;
  description: string;
  cents: number;
  date: string;
  release: string;
}
export interface Account {
  id: string;
  memberId: string;
  type: AccountType;
  name: string;
  lastFour: string;
  currentCents: number;
  opened: string;
  pending: Hold[];
  holds: Hold[];
}
export interface Transaction {
  id: string;
  accountId: string;
  date: string;
  description: string;
  cents: number;
}
export const members: Member[] = [
  {
    id: '12345',
    name: 'Alex Morgan',
    initials: 'AM',
    since: '2018-04-12',
    branch: '001 · Downtown',
    birthDate: '1988-04-12',
    ssnLastFour: '4829',
  },
  {
    id: '67890',
    name: 'Jordan Lee',
    initials: 'JL',
    since: '2021-09-06',
    branch: '001 · Downtown',
    birthDate: '1992-09-06',
    ssnLastFour: '7150',
  },
  {
    id: '24680',
    name: 'Taylor Reed',
    initials: 'TR',
    since: '2025-02-18',
    branch: '002 · Northside',
    birthDate: '1995-02-18',
    ssnLastFour: '0264',
  },
];
export const accounts: Account[] = [
  {
    id: 'a101',
    memberId: '12345',
    type: 'Checking',
    name: 'Everyday Checking',
    lastFour: '4821',
    currentCents: 524890,
    opened: '2018-04-12',
    pending: [
      {
        id: 'p1',
        description: 'Harbor Market · debit card authorization',
        cents: 6842,
        date: '2026-09-29',
        release: '2026-10-02',
      },
      {
        id: 'p2',
        description: 'Elm Street Coffee · debit card authorization',
        cents: 650,
        date: '2026-09-29',
        release: '2026-10-02',
      },
    ],
    holds: [
      {
        id: 'h1',
        description: 'Check deposit hold',
        cents: 25000,
        date: '2026-09-28',
        release: '2026-09-30',
      },
    ],
  },
  {
    id: 'a102',
    memberId: '12345',
    type: 'Savings',
    name: 'Primary Savings',
    lastFour: '9036',
    currentCents: 1875025,
    opened: '2018-04-12',
    pending: [],
    holds: [],
  },
  {
    id: 'a201',
    memberId: '67890',
    type: 'Checking',
    name: 'Everyday Checking',
    lastFour: '7150',
    currentCents: 132480,
    opened: '2021-09-06',
    pending: [],
    holds: [],
  },
  {
    id: 'a301',
    memberId: '24680',
    type: 'Savings',
    name: 'Primary Savings',
    lastFour: '2264',
    currentCents: 50000,
    opened: '2025-02-18',
    pending: [],
    holds: [],
  },
];
const entries: Array<[string, string, number]> = [
  ['2026-09-28', 'Payroll · Northshore Design', 245000],
  ['2026-09-27', 'Harbor Market', -8432],
  ['2026-09-25', 'City Utilities', -12640],
  ['2026-09-24', 'Transfer to savings', -30000],
  ['2026-09-22', 'Oak & Pine Books', -2895],
  ['2026-09-20', 'Metro Transit', -2500],
  ['2026-09-18', 'Elm Street Coffee', -650],
  ['2026-09-16', 'Internet service', -7500],
  ['2026-09-14', 'Payroll · Northshore Design', 245000],
  ['2026-09-12', 'Harbor Market', -9720],
  ['2026-09-10', 'Mobile service', -5500],
  ['2026-09-07', 'Maple Pharmacy', -1849],
  ['2026-09-04', 'Rent payment', -165000],
  ['2026-08-31', 'Metro Transit', -2500],
  ['2026-08-30', 'Prior-period purchase', -3200],
];
export const transactions: Transaction[] = [
  ...entries.map(([date, description, cents], i) => ({
    id: `TX-${100001 + i}`,
    accountId: 'a101',
    date,
    description,
    cents,
  })),
  {
    id: 'TX-200001',
    accountId: 'a102',
    date: '2026-09-24',
    description: 'Transfer from checking',
    cents: 30000,
  },
  {
    id: 'TX-200002',
    accountId: 'a102',
    date: '2026-08-31',
    description: 'Interest credit',
    cents: 225,
  },
  {
    id: 'TX-300001',
    accountId: 'a201',
    date: '2026-09-26',
    description: 'Direct deposit',
    cents: 180000,
  },
  {
    id: 'TX-300002',
    accountId: 'a201',
    date: '2026-09-23',
    description: 'Greenway Grocer',
    cents: -7230,
  },
];
export function money(cents: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
}
export function dateLabel(date: string) {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}
export function available(account: Account) {
  return (
    account.currentCents -
    [...account.pending, ...account.holds].reduce((sum, item) => sum + item.cents, 0)
  );
}
export function searchMembers(name: string, birthDate: string, source: Member[] = members) {
  const normalize = (value: string) => value.trim().replace(/\s+/g, ' ').toLowerCase();
  const value = normalize(name);
  return value && birthDate
    ? source.filter((member) => normalize(member.name) === value && member.birthDate === birthDate)
    : [];
}
export function verifyMember(
  candidates: Member[],
  lastFour: string,
): Member | 'no-match' | 'ambiguous' {
  if (!/^\d{4}$/.test(lastFour)) return 'no-match';
  const matches = candidates.filter((member) => member.ssnLastFour === lastFour);
  return matches.length === 1 ? matches[0]! : matches.length ? 'ambiguous' : 'no-match';
}
export type HistoryPeriod = '30' | '14' | '7' | 'latest';
export function historyStart(period: Exclude<HistoryPeriod, 'latest'>) {
  const date = new Date(`${AS_OF}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - Number(period) + 1);
  return date.toISOString().slice(0, 10);
}
export function history(
  accountId: string,
  direction: 'all' | 'debits' | 'credits' = 'all',
  period: HistoryPeriod = '30',
) {
  const rows = transactions
    .filter(
      (t) =>
        t.accountId === accountId &&
        (period === 'latest' || t.date >= historyStart(period)) &&
        t.date <= AS_OF &&
        (period === 'latest' ||
          direction === 'all' ||
          (direction === 'debits' ? t.cents < 0 : t.cents > 0)),
    )
    .sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id));
  return period === 'latest' ? rows.slice(0, 1) : rows;
}
