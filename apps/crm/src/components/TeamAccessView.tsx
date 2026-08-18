import { useCallback, useEffect, useState } from 'react';
import { Check, Copy, UserPlus, X } from 'lucide-react';
import {
  approveAccessRequest,
  fetchAccessRequests,
  rejectAccessRequest,
  type AccessRequest,
} from '../lib/api';

interface Props {
  onToast: (text: string, type?: 'ok' | 'err') => void;
}

export function TeamAccessView({ onToast }: Props) {
  const [requests, setRequests] = useState<AccessRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'pending' | 'all'>('pending');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [inviteLink, setInviteLink] = useState<{ email: string; url: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchAccessRequests(filter === 'pending' ? 'pending' : undefined);
      setRequests(data.requests);
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Could not load requests', 'err');
    } finally {
      setLoading(false);
    }
  }, [filter, onToast]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleApprove(id: string) {
    setBusyId(id);
    try {
      const result = await approveAccessRequest(id);
      setInviteLink({ email: result.user.email, url: result.setPasswordUrl });
      onToast(`Approved ${result.user.email}. Share the link with them.`);
      await load();
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Could not approve', 'err');
    } finally {
      setBusyId(null);
    }
  }

  async function handleReject(id: string) {
    setBusyId(id);
    try {
      await rejectAccessRequest(id);
      onToast('Request rejected');
      await load();
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Could not reject', 'err');
    } finally {
      setBusyId(null);
    }
  }

  async function copyLink(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      onToast('Link copied');
    } catch {
      onToast('Could not copy link', 'err');
    }
  }

  const pendingCount = requests.filter((r) => r.status === 'pending').length;

  return (
    <div className="team-access-view">
      <div className="team-access-header">
        <div>
          <h3 className="team-access-title">Team</h3>
          <p className="team-access-sub">
            Approve requests so staff can set a password and sign in.
          </p>
        </div>
        <div className="team-access-filters">
          <button
            type="button"
            className={`team-filter-btn${filter === 'pending' ? ' active' : ''}`}
            onClick={() => setFilter('pending')}
          >
            Pending{filter === 'pending' && pendingCount ? ` (${pendingCount})` : ''}
          </button>
          <button
            type="button"
            className={`team-filter-btn${filter === 'all' ? ' active' : ''}`}
            onClick={() => setFilter('all')}
          >
            All
          </button>
        </div>
      </div>

      {inviteLink && (
        <div className="team-invite-banner">
          <div>
            <strong>Setup link for {inviteLink.email}</strong>
            <p className="team-invite-url">{inviteLink.url}</p>
            <p className="team-invite-hint">Send this link. Expires in 7 days.</p>
          </div>
          <div className="team-invite-actions">
            <button type="button" className="btn-secondary" onClick={() => copyLink(inviteLink.url)}>
              <Copy size={14} /> Copy link
            </button>
            <button type="button" className="icon-btn" onClick={() => setInviteLink(null)} aria-label="Dismiss">
              <X size={16} />
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="team-access-empty">Loading…</div>
      ) : requests.length === 0 ? (
        <div className="team-access-empty">
          <UserPlus size={28} strokeWidth={1.5} />
          <p>{filter === 'pending' ? 'No pending requests.' : 'No requests yet.'}</p>
        </div>
      ) : (
        <div className="team-request-list">
          {requests.map((req) => (
            <div key={req.id} className={`team-request-card status-${req.status}`}>
              <div className="team-request-main">
                <div className="team-request-name">{req.name || req.email}</div>
                <div className="team-request-email">{req.email}</div>
                <div className="team-request-meta">
                  Requested {new Date(req.requestedAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}
                  {req.status !== 'pending' && req.reviewedAt && (
                    <> · {req.status} {new Date(req.reviewedAt).toLocaleDateString('en-IN')}</>
                  )}
                </div>
              </div>
              {req.status === 'pending' ? (
                <div className="team-request-actions">
                  <button
                    type="button"
                    className="btn-primary team-approve-btn"
                    disabled={busyId === req.id}
                    onClick={() => handleApprove(req.id)}
                  >
                    <Check size={14} /> Approve
                  </button>
                  <button
                    type="button"
                    className="btn-secondary"
                    disabled={busyId === req.id}
                    onClick={() => handleReject(req.id)}
                  >
                    <X size={14} /> Reject
                  </button>
                </div>
              ) : (
                <span className={`team-status-pill status-${req.status}`}>{req.status}</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
