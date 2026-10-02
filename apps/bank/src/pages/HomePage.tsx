import { AS_OF, dateLabel } from '../lib/data.ts';
import { Badge } from '../components/Badge.tsx';

export function HomePage() {
  return (
    <>
      <header className="page-heading">
        <div>
          <p className="eyebrow">Branch operations</p>
          <h1>Service workspace</h1>
          <p>Member and account inquiries, in one place.</p>
        </div>
        <span className="date-pill">{dateLabel(AS_OF)}</span>
      </header>
      <div className="welcome">
        <div>
          <span className="eyebrow">Member services</span>
          <h2>
            Start with the member.
            <br />
            Find the details you need.
          </h2>
          <p>
            Look up a member, review their deposit accounts, or inspect recent account activity.
          </p>
          <a href="#/members" className="button primary">
            Find a member <span aria-hidden="true">→</span>
          </a>
        </div>
        <div className="welcome-side">
          <span className="large-symbol" aria-hidden="true">
            ▤
          </span>
          <strong>Account inquiry</strong>
          <span>Checking · Savings · Transaction history</span>
          <Badge>Read-only workspace</Badge>
        </div>
      </div>
      <div className="section-heading">
        <h2>Service navigation</h2>
        <span>Choose an inquiry to get started</span>
      </div>
      <div className="service-grid">
        {[
          [
            '01',
            'Member directory',
            'Find and verify a member by name and date of birth.',
            '/members',
            'Find members',
          ],
          [
            '02',
            'Deposit accounts',
            'Review checking and savings account balances.',
            '/accounts',
            'Browse accounts',
          ],
          [
            '03',
            'Transaction inquiry',
            'Review latest activity or the last 7, 14, or 30 days.',
            '/transactions',
            'View transactions',
          ],
        ].map(([n, title, desc, url, action]) => (
          <a href={`#${url}`} className="service-card" key={n}>
            <span className="tile-number">{n}</span>
            <h3>{title}</h3>
            <p>{desc}</p>
            <span className="row-link">
              {action} <span aria-hidden="true">→</span>
            </span>
          </a>
        ))}
      </div>
      <section className="panel">
        <div className="panel-heading">
          <h2>Training environment</h2>
          <Badge neutral>Synthetic data</Badge>
        </div>
        <div className="training-grid">
          <p>
            This fictional staff workspace lets you practice the complete manual inquiry flow. No
            real customer information is used.
          </p>
          <div>
            <strong>Synthetic practice customer</strong>
            <p>
              Alex Morgan · April 12, 1988
              <br />
              SSN last four: 4829
            </p>
            <span className="muted">Sample data is pinned to {dateLabel(AS_OF)}.</span>
          </div>
        </div>
      </section>
    </>
  );
}
