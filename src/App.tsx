import { AppLocale, initialLocale, languageLocale, translate, useTranslation, type Gender } from './lib/i18n';
import { localeNames, localeLanguage, scanPrompt, onboardingCopy, validLocale, type Locale } from './lib/onboarding-copy';
import { Fragment, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import {
  ArrowLeft,
  ArrowRight,
  AudioLines,
  Check,
  ChevronDown,
  ChevronRight,
  Clock3,
  Home,
  LockKeyhole,
  MessageCircle,
  Mic,
  Pause,
  PhoneOff,
  Play,
  QrCode,
  ScanLine,
  ShieldCheck,
  Sparkles,
  X,
  LoaderCircle,
  LogOut,
  Headphones,
  Smartphone,
  Volume2,
  Camera,
  RefreshCw,
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import type { Room, RemoteTrackPublication, RemoteParticipant } from "livekit-client";
import { MAX_HOLD_DEFERRAL_MS, MAX_PLAYBACK_HOLD_MS, MIC_RESUME_DELAY_MS, PLAYBACK_TOPIC, micShouldListen, parsePlayback, usesEarphones } from "./lib/playback";
import {
  api,
  type Person,
  type Session,
  type Conversation,
  type AppState,
  type Turn,
  type VoiceOptions,
} from "./lib/api";
import { supportedLanguages, languageNative, languageGlyph, type Language } from "./lib/session";

import { mergeConversationTurns } from "./lib/conversations";

const callingCountries = [
  ["IN", "India", "+91"], ["US", "United States", "+1"], ["GB", "United Kingdom", "+44"],
  ["AE", "United Arab Emirates", "+971"], ["AU", "Australia", "+61"], ["CA", "Canada", "+1"],
  ["SG", "Singapore", "+65"], ["MY", "Malaysia", "+60"], ["NP", "Nepal", "+977"],
  ["LK", "Sri Lanka", "+94"], ["BD", "Bangladesh", "+880"], ["PK", "Pakistan", "+92"],
  ["DE", "Germany", "+49"], ["FR", "France", "+33"], ["IT", "Italy", "+39"],
  ["ES", "Spain", "+34"], ["NZ", "New Zealand", "+64"], ["SA", "Saudi Arabia", "+966"],
  ["QA", "Qatar", "+974"], ["KW", "Kuwait", "+965"], ["OM", "Oman", "+968"],
  ["BH", "Bahrain", "+973"], ["ZA", "South Africa", "+27"], ["JP", "Japan", "+81"],
];
const languages = supportedLanguages;
const samplePeer: Person = {
  id: "sample-ananya",
  name: "Ananya",
  language: "Hindi",
};
const sampleTurns: Turn[] = [
  {
    id: "s1",
    speaker_id: "you",
    source: "Hi! Is there a good coffee place nearby?",
    translation: "नमस्ते! क्या यहाँ पास में कोई अच्छी कॉफ़ी की जगह है?",
    source_language: "English",
    target_language: "Hindi",
    interrupted: false,
    created: Date.now() / 1000 - 120,
  },
  {
    id: "s2",
    speaker_id: samplePeer.id,
    source: "हाँ, अगली गली में एक बहुत अच्छा कैफ़े है।",
    translation: "Yes, there’s a really nice café on the next street.",
    source_language: "Hindi",
    target_language: "English",
    interrupted: false,
    created: Date.now() / 1000 - 100,
  },
  {
    id: "s3",
    speaker_id: "you",
    source: "That sounds perfect. Thank you!",
    translation: "यह तो बहुत अच्छा है। धन्यवाद!",
    source_language: "English",
    target_language: "Hindi",
    interrupted: false,
    created: Date.now() / 1000 - 80,
  },
];
const makeSample = (status: Session["status"] = "listening"): Session => ({
  id: "sample",
  a: "you",
  b: samplePeer.id,
  status,
  resume_by: null,
  started: Date.now() / 1000,
  ended: null,
  epoch: 0,
  peer: samplePeer,
  turns: sampleTurns,
  language_a: "English",
  language_b: "Hindi",
});
const examples: Conversation[] = [
  {
    person: samplePeer,
    sessions: [
      {
        ...makeSample("ended"),
        started: Date.now() / 1000 - 3600,
        ended: Date.now() / 1000 - 3120,
      },
    ],
  },
  {
    person: { id: "sample-kiran", name: "Kiran", language: "Kannada" },
    sessions: [
      {
        ...makeSample("ended"),
        id: "sample-k",
        peer: { id: "sample-kiran", name: "Kiran", language: "Kannada" },
        started: Date.now() / 1000 - 86400,
        ended: Date.now() / 1000 - 86220,
        turns: [],
      },
    ],
  },
  {
    person: { id: "sample-rahul", name: "Rahul", language: "Hindi" },
    sessions: [
      {
        ...makeSample("ended"),
        id: "sample-r",
        started: Date.now() / 1000 - 172800,
        ended: Date.now() / 1000 - 172320,
        turns: [],
      },
    ],
  },
];
function Brand() {
  return (
    <span className="brand">
      <span className="brand-mark">
        <AudioLines size={23} />
      </span>
      <span className="brand-name">ekam</span>
    </span>
  );
}
function Avatar({
  name,
  color = 0,
  large = false,
}: {
  name: string;
  color?: number;
  large?: boolean;
}) {
  return (
    <span className={`avatar avatar-${color % 3} ${large ? "large" : ""}`}>
      {name.slice(0, 1).toUpperCase()}
    </span>
  );
}
function dateLabel(timestamp: number, locale: Locale) {
  const d = new Date(timestamp * 1000);
  return d.toDateString() === new Date().toDateString()
    ? translate("Today", locale)
    : d.toLocaleDateString(locale, { month: "short", day: "numeric" });
}
function Sheet({
  title,
  children,
  close,
  wide = false,
  fullScreen = false,
}: {
  title: string;
  children: ReactNode;
  close: () => void;
  wide?: boolean;
  fullScreen?: boolean;
}) {
  const tr = useTranslation();
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current!;
    dialog.showModal();
    const onCancel = (e: Event) => {
      e.preventDefault();
      close();
    };
    dialog.addEventListener("cancel", onCancel);
    return () => {
      dialog.removeEventListener("cancel", onCancel);
      dialog.close();
    };
  }, []);
  return (
    <dialog
      aria-label={title}
      ref={ref}
      className={`sheet ${wide ? "wide" : ""} ${fullScreen ? "sheet-fullscreen" : ""}`}
      onClick={(e) => {
        if (!fullScreen && e.target === e.currentTarget) close();
      }}
    >
      <div className="sheet-content">
        <div className="sheet-header">
          <h2>{title}</h2>
          <button className="icon-button" aria-label={tr("Close")} onClick={close}>
            <X />
          </button>
        </div>
        {children}
      </div>
    </dialog>
  );
}
// The onboarding brand line, written like a correction: in {their>your} "their" is
// struck through and "your" is handwritten above it.
// It is always two lines, split at "|", and both lines shrink together (never below
// `min`) instead of wrapping. Screen readers get the corrected sentence only.
function BrandHeading({ text, min = 16 }: { text: string; min?: number }) {
  const ref = useRef<HTMLHeadingElement>(null);
  const spoken = text.replace(/\{[^{}>]*>([^{}]*)\}/g, "$1").replace(/\|/g, " ").replace(/\s+/g, " ").trim();
  const lines = text.split("|").map(line => line.trim());
  const render = (line: string) => line.split(/(\{[^{}]*\})/).map((part, index) => {
    const edit = /^\{([^{}>]*)>([^{}]*)\}$/.exec(part);
    return edit
      ? <span key={index} className="brand-edit"><s>{edit[1]}</s><span className="brand-insert" aria-hidden="true">{edit[2]}</span></span>
      : part;
  });
  useLayoutEffect(() => {
    const heading = ref.current;
    if (!heading) return;
    const fit = () => {
      heading.style.fontSize = "";
      const base = parseFloat(getComputedStyle(heading).fontSize);
      const rows = [...heading.querySelectorAll<HTMLElement>(".login-heading-line")];
      // Measure the words only: the handwritten correction may overhang the line end.
      heading.classList.add("measuring");
      const ratio = Math.min(1, ...rows.map(row => row.clientWidth / Math.max(row.scrollWidth, 1)));
      heading.classList.remove("measuring");
      if (ratio < 1) heading.style.fontSize = `${Math.max(min, Math.floor(base * ratio * 10) / 10)}px`;
    };
    fit();
    const observer = new ResizeObserver(fit);
    if (heading.parentElement) observer.observe(heading.parentElement);
    document.fonts?.ready.then(fit).catch(() => {});
    return () => observer.disconnect();
  }, [text, min]);
  return (
    <h1 ref={ref} className="login-heading" aria-label={spoken}>
      {lines.map((line, index) => <Fragment key={index}>{index > 0 && " "}<span className="login-heading-line">{render(line)}</span></Fragment>)}
    </h1>
  );
}

// Male / Female choice used for the default voice and gendered grammar in translations.
function GenderChoice({ value, onChange, t }: { value: Gender | null; onChange: (gender: Gender) => void; t: (text: string) => string }) {
  return (
    <fieldset className="gender-choices">
      <legend>{t("Gender")}</legend>
      <p>{t("Used for your voice and correct grammar in translations.")}</p>
      <div className="gender-options">
        {(["male", "female"] as const).map(option => (
          <label key={option} className={value === option ? "gender-option selected" : "gender-option"}>
            <input type="radio" name="gender" value={option} checked={value === option} onChange={() => onChange(option)} />
            <span>{t(option === "male" ? "Male" : "Female")}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

// The selected language's own first letter, in place of a generic translate icon.
function LanguageGlyph({ language, className = "" }: { language: Language; className?: string }) {
  return <span className={`language-glyph ${className}`} lang={languageLocale(language)} aria-hidden="true">{languageGlyph[language] ?? "A"}</span>;
}

// A single-line heading that shrinks its font (never below `min`) instead of wrapping.
function OneLineHeading({ text, className, lang, dir, max = 22, min = 12 }: {
  text: string; className?: string; lang?: string; dir?: "ltr" | "rtl"; max?: number; min?: number;
}) {
  const ref = useRef<HTMLHeadingElement>(null);
  useLayoutEffect(() => {
    const heading = ref.current;
    if (!heading) return;
    const fit = () => {
      heading.style.fontSize = `${max}px`;
      const ratio = heading.clientWidth / heading.scrollWidth;
      if (ratio < 1) heading.style.fontSize = `${Math.max(min, Math.floor(max * ratio * 10) / 10)}px`;
    };
    fit();
    const observer = new ResizeObserver(fit);
    if (heading.parentElement) observer.observe(heading.parentElement);
    document.fonts?.ready.then(fit).catch(() => {});
    return () => observer.disconnect();
  }, [text, max, min]);
  return <h2 ref={ref} className={className} lang={lang} dir={dir} aria-live="polite">{text}</h2>;
}

// A language's name as written in another locale (e.g. English → "अंग्रेज़ी" for a Hindi reader).
function languageNameIn(language: Language, locale: Locale) {
  try {
    return new Intl.DisplayNames([locale], { type: "language" }).of(languageLocale(language)) || languageNative[language];
  } catch {
    return languageNative[language];
  }
}

function Wave({ paused = false, bars = 35 }: { paused?: boolean; bars?: number }) {
  return (
    <div className={`wave ${paused ? "still" : ""}`} aria-hidden="true">
      {Array.from({ length: bars }, (_, i) => (
        <span
          key={i}
          style={
            {
              "--h": `${12 + Math.sin(i * 0.7) ** 2 * 38 + Math.cos(i * 0.3) ** 2 * 26}px`,
              "--delay": `${i * -0.12}s`,
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  );
}

function CameraScanner({
  onScan,
  onError,
}: {
  onScan: (code: string) => void;
  onError: (text: string) => void;
}) {
  const video = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    let cleanup: (() => void) | undefined;
    let stopped = false;
    import("@zxing/browser")
      .then(async ({ BrowserQRCodeReader }) => {
        try {
          const reader = new BrowserQRCodeReader();
          const controls = await reader.decodeFromVideoDevice(
            undefined,
            video.current!,
            (result) => {
              if (result && !stopped) {
                stopped = true;
                onScan(result.getText());
                cleanup?.();
              }
            },
          );
          cleanup = () => controls.stop();
          if (stopped) cleanup();
        } catch {
          onError(
            "Camera unavailable. Allow camera access in your browser settings, then reopen the scanner.",
          );
        }
      })
      .catch(() =>
        onError(
          "Camera scanner could not load. Close and reopen the scanner to try again.",
        ),
      );
    return () => {
      stopped = true;
      cleanup?.();
    };
  }, []);
  return (
    <video ref={video} autoPlay muted playsInline className="camera-video" />
  );
}

export default function App() {
  const [demo, setDemo] = useState(false);
  const [user, setUser] = useState<Person | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [spokenLanguages, setSpokenLanguages] = useState<Language[]>(["English"]);
  const [languageDraft, setLanguageDraft] = useState<Language[]>([]);
  const [activeLanguageDraft, setActiveLanguageDraft] = useState<Language>("English");
  const [language, setLanguage] = useState<Language>("English");
  const [tab, setTab] = useState<"home" | "conversations">("home");
  const [modal, setModal] = useState<
    "qr" | "scan" | "profile" | "login" | "request" | "end" | "languages" | null
  >(null);
  const [authStep, setAuthStep] = useState<"phone" | "otp" | "profile">("phone");
  const [name, setName] = useState("");
  const [gender, setGender] = useState<Gender | null>(null);
  const [phone, setPhone] = useState("");
  const [country, setCountry] = useState("IN");
  const dialCode = callingCountries.find(c => c[0] === country)![2];
  const fullPhone = dialCode + phone;
  const [otp, setOtp] = useState("");
  const [devCode, setDevCode] = useState<string | null>(null);
  const otpLength = devCode?.length || 6;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [config, setConfig] = useState({
    voice_ready: false,
    development: true,
    retention_days: 30,
    voice_cloning: false,
  });
  // Share of the ~45 seconds needed to learn this person's voice, while it is being learned.
  const [learningProgress, setLearningProgress] = useState<number | null>(null);
  const [state, setState] = useState<AppState>({
    incoming: [],
    outgoing: null,
    session: null,
  });
  const [sample, setSample] = useState<Session | null>(null);
  const [history, setHistory] = useState<Conversation[]>([]);
  const [selectedPerson, setSelectedPerson] = useState<string | null>(null);
  const detail = (demo ? examples : history).find(c => c.person.id === selectedPerson) || null;
  const [qr, setQr] = useState<{
    url: string;
    code: string;
    expires_in: number;
  } | null>(null);
  const [qrIssued, setQrIssued] = useState(0);
  const [qrLoading, setQrLoading] = useState(false);
  const [qrError, setQrError] = useState("");
  const [guestLocale, setGuestLocale] = useState<Locale>('en');
  const [loginLocale, setLoginLocale] = useState<Locale>(initialLocale);
  const appLocale = user ? languageLocale(modal === 'languages' ? activeLanguageDraft : modal === 'profile' ? language : user.language) : loginLocale;
  const tr = (text: string, values?: Record<string, string | number>, gender?: Gender | null) => translate(text, appLocale, values, gender);
  const copy = onboardingCopy[loginLocale];
  const [qrRetry, setQrRetry] = useState(0);
  const [camera, setCamera] = useState(false);
  const [transport, setTransport] = useState<
    "off" | "connecting" | "connected" | "reconnecting" | "failed"
  >("off");
  const [isSpeaking, setIsSpeaking] = useState(false);
  // The other person's translation is playing on this phone (see lib/playback.ts).
  const [translationPlaying, setTranslationPlaying] = useState(false);
  const [holdDeferred, setHoldDeferred] = useState(false);
  const [earphones, setEarphones] = useState(false);
  // Voice persona in the profile: the Bulbul voice others hear for this person's translations.
  const [voiceDraft, setVoiceDraft] = useState("shubh");
  const [voiceOptions, setVoiceOptions] = useState<VoiceOptions | null>(null);
  const [previewingVoice, setPreviewingVoice] = useState<string | null>(null);
  const previewAudio = useRef<HTMLAudioElement | null>(null);
  const previewUrls = useRef(new Map<string, string>());
  const playbackTimers = useRef<{ resume?: number; defer?: number; failsafe?: number }>({});
  const [needsAudioPlayback, setNeedsAudioPlayback] = useState(false);
  const [serverHealthy, setServerHealthy] = useState(true);
  const room = useRef<Room | null>(null);
  const audioElements = useRef<HTMLMediaElement[]>([]);
  const [tick, setTick] = useState(Date.now());
  const session = demo ? sample : state.session;

  const waitingRequest = !demo && !session && state.outgoing?.status === "pending" ? state.outgoing : null;
  const me = demo ? { id: "you", name: "You", language } : user;
  const audioContext = useRef<AudioContext | null>(null);
  const priorCue = useRef("");
  useEffect(() => {
    const unlock = () => {
      audioContext.current ??= new AudioContext();
      audioContext.current.resume().catch(() => {});
    };
    window.addEventListener("pointerdown", unlock, { once: true });
    return () => {
      window.removeEventListener("pointerdown", unlock);
      audioContext.current?.close();
    };
  }, []);
  useEffect(() => {
    if (demo) return;
    const cue = state.incoming[0]?.id || session?.status || "";
    if (
      cue &&
      cue !== priorCue.current &&
      audioContext.current?.state === "running"
    ) {
      const ctx = audioContext.current;
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      oscillator.connect(gain);
      gain.connect(ctx.destination);
      oscillator.frequency.value = cue === "paused" ? 360 : 660;
      gain.gain.setValueAtTime(0.045, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.18);
      oscillator.start();
      oscillator.stop(ctx.currentTime + 0.2);
    }
    priorCue.current = cue;
  }, [demo, state.incoming, session?.status]);
  const sessionRef = useRef(session);
  sessionRef.current = session;
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [tab, session?.id, detail?.person.id]);
  const pendingLink = useRef(
    new URLSearchParams(location.search).get("connect"),
  );
  const authNeeded = () => {
    setError("");
    setModal(null);
    setTab("home");
    setAuthStep("phone");
  };
  const notify = (message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice(""), 3500);
  };
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : tr("Something went wrong. Please try again."),
      );
    } finally {
      setBusy(false);
    }
  };
  const stateRequest = useRef(0);
  async function refresh() {
    const request = ++stateRequest.current;
    const s = await api<AppState>("/state");
    if (request === stateRequest.current) {
      setState(s);
      setServerHealthy(true);
    }
    // History is optional here: it must never hide a connection request.
    void api<Conversation[]>("/conversations").then(setHistory).catch(() => {});
  }
  useEffect(() => {
    api<typeof config>("/config")
      .then(setConfig)
      .catch(() => {});
    api<Person>("/me")
      .then((p) => {
        if (p.name) setUser(p);
        else setAuthStep("profile");
        setName(p.name);
        const preferred = localeLanguage[initialLocale()];
        setSpokenLanguages(p.name ? (p.languages || [p.language]) : [preferred]);
        setLanguage(p.name ? p.language : preferred);
        setDemo(false);
      })
      .catch(() => {})
      .finally(() => setAuthReady(true));
    if (pendingLink.current) {
      api<{locale: string}>(`/qr/${encodeURIComponent(pendingLink.current)}`).then(result => setLoginLocale(validLocale(result.locale))).catch(() => {});
      setDemo(false);
      authNeeded();
    }
  }, []);
  useEffect(() => {
    if (demo || !user) return;
    let active = true;
    let controller: AbortController | null = null;
    let historyController: AbortController | null = null;
    const poll = async () => {
      if (controller) return;
      const current = new AbortController();
      controller = current;
      const timeout = window.setTimeout(() => current.abort(), 8000);
      const request = ++stateRequest.current;
      try {
        const s = await api<AppState>("/state", "GET", undefined, current.signal);
        if (active && request === stateRequest.current) {
          setState(s);
          setServerHealthy(true);
        }
      } catch {
        if (active && request === stateRequest.current) {
          setServerHealthy(false);
          room.current?.localParticipant.setMicrophoneEnabled(false).catch(() => {});
        }
      } finally {
        clearTimeout(timeout);
        controller = null;
      }
    };
    const loadHistory = async () => {
      if (historyController) return;
      const current = new AbortController();
      historyController = current;
      const timeout = window.setTimeout(() => current.abort(), 10000);
      try {
        const h = await api<Conversation[]>("/conversations", "GET", undefined, current.signal);
        if (active) setHistory(h);
      } catch { /* Keep the last history while live requests continue independently. */ }
      finally { clearTimeout(timeout); historyController = null; }
    };
    const onVisible = () => { if (document.visibilityState === "visible") void poll(); };
    void poll();
    void loadHistory();
    const id = window.setInterval(poll, 1500);
    const historyId = window.setInterval(loadHistory, 10000);
    // Warm the voice SDK chunk so starting a conversation does not wait on its download.
    const prefetch = window.setTimeout(() => { void import("livekit-client").catch(() => {}); }, 1000);
    window.addEventListener("focus", onVisible);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      active = false;
      controller?.abort();
      historyController?.abort();
      clearInterval(id);
      clearInterval(historyId);
      clearTimeout(prefetch);
      window.removeEventListener("focus", onVisible);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [demo, user?.id]);
  // Incoming consent takes priority over profile, language and scanner sheets.
  useEffect(() => {
    if (!demo && state.incoming.length && !session) {
      setModal(null);
      setCamera(false);
    }
  }, [demo, state.incoming[0]?.id, session?.id]);
  useEffect(() => {
    const id = window.setInterval(() => setTick(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  function clearPlayback() {
    Object.values(playbackTimers.current).forEach(timer => window.clearTimeout(timer));
    playbackTimers.current = {};
    setTranslationPlaying(false);
    setHoldDeferred(false);
  }
  function disconnect() {
    room.current?.disconnect();
    room.current = null;
    audioElements.current.forEach((el) => el.remove());
    audioElements.current = [];
    setTransport("off");
    setIsSpeaking(false);
    setNeedsAudioPlayback(false);
    clearPlayback();
    setEarphones(false);
  }
  useEffect(
    () => () => {
      room.current?.disconnect();
      audioElements.current.forEach((el) => el.remove());
    },
    [],
  );
  useEffect(() => {
    if (!session) {
      disconnect();
      return;
    }
    if (room.current) {
      const activeRoom = room.current;
      const enabled =
        session.status === "listening" &&
        transport === "connected" &&
        serverHealthy;
      const listening = micShouldListen({ active: enabled, translationPlaying, earphones, deferHold: holdDeferred });
      activeRoom.localParticipant
        .setMicrophoneEnabled(listening)
        .then(() => {
          const label = [...activeRoom.localParticipant.audioTrackPublications.values()][0]?.track?.mediaStreamTrack.label;
          if (label) setEarphones(usesEarphones(label));
        })
        .catch(() =>
          setError(tr("Could not change microphone state. Please reconnect.")),
        );
      // Holding the mic during playback must not silence the translation itself.
      audioElements.current.forEach((el) => (el.muted = !enabled));
    }
  }, [session?.id, session?.status, transport, serverHealthy, translationPlaying, holdDeferred, earphones]);
  useEffect(() => {
    if (!user || demo || !pendingLink.current) return;
    const code = pendingLink.current;
    pendingLink.current = null;
    historyReplace();
    run(async () => {
      await api("/requests", "POST", { code });
      await refresh();
      setModal(null);
    });
  }, [user?.id, demo]);
  const incomingQrRequests = state.incoming.map((request) => request.id).join(",");
  useEffect(() => {
    setQr(null);
    setQrError("");
    if (!user || demo || tab !== "home" || session || incomingQrRequests || waitingRequest) return;
    let cancelled = false;
    let inFlight = false;
    let refreshedAt = 0;
    let timer: ReturnType<typeof setTimeout>;
    let request: AbortController | null = null;
    async function generate() {
      if (cancelled || inFlight) return;
      inFlight = true;
      clearTimeout(timer);
      setQrLoading(true);
      request = new AbortController();
      const timeout = setTimeout(() => request?.abort(), 8000);
      try {
        const next = await api<{url: string; code: string; expires_in: number}>("/qr", "POST", { locale: guestLocale }, request.signal);
        if (cancelled) return;
        refreshedAt = Date.now();
        setQr(next);
        setQrIssued(refreshedAt);
        setQrError("");
        // Rotate halfway through validity, leaving time for scanning and sign-in.
        timer = setTimeout(generate, Math.max(1000, next.expires_in * 500));
      } catch {
        if (!cancelled) {
          setQrError(tr("Couldn’t load your QR code. Please try again."));
          timer = setTimeout(generate, 5000);
        }
      } finally {
        clearTimeout(timeout);
        inFlight = false;
        if (!cancelled) setQrLoading(false);
      }
    }
    const wake = () => {
      if (document.visibilityState === 'visible' && Date.now() - refreshedAt >= 60000) void generate();
    };
    const online = () => { void generate(); };
    void generate();
    document.addEventListener('visibilitychange', wake);
    window.addEventListener('focus', wake);
    window.addEventListener('online', online);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      request?.abort();
      document.removeEventListener('visibilitychange', wake);
      window.removeEventListener('focus', wake);
      window.removeEventListener('online', online);
    };
  }, [user?.id, demo, tab, session?.id, incomingQrRequests, qrRetry, guestLocale, waitingRequest?.id]);
  function historyReplace() {
    window.history.replaceState({}, "", location.pathname);
  }
  const close = () => {
    setModal(null);
    setCamera(false);
    setError("");
    previewAudio.current?.pause();
    setPreviewingVoice(null);
  };
  async function previewVoice(voice: string) {
    previewAudio.current?.pause();
    setPreviewingVoice(voice);
    setError("");
    const key = `${voice}:${user?.language}`;
    try {
      let url = previewUrls.current.get(key);
      if (!url) {
        const response = await fetch(`/api/voices/${encodeURIComponent(voice)}/preview`, { method: "POST", credentials: "include" });
        if (!response.ok) throw new Error("preview failed");
        url = URL.createObjectURL(await response.blob());
        previewUrls.current.set(key, url);
      }
      const audio = new Audio(url);
      previewAudio.current = audio;
      audio.onended = () => setPreviewingVoice(current => (current === voice ? null : current));
      await audio.play();
    } catch {
      setPreviewingVoice(null);
      setError("Couldn’t play this voice. Please try again.");
    }
  }
  async function showQr() {
    if (!demo && !user) return authNeeded();
    setModal("qr");
    if (!demo)
      await run(async () => {
        setQr(await api("/qr", "POST", { locale: guestLocale }));
        setQrIssued(Date.now());
      });
  }
  async function submitScannedCode(value: string) {
    setCamera(false);
    let code = value.trim();
    try {
      code = new URL(code).searchParams.get("connect") || code;
    } catch {}
    if (demo) {
      setModal("request");
      return;
    }
    await run(async () => {
      await api("/requests", "POST", { code });
      await refresh();
      close();
    });
  }
  async function connectVoice() {
    if (!session || demo) return;
    await run(async () => {
      setTransport("connecting");
      const [{ Room, RoomEvent, Track }, creds] = await Promise.all([
        import("livekit-client"),
        api<{ url: string; token: string; identity: string }>(
          `/sessions/${session.id}/token`,
          "POST",
        ),
      ]);
      const activeRoom = new Room();
      room.current = activeRoom;
      const restrictMicrophone = () =>
        activeRoom.localParticipant.setTrackSubscriptionPermissions(
          false,
          [...activeRoom.remoteParticipants.values()]
            .filter((p) => p.kind === 4)
            .map((p) => ({ participantIdentity: p.identity, allowAll: true })),
        );
      activeRoom.on(RoomEvent.ParticipantConnected, restrictMicrophone);
      activeRoom.on(RoomEvent.ParticipantDisconnected, restrictMicrophone);
      const subscribe = (p: RemoteTrackPublication, participant: RemoteParticipant) => {
        if (
          participant.kind === 4 && p.kind === Track.Kind.Audio &&
          p.trackName === `translation:${creds.identity}`
        )
          p.setSubscribed(true);
      };
      activeRoom.on(RoomEvent.TrackPublished, subscribe);
      const attachedTracks = new Set<string>();
      activeRoom.on(RoomEvent.TrackSubscribed, (track, publication, participant) => {
        if (room.current !== activeRoom || attachedTracks.has(publication.trackSid)) return;
        if (participant.kind === 4 && track.kind === Track.Kind.Audio && publication.trackName === `translation:${creds.identity}`) {
          attachedTracks.add(publication.trackSid);
          const el = track.attach();
          el.autoplay = true;
          document.body.appendChild(el);
          audioElements.current.push(el);
          el.play().catch(() =>
            setError(tr("Tap Enable audio to allow playback.")),
          );
        }
      });
      activeRoom.on(RoomEvent.TrackUnsubscribed, (track, publication) => {
        attachedTracks.delete(publication.trackSid);
        const detached = track.detach();
        detached.forEach(el => el.remove());
        audioElements.current = audioElements.current.filter(el => !detached.includes(el));
      });
      // The API updates room metadata on pause/resume/end: refresh now instead of on the next poll.
      activeRoom.on(RoomEvent.RoomMetadataChanged, () => {
        if (room.current === activeRoom) void refresh().catch(() => {});
      });
      activeRoom.on(RoomEvent.ActiveSpeakersChanged, speakers => {
        setIsSpeaking(speakers.length > 0);
        // Someone mid-sentence when a translation started is held once they stop.
        if (!speakers.some(p => p.isLocal)) setHoldDeferred(false);
      });
      activeRoom.on(RoomEvent.DataReceived, (payload, participant, _kind, topic) => {
        if (participant?.kind !== 4 || room.current !== activeRoom) return;
        if (topic === "talkeasy.voice-learning") {
          let update: { progress?: number; done?: boolean; failed?: boolean } = {};
          try { update = JSON.parse(new TextDecoder().decode(payload)); } catch { return; }
          if (update.done || update.failed) {
            setLearningProgress(null);
            if (update.done) notify("Your voice is ready. Choose Self in your profile.");
            api<Person>("/me").then(setUser).catch(() => {});
          } else if (typeof update.progress === "number") setLearningProgress(update.progress);
          return;
        }
        if (topic !== PLAYBACK_TOPIC) return;
        const speaking = parsePlayback(payload);
        if (speaking === null) return;
        const timers = playbackTimers.current;
        window.clearTimeout(timers.resume);
        window.clearTimeout(timers.failsafe);
        if (speaking) {
          const midSentence = activeRoom.localParticipant.isSpeaking;
          window.clearTimeout(timers.defer);
          setHoldDeferred(midSentence);
          if (midSentence) timers.defer = window.setTimeout(() => setHoldDeferred(false), MAX_HOLD_DEFERRAL_MS);
          setTranslationPlaying(true);
          timers.failsafe = window.setTimeout(() => setTranslationPlaying(false), MAX_PLAYBACK_HOLD_MS);
        } else {
          timers.resume = window.setTimeout(() => {
            setTranslationPlaying(false);
            setHoldDeferred(false);
          }, MIC_RESUME_DELAY_MS);
        }
      });
      activeRoom.on(RoomEvent.AudioPlaybackStatusChanged, () => {
        setNeedsAudioPlayback(!activeRoom.canPlaybackAudio);
      });
      activeRoom.on(RoomEvent.Reconnecting, () => {
        setTransport("reconnecting");
        activeRoom.localParticipant.setMicrophoneEnabled(false).catch(() => {});
      });
      activeRoom.on(RoomEvent.Reconnected, () => {
        setTransport("connected");
        setError("");
      });
      activeRoom.on(RoomEvent.Disconnected, () => {
        setTransport("off");
        clearPlayback();
        audioElements.current.forEach((el) => el.remove());
        audioElements.current = [];
      });
      try {
        await activeRoom.connect(creds.url, creds.token, {
          autoSubscribe: false,
        });
        restrictMicrophone();
        for (const p of activeRoom.remoteParticipants.values())
          for (const publication of p.trackPublications.values())
            subscribe(publication, p);
        if (sessionRef.current?.id !== session.id) {
          await activeRoom.disconnect();
          return;
        }
        if (sessionRef.current?.status === "listening")
          await activeRoom.localParticipant.setMicrophoneEnabled(true, {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          });
        await activeRoom.startAudio();
        setTransport("connected");
      } catch (e) {
        activeRoom.disconnect();
        room.current = null;
        setTransport("failed");
        throw e;
      }
    });
  }
  async function pause() {
    if (demo) {
      setSample((s) => (s ? { ...s, status: "paused" } : s));
      return;
    }
    room.current?.localParticipant.setMicrophoneEnabled(false);
    audioElements.current.forEach((el) => (el.muted = true));
    await run(async () => {
      await api(`/sessions/${session!.id}/pause`, "POST");
      await refresh();
    });
  }
  async function resume() {
    if (demo) {
      setSample((s) =>
        s ? { ...s, status: "resume-request", resume_by: "you" } : s,
      );
      return;
    }
    await run(async () => {
      await api(`/sessions/${session!.id}/resume`, "POST");
      await refresh();
    });
  }
  async function respondResume(accept: boolean) {
    if (demo) {
      setSample((s) =>
        s
          ? { ...s, status: accept ? "listening" : "paused", resume_by: null }
          : s,
      );
      return;
    }
    await run(async () => {
      await api(`/sessions/${session!.id}/resume/respond`, "POST", { accept });
      await refresh();
    });
  }
  async function end() {
    if (demo) {
      setSample(null);
      notify(tr("Example conversation ended"));
      close();
    } else
      await run(async () => {
        await api(`/sessions/${session!.id}/end`, "POST");
        disconnect();
        setState((current) => ({ ...current, session: null }));
        close();
        notify(tr("Conversation saved to your history"));
        await refresh();
      });
  }
  const list = (demo ? examples : history).slice().sort((a, b) => {
    const latest = (c: Conversation) => Math.max(...c.sessions.map(s => Math.max(s.started, ...s.turns.map(t => t.created))));
    return latest(b) - latest(a);
  });
  const detailTurns = detail ? mergeConversationTurns(detail.sessions) : [];
  const liveTurns = session ? mergeConversationTurns([
    ...(list.find(c => c.person.id === session.peer.id)?.sessions.filter(s => s.id !== session.id) || []),
    session,
  ]) : [];
  const seconds = session
    ? Math.max(0, Math.floor(tick / 1000 - session.started))
    : 0;
  const time = `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
  const isPaused =
    session?.status === "paused" || session?.status === "resume-request";
  const needsMicrophone =
    !demo && !isPaused && transport !== "connected" && transport !== "reconnecting";
  const waitingForResume =
    session?.status === "resume-request" && !demo && session.resume_by === me?.id;
  // Accessible name of the main voice button once it is icon-only.
  const voiceAction = !session || needsMicrophone ? undefined
    : waitingForResume ? tr("Waiting for {value0} to accept…", {value0: session.peer.name})
    : isPaused ? tr("Request resume")
    : translationPlaying ? tr(`Translating ${session.peer.name}…`)
    : tr("Pause listening");
  const qrExpired = qr && tick - qrIssued >= qr.expires_in * 1000;

  function historyRows(items: Conversation[]) {
    return (
      <div className="people-list">
        {items.map((c, i) => {
          const turns = mergeConversationTurns(c.sessions);
          const latest = turns.at(-1);
          return (
          <button
            className="person-row"
            key={c.person.id}
            onClick={() => {
              setSelectedPerson(c.person.id);
              setTab("conversations");
            }}
          >
            <Avatar name={c.person.name} color={i} />
            <span className="person-info">
              <strong>{c.person.name}</strong>
              <span>
                {latest ? `${latest.speaker_id === me?.id ? tr("You: ") : ""}${latest.speaker_id === me?.id ? latest.source : latest.translation}` : tr("No messages yet")}
              </span>
            </span>
            <span className="person-date">
              {dateLabel(latest?.created || c.sessions[0].started, appLocale)}
            </span>
            <ChevronRight size={18} />
          </button>
        ); })}
      </div>
    );
  }
  function transcript(turns: Turn[]) {
    return (
      <div className="transcript">
        {turns.map((t, index) => (
          <Fragment key={t.id}>
          {(index === 0 || new Date(t.created * 1000).toDateString() !== new Date(turns[index - 1].created * 1000).toDateString()) && <div className="chat-date">{dateLabel(t.created, appLocale)}</div>}
          <article
            key={t.id}
            className={`turn ${t.speaker_id === me?.id ? "own" : ""}`}
          >
            <div className="turn-by">
              <span>
                {t.speaker_id === me?.id
                  ? "You"
                  : session?.peer.name || detail?.person.name || "Ananya"}
              </span>
            </div>
            <p
              lang={
                (t.speaker_id === me?.id ? t.source_language : t.target_language) === "Hindi"
                  ? "hi"
                  : (t.speaker_id === me?.id ? t.source_language : t.target_language) === "Kannada"
                    ? "kn"
                    : "en"
              }
            >
              {t.speaker_id === me?.id ? t.source : t.translation}
            </p>
            {Boolean(t.interrupted) && (
              <span className="interrupted">{tr("Playback interrupted")}</span>
            )}
            <time className="message-time" dateTime={new Date(t.created * 1000).toISOString()}>{new Date(t.created * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</time>
          </article>
          </Fragment>
        ))}
      </div>
    );
  }
  useEffect(() => {
    document.documentElement.lang = appLocale;
    document.documentElement.dir = appLocale === 'ar' ? 'rtl' : 'ltr';
  }, [appLocale]);
  useEffect(() => {
    if (user) {
      const savedLocale = languageLocale(user.language);
      setLoginLocale(savedLocale);
      try { localStorage.setItem('ekam.ui-locale', savedLocale); } catch { /* Private browsing can disable storage. */ }
    }
  }, [user?.language]);
  const countryNames = new Intl.DisplayNames([loginLocale], { type: 'region' });
  const onboarding = (
    <section className="onboarding-page" lang={loginLocale} aria-label={copy.signIn}>
      <div className="onboarding-form auth-card">
      <div className="auth-brand"><Brand /></div>
      {authStep === "phone" && <img className="onboarding-photo" src="/login-conversation.jpg" alt={copy.photo} width={5285} height={4217} />}
        {authStep === "phone" && <BrandHeading text={copy.heading} />}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              run(async () => {
                if (authStep === "phone") {
                  if (country === "IN" && phone.length !== 10) throw new Error(copy.indian);
                  if (!/^\+[1-9][0-9]{7,14}$/.test(fullPhone)) throw new Error(copy.phoneError);
                  const r = await api<{ development_code: string | null }>("/auth/otp", "POST", { phone: fullPhone });
                  setDevCode(r.development_code);
                  setAuthStep("otp");
                } else {
                  if (authStep === "profile" && !spokenLanguages.length) throw new Error(copy.choose);
                  if (authStep === "profile" && !gender) throw new Error(translate("Choose your gender to continue.", loginLocale));
                  const p = authStep === "otp"
                    ? await api<Person>("/auth/verify", "POST", { phone: fullPhone, code: otp })
                    : await api<Person>("/profile", "PATCH", { name, language, languages: [language], gender });
                  setOtp("");
                  setDevCode(null);
                  setGender(p.gender ?? null);
                  if (!p.name) {
                    setLanguage(localeLanguage[loginLocale]);
                    setSpokenLanguages([localeLanguage[loginLocale]]);
                    setAuthStep("profile");
                    return;
                  }
                  setUser(p);
                  setName(p.name);
                  setLanguage(p.language);
                  setSpokenLanguages(p.languages || [p.language]);
                  setAuthStep("phone");
                  setDemo(false);
                  close();
                }
              });
            }}
          >
            {authStep === "phone" ? (
              <>
                <label className="input-label" htmlFor="login-phone">{copy.mobile}</label>
                <div className="phone-number-field">
                  <div className="phone-country">
                    <span aria-hidden="true">{dialCode}<ChevronDown size={15} /></span>
                    <select aria-label={copy.country} autoComplete="country" value={country} onChange={e => setCountry(e.target.value)}>
                      {callingCountries.map(([id, label, code]) => <option key={id} value={id}>{countryNames.of(id) || label} ({code})</option>)}
                    </select>
                  </div>
                  <input id="login-phone" autoComplete="tel-national" type="tel" inputMode="numeric" placeholder={country === "IN" ? "98765 43210" : copy.mobile} value={phone} onChange={e => setPhone(e.target.value.replace(/\D/g, ""))} pattern={country === "IN" ? "[0-9]{10}" : "[0-9]{4,14}"} maxLength={15 - dialCode.length + 1} required />
                </div>
              </>
            ) : authStep === "profile" ? (
              <>
                <label className="input-label">{copy.name}
                  <input autoComplete="given-name" placeholder={copy.firstName} value={name} onChange={e => setName(e.target.value)} required maxLength={60} />
                </label>
                <GenderChoice value={gender} onChange={next => { setGender(next); setError(""); }} t={text => translate(text, loginLocale)} />
                <fieldset className="onboarding-languages">
                  <legend>{copy.languages}</legend>
                  <p>{copy.select}</p>
                  <div className="language-choices">
                    {languages.map((l) => (
                      <label key={l} className={language === l ? "language-choice selected" : "language-choice"}>
                        <input type="radio" name="profile-language" value={l} checked={language === l} onChange={() => {
                          setSpokenLanguages([l]);
                          setLanguage(l);
                          setLoginLocale(languageLocale(l));
                        }} />
                        <span><strong>{languageNative[l]}</strong><small>{new Intl.DisplayNames([loginLocale], {type: "language"}).of(Object.entries(localeLanguage).find(([, value]) => value === l)![0])}</small></span>
                        <Check size={16} aria-hidden="true" />
                      </label>
                    ))}
                  </div>
                </fieldset>


              </>
            ) : (
              <>
                <label className="input-label">
                  {copy.code}
                  <input
                    className="otp-input"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    value={otp}
                    onChange={(e) =>
                      setOtp(e.target.value.replace(/\D/g, "").slice(0, otpLength))
                    }
                    pattern={`[0-9]{${otpLength}}`}
                    maxLength={otpLength}
                    required
                    placeholder={"0".repeat(otpLength)}
                  />
                </label>
                {devCode && (
                  <p className="dev-code">
                    {copy.test}
                    <br />
                    {copy.testCode} <strong>{devCode}</strong>
                  </p>
                )}

              </>
            )}
          <p className="privacy-copy">
            <LockKeyhole size={18} />
            {copy.privacy}
          </p>
          {error && (
            <p role="alert" className="form-error">
              {loginLocale === "en" || Object.values(copy).includes(error) || error === translate("Choose your gender to continue.", loginLocale) ? error : /code|expired/i.test(error) ? copy.invalidCode : copy.error}
            </p>
          )}
            <button className="button primary full" disabled={busy || (authStep === "profile" && !spokenLanguages.length)}>
              {busy ? (
                <LoaderCircle className="spin" size={18} />
              ) : (
                <>
                  {authStep === "phone"
                    ? copy.send
                    : authStep === "otp" ? copy.verify : copy.finish}
                  <ArrowRight size={18} />
                </>
              )}
            </button>
          </form>


      </div>
    </section>
  );
  return (
    <AppLocale.Provider value={appLocale}><div className={user ? "app-frame" : "app-frame onboarding-frame"}>
      {user && <header className="app-header">
        <div className="brand-heading">
        <button
          className="brand-button"
          aria-label={tr("Ekam Home")}
          onClick={() => {
            setTab("home");
            setSelectedPerson(null);
          }}
        >
          <Brand />
        </button>
        </div>
        {user && <div className="header-right">
          <button
            className="profile-button"
            aria-label={tr("Open profile")}
            onClick={() => {
              // Start from the saved profile, discarding edits from a previously closed sheet.
              setName(user?.name || "");
              if (user) setLanguage(user.language);
              setGender(user?.gender ?? null);
              const offered = voiceOptions ? [...voiceOptions.female, ...voiceOptions.male, ...(user?.own_voice ? ["self"] : [])] : [];
              setVoiceDraft(
                (user?.voice && (!voiceOptions || offered.includes(user.voice)) && user.voice)
                  || (user?.gender && voiceOptions?.defaults?.[user.gender]) || voiceOptions?.default || "shubh");
              if (!voiceOptions)
                api<VoiceOptions>("/voices")
                  .then(options => {
                    // Show the picker only for a well-formed voice list.
                    if (Array.isArray(options?.female) && Array.isArray(options?.male)) setVoiceOptions(options);
                  })
                  .catch(() => {});
              setModal("profile");
            }}
          >
            <Avatar name={me?.name || "You"} />
          </button>
        </div>}
      </header>}
      {!serverHealthy && !demo && (
        <div role="alert" className="error-banner">
          {session ? tr("Connection lost. Your microphone is paused until Ekam reconnects.") : tr("Reconnecting…")}{" "}</div>
      )}
      {error && !modal && user && (
        <div role="alert" className="error-banner">
          {tr(error)}
          <button
            className="icon-button"
            aria-label={tr("Dismiss error")}
            onClick={() => setError("")}
          >
            <X size={16} />
          </button>
        </div>
      )}
      <main>
        {!authReady ? <div className="auth-loading" role="status"><LoaderCircle className="spin" size={24} />{copy.loading}</div> : !user && !demo ? onboarding : session ? (
          <section className="session-view">
            <div className="session-top">
              <button className="text-button" onClick={() => setModal("end")}>
                <ArrowLeft size={18} /> {tr("Conversation")}{" "}</button>
              <span className="session-clock">
                <Clock3 size={14} />
                {time}
              </span>
            </div>
            <div className="session-heading">
              <div className="paired-avatars">
                <Avatar name={me?.name || "You"} />
                <Avatar name={session.peer.name} color={1} />
              </div>
              <h1>{tr("You and {name}", {name: session.peer.name})}</h1>
              {!demo && user ? <>
                <button className="language-selector language-picker-trigger session-language-picker" type="button" aria-label={tr("Choose your spoken languages")} onClick={() => {
                  const current = session.a === user.id ? session.language_a : session.language_b;
                  setLanguageDraft([current]);
                  setActiveLanguageDraft(current);
                  setError("");
                  setModal("languages");
                }}>
                  <span className="language-icon"><LanguageGlyph language={session.a === user.id ? session.language_a : session.language_b} /></span>
                  <span className="language-summary"><span className="field-caption">{tr("I speak", undefined, user.gender)}</span><strong>{languageNative[session.a === user.id ? session.language_a : session.language_b]}</strong></span>
                  <ChevronDown size={19} aria-hidden="true" />
                </button>
                <p className="session-peer-language">{session.peer.name} · {tr("Speaks {language}", {language: languageNative[session.a === user.id ? session.language_b : session.language_a]}, session.peer.gender)}</p>
              </> : <p>{languageNative[language]} ↔ {languageNative[session.peer.language]}</p>}
            </div>
            {!demo && transport === "connected" && needsAudioPlayback && (
              <button
                className="text-button small audio-playback-button"
                onClick={() => room.current?.startAudio()}
              >
                {tr("Enable audio playback")}
              </button>
            )}
            {!demo && user?.voice_learning && transport === "connected" && (
              <p className="voice-learning-note" role="status">
                <Mic size={15} aria-hidden="true" />
                {tr("Learning your voice…")}
                {learningProgress !== null && <strong>{Math.round(learningProgress * 100)}%</strong>}
              </p>
            )}
            <div className="transcript-heading">
              <h2>{tr("Conversation")}</h2>
              <span>{demo ? tr("Sample transcript") : tr("Live transcript")}</span>
            </div>
            {liveTurns.length > 0 && transcript(liveTurns)}
            {/* One "Enable microphone" button; once voice is connected it splits into two
                equal icon buttons, Pause/Resume and End. Only a state that needs you to act
                is blue; the full action is the accessible name. */}
            <div className={`session-controls${needsMicrophone ? " single" : ""}`}>
              <button
                className={`button ${needsMicrophone || (isPaused && !waitingForResume) ? "primary" : "secondary"} voice-main`}
                disabled={busy || session.status === "resume-request"}
                onClick={needsMicrophone ? connectVoice : isPaused ? resume : pause}
                aria-label={voiceAction}
                title={voiceAction}
              >
                {needsMicrophone ? <Mic size={20} aria-hidden="true" />
                  : waitingForResume ? <LoaderCircle size={20} className="spin" aria-hidden="true" />
                  : isPaused ? <Play size={20} aria-hidden="true" />
                  : <Pause size={20} aria-hidden="true" />}
                {needsMicrophone && (
                  <span className="voice-main-label">{busy ? tr("Connecting…") : tr("Enable microphone")}</span>
                )}
                {/* A small live level, only while someone is actually speaking. */}
                {!needsMicrophone && !isPaused && (demo || (transport === "connected" && serverHealthy && isSpeaking)) && (
                  <Wave bars={5} />
                )}
              </button>
              <button
                className="button danger voice-end"
                aria-label={tr("End conversation")}
                title={tr("End conversation")}
                onClick={() => setModal("end")}
              >
                <PhoneOff size={20} />
              </button>
            </div>
            <p className="session-footnote">
              <ShieldCheck size={14} />{" "}
              {demo
                ? tr("No microphone is used in this preview.")
                : user?.voice_learning
                  ? tr("Recording your voice to learn it. Deleted after learning.")
                  : tr("No audio recordings. Text history only.")}
            </p>
          </section>
        ) : waitingRequest ? (
          <section
            className="connection-waiting"
            role="status"
            aria-label={tr("Waiting for {name} to accept. Request expires in {seconds}s.", {name: waitingRequest.peer.name, seconds: Math.max(0, Math.ceil(waitingRequest.expires - tick / 1000))})}
          >
            {/* Until the request is accepted, only the headphones advice is shown. */}
            <span className="headphones-art" aria-hidden="true">
              <Smartphone size={84} strokeWidth={1.5} />
              <Headphones size={52} strokeWidth={1.8} />
            </span>
            <p>{tr("Put on your headphones for a better experience")}</p>
          </section>
        ) : tab === "home" ? (
          <section className="home-view">
            <div className="home-grid">
              <div className="connect-area">
                {user && <button className="language-selector language-picker-trigger" type="button" aria-label={tr("Choose your spoken languages")} onClick={() => {
                  setLanguageDraft([user.language]);
                  setActiveLanguageDraft(user.language);
                  setError("");
                  setModal("languages");
                }}>
                  <span className="language-icon"><LanguageGlyph language={user.language} /></span>
                  <span className="language-summary">
                    <span className="field-caption">{tr("I speak", undefined, user.gender)}</span>
                    <strong>{languageNative[user.language]}</strong>
                  </span>
                  <ChevronDown size={19} aria-hidden="true" />
                </button>}
                <div className="qr-actions" aria-label={tr("Connect with a QR code")}>
                  <section className="my-qr-panel" aria-label={tr("Your connection QR code")}>
                      {user && !incomingQrRequests && <div className="qr-language-choice">
                          <label htmlFor="guest-language">{tr("Their language")}</label>
                          <div className="qr-language-field">
                          <LanguageGlyph language={localeLanguage[guestLocale]} className="qr-language-symbol" />
                          <select id="guest-language" value={guestLocale} onChange={e => { setGuestLocale(e.target.value as Locale); setQrRetry(v => v + 1); }}>
                            {(Object.keys(localeNames) as Locale[]).map(locale => <option key={locale} value={locale}>{localeNames[locale]}{locale !== 'en' ? ` · ${localeLanguage[locale]}` : ''}</option>)}
                          </select>
                          <ChevronDown size={18} aria-hidden="true" className="qr-language-chevron" />
                          </div>
                        </div>}
                    {!user ? (
                      <div className="my-qr-signin">
                        <QrCode size={48} aria-hidden="true" />
                        <button className="button primary" onClick={authNeeded}>{tr("Sign in to show your QR")}</button>
                      </div>
                    ) : incomingQrRequests ? (
                      <p role="status">{tr("Respond to your connection request to continue.")}</p>
                    ) : (
                      <div className="qr-card">
                        <OneLineHeading className="qr-scan-prompt" lang={guestLocale} dir={guestLocale === 'ar' ? 'rtl' : 'ltr'} text={scanPrompt[guestLocale]} />
                        <div className="qr-frame">
                          {["top-start", "top-end", "bottom-start", "bottom-end"].map(corner => <span key={corner} className={`qr-corner ${corner}`} aria-hidden="true" />)}
                          <div className="qr-tile">
                            {qr && !qrExpired && !qrLoading ? (
                              <div className="my-qr-code">
                                <QRCodeSVG value={qr.url} size={224} marginSize={2} level="M"
                                  fgColor="#17284d" bgColor="#ffffff" title={tr("Your connection QR code")} />
                              </div>
                            ) : qrError ? (
                              <div className="my-qr-signin">
                                <p role="alert">{qrError}</p>
                                <button className="button secondary" onClick={() => setQrRetry(v => v + 1)}>{tr("Try again")}</button>
                              </div>
                            ) : (
                              <div className="my-qr-loading" role="status"><LoaderCircle className="spin" size={28} />{tr("Loading your QR…")}</div>
                            )}
                          </div>
                        </div>
                        <div className="qr-card-footer">
                          <div className="qr-card-owner">
                            <strong>{user.name}</strong>
                            {/* Read by the visitor, like the scan prompt: use their language. */}
                            <span lang={guestLocale} dir={guestLocale === 'ar' ? 'rtl' : 'ltr'}>
                              {translate("Speaks {language}", guestLocale, {language: languageNameIn(user.language, guestLocale)}, user.gender)}
                            </span>
                          </div>
                          <button type="button" className="qr-refresh-button" disabled={qrLoading} onClick={() => setQrRetry(v => v + 1)}
                            aria-label={tr("Refresh QR")} title={tr("Refresh QR")}>
                            <RefreshCw size={18} className={qrLoading ? "spin" : ""} aria-hidden="true" />
                          </button>
                        </div>
                      </div>
                    )}
                  </section>
                </div>

              </div>
            </div>
          </section>
        ) : (
          <section className="history-view">
            {detail ? (
              <>
                <button
                  className="text-button back"
                  onClick={() => {
                    setSelectedPerson(null);
                  }}
                >
                  <ArrowLeft size={18} />
                  {tr("Conversations")}{" "}</button>
                <div className="history-person">
                  <Avatar name={detail.person.name} large />
                  <div>
                    <h1>{detail.person.name}</h1>
                    <p>{detail.person.language}</p>
                  </div>
                </div>
                {detailTurns.length ? transcript(detailTurns) : (
                  <div className="empty-history"><MessageCircle /><p>{tr("No messages yet.")}</p></div>
                )}
                <p className="privacy-line">
                  <LockKeyhole size={14} /> {tr("Text only. No audio recordings.")}{" "}</p>
              </>
            ) : (
              <>
                <h1>{tr("Conversations")}</h1>
                {demo && (
                  <div className="example-note">
                    <Sparkles size={16} /> {tr("Example conversations for the design preview")}{" "}</div>
                )}
                {list.length ? (
                  historyRows(list)
                ) : (
                  <div className="empty-history">
                    <MessageCircle size={36} />
                    <h2>{tr("Your first conversation is ahead.")}</h2>
                    <p>{tr("Scan someone’s QR code to start talking.")}</p>
                    <button
                      className="button primary"
                      onClick={() => setTab("home")}
                    >
                      {tr("Go to Home")}{" "}<ArrowRight size={18} />
                    </button>
                  </div>
                )}
                <p className="history-retention">
                  {tr("Text history is kept for {days} days.", {days: config.retention_days})}</p>
              </>
            )}
          </section>
        )}
      </main>
      {!session && !waitingRequest && user && (
        <nav className="bottom-nav" aria-label={tr("Main navigation")}>
          <button
            className={tab === "home" ? "active" : ""}
            aria-current={tab === "home" ? "page" : undefined}
            onClick={() => {
              setTab("home");
              setSelectedPerson(null);
            }}
          >
            <Home size={21} />
            <span>{tr("Home")}</span>
          </button>
          <button
            type="button"
            className="nav-scan"
            onClick={() => {
              setModal("scan");
              setError("");
            }}
          >
            <span className="nav-scan-icon"><QrCode size={22} strokeWidth={1.9} aria-hidden="true" /></span>
            <span>{tr("Scan QR")}</span>
          </button>
          <button
            className={tab === "conversations" ? "active" : ""}
            aria-current={tab === "conversations" ? "page" : undefined}
            onClick={() => {
              setTab("conversations");
              setSelectedPerson(null);
            }}
          >
            <MessageCircle size={21} />
            <span>{tr("Conversations")}</span>
          </button>
        </nav>
      )}
      {notice && (
        <div className="toast" role="status">
          <Check size={17} />
          {tr(notice)}
        </div>
      )}
      {session?.status === "resume-request" && (demo || session.resume_by !== me?.id) && (
        <Sheet
          title={tr("{name} would like to resume.", {name: session.peer.name})}
          close={() => void respondResume(false)}
        >
          <div className="request-person">
            <Avatar name={session.peer.name} large />
            <h3>{session.peer.name}</h3>
          </div>
          {demo && <p className="muted center">{tr("Demo: Ananya receives your resume request.")}</p>}
          <div className="button-row">
            <button
              className="button secondary"
              disabled={busy}
              onClick={() => respondResume(false)}
            >
              {tr("Decline")}
            </button>
            <button
              className="button primary"
              disabled={busy}
              onClick={() => respondResume(true)}
            >
              {demo ? tr("Simulate accept") : tr("Accept")}
            </button>
          </div>
        </Sheet>
      )}
      {!demo && state.incoming.length > 0 && !session && (
        <Sheet
          title={tr("Someone wants to connect")}
          close={() =>
            run(async () => {
              await api(`/requests/${state.incoming[0].id}/respond`, "POST", {
                accept: false,
              });
              await refresh();
            })
          }
        >
          <div className="request-person">
            <Avatar name={state.incoming[0].peer.name} large />
            <h3>{state.incoming[0].peer.name}</h3>
            <p>{tr("Speaks {language}", {language: languageNative[state.incoming[0].peer.language]}, state.incoming[0].peer.gender)}</p>
          </div>
          <p className="muted center">
            {tr("Accept to start a conversation. Your phone number stays private.")}{" "}</p>
          <div className="button-row">
            <button
              className="button secondary"
              disabled={busy}
              onClick={() =>
                run(async () => {
                  await api(
                    `/requests/${state.incoming[0].id}/respond`,
                    "POST",
                    { accept: false },
                  );
                  await refresh();
                })
              }
            >
              {tr("Decline")}{" "}</button>
            <button
              className="button primary"
              disabled={busy}
              onClick={() =>
                run(async () => {
                  await api(
                    `/requests/${state.incoming[0].id}/respond`,
                    "POST",
                    { accept: true },
                  );
                  await refresh();
                })
              }
            >
              {tr("Accept")}{" "}</button>
          </div>
          {error && (
            <p role="alert" className="form-error">
              {tr(error)}
            </p>
          )}
        </Sheet>
      )}
      {!demo &&
        !session &&
        state.outgoing &&
        state.outgoing.status === "expired" && (
          <div className="request-outcome" role="status">
            {tr("Your connection request expired. Scan a fresh QR to try again.")}{" "}</div>
        )}
      {modal === "qr" && (
        <Sheet title={tr("Your connection code")} close={close}>
          <p className="muted center">
            {tr("Ask the other person to scan this.")}{" "}<br />
            {tr("You’ll choose whether to accept.")}{" "}</p>
          <div className="qr-display">
            {demo ? (
              <QRCodeSVG
                value="Ekam design preview — use the sample conversation"
                size={200}
                fgColor="#17284d"
              />
            ) : qr && !qrExpired ? (
              <QRCodeSVG value={qr.url} size={200} fgColor="#17284d" />
            ) : busy ? (
              <LoaderCircle className="spin" />
            ) : (
              <button className="button primary" onClick={showQr}>
                <RefreshCw size={17} /> {tr("Generate new QR")}{" "}</button>
            )}
          </div>
          {demo ? (
            <p className="example-note">
              {tr("Preview QR · does not connect devices")}{" "}</p>
          ) : (
            qr &&
            !qrExpired && (
              <>
                <p className="center muted small">
                  {tr("Expires in")}{" "}
                  {Math.max(
                    0,
                    Math.ceil(
                      (qr.expires_in * 1000 - (tick - qrIssued)) / 1000,
                    ),
                  )}{" "}
                  {tr("seconds")}{" "}</p>
              </>
            )
          )}
          <p className="privacy-line">
            <LockKeyhole size={14} /> {tr("Your phone number is never in this code.")}{" "}</p>
          {error && (
            <p role="alert" className="form-error">
              {tr(error)}
            </p>
          )}
        </Sheet>
      )}
      {modal === "scan" && (
        <Sheet title={tr("Scan QR")} close={close}>
          {demo ? (
            <>
              <div className="demo-scanner">
                <ScanLine size={90} strokeWidth={1} />
                <span>{tr("Scanner preview")}</span>
              </div>
              <p className="muted center">
                {tr("In the live app, point your camera at the other person’s code.")}{" "}</p>
              <button
                className="button primary full"
                onClick={() => setModal("request")}
              >
                {tr("Try a sample request")}{" "}<ArrowRight size={18} />
              </button>
            </>
          ) : (
            <>
              {camera ? (
                <CameraScanner
                  onScan={(value) => submitScannedCode(value)}
                  onError={setError}
                />
              ) : (
                <button
                  className="camera-start"
                  onClick={() => setCamera(true)}
                >
                  <Camera size={35} />
                  <strong>{tr("Open camera")}</strong>
                  <span>{tr("Camera access is only used to scan a QR code.")}</span>
                </button>
              )}
            </>
          )}
          {error && (
            <p role="alert" className="form-error">
              {tr(error)}
            </p>
          )}
        </Sheet>
      )}
      {modal === "request" && (
        <Sheet title={tr("A new conversation")} close={close}>
          <p className="example-note">{tr("Sample incoming request")}</p>
          <div className="request-person">
            <Avatar name="Ananya" color={1} large />
            <h3>{tr("Ananya wants to connect")}</h3>
            <p>{tr("Speaks हिन्दी · Hindi")}</p>
          </div>
          <p className="muted center">
            {tr("You’ll hear each other in your own language.")}{" "}</p>
          <div className="button-row">
            <button
              className="button secondary"
              onClick={() => {
                close();
                notify(tr("Sample request declined"));
              }}
            >
              {tr("Decline")}{" "}</button>
            <button
              className="button primary"
              onClick={() => {
                setSample(makeSample());
                close();
              }}
            >
              {tr("Accept")}{" "}<Check size={18} />
            </button>
          </div>
        </Sheet>
      )}
      {modal === "end" && (
        <Sheet title={tr("End this conversation?")} close={close}>
          <p className="muted">
            {tr("Your text history will stay in Conversations. To talk again, you’ll need to scan a new QR code.")}{" "}</p>
          <div className="button-row">
            <button className="button secondary" onClick={close}>
              {tr("Keep talking")}{" "}</button>
            <button className="button danger" disabled={busy} onClick={end}>
              <PhoneOff size={17} />
              {tr("End conversation")}{" "}</button>
          </div>
          {error && (
            <p role="alert" className="form-error">
              {tr(error)}
            </p>
          )}
        </Sheet>
      )}
      {modal === "languages" && user && (
        <Sheet title={tr("Your language")} close={close}>
          <p className="muted">{tr("Choose one language. Ekam will use it for your app and conversations.")}</p>
          <form onSubmit={e => {
            e.preventDefault();
            run(async () => {
              if (!languageDraft.length) throw new Error(tr("Select at least one language."));
              const p = session
                ? await api<Person>(`/sessions/${session.id}/language`, "PATCH", {language: activeLanguageDraft})
                : await api<Person>("/profile", "PATCH", { name: user.name, language: activeLanguageDraft, languages: [activeLanguageDraft] });
              if (session) await refresh();
              setUser(p);
              setLanguage(p.language);
              setSpokenLanguages(p.languages || [p.language]);
              close();
            });
          }}>
            <fieldset className="onboarding-languages">
              <legend>{tr("Your language")}</legend>
              <div className="language-choices">
                {languages.map(l => <label key={l} className={languageDraft.includes(l) ? "language-choice selected" : "language-choice"}>
                  <input type="radio" name="app-language" value={l} checked={activeLanguageDraft === l} onChange={() => {
                    setLanguageDraft([l]);
                    setActiveLanguageDraft(l);
                  }} />
                  <span><strong>{languageNative[l]}</strong><small>{l}</small></span><Check size={16} aria-hidden="true" />
                </label>)}
              </div>
            </fieldset>

            {error && <p role="alert" className="form-error">{tr(error)}</p>}
            <button className="button primary full" disabled={busy || !languageDraft.length}>{busy ? <LoaderCircle className="spin" size={18} /> : tr("Save language")}</button>
          </form>
        </Sheet>
      )}
      {modal === "profile" && (
        <Sheet title={tr("Your profile")} close={close} fullScreen>
          {demo ? (
            <>
              <div className="request-person">
                <Avatar name="You" large />
                <h3>{tr("Make yourself understood.")}</h3>
                <p>{tr("Sign in to connect with people nearby.")}</p>
              </div>
              <button
                className="button primary full"
                onClick={() => {
                  setDemo(false);
                  authNeeded();
                }}
              >
                {tr("Set up your profile")}{" "}<ArrowRight size={18} />
              </button>
            </>
          ) : user ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                run(async () => {
                  const p = await api<Person>("/profile", "PATCH", {
                    name,
                    language,
                    languages: [language],
                    ...(gender ? { gender } : {}),
                    ...(voiceOptions && ((voiceDraft === "self" && user.own_voice) || !gender || voiceOptions[gender].includes(voiceDraft)) ? { voice: voiceDraft } : {}),
                  });
                  setUser(p);
                  setSpokenLanguages([p.language]);
                  notify(tr("Profile updated"));
                  close();
                });
              }}
            >
              <label className="input-label">
                {tr("Your name")}{" "}<input
                  value={name}
                  maxLength={60}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </label>
              <label className="input-label">
                {tr("Your language")}{" "}<select
                  value={language}
                  onChange={(e) => setLanguage(e.target.value as Language)}
                  // During a conversation its language is changed from the conversation screen.
                  disabled={!!session}
                >
                  {languages.map((l) => (
                    <option key={l} value={l}>{languageNative[l]}</option>
                  ))}
                </select>
              </label>
              <GenderChoice
                value={gender}
                t={text => tr(text)}
                onChange={next => {
                  setGender(next);
                  // Keep the chosen voice only if it matches; otherwise use that gender's default.
                  if (voiceOptions && voiceDraft !== "self" && !voiceOptions[next].includes(voiceDraft))
                    setVoiceDraft(voiceOptions.defaults?.[next] ?? voiceOptions[next][0]);
                }}
              />
              {voiceOptions && (
                <fieldset className="voice-picker">
                  <legend>{tr("Your voice")}</legend>
                  <p className="voice-hint">{tr("The voice the other person hears for your translated words.")}</p>
                  {user.own_voice && (
                    <div className="voice-group">
                      <div className="voice-options">
                        <label className={`voice-option voice-option-self${voiceDraft === "self" ? " selected" : ""}`}>
                          <input type="radio" name="voice" value="self" checked={voiceDraft === "self"}
                            onChange={() => setVoiceDraft("self")} onClick={() => void previewVoice("self")} />
                          <span>{tr("Self")}</span>
                          {previewingVoice === "self" && <Volume2 size={15} aria-hidden="true" />}
                        </label>
                      </div>
                    </div>
                  )}
                  {(gender ? [gender] : (["female", "male"] as const)).map(group => (
                    <div className="voice-group" key={group}>
                      {!gender && <span className="voice-group-label">{tr(group === "female" ? "Female" : "Male")}</span>}
                      <div className="voice-options">
                        {voiceOptions[group].map(voice => (
                          <label key={voice} className={`voice-option${voiceDraft === voice ? " selected" : ""}`}>
                            {/* Selecting a voice, or tapping the selected one again, plays a sample. */}
                            <input
                              type="radio"
                              name="voice"
                              value={voice}
                              checked={voiceDraft === voice}
                              onChange={() => setVoiceDraft(voice)}
                              onClick={() => void previewVoice(voice)}
                            />
                            <span>{voice[0].toUpperCase() + voice.slice(1)}</span>
                            {previewingVoice === voice && <Volume2 size={15} aria-hidden="true" />}
                          </label>
                        ))}
                      </div>
                    </div>
                  ))}
                  {user.own_voice ? (
                    <button type="button" className="text-button voice-remove" disabled={busy} onClick={() => run(async () => {
                      const p = await api<Person>("/voice-clone/remove", "POST");
                      setUser(p);
                      if (voiceDraft === "self") setVoiceDraft((p.gender && voiceOptions.defaults?.[p.gender]) || voiceOptions.default);
                      notify("Your voice was removed.");
                    })}>
                      {tr("Remove my voice")}
                    </button>
                  ) : config.voice_cloning && (
                    <label className="voice-learning-toggle">
                      <input type="checkbox" role="switch" checked={!!user.voice_learning} disabled={busy} onChange={e => {
                        const enabled = e.target.checked, previous = user;
                        // Reflect the tap immediately; undo it if saving fails.
                        setUser({ ...user, voice_learning: enabled });
                        run(async () => {
                          try { setUser(await api<Person>("/voice-learning", "POST", { enabled })); }
                          catch (error) { setUser(previous); throw error; }
                        });
                      }} />
                      <span>
                        <strong>{tr("Learn my voice")}</strong>
                        <small>{tr("In your next conversation, Ekam records about 45 seconds of your own speech to create a private copy of your voice. The recording is deleted once your voice is ready.")}</small>
                      </span>
                    </label>
                  )}
                </fieldset>
              )}
              <button
                className="button primary full"
                disabled={busy}
              >
                {tr("Save changes")}{" "}</button>
              <button
                type="button"
                className="text-button logout"
                onClick={() =>
                  run(async () => {
                    await api("/auth/logout", "POST");
                    disconnect();
                    setUser(null);
                    setAuthStep("phone");
                    setOtp("");
                    setDevCode(null);
                    setName("");
                    setPhone("");
                    setTab("home");
                    setState({ incoming: [], outgoing: null, session: null });
                    setHistory([]);
                    close();
                  })
                }
              >
                <LogOut size={17} /> {tr("Sign out")}{" "}</button>
            </form>
          ) : (
            <button className="button primary full" onClick={authNeeded}>
              {tr("Sign in")}{" "}</button>
          )}
          <p className="privacy-copy">
            <ShieldCheck size={18} />
            {tr("We will never share your phone number with the person you’re talking to.")}{" "}</p>
          {error && (
            <p role="alert" className="form-error">
              {tr(error)}
            </p>
          )}
        </Sheet>
      )}

    </div></AppLocale.Provider>
  );
}
