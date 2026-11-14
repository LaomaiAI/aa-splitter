// Minimum-transfer settlement for group expenses.
//
// Money is always integer cents. There are no floats anywhere in the
// money path, so a settlement can never lose or create a cent.
//
// How the minimum is found:
// - Every expense is split evenly among its participants. When the
//   amount does not divide evenly, the leftover cents go to the first
//   participants in the order they were picked (deterministic).
// - Each person ends up with one net balance: positive means the group
//   owes them, negative means they owe the group.
// - When at most EXACT_LIMIT people have a nonzero balance, the
//   settlement is exact: dynamic programming over subsets finds the
//   partition into the most zero-sum groups, which gives the smallest
//   possible number of transfers. Each group is then settled with a
//   simple largest-debtor / largest-creditor pairing.
// - With more nonzero balances the exact search gets too slow, so a
//   greedy largest-debtor / largest-creditor pairing is used instead.
//   It is still correct (every balance ends at zero) and uses at most
//   n - 1 transfers, it is just not proven minimal.
//
// No large language model is involved anywhere in this file. The whole
// settlement is deterministic code.

export interface Expense {
  id: string;
  payer: string;
  amountCents: number;
  participants: string[];
  note: string;
  createdAt: number;
}

export interface Transfer {
  from: string;
  to: string;
  amountCents: number;
}

export interface SettleResult {
  transfers: Transfer[];
  /** True only when the transfer count is proven minimal. */
  optimal: boolean;
  /** Number of people with a nonzero balance. */
  balanceCount: number;
}

/** Exact search is used when the nonzero balance count is at most this. */
export const EXACT_LIMIT = 15;

interface NamedBalance {
  name: string;
  balance: number;
}

function popcount(x: number): number {
  let count = 0;
  while (x !== 0) {
    x &= x - 1;
    count += 1;
  }
  return count;
}

function bitsOf(mask: number): number[] {
  const out: number[] = [];
  let m = mask;
  let i = 0;
  while (m !== 0) {
    if ((m & 1) === 1) out.push(i);
    m >>= 1;
    i += 1;
  }
  return out;
}

/**
 * Split every expense evenly and return each person's net balance in
 * integer cents. Positive means the group owes them.
 */
export function computeBalances(expenses: Expense[]): Map<string, number> {
  const balances = new Map<string, number>();
  for (const expense of expenses) {
    if (!Number.isInteger(expense.amountCents) || expense.amountCents <= 0) {
      throw new Error('amountCents must be a positive integer');
    }
    const parts = [...new Set(expense.participants.map((p) => p.trim()).filter((p) => p !== ''))];
    if (parts.length === 0) {
      throw new Error('expense needs at least one participant');
    }
    const share = Math.floor(expense.amountCents / parts.length);
    const remainder = expense.amountCents - share * parts.length;
    for (let i = 0; i < parts.length; i += 1) {
      const owed = share + (i < remainder ? 1 : 0);
      balances.set(parts[i], (balances.get(parts[i]) ?? 0) - owed);
    }
    balances.set(expense.payer, (balances.get(expense.payer) ?? 0) + expense.amountCents);
  }
  return balances;
}

/**
 * Settle one zero-sum group with greedy pairing. Each transfer zeroes
 * at least one person, so a group of k people needs at most k - 1
 * transfers.
 */
function greedySettleGroup(group: NamedBalance[]): Transfer[] {
  const creditors = group
    .filter((g) => g.balance > 0)
    .sort((a, b) => b.balance - a.balance)
    .map((g) => ({ ...g }));
  const debtors = group
    .filter((g) => g.balance < 0)
    .sort((a, b) => a.balance - b.balance)
    .map((g) => ({ ...g }));
  const out: Transfer[] = [];
  let i = 0;
  let j = 0;
  while (i < creditors.length && j < debtors.length) {
    const creditor = creditors[i];
    const debtor = debtors[j];
    const amount = Math.min(creditor.balance, -debtor.balance);
    out.push({ from: debtor.name, to: creditor.name, amountCents: amount });
    creditor.balance -= amount;
    debtor.balance += amount;
    if (creditor.balance === 0) i += 1;
    if (debtor.balance === 0) j += 1;
  }
  return out;
}

/**
 * Exact minimum-count settlement for a small zero-sum group.
 * DP over subsets: dp[mask] is the fewest transfers that settle the
 * people in mask. A zero-sum mask can be settled in
 * popcount(mask) - 1 transfers, or split into a zero-sum submask plus
 * the rest. The best split wins.
 */
function exactSettle(items: NamedBalance[]): Transfer[] {
  const m = items.length;
  const size = 1 << m;
  const sums = new Int32Array(size);
  for (let mask = 1; mask < size; mask += 1) {
    const lsb = mask & -mask;
    const bit = 31 - Math.clz32(lsb);
    sums[mask] = sums[mask ^ lsb] + items[bit].balance;
  }
  const INF = 1e9;
  const dp = new Int32Array(size).fill(INF);
  // choice[mask]: -1 means settle the whole mask as one group,
  // otherwise the submask that is settled as one group first.
  const choice = new Int32Array(size).fill(-1);
  dp[0] = 0;
  for (let mask = 1; mask < size; mask += 1) {
    if (sums[mask] !== 0) continue;
    dp[mask] = popcount(mask) - 1;
    choice[mask] = -1;
    const low = mask & -mask;
    for (let sub = (mask - 1) & mask; sub > 0; sub = (sub - 1) & mask) {
      if ((sub & low) === 0) continue;
      if (sub === mask) continue;
      if (sums[sub] !== 0) continue;
      const rest = mask ^ sub;
      if (dp[rest] === INF) continue;
      const candidate = dp[rest] + popcount(sub) - 1;
      if (candidate < dp[mask]) {
        dp[mask] = candidate;
        choice[mask] = sub;
      }
    }
  }
  const groups: number[][] = [];
  let mask = size - 1;
  while (mask !== 0) {
    const sub = choice[mask];
    if (sub === -1) {
      groups.push(bitsOf(mask));
      mask = 0;
    } else {
      groups.push(bitsOf(sub));
      mask = mask ^ sub;
    }
  }
  const out: Transfer[] = [];
  for (const group of groups) {
    out.push(...greedySettleGroup(group.map((index) => items[index])));
  }
  return out;
}

/**
 * Turn net balances into the transfer plan. Throws when the balances
 * do not sum to zero (that would mean money is missing or invented).
 */
export function settle(
  balances: Map<string, number> | Record<string, number>,
): SettleResult {
  const entries =
    balances instanceof Map ? [...balances.entries()] : Object.entries(balances);
  const items: NamedBalance[] = entries
    .filter(([, balance]) => balance !== 0)
    .map(([name, balance]) => ({ name, balance }));
  const total = items.reduce((sum, item) => sum + item.balance, 0);
  if (total !== 0) {
    throw new Error('balances must sum to zero');
  }
  if (items.length <= 1) {
    return { transfers: [], optimal: true, balanceCount: items.length };
  }
  if (items.length <= EXACT_LIMIT) {
    return { transfers: exactSettle(items), optimal: true, balanceCount: items.length };
  }
  return { transfers: greedySettleGroup(items), optimal: false, balanceCount: items.length };
}

/** Convenience: number of transfers in the plan for these balances. */
export function minTransferCount(
  balances: Map<string, number> | Record<string, number>,
): number {
  return settle(balances).transfers.length;
}

/** Apply transfers to balances. Used by tests to prove a plan settles. */
export function applyTransfers(
  balances: Map<string, number>,
  transfers: Transfer[],
): Map<string, number> {
  const out = new Map(balances);
  for (const transfer of transfers) {
    out.set(transfer.from, (out.get(transfer.from) ?? 0) + transfer.amountCents);
    out.set(transfer.to, (out.get(transfer.to) ?? 0) - transfer.amountCents);
  }
  return out;
}
