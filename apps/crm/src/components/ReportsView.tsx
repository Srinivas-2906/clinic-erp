import { useMemo, useState } from 'react';
import { Download, Printer, Share2 } from 'lucide-react';
import type { Appointment, Patient, Payment, TodayStats } from '../types';
import { STATUS_LABELS } from '../types';

function isoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

function daysAgo(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

function formatRs(n: number) {
  return `₹${Math.round(n).toLocaleString('en-IN')}`;
}

function safeDate(iso?: string) {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isFinite(d.getTime()) ? d : null;
}

function isoLocal(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function dayKey(iso: string) {
  if (typeof iso === 'string' && iso.length >= 10) return iso.slice(0, 10);
  return iso;
}

function escapeHtml(input: unknown): string {
  const s = String(input ?? '');
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatDisplayDate(iso: string) {
  const d = safeDate(iso);
  if (!d) return iso;
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatRangeLabel(from: string, to: string) {
  if (from === to) return formatDisplayDate(from);
  return `${formatDisplayDate(from)} – ${formatDisplayDate(to)}`;
}

function downloadCsv(filename: string, rows: (string | number | null | undefined)[][]) {
  const escape = (v: unknown) => {
    const s = String(v ?? '');
    if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const csv = rows.map((r) => r.map(escape).join(',')).join('\n') + '\n';
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function openPrintWindow(title: string, htmlBody: string) {
  const w = window.open('', '_blank', 'noopener,noreferrer');
  if (!w) return;
  w.document.open();
  w.document.write(`<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(title)}</title>
    <style>
      body { font-family: ui-sans-serif, system-ui, sans-serif; margin: 24px; color: #0f172a; }
      h1 { font-size: 18px; margin: 0 0 8px; }
      .sub { color:#64748b; margin: 0 0 16px; font-size: 12px; }
      table { width: 100%; border-collapse: collapse; }
      th, td { border: 1px solid #e2e8f0; padding: 8px; font-size: 12px; text-align: left; }
      th { background: #e3f0fd; }
    </style>
  </head>
  <body>${htmlBody}</body>
  <script>setTimeout(()=>window.print(),50);</script>
</html>`);
  w.document.close();
}

export function ReportsView({
  appliedFrom,
  appliedTo,
  report,
  loading,
  patients,
  onLoadReport,
  onToast,
}: {
  appliedFrom?: string;
  appliedTo?: string;
  report: null | {
    from: string;
    to: string;
    appointments: Appointment[];
    payments: Payment[];
    summary: { todayTotal: number; monthTotal: number; dueCount: number; total?: number };
  };
  loading?: boolean;
  today?: TodayStats | null;
  patients: Patient[];
  onLoadReport: (from: string, to: string) => void;
  onRefresh: () => void;
  onOpenPatient: (id: string) => void;
  onGoToToday: () => void;
  onToast: (msg: string, type?: 'ok' | 'err') => void;
}) {
  const todayIso = isoDate(new Date());
  const last7From = isoDate(daysAgo(6));
  const last30From = isoDate(daysAgo(29));

  const [dateFrom, setDateFrom] = useState(appliedFrom || last30From);
  const [dateTo, setDateTo] = useState(appliedTo || todayIso);
  const [showAllAppts, setShowAllAppts] = useState(false);
  const [showAllPayments, setShowAllPayments] = useState(false);
  const [previewTab, setPreviewTab] = useState<'appointments' | 'payments'>('appointments');

  const isDateRangeValid = dateFrom <= dateTo;
  const hasPreview = !!report && !!appliedFrom && !!appliedTo && !loading;

  const appointments = report?.appointments ?? [];
  const payments = report?.payments ?? [];

  const totals = useMemo(() => {
    const completed = appointments.filter((a) => a.status === 'visited').length;
    const paymentsTotal = payments.reduce((sum, p) => sum + (p.amount || 0), 0);
    return {
      totalAppts: appointments.length,
      completed,
      paymentsTotal,
      paymentCount: payments.length,
    };
  }, [appointments, payments]);

  const newPatientsInRange = useMemo(() => {
    if (!appliedFrom || !appliedTo) return 0;
    const fromTs = safeDate(`${appliedFrom}T00:00:00`)?.getTime() ?? 0;
    const toTs = (safeDate(`${appliedTo}T23:59:59`)?.getTime() ?? 0) || Date.now();
    return patients.filter((p) => {
      const d = safeDate(p.createdAt);
      if (!d) return false;
      return d.getTime() >= fromTs && d.getTime() <= toTs;
    }).length;
  }, [patients, appliedFrom, appliedTo]);

  const sortedAppointments = useMemo(
    () => [...appointments].sort(
      (a, b) => new Date(b.scheduledAt).getTime() - new Date(a.scheduledAt).getTime(),
    ),
    [appointments],
  );

  const sortedPayments = useMemo(
    () => [...payments].sort(
      (a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime(),
    ),
    [payments],
  );

  const visibleAppointments = showAllAppts ? sortedAppointments : sortedAppointments.slice(0, 50);
  const visiblePayments = showAllPayments ? sortedPayments : sortedPayments.slice(0, 50);

  const presetClass = (active: boolean) =>
    `reports-preset${active ? ' active' : ''}`;

  function handleLoad() {
    if (!isDateRangeValid) return;
    setShowAllAppts(false);
    setShowAllPayments(false);
    onLoadReport(dateFrom, dateTo);
  }

  function exportPaymentsCsv() {
    if (payments.length === 0) {
      onToast('No payments to download', 'err');
      return;
    }
    downloadCsv(`payments_${appliedFrom}_to_${appliedTo}.csv`, [
      ['Date', 'Patient', 'Amount', 'Method', 'Reference', 'Notes'],
      ...payments.map((p) => [
        p.createdAt ? new Date(p.createdAt).toLocaleString('en-IN') : '',
        p.patientName || '',
        p.amount,
        p.method || '',
        p.reference || '',
        p.notes || '',
      ]),
    ]);
    onToast('Payments downloaded');
  }

  function exportAppointmentsCsv() {
    if (appointments.length === 0) {
      onToast('No appointments to download', 'err');
      return;
    }
    downloadCsv(`appointments_${appliedFrom}_to_${appliedTo}.csv`, [
      ['Date', 'Patient', 'Phone', 'Treatment', 'Status', 'Source'],
      ...appointments.map((a) => [
        new Date(a.scheduledAt).toLocaleString('en-IN'),
        a.patientName || '',
        a.patientPhone || '',
        a.service || '',
        STATUS_LABELS[a.status] || a.status,
        a.source || '',
      ]),
    ]);
    onToast('Appointments downloaded');
  }

  function exportDailySummaryCsv() {
    if (!appliedFrom || !appliedTo) return;
    const fromD = safeDate(`${appliedFrom}T00:00:00`);
    const toD = safeDate(`${appliedTo}T00:00:00`);
    if (!fromD || !toD) return;

    const apptsByDay = new Map<string, { total: number; done: number; cancelled: number; noShow: number }>();
    const paysByDay = new Map<string, { total: number; count: number }>();
    const newPtsByDay = new Map<string, number>();

    appointments.forEach((a) => {
      const k = dayKey(a.scheduledAt);
      const row = apptsByDay.get(k) || { total: 0, done: 0, cancelled: 0, noShow: 0 };
      row.total += 1;
      if (a.status === 'visited') row.done += 1;
      if (a.status === 'cancelled') row.cancelled += 1;
      if (a.status === 'no_show') row.noShow += 1;
      apptsByDay.set(k, row);
    });

    payments.forEach((p) => {
      const k = p.createdAt ? dayKey(p.createdAt) : '';
      if (!k) return;
      const row = paysByDay.get(k) || { total: 0, count: 0 };
      row.total += Number(p.amount) || 0;
      row.count += 1;
      paysByDay.set(k, row);
    });

    patients.forEach((p) => {
      if (!p.createdAt) return;
      const k = dayKey(p.createdAt);
      newPtsByDay.set(k, (newPtsByDay.get(k) || 0) + 1);
    });

    const rows: (string | number)[][] = [
      ['Date', 'Appointments', 'Done', 'Cancelled', 'No show', 'Payments', 'Payments count', 'New patients'],
    ];

    const cur = new Date(fromD);
    const end = new Date(toD);
    while (cur.getTime() <= end.getTime()) {
      const k = isoLocal(cur);
      const a = apptsByDay.get(k) || { total: 0, done: 0, cancelled: 0, noShow: 0 };
      const pay = paysByDay.get(k) || { total: 0, count: 0 };
      const newPts = newPtsByDay.get(k) || 0;
      rows.push([k, a.total, a.done, a.cancelled, a.noShow, Math.round(pay.total), pay.count, newPts]);
      cur.setDate(cur.getDate() + 1);
    }

    downloadCsv(`daily_summary_${appliedFrom}_to_${appliedTo}.csv`, rows);
    onToast('Daily summary downloaded');
  }

  function shareSummary() {
    if (!appliedFrom || !appliedTo) return;
    const text =
      `Clinic report\n${formatRangeLabel(appliedFrom, appliedTo)}\n` +
      `Appointments: ${totals.totalAppts} (Done ${totals.completed})\n` +
      `Payments: ${formatRs(totals.paymentsTotal)} (${totals.paymentCount})\n` +
      `New patients: ${newPatientsInRange}`;
    if (navigator.share) {
      navigator.share({ title: 'Clinic report', text }).catch(() => {});
    } else {
      window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noreferrer');
    }
  }

  function printReport() {
    if (!appliedFrom || !appliedTo) return;
    const apptRows = sortedAppointments.map((a) => ({
      date: new Date(a.scheduledAt).toLocaleString('en-IN'),
      patient: a.patientName || 'Patient',
      treatment: a.service || '',
      status: STATUS_LABELS[a.status],
    }));
    const payRows = sortedPayments.map((p) => ({
      date: p.createdAt ? new Date(p.createdAt).toLocaleString('en-IN') : '',
      patient: p.patientName || 'Patient',
      amount: formatRs(p.amount || 0),
      method: p.method || '',
    }));
    const safeAppts = apptRows.map((r) => ({
      date: escapeHtml(r.date),
      patient: escapeHtml(r.patient),
      treatment: escapeHtml(r.treatment),
      status: escapeHtml(r.status),
    }));
    const safePays = payRows.map((r) => ({
      date: escapeHtml(r.date),
      patient: escapeHtml(r.patient),
      amount: escapeHtml(r.amount),
      method: escapeHtml(r.method),
    }));
    openPrintWindow('Clinic report', `
      <h1>Clinic report</h1>
      <p class="sub">${escapeHtml(formatRangeLabel(appliedFrom, appliedTo))}</p>
      <p class="sub">${totals.totalAppts} appointments · ${formatRs(totals.paymentsTotal)} payments · ${newPatientsInRange} new patients</p>
      <h1 style="font-size:14px;margin-top:20px">Appointments</h1>
      <table>
        <thead><tr><th>Date</th><th>Patient</th><th>Treatment</th><th>Status</th></tr></thead>
        <tbody>
          ${safeAppts.map((r) => `<tr><td>${r.date}</td><td>${r.patient}</td><td>${r.treatment}</td><td>${r.status}</td></tr>`).join('')}
        </tbody>
      </table>
      <h1 style="font-size:14px;margin-top:20px">Payments</h1>
      <table>
        <thead><tr><th>Date</th><th>Patient</th><th>Amount</th><th>Method</th></tr></thead>
        <tbody>
          ${safePays.map((r) => `<tr><td>${r.date}</td><td>${r.patient}</td><td>${r.amount}</td><td>${r.method}</td></tr>`).join('')}
        </tbody>
      </table>
    `);
  }

  return (
    <div className="view reports-view">
      <h1 className="page-title reports-page-title">Reports</h1>

      {/* Step 1: pick dates + load (Aquafarm-style setup card) */}
      <div className="reports-setup-card">
        <div className="reports-setup-section">
          <label className="reports-label">Period</label>
          <div className="reports-presets">
            <button
              type="button"
              className={presetClass(dateFrom === todayIso && dateTo === todayIso)}
              onClick={() => { setDateFrom(todayIso); setDateTo(todayIso); }}
            >
              Today
            </button>
            <button
              type="button"
              className={presetClass(dateFrom === last7From && dateTo === todayIso)}
              onClick={() => { setDateFrom(last7From); setDateTo(todayIso); }}
            >
              Last 7 days
            </button>
            <button
              type="button"
              className={presetClass(dateFrom === last30From && dateTo === todayIso)}
              onClick={() => { setDateFrom(last30From); setDateTo(todayIso); }}
            >
              Last 30 days
            </button>
          </div>
        </div>

        <div className="reports-date-grid">
          <div>
            <label className="reports-label">From</label>
            <input
              type="date"
              className="form-input reports-date-input"
              value={dateFrom}
              max={dateTo}
              onChange={(e) => setDateFrom(e.target.value)}
            />
          </div>
          <div>
            <label className="reports-label">To</label>
            <input
              type="date"
              className="form-input reports-date-input"
              value={dateTo}
              min={dateFrom}
              max={todayIso}
              onChange={(e) => setDateTo(e.target.value)}
            />
          </div>
        </div>

        {!isDateRangeValid && (
          <div className="reports-error">Start date must be before end date.</div>
        )}

        <button
          type="button"
          className="btn btn-primary reports-load-btn"
          onClick={handleLoad}
          disabled={loading || !isDateRangeValid}
        >
          {loading ? 'Loading…' : 'Load report'}
        </button>
      </div>

      {!hasPreview && !loading && (
        <p className="reports-tap-hint">Pick dates and tap Load report to see preview.</p>
      )}

      {/* Step 2: preview after load */}
      {hasPreview && (
        <>
          <div className="reports-summary-card">
            <p className="reports-summary-meta">
              {totals.totalAppts} appointments · {totals.completed} done · {newPatientsInRange} new patients
            </p>
            <p className="reports-summary-big">{formatRs(totals.paymentsTotal)}</p>
            <p className="reports-summary-sub">
              {formatRangeLabel(appliedFrom!, appliedTo!)} · {totals.paymentCount} payments
            </p>
          </div>

          <div className="reports-preview-tabs" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={previewTab === 'appointments'}
              className={`reports-preview-tab${previewTab === 'appointments' ? ' active' : ''}`}
              onClick={() => setPreviewTab('appointments')}
            >
              Appointments ({appointments.length})
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={previewTab === 'payments'}
              className={`reports-preview-tab${previewTab === 'payments' ? ' active' : ''}`}
              onClick={() => setPreviewTab('payments')}
            >
              Payments ({payments.length})
            </button>
          </div>

          {previewTab === 'appointments' ? (
            appointments.length === 0 ? (
              <div className="reports-empty-card">No appointments in this period.</div>
            ) : (
              <>
                <div className="reports-table-wrap">
                  <table className="reports-table">
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Patient</th>
                        <th>Treatment</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleAppointments.map((a) => (
                        <tr key={a.id}>
                          <td>{new Date(a.scheduledAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</td>
                          <td>{a.patientName || 'Patient'}</td>
                          <td>{a.service || 'Check-up'}</td>
                          <td>{STATUS_LABELS[a.status]}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {sortedAppointments.length > 50 && (
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm reports-show-all"
                    onClick={() => setShowAllAppts((v) => !v)}
                  >
                    {showAllAppts ? 'Show less' : `Show all (${sortedAppointments.length})`}
                  </button>
                )}
              </>
            )
          ) : payments.length === 0 ? (
            <div className="reports-empty-card">No payments in this period.</div>
          ) : (
            <>
              <div className="reports-table-wrap">
                <table className="reports-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Patient</th>
                      <th>Amount</th>
                      <th>Method</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visiblePayments.map((p) => (
                      <tr key={p.id}>
                        <td>{p.createdAt ? new Date(p.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : '—'}</td>
                        <td>{p.patientName || 'Patient'}</td>
                        <td>{formatRs(p.amount || 0)}</td>
                        <td>{p.method || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {sortedPayments.length > 50 && (
                <button
                  type="button"
                  className="btn btn-ghost btn-sm reports-show-all"
                  onClick={() => setShowAllPayments((v) => !v)}
                >
                  {showAllPayments ? 'Show less' : `Show all (${sortedPayments.length})`}
                </button>
              )}
            </>
          )}

          {/* Step 3: download grid (Aquafarm-style) */}
          <div className="reports-download-grid">
            <button type="button" className="btn btn-ghost reports-download-btn" onClick={exportAppointmentsCsv}>
              <Download size={18} /> Appointments CSV
            </button>
            <button type="button" className="btn btn-ghost reports-download-btn" onClick={exportPaymentsCsv}>
              <Download size={18} /> Payments CSV
            </button>
            <button type="button" className="btn btn-ghost reports-download-btn" onClick={exportDailySummaryCsv}>
              <Download size={18} /> Daily summary CSV
            </button>
            <button type="button" className="btn btn-ghost reports-download-btn" onClick={shareSummary}>
              <Share2 size={18} /> Share
            </button>
            <button type="button" className="btn btn-ghost reports-download-btn" onClick={printReport}>
              <Printer size={18} /> Print
            </button>
          </div>
        </>
      )}
    </div>
  );
}
