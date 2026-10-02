import { Empty } from './Empty.tsx';

export function VerificationRequired() {
  return (
    <Empty title="Verify a member first">
      Find and verify the customer before viewing account information.{' '}
      <a href="#/members">Find and verify a member</a>
    </Empty>
  );
}
