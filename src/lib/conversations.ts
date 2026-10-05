import type { Session, Turn } from './api';

// Later copies win so live updates replace the same turn from history polling.
export function mergeConversationTurns(sessions: Session[]): Turn[] {
  const turns = new Map<string, Turn>();
  for (const session of sessions) {
    for (const turn of session.turns) turns.set(turn.id, turn);
  }
  return [...turns.values()].sort((a, b) => a.created - b.created || a.id.localeCompare(b.id));
}
