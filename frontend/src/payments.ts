export type Payment = {
  paymentId: number; paymentNumber: string; customerId: number; customerCode: string; customerName: string;
  receiverName: string; paymentDate: string; amount: string; paymentMethod: 'Cash' | 'BankTransfer';
  referenceNumber: string | null; status: 'Draft' | 'Confirmed'; confirmedAt: string | null;
  rowVersion: string; allocatedAmount: string; unallocatedAmount: string;
  allocations: { allocationId: number; invoiceId: number; invoiceNumber: string; allocatedAmount: string; allocationDate: string; actorName: string }[]
}
export const paymentStatus = (status: string) => status === 'Confirmed' ? 'Đã xác nhận' : 'Nháp'
export const paymentMethod = (method: string) => method === 'Cash' ? 'Tiền mặt' : 'Chuyển khoản'
