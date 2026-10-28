import type { PatientInvoice } from '../types';
import type { ClinicProfile } from './clinicBranding';

function formatRs(n: number) {
  return `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

function statusLabel(status: string) {
  if (status === 'partial') return 'Partially paid';
  if (status === 'paid') return 'Paid';
  if (status === 'void') return 'Void';
  return 'Unpaid';
}

export function openInvoicePrintWindow(
  invoice: PatientInvoice,
  patientName: string,
  clinic: ClinicProfile,
) {
  const rows = invoice.lineItems.map((li) => `
    <tr>
      <td>${escapeHtml(li.description)}</td>
      <td style="text-align:right">${li.quantity}</td>
      <td style="text-align:right">${formatRs(li.unitPrice)}</td>
      <td style="text-align:right">${formatRs(li.amount ?? li.quantity * li.unitPrice)}</td>
    </tr>
  `).join('');

  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"/><title>Invoice ${escapeHtml(invoice.id)}</title>
<style>
  body { font-family: system-ui, sans-serif; padding: 24px; color: #111; max-width: 720px; margin: 0 auto; }
  h1 { font-size: 1.25rem; margin: 0 0 4px; }
  .muted { color: #666; font-size: 0.875rem; }
  table { width: 100%; border-collapse: collapse; margin: 16px 0; }
  th, td { border-bottom: 1px solid #ddd; padding: 8px 4px; text-align: left; }
  th { font-size: 0.75rem; text-transform: uppercase; color: #555; }
  .totals { margin-top: 12px; text-align: right; }
  .totals div { margin: 4px 0; }
  @media print { body { padding: 0; } }
</style></head><body>
  <h1>${escapeHtml(clinic.name)}</h1>
  <p class="muted">${escapeHtml(clinic.addressShort || '')}${clinic.phone ? ` · ${escapeHtml(clinic.phone)}` : ''}</p>
  <h2 style="margin-top:20px">Invoice / receipt</h2>
  <p class="muted">Patient: <strong>${escapeHtml(patientName)}</strong><br/>
  Invoice #${escapeHtml(invoice.id.slice(0, 8))} · ${invoice.createdAt ? new Date(invoice.createdAt).toLocaleString('en-IN') : ''}<br/>
  Status: ${statusLabel(invoice.status)}</p>
  <table>
    <thead><tr><th>Description</th><th style="text-align:right">Qty</th><th style="text-align:right">Rate</th><th style="text-align:right">Amount</th></tr></thead>
    <tbody>${rows || '<tr><td colspan="4">No line items</td></tr>'}</tbody>
  </table>
  <div class="totals">
    <div>Total: <strong>${formatRs(invoice.total)}</strong></div>
    <div>Paid: ${formatRs(invoice.amountPaid)}</div>
    <div>Balance due: <strong>${formatRs(invoice.balanceDue)}</strong></div>
  </div>
  ${invoice.notes?.trim() ? `<p class="muted">Note: ${escapeHtml(invoice.notes.trim())}</p>` : ''}
  <p class="muted" style="margin-top:24px">Amounts are as recorded in clinic records. This is not a tax invoice unless your clinic configures one separately.</p>
  <script>setTimeout(()=>window.print(),50);</script>
</body></html>`;

  const w = window.open('', '_blank', 'noopener,noreferrer');
  if (!w) return;
  w.document.write(html);
  w.document.close();
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
