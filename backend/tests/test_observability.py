from unittest.mock import MagicMock
import pytest
from backend import observability


def test_latency_collection_does_not_enable_recordings_or_transcripts():
    assert observability.recording_options() == {
        'audio': False, 'transcript': False, 'traces': True, 'logs': True,
    }


@pytest.mark.parametrize('fails', [False, True])
def test_spans_end_on_success_and_error_without_exception_content(monkeypatch, fails):
    tracer = MagicMock()
    monkeypatch.setattr(observability, 'tracer', tracer)
    try:
        with observability.stage('translation_provider', provider='sarvam'):
            if fails:
                raise ValueError('private provider response')
    except ValueError:
        pass
    span = tracer.start_span.return_value
    span.end.assert_called_once()
    assert 'private provider response' not in str(span.mock_calls)
    duration = [call.args[1] for call in span.set_attribute.call_args_list
                if call.args[0] == 'ekam.duration_seconds']
    assert len(duration) == 1 and duration[0] >= 0
    if fails:
        span.set_attribute.assert_any_call('ekam.error_type', 'ValueError')


def test_real_sdk_primary_guard_accepts_both_directions_and_reconfiguration(monkeypatch):
    """Exercise the installed SDK's actual primary check, stopping before media I/O."""
    import asyncio
    from types import SimpleNamespace
    from livekit.agents import AgentSession, Agent
    from livekit.agents.voice import agent_session

    class PassedPrimaryCheck(Exception):
        pass

    job = SimpleNamespace(_primary_agent_session=None)
    calls = []
    def init_recording(options):
        calls.append(options)
        raise PassedPrimaryCheck()
    job.init_recording = init_recording
    monkeypatch.setattr(agent_session, 'get_job_context', lambda **kwargs: job)

    async def scenario():
        policy = observability.JobRecording()
        # Two directions initially, and two recreated after a language change.
        for _ in range(4):
            session = AgentSession()
            with pytest.raises(PassedPrimaryCheck):
                await session.start(Agent(instructions='Translate'), record=policy.next_options())
    asyncio.run(scenario())
    assert calls[0]['traces'] and calls[0]['logs']
    assert all(not any(options.values()) for options in calls[1:])
