import { available, money } from '../lib/data.ts';
import type { Account } from '../lib/data.ts';
import { accountUrl } from '../lib/routes.ts';
import { Badge } from './Badge.tsx';

export function AccountTable({ list }: { list: Account[] }) {
  return (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            <th>Account</th>
            <th>Number</th>
            <th>Status</th>
            <th className="numeric">Current balance</th>
            <th className="numeric">Available balance</th>
            <th>
              <span className="sr-only">Action</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {list.map((a) => (
            <tr key={a.id}>
              <td>
                <strong>{a.name}</strong>
                <small>{a.type} · USD</small>
              </td>
              <td className="mono">•••• {a.lastFour}</td>
              <td>
                <Badge>Active</Badge>
              </td>
              <td className="numeric">{money(a.currentCents)}</td>
              <td className="numeric">{money(available(a))}</td>
              <td>
                <a
                  className="row-link"
                  href={accountUrl(a)}
                  aria-label={`Open ${a.name} ending ${a.lastFour}`}
                >
                  Open account <span aria-hidden="true">↗</span>
                </a>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
