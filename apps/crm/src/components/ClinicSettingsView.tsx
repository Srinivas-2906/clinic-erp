import { useEffect, useState } from 'react';
import { fetchClinicSettings, updateClinicSettings } from '../lib/api';
import { setClinicTimezone } from '../lib/clinicTimezone';
import { PlanUsagePanel } from './PlanUsagePanel';

interface Props {
  onToast: (text: string, type?: 'ok' | 'err') => void;
}

export function ClinicSettingsView({ onToast }: Props) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState('');
  const [timezone, setTimezone] = useState('Asia/Kolkata');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const data = await fetchClinicSettings();
        setName(data.name || '');
        const tz = data.settings?.timezone || 'Asia/Kolkata';
        setTimezone(tz);
        setClinicTimezone(tz);
        setPhone(data.settings?.phone || '');
        setEmail(data.settings?.email || '');
        setAddress(data.settings?.address || '');
      } catch (err) {
        onToast(err instanceof Error ? err.message : 'Could not load settings', 'err');
      } finally {
        setLoading(false);
      }
    })();
  }, [onToast]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await updateClinicSettings({ name, timezone, phone, email, address });
      setClinicTimezone(timezone);
      onToast('Clinic settings saved');
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Could not save', 'err');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p className="section-muted">Loading clinic settings…</p>;

  return (
    <>
    <PlanUsagePanel onToast={onToast} />
    <form className="settings-form" onSubmit={(e) => void handleSubmit(e)}>
      <div className="login-field">
        <label className="login-label" htmlFor="clinicName">Clinic name</label>
        <input id="clinicName" className="login-input" value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="login-field">
        <label className="login-label" htmlFor="clinicTz">Timezone</label>
        <input id="clinicTz" className="login-input" value={timezone} onChange={(e) => setTimezone(e.target.value)} />
      </div>
      <div className="login-field">
        <label className="login-label" htmlFor="clinicPhone">Phone</label>
        <input id="clinicPhone" className="login-input" value={phone} onChange={(e) => setPhone(e.target.value)} />
      </div>
      <div className="login-field">
        <label className="login-label" htmlFor="clinicEmail">Email</label>
        <input id="clinicEmail" className="login-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>
      <div className="login-field">
        <label className="login-label" htmlFor="clinicAddress">Address</label>
        <textarea id="clinicAddress" className="login-input" rows={3} value={address} onChange={(e) => setAddress(e.target.value)} />
      </div>
      <button type="submit" className="login-submit" disabled={saving}>{saving ? 'Saving…' : 'Save settings'}</button>
    </form>
    </>
  );
}
