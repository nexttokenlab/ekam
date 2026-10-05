"""A person's own voice ("Self"), cloned with Fish Audio from one conversation.

Learning is opt-in. The worker keeps only the learner's own committed speech, creates a
private Fish Audio voice from about 45 seconds of it, and discards the audio. The voice
can be removed, which also deletes it at Fish Audio. Shared by the API and the worker.
"""
import io
import os
import wave

import httpx

API = 'https://api.fish.audio'
# `s2.1-pro` needs Fish Audio credit; `s2.1-pro-free` is Fish Audio's free development model.
MODEL = os.getenv('FISH_TTS_MODEL', 's2.1-pro')
# Fish Audio speaks every TalkEasy language except Malayalam (and retired Odia); the
# Bulbul voice is used for listeners in those languages.
UNSUPPORTED_LANGUAGES = {'Malayalam', 'Odia'}
TARGET_SECONDS = 45.0  # clean speech collected before creating the voice
MIN_CLIP_SECONDS = 1.5  # shorter turns are too little signal to be worth keeping
MAX_CLIPS = 30


def api_key() -> str:
    return os.getenv('FISH_API_KEY', '')


def speaks(language: str | None) -> bool:
    return bool(language) and language not in UNSUPPORTED_LANGUAGES


def wav(pcm: bytes, sample_rate: int, channels: int = 1) -> bytes:
    """16-bit PCM samples as a WAV file."""
    out = io.BytesIO()
    with wave.open(out, 'wb') as file:
        file.setnchannels(channels)
        file.setsampwidth(2)
        file.setframerate(sample_rate)
        file.writeframes(pcm)
    return out.getvalue()


def _headers(key: str) -> dict:
    return {'Authorization': f'Bearer {key}'}


async def create_voice(client: httpx.AsyncClient, key: str, title: str, clips: list[tuple[bytes, str]]) -> str:
    """Create a private Fish Audio voice from (wav, transcript) clips; returns its id."""
    files = [('voices', (f'clip-{index}.wav', audio, 'audio/wav')) for index, (audio, _) in enumerate(clips)]
    data = {'type': 'tts', 'title': title, 'visibility': 'private', 'train_mode': 'fast',
            'texts': [text for _, text in clips]}
    response = await client.post(f'{API}/model', headers=_headers(key), data=data, files=files)
    response.raise_for_status()
    voice_id = response.json().get('_id')
    if not isinstance(voice_id, str) or not voice_id:
        raise ValueError('Fish Audio returned no voice id')
    return voice_id


async def delete_voice(client: httpx.AsyncClient, key: str, voice_id: str) -> None:
    response = await client.delete(f'{API}/model/{voice_id}', headers=_headers(key))
    if response.status_code != 404:  # Already gone is fine.
        response.raise_for_status()


async def synthesize(client: httpx.AsyncClient, key: str, voice_id: str, text: str) -> bytes:
    """MP3 of `text` in the cloned voice (used for profile previews)."""
    response = await client.post(f'{API}/v1/tts', headers={**_headers(key), 'model': MODEL},
                                 json={'text': text, 'reference_id': voice_id, 'format': 'mp3'})
    response.raise_for_status()
    return response.content
