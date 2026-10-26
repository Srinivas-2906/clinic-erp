import { useCallback, useEffect, useState } from 'react';
import { fetchCatalog, fetchDoctorServices, saveDoctorServices } from '../lib/api';
import type { CatalogItem } from '../types';

interface Props {
  doctorId: string;
  onToast: (text: string, type?: 'ok' | 'err') => void;
}

export function DoctorServicesEditor({ doctorId, onToast }: Props) {
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [items, svc] = await Promise.all([
        fetchCatalog(),
        fetchDoctorServices(doctorId),
      ]);
      setCatalog(items);
      setSelected(new Set(svc.catalogItemIds || []));
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Could not load services', 'err');
    } finally {
      setLoading(false);
    }
  }, [doctorId, onToast]);

  useEffect(() => {
    void load();
  }, [load]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleSave() {
    setSaving(true);
    try {
      await saveDoctorServices(doctorId, [...selected]);
      onToast('Doctor services updated');
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Could not save', 'err');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p className="doctor-panel-muted">Loading services…</p>;

  return (
    <div className="doctor-services-editor">
      <p className="doctor-panel-muted">
        Select services this doctor can perform. Leave all unchecked to allow any service (legacy behavior).
      </p>
      <ul className="doctor-services-list">
        {catalog.map((item) => (
          <li key={item.id}>
            <label>
              <input
                type="checkbox"
                checked={selected.has(item.id)}
                onChange={() => toggle(item.id)}
              />
              {item.title}
              {item.price ? <span className="doctor-panel-muted"> — {item.price}</span> : null}
            </label>
          </li>
        ))}
      </ul>
      <button type="button" className="login-submit" disabled={saving} onClick={() => void handleSave()}>
        {saving ? 'Saving…' : 'Save services'}
      </button>
    </div>
  );
}
