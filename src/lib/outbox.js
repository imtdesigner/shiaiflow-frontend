// Offline-safe scoretable (owner, 2026-11-22): every score / timer click is
// written to a queue on the device (localStorage) first and sent in order. A
// network error keeps it in the queue and it is sent again when the
// connection is back (also after a page reload); a server refusal (e.g. no
// rights) drops it with a message. Operations are idempotent: points carry a
// client id, timer changes carry absolute values, undo deletes a known event.
//
// op = { id, kind: 'event' | 'delete' | 'timer', ... }

const NETWORK = /failed to fetch|load failed|networkerror|network request failed|fetch failed|timeout|offline/i;
export const isNetworkError = (e) => (typeof navigator !== 'undefined' && navigator.onLine === false) || NETWORK.test(String(e?.message ?? e));

/**
 * createOutbox({ key, storage, send, onChange, isNetworkError })
 *   send(op) → Promise (throws on failure)
 *   onChange({ size, sending, offline, error })
 */
export function createOutbox({ key, storage, send, onChange = () => {}, networkError = isNetworkError }) {
  let ops = [];
  try { ops = JSON.parse(storage.getItem(key) ?? '[]'); } catch { ops = []; }
  let sending = false;
  let offline = false;
  let error = null;
  let timer = null;

  const save = () => { try { storage.setItem(key, JSON.stringify(ops)); } catch { /* storage full: keep in memory */ } };
  const emit = () => onChange({ size: ops.length, sending, offline, error, ops: [...ops] });

  async function flush() {
    if (sending) return;
    sending = true; emit();
    while (ops.length) {
      try {
        await send(ops[0]);
        ops.shift(); save();
        offline = false; error = null;
      } catch (e) {
        if (networkError(e)) {
          offline = true;
          clearTimeout(timer);
          timer = setTimeout(flush, 3000); // try again in a moment (and on 'online')
          break;
        }
        error = String(e?.message ?? e); // refused by the server: drop it, show why
        ops.shift(); save();
      }
      emit();
    }
    sending = false; emit();
  }

  return {
    push(op) { ops.push(op); save(); emit(); flush(); },
    flush,
    size: () => ops.length,
    pending: () => [...ops],
    stop: () => clearTimeout(timer),
  };
}

/** Fights with the timer changes still waiting in the queue (latest wins). */
export function fightsWithOps(fights, ops) {
  const timer = new Map();
  for (const op of ops) if (op.kind === 'timer') timer.set(op.matchId, op);
  if (!timer.size) return fights;
  return fights.map((f) => {
    const t = timer.get(f.id);
    return t ? { ...f, timer_started_at: t.startedAt, timer_elapsed_ms: t.elapsedMs } : f;
  });
}

/** A fight's events with the points / undos still waiting in the queue. */
export function eventsWithOps(events, ops, matchId) {
  let out = [...events];
  for (const op of ops) {
    if (op.kind === 'event' && op.matchId === matchId && !out.some((e) => e.client_id === op.clientId)) {
      out.push({ id: op.clientId, client_id: op.clientId, bout_id: op.boutId, side: op.side, type: op.type });
    }
    if (op.kind === 'delete' && op.matchId === matchId) {
      out = out.filter((e) => !(op.clientId ? e.client_id === op.clientId : e.id === op.eventId));
    }
  }
  return out;
}
