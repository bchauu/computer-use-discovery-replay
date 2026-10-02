import { useCallback, useState } from 'react';
import type { Member } from './lib/data.ts';
import { BankRouter } from './routing/BankRouter.tsx';
import { AutomationShortcut } from './components/AutomationShortcut.tsx';

export default function App() {
  const [verifiedMember, setVerifiedMember] = useState<Member | null>(null);
  const clearMember = useCallback(() => setVerifiedMember(null), []);

  return (
    <BankRouter
      verifiedMember={verifiedMember}
      onVerified={setVerifiedMember}
      clearMember={clearMember}
      automation={verifiedMember ? <AutomationShortcut /> : null}
    />
  );
}
