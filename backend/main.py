from __future__ import annotations

import asyncio
import hashlib
import hmac
import json
import secrets
import sqlite3
import time
from contextlib import asynccontextmanager
from datetime import timedelta
from pathlib import Path
from typing import Literal

import httpx
from fastapi import Depends, FastAPI, HTTPException, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
from pydantic_settings import BaseSettings, SettingsConfigDict
from livekit import api
from backend import voice_clone, voices

Language = Literal['English', 'Hindi', 'Bengali', 'Tamil', 'Telugu', 'Gujarati', 'Kannada', 'Malayalam', 'Marathi', 'Punjabi', 'French', 'Arabic', 'Italian', 'Korean', 'Japanese']

class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=('.env', '.env.local'), extra='ignore')
    app_env: str = 'development'
    database_path: str = 'backend/data/talkeasy.sqlite3'
    frontend_url: str = 'http://localhost:5173'
    livekit_url: str = ''
    livekit_api_key: str = ''
    livekit_api_secret: str = ''
    worker_secret: str = ''
    livekit_agent_name: str = 'talkeasy-translator'
    sarvam_api_key: str = ''
    # Fish Audio: the opt-in "Self" voice (learning, previews and removal).
    fish_api_key: str = ''
    openai_api_key: str = ''
    gemini_api_key: str = ''
    translation_provider: Literal['openai', 'gemini'] = 'openai'
    twilio_account_sid: str = ''
    twilio_auth_token: str = ''
    twilio_verify_service_sid: str = ''
    retention_days: int = 30

    @property
    def voice_ready(self):
        translation_key = self.gemini_api_key if self.translation_provider == 'gemini' else self.openai_api_key
        return all((self.livekit_url, self.livekit_api_key, self.livekit_api_secret, self.worker_secret, self.sarvam_api_key, translation_key))

class OtpStart(BaseModel):
    phone: str = Field(pattern=r'^\+[1-9]\d{7,14}$')

class OtpVerify(OtpStart):
    code: str = Field(pattern=r'^(?:\d{4}|\d{6})$')
    name: str = Field(default='', max_length=60)
    language: Language = 'English'
    languages: list[Language] | None = Field(default=None, min_length=1, max_length=1)

class Profile(BaseModel):
    name: str = Field(min_length=1, max_length=60)
    language: Language
    languages: list[Language] | None = Field(default=None, min_length=1, max_length=1)
    voice: str | None = Field(default=None, max_length=32)
    gender: Literal['male', 'female'] | None = None

class VoiceLearning(BaseModel):
    enabled: bool

class LearnedVoice(BaseModel):
    voice_id: str = Field(min_length=1, max_length=128)

class SessionLanguage(BaseModel):
    language: Language

class QrOptions(BaseModel):
    locale: Literal['en', 'hi', 'bn', 'ta', 'te', 'gu', 'kn', 'ml', 'mr', 'pa', 'fr', 'ar', 'it', 'ko', 'ja'] = 'en'

class ConnectRequest(BaseModel):
    code: str = Field(min_length=10, max_length=256)

class Decision(BaseModel):
    accept: bool

class Turn(BaseModel):
    id: str = Field(max_length=100)
    speaker_id: str
    source: str = Field(max_length=12000)
    translation: str = Field(max_length=12000)
    source_language: Language | Literal['Odia']
    target_language: Language | Literal['Odia']
    interrupted: bool = False
    epoch: int

SCHEMA = '''
PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY, phone TEXT UNIQUE NOT NULL, name TEXT NOT NULL, language TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS user_languages(user_id TEXT PRIMARY KEY REFERENCES users(id), languages TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS auth(token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), expires REAL NOT NULL);
CREATE TABLE IF NOT EXISTS otps(phone TEXT PRIMARY KEY, digest TEXT NOT NULL, salt TEXT NOT NULL, expires REAL NOT NULL, sent REAL NOT NULL, attempts INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS qr(code TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), expires REAL NOT NULL);
CREATE TABLE IF NOT EXISTS qr_locales(code TEXT PRIMARY KEY REFERENCES qr(code) ON DELETE CASCADE, locale TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS requests(id TEXT PRIMARY KEY, sender TEXT NOT NULL REFERENCES users(id), receiver TEXT NOT NULL REFERENCES users(id), status TEXT NOT NULL, expires REAL NOT NULL);
CREATE TABLE IF NOT EXISTS sessions(id TEXT PRIMARY KEY, a TEXT NOT NULL REFERENCES users(id), b TEXT NOT NULL REFERENCES users(id), language_a TEXT NOT NULL, language_b TEXT NOT NULL, status TEXT NOT NULL, resume_by TEXT, resume_expires REAL, started REAL NOT NULL, ended REAL, epoch INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS turns(id TEXT PRIMARY KEY, session_id TEXT NOT NULL REFERENCES sessions(id), speaker_id TEXT NOT NULL, source TEXT NOT NULL, translation TEXT NOT NULL, source_language TEXT NOT NULL, target_language TEXT NOT NULL, interrupted INTEGER NOT NULL, created REAL NOT NULL);
CREATE INDEX IF NOT EXISTS idx_sessions_people ON sessions(a,b);
CREATE INDEX IF NOT EXISTS idx_turns_session ON turns(session_id,created);
CREATE INDEX IF NOT EXISTS idx_turns_created ON turns(created);
CREATE TABLE IF NOT EXISTS limits(key TEXT PRIMARY KEY, count INTEGER NOT NULL, expires REAL NOT NULL);
'''

def create_app(config: Settings | None = None):
    cfg = config or Settings()
    if cfg.app_env == 'production' and (not all((cfg.twilio_verify_service_sid,cfg.twilio_account_sid,cfg.twilio_auth_token)) or not cfg.worker_secret or cfg.frontend_url.startswith('http:')):
        raise RuntimeError('Production requires HTTPS FRONTEND_URL, WORKER_SECRET, and Twilio Verify configuration.')
    Path(cfg.database_path).parent.mkdir(parents=True, exist_ok=True)
    db = sqlite3.connect(cfg.database_path, check_same_thread=False)
    db.row_factory = sqlite3.Row
    db.executescript(SCHEMA)
    db.execute('CREATE TABLE IF NOT EXISTS security_migrations (name TEXT PRIMARY KEY)')
    if not db.execute("SELECT 1 FROM security_migrations WHERE name='isolated-proxy-cookies-v1'").fetchone():
        # Revoke pre-fix sessions once; retain accounts and conversation history.
        db.execute('DELETE FROM auth')
        db.execute('DELETE FROM qr')
        db.execute("UPDATE requests SET status='expired' WHERE status='pending'")
        db.execute("UPDATE sessions SET status='ended',ended=?,epoch=epoch+1 WHERE status!='ended'", (time.time(),))
        db.execute("INSERT INTO security_migrations VALUES('isolated-proxy-cookies-v1')")
        db.commit()
    user_columns = {column[1] for column in db.execute('PRAGMA table_info(users)')}
    if 'voice' not in user_columns:
        # Chosen Sarvam Bulbul voice for this person's translated speech (NULL = default).
        db.execute('ALTER TABLE users ADD COLUMN voice TEXT')
    if 'gender' not in user_columns:
        # 'male' / 'female': default voice and gendered grammar in translations (NULL = unknown).
        db.execute('ALTER TABLE users ADD COLUMN gender TEXT')
    if 'voice_clone' not in user_columns:
        # Opt-in "Self" voice: Fish Audio voice id once learned, and whether learning is on.
        db.execute('ALTER TABLE users ADD COLUMN voice_clone TEXT')
        db.execute('ALTER TABLE users ADD COLUMN voice_learning INTEGER NOT NULL DEFAULT 0')
    db.execute('PRAGMA journal_mode=WAL')
    # WAL + NORMAL stays consistent after crashes and avoids an fsync on every commit.
    db.execute('PRAGMA synchronous=NORMAL')
    # Retired profile language: retain account/history and use English until reselected.
    db.execute("UPDATE users SET language='English' WHERE language='Odia'")
    db.commit()
    mutation_lock = asyncio.Lock()
    # A few seconds of audio per voice and language; at most 30 voices x 10 languages.
    preview_cache: dict[tuple[str, str], bytes] = {}
    # Per-conversation: one room's LiveKit setup must not delay other conversations.
    dispatch_locks: dict[str, asyncio.Lock] = {}

    def one(sql, args=()):
        row = db.execute(sql, args).fetchone()
        return dict(row) if row else None

    def rows(sql, args=()):
        return [dict(r) for r in db.execute(sql, args).fetchall()]

    def execute(sql, args=()):
        db.execute(sql, args)
        db.commit()

    def prune():
        # Runs on polled endpoints: one transaction/commit instead of one per statement.
        now = time.time()
        db.execute("UPDATE requests SET status='expired' WHERE status='pending' AND expires < ?", (now,))
        db.execute("UPDATE sessions SET status='paused',resume_by=NULL,resume_expires=NULL WHERE status='resume-request' AND resume_expires < ?", (now,))
        db.execute('DELETE FROM turns WHERE created < ?', (now - cfg.retention_days * 86400,))
        for table in ('auth', 'otps', 'qr', 'limits'):
            db.execute(f'DELETE FROM {table} WHERE expires < ?', (now,))
        db.commit()

    def limit(key, maximum, window):
        now = time.time()
        entry = one('SELECT * FROM limits WHERE key=?', (key,))
        if entry and entry['expires'] > now and entry['count'] >= maximum:
            raise HTTPException(429, 'Too many attempts. Please try again later.')
        if not entry or entry['expires'] <= now:
            execute('INSERT OR REPLACE INTO limits VALUES(?,?,?)', (key, 1, now + window))
        else:
            execute('UPDATE limits SET count=count+1 WHERE key=?', (key,))

    def person(uid):
        result = one('SELECT id,name,language,voice,gender,voice_clone,voice_learning FROM users WHERE id=?', (uid,))
        if not result:
            return result
        # The Fish Audio voice id stays server-side; clients only learn whether it exists.
        clone = result.pop('voice_clone')
        result['own_voice'] = bool(clone)
        result['voice_learning'] = bool(result['voice_learning']) and not clone
        if result['voice'] not in voices.ALL_VOICES and not (result['voice'] == 'self' and clone):
            result['voice'] = None  # A voice no longer offered falls back to the default.
        result['languages'] = [result['language']]
        return result

    def worker_person(uid, language):
        """A participant as the worker needs it, including the private voice id."""
        clone = one('SELECT voice_clone FROM users WHERE id=?', (uid,))
        return {**person(uid), 'language': language, 'voice_clone': clone['voice_clone'] if clone else None}

    async def user(request: Request):
        token = request.cookies.get('talkeasy_session', '')
        digest = hashlib.sha256(token.encode()).hexdigest()
        auth = one('SELECT user_id FROM auth WHERE token_hash=? AND expires>?', (digest, time.time()))
        if not auth:
            raise HTTPException(401, 'Please sign in to continue.')
        if request.url.path not in ('/api/me', '/api/profile', '/api/auth/logout') and not person(auth['user_id'])['name']:
            raise HTTPException(403, 'Complete your profile before connecting.')
        return auth['user_id']

    def member(sid, uid):
        prune()
        s = one('SELECT * FROM sessions WHERE id=?', (sid,))
        if not s or uid not in (s['a'], s['b']):
            raise HTTPException(404, 'Conversation not found.')
        return s

    def active(uid):
        return one("SELECT * FROM sessions WHERE (a=? OR b=?) AND status!='ended' ORDER BY started DESC LIMIT 1", (uid, uid))

    def session_view(s, uid):
        if not s:
            return None
        result = dict(s)
        result['peer'] = person(s['b'] if s['a'] == uid else s['a'])
        result['turns'] = rows('SELECT * FROM turns WHERE session_id=? ORDER BY created', (s['id'],))
        return result

    def lk():
        return api.LiveKitAPI(cfg.livekit_url, cfg.livekit_api_key, cfg.livekit_api_secret)

    async def sync_room(s, *, delete=False):
        if not cfg.voice_ready:
            return
        try:
            async with lk() as client:
                if delete:
                    await client.room.delete_room(api.DeleteRoomRequest(room=s['id']))
                else:
                    await client.room.update_room_metadata(api.UpdateRoomMetadataRequest(room=s['id'], metadata=json.dumps({'status': s['status'], 'epoch': s['epoch']})))
        except Exception:
            # Durable DB state is authoritative. Worker polls and fails closed if API is unavailable.
            pass

    async def lifecycle_cleanup():
        while True:
            await asyncio.sleep(30)
            prune()

    @asynccontextmanager
    async def lifespan(app):
        task = asyncio.create_task(lifecycle_cleanup())
        yield
        task.cancel()
        await asyncio.gather(task, return_exceptions=True)
        db.close()

    app = FastAPI(title='Ekam API', version='0.1.0', lifespan=lifespan)

    @app.get('/api/health')
    async def health():
        db.execute('SELECT 1').fetchone()
        return {'status': 'ok'}
    app.state.db = db
    app.state.settings = cfg
    origins = [cfg.frontend_url]
    if cfg.app_env != 'production':
        origins += ['http://localhost:5173', 'http://127.0.0.1:5173']
    app.add_middleware(CORSMiddleware, allow_origins=origins, allow_credentials=True, allow_methods=['GET','POST','PATCH'], allow_headers=['Content-Type'])

    @app.middleware('http')
    async def protect_browser_writes(request: Request, call_next):
        if request.method in ('POST','PATCH','DELETE') and not request.url.path.startswith('/api/internal/'):
            origin = request.headers.get('origin')
            if origin and origin not in origins:
                return Response('Untrusted origin', 403)
        response = await call_next(request)
        response.headers['Cache-Control'] = 'no-store'
        response.headers['X-Content-Type-Options'] = 'nosniff'
        return response

    @app.get('/api/config')
    async def configuration():
        return {'voice_ready': cfg.voice_ready, 'development': cfg.app_env != 'production', 'retention_days': cfg.retention_days,
                'voice_cloning': bool(cfg.fish_api_key)}

    async def twilio(path, data):
        if not all((cfg.twilio_account_sid, cfg.twilio_auth_token, cfg.twilio_verify_service_sid)):
            raise HTTPException(503, 'Phone verification is not configured.')
        async with httpx.AsyncClient(timeout=15) as client:
            result = await client.post(f'https://verify.twilio.com/v2/Services/{cfg.twilio_verify_service_sid}/{path}', data=data, auth=(cfg.twilio_account_sid, cfg.twilio_auth_token))
        if result.status_code >= 400:
            raise HTTPException(400, 'Phone verification failed. Check the number or request another code.')
        return result.json()

    @app.post('/api/auth/otp')
    async def start_otp(body: OtpStart, request: Request):
        prune()
        test_pin = cfg.app_env != 'production' and not cfg.twilio_verify_service_sid
        if not test_pin:
            limit('otp-ip:' + (request.client.host if request.client else 'unknown'), 20, 3600)
            limit('otp-phone:' + body.phone, 5, 3600)
            previous = one('SELECT sent FROM otps WHERE phone=?', (body.phone,))
            if previous and time.time() - previous['sent'] < 45:
                raise HTTPException(429, 'Please wait 45 seconds before requesting another code.')
        code = '0000' if test_pin else f'{secrets.randbelow(1000000):06d}'
        salt = secrets.token_hex(16)
        if cfg.twilio_verify_service_sid:
            await twilio('Verifications', {'To': body.phone, 'Channel': 'sms'})
        elif cfg.app_env == 'production':
            raise HTTPException(503, 'SMS service is unavailable.')
        execute('INSERT OR REPLACE INTO otps VALUES(?,?,?,?,?,0)', (body.phone, hashlib.sha256((salt+code).encode()).hexdigest(), salt, time.time()+300, time.time()))
        return {'sent': True, 'development_code': code if cfg.app_env != 'production' and not cfg.twilio_verify_service_sid else None}

    @app.post('/api/auth/verify')
    async def verify(body: OtpVerify, response: Response):
        test_pin = cfg.app_env != 'production' and not cfg.twilio_verify_service_sid
        code_length = 4 if test_pin else 6
        if len(body.code) != code_length:
            raise HTTPException(422, f'Enter the {code_length}-digit verification code.')
        if body.languages is not None and body.language not in body.languages:
            raise HTTPException(422, 'Choose a conversation language from your selected languages.')
        async with mutation_lock:
            record = one('SELECT * FROM otps WHERE phone=?', (body.phone,))
            if not record or record['expires'] < time.time():
                raise HTTPException(400, 'Code expired. Request a new code.')
            if not test_pin and record['attempts'] >= 5:
                raise HTTPException(400, 'Too many attempts. Request a new code.')
            execute('UPDATE otps SET attempts=attempts+1 WHERE phone=?', (body.phone,))
            if cfg.twilio_verify_service_sid:
                valid = (await twilio('VerificationCheck', {'To': body.phone, 'Code': body.code})).get('status') == 'approved'
            else:
                valid = hmac.compare_digest(record['digest'], hashlib.sha256((record['salt']+body.code).encode()).hexdigest())
            if not valid:
                raise HTTPException(400, 'That code is not correct. Please try again.')
            existing = one('SELECT id FROM users WHERE phone=?', (body.phone,))
            uid = existing['id'] if existing else secrets.token_urlsafe(16)
            if not existing:
                execute('INSERT INTO users(id,phone,name,language) VALUES(?,?,?,?)', (uid, body.phone, body.name.strip(), body.language))
            if not existing or (body.languages is not None and not active(uid)):
                execute('INSERT OR REPLACE INTO user_languages VALUES(?,?)', (uid, json.dumps(list(dict.fromkeys(body.languages or [body.language])))))
                execute('UPDATE users SET language=? WHERE id=?', (body.language, uid))
            execute('DELETE FROM otps WHERE phone=?', (body.phone,))
            token = secrets.token_urlsafe(40)
            execute('INSERT INTO auth VALUES(?,?,?)', (hashlib.sha256(token.encode()).hexdigest(), uid, time.time()+7*86400))
            response.set_cookie('talkeasy_session', token, httponly=True, secure=cfg.app_env == 'production', samesite='lax', max_age=7*86400)
            return person(uid)

    @app.get('/api/me')
    async def me(uid=Depends(user)):
        return person(uid)

    @app.post('/api/auth/logout')
    async def logout(request: Request, response: Response, uid=Depends(user)):
        s = active(uid)
        if s:
            execute("UPDATE sessions SET status='ended',ended=?,epoch=epoch+1 WHERE id=?", (time.time(), s['id']))
            await sync_room(s, delete=True)
        execute('DELETE FROM auth WHERE token_hash=?', (hashlib.sha256(request.cookies['talkeasy_session'].encode()).hexdigest(),))
        response.delete_cookie('talkeasy_session')
        return {'ok': True}

    @app.patch('/api/profile')
    async def profile(body: Profile, uid=Depends(user)):
        # Name, voice and gender can change mid-conversation (the worker applies them live);
        # the conversation language is changed from the conversation screen instead.
        if active(uid) and body.language != person(uid)['language']:
            raise HTTPException(409, 'End your conversation before changing language or profile.')
        if not body.name.strip():
            raise HTTPException(422, 'Please enter your name.')
        if not person(uid)['name']:
            if body.languages is not None and len(body.languages) != 1:
                raise HTTPException(422, 'Choose one language when creating your profile.')
            body.languages = body.languages or [body.language]
        if body.languages is not None:
            if body.language not in body.languages:
                raise HTTPException(422, 'Choose a conversation language from your selected languages.')
            execute('INSERT OR REPLACE INTO user_languages VALUES(?,?)', (uid, json.dumps(list(dict.fromkeys(body.languages)))))
        current = person(uid)
        if body.voice is not None and body.voice not in voices.ALL_VOICES and not (body.voice == 'self' and current['own_voice']):
            raise HTTPException(422, 'Choose one of the listed voices.')
        gender = body.gender or current['gender']
        voice = body.voice if body.voice is not None else current['voice']
        if gender and voice and voice != 'self' and voice not in voices.VOICES[gender]:
            if body.voice is not None:
                raise HTTPException(422, 'Choose a voice that matches your gender.')
            voice = None  # Gender changed: fall back to that gender's default voice.
        execute('UPDATE users SET name=?,language=?,voice=?,gender=? WHERE id=?', (body.name.strip(), body.language, voice, gender, uid))
        return person(uid)

    @app.get('/api/voices')
    async def voice_list(uid=Depends(user)):
        return {'default': voices.DEFAULT_VOICE, 'defaults': voices.DEFAULT_VOICES, **voices.VOICES}

    @app.post('/api/voice-learning')
    async def voice_learning(body: VoiceLearning, uid=Depends(user)):
        """Opt in (or out) of learning your own voice from your next conversation."""
        if body.enabled and not cfg.fish_api_key:
            raise HTTPException(503, 'Voice learning is not available.')
        if person(uid)['own_voice']:
            raise HTTPException(409, 'Your voice is already learned.')
        execute('UPDATE users SET voice_learning=? WHERE id=?', (int(body.enabled), uid))
        return person(uid)

    @app.post('/api/voice-clone/remove')
    async def remove_voice_clone(uid=Depends(user)):
        """Delete your learned voice here and at Fish Audio."""
        row = one('SELECT voice_clone FROM users WHERE id=?', (uid,))
        if row and row['voice_clone']:
            if not cfg.fish_api_key:
                raise HTTPException(503, 'Voice removal is not available right now. Please try again.')
            try:
                async with httpx.AsyncClient(timeout=15) as client:
                    await voice_clone.delete_voice(client, cfg.fish_api_key, row['voice_clone'])
            except httpx.HTTPError:
                raise HTTPException(503, 'Voice removal is not available right now. Please try again.') from None
            for key in [key for key in preview_cache if key[0] == row['voice_clone']]:
                del preview_cache[key]
        execute("UPDATE users SET voice_clone=NULL,voice_learning=0,voice=CASE WHEN voice='self' THEN NULL ELSE voice END WHERE id=?", (uid,))
        return person(uid)

    @app.post('/api/voices/{voice}/preview')
    async def voice_preview(voice: str, uid=Depends(user)):
        if voice == 'self':
            row = one('SELECT voice_clone,language FROM users WHERE id=?', (uid,))
            if not row or not row['voice_clone']:
                raise HTTPException(404, 'Voice not found.')
            if not cfg.fish_api_key:
                raise HTTPException(503, 'Voice previews are not configured.')
            language = row['language'] if voice_clone.speaks(row['language']) else 'English'
            key = (row['voice_clone'], language)
            if key not in preview_cache:
                limit('voice-preview:' + uid, 30, 60)
                try:
                    async with httpx.AsyncClient(timeout=15) as client:
                        preview_cache[key] = await voice_clone.synthesize(client, cfg.fish_api_key, row['voice_clone'], voices.sample_for(language)[1])
                except httpx.HTTPError:
                    raise HTTPException(503, 'Voice preview unavailable.') from None
            return Response(preview_cache[key], media_type='audio/mpeg')
        if voice not in voices.ALL_VOICES:
            raise HTTPException(404, 'Voice not found.')
        if not cfg.sarvam_api_key:
            raise HTTPException(503, 'Voice previews are not configured.')
        language = person(uid)['language']
        key = (voice, voices.sample_for(language)[0])
        if key not in preview_cache:
            limit('voice-preview:' + uid, 30, 60)
            try:
                async with httpx.AsyncClient(timeout=10) as client:
                    preview_cache[key] = await voices.synthesize_preview(client, cfg.sarvam_api_key, voice, language)
            except (httpx.HTTPError, ValueError, KeyError):
                raise HTTPException(503, 'Voice preview unavailable.') from None
        return Response(preview_cache[key], media_type='audio/mpeg', headers={'Cache-Control': 'private, max-age=86400'})

    @app.post('/api/qr')
    async def qr(body: QrOptions | None = None, uid=Depends(user)):
        limit('qr:'+uid, 20, 60)
        code = secrets.token_urlsafe(24)
        execute('DELETE FROM qr WHERE user_id=? AND expires<=?', (uid, time.time()))
        execute('INSERT INTO qr VALUES(?,?,?)', (code, uid, time.time()+300))
        locale = body.locale if body else 'en'
        execute('INSERT INTO qr_locales VALUES(?,?)', (code, locale))
        return {'code': code, 'url': cfg.frontend_url + '/?connect=' + code + '&lang=' + locale, 'expires_in': 300, 'locale': locale}

    @app.get('/api/qr/{code}')
    async def qr_language(code: str):
        q = one('SELECT q.expires,l.locale FROM qr q LEFT JOIN qr_locales l ON l.code=q.code WHERE q.code=? AND q.expires>?', (code, time.time()))
        if not q:
            raise HTTPException(404, 'This QR has expired. Ask for a fresh code.')
        return {'locale': ('en' if q['locale'] == 'od' else q['locale']) or 'en', 'expires': q['expires']}

    @app.post('/api/requests')
    async def request_connection(body: ConnectRequest, uid=Depends(user)):
        async with mutation_lock:
            prune()
            limit('request:'+uid, 15, 60)
            q = one('SELECT * FROM qr WHERE code=? AND expires>?', (body.code, time.time()))
            if not q:
                raise HTTPException(404, 'This QR has expired. Ask for a fresh code.')
            peer = q['user_id']
            if uid == peer:
                raise HTTPException(400, 'This link belongs to your signed-in account. To test with two windows, sign out of one window and sign in with a different phone number, then copy a fresh link from the other window.')
            if active(uid) or active(peer):
                raise HTTPException(409, 'One of you is already in a conversation.')
            if one("SELECT id FROM requests WHERE status='pending' AND (sender IN (?,?) OR receiver IN (?,?))", (uid, peer, uid, peer)):
                raise HTTPException(409, 'A connection request is already waiting.')
            rid = secrets.token_urlsafe(16)
            execute('INSERT INTO requests VALUES(?,?,?,?,?)', (rid, uid, peer, 'pending', time.time()+60))
            execute('DELETE FROM qr WHERE user_id=?', (peer,))
            return {'id': rid, 'peer': person(peer), 'status': 'pending'}

    @app.post('/api/requests/{rid}/respond')
    async def respond(rid: str, body: Decision, uid=Depends(user)):
        async with mutation_lock:
            prune()
            r = one('SELECT * FROM requests WHERE id=? AND receiver=?', (rid, uid))
            if not r:
                raise HTTPException(404, 'Request not found.')
            if r['status'] != 'pending':
                raise HTTPException(409, 'This request is no longer waiting.')
            if body.accept:
                if active(uid) or active(r['sender']):
                    raise HTTPException(409, 'One of you is already connected.')
                sid = secrets.token_urlsafe(18)
                execute('INSERT INTO sessions(id,a,b,language_a,language_b,status,started) VALUES(?,?,?,?,?,?,?)', (sid, r['sender'], uid, person(r['sender'])['language'], person(uid)['language'], 'listening', time.time()))
            execute('UPDATE requests SET status=? WHERE id=?', ('accepted' if body.accept else 'declined', rid))
            return {'ok': True}

    @app.get('/api/state')
    async def state(uid=Depends(user)):
        prune()
        incoming = rows("SELECT * FROM requests WHERE receiver=? AND status='pending'", (uid,))
        outgoing = one('SELECT * FROM requests WHERE sender=? ORDER BY expires DESC LIMIT 1', (uid,))
        for r in incoming:
            r['peer'] = person(r['sender'])
        if outgoing:
            outgoing['peer'] = person(outgoing['receiver'])
        return {'incoming': incoming, 'outgoing': outgoing, 'session': session_view(active(uid), uid)}

    @app.patch('/api/sessions/{sid}/language')
    async def change_session_language(sid: str, body: SessionLanguage, uid=Depends(user)):
        async with mutation_lock:
            s = member(sid, uid)
            if s['status'] == 'ended':
                raise HTTPException(409, 'This conversation has ended.')
            column = 'language_a' if s['a'] == uid else 'language_b'
            if s[column] != body.language:
                limit('language-change:'+uid, 6, 60)
                # Invalidate in-flight audio/text; the worker rebuilds both directions.
                execute(f"UPDATE sessions SET {column}=?,epoch=epoch+1,status=CASE WHEN status='resume-request' THEN 'paused' ELSE status END,resume_by=NULL,resume_expires=NULL WHERE id=?", (body.language, sid))
                execute('UPDATE users SET language=? WHERE id=?', (body.language, uid))
                execute('INSERT OR REPLACE INTO user_languages VALUES(?,?)', (uid, json.dumps([body.language])))
                await sync_room(member(sid, uid))
            return person(uid)

    @app.post('/api/sessions/{sid}/pause')
    async def pause(sid: str, uid=Depends(user)):
        async with mutation_lock:
            s = member(sid, uid)
            if s['status'] == 'ended':
                raise HTTPException(409, 'This conversation has ended.')
            execute("UPDATE sessions SET status='paused',resume_by=NULL,resume_expires=NULL,epoch=epoch+1 WHERE id=?", (sid,))
            await sync_room(member(sid, uid))
        return {'ok': True}

    @app.post('/api/sessions/{sid}/resume')
    async def resume(sid: str, uid=Depends(user)):
        async with mutation_lock:
            s = member(sid, uid)
            if s['status'] != 'paused':
                raise HTTPException(409, 'Only a paused conversation can request resume.')
            execute("UPDATE sessions SET status='resume-request',resume_by=?,resume_expires=? WHERE id=?", (uid, time.time()+60, sid))
        return {'ok': True}

    @app.post('/api/sessions/{sid}/resume/respond')
    async def resume_response(sid: str, body: Decision, uid=Depends(user)):
        async with mutation_lock:
            s = member(sid, uid)
            if s['status'] != 'resume-request' or s['resume_by'] == uid:
                raise HTTPException(409, 'There is no resume request for you to answer.')
            execute('UPDATE sessions SET status=?,resume_by=NULL,resume_expires=NULL,epoch=epoch+1 WHERE id=?', ('listening' if body.accept else 'paused', sid))
            await sync_room(member(sid, uid))
        return {'ok': True}

    @app.post('/api/sessions/{sid}/end')
    async def end(sid: str, uid=Depends(user)):
        s = member(sid, uid)
        execute("UPDATE sessions SET status='ended',ended=COALESCE(ended,?),epoch=epoch+1 WHERE id=?", (time.time(), sid))
        await sync_room(s, delete=True)
        return {'ok': True}

    @app.post('/api/sessions/{sid}/token')
    async def room_token(sid: str, uid=Depends(user)):
        s = member(sid, uid)
        if s['status'] == 'ended':
            raise HTTPException(409, 'This conversation has ended.')
        if not cfg.voice_ready:
            raise HTTPException(503, 'Voice is not configured yet. Add the LiveKit and model-provider credentials on the server.')
        async with dispatch_locks.setdefault(sid, asyncio.Lock()):
            try:
                async with lk() as client:
                    await client.room.create_room(api.CreateRoomRequest(name=sid, empty_timeout=120, max_participants=3))
                    existing = await client.agent_dispatch.list_dispatch(sid)
                    if not any(d.agent_name == cfg.livekit_agent_name for d in existing):
                        await client.agent_dispatch.create_dispatch(api.CreateAgentDispatchRequest(agent_name=cfg.livekit_agent_name, room=sid, metadata=json.dumps({'session_id': sid})))
            except Exception as error:
                raise HTTPException(503, 'Could not connect to the voice service. Please try again.') from error
        # Recheck after remote work; an End must not issue fresh access.
        s = member(sid, uid)
        if s['status'] == 'ended':
            raise HTTPException(409, 'This conversation has ended.')
        token = (api.AccessToken(cfg.livekit_api_key, cfg.livekit_api_secret)
                 .with_identity(uid).with_name(person(uid)['name']).with_ttl(timedelta(minutes=10))
                 .with_grants(api.VideoGrants(room_join=True, room=sid, can_publish=True, can_subscribe=True, can_publish_data=False, can_publish_sources=['microphone']))
                 .to_jwt())
        return {'url': cfg.livekit_url, 'token': token, 'identity': uid}

    @app.get('/api/conversations')
    async def conversations(uid=Depends(user)):
        prune()
        grouped = {}
        for s in rows('SELECT * FROM sessions WHERE a=? OR b=? ORDER BY started DESC', (uid, uid)):
            peer = s['b'] if s['a'] == uid else s['a']
            if peer not in grouped:
                grouped[peer] = {'person': person(peer), 'sessions': []}
            grouped[peer]['sessions'].append(session_view(s, uid))
        return list(grouped.values())

    def worker(request: Request):
        supplied = request.headers.get('authorization', '')
        if not cfg.worker_secret or not hmac.compare_digest(supplied, 'Bearer ' + cfg.worker_secret):
            raise HTTPException(401, 'Worker authentication required.')

    @app.get('/api/internal/sessions/{sid}', dependencies=[Depends(worker)])
    async def worker_session(sid: str):
        # Hot path (worker consent polling): read-only. Expiry runs in lifecycle_cleanup.
        s = one('SELECT * FROM sessions WHERE id=?', (sid,))
        if not s:
            raise HTTPException(404, 'Session not found.')
        return {**s, 'participants': [worker_person(s['a'], s['language_a']), worker_person(s['b'], s['language_b'])]}

    @app.post('/api/internal/users/{uid}/voice-clone', dependencies=[Depends(worker)])
    async def save_learned_voice(uid: str, body: LearnedVoice):
        """The worker reports a voice it learned; only for a person who opted in."""
        updated = db.execute('UPDATE users SET voice_clone=?,voice_learning=0 WHERE id=? AND voice_learning=1 AND voice_clone IS NULL', (body.voice_id, uid)).rowcount
        db.commit()
        if not updated:
            raise HTTPException(409, 'Voice learning is not enabled for this person.')
        return {'ok': True}

    @app.post('/api/internal/sessions/{sid}/turns', dependencies=[Depends(worker)])
    async def save_turn(sid: str, body: Turn):
        s = one('SELECT * FROM sessions WHERE id=?', (sid,))
        if not s or s['status'] != 'listening' or s['epoch'] != body.epoch:
            raise HTTPException(409, 'Discard stale or paused speech.')
        if body.speaker_id not in (s['a'], s['b']):
            raise HTTPException(403, 'Unknown speaker.')
        execute('INSERT INTO turns VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET interrupted=MAX(turns.interrupted,excluded.interrupted) WHERE turns.session_id=excluded.session_id AND turns.speaker_id=excluded.speaker_id', (body.id, sid, body.speaker_id, body.source, body.translation, body.source_language, body.target_language, body.interrupted, time.time()))
        return {'ok': True}

    if Path('dist/index.html').exists():
        app.mount('/', StaticFiles(directory='dist', html=True), name='frontend')
    return app

app = create_app()
