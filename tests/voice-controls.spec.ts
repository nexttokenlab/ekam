import { test, expect, type Page } from '@playwright/test';
test.use({ channel: 'chrome', viewport: { width: 390, height: 844 } });

// A stand-in for livekit-client so the live call controls can be exercised without a
// LiveKit server: tests emit room events and observe microphone changes.
const fakeLiveKit = `
export const RoomEvent = new Proxy({}, { get: (_, name) => String(name) });
export const Track = { Kind: { Audio: 'audio' }, Source: { Microphone: 'microphone' } };
export class Room {
  constructor() {
    this.handlers = {}; this.remoteParticipants = new Map(); this.canPlaybackAudio = true;
    const label = window.__micLabel || 'iPhone Microphone';
    this.localParticipant = {
      isSpeaking: false,
      audioTrackPublications: new Map([['mic', { track: { mediaStreamTrack: { label } } }]]),
      async setMicrophoneEnabled(on) { window.__mic.push(on); },
      setTrackSubscriptionPermissions() {},
    };
    window.__room = this;
  }
  on(name, handler) { (this.handlers[name] ||= []).push(handler); return this; }
  once(name, handler) { return this.on(name, handler); }
  emit(name, ...args) { (this.handlers[name] || []).forEach(handler => handler(...args)); }
  async connect() {}
  async disconnect() { this.emit('Disconnected'); }
  async startAudio() {}
}`;

async function openLiveSession(page: Page, micLabel?: string) {
  const person = { id: 'a', name: 'Neha', language: 'English', languages: ['English'] };
  const session = { id: 's', a: 'a', b: 'b', language_a: 'English', language_b: 'Hindi', status: 'listening', epoch: 0,
    started: Date.now() / 1000, ended: null, resume_by: null, turns: [], peer: { id: 'b', name: 'Ananya', language: 'Hindi' } };
  await page.addInitScript(label => { (window as any).__mic = []; if (label) (window as any).__micLabel = label; }, micLabel);
  await page.route('**/node_modules/.vite/deps/livekit-client.js*', route =>
    route.fulfill({ contentType: 'application/javascript', body: fakeLiveKit }));
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    let body: any = {};
    if (path === '/api/me') body = person;
    else if (path === '/api/state') body = { incoming: [], outgoing: null, session };
    else if (path === '/api/conversations') body = [];
    else if (path === '/api/config') body = { voice_ready: true, development: true, retention_days: 30 };
    else if (path.endsWith('/token')) body = { url: 'wss://example.test', token: 't', identity: 'a' };
    await route.fulfill({ json: body });
  });
  await page.goto('http://127.0.0.1:5176');
  await expect(page.locator('.voice-main')).toHaveText('Enable microphone');
  await expect(page.locator('.voice-end')).toBeHidden();
  await page.locator('.voice-main').click();
  // After the split both buttons are icon-only; the action is their accessible name.
  await expect(page.locator('.voice-main')).toHaveAttribute('aria-label', 'Pause listening');
  await expect(page.locator('.voice-main')).toHaveText('');
  await expect(page.locator('.voice-end')).toBeVisible();
}

const emit = (page: Page, name: string, ...args: unknown[]) =>
  page.evaluate(([name, args]) => (window as any).__room.emit(name, ...(args as unknown[])), [name, args] as const);
const playback = (page: Page, speaking: boolean) => page.evaluate(speaking => (window as any).__room.emit(
  'DataReceived', new TextEncoder().encode(JSON.stringify({ type: 'playback', speaking })), { kind: 4 }, 0, 'talkeasy.playback'), speaking);
const micState = (page: Page) => page.evaluate(() => (window as any).__mic.at(-1));

test('microphone is held while the other translation plays on the speaker', async ({ page }) => {
  await openLiveSession(page);
  await page.screenshot({ path: '/private/tmp/ekam-voice-live.png' });
  await emit(page, 'ActiveSpeakersChanged', [{ isLocal: false }]);
  await expect(page.locator('.voice-main .wave')).toBeVisible();
  await playback(page, true);
  await expect(page.locator('.voice-main')).toHaveAttribute('aria-label', 'Translating Ananya…');
  await expect.poll(() => micState(page)).toBe(false);
  await page.screenshot({ path: '/private/tmp/ekam-voice-translating.png' });
  await playback(page, false);
  // The mic comes back shortly after playback ends, not immediately.
  expect(await micState(page)).toBe(false);
  await expect.poll(() => micState(page), { timeout: 3000 }).toBe(true);
  await expect(page.locator('.voice-main')).toHaveAttribute('aria-label', 'Pause listening');
});

test('earphones keep the microphone open during playback', async ({ page }) => {
  await openLiveSession(page, 'AirPods Pro');
  await playback(page, true);
  await expect(page.locator('.voice-main')).toHaveAttribute('aria-label', 'Translating Ananya…');
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => (window as any).__mic.includes(false))).toBe(false);
});

test('someone mid-sentence is not cut off when a translation starts', async ({ page }) => {
  await openLiveSession(page);
  await page.evaluate(() => { (window as any).__room.localParticipant.isSpeaking = true; });
  await playback(page, true);
  await page.waitForTimeout(300);
  expect(await micState(page)).toBe(true);
  await emit(page, 'ActiveSpeakersChanged', []);
  await expect.poll(() => micState(page)).toBe(false);
});
