import { describe, expect, it } from 'vitest';
import {
  EXACT_LIMIT,
  applyTransfers,
  computeBalances,
  minTransferCount,
  settle,
  type Expense,
} from './split';
import { formatCents, parseYuanToCents } from './money';

function expense(
  payer: string,
  amountCents: number,
  participants: string[],
  note = '',
): Expense {
  return {
    id: `${payer}-${amountCents}-${Math.random()}`,
    payer,
    amountCents,
    participants,
    note,
    createdAt: 0,
  };
}

/** Seeded PRNG so the property test is reproducible. */
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Independent brute force: the most zero-sum groups the balances can
 * be partitioned into. Minimum transfers = n - that number. This is a
 * separate implementation from the DP in split.ts, so agreement between
 * the two is real evidence.
 */
function maxZeroSumGroups(balances: number[]): number {
  const n = balances.length;
  const memo = new Map<number, number>();
  function rec(mask: number): number {
    if (mask === 0) return 0;
    const hit = memo.get(mask);
    if (hit !== undefined) return hit;
    const low = mask & -mask;
    let best = 0;
    for (let sub = mask; sub > 0; sub = (sub - 1) & mask) {
      if ((sub & low) === 0) continue;
      let sum = 0;
      for (let i = 0; i < n; i += 1) {
        if ((sub & (1 << i)) !== 0) sum += balances[i];
      }
      if (sum === 0) best = Math.max(best, 1 + rec(mask ^ sub));
    }
    memo.set(mask, best);
    return best;
  }
  return rec((1 << n) - 1);
}

describe('computeBalances', () => {
  it('splits 100.00 among three people with the leftover cent going to the first participant', () => {
    const balances = computeBalances([expense('A', 10000, ['A', 'B', 'C'])]);
    // share 3333, remainder 1 goes to A, so A owes 3334 and paid 10000.
    expect(balances.get('A')).toBe(6666);
    expect(balances.get('B')).toBe(-3333);
    expect(balances.get('C')).toBe(-3333);
  });

  it('handles a payer who is not a participant', () => {
    const balances = computeBalances([expense('A', 10000, ['B', 'C'])]);
    expect(balances.get('A')).toBe(10000);
    expect(balances.get('B')).toBe(-5000);
    expect(balances.get('C')).toBe(-5000);
  });

  it('nets two expenses against each other', () => {
    const balances = computeBalances([
      expense('A', 6000, ['A', 'B']),
      expense('B', 3000, ['A', 'B']),
    ]);
    expect(balances.get('A')).toBe(1500);
    expect(balances.get('B')).toBe(-1500);
  });

  it('dedupes repeated participants and drops blanks', () => {
    const balances = computeBalances([expense('A', 9000, ['A', 'B', 'B', '  ', 'C'])]);
    expect(balances.get('A')).toBe(6000);
    expect(balances.get('B')).toBe(-3000);
    expect(balances.get('C')).toBe(-3000);
  });

  it('rejects a zero amount, a negative amount and an empty participant list', () => {
    expect(() => computeBalances([expense('A', 0, ['A', 'B'])])).toThrow();
    expect(() => computeBalances([expense('A', -100, ['A', 'B'])])).toThrow();
    expect(() => computeBalances([expense('A', 100, [])])).toThrow();
  });
});

describe('settle', () => {
  it('settles a three-way split in two transfers', () => {
    const balances = computeBalances([expense('A', 10000, ['A', 'B', 'C'])]);
    const result = settle(balances);
    expect(result.optimal).toBe(true);
    expect(result.transfers).toHaveLength(2);
    expect(result.transfers).toContainEqual({ from: 'B', to: 'A', amountCents: 3333 });
    expect(result.transfers).toContainEqual({ from: 'C', to: 'A', amountCents: 3333 });
  });

  it('beats greedy on the classic case: +5, +5, -4, -3, -3 needs 4 transfers, not 5', () => {
    const result = settle(
      new Map([
        ['P1', 500],
        ['P2', 500],
        ['D1', -400],
        ['D2', -300],
        ['D3', -300],
      ]),
    );
    expect(result.optimal).toBe(true);
    expect(result.transfers).toHaveLength(4);
    const after = applyTransfers(
      new Map([
        ['P1', 500],
        ['P2', 500],
        ['D1', -400],
        ['D2', -300],
        ['D3', -300],
      ]),
      result.transfers,
    );
    expect([...after.values()].every((v) => v === 0)).toBe(true);
  });

  it('returns no transfers when everyone is already even', () => {
    const result = settle(new Map([['A', 0], ['B', 0]]));
    expect(result.transfers).toEqual([]);
    expect(result.optimal).toBe(true);
  });

  it('settles two people in one transfer', () => {
    const result = settle(new Map([['A', 1000], ['B', -1000]]));
    expect(result.transfers).toEqual([{ from: 'B', to: 'A', amountCents: 1000 }]);
  });

  it('throws when balances do not sum to zero', () => {
    expect(() => settle(new Map([['A', 100], ['B', -50]]))).toThrow(
      'balances must sum to zero',
    );
  });

  it('uses the exact search at the limit and greedy beyond it', () => {
    const fifteen = new Map<string, number>();
    for (let i = 0; i < 8; i += 1) fifteen.set(`C${i}`, 100);
    for (let i = 0; i < 6; i += 1) fifteen.set(`D${i}`, -100);
    fifteen.set('D6', -200);
    expect([...fifteen.values()].reduce((a, b) => a + b, 0)).toBe(0);
    expect(fifteen.size).toBe(15);
    expect(settle(fifteen).optimal).toBe(true);

    const sixteen = new Map<string, number>();
    for (let i = 0; i < 8; i += 1) sixteen.set(`C${i}`, 100);
    for (let i = 0; i < 8; i += 1) sixteen.set(`D${i}`, -100);
    const greedy = settle(sixteen);
    expect(greedy.optimal).toBe(false);
    expect(greedy.transfers).toHaveLength(8);
    const after = applyTransfers(sixteen, greedy.transfers);
    expect([...after.values()].every((v) => v === 0)).toBe(true);
  });

  it('greedy fallback on 18 people still settles everything in at most n - 1 transfers', () => {
    const balances = new Map<string, number>();
    for (let i = 0; i < 9; i += 1) balances.set(`C${i}`, 700);
    for (let i = 0; i < 9; i += 1) balances.set(`D${i}`, -700);
    const result = settle(balances);
    expect(result.optimal).toBe(false);
    expect(result.balanceCount).toBe(18);
    expect(result.transfers.length).toBeLessThanOrEqual(17);
    const after = applyTransfers(balances, result.transfers);
    expect([...after.values()].every((v) => v === 0)).toBe(true);
    const moved = result.transfers.reduce((sum, t) => sum + t.amountCents, 0);
    expect(moved).toBe(6300);
  });

  it('minTransferCount agrees with settle', () => {
    expect(minTransferCount(new Map([['A', 250], ['B', -250]]))).toBe(1);
    expect(EXACT_LIMIT).toBe(15);
  });
});

describe('property: random small cases', () => {
  it('every random settlement zeroes all balances, moves exactly the owed total, and uses the brute-force minimum count', () => {
    const rand = mulberry32(20261115);
    const people = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
    for (let trial = 0; trial < 300; trial += 1) {
      const count = 2 + Math.floor(rand() * 7);
      const chosen = people.slice(0, count);
      const expenseCount = 1 + Math.floor(rand() * 5);
      const expenses: Expense[] = [];
      for (let e = 0; e < expenseCount; e += 1) {
        const payer = chosen[Math.floor(rand() * chosen.length)];
        const amountCents = 100 + Math.floor(rand() * 49900);
        const parts = chosen.filter(() => rand() < 0.8);
        if (parts.length === 0) parts.push(payer);
        expenses.push(expense(payer, amountCents, parts));
      }
      const balances = computeBalances(expenses);
      const nonzero = [...balances.values()].filter((v) => v !== 0);
      if (nonzero.length === 0) continue;
      const result = settle(balances);
      expect(result.optimal).toBe(true);
      const after = applyTransfers(balances, result.transfers);
      expect([...after.values()].every((v) => v === 0)).toBe(true);
      const moved = result.transfers.reduce((sum, t) => sum + t.amountCents, 0);
      const owed = nonzero.filter((v) => v > 0).reduce((sum, v) => sum + v, 0);
      expect(moved).toBe(owed);
      expect(result.transfers.length).toBeLessThanOrEqual(Math.max(0, nonzero.length - 1));
      const bruteMin = nonzero.length - maxZeroSumGroups(nonzero);
      expect(result.transfers.length).toBe(bruteMin);
    }
  });
});

describe('money helpers', () => {
  it('formats cents as yuan', () => {
    expect(formatCents(3333)).toBe('¥33.33');
    expect(formatCents(10000)).toBe('¥100.00');
    expect(formatCents(-500)).toBe('-¥5.00');
    expect(formatCents(0)).toBe('¥0.00');
  });

  it('parses user-typed yuan into integer cents', () => {
    expect(parseYuanToCents('33.33')).toBe(3333);
    expect(parseYuanToCents('100')).toBe(10000);
    expect(parseYuanToCents('  12.5 ')).toBe(1250);
    expect(parseYuanToCents('0.01')).toBe(1);
    expect(parseYuanToCents('')).toBeNull();
    expect(parseYuanToCents('abc')).toBeNull();
    expect(parseYuanToCents('0')).toBeNull();
    expect(parseYuanToCents('-5')).toBeNull();
  });
});
