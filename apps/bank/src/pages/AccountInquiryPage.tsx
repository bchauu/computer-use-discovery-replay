import { useState } from 'react';
import { accounts } from '../lib/data.ts';
import type { Member } from '../lib/data.ts';
import { accountUrl } from '../lib/routes.ts';
import { AccountTable } from '../components/AccountTable.tsx';
import { MemberHeader } from '../components/MemberHeader.tsx';
import { Empty } from '../components/Empty.tsx';

export function AccountInquiryPage({
  member,
  transactions = false,
}: {
  member: Member;
  transactions?: boolean;
}) {
  const [type, setType] = useState('all');
  const list = accounts.filter(
    (a) => a.memberId === member.id && (type === 'all' || a.type === type),
  );
  return (
    <>
      <header className="page-heading">
        <div>
          <p className="eyebrow">Account services / Inquiry</p>
          <h1>{transactions ? 'Transaction inquiry' : 'Deposit accounts'}</h1>
          <p>
            {transactions
              ? 'Select an account to inspect its transaction history.'
              : 'Review the verified member’s checking and savings accounts.'}
          </p>
        </div>
      </header>
      <MemberHeader member={member} />
      <section className="panel">
        <div className="filters">
          <div>
            <label htmlFor="type-filter">Account type</label>
            <select id="type-filter" value={type} onChange={(e) => setType(e.target.value)}>
              <option value="all">Checking & savings</option>
              <option>Checking</option>
              <option>Savings</option>
            </select>
          </div>
        </div>
      </section>
      <section className="panel">
        <div className="panel-heading">
          <h2>Matching accounts</h2>
          <span role="status">{list.length} accounts</span>
        </div>
        {!list.length ? (
          <Empty title="No matching accounts">
            This member does not have an account of the selected type.
          </Empty>
        ) : transactions ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Account</th>
                  <th>Number</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {list.map((a) => (
                  <tr key={a.id}>
                    <td>{a.name}</td>
                    <td className="mono">•••• {a.lastFour}</td>
                    <td>
                      <a
                        className="row-link"
                        aria-label="View history"
                        href={accountUrl(a, 'history')}
                      >
                        View history <span aria-hidden="true">→</span>
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <AccountTable list={list} />
        )}
      </section>
    </>
  );
}
