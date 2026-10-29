"""One-trial two-channel acoustic timing; never records or writes audio.

Requires a stereo interface with independently isolated source and listener
reference signals. Two built-in laptop microphones are NOT suitable substitutes.
"""
import argparse
import json
import queue
import time
import uuid

from backend.latency import row


class Detector:
    """Consumes short-lived channel levels, not audio. Clock = sample count."""
    def __init__(self, threshold=.01, quiet_ms=100, min_speech_ms=200):
        self.threshold = threshold
        self.quiet_ms, self.min_speech_ms = quiet_ms, min_speech_ms
        self.first_source = self.last_source = None
        self.playback = None

    def feed(self, at_ms, source_level, listener_level):
        if source_level >= self.threshold:
            if self.first_source is None:
                self.first_source = at_ms
            self.last_source = at_ms
        if self.first_source is None or self.last_source - self.first_source < self.min_speech_ms:
            return None
        if listener_level >= self.threshold:
            # Output before source ends is ambiguous/preemptive/bleed: reject it.
            if at_ms - self.last_source < self.quiet_ms:
                raise ValueError('Overlapping reference signals; trial rejected')
            self.playback = at_ms
            return (self.playback - self.last_source) / 1000
        return None


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--device', required=True, type=int, help='Stereo input interface index')
    parser.add_argument('--source', required=True)
    parser.add_argument('--target', required=True)
    parser.add_argument('--provider', required=True, help='Known winner from a controlled provider run')
    parser.add_argument('--threshold', type=float, default=.01, help='RMS threshold in both channels')
    parser.add_argument('--timeout', type=float, default=30)
    args = parser.parse_args()
    # Validate route before opening any capture device.
    sample = uuid.uuid4().hex
    row(args.source, args.target, args.provider, 'acoustic_e2e', 0, origin='live_acoustic', sample_id=sample)
    if not 0 < args.threshold < 1 or not 0 < args.timeout <= 300:
        parser.error('Invalid capture configuration')
    import numpy as np
    import sounddevice as sd
    levels = queue.Queue(maxsize=100)
    lost = False
    samples = 0
    rate, block = 48000, 480  # 10 ms quantization; no wall-clock synchronization.

    def callback(indata, frames, timing, status):
        nonlocal samples, lost
        if status:
            lost = True
        # indata is borrowed by sounddevice; do not retain it, copy it, or log it.
        rms = np.sqrt(np.mean(indata * indata, axis=0))
        samples += frames
        try:
            levels.put_nowait((samples * 1000 / rate, float(rms[0]), float(rms[1])))
        except queue.Full:
            lost = True

    detector = Detector(threshold=args.threshold)
    try:
        with sd.InputStream(device=args.device, channels=2, samplerate=rate, blocksize=block, callback=callback):
            deadline = time.monotonic() + args.timeout
            while time.monotonic() < deadline:
                if lost:
                    raise ValueError('Capture overrun')
                try:
                    value = detector.feed(*levels.get(timeout=.1))
                except queue.Empty:
                    continue
                if value is not None:
                    if lost:
                        raise ValueError('Capture overrun')
                    print(json.dumps(row(args.source, args.target, args.provider, 'acoustic_e2e', value,
                                         origin='live_acoustic', sample_id=sample)))
                    return
        raise ValueError('No complete acoustic trial')
    except Exception:
        parser.exit(2, 'Acoustic trial unavailable or ambiguous; no measurement produced.\n')


if __name__ == '__main__':
    main()
