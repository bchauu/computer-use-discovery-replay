import { dateLabel, money } from '../lib/data.ts';
import type { Account } from '../lib/data.ts';
import { Empty } from './Empty.tsx';

export function PendingHolds({ account }: { account: Account }) {
  return (
    <>
      {[
        ['Pending debit authorizations', account.pending],
        ['Active holds', account.holds],
      ].map(([title, items]) => {
        const entries = items as Account['holds'];
        return (
          <section className="panel" key={title as string}>
            <div className="panel-heading">
              <h2>{title as string}</h2>
              <span>{entries.length} items</span>
            </div>
            {entries.length ? (
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Description</th>
                      <th>Placed on</th>
                      <th>Estimated release</th>
                      <th className="numeric">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {entries.map((item) => (
                      <tr key={item.id}>
                        <td>
                          <strong>{item.description}</strong>
                        </td>
                        <td>{dateLabel(item.date)}</td>
                        <td>{dateLabel(item.release)}</td>
                        <td className="numeric">{money(item.cents)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <Empty title={`No ${String(title).toLowerCase()}`}>
                There are no active items in this synthetic snapshot.
              </Empty>
            )}
          </section>
        );
      })}
      <div className="notice">
        Release dates are illustrative estimates. Pending amounts have not posted; neither this view
        nor the history view moves money.
      </div>
    </>
  );
}
