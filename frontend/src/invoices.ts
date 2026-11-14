import Decimal from 'decimal.js'
Decimal.set({ precision: 40, rounding: Decimal.ROUND_HALF_UP })
export type InvoiceLine = { invoiceItemId?: number; description: string; quantity: string; unitPrice: string; lineAmount?: string }
export type Invoice = {
  invoiceId: number; invoiceNumber: string | null; customerId: number; customerCode: string; customerName: string;
  customerIsActive?: boolean; invoiceDate: string; dueDate: string; totalAmount: string; issueStatus: string;
  creatorName: string; createdByUserId?: number; rowVersion: string; items: InvoiceLine[];
  issuedAt?: string | null;
}
export const statuses: Record<string, string> = { Draft: 'Nháp', Issued: 'Đã phát hành', Cancelled: 'Hủy nháp' }
export function lineTotal(line: InvoiceLine) {
  try { return new Decimal(line.quantity || 0).mul(line.unitPrice || 0).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2) }
  catch { return '0.00' }
}
export function total(lines: InvoiceLine[]) { return lines.reduce((sum, line) => sum.plus(lineTotal(line)), new Decimal(0)).toFixed(2) }
export function money(value: string) {
  const [whole, fraction] = new Decimal(value).toFixed(2).split('.')
  return `${whole.replace(/\B(?=(\d{3})+(?!\d))/g, '.')},${fraction}`
}
export function today() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}
