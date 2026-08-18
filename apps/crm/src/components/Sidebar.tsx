import { ChevronLeft, ChevronRight, LayoutDashboard, CalendarDays, Users, CalendarPlus, LogOut, Banknote, BarChart3, UserCog, Stethoscope } from 'lucide-react';
import { logout } from '../lib/auth';
import type { TabId } from '../types';

const NAV_ITEMS: { id: TabId; label: string; Icon: React.ElementType }[] = [
  { id: 'overview',  label: 'Home',     Icon: LayoutDashboard },
  { id: 'today',     label: 'Today',    Icon: CalendarDays },
  { id: 'patients',  label: 'Patients', Icon: Users },
  { id: 'book',      label: 'Book',     Icon: CalendarPlus },
  { id: 'payments',  label: 'Payments', Icon: Banknote },
  { id: 'reports',   label: 'Reports',  Icon: BarChart3 },
];

const OWNER_ITEMS: { id: TabId; label: string; Icon: React.ElementType }[] = [
  { id: 'doctors', label: 'Doctors', Icon: Stethoscope },
  { id: 'team',    label: 'Team',    Icon: UserCog },
];

interface Props {
  active: TabId;
  collapsed: boolean;
  onChange: (t: TabId) => void;
  onToggle: () => void;
  brandName: string;
  brandSub: string;
  userInitials: string;
  showOwnerNav?: boolean;
}

export function Sidebar({ active, collapsed, onChange, onToggle, brandName, brandSub, userInitials, showOwnerNav }: Props) {
  const navItems = showOwnerNav ? [...NAV_ITEMS, ...OWNER_ITEMS] : NAV_ITEMS;
  return (
    <aside className={`clinic-sidebar${collapsed ? ' collapsed' : ''}`}>

      {/* Brand */}
      <div className="sidebar-brand">
        <div className="sidebar-brand-icon">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 3c-1.2 0-2.4.6-3 1.5C8.4 5.4 8 7 8 8.5c0 1.5.4 3 .8 4.5.4 1.5.5 3 .5 4 0 1 .4 2 1.2 2s1.2-1.3 1.5-3c.3 1.7.7 3 1.5 3s1.2-1 1.2-2c0-1 .1-2.5.5-4 .4-1.5.8-3 .8-4.5 0-1.5-.4-3.1-1-4C15.4 3.6 13.2 3 12 3z"/>
          </svg>
        </div>
        {!collapsed && (
          <div>
            <div className="sidebar-brand-name">{brandName}</div>
            <div className="sidebar-brand-sub">{brandSub}</div>
          </div>
        )}
      </div>

      {/* Nav */}
      <nav className="sidebar-nav">
        {!collapsed && <span className="sidebar-nav-section">Menu</span>}
        {navItems.map(({ id, label, Icon }) => (
          <button
            key={id}
            type="button"
            className={`sidebar-link${active === id ? ' active' : ''}`}
            onClick={() => onChange(id)}
            title={collapsed ? label : undefined}
          >
            <Icon size={17} strokeWidth={active === id ? 2.5 : 1.8} />
            {!collapsed && <span>{label}</span>}
          </button>
        ))}
      </nav>

      {/* Footer */}
      <div className="sidebar-footer">
        {!collapsed ? (
          <div className="sidebar-footer-main">
            <div className="sidebar-user-row">
              <div className="sidebar-user">
                <div className="sidebar-user-ava">{userInitials}</div>
                <div className="sidebar-user-meta">
                  <div className="sidebar-user-name">Admin</div>
                  <div className="sidebar-user-role">Workspace owner</div>
                </div>
              </div>
              <button type="button" className="collapse-btn" onClick={onToggle} aria-label="Toggle sidebar">
                <ChevronLeft size={14} />
              </button>
            </div>
            <button type="button" className="sidebar-logout-btn" onClick={logout}>
              <LogOut size={16} strokeWidth={1.8} />
              <span>Log out</span>
            </button>
          </div>
        ) : (
          <button type="button" className="collapse-btn" onClick={onToggle} aria-label="Toggle sidebar">
            <ChevronRight size={14} />
          </button>
        )}
      </div>
    </aside>
  );
}
