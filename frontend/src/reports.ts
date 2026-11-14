export type ReportType = 'Receivables' | 'Overdue' | 'Collections'
export type ReportFilters = { type: ReportType; search: string; customerId: string; fromDate: string; toDate: string }
export type Report = {
  reportType: ReportType; generatedAt: string; asOfDate: string; basis: string; total: number; page: number; pageSize: number;
  summary: { originalAmount: string; adjustmentAmount: string; allocatedAmount: string; remainingAmount: string;
    overdueAmount: string; collectedAmount: string; unallocatedAmount: string; count: number };
  aging: { bucket: number; label: string; count: number; amount: string }[];
  items: { id: number; number: string; customerId: number; customerCode: string; customerName: string; date: string;
    paymentMethod: string | null; originalAmount: string; adjustmentAmount: string; allocatedAmount: string;
    remainingAmount: string; collectedAmount: string; unallocatedAmount: string; overdueDays: number }[]
}
export const reportName = (type: ReportType) => ({ Receivables: 'Công nợ hiện tại', Overdue: 'Hóa đơn quá hạn', Collections: 'Thu tiền' }[type])
export function reportParams(filters: ReportFilters, page = 1) {
  const params = new URLSearchParams({ type: filters.type, page: String(page), pageSize: '10' })
  if (filters.search.trim()) params.set('search', filters.search.trim())
  if (filters.customerId) params.set('customerId', filters.customerId)
  if (filters.fromDate) params.set('fromDate', filters.fromDate)
  if (filters.toDate) params.set('toDate', filters.toDate)
  return params
}
