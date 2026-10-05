import type { Language } from "./session";
export interface Person {
  id: string;
  name: string;
  language: Language;
  languages?: Language[];
  // Sarvam Bulbul voice for this person's translated speech; null means the default.
  voice?: string | null;
  gender?: "male" | "female" | null;
  // Opt-in "Self" voice: learned already, or waiting to be learned in the next conversation.
  own_voice?: boolean;
  voice_learning?: boolean;
}
export interface VoiceOptions {
  default: string;
  defaults?: Record<"male" | "female", string>;
  female: string[];
  male: string[];
}
export interface Turn {
  id: string;
  speaker_id: string;
  source: string;
  translation: string;
  source_language: Language;
  target_language: Language;
  interrupted: boolean;
  created: number;
}
export interface Session {
  id: string;
  a: string;
  b: string;
  status: "listening" | "paused" | "resume-request" | "ended";
  resume_by: string | null;
  started: number;
  ended: number | null;
  epoch: number;
  peer: Person;
  turns: Turn[];
  language_a: Language;
  language_b: Language;
}
export interface ConnectRequest {
  id: string;
  status: string;
  peer: Person;
  expires: number;
}
export interface AppState {
  incoming: ConnectRequest[];
  outgoing: ConnectRequest | null;
  session: Session | null;
}
export interface Conversation {
  person: Person;
  sessions: Session[];
}
export async function api<T>(
  path: string,
  method = "GET",
  body?: unknown,
  signal?: AbortSignal,
): Promise<T> {
  const result = await fetch(`/api${path}`, {
    method,
    signal,
    cache: "no-store",
    credentials: "include",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!result.ok) {
    const payload = await result.json().catch(() => null);
    throw new Error(
      typeof payload?.detail === "string"
        ? payload.detail
        : result.status === 422
          ? "Please check the details you entered."
          : "Unable to reach Ekam. Please try again.",
    );
  }
  return result.json();
}
