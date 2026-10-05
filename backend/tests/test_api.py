import hashlib
import time

import pytest
from fastapi.testclient import TestClient
from backend.main import Settings, create_app

@pytest.fixture
def env(tmp_path):
    settings = Settings(database_path=str(tmp_path/'test.db'), worker_secret='test-worker',
                        livekit_url='', livekit_api_key='', livekit_api_secret='',
                        sarvam_api_key='', openai_api_key='', gemini_api_key='', fish_api_key='',
                        translation_provider='openai', _env_file=None)
    app = create_app(settings)
    with TestClient(app) as owner:
        clients = [owner, TestClient(app), TestClient(app)]
        people = []
        for i, client in enumerate(clients):
            phone = f'+91900000000{i}'
            r = client.post('/api/auth/otp', json={'phone': phone})
            assert r.status_code == 200
            code = r.json()['development_code']
            r = client.post('/api/auth/verify', json={'phone':phone,'code':code,'name':['Asha','Ravi','Mira'][i], 'language':['English','Hindi','Kannada'][i]})
            assert r.status_code == 200
            people.append(r.json())
        yield app, clients, people
        for c in clients[1:]:
            c.close()

def connect(clients):
    a,b,_=clients
    qr=b.post('/api/qr').json()
    r=a.post('/api/requests',json={'code':qr['code']})
    assert r.status_code==200
    rid=r.json()['id']
    assert a.post(f'/api/requests/{rid}/respond',json={'accept':True}).status_code==404
    assert b.post(f'/api/requests/{rid}/respond',json={'accept':True}).status_code==200
    return a.get('/api/state').json()['session']['id']

def test_consent_pause_resume_end_and_privacy(env):
    app, clients, people=env
    a,b,c=clients
    sid=connect(clients)
    assert 'phone' not in str(a.get('/api/state').json())
    assert c.post(f'/api/sessions/{sid}/pause').status_code==404
    assert c.post(f'/api/sessions/{sid}/token').status_code==404
    assert a.post(f'/api/sessions/{sid}/token').status_code==503
    assert a.post(f'/api/sessions/{sid}/pause').status_code==200
    assert b.get('/api/state').json()['session']['status']=='paused'
    assert a.post(f'/api/sessions/{sid}/resume').status_code==200
    assert a.post(f'/api/sessions/{sid}/resume/respond',json={'accept':True}).status_code==409
    assert b.post(f'/api/sessions/{sid}/resume/respond',json={'accept':False}).status_code==200
    assert a.get('/api/state').json()['session']['status']=='paused'
    a.post(f'/api/sessions/{sid}/resume')
    b.post(f'/api/sessions/{sid}/resume/respond',json={'accept':True})
    assert a.get('/api/state').json()['session']['status']=='listening'
    assert a.post(f'/api/sessions/{sid}/end').status_code==200
    assert b.get('/api/state').json()['session'] is None
    assert b.post(f'/api/sessions/{sid}/resume').status_code==409
    assert b.post(f'/api/sessions/{sid}/token').status_code==409
    assert len(a.get('/api/conversations').json())==1
    connect(clients)
    assert len(a.get('/api/conversations').json())==1
    assert len(a.get('/api/conversations').json()[0]['sessions'])==2

def test_worker_stale_audio_and_idempotence(env):
    app, clients, people=env
    a,b,c=clients
    sid=connect(clients)
    turn={'id':'t1','speaker_id':people[0]['id'],'source':'Hello','translation':'नमस्ते','source_language':'English','target_language':'Hindi','epoch':0}
    url=f'/api/internal/sessions/{sid}/turns'
    assert a.post(url,json=turn).status_code==401
    headers={'Authorization':'Bearer test-worker'}
    assert a.post(url,json=turn,headers=headers).status_code==200
    assert a.post(url,json={**turn,'interrupted':True},headers=headers).status_code==200
    turns=b.get('/api/state').json()['session']['turns']
    assert len(turns)==1 and turns[0]['interrupted']==1
    a.post(f'/api/sessions/{sid}/pause')
    assert a.post(url,json={**turn,'id':'t2'},headers=headers).status_code==409
    a.post(f'/api/sessions/{sid}/resume');b.post(f'/api/sessions/{sid}/resume/respond',json={'accept':True})
    assert a.post(url,json={**turn,'id':'t2'},headers=headers).status_code==409
    epoch=a.get('/api/state').json()['session']['epoch']
    assert a.post(url,json={**turn,'id':'t2','epoch':epoch},headers=headers).status_code==200
    assert a.post(url,json={**turn,'id':'t3','epoch':epoch,'speaker_id':people[2]['id']},headers=headers).status_code==403

def test_expiry_and_replay(env):
    app, clients, people=env
    a,b,c=clients
    q=b.post('/api/qr').json()
    app.state.db.execute('UPDATE qr SET expires=?',(time.time()-1,));app.state.db.commit()
    assert a.post('/api/requests',json={'code':q['code']}).status_code==404
    q=b.post('/api/qr').json()
    r=a.post('/api/requests',json={'code':q['code']}).json()
    assert c.post('/api/requests',json={'code':q['code']}).status_code==404
    app.state.db.execute('UPDATE requests SET expires=?',(time.time()-1,));app.state.db.commit()
    assert b.post(f'/api/requests/{r["id"]}/respond',json={'accept':True}).status_code==409

def test_csrf_and_auth(env):
    app, clients, people=env
    a,b,c=clients
    assert a.post('/api/qr',headers={'Origin':'https://evil.invalid'}).status_code==403
    assert TestClient(app).get('/api/conversations').status_code==401
    assert a.get('/api/internal/sessions/no').status_code==401
    assert a.post('/api/auth/logout').status_code==200
    assert a.get('/api/me').status_code==401

def test_fixed_test_pin_allows_retries_but_not_replay(env):
    app, clients, people = env
    c = TestClient(app)
    phone = '+919888888888'
    for _ in range(25):
        response = c.post('/api/auth/otp', json={'phone': phone})
        assert response.status_code == 200
        assert response.json()['development_code'] == '0000'
    for _ in range(8):
        assert c.post('/api/auth/verify', json={'phone': phone, 'code': '1111'}).status_code == 400
    assert c.post('/api/auth/verify', json={'phone': phone, 'code': '0000', 'name': 'Test'}).status_code == 200
    assert c.post('/api/auth/verify', json={'phone': phone, 'code': '0000'}).status_code == 400


def test_sms_verification_keeps_attempt_limit(env):
    app, clients, people = env
    c = TestClient(app)
    phone = '+919888888887'
    c.post('/api/auth/otp', json={'phone': phone})
    app.state.db.execute('UPDATE otps SET attempts=5 WHERE phone=?', (phone,))
    app.state.db.commit()
    app.state.settings.twilio_verify_service_sid = 'test-service'
    assert c.post('/api/auth/otp', json={'phone': phone}).status_code == 429
    response = c.post('/api/auth/verify', json={'phone': phone, 'code': '123456'})
    assert response.status_code == 400
    assert 'Too many attempts' in response.json()['detail']


def test_retention_and_resume_timeout(env):
    app,clients,people=env;a,b,c=clients;sid=connect(clients)
    a.post(f'/api/sessions/{sid}/pause');a.post(f'/api/sessions/{sid}/resume')
    app.state.db.execute('UPDATE sessions SET resume_expires=? WHERE id=?',(time.time()-1,sid));app.state.db.commit()
    assert b.get('/api/state').json()['session']['status']=='paused'
    assert b.post(f'/api/sessions/{sid}/resume/respond',json={'accept':True}).status_code==409

@pytest.mark.parametrize('agent_name', ['talkeasy-translator', 'talkeasy-railway-translator'])
def test_room_token_scope_and_dispatch(env, monkeypatch, agent_name):
    import jwt
    from types import SimpleNamespace
    from backend import main
    app, clients, people = env
    sid = connect(clients)
    cfg = app.state.settings
    cfg.livekit_agent_name = agent_name
    for field, value in {'livekit_url':'wss://test.invalid','livekit_api_key':'test-key','livekit_api_secret':'x'*40,'sarvam_api_key':'test','openai_api_key':'test'}.items():
        setattr(cfg,field,value)
    # LiveKit may automatically create an unnamed dispatch before our named one.
    dispatched=[SimpleNamespace(agent_name='')]
    class Service:
        async def create_room(self, request):
            assert request.name == sid and request.max_participants == 3
        async def list_dispatch(self, room_name): return dispatched
        async def create_dispatch(self, request):
            assert request.agent_name == agent_name
            dispatched.append(request)
    class Client:
        def __init__(self,*args): self.room=self.agent_dispatch=Service()
        async def __aenter__(self): return self
        async def __aexit__(self,*args): pass
    monkeypatch.setattr(main.api,'LiveKitAPI',Client)
    for client,person in zip(clients[:2],people[:2]):
        response=client.post(f'/api/sessions/{sid}/token')
        assert response.status_code==200
        claims=jwt.decode(response.json()['token'], 'x'*40, algorithms=['HS256'],options={'verify_aud':False})
        assert claims['sub']==person['id']
        assert claims['video']['room']==sid
        assert claims['video']['canPublishData'] is False
        assert claims['video']['canPublishSources']==['microphone']
    assert len(dispatched)==2
    assert sum(d.agent_name == agent_name for d in dispatched)==1

def test_onboarding_languages_persist_and_validate(tmp_path):
    settings = Settings(database_path=str(tmp_path/'languages.db'), _env_file=None)
    phone = '+12025550198'
    payload = {'phone': phone, 'name': 'Language test', 'language': 'Hindi', 'languages': ['Hindi']}
    with TestClient(create_app(settings)) as client:
        code = client.post('/api/auth/otp', json={'phone': phone}).json()['development_code']
        assert client.post('/api/auth/verify', json={**payload, 'code': code, 'languages': ['English', 'Hindi']}).status_code == 422
        invalid = {**payload, 'code': code, 'languages': ['English']}
        assert client.post('/api/auth/verify', json=invalid).status_code == 422
        assert client.post('/api/auth/verify', json={**payload, 'code': code, 'languages': []}).status_code == 422
        response = client.post('/api/auth/verify', json={**payload, 'code': code})
        assert response.status_code == 200
        assert response.json()['languages'] == ['Hindi']
        cookies = dict(client.cookies)
    with TestClient(create_app(settings)) as client:
        client.cookies.update(cookies)
        profile = client.get('/api/me').json()
        assert profile['language'] == 'Hindi'
        assert profile['languages'] == ['Hindi']
        client.patch('/api/profile', json={'name': 'Language test', 'language': 'Kannada'})
        assert client.get('/api/me').json()['languages'] == ['Kannada']

def test_phone_first_login_requires_profile_only_for_new_users(tmp_path):
    cfg = Settings(database_path=str(tmp_path/'phone-first.db'), _env_file=None)
    with TestClient(create_app(cfg)) as c:
        phone = '+919876543210'
        code = c.post('/api/auth/otp', json={'phone': phone}).json()['development_code']
        assert code == '0000'
        assert c.post('/api/auth/verify', json={'phone': phone, 'code': '000000'}).status_code == 422
        result = c.post('/api/auth/verify', json={'phone': phone, 'code': code})
        assert result.status_code == 200
        assert result.json()['name'] == ''
        assert c.post('/api/qr').status_code == 403
        assert c.get('/api/me').json()['name'] == ''
        result = c.patch('/api/profile', json={'name': 'New user', 'language': 'Hindi', 'languages': ['English', 'Hindi']})
        assert result.status_code == 422
        result = c.patch('/api/profile', json={'name': 'New user', 'language': 'Hindi', 'languages': ['Hindi']})
        assert result.status_code == 200
        assert c.post('/api/qr').status_code == 200
        c.post('/api/auth/logout')
        code = c.post('/api/auth/otp', json={'phone': phone}).json()['development_code']
        assert code == '0000'
        assert c.post('/api/auth/verify', json={'phone': phone, 'code': '000000'}).status_code == 422
        result = c.post('/api/auth/verify', json={'phone': phone, 'code': code}).json()
        assert result['name'] == 'New user'
        assert result['language'] == 'Hindi'
        assert result['languages'] == ['Hindi']

@pytest.mark.parametrize('locale', ['en','hi','bn','ta','te','gu','kn','ml','mr','pa','fr','ar','it','ko','ja'])
def test_qr_locale_and_rotation(env, locale):
    app, clients, people = env
    a, b, _ = clients
    old = a.post('/api/qr').json()
    q = a.post('/api/qr', json={'locale': locale}).json()
    assert q['locale'] == locale
    assert '&lang=' + locale in q['url']
    assert b.get('/api/qr/' + q['code']).json()['locale'] == locale
    assert b.get('/api/qr/' + old['code']).status_code == 200
    assert a.get('/api/me').json()['language'] == 'English'
    assert a.post('/api/qr', json={'locale': 'xx'}).status_code == 422
    app.state.db.execute('UPDATE qr SET expires=0'); app.state.db.commit()
    assert b.get('/api/qr/' + q['code']).status_code == 404

@pytest.mark.parametrize('language', ['English','Hindi','Bengali','Tamil','Telugu','Gujarati','Kannada','Malayalam','Marathi','Punjabi','French','Arabic','Italian','Korean','Japanese'])
def test_new_languages_profile(env, language):
    _, clients, _ = env
    a = clients[0]
    result = a.patch('/api/profile', json={'name': 'Asha', 'language': language, 'languages': [language]})
    assert result.status_code == 200
    assert result.json()['language'] == language

def test_retired_odia_is_not_available_for_new_profiles_or_qrs(env):
    _, clients, _ = env
    assert clients[0].patch('/api/profile', json={'name': 'Asha', 'language': 'Odia'}).status_code == 422
    assert clients[0].post('/api/qr', json={'locale': 'od'}).status_code == 422


def test_retired_profile_language_migrates_without_losing_account(tmp_path):
    import sqlite3
    from backend.main import SCHEMA
    path = str(tmp_path / 'legacy.db')
    with sqlite3.connect(path) as db:
        db.executescript(SCHEMA)
        db.execute('INSERT INTO users VALUES(?,?,?,?)', ('legacy', '+919000000009', 'Legacy user', 'Odia'))
    create_app(Settings(database_path=path, app_env='development', _env_file=None))
    with sqlite3.connect(path) as db:
        assert db.execute('SELECT id,name,language FROM users').fetchone() == ('legacy', 'Legacy user', 'English')


def test_live_language_change_keeps_session_and_invalidates_old_turns(env):
    _, clients, people = env
    sid = connect(clients)
    before = clients[0].get('/api/state').json()['session']
    r = clients[0].patch(f'/api/sessions/{sid}/language', json={'language':'Kannada'})
    assert r.status_code == 200 and r.json()['language'] == 'Kannada'
    current = clients[0].get('/api/state').json()['session']
    assert current['id'] == sid and current['status'] == 'listening'
    assert current['epoch'] == before['epoch'] + 1
    assert current['language_a' if current['a'] == people[0]['id'] else 'language_b'] == 'Kannada'
    assert clients[1].get('/api/me').json()['language'] == people[1]['language']
    assert clients[2].patch(f'/api/sessions/{sid}/language',json={'language':'French'}).status_code == 404
    assert clients[0].patch(f'/api/sessions/{sid}/language',json={'language':'Odia'}).status_code == 422
    clients[0].post(f'/api/sessions/{sid}/pause')
    clients[0].patch(f'/api/sessions/{sid}/language',json={'language':'Hindi'})
    assert clients[0].get('/api/state').json()['session']['status'] == 'paused'
    clients[0].post(f'/api/sessions/{sid}/end')
    assert clients[0].patch(f'/api/sessions/{sid}/language',json={'language':'English'}).status_code == 409


def test_refresh_preserves_scanned_code_until_expiry_but_consumes_all_on_request(env):
    _, clients, _ = env
    scanner, owner, third = clients
    old = owner.post('/api/qr').json()
    fresh = owner.post('/api/qr').json()
    assert scanner.post('/api/requests',json={'code':old['code']}).status_code == 200
    assert third.post('/api/requests',json={'code':fresh['code']}).status_code == 404
    assert third.post('/api/requests',json={'code':old['code']}).status_code == 404

def test_cookie_isolation_migration_revokes_sessions_only_once(env):
    app, clients, people = env
    sid = connect(clients)
    db = app.state.db
    db.execute("DELETE FROM security_migrations WHERE name='isolated-proxy-cookies-v1'")
    db.commit()
    replacement = create_app(app.state.settings)
    with TestClient(replacement) as client:
        assert replacement.state.db.execute('SELECT COUNT(*) FROM auth').fetchone()[0] == 0
        assert replacement.state.db.execute('SELECT COUNT(*) FROM users').fetchone()[0] == 3
        assert replacement.state.db.execute('SELECT status FROM sessions WHERE id=?',(sid,)).fetchone()[0] == 'ended'
        phone='+919000000000'
        client.post('/api/auth/otp',json={'phone':phone})
        assert client.post('/api/auth/verify',json={'phone':phone,'code':'0000'}).status_code == 200
    again=create_app(app.state.settings)
    with TestClient(again):
        assert again.state.db.execute('SELECT COUNT(*) FROM auth').fetchone()[0] == 1


def test_voice_persona_is_listed_saved_and_given_to_the_worker(env):
    app, clients, people = env
    a, b, _ = clients
    listed = a.get('/api/voices').json()
    assert listed['default'] == 'shubh' and 'ritu' in listed['female'] and 'shubh' in listed['male']
    assert a.get('/api/me').json()['voice'] is None
    profile = {'name': 'Asha', 'language': 'English', 'languages': ['English']}
    assert a.patch('/api/profile', json={**profile, 'voice': 'not-a-voice'}).status_code == 422
    assert a.patch('/api/profile', json={**profile, 'voice': 'ritu'}).json()['voice'] == 'ritu'
    # Saving other profile fields keeps the chosen voice.
    assert a.patch('/api/profile', json=profile).json()['voice'] == 'ritu'
    sid = connect(clients)
    worker = a.get(f'/api/internal/sessions/{sid}', headers={'Authorization': 'Bearer test-worker'}).json()
    voices_by_id = {p['id']: p['voice'] for p in worker['participants']}
    assert voices_by_id[people[0]['id']] == 'ritu' and voices_by_id[people[1]['id']] is None


def test_voice_preview_is_synthesized_once_and_cached(env, monkeypatch):
    app, clients, people = env
    a, _, _ = clients
    app.state.settings.sarvam_api_key = 'test-key'
    calls = []
    async def fake(client, api_key, voice, language):
        calls.append((api_key, voice, language))
        return b'ID3-fake-mp3'
    monkeypatch.setattr('backend.main.voices.synthesize_preview', fake)
    assert a.post('/api/voices/unknown/preview').status_code == 404
    first = a.post('/api/voices/kavya/preview')
    assert first.status_code == 200 and first.content == b'ID3-fake-mp3'
    assert first.headers['content-type'] == 'audio/mpeg'
    assert a.post('/api/voices/kavya/preview').content == b'ID3-fake-mp3'
    assert calls == [('test-key', 'kavya', 'English')]


def test_gender_is_saved_and_keeps_voice_consistent(env):
    app, clients, people = env
    a, b, _ = clients
    profile = {'name': 'Asha', 'language': 'English', 'languages': ['English']}
    assert a.patch('/api/profile', json={**profile, 'gender': 'other'}).status_code == 422
    me = a.patch('/api/profile', json={**profile, 'gender': 'female', 'voice': 'ritu'}).json()
    assert me['gender'] == 'female' and me['voice'] == 'ritu'
    # A voice of the other gender is rejected; changing gender resets to that gender's default.
    assert a.patch('/api/profile', json={**profile, 'voice': 'shubh'}).status_code == 422
    me = a.patch('/api/profile', json={**profile, 'gender': 'male'}).json()
    assert me['gender'] == 'male' and me['voice'] is None
    assert a.get('/api/voices').json()['defaults'] == {'male': 'shubh', 'female': 'ritu'}
    sid = connect(clients)
    worker = a.get(f'/api/internal/sessions/{sid}', headers={'Authorization': 'Bearer test-worker'}).json()
    assert {p['id']: p['gender'] for p in worker['participants']}[people[0]['id']] == 'male'
    # The peer's gender is available for gendered interface text.
    assert b.get('/api/state').json()['session']['peer']['gender'] == 'male'


def test_profile_can_be_saved_during_a_conversation_except_its_language(env):
    app, clients, people = env
    a, b, _ = clients
    connect(clients)
    profile = {'name': 'Asha R', 'language': 'English', 'languages': ['English']}
    saved = a.patch('/api/profile', json={**profile, 'gender': 'female', 'voice': 'kavya'})
    assert saved.status_code == 200 and saved.json()['voice'] == 'kavya' and saved.json()['name'] == 'Asha R'
    assert a.patch('/api/profile', json={**profile, 'language': 'Hindi', 'languages': ['Hindi']}).status_code == 409


def test_a_voice_no_longer_offered_reads_as_default_and_does_not_block_saving(env):
    app, clients, people = env
    a, _, _ = clients
    app.state.db.execute("UPDATE users SET voice='sophia', gender='female' WHERE id=?", (people[0]['id'],))
    app.state.db.commit()
    assert a.get('/api/me').json()['voice'] is None
    profile = {'name': 'Asha', 'language': 'English', 'languages': ['English'], 'gender': 'female'}
    assert a.patch('/api/profile', json=profile).status_code == 200


def test_voice_learning_is_opt_in_and_a_learned_voice_becomes_self(env, monkeypatch):
    app, clients, people = env
    a, b, _ = clients
    uid = people[0]['id']
    worker = {'Authorization': 'Bearer test-worker'}
    assert a.get('/api/config').json()['voice_cloning'] is False
    assert a.post('/api/voice-learning', json={'enabled': True}).status_code == 503
    app.state.settings.fish_api_key = 'fish-key'
    assert a.get('/api/config').json()['voice_cloning'] is True
    # The worker cannot attach a voice to someone who has not opted in.
    assert a.post(f'/api/internal/users/{uid}/voice-clone', headers=worker, json={'voice_id': 'v1'}).status_code == 409
    assert a.post('/api/voice-learning', json={'enabled': True}).json()['voice_learning'] is True
    sid = connect(clients)
    participants = a.get(f'/api/internal/sessions/{sid}', headers=worker).json()['participants']
    assert participants[0]['voice_learning'] is True and participants[0]['voice_clone'] is None
    assert b.post(f'/api/internal/users/{uid}/voice-clone', json={'voice_id': 'v1'}).status_code == 401
    assert a.post(f'/api/internal/users/{uid}/voice-clone', headers=worker, json={'voice_id': 'fish-voice-1'}).status_code == 200
    me = a.get('/api/me').json()
    assert me['own_voice'] is True and me['voice_learning'] is False and 'voice_clone' not in me
    assert 'fish-voice-1' not in str(b.get('/api/state').json())  # The id never reaches browsers.
    assert a.post('/api/voice-learning', json={'enabled': True}).status_code == 409
    profile = {'name': 'Asha', 'language': 'English', 'languages': ['English'], 'gender': 'female'}
    assert a.patch('/api/profile', json={**profile, 'voice': 'self'}).json()['voice'] == 'self'
    assert b.patch('/api/profile', json={'name': 'Ravi', 'language': 'Hindi', 'languages': ['Hindi'], 'voice': 'self'}).status_code == 422
    participants = a.get(f'/api/internal/sessions/{sid}', headers=worker).json()['participants']
    assert participants[0]['voice'] == 'self' and participants[0]['voice_clone'] == 'fish-voice-1'


def test_removing_your_voice_deletes_it_at_fish_audio(env, monkeypatch):
    app, clients, people = env
    a, _, _ = clients
    uid = people[0]['id']
    app.state.settings.fish_api_key = 'fish-key'
    app.state.db.execute("UPDATE users SET voice_clone='fish-voice-1', voice='self' WHERE id=?", (uid,))
    app.state.db.commit()
    deleted, spoken = [], []
    async def delete(client, key, voice_id): deleted.append((key, voice_id))
    async def synthesize(client, key, voice_id, text): spoken.append(voice_id); return b'ID3-mp3'
    monkeypatch.setattr('backend.main.voice_clone.delete_voice', delete)
    monkeypatch.setattr('backend.main.voice_clone.synthesize', synthesize)
    assert a.post('/api/voices/self/preview').content == b'ID3-mp3'
    assert a.post('/api/voices/self/preview').content == b'ID3-mp3'
    assert spoken == ['fish-voice-1']  # Cached after the first request.
    me = a.post('/api/voice-clone/remove').json()
    assert deleted == [('fish-key', 'fish-voice-1')]
    assert me['own_voice'] is False and me['voice'] is None
    assert a.post('/api/voices/self/preview').status_code == 404
