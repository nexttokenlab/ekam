"""Safe setup checks: python -m backend.voice_check [--cloud]. Never prints secrets."""
from __future__ import annotations

import argparse
import asyncio
import os
from pathlib import Path

from dotenv import load_dotenv
from backend.translation import TranslationConfig, KEY_NAMES

ROOT = Path(__file__).resolve().parents[1]
load_dotenv(ROOT / '.env.local')
load_dotenv(ROOT / '.env')
REQUIRED = ('LIVEKIT_URL', 'LIVEKIT_API_KEY', 'LIVEKIT_API_SECRET',
            'SARVAM_API_KEY', 'WORKER_SECRET')


def missing_credentials():
    required = (*REQUIRED, KEY_NAMES[TranslationConfig.from_env().provider])
    return [key for key in required if not os.getenv(key, '').strip()]


async def check(cloud=False):
    missing = missing_credentials()
    config = TranslationConfig.from_env()
    print(f'Translation: {config.provider} / {config.model}')
    for key in (*REQUIRED, KEY_NAMES[config.provider]):
        print(f'{key}: {"missing" if key in missing else "configured"}')
    ok = not missing
    # Read only cached assets. This check never triggers a model download.
    try:
        from huggingface_hub import hf_hub_download
        from livekit.plugins import silero
        from livekit.plugins.turn_detector.models import HG_MODEL, MODEL_REVISIONS, ONNX_FILENAME
        from transformers import AutoTokenizer
        silero.VAD.load(min_speech_duration=0.25)
        revision = MODEL_REVISIONS['multilingual']
        for filename in (f'onnx/{ONNX_FILENAME}', 'languages.json'):
            hf_hub_download(HG_MODEL, filename, revision=revision, local_files_only=True)
        AutoTokenizer.from_pretrained(HG_MODEL, revision=revision, local_files_only=True)
        print('VAD and semantic turn assets: ready')
    except Exception as error:
        print(f'Model assets: unavailable ({type(error).__name__}); run python -m backend.agent download-files')
        ok = False
    if cloud:
        if any(key in missing for key in REQUIRED[:3]):
            print('LiveKit connection: skipped (missing credentials)')
        else:
            try:
                from livekit import api
                async with api.LiveKitAPI() as client:
                    await client.room.list_rooms(api.ListRoomsRequest())
                print('LiveKit connection: authenticated')
            except Exception as error:
                print(f'LiveKit connection: failed ({type(error).__name__})')
                ok = False
    print('Configuration ready; provider billing/access still needs a live test.' if ok
          else 'Setup incomplete; resolve the missing items above.')
    return ok


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--cloud', action='store_true', help='Verify LiveKit credentials with a read-only API call')
    raise SystemExit(0 if asyncio.run(check(parser.parse_args().cloud)) else 1)
