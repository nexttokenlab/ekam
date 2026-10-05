"""Sarvam text translation for Indian languages.

Mayura (colloquial, spoken style) handles English ↔ Indian-language pairs. Pairs of two
Indian languages use Sarvam-Translate, which answers in about half the time of Mayura or
the LLM for those pairs (formal register only).
"""
import asyncio
import httpx

CODES = {'English':'en-IN','Hindi':'hi-IN','Kannada':'kn-IN','Bengali':'bn-IN',
         'Tamil':'ta-IN','Telugu':'te-IN','Gujarati':'gu-IN','Malayalam':'ml-IN',
         'Marathi':'mr-IN','Punjabi':'pa-IN','Odia':'od-IN'}
MAYURA = 'mayura:v1'
SARVAM_TRANSLATE = 'sarvam-translate:v1'
MAX_INPUT = {MAYURA: 1000, SARVAM_TRANSLATE: 2000}
# Short names for logs and traces.
LABELS = {MAYURA: 'mayura', SARVAM_TRANSLATE: 'sarvam-translate'}

def model_for(source, target, text):
    """The Sarvam model for this pair, or None when the LLM should translate."""
    if source == target or source not in CODES or target not in CODES:
        return None
    model = MAYURA if 'English' in (source, target) else SARVAM_TRANSLATE
    return model if len(text) <= MAX_INPUT[model] else None

def supports(source, target, text):
    return model_for(source, target, text) is not None

GENDERS = {'male': 'Male', 'female': 'Female'}

async def translate(client, api_key, source, target, text, speaker_gender=None):
    model = model_for(source, target, text)
    if model is None:
        raise ValueError('Unsupported Sarvam translation input')
    if not api_key:
        raise ValueError('Missing Sarvam key')
    # A total deadline bounds connection, upload and response together.
    async with asyncio.timeout(5):
        body = {
            'input':text, 'source_language_code':CODES[source],
            'target_language_code':CODES[target], 'model':model,
        }
        if model == MAYURA:
            body.update(mode='modern-colloquial', output_script='spoken-form-in-native')
        else:
            body['mode'] = 'formal'  # The only mode Sarvam-Translate supports.
        if speaker_gender in GENDERS:
            # Gendered verb and adjective forms (e.g. Hindi "रहा/रही") follow the speaker.
            body['speaker_gender'] = GENDERS[speaker_gender]
        result = await client.post('https://api.sarvam.ai/translate',
            headers={'api-subscription-key':api_key}, json=body)
        result.raise_for_status()
        translated = result.json().get('translated_text')
        if not isinstance(translated,str) or not translated.strip():
            raise ValueError('Sarvam returned empty text')
        return translated.strip()
