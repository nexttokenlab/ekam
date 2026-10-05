from backend.translation import TranslationConfig, GEMINI_URL
from backend.main import Settings
from backend.voice_check import missing_credentials


def test_gemini_routes_to_google_without_openai_key(monkeypatch):
    monkeypatch.setenv('TRANSLATION_PROVIDER', 'gemini')
    monkeypatch.delenv('TRANSLATION_MODEL', raising=False)
    monkeypatch.setenv('GEMINI_API_KEY', 'gemini-test-secret')
    monkeypatch.delenv('OPENAI_API_KEY', raising=False)
    config = TranslationConfig.from_env()
    assert config.model == 'gemini-3.1-flash-lite'
    assert config.base_url == GEMINI_URL
    assert config.api_key == 'gemini-test-secret'
    assert 'gemini-test-secret' not in repr(config)
    assert 'OPENAI_API_KEY' not in missing_credentials()
    settings = Settings(_env_file=None, translation_provider='gemini', gemini_api_key='test',
                        openai_api_key='', livekit_url='wss://test', livekit_api_key='test',
                        livekit_api_secret='test', sarvam_api_key='test', worker_secret='test')
    assert settings.voice_ready


def test_missing_gemini_key_never_uses_openai_key(monkeypatch):
    monkeypatch.setenv('TRANSLATION_PROVIDER', 'gemini')
    monkeypatch.delenv('GEMINI_API_KEY', raising=False)
    monkeypatch.setenv('OPENAI_API_KEY', 'paid-key')
    assert TranslationConfig.from_env().api_key == ''
    assert 'GEMINI_API_KEY' in missing_credentials()
    settings = Settings(_env_file=None, translation_provider='gemini', gemini_api_key='',
                        openai_api_key='paid-key')
    assert not settings.voice_ready
