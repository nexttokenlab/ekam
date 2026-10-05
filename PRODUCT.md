# TalkEasy
<!-- impeccable:product-schema 1 -->

## Platform
web

## Stack
Mobile-first React, FastAPI backend, and LiveKit voice infrastructure, confirmed by the user. SQLite persistence for a single-process pilot.

## Users
Two nearby people who speak different languages. Specific first-pilot audience is undecided.

## Product Purpose
Let two people talk naturally in their own languages, with spoken translations and text history.

## Operating Context
Each person holds their phone close to their mouth. Loudspeaker is the default design assumption; earphones are optional. QR scan sends a request requiring acceptance. Phones should prioritize their owner, but complete voice isolation is not promised.

## Capabilities and Constraints
- Two bottom tabs, Home and Conversations, with a central Scan QR action between them. Profile through avatar; your own QR on Home.
- English, Hindi, Kannada. Language selection at onboarding.
- Name and phone onboarding with OTP. Exact privacy copy: “We will never share your phone number with the person you’re talking to.”
- Natural hands-free turn-taking using LiveKit VAD and semantic turn detection. Kannada semantic detection requires separate validation/fallback.
- Stop translated playback when listener starts speaking; translate after their turn ends.
- Listening OFF pauses translation while preserving macro session; resume requires Accept/Decline. Shared versus individual pause remains undecided; shared pause is a prototype assumption.
- Explicit End; new session needs QR. Silence never ends a session.
- One entry per person with separate meeting histories; text-only history, no audio playback/download.
- No push-to-talk, public discovery, messaging, role categories, or offline translation in V1.
- Web/PWA initial experience, no install needed. Locked-screen reliability remains unvalidated.
- Deliverable now includes real API-backed OTP, QR pairing, consent, history and LiveKit worker code. Provider credentials are absent; demo is explicitly separate, and live audio remains unverified.

## Brand Commitments
TalkEasy is the working name from the workspace. User selected the familiar app style (canon), code-first, on the Impeccable decision page. No supplied logo.

## Evidence on Hand
PRD /Users/nehapriya/Downloads/Proximity_Voice_Translator_PRD_v7.pdf contains only page 2, sections 11–18. User clarified device posture, audio flexibility, semantic turn detection, and interruption behavior in conversation. All prototype conversations must be labeled as examples.

## Product Principles
- Explicit consent before connecting and resuming.
- Make listening and pause state unmistakable.
- Conversation is primary; the interface stays quiet.
- Phone numbers stay private from the other participant.

App name: Ekam (renamed from TalkEasy). Display the wordmark as “ekam”. Existing infrastructure identifiers remain unchanged.

Connection UI: QR-only at the user's request. Home hint is “Tap to reveal QR code”; the QR icon reveals the user's code and Scan to connect opens the camera scanner. Do not display copy-link or paste-link alternatives. QR payload URLs remain supported for native camera scanning.

Onboarding update: logged-out Home is now the inline login/onboarding screen. Users can select multiple spoken languages (English, Hindi, Kannada) and choose one active conversation language. Preferences persist on their account; voice sessions still use one language per participant. Successful verification opens the full QR Home. Existing active sessions retain their language when the same account signs in again.

Phone-first login: country/region selector defaults to India (+91), followed by the national mobile number. Verify OTP before collecting profile information. Returning users keep their saved name and languages and enter Home directly. New users complete name and multi-language setup after verification; an unfinished profile resumes after reload and cannot create QR connections until completed.

Conversation history now opens directly as one chronological chat per person across all retained sessions. Session boundaries remain internal; the UI shows date separators and message times, with a latest-message preview in the people list. Live conversations include earlier messages with the same person. Text still follows the existing owner-source/incoming-translation rule and 30-day retention.
