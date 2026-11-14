export type AccountingAccount = { accountId: number; accountCode: string; accountName: string; isReceivable: boolean }
export type AdjustmentLine = { accountId: number; accountCode?: string; accountName?: string; isReceivable?: boolean; debitAmount: string; creditAmount: string }
export type AdjustmentInvoice = { invoiceId: number; invoiceNumber: string; customerCode: string; customerName: string;
  invoiceRowVersion: string; originalAmount: string; adjustmentAmount?: string; paidAmount?: string; remainingAmount: string }
export type Adjustment = AdjustmentInvoice & { adjustmentId: number; adjustmentDate: string; signedAmount: string;
  reason: string; status: 'Draft' | 'Posted' | 'Reversed'; rowVersion: string; asOfDate: string;
  createdAt: string; creatorName: string; postedAt: string | null; reversedAt: string | null; reversalReason: string | null;
  lines: AdjustmentLine[]; journalEntries: { journalEntryId: number; entryType: string; entryDate: string;
    postedAt: string; actorName: string; description: string; totalDebit: string; totalCredit: string; lines: AdjustmentLine[] }[] }
export type AdjustmentDetail = { detail: Adjustment; history: { action: string; actionTime: string; actorName: string }[] }
export const adjustmentStatus = (status: string) => ({ Draft: 'Nháp', Posted: 'Đã ghi nhận', Reversed: 'Đã đảo' }[status] ?? status)
export const adjustmentAction = (action: string) => ({ 'Adjustment.CreateDraft': 'Lập nháp', 'Adjustment.UpdateDraft': 'Sửa nháp', 'Adjustment.Post': 'Ghi nhận điều chỉnh', 'Adjustment.Reverse': 'Đảo điều chỉnh' }[action] ?? action)
