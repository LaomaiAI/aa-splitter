import { describe, expect, it } from 'vitest';
import { computeBillLayout, type BillData } from './billImage';

function bill(overrides: Partial<BillData> = {}): BillData {
  return {
    title: 'AA 分账',
    dateLabel: '2026-11-15',
    expenses: [],
    transfers: [],
    totalCents: 0,
    ...overrides,
  };
}

describe('computeBillLayout', () => {
  it('has a fixed width and a base height for an empty bill', () => {
    const layout = computeBillLayout(bill());
    expect(layout.width).toBe(1080);
    expect(layout.height).toBeGreaterThan(500);
    expect(computeBillLayout(bill())).toEqual(layout);
  });

  it('grows by a fixed amount per expense row', () => {
    const one = computeBillLayout(
      bill({
        expenses: [
          { note: '火锅', payer: 'A', amountCents: 42000, participantCount: 4 },
        ],
      }),
    );
    const two = computeBillLayout(
      bill({
        expenses: [
          { note: '火锅', payer: 'A', amountCents: 42000, participantCount: 4 },
          { note: '打车', payer: 'B', amountCents: 8600, participantCount: 4 },
        ],
      }),
    );
    expect(two.height - one.height).toBe(104);
  });

  it('grows by a fixed amount per transfer row', () => {
    const one = computeBillLayout(
      bill({ transfers: [{ from: 'B', to: 'A', amountCents: 3333 }] }),
    );
    const two = computeBillLayout(
      bill({
        transfers: [
          { from: 'B', to: 'A', amountCents: 3333 },
          { from: 'C', to: 'A', amountCents: 3333 },
        ],
      }),
    );
    expect(two.height - one.height).toBe(92);
  });
});
