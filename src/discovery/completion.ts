import type { Page } from 'playwright';
import type { SuccessCriteria } from '../contracts/discovery.ts';
import type { VerifiedMemberContext } from '../contracts/discovery.ts';

export interface CompletionCheck { ok: boolean; code: string; message: string }

export async function readVerifiedMember(page: Page): Promise<VerifiedMemberContext | null> {
  const strip = page.locator('.member-strip');
  if (await strip.count() !== 1) return null;
  const name = (await strip.locator('strong').first().textContent())?.trim() ?? '';
  const text = (await strip.innerText()).replace(/\s+/g, ' ');
  const memberId = text.match(/Member\s+#(\d{5})\b/)?.[1] ?? '';
  return name && memberId ? { id: memberId, name } : null;
}

export async function verifyCompletion(page: Page, criteria: SuccessCriteria): Promise<CompletionCheck> {
  const snapshot = await page.evaluate((expected) => {
    const normalized = (value: string | null | undefined) => (value ?? '').replace(/\s+/g, ' ').trim();
    const exactTextCount = (selector: string, value: string) => Array.from(document.querySelectorAll(selector))
      .filter(element => normalized(element.textContent) === value).length;
    const labels = Array.from(document.querySelectorAll('label'));
    const periodLabel = labels.find(label => normalized(label.textContent) === 'History period');
    const labelledControl = periodLabel?.htmlFor ? document.getElementById(periodLabel.htmlFor) : periodLabel?.querySelector('select');
    return {
      route: location.hash.slice(1),
      memberCount: exactTextCount('.member-strip strong', expected.memberName),
      accountContextCount: Array.from(document.querySelectorAll('.eyebrow'))
        .filter(element => normalized(element.textContent).toLowerCase().includes(expected.accountType.toLowerCase())).length,
      period: labelledControl instanceof HTMLSelectElement ? labelledControl.value : null,
      historyHeadingCount: Array.from(document.querySelectorAll('h1,h2,h3,h4,h5,h6'))
        .filter(element => normalized(element.textContent) === 'Posted transaction history').length,
    };
  }, criteria);
  if (!new RegExp(`^/members/${criteria.memberId}/accounts/[^/]+/history$`).test(snapshot.route)) {
    return { ok: false, code: 'WRONG_ROUTE', message: 'The browser is not on the verified member transaction-history route.' };
  }
  if (snapshot.memberCount !== 1) return { ok: false, code: 'MEMBER_NOT_CONFIRMED', message: 'The verified member is not uniquely visible.' };
  if (snapshot.accountContextCount !== 1) return { ok: false, code: 'ACCOUNT_TYPE_NOT_CONFIRMED', message: 'The requested account type is not uniquely visible.' };
  if (snapshot.period !== criteria.period) return { ok: false, code: 'PERIOD_NOT_CONFIRMED', message: 'The requested history period is not selected.' };
  if (snapshot.historyHeadingCount !== 1) return { ok: false, code: 'VIEW_NOT_CONFIRMED', message: 'The transaction-history heading is not uniquely visible.' };
  return { ok: true, code: 'SUCCESS_CRITERIA_MET', message: 'Member, account type, history view, and period are verified.' };
}
