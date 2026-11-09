import { api } from '@/lib/api/client';
import type { Language } from '@/lib/engine/types';

/** Creates a race room. Auth is optional. The client then opens the socket and joins by id. */
export function createRace(language: Language): Promise<{ id: string }> {
  return api<{ id: string }>('/races', { method: 'POST', body: { language } });
}
