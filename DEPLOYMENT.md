# Private test deployment

This test setup keeps the API and voice worker on this computer. Cloudflare provides a temporary HTTPS URL; it is not an always-online deployment.

- The HTTPS tunnel points only to the password-protected gateway on `127.0.0.1:8018`.
- The gateway forwards to FastAPI on `127.0.0.1:8017`, which serves the compiled React app and API.
- The LiveKit worker remains connected to LiveKit Cloud and uses the local API directly.
- The gateway blocks internal worker routes, requires the shared test password on every request, disables caching, and marks session cookies Secure.
- Access details are in `PRIVATE_TEST_ACCESS.txt`, excluded from Git and Docker images. Share these only with the intended testers. Never share `.env.local`, which also contains provider keys.
- Development OTPs are shown in the app. Testers must use different phone numbers; no SMS is sent. This is a trusted private test, not production identity verification.

Keep the computer awake and the API, gateway, tunnel, and worker processes running. Stopping the tunnel removes public access. A new tunnel gets a new URL; update `FRONTEND_URL` in `.env.local` and restart the API so new QR links use that URL. Existing local-only links will not work on phones.

## Local launch commands

```sh
npm run build
.venv/bin/uvicorn backend.main:app --host 127.0.0.1 --port 8017
.venv/bin/python -m backend.agent dev
.venv/bin/uvicorn backend.preview:create_preview --factory --host 127.0.0.1 --port 8018
cloudflared tunnel --url http://127.0.0.1:8018 --no-autoupdate
```

Run each long-running command in its own terminal. The downloaded tunnel binary for this test is `/private/tmp/talkeasy-tunnel-bin/cloudflared`; it may be removed by system temporary-file cleanup.

## Later: always-online hosting

`Dockerfile.api` builds the frontend and serves it with one FastAPI process. Mount persistent storage at `/data` for SQLite. `Dockerfile.worker` builds the agent with cached turn-detection models and runs it in production mode. These Docker images still require a Linux image build on the selected hosting service; Docker is not installed on this computer.

Use provider secret storage, HTTPS `FRONTEND_URL`, `APP_ENV=production`, Twilio Verify credentials, and the same `WORKER_SECRET` in the API and worker. Set `BACKEND_URL` to the deployed API address for the worker. Stop the local worker before moving the same named agent to a hosted worker, so jobs do not accidentally route back to this computer.

## Railway private test

Project: `71de89a0-70b2-426e-aca4-c9eaf52443f3` (TalkEasy).
Services: `talkeasy-app` and `talkeasy-worker`.
Reserved app domain: `https://talkeasy-app-production.up.railway.app`.

Use `deploy/railway-app.json` or `deploy/railway-worker.json` as `railway.json` in each service's upload directory. Upload only source/build files; exclude `.env*`, local SQLite data, and private access files. Secrets belong in Railway variables.

The app start command is `python -m backend.hosted`. It supervises the API on port 8017 and the password gateway on `PORT=8018`; publish only port 8018. The worker uses `BACKEND_URL=http://talkeasy-app.railway.internal:8017`. Attach a volume at `/data`, set `DATABASE_PATH=/data/talkeasy.sqlite3`, and set `RAILWAY_RUN_UID=0` for Railway volume write permissions. Use one app replica.

Both hosted services use `LIVEKIT_AGENT_NAME=talkeasy-railway-translator`, so the local test worker cannot receive hosted calls. `AGENT_IDLE_PROCESSES` defaults to zero for this small test. Keep the worker always running (no sleeping/serverless mode).

This deployment starts with a fresh database. Existing local conversations remain on the computer. It retains development OTPs and the private password gate; it is not public production authentication. Trial accounts have resource/network limits. Confirm successful builds, worker registration, private API connectivity, and a two-phone voice test before considering deployment complete.

To prepare a fresh upload, run `python deploy/prepare.py /private/tmp/talkeasy-release-NEW`. Then run `railway up` from **inside** each generated app/worker directory with explicit project, environment, and service selectors. The generated conventional `Dockerfile` guarantees Docker detection even when config-as-code settings are not applied. Do not upload from the repository root with an external path argument; the CLI can resolve configuration against the wrong directory.

### Trial deployment result (2026-09-28)

The Railway web app passed HTTPS, Basic-auth, API health/configuration, and internal-route blocking checks. The worker Docker image built successfully but the trial container killed its turn-detector inference process: `memory.max=999997440`, `memory.peak=999997440`, `oom_kill=1`. It never registered with LiveKit. The worker needs a higher memory allowance before voice testing can proceed. Keep the failing deployment stopped until that limit is raised. A temporary diagnostic SSH public key was registered with approval and then revoked; no diagnostic SSH session reached the container.

### Upgrade verification (2026-09-28)

Hobby upgrade verified. Worker resource override is 2 GB memory / 2 vCPUs. Deployment `2ef13ad1-7c67-4bee-a20d-29e6551893f6` started successfully and registered `talkeasy-railway-translator` with LiveKit. An automated test used two synthetic accounts, verified HTTPS login/session cookies, QR origin, consent, room-token dispatch, private backend connectivity, Sarvam speech recognition, Gemini English-to-Hindi translation, and received non-silent Sarvam output audio on the listener. The test session was ended and test accounts logged out. This is a smoke test, not a concurrency/load test or a real-phone microphone test.

Current hosted URL: https://talkeasy-app-production.up.railway.app. The private access file now points to this hosted URL. The worker is running; the earlier trial-stop instructions are historical. Local history remains local.

### Shared gate removed at user request

The hosted app uses `PUBLIC_TEST_ACCESS=true`, so visitors go directly to TalkEasy without HTTP Basic authentication. Phone sign-in still uses visible development OTPs; it does not verify ownership of phone numbers. Internal worker routes remain blocked by the public gateway, and app session cookies remain Secure. The gateway defaults to password protection unless the explicit public-test flag is true.

### Agent latency observability

The worker uses LiveKit Agents 1.8.3 Agent Insights with traces and logs enabled;
raw audio recording and transcript uploads are disabled explicitly. LiveKit's
project **Settings → Data and privacy → Agent observability** must also be enabled.
Inspect a new call in **Sessions → Agent insights** (old calls are not backfilled).
Both interpreter directions have their own AgentSession and source/target labels.

Inspect `agent_turn` for end-of-turn / transcription delay, `llm_node_ttft`,
`llm_node_ttfs` (stream buffering until the first sentence), `tts_node_ttfb`, and
`e2e_latency`. STT finalization and endpointing overlap: do not add them blindly.
Custom `ekam.translation_provider` spans distinguish Mayura from Gemini fallback;
`ekam.consent_check` measures the backend request that gates translation. Failure
spans retain only the exception type, never provider response text. Existing
`voice_metrics` logs now include speech/request identifiers for correlation.
`voice_playout` also logs first-sentence and SDK playback timings.

Provider spans include transport plus inference and are not pure network timings.
There are no LLM tool calls in this translation path. Worker e2e/playback metrics
are not proof of audio reaching the listener's speaker; examine LiveKit room
connection statistics for transport quality and use a two-device listening test
for perceived latency. No guessed residual is labeled "network". Compare multiple
turns in the same language direction before declaring a dominant stage. SDK traces
and logs can contain SDK-generated metadata; application-added spans contain no
speech text. No custom exporter or new analytics vendor is configured.

LiveKit 1.8 permits only one primary AgentSession per job. `JobRecording` enables
trace/log collection on the first directional session only; subsequent sessions,
including replacements after language changes, pass `record=False`. Job-level
telemetry initialization is retained. A regression test exercises the installed
SDK primary-session guard across both initial and replacement sessions. The
original attempt to opt both directions into recording caused a startup crash.

### Backend region migration (2026-09-28)

Moved `talkeasy-app` from legacy `sfo` to `asia-southeast1-eqsg3a` with one replica,
co-located with `talkeasy-worker`. Railway rollout
`a977f0ae-93d3-4a17-9a66-aa3bac322f4f` succeeded. The existing volume
`e3945116-cb67-416f-8f6d-206912ebacb9` remains attached at `/data` and Ready;
the public domain and worker private backend address are unchanged.
`deploy/railway-app.json` now pins Singapore for subsequent source deployments.
The public API health check passed after migration.
