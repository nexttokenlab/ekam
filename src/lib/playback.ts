// While the other person's translation plays from this phone's speaker, the phone's own
// microphone would pick it up and send it back as this person's speech. The worker tells
// each listener when its translation starts and stops; the mic is held in between.

export const PLAYBACK_TOPIC = "talkeasy.playback";
// Speaker audio can still be draining after the worker finishes sending it.
export const MIC_RESUME_DELAY_MS = 500;
// Someone already mid-sentence when a translation starts keeps their mic this long at most.
export const MAX_HOLD_DEFERRAL_MS = 3000;
// Releases the mic if a "stopped" message never arrives (for example, the worker restarts).
export const MAX_PLAYBACK_HOLD_MS = 30000;

// Earphones and headsets keep the speaker away from the mic, so there is no echo to avoid.
const EARPHONES = /airpods|buds|head ?set|head ?phone|earphone|hands-?free|bluetooth|\bbt\b/i;

export function usesEarphones(microphoneLabel: string | undefined | null): boolean {
  return !!microphoneLabel && EARPHONES.test(microphoneLabel);
}

export function parsePlayback(payload: Uint8Array): boolean | null {
  try {
    const message = JSON.parse(new TextDecoder().decode(payload));
    return message?.type === "playback" && typeof message.speaking === "boolean" ? message.speaking : null;
  } catch {
    return null;
  }
}

export function micShouldListen({ active, translationPlaying, earphones, deferHold }: {
  active: boolean;
  translationPlaying: boolean;
  earphones: boolean;
  deferHold: boolean;
}): boolean {
  return active && (!translationPlaying || earphones || deferHold);
}
