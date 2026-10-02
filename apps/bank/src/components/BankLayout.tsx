import type { ReactNode } from 'react';
import { AS_OF } from '../lib/data.ts';
import { Badge } from './Badge.tsx';

const navigation = [
  { label: 'Workspace', route: '/', icon: '▦' },
  { label: 'Members', route: '/members', icon: '♙' },
  { label: 'Accounts', route: '/accounts', icon: '▤' },
  { label: 'Transactions', route: '/transactions', icon: '⇄' },
];

interface BankLayoutProps {
  section: string;
  children: ReactNode;
  automation: ReactNode;
}

export function BankLayout({ section, children, automation }: BankLayoutProps) {
  return (
    <div className="shell">
      <a
        className="skip-link"
        href="#content"
        onClick={(event) => {
          event.preventDefault();
          document.getElementById('content')?.focus();
        }}
      >
        Skip to content
      </a>
      <aside className="sidebar">
        <a href="#/" className="brand">
          <span className="brand-mark" aria-hidden="true">
            N
          </span>
          <span>
            NORTHLINE<small>Staff workspace</small>
          </span>
        </a>
        <div className="nav-label">SERVICING</div>
        <nav aria-label="Main navigation">
          {navigation.map(({ label, route, icon }) => (
            <a key={label} href={`#${route}`} aria-current={section === label ? 'page' : undefined}>
              <span className="nav-icon" aria-hidden="true">
                {icon}
              </span>
              {label}
            </a>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <span className="status-dot" />
          Training environment
          <p>
            Fictional institution
            <br />
            Synthetic member data only
          </p>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div>
            <span className="muted">Branch</span>
            <strong>001 · Downtown</strong>
            <span className="divider" />
            <span>Member services</span>
          </div>
          <div>
            <Badge neutral>Read-only demo</Badge>
            <span className="staff-avatar">DS</span>
            <span>Demo staff</span>
          </div>
        </header>
        <main id="content" tabIndex={-1}>
          {children}
        </main>
        <footer>
          Northline · Staff servicing mock
          <span>Snapshot: {AS_OF} · No live banking connection</span>
        </footer>
      </div>
      {automation}
    </div>
  );
}
