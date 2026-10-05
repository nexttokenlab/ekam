"""Explicit provider routing; Gemini never falls back to a paid OpenAI call."""
import os
from dataclasses import dataclass, field

GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/openai/'
KEY_NAMES = {'openai': 'OPENAI_API_KEY', 'gemini': 'GEMINI_API_KEY'}
DEFAULT_MODELS = {'openai': 'gpt-4.1-mini', 'gemini': 'gemini-3.1-flash-lite'}

@dataclass(frozen=True)
class TranslationConfig:
    provider: str
    model: str
    api_key: str = field(repr=False)
    base_url: str

    @classmethod
    def from_env(cls):
        provider = os.getenv('TRANSLATION_PROVIDER', 'openai').strip().lower()
        if provider not in KEY_NAMES:
            raise ValueError('TRANSLATION_PROVIDER must be gemini or openai')
        return cls(provider, os.getenv('TRANSLATION_MODEL') or DEFAULT_MODELS[provider],
                   os.getenv(KEY_NAMES[provider], ''),
                   GEMINI_URL if provider == 'gemini' else 'https://api.openai.com/v1')

    def client_options(self):
        return {'api_key': self.api_key, 'base_url': self.base_url}
