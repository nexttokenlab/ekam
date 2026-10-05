"""Sarvam Bulbul v3 voices a person can choose for their translated speech.

A person's voice is what the other participant hears when that person's words are
translated. Shared by the API (profile, previews) and the worker (TTS speaker).
"""
import base64

import httpx

BULBUL_MODEL = 'bulbul:v3'
DEFAULT_VOICE = 'shubh'
# Without a chosen voice, a person's gender picks a matching default.
DEFAULT_VOICES = {'male': 'shubh', 'female': 'ritu'}
# Gemini speaks the listener languages Bulbul does not (French, Arabic, ...).
GEMINI_VOICES = {'male': 'Charon', 'female': 'Kore'}
# A short, curated list (all Bulbul v3 voices); earlier choices outside it fall back to the default.
VOICES = {
    'female': ['ritu', 'priya', 'neha', 'pooja', 'kavya', 'shreya'],
    'male': ['shubh', 'aditya', 'rahul', 'rohan', 'amit', 'kabir'],
}
ALL_VOICES = frozenset(VOICES['female'] + VOICES['male'])

# Preview sentences in the languages Bulbul speaks; other languages preview in English.
SAMPLES = {
    'English': ('en-IN', 'Hello! This is how my translated voice will sound.'),
    'Hindi': ('hi-IN', 'नमस्ते! अनुवाद में मेरी आवाज़ ऐसी सुनाई देगी।'),
    'Bengali': ('bn-IN', 'নমস্কার! অনুবাদে আমার কণ্ঠস্বর এমন শোনাবে।'),
    'Tamil': ('ta-IN', 'வணக்கம்! மொழிபெயர்ப்பில் என் குரல் இப்படித்தான் ஒலிக்கும்.'),
    'Telugu': ('te-IN', 'నమస్కారం! అనువాదంలో నా స్వరం ఇలా వినిపిస్తుంది.'),
    'Gujarati': ('gu-IN', 'નમસ્તે! અનુવાદમાં મારો અવાજ આવો સંભળાશે.'),
    'Kannada': ('kn-IN', 'ನಮಸ್ಕಾರ! ಅನುವಾದದಲ್ಲಿ ನನ್ನ ಧ್ವನಿ ಹೀಗೆ ಕೇಳಿಸುತ್ತದೆ.'),
    'Malayalam': ('ml-IN', 'നമസ്കാരം! വിവർത്തനത്തിൽ എന്റെ ശബ്ദം ഇങ്ങനെയായിരിക്കും.'),
    'Marathi': ('mr-IN', 'नमस्कार! भाषांतरात माझा आवाज असा ऐकू येईल.'),
    'Punjabi': ('pa-IN', 'ਸਤ ਸ੍ਰੀ ਅਕਾਲ! ਅਨੁਵਾਦ ਵਿੱਚ ਮੇਰੀ ਆਵਾਜ਼ ਇਸ ਤਰ੍ਹਾਂ ਸੁਣਾਈ ਦੇਵੇਗੀ।'),
}


def voice_or_default(voice: str | None, gender: str | None = None) -> str:
    return voice if voice in ALL_VOICES else DEFAULT_VOICES.get(gender or '', DEFAULT_VOICE)


def gemini_voice(gender: str | None) -> str:
    return GEMINI_VOICES.get(gender or '', GEMINI_VOICES['female'])


def sample_for(language: str) -> tuple[str, str]:
    return SAMPLES.get(language, SAMPLES['English'])


async def synthesize_preview(client: httpx.AsyncClient, api_key: str, voice: str, language: str) -> bytes:
    """MP3 audio of the preview sentence spoken by `voice`."""
    code, text = sample_for(language)
    response = await client.post('https://api.sarvam.ai/text-to-speech', headers={'api-subscription-key': api_key}, json={
        'text': text, 'target_language_code': code, 'speaker': voice, 'model': BULBUL_MODEL,
        'speech_sample_rate': 22050, 'output_audio_codec': 'mp3',
    })
    response.raise_for_status()
    audios = response.json().get('audios') or []
    if not audios:
        raise ValueError('Sarvam returned no audio')
    return base64.b64decode(audios[0])
