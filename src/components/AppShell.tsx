import React, { useState, useEffect, useRef } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, CheckSquare, Calendar, Bell,
  Users, Building2, Contact, Target,
  Headphones, Inbox, ClipboardList, CalendarClock, BookOpen,
  HardDrive, Server, Shield, RefreshCw, FolderKanban,
  FileSpreadsheet, Receipt, CreditCard, BarChart3,
  FileText, ScrollText, Map, UserCog, Network,
  UserCheck, KeyRound, History, Plug, Settings,
  PanelLeftClose, PanelLeftOpen, Search, Sun, Moon, LogOut, Menu, X, ChevronRight,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { KortrixLogo } from './KortrixLogo';
import { apiFetch, formatDateTime } from '../lib/api';

interface NavSection {
  label: string;
  items: { label: string; to: string; icon: React.ComponentType<{ className?: string }>; permModule?: string }[];
}

const NAV_SECTIONS: NavSection[] = [
  {
    label: 'Workspace',
    items: [
      { label: 'Overview', to: '/', icon: LayoutDashboard },
      { label: 'My Tasks', to: '/tasks', icon: CheckSquare },
      { label: 'Calendar', to: '/calendar', icon: Calendar },
      { label: 'Notifications', to: '/notifications', icon: Bell },
    ],
  },
  {
    label: 'Customer Management',
    items: [
      { label: 'Customers', to: '/customers', icon: Users, permModule: 'crm' },
      { label: 'Organizations', to: '/organizations', icon: Building2, permModule: 'crm' },
      { label: 'Contacts', to: '/contacts', icon: Contact, permModule: 'crm' },
      { label: 'Leads', to: '/leads', icon: Target, permModule: 'crm' },
    ],
  },
  {
    label: 'Service Operations',
    items: [
      { label: 'Service Desk', to: '/service-desk', icon: Headphones, permModule: 'service_desk' },
      { label: 'Service Requests', to: '/service-requests', icon: Inbox, permModule: 'service_desk' },
      { label: 'Work Orders', to: '/work-orders', icon: ClipboardList, permModule: 'work_orders' },
      { label: 'Appointments', to: '/appointments', icon: CalendarClock, permModule: 'work_orders' },
      { label: 'Service Catalog', to: '/service-catalog', icon: BookOpen, permModule: 'service_catalog' },
    ],
  },
  {
    label: 'Technology',
    items: [
      { label: 'Asset Management', to: '/assets', icon: HardDrive, permModule: 'assets' },
      { label: 'Infrastructure', to: '/infrastructure', icon: Server, permModule: 'assets' },
      { label: 'Security', to: '/security', icon: Shield, permModule: 'assets' },
      { label: 'Lifecycle', to: '/lifecycle', icon: RefreshCw, permModule: 'assets' },
      { label: 'Projects', to: '/projects', icon: FolderKanban, permModule: 'projects' },
    ],
  },
  {
    label: 'Finance',
    items: [
      { label: 'Quotations', to: '/quotations', icon: FileSpreadsheet, permModule: 'finance' },
      { label: 'Invoices', to: '/invoices', icon: Receipt, permModule: 'finance' },
      { label: 'Expenses', to: '/expenses', icon: CreditCard, permModule: 'finance' },
      { label: 'Financial Overview', to: '/financial-overview', icon: BarChart3, permModule: 'finance' },
    ],
  },
  {
    label: 'Corporate',
    items: [
      { label: 'Documents', to: '/documents', icon: FileText, permModule: 'documents' },
      { label: 'Policies & Procedures', to: '/policies', icon: ScrollText, permModule: 'documents' },
      { label: 'Company Roadmap', to: '/roadmap', icon: Map, permModule: 'projects' },
      { label: 'Employees', to: '/employees', icon: UserCog, permModule: 'employees' },
      { label: 'Departments', to: '/departments', icon: Network, permModule: 'employees' },
    ],
  },
  {
    label: 'Administration',
    items: [
      { label: 'User Management', to: '/admin/users', icon: UserCheck, permModule: 'admin' },
      { label: 'Roles & Permissions', to: '/admin/roles', icon: KeyRound, permModule: 'admin' },
      { label: 'Activity Logs', to: '/admin/audit-logs', icon: History, permModule: 'admin' },
      { label: 'Integrations', to: '/admin/integrations', icon: Plug, permModule: 'admin' },
      { label: 'Company Settings', to: '/admin/settings', icon: Settings, permModule: 'admin' },
    ],
  },
];

const ROUTE_BREADCRUMBS: Record<string, [string, string]> = {
  '/': ['Workspace', 'Overview'],
  '/tasks': ['Workspace', 'My Tasks'],
  '/calendar': ['Workspace', 'Calendar'],
  '/notifications': ['Workspace', 'Notifications'],
  '/customers': ['Customer Management', 'Customers'],
  '/organizations': ['Customer Management', 'Organizations'],
  '/contacts': ['Customer Management', 'Contacts'],
  '/leads': ['Customer Management', 'Leads'],
  '/service-desk': ['Service Operations', 'Service Desk'],
  '/service-requests': ['Service Operations', 'Service Requests'],
  '/work-orders': ['Service Operations', 'Work Orders'],
  '/appointments': ['Service Operations', 'Appointments'],
  '/service-catalog': ['Service Operations', 'Service Catalog'],
  '/assets': ['Technology', 'Asset Management'],
  '/infrastructure': ['Technology', 'Infrastructure'],
  '/security': ['Technology', 'Security'],
  '/lifecycle': ['Technology', 'Lifecycle'],
  '/projects': ['Technology', 'Projects'],
  '/quotations': ['Finance', 'Quotations'],
  '/invoices': ['Finance', 'Invoices'],
  '/expenses': ['Finance', 'Expenses'],
  '/financial-overview': ['Finance', 'Financial Overview'],
  '/documents': ['Corporate', 'Documents'],
  '/policies': ['Corporate', 'Policies & Procedures'],
  '/roadmap': ['Corporate', 'Company Roadmap'],
  '/employees': ['Corporate', 'Employees'],
  '/departments': ['Corporate', 'Departments'],
  '/admin/users': ['Administration', 'User Management'],
  '/admin/roles': ['Administration', 'Roles & Permissions'],
  '/admin/audit-logs': ['Administration', 'Activity Logs'],
  '/admin/integrations': ['Administration', 'Integrations'],
  '/admin/settings': ['Administration', 'Company Settings'],
};

export const AppShell: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, settings, theme, toggleTheme, logout, unreadNotifications, refreshProfile, hasPermission } = useApp();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [profileOpen, setProfileOpen] = useState(false);

  const location = useLocation();
  const navigate = useNavigate();
  const searchRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    const onOutside = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setSearchOpen(false);
      }
    };
    document.addEventListener('mousedown', onOutside);
    return () => document.removeEventListener('mousedown', onOutside);
  }, []);

  useEffect(() => {
    const trimmed = searchQuery.trim();
    if (trimmed.length < 2) {
      setSearchResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const res = await apiFetch<{ results: any[] }>(`/api/search?q=${encodeURIComponent(trimmed)}`);
        setSearchResults(res.results || []);
        setSearchOpen(true);
      } catch {
        setSearchResults([]);
      }
    }, 180);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const openNotifications = async () => {
    const next = !notifOpen;
    setNotifOpen(next);
    setProfileOpen(false);
    if (next) {
      try {
        const res = await apiFetch<{ items: any[] }>('/api/notifications');
        setNotifications(res.items || []);
      } catch {
        setNotifications([]);
      }
    }
  };

  const markAllRead = async () => {
    try {
      await apiFetch('/api/notifications/read-all', { method: 'POST' });
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: 1 })));
      await refreshProfile();
    } catch {
      // ignore
    }
  };

  const resolveBreadcrumb = (): [string, string] => {
    if (ROUTE_BREADCRUMBS[location.pathname]) return ROUTE_BREADCRUMBS[location.pathname];
    if (location.pathname.startsWith('/customers/')) return ['Customer Management', 'Customer Profile'];
    if (location.pathname.startsWith('/service-desk/')) return ['Service Operations', 'Ticket Detail'];
    return ['Workspace', 'KORTRIX ONE'];
  };
  const [sectionCrumb, pageCrumb] = resolveBreadcrumb();

  const renderNav = (isMobile = false) => (
    <nav className="flex-1 overflow-y-auto px-2.5 py-3 space-y-5" aria-label="Primary Sidebar Navigation">
      {NAV_SECTIONS.map((sec) => {
        const visibleItems = sec.items.filter((item) => !item.permModule || hasPermission(item.permModule, 'view'));
        if (visibleItems.length === 0) return null;
        return (
          <div key={sec.label}>
            {(!collapsed || isMobile) && (
              <div className="px-2.5 mb-1.5 text-[11px] font-semibold tracking-[0.04em] text-[#64748B] dark:text-[#64748B]">
                {sec.label}
              </div>
            )}
            <div className="space-y-0.5">
              {visibleItems.map((item) => {
                const Icon = item.icon;
                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.to === '/'}
                    title={collapsed && !isMobile ? item.label : undefined}
                    className={({ isActive }) =>
                      `flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-[13px] transition-colors whitespace-nowrap ${
                        isActive
                          ? 'bg-[#0047FF]/10 text-[#0047FF] dark:bg-[#0047FF]/20 dark:text-[#60A5FA] font-medium'
                          : 'text-[#334155] dark:text-[#CBD5E1] hover:bg-[#EBF0F6] dark:hover:bg-[#1C2432] hover:text-[#0B1018] dark:hover:text-white'
                      }`
                    }
                  >
                    <Icon className="w-4 h-4 shrink-0" />
                    {(!collapsed || isMobile) && <span className="truncate">{item.label}</span>}
                  </NavLink>
                );
              })}
            </div>
          </div>
        );
      })}
    </nav>
  );

  return (
    <div className="min-h-screen flex bg-[#F4F6F9] dark:bg-[#0B1018] text-[#0B1018] dark:text-[#F4F6F9]">
      {/* Desktop Sidebar */}
      <aside
        className={`no-print hidden lg:flex flex-col shrink-0 bg-white dark:bg-[#141A24] border-r border-[#DCE2EA] dark:border-[#242D3D] transition-[width] duration-150 ${
          collapsed ? 'w-[60px]' : 'w-[248px]'
        } sticky top-0 h-screen`}
      >
        <div className="h-[52px] px-3 flex items-center justify-between border-b border-[#DCE2EA] dark:border-[#242D3D] shrink-0">
          <NavLink to="/" className="min-w-0 overflow-hidden">
            <KortrixLogo logoDataUrl={settings?.logo_data_url} compact={collapsed} />
          </NavLink>
          <button
            type="button"
            onClick={() => setCollapsed((c) => !c)}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className="p-1.5 rounded-md text-[#64748B] hover:text-[#0B1018] dark:hover:text-white hover:bg-[#F4F6F9] dark:hover:bg-[#1C2432] cursor-pointer"
          >
            {collapsed ? <PanelLeftOpen className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}
          </button>
        </div>
        {renderNav(false)}
      </aside>

      {/* Mobile Sidebar Overlay */}
      {mobileOpen && (
        <div className="no-print fixed inset-0 z-50 lg:hidden flex">
          <div className="fixed inset-0 bg-[#0B1018]/60" onClick={() => setMobileOpen(false)} />
          <aside className="relative w-[272px] max-w-[85vw] bg-white dark:bg-[#141A24] h-full flex flex-col border-r border-[#DCE2EA] dark:border-[#242D3D] z-10">
            <div className="h-[52px] px-4 flex items-center justify-between border-b border-[#DCE2EA] dark:border-[#242D3D]">
              <KortrixLogo logoDataUrl={settings?.logo_data_url} />
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                aria-label="Close navigation"
                className="p-1.5 rounded-md text-[#64748B] hover:text-[#0B1018] dark:hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            {renderNav(true)}
          </aside>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Compact Enterprise Header */}
        <header className="no-print sticky top-0 z-30 h-[52px] bg-white dark:bg-[#141A24] border-b border-[#DCE2EA] dark:border-[#242D3D] px-4 lg:px-6 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              aria-label="Open navigation menu"
              className="lg:hidden p-1.5 rounded-md text-[#475569] dark:text-[#CBD5E1] hover:bg-[#F4F6F9] dark:hover:bg-[#1C2432]"
            >
              <Menu className="w-5 h-5" />
            </button>

            {/* Breadcrumbs */}
            <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-[13px] min-w-0">
              <span className="text-[#64748B] dark:text-[#94A3B8] hidden sm:inline whitespace-nowrap">{sectionCrumb}</span>
              <ChevronRight className="w-3.5 h-3.5 text-[#94A3B8] hidden sm:inline shrink-0" />
              <span className="font-medium text-[#0B1018] dark:text-white truncate">{pageCrumb}</span>
            </nav>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            {/* Global Search */}
            <div ref={searchRef} className="relative hidden md:block w-64 lg:w-80">
              <Search className="w-3.5 h-3.5 text-[#64748B] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="search"
                value={searchQuery}
                onFocus={() => searchResults.length > 0 && setSearchOpen(true)}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search customers, tickets, services, docs..."
                aria-label="Global workspace search"
                className="w-full pl-8 pr-3 py-1.5 text-[12.5px] rounded-md bg-[#F4F6F9] dark:bg-[#0B1018] border border-[#DCE2EA] dark:border-[#242D3D] text-[#0B1018] dark:text-[#F4F6F9] placeholder:text-[#64748B] focus:outline-none focus:border-[#0047FF] focus:bg-white dark:focus:bg-[#0B1018]"
              />
              {searchOpen && (
                <div className="absolute right-0 mt-1.5 w-full min-w-[340px] bg-white dark:bg-[#141A24] border border-[#DCE2EA] dark:border-[#2B3548] rounded-md shadow-lg z-50 overflow-hidden">
                  {searchResults.length === 0 ? (
                    <div className="px-4 py-3 text-xs text-[#64748B]">No matching records found.</div>
                  ) : (
                    <div className="divide-y divide-[#E2E8F0] dark:divide-[#242D3D] max-h-80 overflow-y-auto">
                      {searchResults.map((r) => (
                        <button
                          key={`${r.type}-${r.id}`}
                          type="button"
                          onClick={() => {
                            setSearchOpen(false);
                            setSearchQuery('');
                            navigate(r.path);
                          }}
                          className="w-full px-3.5 py-2.5 text-left hover:bg-[#F4F6F9] dark:hover:bg-[#1C2432] flex items-center justify-between gap-3 cursor-pointer"
                        >
                          <div className="min-w-0">
                            <div className="text-[13px] font-medium text-[#0B1018] dark:text-white truncate">{r.title}</div>
                            <div className="text-[11.5px] text-[#64748B] truncate">
                              {r.type} · {r.subtitle}
                            </div>
                          </div>
                          <span className="font-mono text-[11px] text-[#475569] dark:text-[#94A3B8] shrink-0">{r.code}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Theme Switch */}
            <button
              type="button"
              onClick={toggleTheme}
              aria-label={theme === 'dark' ? 'Switch to light interface' : 'Switch to dark interface'}
              title={theme === 'dark' ? 'Light mode' : 'Dark mode'}
              className="p-2 rounded-md text-[#475569] dark:text-[#CBD5E1] hover:bg-[#F4F6F9] dark:hover:bg-[#1C2432] cursor-pointer"
            >
              {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>

            {/* Notification Center */}
            <div className="relative">
              <button
                type="button"
                onClick={openNotifications}
                aria-label="Open notifications"
                className="relative p-2 rounded-md text-[#475569] dark:text-[#CBD5E1] hover:bg-[#F4F6F9] dark:hover:bg-[#1C2432] cursor-pointer"
              >
                <Bell className="w-4 h-4" />
                {unreadNotifications > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 font-mono text-[10px] font-semibold bg-[#0047FF] text-white px-1 rounded">
                    {unreadNotifications}
                  </span>
                )}
              </button>
              {notifOpen && (
                <div className="absolute right-0 mt-1.5 w-80 bg-white dark:bg-[#141A24] border border-[#DCE2EA] dark:border-[#2B3548] rounded-md shadow-lg z-50">
                  <div className="px-3.5 py-2.5 border-b border-[#DCE2EA] dark:border-[#242D3D] flex items-center justify-between">
                    <span className="text-xs font-semibold text-[#0B1018] dark:text-white">Notifications</span>
                    <button type="button" onClick={markAllRead} className="text-[11.5px] text-[#0047FF] hover:underline cursor-pointer">
                      Mark all read
                    </button>
                  </div>
                  <div className="max-h-72 overflow-y-auto divide-y divide-[#E2E8F0] dark:divide-[#242D3D]">
                    {notifications.length === 0 ? (
                      <div className="px-4 py-6 text-center text-xs text-[#64748B]">No notifications recorded.</div>
                    ) : (
                      notifications.slice(0, 8).map((n) => (
                        <button
                          key={n.id}
                          type="button"
                          onClick={() => {
                            setNotifOpen(false);
                            navigate(n.link || '/notifications');
                          }}
                          className="w-full px-3.5 py-2.5 text-left hover:bg-[#F4F6F9] dark:hover:bg-[#1C2432] cursor-pointer"
                        >
                          <div className="text-[12.5px] font-medium text-[#0B1018] dark:text-white">{n.title}</div>
                          <div className="text-[11.5px] text-[#64748B] mt-0.5">{n.message}</div>
                          <div className="text-[10.5px] font-mono text-[#94A3B8] mt-1">{formatDateTime(n.created_at)}</div>
                        </button>
                      ))
                    )}
                  </div>
                  <div className="px-3.5 py-2 border-t border-[#DCE2EA] dark:border-[#242D3D]">
                    <button
                      type="button"
                      onClick={() => {
                        setNotifOpen(false);
                        navigate('/notifications');
                      }}
                      className="text-xs text-[#0047FF] hover:underline cursor-pointer"
                    >
                      View all notifications
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* User Profile Menu */}
            <div className="relative">
              <button
                type="button"
                onClick={() => {
                  setProfileOpen((o) => !o);
                  setNotifOpen(false);
                }}
                className="flex items-center gap-2 pl-2 pr-2.5 py-1 rounded-md border border-[#DCE2EA] dark:border-[#2B3548] hover:bg-[#F4F6F9] dark:hover:bg-[#1C2432] cursor-pointer"
              >
                <span className="w-6 h-6 rounded bg-[#0B1018] dark:bg-[#0047FF] text-white text-xs font-semibold flex items-center justify-center">
                  {(user?.full_name || 'D').slice(0, 1).toUpperCase()}
                </span>
                <span className="hidden sm:block text-left leading-tight">
                  <span className="block text-[12.5px] font-medium text-[#0B1018] dark:text-white">{user?.full_name}</span>
                  <span className="block text-[10.5px] text-[#64748B]">{user?.role_name}</span>
                </span>
              </button>
              {profileOpen && (
                <div className="absolute right-0 mt-1.5 w-60 bg-white dark:bg-[#141A24] border border-[#DCE2EA] dark:border-[#2B3548] rounded-md shadow-lg z-50 py-1.5">
                  <div className="px-3.5 py-2 border-b border-[#DCE2EA] dark:border-[#242D3D]">
                    <div className="text-[13px] font-medium text-[#0B1018] dark:text-white">{user?.full_name}</div>
                    <div className="text-[11.5px] text-[#64748B] truncate">{user?.email}</div>
                    <div className="text-[11px] text-[#475569] dark:text-[#94A3B8] mt-0.5">
                      {user?.role_name} · {user?.position || 'Internal Staff'}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setProfileOpen(false);
                      navigate('/admin/settings');
                    }}
                    className="w-full px-3.5 py-2 text-left text-[12.5px] text-[#334155] dark:text-[#CBD5E1] hover:bg-[#F4F6F9] dark:hover:bg-[#1C2432] flex items-center gap-2 cursor-pointer"
                  >
                    <Settings className="w-3.5 h-3.5" /> Company Settings
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setProfileOpen(false);
                      logout();
                    }}
                    className="w-full px-3.5 py-2 text-left text-[12.5px] text-[#DC2626] dark:text-[#F87171] hover:bg-[#FEF2F2] dark:hover:bg-[#450A0A]/40 flex items-center gap-2 cursor-pointer"
                  >
                    <LogOut className="w-3.5 h-3.5" /> Sign Out
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Page Viewport */}
        <main className="flex-1 p-4 sm:p-6 max-w-[1600px] w-full mx-auto">
          {children}
        </main>
      </div>
    </div>
  );
};
