import { test, expect } from '@playwright/test';
import { mergeConversationTurns } from '../src/lib/conversations';
import type { Session, Turn } from '../src/lib/api';

test('merges repeated meetings chronologically and keeps latest live turn updates', () => {
  const turn = (id: string, created: number, translation: string): Turn => ({ id, created, translation, source: 'Hello', speaker_id: 'peer', source_language: 'English', target_language: 'Hindi', interrupted: false });
  const session = (turns: Turn[]) => ({ turns } as Session);
  const merged = mergeConversationTurns([
    session([turn('new', 30, 'old copy')]),
    session([turn('first', 10, 'first'), turn('middle', 20, 'middle')]),
    session([turn('new', 30, 'updated')]),
  ]);
  expect(merged.map(t => t.id)).toEqual(['first', 'middle', 'new']);
  expect(merged[2].translation).toBe('updated');
  expect(mergeConversationTurns([])).toEqual([]);
});
