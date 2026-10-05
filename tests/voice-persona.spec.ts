import { test, expect } from '@playwright/test';
test.use({ channel: 'chrome', viewport: { width: 390, height: 844 } });

// A tenth of a second of silence: a real, playable preview response.
function silentWav() {
  const samples = 1600, data = Buffer.alloc(44 + samples * 2);
  data.write('RIFF', 0); data.writeUInt32LE(36 + samples * 2, 4); data.write('WAVE', 8);
  data.write('fmt ', 12); data.writeUInt32LE(16, 16); data.writeUInt16LE(1, 20); data.writeUInt16LE(1, 22);
  data.writeUInt32LE(16000, 24); data.writeUInt32LE(32000, 28); data.writeUInt16LE(2, 32); data.writeUInt16LE(16, 34);
  data.write('data', 36); data.writeUInt32LE(samples * 2, 40);
  return data;
}

test('profile offers Sarvam voices, previews them, and saves the chosen voice', async ({ page }) => {
  let person: any = { id: 'a', name: 'Neha', language: 'Hindi', languages: ['Hindi'], voice: null };
  const previews: string[] = [];
  let saved: any;
  await page.route('**/api/**', async route => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path === '/api/me') return route.fulfill({ json: person });
    if (path === '/api/state') return route.fulfill({ json: { incoming: [], outgoing: null, session: null } });
    if (path === '/api/voices') return route.fulfill({ json: {
      default: 'shubh',
      female: ['ritu', 'priya', 'neha', 'pooja', 'kavya', 'shreya'],
      male: ['shubh', 'aditya', 'rahul', 'rohan', 'amit', 'kabir'] } });
    const preview = /^\/api\/voices\/([a-z]+)\/preview$/.exec(path);
    if (preview) { previews.push(preview[1]); return route.fulfill({ contentType: 'audio/wav', body: silentWav() }); }
    if (path === '/api/profile') { saved = request.postDataJSON(); person = { ...person, ...saved }; return route.fulfill({ json: person }); }
    return route.fulfill({ json: path === '/api/conversations' ? [] : {} });
  });
  await page.goto('http://127.0.0.1:5176');
  await page.locator('.profile-button').click();
  const picker = page.locator('.voice-picker');
  await expect(picker).toBeVisible();
  await expect(picker.locator('.voice-group').nth(0).locator('.voice-option')).toHaveCount(6);
  await expect(picker.locator('.voice-group').nth(1).locator('.voice-option')).toHaveCount(6);
  await expect(picker.locator('input[value="shubh"]')).toBeChecked();
  await picker.locator('.voice-option', { hasText: 'Ritu' }).click();
  await expect(picker.locator('input[value="ritu"]')).toBeChecked();
  await expect.poll(() => previews).toEqual(['ritu']);
  await expect(page.locator('.form-error')).toHaveCount(0);
  await page.screenshot({ path: '/private/tmp/ekam-voice-persona.png', fullPage: true });
  await page.locator('.voice-picker ~ button.primary').click();
  await expect.poll(() => saved?.voice).toBe('ritu');
});

test('choosing a gender in the profile shows only matching voices and saves both', async ({ page }) => {
  let person: any = { id: 'a', name: 'Neha', language: 'Hindi', languages: ['Hindi'], voice: 'kavya', gender: 'female' };
  let saved: any;
  await page.route('**/api/**', async route => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path === '/api/me') return route.fulfill({ json: person });
    if (path === '/api/state') return route.fulfill({ json: { incoming: [], outgoing: null, session: null } });
    if (path === '/api/voices') return route.fulfill({ json: {
      default: 'shubh', defaults: { male: 'shubh', female: 'ritu' },
      female: ['ritu', 'pooja', 'kavya'], male: ['shubh', 'rahul'] } });
    if (path === '/api/profile') { saved = request.postDataJSON(); person = { ...person, ...saved }; return route.fulfill({ json: person }); }
    return route.fulfill({ json: path === '/api/conversations' ? [] : {} });
  });
  await page.goto('http://127.0.0.1:5176');
  // Hindi interface text agrees with a woman speaking.
  await expect(page.locator('.language-picker-trigger .field-caption')).toHaveText('मैं बोलती हूँ');
  await page.locator('.profile-button').click();
  const picker = page.locator('.voice-picker');
  await expect(page.locator('.gender-option.selected input')).toHaveValue('female');
  await expect(picker.locator('.voice-option')).toHaveCount(3);
  await expect(picker.locator('input[value="kavya"]')).toBeChecked();
  await page.locator('input[name="gender"][value="male"]').check({ force: true });
  await expect(picker.locator('.voice-option')).toHaveCount(2);
  await expect(picker.locator('input[value="shubh"]')).toBeChecked();
  await page.screenshot({ path: '/private/tmp/ekam-gender-profile.png', fullPage: true });
  await page.locator('.voice-picker ~ button.primary').click();
  await expect.poll(() => saved).toMatchObject({ gender: 'male', voice: 'shubh' });
});

test('profile can be saved during a conversation; only its language is locked', async ({ page }) => {
  let person: any = { id: 'a', name: 'Neha', language: 'English', languages: ['English'], voice: null, gender: 'female' };
  const session = { id: 's', a: 'a', b: 'b', language_a: 'English', language_b: 'Hindi', status: 'listening', epoch: 0,
    started: Date.now() / 1000, ended: null, resume_by: null, turns: [], peer: { id: 'b', name: 'Ravi', language: 'Hindi', gender: 'male' } };
  let saved: any;
  await page.route('**/api/**', async route => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path === '/api/me') return route.fulfill({ json: person });
    if (path === '/api/state') return route.fulfill({ json: { incoming: [], outgoing: null, session } });
    if (path === '/api/voices') return route.fulfill({ json: { default: 'shubh', defaults: { male: 'shubh', female: 'ritu' },
      female: ['ritu', 'priya', 'neha', 'pooja', 'kavya', 'shreya'], male: ['shubh', 'aditya', 'rahul', 'rohan', 'amit', 'kabir'] } });
    if (path === '/api/profile') { saved = request.postDataJSON(); person = { ...person, ...saved }; return route.fulfill({ json: person }); }
    return route.fulfill({ json: path === '/api/conversations' ? [] : {} });
  });
  await page.goto('http://127.0.0.1:5176');
  await expect(page.locator('.session-controls')).toBeVisible();
  await page.locator('.profile-button').click();
  await expect(page.locator('.input-label select')).toBeDisabled();
  await page.locator('.voice-option', { hasText: 'Kavya' }).click();
  const save = page.locator('.voice-picker ~ button.primary');
  await expect(save).toBeEnabled();
  await save.click();
  await expect.poll(() => saved).toMatchObject({ voice: 'kavya', gender: 'female', language: 'English' });
  await expect(page.locator('.voice-picker')).toBeHidden();
});
