import { useState } from 'react';
import { AS_OF, dateLabel, history, historyStart, money } from '../lib/data.ts';
import type { Account, HistoryPeriod } from '../lib/data.ts';
import { Badge } from './Badge.tsx';
import { Empty } from './Empty.tsx';

export function TransactionHistory({ account }: { account: Account }) {
  const [period, setPeriod] = useState<HistoryPeriod>('30');
  const [direction, setDirection] = useState<'all' | 'debits' | 'credits'>('all');
  const [page, setPage] = useState(0);
  const rows = history(account.id, direction, period);
  const periodLabel = period === 'latest' ? 'Latest posted transaction' : `Last ${period} days`;
  const pageSize = 8;
  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
  return (
    <section className="panel">
      <div className="panel-heading">
        <div>
          <h2>Posted transaction history</h2>
          <p>
            {period === 'latest'
              ? `Most recent posted entry available as of ${dateLabel(AS_OF)}`
              : `${dateLabel(historyStart(period))} – ${dateLabel(AS_OF)} · ${period} calendar days, inclusive`}
          </p>
        </div>
        <Badge neutral>{periodLabel}</Badge>
      </div>
      <div className="history-filter">
        <label htmlFor="history-period">History period</label>
        <select
          id="history-period"
          value={period}
          onChange={(e) => {
            setPeriod(e.target.value as HistoryPeriod);
            setDirection('all');
            setPage(0);
          }}
        >
          <option value="30">Last 30 days</option>
          <option value="14">Last 14 days</option>
          <option value="7">Last 7 days</option>
          <option value="latest">Latest posted transaction</option>
        </select>
        <label htmlFor="direction">Transaction type</label>
        <select
          id="direction"
          disabled={period === 'latest'}
          value={direction}
          onChange={(e) => {
            setDirection(e.target.value as typeof direction);
            setPage(0);
          }}
        >
          <option value="all">Debits & credits</option>
          <option value="debits">Debits only</option>
          <option value="credits">Credits only</option>
        </select>
      </div>
      {rows.length ? (
        <>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Posted date</th>
                  <th>Description / Reference</th>
                  <th>Status</th>
                  <th className="numeric">Debit</th>
                  <th className="numeric">Credit</th>
                </tr>
              </thead>
              <tbody>
                {rows.slice(page * pageSize, (page + 1) * pageSize).map((t) => (
                  <tr key={t.id}>
                    <td>{dateLabel(t.date)}</td>
                    <td>
                      <strong>{t.description}</strong>
                      <small className="mono">{t.id}</small>
                    </td>
                    <td>
                      <Badge neutral>Posted</Badge>
                    </td>
                    <td className="numeric">{t.cents < 0 ? money(-t.cents) : '—'}</td>
                    <td className="numeric credit">{t.cents > 0 ? money(t.cents) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="pagination">
            <span role="status">
              Showing {page * pageSize + 1}–{Math.min((page + 1) * pageSize, rows.length)} of{' '}
              {rows.length} transactions
            </span>
            <div>
              <button
                className="button"
                disabled={page === 0}
                onClick={() => setPage((p) => p - 1)}
              >
                Previous
              </button>
              <span>
                Page {page + 1} of {pageCount}
              </span>
              <button
                className="button"
                disabled={page + 1 >= pageCount}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </button>
            </div>
          </div>
        </>
      ) : (
        <Empty title="No posted transactions">
          {period === 'latest'
            ? 'No posted transactions are available for this account.'
            : `No ${direction === 'all' ? 'posted transactions' : direction} for this account in the displayed date range.`}
        </Empty>
      )}
      <p className="panel-footnote">
        Pending authorizations and active holds are listed separately. All values are synthetic.
      </p>
    </section>
  );
}
