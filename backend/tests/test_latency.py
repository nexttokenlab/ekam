"""Offline contract and statistics tests; no credentials or network required."""
import asyncio
from contextlib import redirect_stdout, redirect_stderr
import io
import json
import tempfile
from pathlib import Path
from types import SimpleNamespace
import unittest

from backend.latency import Probe, row, summarize, validate
from benchmarks.latency import main, simulated


class LatencyTests(unittest.TestCase):
    def test_nearest_rank_and_direction_provider_origin_isolation(self):
        values = [row('English', 'Hindi', 'sarvam', 'acoustic_e2e', n / 1000, origin='simulated', sample_id=f'{n:032x}') for n in range(1, 101)]
        values += [row('Hindi', 'English', 'sarvam', 'acoustic_e2e', 5),
                   row('English', 'Hindi', 'gemini', 'acoustic_e2e', 6),
                   row('English', 'Hindi', 'sarvam', 'acoustic_e2e', 7, origin='live_acoustic')]
        report = summarize(values)
        group = next(v for v in report if v['origin'] == 'simulated')
        self.assertEqual((group['n'], group['p50_ms'], group['p95_ms']), (100, 50, 95))
        self.assertFalse(group['small_sample'])
        self.assertEqual(len(report), 4)

    def test_failures_are_counted_and_never_improve_success_percentiles(self):
        values = [row('English', 'Hindi', 'sarvam', 'translation_complete', 1)]
        values += [row('English', 'Hindi', 'sarvam', 'translation_complete', .001, outcome=o) for o in ('error', 'cancelled', 'discarded', 'interrupted', 'suppressed')]
        result = summarize(values)[0]
        self.assertEqual(result['n'], 1)
        self.assertEqual(result['p95_ms'], 1000)
        self.assertEqual(sum(result['outcomes'].values()), 6)
        self.assertEqual(summarize(values[1:])[0]['p95_ms'], None)
        self.assertEqual(summarize([]), [])

    def test_exact_duplicate_rows_are_not_double_counted(self):
        value = row('English', 'Hindi', 'sarvam', 'sdk_endpointing', .5)
        self.assertEqual(summarize([value, value])[0]['n'], 1)

    def test_reject_content_and_identity_fields_and_invalid_numbers(self):
        value = row('English', 'Hindi', 'sarvam', 'translation_complete', 1)
        for key in ('audio', 'transcript', 'prompt', 'session_id', 'phone', 'error'):
            with self.assertRaises(ValueError):
                validate(dict(value, **{key: 'sensitive'}))
        for value in (-1, float('nan'), float('inf'), True):
            with self.assertRaises(ValueError):
                validate(dict(row('English', 'Hindi', 'sarvam', 'sdk_endpointing', 0), milliseconds=value))
        with self.assertRaises(ValueError):
            row('private text', 'Hindi', 'sarvam', 'sdk_endpointing', .5)

    def test_probe_noop_and_sink_failure_do_not_break_voice(self):
        values = []
        Probe('English', 'Hindi', enabled=False, emit=values.append).observe('sarvam', 'translation_complete', 1)
        self.assertEqual(values, [])
        def fail(value):
            raise RuntimeError('sink unavailable')
        Probe('English', 'Hindi', enabled=True, emit=fail).observe('sarvam', 'translation_complete', 1)

    def test_duration_error_and_cancellation_never_export_exception_text(self):
        for exception, expected in [(RuntimeError('private text'), 'error'), (asyncio.CancelledError('private text'), 'cancelled')]:
            values, ticks = [], iter([1, 2])
            probe = Probe('English', 'Hindi', enabled=True, emit=values.append, clock=lambda: next(ticks))
            with self.assertRaises(type(exception)):
                with probe.duration('sarvam', 'translation_request'):
                    raise exception
            self.assertEqual(values[0]['outcome'], expected)
            self.assertNotIn('private text', json.dumps(values))

    def test_sdk_adapter_keeps_definitions_separate_and_ignores_bad_values(self):
        values = []
        p = Probe('English', 'Hindi', enabled=True, emit=values.append)
        p.sdk_metrics(SimpleNamespace(type='eou_metrics', end_of_utterance_delay=.5, transcription_delay=.2), 'sarvam', 'sarvam')
        p.sdk_metrics(SimpleNamespace(type='tts_metrics', ttfb=.3, cancelled=True), 'sarvam', 'sarvam')
        p.sdk_playout({'e2e_latency': 1.5, 'playback_latency': float('nan')}, 'unknown')
        self.assertEqual([v['metric'] for v in values], ['sdk_endpointing', 'sdk_transcription', 'sdk_tts_ttfb', 'sdk_playout_e2e'])
        self.assertEqual(values[2]['outcome'], 'cancelled')
        self.assertEqual(values[3]['provider'], 'unknown')

    def test_simulated_fixture_is_deterministic_and_honestly_labeled(self):
        first, second = list(simulated()), list(simulated())
        self.assertEqual(first, second)
        self.assertEqual({v['origin'] for v in first}, {'simulated'})
        group = next(v for v in summarize(first) if v['source'] == 'English' and v['metric'] == 'acoustic_e2e')
        self.assertEqual((group['p50_ms'], group['p95_ms']), (2290, 2740))

    def test_cli_extract_only_exports_allowlisted_rows(self):
        value = row('English', 'Hindi', 'sarvam', 'translation_complete', 1)
        with tempfile.TemporaryDirectory() as directory:
            file = Path(directory) / 'worker.log'
            file.write_text('some unrelated application log\nINFO ekam_latency ' + json.dumps(value) + '\n')
            output = io.StringIO()
            with redirect_stdout(output):
                main(['extract', str(file)])
            self.assertEqual(json.loads(output.getvalue()), value)
            file.write_text('ekam_latency {"transcript":"private content"}\n')
            output, errors = io.StringIO(), io.StringIO()
            with redirect_stdout(output), redirect_stderr(errors), self.assertRaises(SystemExit):
                main(['extract', str(file)])
            self.assertEqual(output.getvalue(), '')
            self.assertNotIn('private content', errors.getvalue())

    def test_acoustic_import_validates_same_clock_interval(self):
        output = io.StringIO()
        args = ['acoustic', '--source', 'English', '--target', 'Hindi', '--provider', 'sarvam-mayura', '--sample-id', 'a' * 32]
        with redirect_stdout(output):
            main(args + ['--speech-end-ms', '1000', '--playback-start-ms', '2500'])
        result = json.loads(output.getvalue())
        self.assertEqual((result['origin'], result['milliseconds']), ('live_acoustic', 1500))
        with redirect_stderr(io.StringIO()), self.assertRaises(SystemExit):
            main(args + ['--speech-end-ms', '2500', '--playback-start-ms', '1000'])


class AcousticDetectorTests(unittest.TestCase):
    def test_same_sample_clock_detects_interval_without_saving_audio(self):
        from benchmarks.acoustic import Detector
        d = Detector()
        for at in range(10, 311, 10):
            self.assertIsNone(d.feed(at, .1, 0))
        for at in range(320, 1810, 10):
            self.assertIsNone(d.feed(at, 0, 0))
        self.assertEqual(d.feed(1810, 0, .1), 1.5)

    def test_overlap_is_rejected_instead_of_false_low_latency(self):
        from benchmarks.acoustic import Detector
        d = Detector()
        for at in range(10, 311, 10):
            d.feed(at, .1, 0)
        with self.assertRaises(ValueError):
            d.feed(320, 0, .1)


if __name__ == '__main__':
    unittest.main()
