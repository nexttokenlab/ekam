"""Opt-in live smoke test. Uses reserved fictional numbers and incurs small model usage.
Run from repository root with .venv/bin/python scripts/voice_smoke.py.
Only synthetic phrases, counts and timing are printed; credentials never are.
"""
import asyncio
import json
import time
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import aiohttp
import httpx
from dotenv import load_dotenv
from livekit import rtc
from livekit.plugins import sarvam

URL = 'https://talkeasy-app-production.up.railway.app'
load_dotenv('.env.local')

async def main():
    clients = [httpx.AsyncClient(base_url=URL, timeout=30) for _ in range(2)]
    rooms = [rtc.Room(), rtc.Room()]
    sources = [rtc.AudioSource(24000, 1) for _ in range(2)]
    heard = [0, 0]
    readers = []
    subscribed = [asyncio.Event(), asyncio.Event()]
    sid = None
    async def api(i, method, path, **kwargs):
        r = await clients[i].request(method, path, **kwargs)
        if r.status_code >= 400:
            raise RuntimeError(f'{method} {path}: HTTP {r.status_code}')
        return r.json()
    try:
        people = []
        for i, lang in enumerate(['English', 'Hindi']):
            phone = f'+1202555019{i+1}'  # NANP reserved fictional numbers
            otp = await api(i, 'POST', '/api/auth/otp', json={'phone': phone})
            if not otp.get('development_code'):
                raise RuntimeError('Smoke test requires development OTP mode')
            people.append(await api(i, 'POST', '/api/auth/verify', json={
                'phone': phone, 'code': otp['development_code'],
                'name': f'Ekam QA {i+1}', 'language': lang, 'languages': [lang]}))
        qr = await api(0, 'POST', '/api/qr')
        req = await api(1, 'POST', '/api/requests', json={'code': qr['code']})
        await api(0, 'POST', f'/api/requests/{req["id"]}/respond', json={'accept': True})
        state = await api(0, 'GET', '/api/state')
        sid = state['session']['id']
        print(json.dumps({'test_session': sid}), flush=True)
        for i, room in enumerate(rooms):
            def on_track(track, publication, participant, index=i):
                if publication.name != f'translation:{people[index]["id"]}':
                    return
                subscribed[index].set()
                async def receive():
                    audio = rtc.AudioStream(track, sample_rate=24000, num_channels=1)
                    try:
                        async for event in audio:
                            if max((abs(v) for v in event.frame.data), default=0) > 300:
                                heard[index] += 1
                    finally:
                        await audio.aclose()
                readers.append(asyncio.create_task(receive()))
            room.on('track_subscribed', on_track)
            token = await api(i, 'POST', f'/api/sessions/{sid}/token')
            await room.connect(token['url'], token['token'])
            track = rtc.LocalAudioTrack.create_audio_track('qa-microphone', sources[i])
            await room.local_participant.publish_track(track, rtc.TrackPublishOptions(source=rtc.TrackSource.SOURCE_MICROPHONE))
        await asyncio.wait_for(asyncio.gather(*(e.wait() for e in subscribed)), 45)
        await asyncio.sleep(2)
        async with aiohttp.ClientSession() as http:
            async def speak(index, language, phrase):
                before_audio = heard[1-index]
                before = len((await api(0, 'GET', '/api/state'))['session']['turns'])
                tts = sarvam.TTS(target_language_code=language, speech_sample_rate=24000, http_session=http, speaker='shubh')
                frames = []
                try:
                    async with tts.synthesize(phrase) as stream:
                        async for event in stream:
                            frames.append(event.frame)
                finally:
                    await tts.aclose()
                # Feed at audio clock speed; AudioSource handles queue pacing.
                for frame in frames:
                    await sources[index].capture_frame(frame)
                await sources[index].wait_for_playout()
                stopped = time.monotonic()
                for _ in range(100):  # 2 seconds of silence finalizes VAD.
                    await sources[index].capture_frame(rtc.AudioFrame.create(24000, 1, 480))
                await sources[index].wait_for_playout()
                for _ in range(45):
                    st = (await api(0, 'GET', '/api/state'))['session']
                    if len(st['turns']) > before and heard[1-index] > before_audio:
                        print(json.dumps({'direction': f'{index+1}->{2-index}', 'input_language': language,
                            'translated_turns': len(st['turns'])-before,
                            'received_non_silent_frames': heard[1-index]-before_audio,
                            'observed_completion_seconds_after_input': round(time.monotonic()-stopped, 2)}), flush=True)
                        await asyncio.sleep(5)
                        return
                    await asyncio.sleep(1)
                raise RuntimeError(f'No translated audio for {language}; received frames delta={heard[1-index]-before_audio}')
            await speak(0, 'en-IN', 'Hello. How are you today?')
            await speak(1, 'hi-IN', 'मैं ठीक हूँ। आप कहाँ से हैं?')
            for event in subscribed:
                event.clear()
            await api(1, 'PATCH', f'/api/sessions/{sid}/language', json={'language': 'Kannada'})
            await asyncio.wait_for(asyncio.gather(*(e.wait() for e in subscribed)), 45)
            await asyncio.sleep(2)
            await speak(1, 'kn-IN', 'ನಮಸ್ಕಾರ. ನೀವು ಇಂದು ಹೇಗಿದ್ದೀರಿ?')
            await speak(0, 'en-IN', 'I am well. Thank you for asking.')
        print('PASS: both directions and live language reconfiguration delivered non-silent translated audio', flush=True)
    finally:
        if sid:
            try:
                await api(0, 'POST', f'/api/sessions/{sid}/end')
                print('Test conversation ended', flush=True)
            except Exception as error:
                print('Cleanup failed: ' + type(error).__name__, flush=True)
        await asyncio.gather(*(r.disconnect() for r in rooms), return_exceptions=True)
        for task in readers:
            task.cancel()
        await asyncio.gather(*readers, return_exceptions=True)
        for source in sources:
            await source.aclose()
        for client in clients:
            await client.aclose()

if __name__ == '__main__':
    asyncio.run(main())
