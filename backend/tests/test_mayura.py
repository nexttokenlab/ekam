import asyncio
import json
import httpx
import pytest
from backend import mayura

@pytest.mark.parametrize('source,target,model', [
    ('English','Kannada','mayura:v1'), ('Hindi','English','mayura:v1'),
    ('Hindi','Kannada','sarvam-translate:v1'), ('Kannada','Tamil','sarvam-translate:v1'),
    ('French','English',None), ('English','English',None), ('Hindi','Hindi',None)])
def test_routing(source,target,model):
    assert mayura.model_for(source,target,'Hello') == model
    assert mayura.supports(source,target,'Hello') is (model is not None)

def test_input_length_limits_follow_the_model():
    assert mayura.model_for('English','Hindi','a'*1000) == 'mayura:v1'
    assert mayura.model_for('English','Hindi','a'*1001) is None
    assert mayura.model_for('Hindi','Kannada','a'*2000) == 'sarvam-translate:v1'
    assert mayura.model_for('Hindi','Kannada','a'*2001) is None

def test_indian_language_pairs_use_sarvam_translate_formal_mode():
    async def scenario():
        def handle(request):
            body=json.loads(request.content)
            assert body['model']=='sarvam-translate:v1' and body['mode']=='formal'
            assert 'output_script' not in body and body['speaker_gender']=='Female'
            assert body['source_language_code']=='hi-IN' and body['target_language_code']=='kn-IN'
            return httpx.Response(200,json={'translated_text':'ನಮಸ್ಕಾರ'})
        async with httpx.AsyncClient(transport=httpx.MockTransport(handle)) as client:
            assert await mayura.translate(client,'k','Hindi','Kannada','नमस्ते',speaker_gender='female')=='ನಮಸ್ಕಾರ'
    asyncio.run(scenario())

def test_payload_and_response():
    async def scenario():
        def handle(request):
            body=json.loads(request.content)
            assert body['model']=='mayura:v1'
            assert body['source_language_code']=='kn-IN'
            assert body['target_language_code']=='en-IN'
            assert request.headers['api-subscription-key']=='test'
            return httpx.Response(200,json={'translated_text':'How are you?'})
        async with httpx.AsyncClient(transport=httpx.MockTransport(handle)) as client:
            assert await mayura.translate(client,'test','Kannada','English','ನೀವು ಹೇಗಿದ್ದೀರಿ?')=='How are you?'
    asyncio.run(scenario())


def test_speaker_gender_is_sent_only_when_known():
    async def scenario():
        bodies = []
        def handle(request):
            bodies.append(json.loads(request.content))
            return httpx.Response(200, json={'translated_text': 'मैं आ रही हूँ'})
        async with httpx.AsyncClient(transport=httpx.MockTransport(handle)) as client:
            await mayura.translate(client, 'k', 'English', 'Hindi', 'I am coming', speaker_gender='female')
            await mayura.translate(client, 'k', 'English', 'Hindi', 'I am coming')
        assert bodies[0]['speaker_gender'] == 'Female' and 'speaker_gender' not in bodies[1]
    asyncio.run(scenario())
