// Bill image: draws the settlement as a shareable PNG with Canvas.
// The layout math is pure (computeBillLayout) so it can be unit tested
// without a browser canvas. Drawing itself runs only in the browser.

import type { Transfer } from './split';
import { formatCents } from './money';

export interface BillExpenseRow {
  note: string;
  payer: string;
  amountCents: number;
  participantCount: number;
}

export interface BillData {
  title: string;
  dateLabel: string;
  expenses: BillExpenseRow[];
  transfers: Transfer[];
  totalCents: number;
}

export interface BillLayout {
  width: number;
  height: number;
}

const WIDTH = 1080;
const HEADER_HEIGHT = 250;
const SECTION_GAP = 96;
const EXPENSE_ROW_HEIGHT = 104;
const TRANSFER_ROW_HEIGHT = 92;
const FOOTER_HEIGHT = 170;

export function computeBillLayout(data: BillData): BillLayout {
  const height =
    HEADER_HEIGHT +
    SECTION_GAP +
    data.expenses.length * EXPENSE_ROW_HEIGHT +
    SECTION_GAP +
    data.transfers.length * TRANSFER_ROW_HEIGHT +
    FOOTER_HEIGHT;
  return { width: WIDTH, height };
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function drawBill(canvas: HTMLCanvasElement, data: BillData): void {
  const { width, height } = computeBillLayout(data);
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);

  // Header band.
  ctx.fillStyle = '#15803d';
  ctx.fillRect(0, 0, width, HEADER_HEIGHT);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 58px sans-serif';
  ctx.textBaseline = 'middle';
  ctx.fillText(data.title, 64, 92);
  ctx.font = '36px sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.fillText(data.dateLabel, 64, 168);
  ctx.textAlign = 'right';
  ctx.font = 'bold 52px sans-serif';
  ctx.fillStyle = '#ffffff';
  ctx.fillText(`共 ${formatCents(data.totalCents)}`, width - 64, 92);
  ctx.font = '32px sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.fillText(`${data.expenses.length} 笔消费`, width - 64, 168);
  ctx.textAlign = 'left';

  let y = HEADER_HEIGHT + SECTION_GAP;
  ctx.fillStyle = '#111827';
  ctx.font = 'bold 40px sans-serif';
  ctx.fillText('消费明细', 64, y - 28);

  // Expense rows.
  for (const row of data.expenses) {
    ctx.fillStyle = '#f6f7f9';
    roundRect(ctx, 64, y, width - 128, EXPENSE_ROW_HEIGHT - 16, 20);
    ctx.fill();
    ctx.fillStyle = '#111827';
    ctx.font = 'bold 38px sans-serif';
    ctx.fillText(row.note || '消费', 92, y + 30);
    ctx.fillStyle = '#6b7280';
    ctx.font = '30px sans-serif';
    ctx.fillText(`${row.payer} 付 · ${row.participantCount} 人分摊`, 92, y + 70);
    ctx.textAlign = 'right';
    ctx.fillStyle = '#111827';
    ctx.font = 'bold 40px sans-serif';
    ctx.fillText(formatCents(row.amountCents), width - 92, y + 44);
    ctx.textAlign = 'left';
    y += EXPENSE_ROW_HEIGHT;
  }

  y += SECTION_GAP - 16;
  ctx.fillStyle = '#111827';
  ctx.font = 'bold 40px sans-serif';
  ctx.fillText('最少转账方案', 64, y - 28);

  // Transfer rows.
  for (const transfer of data.transfers) {
    ctx.fillStyle = '#f0fdf4';
    roundRect(ctx, 64, y, width - 128, TRANSFER_ROW_HEIGHT - 16, 20);
    ctx.fill();
    ctx.fillStyle = '#15803d';
    ctx.font = 'bold 40px sans-serif';
    ctx.fillText(
      `${transfer.from} 转给 ${transfer.to}`,
      92,
      y + 38,
    );
    ctx.textAlign = 'right';
    ctx.fillStyle = '#111827';
    ctx.fillText(formatCents(transfer.amountCents), width - 92, y + 38);
    ctx.textAlign = 'left';
    y += TRANSFER_ROW_HEIGHT;
  }

  // Footer.
  y += 40;
  ctx.fillStyle = '#6b7280';
  ctx.font = '30px sans-serif';
  ctx.fillText('aa-splitter 生成 · 账单数据只保存在本机，不上传服务器', 64, y + 20);
}

export function renderBillImage(data: BillData): string {
  const canvas = document.createElement('canvas');
  drawBill(canvas, data);
  return canvas.toDataURL('image/png');
}
