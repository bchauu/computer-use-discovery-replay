import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  await page.setContent('<button>Verify browser control</button><p role="status">Waiting</p><script>document.querySelector("button").onclick = () => document.querySelector("p").textContent = "Clicked";</script>');
  await page.getByRole('button', { name: 'Verify browser control' }).click();
  if (await page.getByRole('status').textContent() !== 'Clicked') throw new Error('Browser action failed');
  console.info('Chromium launch, target resolution, and click verified. No external site or model used.');
} finally {
  await browser.close();
}
