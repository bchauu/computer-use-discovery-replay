import type { Account, Member } from '../lib/data.ts';
import { EmployeeReauthentication } from './EmployeeReauthenticationPage.tsx';
import { RuntimeFault } from '../components/RuntimeFault.tsx';
import { SlowHistory } from '../components/SlowHistory.tsx';
import { AccountPage } from './AccountPage.tsx';

interface AccountRouteProps {
  account: Account;
  member: Member;
  tab: string;
  reauthenticated: boolean;
  scenarioResolved: boolean;
  onReauthenticated: () => void;
  onScenarioResolved: () => void;
}

// Injected conditions belong to the synthetic target, not automation recovery logic.
export function AccountRoute({
  account,
  member,
  tab,
  reauthenticated,
  scenarioResolved,
  onReauthenticated,
  onScenarioResolved,
}: AccountRouteProps) {
  const scenario = window.sessionStorage.getItem('automationScenario') ?? '';
  const historyRequested = tab === 'history';

  if (historyRequested && scenario === 'session-expiry-on-history' && !reauthenticated) {
    return <EmployeeReauthentication onSuccess={onReauthenticated} />;
  }

  if (historyRequested && !scenarioResolved) {
    if (
      [
        'permission-denied-on-history',
        'app-error-on-history',
        'unknown-dialog-on-history',
      ].includes(scenario)
    ) {
      return <RuntimeFault scenario={scenario} onDismiss={onScenarioResolved} />;
    }
    if (scenario === 'slow-history-once') {
      return <SlowHistory onReady={onScenarioResolved} />;
    }
  }

  const showNotice =
    historyRequested && !scenarioResolved && scenario === 'known-notice-on-history';
  return (
    <>
      <AccountPage key={account.id} account={account} member={member} tab={tab} />
      {showNotice && <RuntimeFault scenario={scenario} onDismiss={onScenarioResolved} />}
    </>
  );
}
