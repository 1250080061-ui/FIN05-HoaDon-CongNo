export type ReminderCandidate = {
  invoiceId: number; invoiceNumber: string; customerId: number; customerCode: string; customerName: string;
  phone: string | null; email: string | null; dueDate: string; invoiceRowVersion: string;
  remainingAmount: string; isOverdue: boolean; overdueDays: number; activeReminderId: number | null
}
export type Reminder = {
  reminderId: number; invoiceId: number; invoiceNumber: string; customerCode: string; customerName: string;
  dueDate: string; remainingAmount: string; balanceAtCreation: string; reminderDate: string; scheduledDate: string;
  creatorName: string; content: string; contactChannel: string; contactInfo: string;
  status: 'Open' | 'Contacted' | 'Closed'; contactedAt: string | null; contactNote: string | null;
  closedAt: string | null; closeReason: string | null; rowVersion: string; asOfDate: string; isOverdue: boolean
}
export type ReminderDetail = { detail: Reminder; history: { action: string; actionTime: string; actorName: string }[] }
export const reminderStatus = (status: string) => ({ Open: 'Mới tạo', Contacted: 'Đã liên hệ', Closed: 'Đã đóng' }[status] ?? status)
export const contactChannel = (channel: string) => ({ Phone: 'Điện thoại', Email: 'Email', Other: 'Khác' }[channel] ?? channel)
export const reminderAction = (action: string) => ({ 'Reminder.Create': 'Tạo nhắc nợ', 'Reminder.Contact': 'Ghi nhận đã liên hệ', 'Reminder.Close': 'Đóng thông báo' }[action] ?? action)
export const displayDate = (date: string) => date.split('-').reverse().join('/')
