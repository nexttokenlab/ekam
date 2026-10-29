# Ekam latency harness and two-phone acceptance

Status: **no live provider or two-phone measurements were made for this change**.
The deterministic numbers below are simulated regression data. Existing README
provider-only checks are not evidence of speech-to-playback performance.
Base reviewed: `801ba4f9ff0285d94814b37b10982da4e7cdb471`.

## Reproduce without credentials

Python 3.11+ is sufficient for the standard-library harness and its unit tests:

```sh
python -m unittest backend.tests.test_latency -q
mkdir -p benchmarks/results
python -m benchmarks.latency simulate > benchmarks/results/simulated.jsonl
python -m benchmarks.latency report benchmarks/results/simulated.jsonl > benchmarks/results/simulated-report.json
python -m benchmarks.latency report benchmarks/fixtures/regression.jsonl
```

The generator creates 100 samples per direction/metric and explicit error,
cancellation, speculative discard, interruption and suppression outcomes. The
small regression fixture also includes reversed ordering and a duplicate. Tests
exercise the real interpreter with mocked provider streams, not just statistics.

Example **SIMULATED** English → Hindi acoustic metric: n=100, p50=2290 ms,
p95=2740 ms. These values are arithmetic fixtures, not an estimate of Ekam.
No artificial sleep is described as a provider benchmark.

Full implementation checks (no provider credentials needed):

```sh
python -m venv .venv
.venv/bin/pip install -r backend/requirements.lock.txt
# Only if the runtime uses a SOCKS proxy:
.venv/bin/pip install socksio==1.0.0
npm ci
.venv/bin/python -m pytest backend/tests -q
npm run build
npx playwright test tests/latency.spec.ts --workers=1
```

The browser contract test uses mocked Web Audio interfaces, not actual playback.
Use the repository lockfiles; the speech-handle context already depends on Agents
1.8 internals. A new SDK version needs these checks and fresh live validation.

## Boundaries and what each measurement means

| Metric / observation | Start → end | Provider attribution / limit |
| --- | --- | --- |
| `sdk_endpointing` | SDK VAD end-of-speech → SDK turn-end decision | STT route; includes endpointing/semantic wait, not a separate fixed 550 ms charge |
| `sdk_transcription` | SDK last speech → final transcript | STT route; residual transcript delay, not full streaming STT inference time |
| `translation_request` | Existing provider-stage span entry → exit | Actual requested Sarvam or configured LLM; hedged losers/cancellations remain request samples |
| `translation_first_text` | Interpreter LLM-node entry → first yielded translation | Selected winner: `sarvam-mayura`, `sarvam-translate`, Gemini, OpenAI or passthrough; includes consent/hedge setup |
| `translation_complete` | Same entry → generator exit | Same attempt and sample ID; only committed successful output has outcome `ok` |
| `tts_node_first_frame` | TTS-node entry → first yielded audio frame | Configured TTS route; includes waiting for streaming translation and chunking |
| `sdk_tts_ttfb` | SDK TTS request → first response audio | SDK provider request duration; keep separate from TTS-node time |
| `tts_node_complete` | TTS-node entry → generator exit | Includes streaming output, not merely synthesis startup |
| `sdk_playout_e2e` | SDK last user speech → worker audio-output start | Worker proxy only; `provider=unknown` because assistant item callbacks do not reliably identify the translation winner |
| `sdk_playback` | SDK audio forwarding start → SDK speaking start | Worker playout proxy, not listener hardware |
| Browser `render_energy_onset` | First threshold crossing on the incoming translation track | Listener render proxy; no turn/winner correlation claimed |
| `acoustic_e2e` | Physical source speech offset → listener's first translated sound | Same sample clock, isolated reference signals; route/winner must be known for the controlled trial |

Do **not sum stage percentiles**. Streaming STT, endpointing, preemptive
translation and TTS can overlap. Even individual stage durations do not form a
serial waterfall. SDK EOU fields can be zero when speech-end information is
unavailable; inspect SDK availability before accepting a zero-heavy cohort.
Missing fields are omitted, never manufactured from logs or replaced with zero.
The SDK's zero sentinel is preserved; it is not proof of instantaneous STT.

Random attempt IDs connect translation-first and translation-complete rows only.
There is deliberately no guessing that the latest STT, TTS or assistant event
belongs to that attempt. TTS fallback chains use `fishaudio-fallback`, not a claim
that Fish actually won. Provider-controlled acoustic runs can report end-to-end
percentiles by provider without relying on this uncertain join. For hedge runs,
keep winner-unknown acoustic rows under `unknown` unless independently verified.

## Privacy and export

Set `EKAM_LATENCY_ENABLED=true` **before starting a fresh worker job**. Normal
operation defaults to off. Benchmark mode disables job-level LiveKit Insights
audio, transcript, trace and log recording exports: SDK spans may carry model
text even when transcript recording is off. Ordinary application logs and the
existing text-history database are separate product behavior; do not share those
as benchmark artifacts. Do not enable voice learning or Self voice during the
privacy baseline; that feature intentionally collects audio for cloning.

The new worker stream has an exact schema: version, origin, random sample ID,
language direction, allowlisted provider/metric, duration and outcome. No audio,
transcripts, prompts, participant/session/room IDs, request IDs, credentials,
absolute timestamps or exception messages. Unknown fields and invalid durations
are rejected. Sink failures do not break voice processing. Timing and language
patterns still require access controls and an agreed retention period; delete
local trial exports after review. `benchmarks/results/` is ignored by git.

Capture stdout/stderr using your deployment's normal log sink, then extract only
allowlisted rows:

```sh
python -m benchmarks.latency extract /private/path/worker.log > benchmarks/results/live-worker.jsonl
python -m benchmarks.latency report benchmarks/results/live-worker.jsonl > benchmarks/results/live-worker-report.json
```

For mocked/fault-injected provider runs set `EKAM_LATENCY_ORIGIN=simulated` before
worker startup. Tests explicitly mark their mocked rows simulated. Real calls
using non-personal scripted speech are still real provider measurements, but
record the scripted-input condition in the run manifest.

The report groups by **origin × source × target × provider × metric**. It uses
nearest-rank p50/p95 and shows n and all outcome counts. Non-`ok` samples never
enter successful latency percentiles; report them alongside latency to avoid
survivor bias. Empty groups have null percentiles; exact duplicate rows count
once. n<100 is marked `small_sample` (a reporting caution, not statistical proof
of reliability). Browser observations have a separate schema and are rejected by
the duration reporter rather than being mistaken for end-to-end measurements.
Do not merge different run conditions just because their grouping keys match.

## Listener playback diagnostics

Open each phone's live app URL with `?latency=1` before connecting. The existing
track-attachment path starts a local observer only for the intended translation
track. It records media `playing`/`waiting`/`stalled` events and Web Audio energy
edges, using `performance.now()` offsets. Use remote browser developer tools to
run `window.ekamLatency.download()`; `window.ekamLatency.clear()` clears the
bounded 2,000-event memory buffer. Nothing is uploaded automatically.

Energy detection polls every 20 ms at a fixed 0.01 RMS threshold (-40 dBFS).
Borrowed samples are processed in memory and immediately overwritten. The
observer has no audio destination, so it cannot double-play the track. Cleanup
runs on track unsubscribe and room disconnect. A suspended AudioContext or
unsupported Web Audio is reported; retry with a new connection after an audio
gesture. Background throttling, quiet speech and device mute can make this proxy
incomplete. A media `playing` event can precede real speech on a long-lived track;
it is not the first sound of each translated utterance.

Never subtract a browser offset or phone wall-clock timestamp from a worker
clock. The existing playback data message is a worker state notification, not
proof that the recipient heard sound. The browser observations diagnose autoplay
and render gaps; acoustic reference timing validates physical latency.

## Acoustic measurement without saved audio

For isolated, one-direction baseline trials, use a laptop and two-channel USB
audio interface. Channel 1 is an isolated source-speech reference close to the
speaker; channel 2 is a contact/probe microphone at the receiving phone's
speaker, or an isolated loopback of its headset output. Verify that source
speech cannot trigger channel 2 and translation playback cannot trigger channel
1. Do not use a shared laptop microphone as two independent phone references.
No LiveKit egress, screen/audio recorder or packet capture is needed.

```sh
# Device index from sounddevice's device list on the measurement laptop.
.venv/bin/python -m benchmarks.acoustic --device 3 --source English --target Hindi --provider unknown >> benchmarks/results/acoustic.jsonl
python -m benchmarks.latency report benchmarks/results/acoustic.jsonl
```

The monitor consumes two-channel blocks transiently, reduces each to RMS, and
stores only a single duration row. It requires at least 200 ms of source speech,
100 ms separation before listener onset, and uses the last active source block
as speech offset. It rejects overlap, capture overruns and incomplete trials.
Its timing resolution is 10 ms; thresholds and low-energy tails add systematic
uncertainty. Calibrate with a non-speech pulse split to both reference channels;
check equal channel timing before each run. The monitor is **not suitable for
simultaneous speech or interruptions**; use those as behavioral acceptance
trials and retain only pass/fail counts. A real microphone/interface run remains
unverified in this change.

Alternatively import two numeric timestamps already obtained with one calibrated
measurement clock (no audio input accepted by the importer):

```sh
python -m benchmarks.latency acoustic --source English --target Hindi --provider unknown --sample-id 0123456789abcdef0123456789abcdef --speech-end-ms 1000 --playback-start-ms 2500
```

The importer validates values but cannot establish that the operator used the
same clock or a real device. Keep operator provenance in the private run manifest.

## Exact live prerequisites

| Requirement | Needed access |
| --- | --- |
| `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` | Same LiveKit project for API and worker; permission to mint tokens, dispatch the named worker and join rooms; Cloud or functioning self-hosted media/TURN |
| `WORKER_SECRET`, `BACKEND_URL` | Shared API/worker secret; worker can reach authenticated internal session/history endpoints |
| `SARVAM_API_KEY` | Working STT (`saaras:v3`), Bulbul v3 TTS and Mayura/Sarvam-Translate access, billing and quota; required by the current startup check even for Gemini speech routes |
| `GEMINI_API_KEY` | Translation model `gemini-3.1-flash-lite` access; Gemini speech access for French/Arabic/Italian/Korean/Japanese; verify quota and billing, not just key presence |
| Optional OpenAI | `TRANSLATION_PROVIDER=openai`, configured model and `OPENAI_API_KEY`; not needed for Gemini baseline |
| Optional Fish | `FISH_API_KEY` and funded `FISH_TTS_MODEL` only for a separate opt-in voice cohort; exclude from privacy baseline |
| Phone verification | Two distinct verified test numbers/accounts; production requires `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_VERIFY_SERVICE_SID` and working SMS region. Development codes only on a trusted, access-restricted development origin |
| Runtime | Node 20+, Python 3.11+, lockfile dependencies, downloaded VAD/turn-detector assets, API, worker and frontend running; one API process per existing deployment design |
| Network | Trusted HTTPS origin reachable by both phones; correct `FRONTEND_URL`; worker→API, provider HTTPS, model asset download, LiveKit signaling WSS and media UDP/TURN connectivity; valid TLS |
| Devices | Two physical phones with independent microphones, supported browsers and mic permission; camera permission or pasted QR link; unlocked foreground tabs; two headsets plus speakerphone trials |
| Inspection | Permission to restart a fresh worker, view/extract worker logs, inspect browser console remotely, and read effective non-secret worker/model/region configuration |
| Physical benchmark | Laptop with sounddevice/PortAudio and calibrated isolated two-channel capture interface, or equivalent one-clock timestamp instrument |

Run `python -m backend.agent download-files`, then
`python -m backend.voice_check --cloud` in the worker environment. This checks
setup and LiveKit auth, not provider billing or device audio. Do not paste secrets
into issues, JSONL, console snippets or frontend environment variables.

This work used a local checkout and mocked providers. Hosted runtime access,
credentials, phones, SMS, provider quotas, media connectivity and acoustic
hardware have **not** been verified. No deployment or live benchmark is claimed.

## Two-phone run and acceptance procedure

1. Create a private run manifest: git SHA, dependency lock hashes, date, anonymized
   device labels A/B, OS/browser versions, audio route/volume, distance/orientation,
   Wi-Fi/mobile condition, worker/API/LiveKit regions verified from deployment,
   model versions, endpointing/hedge/cross-talk settings, warm/cold status, and
   trial IDs. Do not include numbers, names, IPs or utterance text. Keep separate
   result directories for each configuration and network/device cohort.
2. Start a fresh benchmark-enabled worker; turn off voice learning. Onboard the
   two distinct test accounts, scan/paste QR, accept on both devices and grant
   microphone/audio permission. Confirm each hears only the intended translation.
3. Use non-personal scripted utterances of comparable length (short, long,
   numbers, natural pauses). Run English↔Hindi, English↔Kannada,
   Hindi↔Kannada, and English↔French; add English↔Arabic for VAD-only Gemini
   coverage. Reverse phones/speakers as well as languages. Count cold first-turn
   trials separately; warm up five turns, then collect ≥100 completed isolated
   trials per direction and configuration. Also record all failures/no-output
   trials in a separate count; never silently retry and discard them.
4. Establish provider-controlled cohorts: normal Sarvam preference; then
   `MAYURA_ENABLED=false` for the configured LLM path. A hedge cohort is separate:
   use `unknown` for unverified acoustic winners. Enable/disable the hedge only
   as an explicit configuration change in the manifest. Do not mix Self TTS
   fallback-chain timing with standard Sarvam/Gemini timing.
5. Run the following behavioral trials at least ten times each per audio route.
   Keep only trial IDs, observed timing where valid, and pass/fail/reason codes.

| Trial | Actions | Acceptance / failure evidence |
| --- | --- | --- |
| Isolated routing | A speaks, then B; headsets first, then speakers | One intelligible translation to the intended recipient, no own-voice translation loop, no duplicate playback |
| Natural pauses | Pause mid-sentence, resume; include Kannada/Arabic VAD fallback | Note premature splits/missed ends; measure actual endpointing distribution, not assumed 550 ms |
| Speech during translation | Start speaking while receiving translated audio | Current code disables automatic speech-triggered interruption: speech must not unexpectedly truncate playback. Speakerphone mic hold may defer/drop new input; record it, do not report full duplex success |
| Explicit Pause / End | Tap during long translated playback, then try speaking | Both directions stop and old-epoch late results never restart output; record stop propagation/device residual audio separately. Resume requires mutual consent |
| Simultaneous speakers | With two headsets, both start together, then stagger by 300 ms; repeat speakers | Independent speech should reach the other person once without cross-talk misclassification. Report losses; speakerphone hold behavior may prevent full duplex acceptance |
| Cross-talk only | A speaks near A while B stays silent; reverse, vary distance and volume | Quiet copy at the other microphone is suppressed; true source is kept. Check `crosstalk_suppressed` logs locally; no extra translated echo |
| Equal-loudness negative control | Similar source level at both microphones | Document ambiguity; fail any claim of guaranteed isolation. Shared-computer/shared-mic tests cannot validate this guard |
| Slow translation | In a mocked run delay Sarvam >2 s; race fallback, then delay both; test each winner and a failed fallback | Hedge starts near configured deadline, exactly one output, loser cancelled; no old-epoch playback after Pause. These traces remain `simulated` |
| Live translation delays | Repeat scripted turns under actual quota/network conditions without injection | Report real request outcomes, winner where known and acoustic latency; do not blend injected delay results |
| Failures | Mock timeout/rate limit/empty response; disconnect/reconnect B; pause while requests wait | No fabricated latency zero; visible status and fail-closed behavior; missing playback stays a failure, never a fast successful sample |
| Audio permission/background | Reject autoplay, explicitly enable audio, lock/unlock and switch tabs | Correct recovery/status; background behavior is a separate compatibility result, not an asserted supported feature |

Initial pilot latency gates may be proposed as p50 ≤2.5 s and p95 ≤4 s acoustic
latency for warm isolated turns, but they are **targets to agree**, not achieved
results or release requirements. Behavioral gates are zero wrong-recipient
outputs, zero duplicate/echo loops, and zero stale-epoch restarts in the sampled
trials. Report counts and denominators, all unavailable/failed trials, and
uncertainty. Do not approve full duplex speakerphone support if mic-hold losses
are observed. No live acceptance row is marked passed by the mocked test suite.

## Validation performed for this change

- Clean Python 3.12 virtual environment installed from `backend/requirements.lock.txt`
  plus `socksio==1.0.0` for this runtime's inherited SOCKS proxy; `pip check` passed.
- Full backend suite: **140 passed** (mock providers; no network/provider benchmark).
- `npm ci` and `npm run build`: passed; existing bundle-size warning remains.
- `npx playwright test tests/latency.spec.ts --workers=1`: **1 passed**, mocked
  browser audio interfaces; no real browser/device audio acceptance implied.
- Python compilation, diff whitespace check, deterministic generation and fixture
  reports: passed.
- Physical capture, live provider access, two phones, cross-talk and real playback:
  **not run**. The hardware monitor and acoustic timestamp provenance still need
  validation in the target runtime.
