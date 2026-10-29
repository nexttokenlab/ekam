"""Opt-in, content-free benchmark rows. Standard library only; no audio/text API.

Each duration uses one monotonic clock. SDK durations are kept separate from
node observations and physical, same-clock acoustic measurements.
"""
from __future__ import annotations

from collections import defaultdict
from contextlib import contextmanager
import json
import logging
import math
import os
import time
import uuid

LANGUAGES = frozenset(('English Hindi Bengali Tamil Telugu Gujarati Kannada Malayalam Marathi Punjabi French Arabic Italian Korean Japanese').split())
PROVIDERS = frozenset(('sarvam sarvam-mayura sarvam-translate gemini openai fishaudio fishaudio-fallback passthrough unknown').split())
METRICS = frozenset(('translation_request translation_first_text translation_complete tts_node_first_frame tts_node_complete sdk_endpointing sdk_transcription sdk_tts_ttfb sdk_playout_e2e sdk_playback acoustic_e2e').split())
ORIGINS = frozenset(('simulated live_worker live_acoustic').split())
OUTCOMES = frozenset(('ok error cancelled discarded interrupted suppressed').split())
KEYS = frozenset(('schema origin sample_id source target provider metric milliseconds outcome').split())
logger = logging.getLogger('ekam.latency')


def validate(row):
    """Reject unknown fields rather than accidentally exporting speech or identity."""
    if set(row) != KEYS or row['schema'] != 1:
        raise ValueError('Invalid latency schema')
    if row['origin'] not in ORIGINS or row['metric'] not in METRICS or row['outcome'] not in OUTCOMES:
        raise ValueError('Invalid latency classification')
    if row['source'] not in LANGUAGES or row['target'] not in LANGUAGES or row['provider'] not in PROVIDERS:
        raise ValueError('Invalid latency route')
    sample = row['sample_id']
    if not isinstance(sample, str) or len(sample) != 32 or any(c not in '0123456789abcdef' for c in sample):
        raise ValueError('Invalid random sample id')
    value = row['milliseconds']
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) or not 0 <= value <= 3_600_000:
        raise ValueError('Invalid duration')
    return row


def row(source, target, provider, metric, seconds, *, origin='live_worker', outcome='ok', sample_id=None):
    return validate(dict(schema=1, origin=origin, sample_id=sample_id or uuid.uuid4().hex,
                         source=source, target=target, provider=provider, metric=metric,
                         milliseconds=round(seconds * 1000, 3), outcome=outcome))


class Probe:
    """No-op by default. Emit only allowlisted rows to the application's log sink.

    No timestamps, SDK request IDs, session IDs, user IDs, model responses or
    exception strings enter this stream. Provision log retention separately.
    """
    def __init__(self, source, target, *, enabled=None, emit=None, clock=time.perf_counter, origin=None):
        self.source, self.target = source, target
        self.origin = origin or os.getenv('EKAM_LATENCY_ORIGIN', 'live_worker')
        self.enabled = os.getenv('EKAM_LATENCY_ENABLED', 'false').lower() == 'true' if enabled is None else enabled
        self.emit = emit or (lambda value: logger.info('ekam_latency %s', json.dumps(value, sort_keys=True)))
        self.clock = clock

    def observe(self, provider, metric, seconds, *, outcome='ok', sample_id=None):
        if not self.enabled:
            return
        try:
            value = row(self.source, self.target, provider, metric, seconds, outcome=outcome, sample_id=sample_id, origin=self.origin)
        except (ValueError, TypeError, OverflowError):
            return  # New SDK types/invalid values never break voice processing.
        try:
            self.emit(value)
        except Exception:
            pass  # An unavailable telemetry sink must not break voice processing.

    @contextmanager
    def duration(self, provider, metric):
        start, outcome = self.clock(), 'ok'
        try:
            yield
        except BaseException as error:
            outcome = 'cancelled' if type(error).__name__ in ('CancelledError', 'GeneratorExit') else 'error'
            raise
        finally:
            self.observe(provider, metric, self.clock() - start, outcome=outcome)

    def sdk_metrics(self, metrics, stt_provider, tts_provider):
        # These are SDK-defined durations, not physical playback timestamps.
        if metrics.type == 'eou_metrics':
            for attr, metric in (('end_of_utterance_delay', 'sdk_endpointing'), ('transcription_delay', 'sdk_transcription')):
                value = getattr(metrics, attr, None)
                if value is not None:
                    self.observe(stt_provider, metric, value)
        elif metrics.type == 'tts_metrics':
            value = getattr(metrics, 'ttfb', None)
            if value is not None:
                self.observe(tts_provider, 'sdk_tts_ttfb', value,
                             outcome='cancelled' if getattr(metrics, 'cancelled', False) else 'ok')

    def sdk_playout(self, metrics, provider, interrupted=False):
        for attr, metric in (('e2e_latency', 'sdk_playout_e2e'), ('playback_latency', 'sdk_playback')):
            value = metrics.get(attr)
            if value is not None:
                self.observe(provider, metric, value, outcome='interrupted' if interrupted else 'ok')


def percentile(values, p):
    """Nearest-rank percentile; p95 is the maximum for fewer than 20 samples."""
    return sorted(values)[max(0, math.ceil(p * len(values)) - 1)]


def summarize(rows):
    groups = defaultdict(list)
    seen = set()
    for value in rows:
        validate(value)
        # Exact retransmitted rows count once; independent stage samples remain separate.
        key = tuple(value[k] for k in sorted(KEYS))
        if key in seen:
            continue
        seen.add(key)
        groups[tuple(value[k] for k in ('origin', 'source', 'target', 'provider', 'metric'))].append(value)
    result = []
    for key, values in sorted(groups.items()):
        good = [v['milliseconds'] for v in values if v['outcome'] == 'ok']
        counts = {o: sum(v['outcome'] == o for v in values) for o in sorted(OUTCOMES)}
        result.append(dict(zip(('origin', 'source', 'target', 'provider', 'metric'), key),
                           n=len(good), outcomes=counts,
                           p50_ms=percentile(good, .50) if good else None,
                           p95_ms=percentile(good, .95) if good else None,
                           small_sample=len(good) < 100))
    return result
