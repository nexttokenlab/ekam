import {test,expect} from '@playwright/test';
test.use({channel:'chrome',viewport:{width:390,height:844}});
test('brand line strikes through "their" with "your" written above, and reads cleanly', async ({page}) => {
  await page.route('**/api/**', route => route.fulfill({status: new URL(route.request().url()).pathname === '/api/me' ? 401 : 200, json: {}}));
  await page.goto('http://127.0.0.1:5176/?lang=en');
  const heading = page.locator('.login-heading');
  await expect(heading.locator('s')).toHaveText('their');
  await expect(heading.locator('.brand-insert')).toHaveText('your');
  await expect(heading.locator('.brand-caret')).toHaveCount(0);
  await expect(heading).toHaveAttribute('aria-label', 'Talk to anyone in your native language');
  // Always two lines, each on a single row, in every sign-in language.
  const lines = heading.locator('.login-heading-line');
  await expect(lines.nth(1)).toHaveText('native language');
  for (const lang of ['en', 'hi', 'bn', 'ta', 'te', 'gu', 'kn', 'ml', 'mr', 'pa', 'fr', 'ar', 'it', 'ko', 'ja']) {
    await page.goto('http://127.0.0.1:5176/?lang=' + lang);
    await expect(lines).toHaveCount(2);
    await expect.poll(() => lines.evaluateAll(rows => {
      // The words fit on one row each; the handwritten correction may overhang.
      rows[0].parentElement!.classList.add('measuring');
      const fits = rows.every(row => row.scrollWidth <= row.clientWidth + 1 && row.clientHeight <= parseFloat(getComputedStyle(row).lineHeight) * 1.1 + 2);
      rows[0].parentElement!.classList.remove('measuring');
      return fits;
    }), { message: lang }).toBe(true);
  }
  await page.goto('http://127.0.0.1:5176/?lang=en');
  await page.screenshot({path:'/private/tmp/claude-501/-Users-nehapriya-Documents-ChatGPT-TalkEasy/713b5da7-aca0-495f-81be-8be7664e2226/scratchpad/brand-en.png'});
  await page.goto('http://127.0.0.1:5176/?lang=hi');
  await expect(heading.locator('s')).toHaveText('उनकी');
  await expect(heading.locator('.brand-insert')).toHaveText('अपनी');
  await expect(heading).toHaveAttribute('aria-label', 'किसी से भी अपनी मातृभाषा में बात करें');
  await page.screenshot({path:'/private/tmp/claude-501/-Users-nehapriya-Documents-ChatGPT-TalkEasy/713b5da7-aca0-495f-81be-8be7664e2226/scratchpad/brand-hi.png'});
});
