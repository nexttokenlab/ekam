---
name: TalkEasy
description: A familiar translator app with exceptional clarity.
colors:
  primary: "#3158eb"
  primary-deep: "#2544c2"
  ink: "#202c45"
  muted: "#667187"
  supporting: "#596984"
  caption: "#64718a"
  line: "#e8ecf3"
  surface: "#ffffff"
  canvas: "#f5f7fb"
  soft-blue: "#eef2fb"
  listening: "#eaf0ff"
  paused: "#eceff4"
  danger: "#c8494b"
  error-text: "#a33b3b"
  error-surface: "#fff0ef"
  focus: "#6686ff"
typography:
  display:
    fontFamily: "DM Sans Variable, sans-serif"
    fontSize: "43px"
    fontWeight: 650
    lineHeight: 1.13
    letterSpacing: "-0.04em"
  headline:
    fontFamily: "DM Sans Variable, sans-serif"
    fontSize: "36px"
    fontWeight: 650
    lineHeight: 1.15
    letterSpacing: "-0.035em"
  title:
    fontFamily: "DM Sans Variable, sans-serif"
    fontSize: "20px"
    fontWeight: 650
    lineHeight: 1.3
    letterSpacing: "-0.035em"
  body:
    fontFamily: "DM Sans Variable, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.55
    letterSpacing: "normal"
  label:
    fontFamily: "DM Sans Variable, sans-serif"
    fontSize: "14px"
    fontWeight: 650
    lineHeight: 1.4
    letterSpacing: "normal"
rounded:
  field: "10px"
  button: "11px"
  compact: "12px"
  transcript: "14px"
  panel: "16px"
  dialog: "20px"
spacing:
  small: "8px"
  control-gap: "10px"
  compact-gap: "12px"
  regular: "16px"
  roomy: "20px"
  mobile-gutter: "24px"
  dialog-inset: "28px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.surface}"
    typography: "{typography.label}"
    rounded: "{rounded.button}"
    padding: "13px 19px"
  button-secondary:
    backgroundColor: "{colors.soft-blue}"
    textColor: "#33415b"
    typography: "{typography.label}"
    rounded: "{rounded.button}"
    padding: "13px 19px"
  button-danger:
    backgroundColor: "{colors.danger}"
    textColor: "{colors.surface}"
    typography: "{typography.label}"
    rounded: "{rounded.button}"
    padding: "13px 19px"
  button-primary-hover:
    backgroundColor: "{colors.primary-deep}"
  input:
    backgroundColor: "#fbfcfe"
    textColor: "{colors.ink}"
    rounded: "{rounded.field}"
    padding: "14px"
  listening-card:
    backgroundColor: "{colors.listening}"
    textColor: "#3b5abc"
    rounded: "{rounded.panel}"
    padding: "23px 20px"
---

# Design System: TalkEasy

## Overview

**Creative North Star: "The familiar translator app"**

The user selected the familiar app style, code-first. TalkEasy expresses that choice with clean white and cool gray surfaces, confident cobalt controls, dark navy type, restrained rounded panels, and consistent outlined icons. The interface stays quiet around connection and conversation; this is an app rather than a promotional composition.

The component character is approachable and clear. Most surfaces are flat, with structural elevation reserved for navigation and modal layers. These descriptions document the implemented direction; they do not introduce a separate brand exploration. The shipped visual assets are vector icons, generated SVG QR codes, and a locally bundled variable font. No photographic or raster imagery ships.

**Key Characteristics:**

- Cobalt actions and cool, low-noise surfaces.
- Clear listening, paused, consent, and error states.
- Compact mobile navigation and spacious desktop grouping.
- Outlined icons, initial avatars, and readable text history.

This document records the frontend implementation in `src/App.tsx`, `src/styles.css`, and `src/main.tsx`. Finish review disposition is Ship for the frontend preview; contrast and End-dialog error-feedback findings were resolved. FastAPI and LiveKit code exists, but real voice behavior remains unverified.

## Colors

The palette pairs confident cobalt with cool paper-like neutrals; semantic red is reserved for ending and errors. Frontmatter values are normative and capture the final CSS cascade, including the legibility overrides.

### Primary

- **Confident Cobalt** (`primary`): primary actions, brand mark, language icon, and selected navigation.
- **Deep Cobalt** (`primary-deep`): primary-button hover.
- **Soft Blue** (`soft-blue`): secondary controls and the owner's transcript turns.
- **Listening Blue** (`listening`): the active listening-state panel.
- **Focus Periwinkle** (`focus`): keyboard focus outlines, deliberately outside the component edge.

### Secondary

- **Action Red** (`danger`): the explicit End confirmation.
- **Error Red and Blush** (`error-text`, `error-surface`): local form errors and page alerts. The End dialog renders its own error so a failure remains visible in modal context.

### Neutral

- **Navy Ink** (`ink`): primary reading text and headings.
- **Supporting Slate** (`supporting`): descriptions, translations, placeholder text, and empty transcripts.
- **Caption Slate** (`caption`): metadata and privacy captions. `muted` remains the base token for other secondary text; final selector overrides take precedence.
- **Cool Canvas** (`canvas`), **White Surface** (`surface`), and **Fine Divider** (`line`): page, panels, and row separation.
- **Paused Gray** (`paused`): paused listening panels; text shifts to the darker paused slate used by the implementation.

**The Explicit State Rule.** Pair color with a written state, control label, or icon; color alone must not carry listening, pause, consent, or failure meaning.

## Typography

**Display Font:** DM Sans Variable, sans-serif.
**Body Font:** DM Sans Variable, sans-serif.

The font is bundled through `@fontsource-variable/dm-sans`; there is no separate display or monospace family. It supplies friendly, compact app typography with semibold headings and restrained negative tracking. Hindi and Kannada rely on the browser's available script fallback; a dedicated Indic font is not bundled.

### Hierarchy

- **Display:** the welcome heading uses the `display` role, reducing to 35px at the mobile breakpoint and 31px on narrow phones.
- **Headline:** the history title uses the `headline` role, reducing to 32px on mobile. Generic h1 defaults to 46px; local surface rules deliberately override it.
- **Title:** standard h2 uses `title`; modal titles rise to 24px desktop and 23px mobile, while compact section titles use 17–18px.
- **Body:** original transcript speech uses `body`, reducing to 15px on mobile. Translation text is 14px at line-height 1.7, then 13px on mobile. Supporting paragraphs range from 13–15px.
- **Label:** primary controls use `label`. Most metadata is 11–13px; the mobile session footnote is 10px. Timer figures use tabular numerals.

**The Transcript Hierarchy Rule.** Keep original speech above its translation, with a fine divider and quieter supporting color; preserve speaker and language metadata.

## Layout

The app frame is centered with a maximum width of 1120px and minimum height of 100dvh. Desktop main content has 62px horizontal insets. Home uses two equal columns with a 46px gap, expanding to 58px at 1200px; the frame also gains 24px top space there. History is capped at 760px and live conversation at 680px.

At 760px and below, Home becomes one column, main insets become 24px, the header becomes 89px tall, and ancillary header privacy text is hidden. At 360px and below, main/header insets become 18px, the decorative greeting icons disappear, and dialog action rows may wrap. Vertical rhythm uses the observed 8–28px spacing family, with larger gaps between major groups.

There are exactly two primary destinations: Home and Conversations. Profile opens from the avatar; QR actions remain on Home. Desktop navigation floats at the bottom in a 330px-wide bar. Mobile navigation spans the screen edge with safe-area padding. App padding reserves space for the bar. During a session, navigation is hidden and sticky session controls take its place.

Desktop dialogs are centered at up to 460px wide and 90dvh tall. On mobile they become full-width bottom sheets, rounded only at the top, capped at 94dvh with safe-area padding. Scrollable content remains inside the native dialog.

## Elevation & Depth

White and tinted surfaces provide most separation without card shadows. Structural shadows distinguish floating navigation, scan action, modal dialog, and transient toast. The modal backdrop darkens and blurs the underlying app. Initial avatars use flat color; the profile avatar's white ring separates it from the canvas.

### Shadow Vocabulary

- **Floating navigation:** `0 8px 40px #243c7017`; mobile uses `0 -4px 25px #243c7008` plus a top border.
- **Scan action:** `0 5px 14px #172e9133` on the white button inside the cobalt panel.
- **Modal:** `0 24px 90px #12214033`; backdrop is `#1a284663` with 4px blur.
- **Toast:** `0 6px 25px #23345220`.

**The Structural Elevation Rule.** Use the established shadows to identify floating controls and overlays; ordinary history and transcript cards remain flat.

## Shapes

Rounded rectangles form the basic vocabulary: fields and navigation items are softly curved, transcript rows slightly rounder, major panels rounder again, and modal sheets the most rounded. Frontmatter records their radius values. Avatars and icon-only close buttons are circular; QR framing and outlined Lucide icons provide the recurring linear geometry. Borders are thin and cool rather than heavy outlines.

## Components

### Buttons

Clear, compact controls with generous vertical space. Shared buttons have a minimum height of 49px, centered icon/label pairs, and the `button` radius. Primary, secondary, and danger assignments follow frontmatter; the white Scan control is an inverse action inside the cobalt panel. A separate dark navy Pause control emphasizes session control. The pale red icon-only End control opens confirmation rather than ending immediately.

Background, transform, and shadow transitions last 0.18s. Enabled buttons move down 1px on press. Disabled buttons reduce opacity to 0.55 and use a not-allowed cursor. Primary and secondary buttons darken on hover; text controls underline. Keyboard focus uses a 3px outline with 4px offset. Not every control is 44px: the close control is 36px and preview action minimum is 26px; do not claim universal touch-target compliance.

### Chips

There is no general filter-chip system. The implemented example notice is a pale-blue, softly rounded inline notice with icon and text. Preserve its role as provenance for sample content, rather than using it as an interactive filter.

### Cards / Containers

Connect panels are cobalt with white content. Guidance and history containers are white and flat. Transcript cards use white for the other speaker and soft blue for the owner; original speech, divider, translated speech, and optional interruption note remain distinct. Person rows use initial avatars and separators, with a subtle hover wash. Empty history and empty transcript views have explicit explanatory copy.

### Inputs / Fields

Fields use a cool near-white fill, thin cool border, `field` radius, 14px padding, and 49px minimum height. Labels sit above fields; placeholders use supporting slate. The speaking-language control overlays a native select on its styled container; the container receives a focus-within outline. Name, phone, OTP, language, and pasted connection link share the field family. OTP uses centered, widely tracked digits. Errors use inline alert panels; they are not encoded only as border color.

### Navigation

Home and Conversations use outline icons with labels and `aria-current="page"` on the active destination. Desktop active items gain a pale-blue fill and cobalt text; mobile items stack icons above labels, retain transparent backgrounds, and increase active icon stroke weight. The navigation landmark is named Main navigation.

### Dialogs

The shared Sheet uses native `dialog.showModal()` with a descriptive accessible name and labelled Close control. Escape/cancel and clicks on the dialog's outer surface close it. QR, scanner, profile, phone/OTP onboarding, connection consent, and End confirmation use this pattern. Preserve native modal focus behavior. Camera failure offers a pasted-link fallback; QR creation/expiry supports regeneration. The End dialog retains an inline `role="alert"` failure message and disables its submitting control while busy.

### Listening and feedback

The signature waveform has 35 bars, an eased 1.3s repeating scale animation, and staggered negative delays. Paused or disconnected states turn it into a quiet line. It is decorative (`aria-hidden`); visible status text supplies meaning. Reduced-motion preferences disable animation and transition globally. The waveform is a UI state visualization, not a verified microphone amplitude meter.

Implemented labels cover ready, connecting, listening, reconnecting, interrupted connection, paused, pending resume, and demo preview. Resume consent uses Accept/Decline; an outgoing request has a waiting state. Page and form errors use `role="alert"`; toast, outgoing request, and request outcome feedback use `role="status"`. Busy controls disable repeated submission. The listening label itself is not an ARIA live region. Do not infer a complete accessibility audit from these mechanisms.

## Do's and Don'ts

### Do:

- **Do** preserve the user-selected familiar app direction and the cobalt/navy/cool-neutral palette.
- **Do** keep exactly Home and Conversations in primary navigation, with profile in the avatar and QR on Home.
- **Do** retain written listening and consent states, keyboard focus treatments, and reduced-motion behavior.
- **Do** label prototype conversations and transcripts as examples and keep errors visible inside their active dialog.
- **Do** apply the final supporting-text contrast overrides when extending existing components.

### Don't:

- **Don't** introduce a photographic or raster visual language into the documented implementation without a new design decision.
- **Don't** turn ordinary transcript or history cards into elevated floating panels.
- **Don't** substitute waveform animation for a written listening state or claim that the preview verifies live audio.
- **Don't** add audio playback or downloads to text-only history.

### Conversation bubbles
Incoming messages align left on white; outgoing messages align right on pale blue, at most 85% of the transcript width. Show only the viewer-facing text: source for their own turns, translation for incoming turns. Apply the same layout to live chat and session history.

App name: Ekam (renamed from TalkEasy). Display the wordmark as “ekam”. Existing infrastructure identifiers remain unchanged.

Home QR actions use two stacked, full-width touch targets in a centered column (maximum 560px): cobalt “My QR” with reveal-code helper text, then white “Scan other QRs” with scan helper text. Each uses a left icon, text group, and trailing chevron. Minimum heights are 124px on small phones and 132px on larger screens, with 16px separation. Both actions preserve existing sign-in/consent behavior. Verified at 375px and 1280px widths; no horizontal overflow.

Logged-out onboarding (September 2026): preserve the Ekam wordmark and cobalt/navy palette. Show branding above an inline name, phone and OTP form; no login modal, profile avatar, bottom navigation or scan action before authentication. Desktop uses an introductory column beside the form; mobile stacks them. Native checkbox language choices allow English, Hindi and Kannada; multiple selections reveal a starting conversation-language selector. Form errors and test OTP remain inline. Signed-in Home keeps the full QR; the scan action is the centre item of the bottom navigation.

Latest onboarding refinement: use one centered card (480px maximum) on both desktop and mobile. Branding headline and supporting sentence live inside that card above the form; remove the “Sign in, scan a QR…” helper. The first step only collects country/region and national mobile number, with India (+91) default. OTP comes next; new accounts then complete name and languages. Returning accounts skip setup. Keep the Ekam wordmark in the page header.

Onboarding now fills the viewport edge to edge with a white surface, with no separate rounded card or outer canvas gutters. Readable content stays bounded to 480px on desktop with 24px minimum internal padding. Country selection is embedded on the left of the mobile-number field, defaulting to +91. Branding: “Speak your language. Understand each other.” Supporting copy: “Live voice translation for face-to-face conversations.”

Latest user direction restores the rounded card experience. Logged-out visitors first see a tall white welcome card on the cool-gray canvas, with the Ekam logo, “Talk to anyone in your native language” and a bottom Get started button. Get started opens the existing phone-first form in a rounded card. Preserve India (+91) as default and the combined country-code/mobile field. Signed-in users bypass welcome; incomplete profiles resume setup.

Welcome and every login/setup step now share `.auth-card` and `.auth-brand`: same 480px maximum width, viewport-based minimum height, 24px outer margins, 16px corners, centered 80px mark and stacked wordmark. The logo stays at the same position across steps. Primary actions share a 56px height and bottom alignment. Logged-out steps have no external header. Verified equal card bounds before/after Get started at mobile and desktop widths.

Latest login simplification: remove the separate Get started screen. The first logged-out card combines the centered logo and tagline with the country-code/mobile field and Send verification code CTA. Keep the shared card theme across verification and profile steps. Test PIN is 0000; signed-in scan action is Scan QR.


Current visual authority: the user requested the supplied illustration’s beige and black theme throughout Ekam, superseding the earlier cobalt palette. Canvas #f1e8db, ivory cards #fffcf7, ink #201c17, secondary text #645b4f, beige CTAs #e6d3b6 with black labels and #d7be9b hover. Language selections, avatars, navigation, chat surfaces, icons and QR ink follow the warm palette. Error text retains its semantic red. The original illustration is displayed at 240px tall on narrow phones and 260px otherwise, without cropping.


Latest user direction: revert the beige palette. Restore the earlier blue-and-white theme throughout the app. Remove the beige illustration from login while awaiting a replacement image. Preserve all current login, multi-language, QR and merged-chat behavior.

### Guest language controls (September 28, 2026)
The QR card uses a 56px native select with a leading language icon and trailing chevron. Language detection and its microphone action have been removed. Selecting a language updates the scan prompt and visitor onboarding locale. Labels remain translated, icons follow logical RTL alignment, and keyboard focus remains visible.

### In-conversation spoken language
Replace the ambiguous language pair with a 64px-tall, labeled “I speak” selector showing the native language name and a chevron. Keep the peer name and their language as separate supporting text. Reuse the existing single-choice language sheet and blue/white visual treatment. The selection updates the current session rather than asking users to scan again.

### Practice conversation prompts
Removed at the user's request (September 28, 2026): the live conversation no longer shows the “Try a conversation” starters or suggested replies.

Resume requests open as a modal popup for the participant who must answer (Decline / Accept; closing the popup declines), consistent with connection requests. The requester sees “Waiting for {name} to accept…” inside the voice bar; nothing is embedded above the conversation.

### Voice bar and My QR card (September 28, 2026)
The live conversation controls sit in the same white floating surface as the bottom navigation, clear of the phone’s home bar. They start as one full-width primary “Enable microphone” button — the only control with visible text. Once voice connects it splits into two equal icon-only buttons: Pause/Resume on the left (secondary while listening, with a small level indicator only while someone speaks; primary blue play icon when paused, because that state needs you to act; a spinner after you ask to resume) and a danger-red End button on the right. Each icon button’s accessible name and tooltip carry the full action or status (“Pause listening”, “Translating {name}…”, “Request resume”, “Waiting for {name} to accept…”). “Enable audio playback” appears above the transcript only when the browser blocks audio.
Home shows the QR inside a cobalt card headed “Scan my conversation code” in the visitor’s language, always on one line (the font shrinks to fit, never below 12px, instead of wrapping), white viewfinder corners around a white QR tile, and the owner’s name and spoken language (written in the visitor’s language) with a circular Refresh control below. QR modules stay square with a quiet zone and no overlays so scanning reliability is unchanged.

### Language picker icons
Language pickers (“I speak” on Home and in a conversation, and “Their language” on the QR card) show the first letter of the selected language’s own name in its script — E, ह, ಕ, த, 日, ع and so on — in bold cobalt, instead of a generic translate icon, so the icon changes with the selection.

### Voice persona
Profile has a “Your voice” section explaining that it is the voice the other person hears for your translated words. Sarvam Bulbul voices appear as chips under Female and Male headings; the selected chip uses the cobalt selected style, and tapping a chip selects it and plays a short sample (a speaker icon shows while it plays). Saving the profile stores the voice.

### Headphones screen while waiting
Until a connection request is accepted, the requester sees only a full-screen cobalt panel: a white phone-and-headphones icon and “Put on your headphones for a better experience” in the app language. No request state is shown visually; screen readers still announce that the request is waiting for the other person.

### Gender
Onboarding and Profile show a required two-option “Gender” choice (Male, Female) with a one-line explanation that it is used for your voice and correct grammar in translations. It uses the same chip style as the voice picker. In Profile, the voice picker then lists only voices of that gender. Interface text that describes a person (“I speak”, “Speaks {language}”) uses the grammatical gender of that person where the language requires it.

