import { randomBytes } from 'node:crypto';
import { chromium } from 'playwright';
import type { Browser, BrowserContext, Page } from 'playwright';
import { newId } from '../contracts/discovery.ts';

export interface LiveSession {
  sessionId: string;
  controlToken: string;
  browser: Browser;
  context: BrowserContext;
  page: Page;
  owner: 'human' | 'automation';
  epoch: number;
  activeRunId: string | null;
  createdAt: string;
  allowedOrigin: string;
}

const allowedTargets = new Set(['http://127.0.0.1:5174', 'http://localhost:5174']);

export class SessionRegistry {
  private readonly sessions = new Map<string, LiveSession>();

  async create(targetUrl: string, headless: boolean) {
    const parsed = new URL(targetUrl);
    if (!allowedTargets.has(parsed.origin)) throw new Error('TARGET_NOT_ALLOWED');
    const sessionId = newId();
    const controlToken = randomBytes(24).toString('base64url');
    const browser = await chromium.launch({ headless });
    const context = await browser.newContext();
    await context.route('**/*', async route => {
      const requestUrl = new URL(route.request().url());
      if (requestUrl.origin === parsed.origin || ['data:', 'blob:'].includes(requestUrl.protocol)) await route.continue();
      else await route.abort('blockedbyclient');
    });
    const page = await context.newPage();
    await page.addInitScript(({ id, token }) => {
      window.sessionStorage.setItem('automationSession', id);
      window.sessionStorage.setItem('automationControlToken', token);
    }, { id: sessionId, token: controlToken });
    await page.goto(parsed.toString(), { waitUntil: 'domcontentloaded', timeout: 60_000 });
    const session: LiveSession = {
      sessionId, controlToken, browser, context, page,
      owner: 'human', epoch: 1, activeRunId: null, createdAt: new Date().toISOString(), allowedOrigin: parsed.origin,
    };
    this.sessions.set(sessionId, session);
    browser.on('disconnected', () => this.sessions.delete(sessionId));
    return session;
  }

  get(sessionId: string) { return this.sessions.get(sessionId); }
  attach(session: LiveSession) { this.sessions.set(session.sessionId, session); return session; }
  authorize(sessionId: string, token: string | undefined) {
    const session = this.sessions.get(sessionId);
    return session && token && token === session.controlToken ? session : null;
  }

  async closeAll() {
    await Promise.allSettled([...this.sessions.values()].map(session => session.browser.close()));
    this.sessions.clear();
  }
}
