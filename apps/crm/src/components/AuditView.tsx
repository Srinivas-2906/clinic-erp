import { useCallback, useEffect, useState } from 'react';
import { Download, Shield } from 'lucide-react';
import { fetchAuditLog, downloadAuditExport } from '../lib/api';

interface AuditRow {
  id: string;
  action: string;
  entityType: string | null;
  entityId: string | null;
  userEmail?: string | null;
  userName?: string | null;
  createdAt: string;
  detail: Record<string, unknown>;
}

export function AuditView() {
  const [items, setItems] = useState<AuditRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [action, setAction] = useState('');
  const [entityType, setEntityType] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await fetchAuditLog({ limit: 50, action: action || undefined, entityType: entityType || undefined });
      setItems(data.items);
      setTotal(data.total);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load activity log');
    } finally {
      setLoading(false);
    }
  }, [action, entityType]);

  useEffect(() => {
    load();
  }, [load]);

  async function onExport() {
    try {
      await downloadAuditExport({ action: action || undefined, entityType: entityType || undefined });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Export failed');
    }
  }

  return (
    <div className="audit-view">
      <div className="audit-toolbar">
        <div className="audit-toolbar-title">
          <Shield size={18} />
          <span>Activity log</span>
        </div>
        <div className="audit-filters">
          <input
            className="login-input"
            placeholder="Filter by action"
            value={action}
            onChange={(e) => setAction(e.target.value)}
            aria-label="Filter by action"
          />
          <input
            className="login-input"
            placeholder="Filter by type"
            value={entityType}
            onChange={(e) => setEntityType(e.target.value)}
            aria-label="Filter by entity type"
          />
          <button type="button" className="login-submit" onClick={load} disabled={loading}>
            Refresh
          </button>
          <button type="button" className="login-switch-mode" onClick={onExport}>
            <Download size={14} style={{ verticalAlign: 'middle', marginRight: 4 }} />
            Export CSV
          </button>
        </div>
      </div>

      {error && <p className="login-error" role="alert">{error}</p>}
      {loading ? (
        <p className="muted-text">Loading activity…</p>
      ) : items.length === 0 ? (
        <p className="muted-text">No activity recorded yet.</p>
      ) : (
        <>
          <p className="muted-text" style={{ marginBottom: 12 }}>
            Showing {items.length} of {total} events (newest first).
          </p>
          <div className="audit-table-wrap">
            <table className="audit-table">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Action</th>
                  <th>Type</th>
                  <th>User</th>
                  <th>Detail</th>
                </tr>
              </thead>
              <tbody>
                {items.map((row) => (
                  <tr key={row.id}>
                    <td>{row.createdAt}</td>
                    <td>{row.action}</td>
                    <td>{row.entityType || '—'}</td>
                    <td>{row.userEmail || row.userName || '—'}</td>
                    <td className="audit-detail-cell">
                      {Object.keys(row.detail || {}).length
                        ? JSON.stringify(row.detail)
                        : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
