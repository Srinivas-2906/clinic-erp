import { LayoutDashboard, CalendarDays, Users, PlusCircle, Banknote, BarChart3 } from 'lucide-react';
import type { TabId } from '../types';

const TABS: { id: TabId; label: string; Icon: React.ElementType }[] = [
  { id: 'overview',  label: 'Home',     Icon: LayoutDashboard },
  { id: 'today',     label: 'Today',    Icon: CalendarDays },
  { id: 'patients',  label: 'Patients', Icon: Users },
  { id: 'book',      label: 'Book',     Icon: PlusCircle },
  { id: 'payments',  label: 'Payments', Icon: Banknote },
  { id: 'reports',   label: 'Reports',  Icon: BarChart3 },
];

export function BottomNav({ active, onChange }: { active: TabId; onChange: (t: TabId) => void }) {
  return (
    <nav className="bottom-nav">
      {TABS.map(({ id, label, Icon }) => (
        <button
          key={id}
          type="button"
          className={`nav-item${active === id ? ' active' : ''}`}
          onClick={() => onChange(id)}
          aria-label={label}
        >
          <span className="nav-item-icon"><Icon size={22} strokeWidth={active === id ? 2.5 : 1.8} /></span>
          <span>{label}</span>
        </button>
      ))}
    </nav>
  );
}
