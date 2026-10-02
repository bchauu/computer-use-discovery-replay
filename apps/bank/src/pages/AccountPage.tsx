import { dateLabel } from '../lib/data.ts';
import type { Account, Member } from '../lib/data.ts';
import { accountUrl } from '../lib/routes.ts';
import { Badge } from '../components/Badge.tsx';
import { AccountOverview } from '../components/AccountOverview.tsx';
import { PendingHolds } from '../components/PendingHolds.tsx';
import { MemberHeader } from '../components/MemberHeader.tsx';
import { TransactionHistory } from '../components/TransactionHistory.tsx';

export function AccountPage({
  account,
  member,
  tab,
}: {
  account: Account;
  member: Member;
  tab: string;
}) {
  return (
    <>
      <header className="page-heading">
        <div>
          <p className="eyebrow">Account services / {account.type}</p>
          <h1>
            {account.name} <span className="heading-number">•••• {account.lastFour}</span>
          </h1>
          <p>USD · Account opened {dateLabel(account.opened)}</p>
        </div>
        <Badge>Active account</Badge>
      </header>
      <MemberHeader member={member} />
      <nav className="tabs" aria-label="Account views">
        {[
          ['overview', 'Overview'],
          ['history', 'Transaction history'],
          ['pending', 'Pending & holds'],
        ].map(([id, label]) => (
          <a key={id} href={accountUrl(account, id)} aria-current={tab === id ? 'page' : undefined}>
            {label}
            {id === 'pending' && <span>{account.pending.length + account.holds.length}</span>}
          </a>
        ))}
      </nav>
      {tab === 'overview' ? (
        <AccountOverview account={account} member={member} />
      ) : tab === 'history' ? (
        <TransactionHistory key={account.id} account={account} />
      ) : (
        <PendingHolds account={account} />
      )}
    </>
  );
}
