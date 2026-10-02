import { accounts } from '../lib/data.ts';
import type { Member } from '../lib/data.ts';
import { AccountTable } from '../components/AccountTable.tsx';
import { MemberHeader } from '../components/MemberHeader.tsx';

export function MemberOverviewPage({ member }: { member: Member }) {
  return (
    <>
      <header className="page-heading">
        <div>
          <p className="eyebrow">Member services / Member overview</p>
          <h1>Member overview</h1>
        </div>
      </header>
      <MemberHeader member={member} />
      <section className="panel">
        <div className="panel-heading">
          <h2>Deposit accounts</h2>
          <span>{accounts.filter((a) => a.memberId === member.id).length} accounts</span>
        </div>
        <AccountTable list={accounts.filter((a) => a.memberId === member.id)} />
      </section>
    </>
  );
}
