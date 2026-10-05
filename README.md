# TalkEasy

Mobile-first React application, FastAPI API, and a two-person LiveKit interpreter worker. The default screen is an explicitly labeled interactive design preview. **Use live app** opens the real API-backed flow.

## Run locally

Requires Node 20+ and Python 3.11+ (tested with Node 24 and Python 3.12).

```sh
npm ci
python3 -m venv .venv
.venv/bin/pip install -r backend/requirements-agent.txt
cp .env.example .env
```

Start these in separate terminals, from this directory:

```sh
# API — also serves dist/ after npm run build
.venv/bin/uvicorn backend.main:app --host 127.0.0.1 --port 8017

# Frontend — proxies /api to FastAPI
npm run dev
```

Open http://localhost:5173. API documentation: http://127.0.0.1:8017/docs.

### Activate LiveKit voice

The API and worker read `.env.local` (preferred) and `.env`. `lk app env -w` can generate the LiveKit values in `.env.local`. Set server-only values:

- `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`
- `WORKER_SECRET`: a random value shared by API and worker
- `SARVAM_API_KEY`: STT and TTS for English, Hindi, Kannada
- `GEMINI_API_KEY`: faithful text translation using `gemini-3.1-flash-lite`
- `TRANSLATION_PROVIDER=gemini` and `TRANSLATION_MODEL=gemini-3.1-flash-lite`

Gemini uses Google's OpenAI-compatible endpoint; no OpenAI account or credits are needed in Gemini mode, and no automatic fallback to OpenAI occurs. To explicitly use OpenAI instead, set `TRANSLATION_PROVIDER=openai`, `TRANSLATION_MODEL=gpt-4.1-mini`, and `OPENAI_API_KEY`. Gemini free-tier quotas apply; verify your project's billing tier in AI Studio. See [Google pricing](https://ai.google.dev/gemini-api/docs/pricing) for free-tier data-use terms.

Then run:

```sh
# Download the VAD and turn-detector model assets once.
.venv/bin/python -m backend.agent download-files
# Check credentials, cached models, and read-only Cloud authentication.
.venv/bin/python -m backend.voice_check --cloud
# Keep the translation worker running alongside the API.
.venv/bin/python -m backend.agent dev
```

Restart the API after configuring credentials. LiveKit can be Cloud or self-hosted. Set `ENABLE_BACKGROUND_VOICE_CANCELLATION=true` only with a supported LiveKit Cloud setup. Browser echo cancellation and noise suppression are enabled regardless; they do not guarantee isolation of only the nearest speaker.

Worker startup reports missing credential names without printing their values. VAD is prewarmed once per worker process. Translation calls have a 15-second request timeout and at most one retry; a provider failure produces a visible status rather than speaking an error to the other person. Text must be saved successfully before playback begins. Subscription access starts closed and opens only for the intended recipient's track.

`backend/requirements.lock.txt` records the exact Python environment used for validation; `package-lock.json` locks frontend dependencies. The camera scanner is loaded only on demand.

### Two-device testing

Use two separate browser profiles or devices with different verified phone numbers. Both participants must accept the request before room tokens are issued. After acceptance each presses **Enable microphone** to grant browser permission. The recipient shows a QR; the other person scans it or pastes its connection link.

For actual phones, serve the app over HTTPS and set `FRONTEND_URL` to that reachable origin. `localhost` QR links only work on the same computer. Vite binds to loopback by default; configure a trusted HTTPS development proxy for devices. Camera/microphone permissions and locked-screen/background reliability depend on browser and OS support. Lock-screen call-style notifications are not implemented.

### Phone verification

Local development without Twilio displays a clearly labeled development code. No SMS is sent. Twilio Verify is implemented through its HTTP API; configure all three Twilio values to send real codes.

Production mode refuses to start without HTTPS `FRONTEND_URL`, a worker secret, and Twilio configuration. It never returns development codes. Never expose development mode publicly. Auth uses opaque, hashed, expiring session tokens in HttpOnly, SameSite cookies; production cookies are Secure. OTPs expire after five minutes, have five attempts, and are rate-limited. QR codes expire after five minutes and are consumed by a request; requests expire after one minute.

## Implemented flows

- Two bottom tabs (Home and Conversations) with a central Scan QR action; Profile via avatar.
- English/Hindi/Kannada selection, name and phone onboarding, OTP, sign-out.
- Camera QR scan, QR display, copy/paste connection link.
- Explicit accept/decline and request expiration.
- Two people per conversation, stable identity and repeated sessions grouped together.
- Shared pause, mutual consent to resume, explicit End, reconnection UI.
- Text-only history; originals and full translations, interruption marker, no audio recording.
- Thirty-day transcript retention (configurable). Session metadata remains for grouping.
- Short request/state tones after an initial user gesture, subject to browser audio restrictions.
- Separate demo data never written as real history.

Shared pause is a documented product assumption: either participant pauses both directions. Resume must be accepted by the other participant. The prototype uses simulated consent only in the explicitly labeled demo.

## Voice architecture

```text
React A ──microphone──► LiveKit room ◄──microphone── React B
                          │
                   Python AgentServer
                   ├─ A STT → translate → B TTS track
                   └─ B STT → translate → A TTS track
                          │
                 FastAPI consent + text history
```

FastAPI authenticates users, owns QR/request/macro-session state, mints room-scoped short-lived tokens, and explicitly dispatches `talkeasy-translator`. Secrets never enter the browser bundle. The client publishes only microphone audio, limits microphone subscriptions to agent participants, and subscribes only to `translation:<its user ID>`. The worker restricts each translated track to its intended recipient.

Each interpreter is explicitly linked to one speaker. LiveKit Silero VAD and the multilingual semantic turn detector govern English/Hindi turns. **Kannada uses an explicit VAD fallback**, because it is not listed in the semantic detector's supported languages. Do not advertise equivalent semantic endpointing for Kannada without further evaluation.

Confirmed listener speech interrupts the opposite interpreter's current speech. Full source and translated text are saved before playback; no WAV/MP3 or LiveKit session recording is enabled. STT/TTS and translation providers still process the audio/text; provider retention policies must be configured independently.

The worker checks authoritative session state every 500ms and before/after translation, receives room-metadata pause updates, disables input/output when either participant disconnects, and fails closed if the API is unreachable. Pause clears queued output/input; an incrementing session epoch rejects late translations from older consent states. This is bounded network propagation, not a guarantee of zero frames in flight after a tap.

## Checks

```sh
npm run build
.venv/bin/python -m pytest backend/tests -q
.venv/bin/python -m compileall -q backend
```

The backend suite covers unauthorized access, receiver-only acceptance, pause/resume consent, End, repeated-session grouping, QR/request expiration and replay, stale transcript rejection, idempotency, OTP attempt limits, origin checks, logout, directional translation, provider timeout handling, late-result suppression, same-language pass-through, and interruption history. Provider responses are mocked in these tests.

A live two-phone audio test has **not** been performed without provider credentials. Remaining deployment work: provision secrets, download model assets, validate voice routing/latency/noise/interruptions on real devices, choose an SMS region/provider configuration, and test browser background behavior.

## Deployment scope

This is a runnable development implementation, not a completed production rollout. Run **one FastAPI worker**: SQLite and in-process mutation/dispatch locks deliberately target a small pilot. For multiple API replicas use Postgres transactions and shared rate limiting/coordination. Serve the compiled frontend and API from one HTTPS origin, put authentication boundaries behind your trusted proxy, and configure TLS/backup/monitoring. Expired transcript deletion runs every 30 seconds and on history/session reads. Session metadata and identity deletion policies remain product decisions.

Silence never ends an active session. There is currently no abandoned-session timeout: End is explicit, and disconnect pauses worker processing. Set operational limits only after deciding the reconnect/session-expiry product policy.

## Main source files

- `src/App.tsx`, `src/styles.css`: responsive screens and React interactions.
- `src/lib/api.ts`: typed API client.
- `backend/main.py`: authentication, state transitions, persistence, LiveKit tokens and dispatch.
- `backend/agent.py`: directional translation, semantic turns, interruption, and consent gating.
- `.env.example`: all configuration names with no secrets.
- `PRODUCT.md`, `DESIGN.md`: product decisions and implemented visual system.

### QR language detection

On Home, choose the visitor’s language using the **Their language** dropdown. Microphone-based language detection has been removed.

Selection rotates the single-use QR and includes `lang` in its URL. QR metadata also stores the locale server-side. The visitor’s phone, PIN, and profile screens use that locale; a new visitor’s spoken language is preselected accordingly. The host’s profile language is unchanged. Existing users retain their saved language. The 10 Indian/English speech routes use Sarvam. French, Arabic, Italian, Korean, and Japanese transcription and speech output use Gemini through the LiveKit worker. English, Hindi, French, Italian, Korean, and Japanese use semantic turn detection; other languages use VAD. Arabic uses a right-to-left interface. Odia is retired from selection and detection; existing Odia profiles fall back to English without losing their account or conversation history. Legacy sessions remain readable. All profiles use one selected language. Onboarding and the Home language picker use radio buttons. The saved language controls app interface text and conversation language; the QR guest locale stays independent. Existing multi-language profiles retain their active language as their single preference.

Tests: `npm run build`, `npm run test:api`; run Vite on port 5176, then `npx playwright test tests/onboarding-locale.spec.ts tests/conversations.spec.ts --workers=1`. Browser tests mock APIs and send no SMS.

### Voice latency tuning
Translation text streams into LiveKit TTS instead of waiting for the full model response. Transcript writes run in background with bounded retries. VAD silence is 550 ms. Minimum endpointing is 500 ms with semantic turn detection and 700 ms for VAD-only languages such as Kannada. The semantic maximum is 3 seconds (`ENDPOINTING_MAX_DELAY`). It is the longest wait after a pause when the speaker seems mid-thought, not a limit on how long someone speaks; shorter values split slow speakers' sentences. Automatic speech-triggered interruption is disabled so microphone noise and a person continuing to speak do not truncate translated audio. Explicit Pause/End and consent loss still stop audio immediately.

Preemptive generation is enabled (LLM only, not TTS): translation starts on the final transcript while endpointing is still waiting. A speculative translation is spoken only if the turn commits with the same transcript, and it is saved to history only after that commit; discarded attempts are neither saved nor counted for duplicate suppression. This relies on LiveKit Agents' internal speech-handle context (pinned SDK version); if it is unavailable every generation is treated as committed.

Consent checks reuse session state fetched within the last 500 ms (`CONSENT_MAX_AGE_SECONDS`); the monitor refreshes it every 500 ms and room-metadata updates close the gate immediately. The worker's internal session read no longer runs expiry cleanup; that runs every 30 seconds and on user-facing reads in one transaction. If Mayura has not answered within `MAYURA_HEDGE_SECONDS` (default 2.0 s; Mayura usually answers English→Indian-language turns in 1.1–1.9 s), the configured LLM request starts and whichever produces text first is spoken. The whole fallback request, including connecting, races Mayura, and fallback failures are logged as warnings. Gemini STT reuses one HTTP connection per session. The worker keeps one prewarmed idle process (`AGENT_IDLE_PROCESSES`, default 1). The browser prefetches the LiveKit SDK after sign-in and refreshes session state as soon as room metadata changes.

**Speaker echo guard.** When a translation plays from a phone's speaker, that phone's microphone would otherwise pick it up and send it back as the listener's own speech. The worker publishes `{type: "playback", speaking}` on the `talkeasy.playback` data topic, only to the listener whose translation starts or stops playing. The browser holds its microphone during playback and releases it 500 ms after, while the translated audio itself keeps playing. The hold is skipped when the microphone label indicates earphones or a headset. Someone already mid-sentence is not cut off: their hold starts when they stop, or after 3 s at most. A 30 s failsafe releases the mic if no stop message arrives. The main control shows “Translating {name}…” during playback. Rules live in `src/lib/playback.ts`.

**Cross-talk guard.** Face to face, each phone's microphone also hears the other person, just more quietly. Without a guard, that speech would be translated back to its own speaker. The worker measures microphone loudness (RMS) on both inputs and compares them over each speaker's latest VAD speech window. If the other phone heard the same window at least `CROSSTALK_RATIO` times louder (default 1.5, about 3.5 dB), the turn is the other person's speech and is dropped (`crosstalk_suppressed`). Kept turns log `crosstalk_check` with the ratio for tuning. Two people genuinely talking at once are both kept, because each phone hears its own speaker louder. Two test "phones" sharing one computer or one microphone cannot be told apart by loudness. Background voice cancellation (`ENABLE_BACKGROUND_VOICE_CANCELLATION`) is a further option on LiveKit Cloud; check the plan's pricing first.

**Voice persona.** In Profile, each person can pick one of 12 curated Sarvam Bulbul v3 voices, six per gender (`backend/voices.py`). A saved voice that is no longer offered reads as the gender default. This is what the other person hears when that person's words are translated. Selecting a voice plays a short sample in the person's language (English for languages Bulbul does not speak), via `POST /api/voices/{voice}/preview`. Samples are cached in the API process and rate-limited. The choice is stored in `users.voice` and passed to the worker with the session participants; unset or unknown voices use `shubh`. It applies wherever Sarvam speaks the listener's language. Gemini-voiced listener languages (French, Arabic, Italian, Korean, Japanese) keep the default Gemini voice.

**Gender.** Onboarding requires Male or Female (editable in Profile), stored in `users.gender`. Name, voice and gender can be saved during a conversation; the worker rebuilds that call's pipelines so they apply immediately. Only the conversation language is locked in Profile, because it is changed from the conversation screen. Gender sets the default Bulbul voice (`shubh` / `ritu`) and the Gemini TTS voice (`Charon` / `Kore`). It filters the Profile voice picker to matching voices; changing gender resets a mismatched voice to that gender's default. It is sent to Mayura as `speaker_gender`, so first-person verbs agree (for example Hindi "जा रहा हूँ" / "जा रही हूँ"). It also adds speaker and listener gender hints to the LLM translation prompt, and selects gendered interface text such as Hindi "मैं बोलता/बोलती हूँ" (`src/lib/i18n.ts`). People without a saved gender keep the previous neutral behaviour.

**Self voice (Fish Audio, opt-in).** With `FISH_API_KEY` set on both the API and the worker, Profile offers “Learn my voice”, which is off by default and explains what is recorded. During the person's next conversation, the worker keeps only their own committed turns (never cross-talk or speculative turns). Once it has about 45 seconds, it creates a private Fish Audio voice. The speaking model is `FISH_TTS_MODEL`: `s2.1-pro` by default, which needs Fish Audio credit; the hosted services currently use `s2.1-pro-free`. If Fish Audio fails, that turn uses the standard voice instead of silence and reports the voice id to `POST /api/internal/users/{id}/voice-clone`. That call is accepted only for people who opted in. The recordings are then discarded, including if creation fails; learning stays on so the next conversation retries. The call screen shows “Learning your voice… N%”, and its footnote says audio is being recorded to learn it. Afterwards the learning option disappears and “Self” is offered as a voice (with a Fish Audio preview). Choosing it makes the other person hear the translation in the person's own voice, in every listener language Fish Audio speaks; Malayalam falls back to the gender's Bulbul voice. “Remove my voice” deletes the voice at Fish Audio and here. The Fish voice id never reaches browsers.

Worker logs include `voice_latency` (translation first text/completion), `voice_metrics` (EOU, transcription and TTS timings), and `voice_playout` (available LiveKit end-to-end timing). Logs contain timing values and language names, not conversation text. Worker timing is not a measurement of the listener device's exact playback time.

### Change language during a conversation
The conversation header shows a tappable “I speak” selector and separately labels the other participant’s language. Saving uses the authenticated session-language endpoint, changes only the caller’s language/profile, and increments the session epoch without creating a new conversation. The worker mutes and closes the old directional pipelines, rebuilds STT/translation/TTS for both participants, and rechecks server state before allowing audio. Paused sessions stay paused, pending resume requests are cleared, and ended sessions reject changes. Old-epoch speech cannot be saved.

### QR renewal
Home renews the displayed QR halfway through its five-minute validity and provides a manual Refresh QR action. Returning to a visible/focused page refreshes codes older than one minute; network reconnection triggers refresh and failed requests retry after five seconds. Recently displayed QR codes remain valid until their original expiry, avoiding invalidation while a visitor signs in. Creating a connection request consumes all outstanding QR codes for that owner. Expired codes remain rejected; a stale screenshot cannot renew itself.

### Voice worker region (September 28, 2026)
The Railway worker runs one replica in Singapore (`asia-southeast1-eqsg3a`); the legacy `sfo` replica was removed through Railway service scaling. Deployment `0941359e-eb1d-4c17-9173-c875bf85074e` registered with LiveKit in **India South**. The app/API and persistent database remain in their existing US region. LiveKit's project URL is unchanged; no global region pinning was enabled. Confirm registration after future deploys rather than assuming endpoint geography from the hostname.

### Session isolation and duplicate audio fixes
The hosted gateway forwards raw HTTP requests so pooled HTTP-client cookies can never supply another visitor's login. A one-time `isolated-proxy-cookies-v1` migration revokes existing authentication, expires pending QR requests and ends active sessions while preserving accounts and history. The development PIN remains a testing mechanism, not proof of phone ownership.
The worker suppresses repeated committed message IDs within an epoch and identical normalized long transcripts arriving within two seconds. Failed turns without output remain retryable. Browser audio attachment is idempotent per subscribed track and accepts only its intended translation track.

### Mayura voice translation
Mayura (`mayura:v1`, modern-colloquial, spoken-form-in-native) is preferred for English ↔ supported Indian languages on utterances up to 1,000 characters. Pairs of two Indian languages (for example Hindi ↔ Kannada) use Sarvam-Translate (`sarvam-translate:v1`, formal mode, up to 2,000 characters). In live checks it answered Hindi ↔ Kannada in 1.2–1.4 s, versus 2.3–3.2 s for Mayura and 2.8–3.6 s for Gemini on the same pair. It goes through the same fallback race. `MAYURA_ENABLED=false` restores the prior translation path. Other language pairs, longer turns and Mayura failures use the existing configured LLM (Gemini on this deployment). Mayura has a five-second total deadline; the LLM client has six-second network timeouts and no automatic retries. STT/TTS are unchanged. Four synthetic live provider checks (English↔Hindi/Kannada) returned translations in 0.70–1.28 seconds locally; this is not a full voice latency benchmark.
