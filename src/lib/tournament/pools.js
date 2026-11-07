// Pool creation and pool match order.
// Ported from the DP HKS 2026 Excel system (sheet "combos" A:F, macros
// randompools + SplitIntoPools). The first entry of a pair is AKA (red).

/** Fight order inside a pool, by pool size. Positions are 1-based. */
export const POOL_ORDER = {
  2: [[1, 2]],
  3: [[1, 2], [3, 2], [3, 1]],
  4: [[1, 2], [3, 2], [3, 4], [2, 4], [3, 1], [4, 1]],
  5: [[1, 2], [3, 2], [3, 4], [5, 4], [5, 1], [3, 1], [3, 5], [2, 5], [2, 4], [1, 4]],
  6: [[1, 2], [3, 2], [3, 4], [5, 4], [5, 6], [1, 6], [1, 3], [5, 3], [5, 2], [4, 2],
      [4, 6], [3, 6], [1, 4], [1, 5], [2, 6]],
  7: [[1, 2], [3, 2], [3, 4], [5, 4], [5, 6], [7, 6], [7, 1], [3, 1], [5, 3], [5, 2],
      [2, 6], [4, 6], [4, 7], [5, 7], [5, 1], [4, 1], [4, 2], [2, 7], [3, 7], [3, 6],
      [1, 6]],
  8: [[1, 2], [3, 2], [3, 4], [5, 4], [5, 6], [7, 6], [7, 8], [1, 8], [1, 3], [5, 3],
      [2, 5], [2, 4], [6, 4], [6, 8], [2, 8], [2, 7], [1, 7], [1, 4], [8, 4], [8, 3],
      [6, 3], [6, 1], [5, 1], [5, 7], [4, 7], [6, 2], [5, 8], [3, 7]],
};

/** Deterministic PRNG (mulberry32) so a draw can be reproduced from its seed. */
export function seededRandom(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fisher–Yates shuffle; returns a new array. */
export function shuffle(items, random = Math.random) {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Split entries into consecutive pools of `poolSize` (same as SplitIntoPools):
 * 5 entries with pool size 3 -> [[a,b,c],[d,e]].
 */
export function splitIntoPools(entries, poolSize) {
  if (!Number.isInteger(poolSize) || poolSize < 1) throw new Error('poolSize must be a positive integer');
  const pools = [];
  for (let i = 0; i < entries.length; i += poolSize) pools.push(entries.slice(i, i + poolSize));
  return pools;
}

/**
 * Same pool count as splitIntoPools (ceil(n / poolSize)), but sizes differ by
 * at most one, bigger pools first: 7 entries with pool size 3 -> 3+2+2
 * instead of 3+3+1. Keeps the KO system code unchanged.
 */
export function splitEvenly(entries, poolSize) {
  if (!Number.isInteger(poolSize) || poolSize < 1) throw new Error('poolSize must be a positive integer');
  const count = Math.ceil(entries.length / poolSize);
  const pools = [];
  let start = 0;
  for (let i = 0; i < count; i += 1) {
    const size = Math.floor(entries.length / count) + (i < entries.length % count ? 1 : 0);
    pools.push(entries.slice(start, start + size));
    start += size;
  }
  return pools;
}

/** KO system code: K + pool count (2 digits) + advancing per pool, e.g. K052. */
export function systemCode(poolCount, advancing) {
  return `K${String(poolCount).padStart(2, '0')}${advancing}`;
}

/**
 * Matches of one pool. Returns [{ label: 'F-P1.1', pool: 1, order: 1, red, white }].
 * Labels: F-P1.1 = fight 1 of pool 1 (P1.1 alone means pool 1, 1st place in the KO).
 * `members` is the pool in position order.
 */
export function poolMatches(members, poolNumber) {
  if (members.length < 2) return [];
  const order = POOL_ORDER[members.length];
  if (!order) throw new Error(`No fight order for pool size ${members.length} (supported 2–8)`);
  return order.map(([r, w], i) => ({
    label: `F-P${poolNumber}.${i + 1}`,
    pool: poolNumber,
    order: i + 1,
    red: members[r - 1],
    white: members[w - 1],
  }));
}

/** Every pair meets exactly once — used by tests to guard the tables above. */
export function isRoundRobin(order, size) {
  const seen = new Set();
  for (const [a, b] of order) {
    if (a === b || a < 1 || b < 1 || a > size || b > size) return false;
    const key = a < b ? `${a}-${b}` : `${b}-${a}`;
    if (seen.has(key)) return false;
    seen.add(key);
  }
  return seen.size === (size * (size - 1)) / 2;
}
