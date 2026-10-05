import { test, expect, type Page } from '@playwright/test';
test.use({ channel: 'chrome', viewport: { width: 390, height: 844 } });

const voices = { default: 'shubh', defaults: { male: 'shubh', female: 'ritu' },
  female: ['ritu', 'priya', 'neha', 'pooja', 'kavya', 'shreya'], male: ['shubh', 'aditya', 'rahul', 'rohan', 'amit', 'kabir'] };

// A tenth of a second of silence: a playable preview.
function silentWav() {
  const samples = 1600, data = Buffer.alloc(44 + samples * 2);
  data.write('RIFF', 0); data.writeUInt32LE(36 + samples * 2, 4); data.write('WAVE', 8);
  data.write('fmt ', 12); data.writeUInt32LE(16, 16); data.writeUInt16LE(1, 20); data.writeUInt16LE(1, 22);
  data.writeUInt32LE(16000, 24); data.writeUInt32LE(32000, 28); data.writeUInt16LE(2, 32); data.writeUInt16LE(16, 34);
  data.write('data', 36); data.writeUInt32LE(samples * 2, 40);
  return data;
}

async function mockApp(page: Page, person: any, session: any = null) {
  const calls: { path: string; body: any }[] = [];
  await page.route('**/api/**', async route => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const body = request.method() === 'GET' ? null : request.postDataJSON?.() ?? null;
    if (request.method() !== 'GET') calls.push({ path, body });
    if (path === '/api/me') return route.fulfill({ json: person });
    if (path === '/api/config') return route.fulfill({ json: { voice_ready: true, development: true, retention_days: 30, voice_cloning: true } });
    if (path === '/api/state') return route.fulfill({ json: { incoming: [], outgoing: null, session } });
    if (path === '/api/voices') return route.fulfill({ json: voices });
    if (path.endsWith('/preview')) return route.fulfill({ contentType: 'audio/wav', body: silentWav() });
    if (path === '/api/voice-learning') { Object.assign(person, { voice_learning: body.enabled }); return route.fulfill({ json: person }); }
    if (path === '/api/voice-clone/remove') { Object.assign(person, { own_voice: false, voice: null }); return route.fulfill({ json: person }); }
    if (path === '/api/profile') { Object.assign(person, body); return route.fulfill({ json: person }); }
    if (path.endsWith('/token')) return route.fulfill({ json: { url: 'wss://example.test', token: 't', identity: 'a' } });
    return route.fulfill({ json: path === '/api/conversations' ? [] : {} });
  });
  return calls;
}

test('learning your voice is an explicit opt-in in the profile', async ({ page }) => {
  const person = { id: 'a', name: 'Neha', language: 'English', languages: ['English'], gender: 'female', voice: null, own_voice: false, voice_learning: false };
  const calls = await mockApp(page, person);
  await page.goto('http://127.0.0.1:5176');
  await page.locator('.profile-button').click();
  const toggle = page.locator('.voice-learning-toggle input');
  await expect(toggle).not.toBeChecked();
  await expect(page.locator('.voice-learning-toggle')).toContainText('about 45 seconds of your own speech');
  await expect(page.locator('.voice-learning-toggle')).not.toContainText('Fish Audio');
  await expect(page.locator('.voice-option-self')).toHaveCount(0);
  await toggle.check();
  await expect(toggle).toBeChecked();
  expect(calls.find(call => call.path === '/api/voice-learning')?.body).toEqual({ enabled: true });
});

test('a learned voice appears as Self, previews, saves, and can be removed', async ({ page }) => {
  const person = { id: 'a', name: 'Neha', language: 'Hindi', languages: ['Hindi'], gender: 'female', voice: 'ritu', own_voice: true, voice_learning: false };
  const calls = await mockApp(page, person);
  await page.goto('http://127.0.0.1:5176');
  await page.locator('.profile-button').click();
  // The learning option is gone once the voice exists; Self is offered instead.
  await expect(page.locator('.voice-learning-toggle')).toHaveCount(0);
  const self = page.locator('.voice-option-self');
  await expect(self).toHaveText('स्वयं');
  await self.click();
  await expect(page.locator('input[value="self"]')).toBeChecked();
  await expect.poll(() => calls.some(call => call.path === '/api/voices/self/preview')).toBe(true);
  await page.screenshot({ path: '/private/tmp/ekam-voice-self.png', fullPage: true });
  await page.locator('.voice-picker ~ button.primary').click();
  await expect.poll(() => calls.find(call => call.path === '/api/profile')?.body?.voice).toBe('self');
  await page.locator('.profile-button').click();
  await expect(page.locator('input[value="self"]')).toBeChecked();
  await page.locator('.voice-remove').click();
  await expect(page.locator('.voice-option-self')).toHaveCount(0);
  await expect(page.locator('input[value="ritu"]')).toBeChecked();
  await expect(page.locator('.voice-learning-toggle')).toBeVisible();
});

const fakeLiveKit = `
export const RoomEvent = new Proxy({}, { get: (_, name) => String(name) });
export const Track = { Kind: { Audio: 'audio' }, Source: { Microphone: 'microphone' } };
export class Room {
  constructor() {
    this.handlers = {}; this.remoteParticipants = new Map(); this.canPlaybackAudio = true;
    this.localParticipant = { isSpeaking: false, audioTrackPublications: new Map(),
      async setMicrophoneEnabled() {}, setTrackSubscriptionPermissions() {} };
    window.__room = this;
  }
  on(name, handler) { (this.handlers[name] ||= []).push(handler); return this; }
  once(name, handler) { return this.on(name, handler); }
  emit(name, ...args) { (this.handlers[name] || []).forEach(handler => handler(...args)); }
  async connect() {}
  async disconnect() { this.emit('Disconnected'); }
  async startAudio() {}
}`;

test('the call shows voice learning progress and says when the voice is ready', async ({ page }) => {
  const person: any = { id: 'a', name: 'Neha', language: 'English', languages: ['English'], gender: 'female', voice: null, own_voice: false, voice_learning: true };
  const session = { id: 's', a: 'a', b: 'b', language_a: 'English', language_b: 'Hindi', status: 'listening', epoch: 0,
    started: Date.now() / 1000, ended: null, resume_by: null, turns: [], peer: { id: 'b', name: 'Ravi', language: 'Hindi' } };
  await page.route('**/node_modules/.vite/deps/livekit-client.js*', route => route.fulfill({ contentType: 'application/javascript', body: fakeLiveKit }));
  await mockApp(page, person, session);
  await page.goto('http://127.0.0.1:5176');
  await expect(page.locator('.session-footnote')).toHaveText('Recording your voice to learn it. Deleted after learning.');
  await page.locator('.voice-main').click();
  const note = page.locator('.voice-learning-note');
  await expect(note).toHaveText('Learning your voice…');
  const send = (message: object) => page.evaluate(message => (window as any).__room.emit('DataReceived',
    new TextEncoder().encode(JSON.stringify(message)), { kind: 4 }, 0, 'talkeasy.voice-learning'), message);
  await send({ type: 'voice_learning', progress: 0.4 });
  await expect(note).toHaveText('Learning your voice…40%');
  Object.assign(person, { own_voice: true, voice_learning: false });
  await send({ type: 'voice_learning', progress: 1, done: true });
  await expect(page.locator('.toast')).toHaveText('Your voice is ready. Choose Self in your profile.');
  await expect(note).toHaveCount(0);
  await expect(page.locator('.session-footnote')).toHaveText('No audio recordings. Text history only.');
});
