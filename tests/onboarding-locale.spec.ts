import { test, expect } from '@playwright/test';
import {onboardingCopy, localeLanguage} from '../src/lib/onboarding-copy';

test.use({ channel: 'chrome', viewport: { width: 390, height: 844 }, launchOptions: { args: ['--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream'] } });
const base = 'http://127.0.0.1:5176';
const host = { id: 'host', name: 'Test host', language: 'English', languages: ['English'] };
async function mock(page: any, signedIn = false, locale = 'gu') {
  const qrBodies: any[] = [];
  let profile: any;
  let currentUser = host;
  await page.route('**/api/**', async (route: any) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    let status = 200, body: any = {};
    if (path === '/api/me') { status = signedIn ? 200 : 401; body = currentUser; }
    else if (path === '/api/state') body = { incoming: [], outgoing: null, session: null };
    else if (path === '/api/conversations') body = [];
    else if (path === '/api/qr' && request.method() === 'POST') {
      const data = request.postDataJSON(); qrBodies.push(data);
      body = { code: 'test-code-' + qrBodies.length, url: base + '/?connect=test-code-' + qrBodies.length + '&lang=' + data.locale, expires_in: 300, locale: data.locale };
    }
    else if (path.startsWith('/api/qr/')) body = { locale, expires_in: 300 };
    else if (path === '/api/auth/otp') body = { development_code: '0000' };
    else if (path === '/api/auth/verify') body = { id: 'visitor', name: '', language: 'English', languages: ['English'] };
    else if (path === '/api/profile') { profile=request.postDataJSON(); body={id:'visitor',...profile}; currentUser=body; }
    await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
  });
  return { qrBodies, getProfile: () => profile };
}
for (const [locale, send, mobile, code, verify, name, finish, language] of [
  ['gu','ચકાસણી કોડ મોકલો','મોબાઇલ નંબર','ચકાસણી કોડ','ચકાસો અને આગળ વધો','તમારું નામ','વાતચીત શરૂ કરો','Gujarati'],
  ['fr','Envoyer le code de vérification','Numéro de mobile','Code de vérification','Vérifier et continuer','Votre nom','Commençons à parler','French'],
  ...(['ar','it','ko','ja'] as const).map(locale => {const c=onboardingCopy[locale];return [locale,c.send,c.mobile,c.code,c.verify,c.name,c.finish,localeLanguage[locale]]}),
]) {
  test(`${locale} QR localizes all login steps and chooses guest language`, async ({page}) => {
    const state = await mock(page, false, locale);
    await page.goto(base + '/?connect=test-code-123&lang=' + locale);
    await expect(page.getByRole('button', {name:send,exact:true})).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('lang',locale);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
    await page.screenshot({path:'/private/tmp/ekam-login-'+locale+'.png',fullPage:true});
    await page.getByLabel(mobile,{exact:true}).fill('9000000001');
    await page.getByRole('button',{name:send,exact:true}).click();
    await page.getByLabel(code,{exact:true}).fill('0000');
    await page.getByRole('button',{name:verify,exact:true}).click();
    await page.getByLabel(name,{exact:true}).fill('Visitor');
    await page.locator('input[name="gender"][value="female"]').check({force:true});
    await page.getByRole('button',{name:finish,exact:true}).click();
    await expect.poll(()=>state.getProfile()?.language).toBe(language);
    expect(state.getProfile()?.gender).toBe('female');
  });
}
test('manual language selection translates the scan prompt and refreshes QR', async ({page}) => {
  const state = await mock(page, true);
  await page.goto(base);
  await page.getByLabel('Their language', {exact:true}).selectOption('fr');
  await expect.poll(()=>state.qrBodies.at(-1)?.locale).toBe('fr');
  await expect(page.getByText('Scannez mon code de conversation', {exact:true})).toBeVisible();
  await expect(page.locator('.qr-scan-prompt')).toHaveAttribute('lang', 'fr');
  await expect(page.locator('.qr-card-owner span')).toHaveText('Parle anglais');
  await expect(page.locator('.language-summary strong')).toHaveText('English');
  await page.screenshot({path:'/private/tmp/ekam-language-select-mobile.png', fullPage:true});
  await page.setViewportSize({width:1280,height:900});
  await page.waitForTimeout(200);
  await page.screenshot({path:'/private/tmp/ekam-language-select-desktop.png'});
});

test('profile creation offers all languages but saves exactly one', async ({page}) => {
  const state = await mock(page);
  await page.goto(base);
  await page.getByLabel('Mobile number', {exact:true}).fill('9000000001');
  await page.getByRole('button',{name:'Send verification code',exact:true}).click();
  await page.getByLabel('Verification code',{exact:true}).fill('0000');
  await page.getByRole('button',{name:'Verify & continue',exact:true}).click();
  await expect(page.locator('input[name="profile-language"]')).toHaveCount(15);
  await expect(page.locator('input[name="gender"]')).toHaveCount(2);
  await expect(page.getByRole('checkbox')).toHaveCount(0);
  await page.locator('input[value="Tamil"]').check({force:true});
  await page.locator('input[value="Bengali"]').check({force:true});
  await expect(page.locator('input[type="radio"]:checked')).toHaveCount(1);
  await expect(page.locator('input[value="Tamil"]')).not.toBeChecked();
  await page.locator('input[autocomplete=given-name]').fill('Visitor');
  // Gender is required: it picks the default voice and gendered grammar.
  await page.locator('.onboarding-page button.primary').click();
  // The profile language (Bengali) localizes the prompt.
  await expect(page.locator('.form-error')).toHaveText('চালিয়ে যেতে আপনার লিঙ্গ বেছে নিন।');
  expect(state.getProfile()).toBeUndefined();
  await page.locator('input[name="gender"][value="male"]').check({force:true});
  await expect(page.locator('.gender-option.selected')).toHaveText('পুরুষ');
  await page.screenshot({path:'/private/tmp/ekam-single-language-profile.png',fullPage:true});
  await page.locator('.onboarding-page button.primary').click();
  await expect.poll(()=>state.getProfile()?.gender).toBe('male');
  await expect.poll(()=>state.getProfile()?.languages).toEqual(['Bengali']);
  await expect.poll(()=>state.getProfile()?.language).toBe('Bengali');
});

test('single app language updates the interface and persists after reload', async ({page}) => {
  const state=await mock(page,true);
  await page.goto(base);
  await page.locator('.language-picker-trigger').click();
  await expect(page.locator('input[name="app-language"]')).toHaveCount(15);
  await expect(page.getByRole('checkbox')).toHaveCount(0);
  await page.locator('input[name="app-language"][value="French"]').check({force:true});
  await expect(page.locator('input[name="app-language"]:checked')).toHaveCount(1);
  await expect(page.locator('html')).toHaveAttribute('lang','fr');
  await expect(page.locator('.bottom-nav')).not.toContainText('Home');
  await page.locator('dialog button.primary').click();
  await expect.poll(()=>state.getProfile()?.languages).toEqual(['French']);
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('lang','fr');
  await expect(page.locator('.language-summary strong')).toHaveText('Français');
  await expect(page.locator('label[for=guest-language]')).not.toHaveText('Their language');
  await page.locator('#guest-language').selectOption('gu');
  await expect(page.locator('.qr-scan-prompt')).toHaveText('મારો વાતચીત કોડ સ્કેન કરો');
  // The owner's spoken language is also shown to the visitor in the visitor's language.
  const owner = page.locator('.qr-card-owner span');
  await expect(owner).toHaveAttribute('lang','gu');
  await expect(owner).toHaveText(new RegExp('^'+"\\S.* \u0aac\u0acb\u0ab2\u0ac7 \u0a9b\u0ac7"+'$'));
  await expect(owner).not.toContainText('Parle');
  await expect(page.locator('html')).toHaveAttribute('lang','fr');
  await page.screenshot({path:'/private/tmp/ekam-french-app-mobile.png',fullPage:true});
  await page.setViewportSize({width:1280,height:900});
  await page.waitForTimeout(200);
  await page.screenshot({path:'/private/tmp/ekam-french-app-desktop.png'});
});

test('Arabic QR uses RTL independently, and own Arabic selection switches the app', async ({page}) => {
  const state=await mock(page,true);
  await page.goto(base);
  const select=page.getByLabel('Their language',{exact:true});
  await expect(select.locator('option')).toHaveCount(15);
  await expect(select.locator('option[value="od"]')).toHaveCount(0);
  await select.selectOption('ar');
  await expect.poll(()=>state.qrBodies.at(-1)?.locale).toBe('ar');
  await expect(page.locator('.qr-scan-prompt')).toHaveAttribute('dir','rtl');
  await expect(page.locator('html')).toHaveAttribute('dir','ltr');
  await page.locator('.language-picker-trigger').click();
  await page.locator('input[name="app-language"][value="Arabic"]').check({force:true});
  await expect(page.locator('html')).toHaveAttribute('dir','rtl');
  await page.locator('.sheet .button.primary').click();
  await expect.poll(()=>state.getProfile()?.language).toBe('Arabic');
  await expect(page.locator('.language-summary strong')).toHaveText('العربية');
  await page.screenshot({path:'/private/tmp/ekam-arabic-mobile.png',fullPage:true});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.setViewportSize({width:1280,height:900});
  await page.screenshot({path:'/private/tmp/ekam-arabic-desktop.png',fullPage:true});
});

test('QR refreshes automatically before expiry and can be refreshed manually',async({page})=>{
 await page.clock.install();
 const state=await mock(page,true);
 await page.goto(base);
 await expect.poll(()=>state.qrBodies.length).toBe(1);
 await expect(page.locator('.my-qr-code svg')).toBeVisible();
 await page.clock.fastForward(151000);
 await expect.poll(()=>state.qrBodies.length).toBe(2);
 await expect(page.locator('.my-qr-code svg')).toBeVisible();
 const beforeRefresh = await page.locator('.my-qr-code svg').innerHTML();
 await page.getByRole('button',{name:'Refresh QR',exact:true}).click();
 await expect.poll(()=>state.qrBodies.length).toBe(3);
 // The mock counts a request on arrival; wait until the page has applied the response
 // (and recorded its refresh time) before advancing the fake clock.
 await expect.poll(()=>page.locator('.my-qr-code svg').innerHTML()).not.toBe(beforeRefresh);
 await page.clock.fastForward(61000);
 await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
 await expect.poll(()=>state.qrBodies.length).toBe(4);
});

test('failed QR load retries automatically without user intervention',async({page})=>{
 await page.clock.install();
 const state=await mock(page,true);
 let failed=false;
 await page.route('**/api/qr',async route=>{
  if(!failed){failed=true;await route.fulfill({status:503,json:{detail:'Temporary outage'}});}
  else await route.fallback();
 });
 await page.goto(base);
 await expect(page.getByRole('alert')).toContainText('Couldn’t load your QR');
 await page.clock.fastForward(6000);
 await expect.poll(()=>state.qrBodies.length).toBe(1);
 await expect(page.locator('.my-qr-code svg')).toBeVisible();
});

test('QR heading stays on one line in every visitor language', async ({page}) => {
  await mock(page, true);
  await page.goto(base);
  const heading = page.locator('.qr-scan-prompt');
  for (const locale of Object.keys(localeLanguage)) {
    await page.locator('#guest-language').selectOption(locale);
    await expect(heading).toHaveAttribute('lang', locale);
    await expect.poll(() => heading.evaluate(el => {
      const size = parseFloat(getComputedStyle(el).fontSize);
      const lineHeight = parseFloat(getComputedStyle(el).lineHeight);
      return el.scrollWidth <= el.clientWidth + 1 && el.clientHeight <= lineHeight + 2 && size >= 12;
    }), {message: locale}).toBe(true);
  }
});
