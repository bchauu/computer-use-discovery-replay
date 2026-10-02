import { useState } from 'react';
import type { ReactNode } from 'react';
import { accounts, members } from '../lib/data.ts';
import type { Member } from '../lib/data.ts';
import { useBankRoute } from '../hooks/useBankRoute.ts';
import { BankLayout } from '../components/BankLayout.tsx';
import { Empty } from '../components/Empty.tsx';
import { VerificationRequired } from '../components/VerificationRequired.tsx';
import { HomePage } from '../pages/HomePage.tsx';
import { MemberDirectoryPage } from '../pages/MemberDirectoryPage.tsx';
import { MemberOverviewPage } from '../pages/MemberOverviewPage.tsx';
import { AccountInquiryPage } from '../pages/AccountInquiryPage.tsx';
import { AccountRoute } from '../pages/AccountRoute.tsx';

interface BankRouterProps {
  verifiedMember: Member | null;
  onVerified: (member: Member) => void;
  clearMember: () => void;
  automation: ReactNode;
}

export function BankRouter({
  verifiedMember,
  onVerified,
  clearMember,
  automation,
}: BankRouterProps) {
  const route = useBankRoute(clearMember);
  const [reauthenticated, setReauthenticated] = useState(
    () => window.sessionStorage.getItem('automationReauthenticated') === 'true',
  );
  const [runtimeScenarioResolved, setRuntimeScenarioResolved] = useState(false);

  function verifyMember(member: Member) {
    onVerified(member);
    window.location.hash = `/members/${member.id}`;
  }

  const parts = route.split('/').filter(Boolean);
  const member = members.find((member) => member.id === parts[1]);
  const account = accounts.find(
    (account) => account.id === parts[3] && account.memberId === member?.id,
  );
  const tab = parts[4] || 'overview';
  let section = 'Workspace';
  let content: ReactNode;

  if (route === '/') {
    content = <HomePage />;
  } else if (route === '/members') {
    section = 'Members';
    content = <MemberDirectoryPage onVerified={verifyMember} />;
  } else if (route === '/accounts' || route === '/transactions') {
    const transactions = route === '/transactions';
    section = transactions ? 'Transactions' : 'Accounts';
    content = verifiedMember ? (
      <AccountInquiryPage
        key={`${transactions ? 'transactions' : 'accounts'}-${verifiedMember.id}`}
        member={verifiedMember}
        transactions={transactions}
      />
    ) : (
      <VerificationRequired />
    );
  } else if (parts[0] === 'members' && member && parts.length === 2) {
    section = 'Members';
    content =
      verifiedMember?.id === member.id ? (
        <MemberOverviewPage member={member} />
      ) : (
        <VerificationRequired />
      );
  } else if (
    parts[0] === 'members' &&
    parts[2] === 'accounts' &&
    member &&
    account &&
    parts.length <= 5 &&
    ['overview', 'history', 'pending'].includes(tab)
  ) {
    section = tab === 'history' ? 'Transactions' : 'Accounts';
    content =
      verifiedMember?.id === member.id ? (
        <AccountRoute
          account={account}
          member={member}
          tab={tab}
          reauthenticated={reauthenticated}
          scenarioResolved={runtimeScenarioResolved}
          onReauthenticated={() => setReauthenticated(true)}
          onScenarioResolved={() => setRuntimeScenarioResolved(true)}
        />
      ) : (
        <VerificationRequired />
      );
  } else {
    content = (
      <Empty title="Page not found">
        This member, account, or page is unavailable.{' '}
        <a href="#/members">Return to the member directory.</a>
      </Empty>
    );
  }

  return (
    <BankLayout section={section} automation={automation}>
      {content}
    </BankLayout>
  );
}
