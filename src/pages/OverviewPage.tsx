import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Plus, ArrowRight, CheckCircle2, Circle, Upload, CalendarPlus, FileSpreadsheet,
  ClipboardList, Headphones, UserPlus, ListChecks,
} from 'lucide-react';
import { apiFetch, formatCurrency, formatDate, formatDateTime } from '../lib/api';
import { useApp } from '../context/AppContext';
import { Button, PageHeader, StatusText, Surface } from '../components/ui';

interface DashboardData {
  metrics: {
    totalCustomers: number;
    activeServiceRequests: number;
    openSupportTickets: number;
    scheduledAppointments: number;
    outstandingQuotations: number;
    outstandingQuotationsValue: number;
    outstandingInvoices: number;
    outstandingInvoicesValue: number;
    monthlyRecordedRevenue: number;
    managedAssets: number;
    activeProjects: number;
    upcomingTasks: number;
  };
  launchRoadmap: {
    total: number;
    completed: number;
    pending: number;
  };
  upcomingTasksList: any[];
  recentActivity: any[];
}

export const OverviewPage: React.FC = () => {
  const { settings, user } = useApp();
  const navigate = useNavigate();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await apiFetch<DashboardData>('/api/dashboard');
        if (active) setData(res);
      } catch (err: any) {
        if (active) setError(err.message || 'Unable to load executive overview.');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const m = data?.metrics;
  const currency = settings?.currency || 'USD';
  const launchPct = data && data.launchRoadmap.total > 0
    ? Math.round((data.launchRoadmap.completed / data.launchRoadmap.total) * 100)
    : 0;

  const kpis = [
    { label: 'Total Customers', value: m ? String(m.totalCustomers) : '—', sub: 'Active CRM accounts', to: '/customers' },
    { label: 'Active Service Requests', value: m ? String(m.activeServiceRequests) : '—', sub: 'Website intake queue', to: '/service-requests' },
    { label: 'Open Support Tickets', value: m ? String(m.openSupportTickets) : '—', sub: 'Unresolved service desk', to: '/service-desk' },
    { label: 'Scheduled Appointments', value: m ? String(m.scheduledAppointments) : '—', sub: 'Upcoming calendar visits', to: '/calendar' },
    { label: 'Outstanding Quotations', value: m ? String(m.outstandingQuotations) : '—', sub: m ? formatCurrency(m.outstandingQuotationsValue, currency) : '—', to: '/quotations' },
    { label: 'Outstanding Invoices', value: m ? String(m.outstandingInvoices) : '—', sub: m ? formatCurrency(m.outstandingInvoicesValue, currency) : '—', to: '/invoices' },
    { label: 'Monthly Recorded Revenue', value: m ? formatCurrency(m.monthlyRecordedRevenue, currency) : '—', sub: 'Paid invoices this month', to: '/financial-overview' },
    { label: 'Managed Tech Assets', value: m ? String(m.managedAssets) : '—', sub: 'Active ITAM inventory', to: '/assets' },
    { label: 'Active Projects', value: m ? String(m.activeProjects) : '—', sub: 'Corporate & delivery', to: '/projects' },
    { label: 'Upcoming Tasks', value: m ? String(m.upcomingTasks) : '—', sub: 'Open action items', to: '/tasks' },
  ];

  const quickActions = [
    { label: 'Create Customer', icon: UserPlus, to: '/customers?new=1' },
    { label: 'Create Ticket', icon: Headphones, to: '/service-desk?new=1' },
    { label: 'Create Work Order', icon: ClipboardList, to: '/work-orders?new=1' },
    { label: 'Schedule Appointment', icon: CalendarPlus, to: '/calendar?new=1' },
    { label: 'Create Quotation', icon: FileSpreadsheet, to: '/quotations?new=1' },
    { label: 'Upload Document', icon: Upload, to: '/documents?new=1' },
    { label: 'Create Task', icon: ListChecks, to: '/tasks?new=1' },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Executive Operations Overview"
        description={`${settings?.company_name || 'KORTRIX'} · ${settings?.legal_status || 'Pre-Formation'} · Signed in as ${user?.full_name} (${user?.role_name})`}
        actions={
          <Button variant="primary" onClick={() => navigate('/roadmap')}>
            <Plus className="w-4 h-4" /> Company Roadmap
          </Button>
        }
      />

      {error && (
        <div className="p-3.5 rounded-md bg-[#FEF2F2] dark:bg-[#450A0A]/40 border border-[#FECACA] dark:border-[#7F1D1D] text-[13px] text-[#B91C1C] dark:text-[#FCA5A5]">
          {error}
        </div>
      )}

      {/* Quick Actions Bar */}
      <Surface className="p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-display text-[13px] font-semibold text-[#0B1018] dark:text-white">Quick Actions</h2>
          <span className="text-[12px] text-[#64748B]">Direct operational record entry</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {quickActions.map((qa) => {
            const Icon = qa.icon;
            return (
              <Button key={qa.label} variant="secondary" size="sm" onClick={() => navigate(qa.to)}>
                <Icon className="w-3.5 h-3.5 text-[#0047FF]" />
                {qa.label}
              </Button>
            );
          })}
        </div>
      </Surface>

      {/* 10 Live Operational Metrics Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        {kpis.map((item) => (
          <button
            key={item.label}
            type="button"
            onClick={() => navigate(item.to)}
            className="text-left p-4 bg-white dark:bg-[#141A24] border border-[#DCE2EA] dark:border-[#242D3D] rounded-md hover:border-[#0047FF]/60 transition-colors cursor-pointer"
          >
            <div className="text-[12px] font-medium text-[#526075] dark:text-[#94A3B8] truncate">{item.label}</div>
            <div className={`mt-2 font-mono text-2xl font-semibold tracking-tight text-[#0B1018] dark:text-white tabular-nums ${loading ? 'opacity-40' : ''}`}>
              {item.value}
            </div>
            <div className="mt-1 text-[11.5px] text-[#64748B] dark:text-[#94A3B8] font-mono tabular-nums truncate">
              {item.sub}
            </div>
          </button>
        ))}
      </div>

      {/* Launch Roadmap Progress + Main Two-Column Operations Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Left: Company Launch Progress & Upcoming Tasks */}
        <div className="lg:col-span-7 space-y-5">
          <Surface className="p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="font-display text-[15px] font-semibold text-[#0B1018] dark:text-white">
                  KORTRIX Company Launch Roadmap
                </h2>
                <p className="mt-0.5 text-[12.5px] text-[#526075] dark:text-[#94A3B8]">
                  Foundational operational readiness milestones persisted in SQL database
                </p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => navigate('/roadmap')}>
                Open Roadmap <ArrowRight className="w-3.5 h-3.5" />
              </Button>
            </div>

            <div className="mt-4">
              <div className="flex items-center justify-between text-xs mb-1.5">
                <span className="font-medium text-[#334155] dark:text-[#CBD5E1]">
                  {data ? `${data.launchRoadmap.completed} of ${data.launchRoadmap.total} milestones completed` : 'Loading...'}
                </span>
                <span className="font-mono font-semibold text-[#0047FF] tabular-nums">{launchPct}%</span>
              </div>
              <div className="h-2 bg-[#EBF0F6] dark:bg-[#0B1018] rounded-sm overflow-hidden">
                <div className="h-full bg-[#0047FF] transition-all duration-300" style={{ width: `${launchPct}%` }} />
              </div>
            </div>
          </Surface>

          <Surface>
            <div className="px-5 py-3.5 border-b border-[#DCE2EA] dark:border-[#242D3D] flex items-center justify-between">
              <h2 className="font-display text-[14px] font-semibold text-[#0B1018] dark:text-white">
                Upcoming Tasks & Launch Milestones
              </h2>
              <button
                type="button"
                onClick={() => navigate('/tasks')}
                className="text-xs font-medium text-[#0047FF] hover:underline cursor-pointer"
              >
                View all tasks
              </button>
            </div>
            {!data || data.upcomingTasksList.length === 0 ? (
              <div className="p-8 text-center text-[13px] text-[#64748B]">
                No pending tasks. All scheduled work items are completed.
              </div>
            ) : (
              <div className="divide-y divide-[#E2E8F0] dark:divide-[#242D3D]">
                {data.upcomingTasksList.map((task) => (
                  <div
                    key={task.id}
                    onClick={() => navigate('/roadmap')}
                    className="px-5 py-3 flex items-center justify-between gap-4 hover:bg-[#F8FAFC] dark:hover:bg-[#1A2230] cursor-pointer"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      {task.status === 'Completed' ? (
                        <CheckCircle2 className="w-4 h-4 text-[#15803D] shrink-0" />
                      ) : (
                        <Circle className="w-4 h-4 text-[#94A3B8] shrink-0" />
                      )}
                      <div className="min-w-0">
                        <div className="text-[13px] font-medium text-[#0B1018] dark:text-white truncate">{task.title}</div>
                        <div className="text-[11.5px] text-[#64748B] truncate">
                          {task.project_name || 'General Workspace'} · {task.due_date ? `Due ${formatDate(task.due_date)}` : 'No due date'}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0 text-xs">
                      <StatusText value={task.priority} />
                      <span className="text-[#CBD5E1] dark:text-[#334155]">·</span>
                      <StatusText value={task.status} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Surface>
        </div>

        {/* Right: Recent Activity / Audit Trail */}
        <Surface className="lg:col-span-5">
          <div className="px-5 py-3.5 border-b border-[#DCE2EA] dark:border-[#242D3D] flex items-center justify-between">
            <h2 className="font-display text-[14px] font-semibold text-[#0B1018] dark:text-white">
              Recent Activity Feed
            </h2>
            <button
              type="button"
              onClick={() => navigate('/admin/audit-logs')}
              className="text-xs font-medium text-[#0047FF] hover:underline cursor-pointer"
            >
              Audit log
            </button>
          </div>
          {!data || data.recentActivity.length === 0 ? (
            <div className="p-8 text-center text-[13px] text-[#64748B]">
              No activity recorded yet. Create records or update configuration to populate the audit feed.
            </div>
          ) : (
            <div className="divide-y divide-[#E2E8F0] dark:divide-[#242D3D]">
              {data.recentActivity.map((log) => (
                <div key={log.id} className="px-5 py-3">
                  <div className="text-[13px] text-[#0B1018] dark:text-[#E2E8F0]">{log.summary}</div>
                  <div className="mt-1 flex items-center gap-2 text-[11.5px] text-[#64748B] font-mono">
                    <span>{log.actor_email || 'system'}</span>
                    <span>·</span>
                    <span>{log.module}</span>
                    <span>·</span>
                    <span>{formatDateTime(log.created_at)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Surface>
      </div>
    </div>
  );
};
