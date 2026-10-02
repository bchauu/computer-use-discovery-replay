import { AS_OF, available, dateLabel, money } from '../lib/data.ts';
import type { Account, Member } from '../lib/data.ts';
import { accountUrl } from '../lib/routes.ts';

export function AccountOverview({ account, member }: { account: Account; member: Member }) {
  const pendingTotal = account.pending.reduce((total, item) => total + item.cents, 0);
  const holdTotal = account.holds.reduce((total, item) => total + item.cents, 0);
  return (
    <>
      <div className="balance-grid">
        <section className="balance-card">
          <span>Current balance</span>
          <strong>{money(account.currentCents)}</strong>
          <p>Posted account balance</p>
        </section>
        <section className="balance-card emphasized">
          <span>Available balance</span>
          <strong>{money(available(account))}</strong>
          <p>After pending debits and active holds</p>
        </section>
        <section className="balance-card compact">
          <span>Pending debits</span>
          <strong>{money(pendingTotal)}</strong>
          <span>
            Active holds <b>{money(holdTotal)}</b>
          </span>
        </section>
      </div>
      <p className="asof">Balances as of {dateLabel(AS_OF)}, 9:00 AM UTC · Synthetic snapshot</p>
      <section className="panel">
        <div className="panel-heading">
          <h2>Account information</h2>
          <a href={accountUrl(account, 'history')} className="row-link">
            View transaction history →
          </a>
        </div>
        <dl className="details">
          <div>
            <dt>Account holder</dt>
            <dd>{member.name}</dd>
          </div>
          <div>
            <dt>Account type</dt>
            <dd>{account.type}</dd>
          </div>
          <div>
            <dt>Account number</dt>
            <dd>•••• {account.lastFour}</dd>
          </div>
          <div>
            <dt>Branch</dt>
            <dd>{member.branch}</dd>
          </div>
          <div>
            <dt>Ownership</dt>
            <dd>Individual</dd>
          </div>
          <div>
            <dt>Currency</dt>
            <dd>USD · US dollar</dd>
          </div>
        </dl>
      </section>
      <div className="notice">
        Mock balance rule: available = current balance − pending debit authorizations − separate
        active holds. Holds shown here do not duplicate pending authorizations.
      </div>
    </>
  );
}
