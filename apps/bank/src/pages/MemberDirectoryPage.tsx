import { useState } from 'react';
import type { FormEvent } from 'react';
import { AS_OF, dateLabel, searchMembers, verifyMember } from '../lib/data.ts';
import type { Member } from '../lib/data.ts';
import { Empty } from '../components/Empty.tsx';

export function MemberDirectoryPage({ onVerified }: { onVerified: (member: Member) => void }) {
  const [name, setName] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [candidates, setCandidates] = useState<Member[] | null>(null);
  const [lastFour, setLastFour] = useState('');
  const [error, setError] = useState('');
  function clearResults() {
    setCandidates(null);
    setLastFour('');
    setError('');
  }
  function search(event: FormEvent) {
    event.preventDefault();
    setLastFour('');
    setError('');
    setCandidates(searchMembers(name, birthDate));
  }
  function verify(event: FormEvent) {
    event.preventDefault();
    const result = verifyMember(candidates ?? [], lastFour);
    setLastFour('');
    if (result === 'no-match')
      setError('Verification did not match. Check the customer’s information and try again.');
    else if (result === 'ambiguous')
      setError(
        'Multiple members still match. Stop and ask a supervisor to resolve the identity; no account information has been opened.',
      );
    else {
      setError('');
      onVerified(result);
    }
  }
  return (
    <>
      <header className="page-heading">
        <div>
          <p className="eyebrow">Member services / Step 1 of 2</p>
          <h1>Find and verify a member</h1>
          <p>Search by name and date of birth, then verify before viewing accounts.</p>
        </div>
      </header>
      <section className="panel">
        <form className="filters" onSubmit={search} autoComplete="off">
          <div>
            <label htmlFor="member-name">Full name</label>
            <input
              id="member-name"
              required
              value={name}
              placeholder="e.g. Alex Morgan"
              onChange={(e) => {
                setName(e.target.value);
                clearResults();
              }}
            />
          </div>
          <div>
            <label htmlFor="member-birth-date">Date of birth</label>
            <input
              id="member-birth-date"
              type="date"
              required
              max={AS_OF}
              value={birthDate}
              onInput={(e) => {
                setBirthDate(e.currentTarget.value);
                clearResults();
              }}
            />
          </div>
          <button className="button primary" type="submit">
            Search members
          </button>
          <button
            className="button"
            type="button"
            onClick={() => {
              setName('');
              setBirthDate('');
              clearResults();
            }}
          >
            Reset
          </button>
        </form>
      </section>
      <section className="panel">
        <div className="panel-heading">
          <h2>{candidates?.length ? 'Step 2 · Verify customer' : 'Member lookup'}</h2>
          <span role="status">
            {candidates === null
              ? 'Awaiting search'
              : `${candidates.length} matching profile${candidates.length === 1 ? '' : 's'}`}
          </span>
        </div>
        {candidates === null ? (
          <Empty title="Find a member to get started">
            Enter the customer’s full name and date of birth. Account information stays hidden until
            verification succeeds.
          </Empty>
        ) : !candidates.length ? (
          <Empty title="No members found">
            Check the full name and date of birth, then search again.
          </Empty>
        ) : (
          <>
            <div className="verification-summary">
              <strong>{name.trim()}</strong>
              <p>Date of birth: {dateLabel(birthDate)}</p>
              <p>
                {candidates.length > 1
                  ? 'Multiple profiles match. Verify the customer to narrow the match.'
                  : 'A matching profile was found. Verification is required.'}
              </p>
            </div>
            <form className="filters" onSubmit={verify} autoComplete="off">
              <div>
                <label htmlFor="ssn-last-four">Last four digits of SSN</label>
                <input
                  id="ssn-last-four"
                  type="password"
                  inputMode="numeric"
                  pattern="[0-9]{4}"
                  minLength={4}
                  maxLength={4}
                  required
                  value={lastFour}
                  autoComplete="off"
                  aria-invalid={!!error}
                  aria-describedby={error ? 'verification-error' : 'verification-help'}
                  onChange={(e) => {
                    setLastFour(e.target.value);
                    setError('');
                  }}
                />
              </div>
              <button className="button primary" type="submit">
                Verify customer
              </button>
            </form>
            {error && (
              <p id="verification-error" className="error" role="alert">
                {error}
              </p>
            )}
            <p id="verification-help" className="panel-footnote">
              Training simulation only. Enter synthetic customer details.
            </p>
          </>
        )}
      </section>
    </>
  );
}
