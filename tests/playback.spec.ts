import { test, expect } from '@playwright/test';
import { micShouldListen, parsePlayback, usesEarphones } from '../src/lib/playback';

test('earphone and headset microphones are recognised; built-in microphones are not', () => {
  for (const label of ['AirPods Pro', 'Galaxy Buds2', 'Headset Microphone', 'Wired headphones', 'Bluetooth hands-free', 'Jabra BT Headset'])
    expect(usesEarphones(label), label).toBe(true);
  for (const label of ['iPhone Microphone', 'Default', 'MacBook Pro Microphone (Built-in)', '', undefined, null])
    expect(usesEarphones(label), String(label)).toBe(false);
});

test('playback messages are parsed strictly', () => {
  const encode = (value: unknown) => new TextEncoder().encode(typeof value === 'string' ? value : JSON.stringify(value));
  expect(parsePlayback(encode({ type: 'playback', speaking: true }))).toBe(true);
  expect(parsePlayback(encode({ type: 'playback', speaking: false }))).toBe(false);
  expect(parsePlayback(encode({ type: 'status', text: 'hi' }))).toBeNull();
  expect(parsePlayback(encode({ type: 'playback', speaking: 'yes' }))).toBeNull();
  expect(parsePlayback(encode('not json'))).toBeNull();
});

test('the microphone is held only while a translation plays on the speaker', () => {
  const base = { active: true, translationPlaying: false, earphones: false, deferHold: false };
  expect(micShouldListen(base)).toBe(true);
  expect(micShouldListen({ ...base, translationPlaying: true })).toBe(false);
  // Earphones keep the speaker away from the mic; someone mid-sentence is not cut off.
  expect(micShouldListen({ ...base, translationPlaying: true, earphones: true })).toBe(true);
  expect(micShouldListen({ ...base, translationPlaying: true, deferHold: true })).toBe(true);
  // Pause, disconnection or an unhealthy server always win.
  expect(micShouldListen({ ...base, active: false, earphones: true, deferHold: true })).toBe(false);
});
