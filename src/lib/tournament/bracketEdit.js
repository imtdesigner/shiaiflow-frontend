// Bracket editor helpers (owner, 2026-11-07): organizers adjust the KO
// template of a category by hand — swap slots (which pool place goes where,
// or move a preliminary fight by swapping its W ref) or type a slot code.
// Templates stay in the stored form: { no, red, white } with pool codes '021'
// and winner refs 'W03'.

import {
  isWinnerRef, leaves, poolCode, validateTemplate, winnerRefNo,
} from './ko.js';

const pad = (n) => String(n).padStart(2, '0');

/**
 * Typed slot → stored code: 'P2.1' → '021', '#5' → '051' (direct KO),
 * 'W3' / 'W03' → 'W03'. Returns null when it cannot be read.
 */
export function parseSlotInput(text) {
  const t = String(text ?? '').trim().toUpperCase().replace(/\s+/g, '');
  let m = t.match(/^P(\d{1,2})\.([12])$/);
  if (m) return poolCode(Number(m[1]), Number(m[2]));
  m = t.match(/^#(\d{1,2})$/);
  if (m) return poolCode(Number(m[1]), 1);
  m = t.match(/^W(\d{1,2})$/);
  if (m) return `W${pad(Number(m[1]))}`;
  return null;
}

const clone = (template) => template.map((m) => ({ ...m }));

/** Swap two slots, each { no, side: 'red' | 'white' }. */
export function swapSlots(template, a, b) {
  const next = clone(template);
  const ma = next.find((m) => m.no === a.no);
  const mb = next.find((m) => m.no === b.no);
  if (!ma || !mb) return template;
  [ma[a.side], mb[b.side]] = [mb[b.side], ma[a.side]];
  return next;
}

/** Put a code into a slot; if the code is already used elsewhere, the two swap. */
export function setSlot(template, slot, code) {
  const other = template.flatMap((m) => [
    { no: m.no, side: 'red', code: m.red }, { no: m.no, side: 'white', code: m.white },
  ]).find((s) => s.code === code && !(s.no === slot.no && s.side === slot.side));
  if (other) return swapSlots(template, slot, other);
  const next = clone(template);
  const m = next.find((x) => x.no === slot.no);
  if (m) m[slot.side] = code;
  return next;
}

/**
 * After an edit a W ref may point to a later fight. Renumber fights so every
 * W ref points to an earlier one (deepest rounds first, bracket order within a
 * round, final last) — only when needed, so untouched templates keep their
 * Excel numbering. Returns { template, error }.
 */
export function normalizeTemplate(template) {
  const byNo = new Map(template.map((m) => [m.no, m]));
  const referenced = new Set(template.flatMap((m) => [m.red, m.white]).filter(isWinnerRef).map(winnerRefNo));
  const roots = template.filter((m) => !referenced.has(m.no));
  if (roots.length !== 1) return { template, error: 'The bracket must end in exactly one final.' };

  // cycle check + depth from the final
  const depth = new Map();
  const visiting = new Set();
  let cycle = false;
  const walk = (no, d) => {
    if (visiting.has(no)) { cycle = true; return; }
    if ((depth.get(no) ?? -1) >= d) return;
    depth.set(no, d);
    visiting.add(no);
    const m = byNo.get(no);
    for (const code of [m.red, m.white]) {
      if (isWinnerRef(code) && byNo.has(winnerRefNo(code))) walk(winnerRefNo(code), d + 1);
    }
    visiting.delete(no);
  };
  walk(roots[0].no, 0);
  if (cycle) return { template, error: 'A fight cannot take the winner of a fight that comes after it.' };
  if (depth.size !== template.length) return { template, error: 'Some fights are not connected to the final.' };

  const inOrder = template.every((m, i) => m.no === i + 1
    && [m.red, m.white].every((c) => !isWinnerRef(c) || winnerRefNo(c) < m.no))
    && template[template.length - 1].no === roots[0].no;
  if (inOrder) return { template, error: null };

  const order = leaves(`W${roots[0].no}`, byNo);
  const firstLeaf = (m) => order.indexOf(leaves(m.red, byNo)[0]);
  const sorted = [...template].sort((a, b) => depth.get(b.no) - depth.get(a.no) || firstLeaf(a) - firstLeaf(b));
  const renum = new Map(sorted.map((m, i) => [m.no, i + 1]));
  const ref = (code) => (isWinnerRef(code) ? `W${pad(renum.get(winnerRefNo(code)))}` : code);
  return {
    template: sorted.map((m) => ({ no: renum.get(m.no), red: ref(m.red), white: ref(m.white) })),
    error: null,
  };
}

/**
 * Problems of an edited template: errors block saving (structure), warnings
 * are allowed (winner and runner-up of a pool in the same half).
 */
export function checkTemplate(template, poolCount, advancing) {
  const all = validateTemplate(template, poolCount, advancing);
  return {
    errors: all.filter((p) => !p.includes('same half')),
    warnings: all.filter((p) => p.includes('same half')),
  };
}

/** Exact equality of two templates (same fights, same numbering). */
export const sameTemplate = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
