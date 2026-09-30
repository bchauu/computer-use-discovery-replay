# Employee banking mock

This increment implements the target application only. The fictional Northline staff workspace is separate from the future automation feature and does not perform any model calls.

## Open it

Run `npm run dev:bank` and open http://127.0.0.1:5174. No backend, database, login, or API key is required. All data is synthetic and bundled with the frontend; this is not a privacy or authorization boundary for real data.

## Manual journeys

- Workspace → Members → enter full name and date of birth → Search members → enter synthetic SSN last four → Verify customer → member overview.
- Once verified, Accounts and Transactions use that same selected member. Choose an account type or open an account/history link without entering a member ID.
- Change member (or visiting Members) clears verification. Refresh also clears the in-memory selection. Direct account/member links require verification for that exact member; mismatched member/account routes remain not-found.

Search matches full names case-insensitively with normalized whitespace plus exact date of birth. Before verification, only the supplied name/DOB and match count appear. Editing lookup fields clears candidate results and the last-four field. Verification must resolve exactly one candidate; incorrect details and unresolved duplicates never open account details. The masked last-four field clears after each verification attempt. Nothing is stored in local/session storage.

This is a frontend training simulation with bundled synthetic fixtures, not a security boundary or production bank authentication. When the automation service launches the page, a post-verification AI shortcut can start the first model-directed discovery journey; ordinary standalone use remains manual.

## Fixtures and semantics

- Alex Morgan · DOB `1988-04-12` · synthetic SSN last four `4829` · internal ID `12345`: checking and savings; checking has two pending authorizations and one distinct deposit hold.
- Jordan Lee · DOB `1992-09-06` · synthetic SSN last four `7150` · internal ID `67890`: checking only; useful for the missing-savings-account state.
- Taylor Reed · DOB `1995-02-18` · synthetic SSN last four `0264` · internal ID `24680`: savings only, with no posted transactions in the period.
- A wrong name/date-of-birth pair produces an explicit no-match result. Duplicate name/DOB and duplicate last-four cases are covered in data tests.

The dataset is pinned to September 29, 2026, 9:00 AM UTC. History offers Last 7 days (September 23–29), Last 14 days (September 16–29), Last 30 days (August 31–September 29), and Latest posted transaction. Ranges include both endpoints and use the fixed snapshot date, not the live clock. Alex's checking history has 4, 8, and 14 entries respectively, shown eight at a time. Latest selects one entry from all available posted fixtures through the snapshot date, excluding pending activity; it is not restricted to 30 days. Fixtures have date-level precision, with reference ID as a deterministic tie-breaker, not intraday chronology. Changing the period resets pagination and the debit/credit filter; changing transaction type resets pagination. Transaction type is disabled in Latest mode to avoid hiding the actual latest entry. Pending activity and holds are separate from posted history.

Money is represented as integer cents. In this mock, available balance equals current balance minus pending debit authorizations minus distinct active holds. This deliberately simplified rule is not a representation of every bank's ledger or funds-availability policy. Current balances are fixture snapshots, not calculated from the limited history window. No transfer, payment, account mutation, or production authentication is implemented.

## Design reference

Oracle's [Account Transactions documentation](https://docs.oracle.com/en/industries/financial-services/banking-branch/14.7.5.0.0/csaug/account-transaction.html) describes staff account inquiry with account selection, date filters, and debit/credit transaction details. The mock uses these general conventions with an original fictional layout; it does not reproduce a particular vendor's product.

This is a navigable baseline with accessible controls, not yet a difficult legacy automation benchmark. Frames, poor markup, or other controlled variants can be introduced later without pretending the current app proves those capabilities.

## Checks

- `npm run test:bank-data`: two-stage lookup/verification including ambiguous identities and leading-zero last four, available balance arithmetic, inclusive date range/account scoping, and debit/credit partitioning.
- `npm run typecheck` and `npm run build`: frontend/backend compilation.
- `npm run test:bank-ui`: Playwright manual-flow checks against the running mock. This is a UI regression test, not genuine LLM discovery evidence.

The six data tests and production build pass. In-app browser checks verified the pre-verification deep-link gate, name/DOB lookup, wrong/correct last four, Accounts/Transactions member-context reuse, history navigation, changing members followed by browser Back, and clearing verification on refresh. A leading-zero last-four value was also exercised in the browser. Previous history checks covered 7/14/30-day filtering, pagination reset, and Latest mode. The updated standalone Playwright script has not been executed in the restricted agent shell.

## Automation integration

The automation loop has been exercised with a genuine GPT-4o mini discovery run. The automation service launches and owns the browser, while the employee performs verification on that same page. After verification, the AI panel accepts a supported transaction-history goal and displays recent safe events. The service observes visible controls, requests one typed model action, validates and executes it, then re-observes until independent completion checks pass or a bound stops the run. Successful evidence compiles into a typed capability that the replay interpreter executes without model calls.

For the explicit intervention scenario, a test-only session flag injects employee-session expiry when replay opens transaction history. Replay pauses, the operator claims the same live session, and a narrow relay accepts only the synthetic PIN fill and re-authentication click for the current ownership epoch. Resume is rejected until the blocked artifact checkpoint is restored. Human actions are recorded without the PIN value and do not modify the reusable capability. `npm run handoff:system` exercises this scenario against the React mock.
