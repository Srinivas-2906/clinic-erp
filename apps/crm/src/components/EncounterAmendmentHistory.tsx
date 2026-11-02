import { useEffect, useState } from 'react';
import type { EncounterAmendment } from '../types';
import { fetchEncounterAmendments } from '../lib/api';

type Props = {
  encounterId: string;
  refreshKey?: number;
};

export function EncounterAmendmentHistory({ encounterId, refreshKey = 0 }: Props) {
  const [items, setItems] = useState<EncounterAmendment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    fetchEncounterAmendments(encounterId)
      .then((res) => {
        if (!cancelled) setItems(res.amendments || []);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Could not load amendments');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [encounterId, refreshKey]);

  if (loading) {
    return <p className="muted encounter-amendments-loading" style={{ fontSize: 12 }}>Loading amendments…</p>;
  }
  if (error) {
    return <p className="muted encounter-amendments-error" style={{ fontSize: 12 }}>{error}</p>;
  }
  if (items.length === 0) {
    return null;
  }

  return (
    <ul className="encounter-amendments-list" data-testid={`encounter-amendments-${encounterId}`}>
      {items.map((am) => (
        <li key={am.id} className="encounter-amendments-row">
          <span className="encounter-amendments-when">
            {am.createdAt
              ? new Date(am.createdAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })
              : ''}
          </span>
          <span className="encounter-amendments-reason">{am.reason}</span>
        </li>
      ))}
    </ul>
  );
}
