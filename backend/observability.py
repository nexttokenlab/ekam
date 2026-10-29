"""Latency-only application telemetry for LiveKit Agent Insights.

Provider durations include their network round trips, not pure inference time.
Do not attach prompts, transcripts, credentials, or participant details here.
"""
from contextlib import contextmanager
import time
import os
from livekit.agents.telemetry import tracer
from backend.latency import Probe


def recording_options():
    # SDK traces may include model text independently of transcript recording.
    # Benchmark mode uses only our allowlisted local latency rows.
    insights = os.getenv('EKAM_LATENCY_ENABLED', 'false').lower() != 'true'
    return {'audio': False, 'transcript': False, 'traces': insights, 'logs': insights}


class JobRecording:
    """Only the first session in a job may opt in, including after language changes.

    LiveKit initializes job-wide trace/log export once. Later directional sessions
    must use record=False; closing the primary does not release its designation.
    """
    def __init__(self):
        self.claimed = False

    def next_options(self):
        if self.claimed:
            return False
        self.claimed = True
        return recording_options()


@contextmanager
def stage(name, **attributes):
    # Explicit span lifetime avoids keeping a current-span context across generator yields.
    span = tracer.start_span('ekam.' + name, attributes={
        'ekam.' + key: value for key, value in attributes.items()
    })
    started = time.perf_counter()
    outcome = 'ok'
    try:
        yield span
    except BaseException as error:
        outcome = 'cancelled' if type(error).__name__ in ('CancelledError', 'GeneratorExit') else 'error'
        # Never record exception messages: provider errors can contain request text.
        span.set_attribute('ekam.error_type', type(error).__name__)
        raise
    finally:
        span.set_attribute('ekam.duration_seconds', time.perf_counter() - started)
        span.end()
        if name == 'translation_provider':
            Probe(attributes.get('source_language'), attributes.get('target_language')).observe(
                attributes.get('provider', 'unknown'), 'translation_request',
                time.perf_counter() - started, outcome=outcome)
