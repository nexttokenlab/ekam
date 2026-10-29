import { test, expect } from '@playwright/test';
import { observePlayback } from '../src/lib/latency';

test('listener diagnostics are opt-in, content-free, bounded and cleaned up', async () => {
  const keys = ['window', 'location', 'AudioContext'] as const;
  const previous = new Map(keys.map(k => [k, Object.getOwnPropertyDescriptor(globalThis, k)]));
  let polling: (() => void) | undefined;
  let closed = 0, disconnected = 0, constructions = 0;
  let loud = true;
  const fakeWindow: any = {
    setInterval: (fn: () => void) => { polling = fn; return 7; },
    clearInterval: () => { polling = undefined; },
  };
  class FakeAudioContext {
    state = 'running';
    constructor() { constructions++; }
    createMediaStreamSource() { return { connect: () => {}, disconnect: () => { disconnected++; } }; }
    createAnalyser() { return { fftSize: 512, getFloatTimeDomainData: (samples: Float32Array) => samples.fill(loud ? .1 : 0) }; }
    async resume() {}
    async close() { closed++; }
  }
  const set = (key: string, value: unknown) => Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  try {
    set('window', fakeWindow); set('location', { search: '' }); set('AudioContext', FakeAudioContext);
    const element = new EventTarget() as HTMLMediaElement;
    observePlayback(element, {} as MediaStream, 'English', 'Hindi')();
    expect(constructions).toBe(0);
    set('location', { search: '?latency=1' });
    const stop = observePlayback(element, {} as MediaStream, 'English', 'Hindi');
    await Promise.resolve();
    element.dispatchEvent(new Event('playing'));
    polling?.();
    loud = false; polling?.();
    expect(fakeWindow.ekamLatency.rows.map((r: any) => r.event)).toEqual(['attached', 'playing', 'render_energy_onset', 'render_energy_offset']);
    expect(Object.keys(fakeWindow.ekamLatency.rows[0]).sort()).toEqual(['schema', 'origin', 'probe_id', 'source', 'target', 'event', 'offset_ms'].sort());
    for (let n = 0; n < 2100; n++) element.dispatchEvent(new Event('waiting'));
    expect(fakeWindow.ekamLatency.rows).toHaveLength(2000);
    stop();
    expect(closed).toBe(1); expect(disconnected).toBe(1); expect(polling).toBeUndefined();
    fakeWindow.ekamLatency.clear();
    element.dispatchEvent(new Event('playing'));
    expect(fakeWindow.ekamLatency.rows).toHaveLength(0);
  } finally {
    keys.forEach(key => {
      const descriptor = previous.get(key);
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete (globalThis as any)[key];
    });
  }
});
