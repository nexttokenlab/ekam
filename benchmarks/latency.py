"""python -m benchmarks.latency {simulate,report,extract,acoustic} ..."""
import argparse
import json
from pathlib import Path
import sys

from backend.latency import row, summarize, validate


def simulated():
    # Deterministic regression fixtures, NOT provider performance claims.
    for index in range(100):
        for source, target, provider in [('English', 'Hindi', 'sarvam'), ('Hindi', 'Kannada', 'sarvam'), ('French', 'English', 'gemini')]:
            sample = f'{index * 3 + (0 if source == "English" else 1 if source == "Hindi" else 2):032x}'
            for metric, seconds in [('sdk_endpointing', .5 + index / 1000), ('translation_first_text', .8 + index / 100), ('tts_node_first_frame', .2 + index / 1000), ('acoustic_e2e', 1.8 + index / 100)]:
                yield row(source, target, provider, metric, seconds, origin='simulated', sample_id=sample)
    for outcome in ('error', 'cancelled', 'discarded', 'interrupted', 'suppressed'):
        yield row('English', 'Hindi', 'sarvam', 'translation_complete', 2,
                  origin='simulated', outcome=outcome, sample_id=f'{1000 + len(outcome):032x}')


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest='command', required=True)
    sub.add_parser('simulate')
    for name in ('report', 'extract'):
        cmd = sub.add_parser(name)
        cmd.add_argument('input', type=Path)
    acoustic = sub.add_parser('acoustic', help='Import two same-recorder timestamps; never takes audio')
    acoustic.add_argument('--source', required=True)
    acoustic.add_argument('--target', required=True)
    acoustic.add_argument('--provider', required=True)
    acoustic.add_argument('--speech-end-ms', type=float, required=True)
    acoustic.add_argument('--playback-start-ms', type=float, required=True)
    acoustic.add_argument('--sample-id', required=True, help='Random 32-character hex trial id')
    args = parser.parse_args(argv)
    try:
        if args.command == 'simulate':
            for value in simulated():
                print(json.dumps(value, sort_keys=True))
        elif args.command == 'acoustic':
            # Both timestamps must come from the same clock, never two phones' Date.now().
            import math
            if not all(math.isfinite(v) and v >= 0 for v in (args.speech_end_ms, args.playback_start_ms)):
                raise ValueError('Invalid acoustic timestamp')
            print(json.dumps(row(args.source, args.target, args.provider, 'acoustic_e2e',
                                 (args.playback_start_ms - args.speech_end_ms) / 1000,
                                 origin='live_acoustic', sample_id=args.sample_id)))
        else:
            values = []
            with args.input.open() as source:
                for line in source:
                    if not line.strip():
                        continue
                    if args.command == 'extract':
                        if 'ekam_latency ' not in line:
                            continue
                        line = line.split('ekam_latency ', 1)[1]
                    values.append(validate(json.loads(line)))
            if args.command == 'report':
                print(json.dumps(summarize(values), indent=2, sort_keys=True))
            else:
                for value in values:
                    print(json.dumps(value, sort_keys=True))
    except (ValueError, KeyError, TypeError, OSError):
        # Do not reflect bad input: it may contain provider text or credentials.
        parser.exit(2, 'Invalid benchmark input; no report produced.\n')


if __name__ == '__main__':
    main()
