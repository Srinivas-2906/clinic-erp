export const PAYMENT_METHODS = ['Cash', 'UPI', 'Card', 'Online', 'Other'] as const;

export function formatRs(amount: number): string {
  return `₹${Number(amount || 0).toLocaleString('en-IN')}`;
}

export function invoiceStatusLabel(status: string): string {
  if (status === 'paid') return 'Paid';
  if (status === 'partial') return 'Partial';
  if (status === 'void') return 'Void';
  return 'Unpaid';
}

export function newIdempotencyKey(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}
