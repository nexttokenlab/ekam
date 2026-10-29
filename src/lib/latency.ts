/** Optional listener diagnostics. No audio buffers leave this function or persist.
 * Render energy is a playback proxy, never evidence of acoustic speaker output.
 * Enable with ?latency=1 before connecting; export via window.ekamLatency.download().
 */
import type { Language } from './session';

type Observation = {
  schema: 1; origin: 'live_browser'; probe_id: string; source: Language; target: Language;
  event: 'attached' | 'playing' | 'waiting' | 'stalled' | 'render_energy_onset' | 'render_energy_offset' | 'unsupported' | 'autoplay_blocked';
  offset_ms: number;
};
declare global {
  interface Window {
    ekamLatency?: { rows: Observation[]; download: () => void; clear: () => void };
  }
}

export function observePlayback(element: HTMLMediaElement, stream: MediaStream, source: Language, target: Language): () => void {
  if (new URLSearchParams(location.search).get('latency') !== '1') return () => {};
  if (!window.ekamLatency) {
    const rows: Observation[] = [];
    window.ekamLatency = {
      rows,
      clear: () => { rows.length = 0; },
      download: () => {
        const url = URL.createObjectURL(new Blob([rows.map(r => JSON.stringify(r)).join('\n') + '\n'], { type: 'application/x-ndjson' }));
        const link = document.createElement('a');
        link.href = url; link.download = 'ekam-browser-observations.jsonl'; link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      },
    };
  }
  const rows = window.ekamLatency.rows;
  const probeId = crypto.randomUUID();
  const started = performance.now();
  const record = (event: Observation['event']) => {
    rows.push({ schema: 1, origin: 'live_browser', probe_id: probeId, source, target, event,
      offset_ms: Math.round((performance.now() - started) * 10) / 10 });
    if (rows.length > 2000) rows.shift();
  };
  record('attached');
  const onPlaying = () => record('playing');
  const onWaiting = () => record('waiting');
  const onStalled = () => record('stalled');
  element.addEventListener('playing', onPlaying);
  element.addEventListener('waiting', onWaiting);
  element.addEventListener('stalled', onStalled);
  let context: AudioContext | undefined;
  let input: MediaStreamAudioSourceNode | undefined;
  let timer: number | undefined;
  let closed = false;
  try {
    context = new AudioContext();
    input = context.createMediaStreamSource(stream);
    const analyser = context.createAnalyser();
    analyser.fftSize = 512;
    input.connect(analyser); // No connection to destination: avoids duplicate audio.
    const samples = new Float32Array(analyser.fftSize);
    let active = false;
    void context.resume().then(() => {
      if (closed) return;
      if (context?.state !== 'running') { record('autoplay_blocked'); return; }
      timer = window.setInterval(() => {
        if (context?.state !== 'running') return;
        analyser.getFloatTimeDomainData(samples);
        const energy = Math.sqrt(samples.reduce((sum, v) => sum + v * v, 0) / samples.length);
        const next = energy > 0.01; // Fixed -40 dBFS threshold; 20 ms polling resolution.
        if (next !== active) record(next ? 'render_energy_onset' : 'render_energy_offset');
        active = next;
      }, 20);
    }).catch(() => { if (!closed) record('autoplay_blocked'); });
  } catch { record('unsupported'); }
  return () => {
    closed = true;
    element.removeEventListener('playing', onPlaying);
    element.removeEventListener('waiting', onWaiting);
    element.removeEventListener('stalled', onStalled);
    if (timer !== undefined) window.clearInterval(timer);
    input?.disconnect();
    void context?.close().catch(() => {});
  };
}
