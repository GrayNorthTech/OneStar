import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Plus, ArrowLeft, Columns3, List, MessageSquarePlus } from 'lucide-react';
import { apiFetch, formatDate, formatDateTime } from '../lib/api';
import { Button, EmptyState, Field, inputClass, Modal, PageHeader, StatusText, Surface } from '../components/ui';

const PRIORITIES = ['Low', 'Normal', 'High', 'Critical'] as const;
const STATUSES = ['New', 'Assigned', 'In Progress', 'Awaiting Customer', 'Awaiting Parts', 'Escalated', 'Resolved', 'Closed', 'Cancelled'] as const;
const BOARD_COLUMNS = ['New', 'Assigned', 'In Progress', 'Awaiting Customer', 'Escalated', 'Resolved'] as const;

export const ServiceDeskPage: React.FC<{ requestsOnly?: boolean }> = ({ requestsOnly = false }) => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [tickets, setTickets] = useState<any[]>([]);
  const [detail, setDetail] = useState<any | null>(null);
  const [customers, setCustomers] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [departments, setDepartments] = useState<any[]>([]);
  const [viewMode, setViewMode] = useState<'table' | 'board'>('table');
  const [statusFilter, setStatusFilter] = useState('All');
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [noteText, setNoteText] = useState('');
  const [resolutionText, setResolutionText] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [form, setForm] = useState({
    customer_id: '',
    subject: '',
    description: '',
    service_category: 'KORTRIX Infrastructure',
    assigned_technician_id: '',
    department_id: 'dept-ops',
    priority: 'Normal',
    status: 'New',
    due_date: '',
  });

  const loadList = useCallback(async () => {
    setLoading(true);
    try {
      const qs = requestsOnly ? '?source=Public%20Intake' : '';
      const [tRes, cRes, uRes, dRes] = await Promise.all([
        apiFetch<{ items: any[] }>(`/api/tickets${qs}`),
        apiFetch<{ items: any[] }>('/api/customers'),
        apiFetch<{ items: any[] }>('/api/users').catch(() => ({ items: [] })),
        apiFetch<{ items: any[] }>('/api/departments'),
      ]);
      setTickets(tRes.items || []);
      setCustomers(cRes.items || []);
      setUsers(uRes.items || []);
      setDepartments(dRes.items || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [requestsOnly]);

  const loadDetail = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const [res, uRes] = await Promise.all([
        apiFetch<{ ticket: any }>(`/api/tickets/${id}`),
        apiFetch<{ items: any[] }>('/api/users').catch(() => ({ items: [] })),
      ]);
      setDetail(res.ticket);
      setResolutionText(res.ticket?.resolution || '');
      setUsers(uRes.items || []);
    } catch {
      setDetail(null);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    if (id) loadDetail();
    else loadList();
  }, [id, loadDetail, loadList]);

  useEffect(() => {
    if (searchParams.get('new') === '1') {
      setModalOpen(true);
      setSearchParams({});
    }
  }, [searchParams, setSearchParams]);

  const handleCreateTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      const res = await apiFetch<{ id: string }>('/api/tickets', {
        method: 'POST',
        body: JSON.stringify({
          ...form,
          customer_id: form.customer_id || null,
          assigned_technician_id: form.assigned_technician_id || null,
          due_date: form.due_date || null,
        }),
      });
      setModalOpen(false);
      setForm({ customer_id: '', subject: '', description: '', service_category: 'KORTRIX Infrastructure', assigned_technician_id: '', department_id: 'dept-ops', priority: 'Normal', status: 'New', due_date: '' });
      navigate(`/service-desk/${res.id}`);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const updateDetailField = async (patch: Record<string, any>) => {
    if (!id) return;
    await apiFetch(`/api/tickets/${id}`, { method: 'PUT', body: JSON.stringify(patch) });
    await loadDetail();
  };

  const addInternalNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id || !noteText.trim()) return;
    await apiFetch(`/api/tickets/${id}/notes`, { method: 'POST', body: JSON.stringify({ text: noteText }) });
    setNoteText('');
    await loadDetail();
  };

  // TICKET DETAIL VIEW
  if (id) {
    if (loading) return <Surface className="p-8 text-center text-xs text-[#64748B]">Loading ticket...</Surface>;
    if (!detail) return <Surface className="p-8 text-center text-sm text-[#64748B]">Ticket not found.</Surface>;

    return (
      <div className="space-y-5">
        <button type="button" onClick={() => navigate('/service-desk')} className="inline-flex items-center gap-1.5 text-xs font-medium text-[#526075] hover:text-[#0047FF] cursor-pointer">
          <ArrowLeft className="w-3.5 h-3.5" /> Back to Service Desk
        </button>

        <PageHeader
          title={`${detail.ticket_number} — ${detail.subject}`}
          description={`Source: ${detail.source} · Category: ${detail.service_category} · Opened ${formatDateTime(detail.created_at)}`}
        />

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          <div className="lg:col-span-8 space-y-5">
            <Surface className="p-5 space-y-3">
              <h2 className="font-display text-[14px] font-semibold">Issue Description</h2>
              <p className="text-[13.5px] text-[#334155] dark:text-[#CBD5E1] whitespace-pre-wrap leading-relaxed">
                {detail.description || 'No description provided.'}
              </p>
            </Surface>

            <Surface className="p-5 space-y-3">
              <h2 className="font-display text-[14px] font-semibold">Resolution Summary</h2>
              <textarea
                rows={3}
                value={resolutionText}
                onChange={(e) => setResolutionText(e.target.value)}
                placeholder="Document root cause and technical resolution..."
                className={inputClass}
              />
              <div className="flex justify-end">
                <Button variant="secondary" size="sm" onClick={() => updateDetailField({ resolution: resolutionText })}>
                  Save Resolution
                </Button>
              </div>
            </Surface>

            <Surface className="p-5 space-y-4">
              <h2 className="font-display text-[14px] font-semibold">Internal Technical Notes</h2>
              <form onSubmit={addInternalNote} className="flex gap-2">
                <input value={noteText} onChange={(e) => setNoteText(e.target.value)} placeholder="Add internal note (never exposed externally)..." className={inputClass} />
                <Button type="submit" variant="primary"><MessageSquarePlus className="w-4 h-4" /> Add</Button>
              </form>
              <div className="divide-y divide-[#E2E8F0] dark:divide-[#242D3D]">
                {(detail.internal_notes || []).length === 0 ? (
                  <div className="py-4 text-xs text-[#64748B]">No internal notes recorded yet.</div>
                ) : (
                  detail.internal_notes.map((n: any) => (
                    <div key={n.id} className="py-3">
                      <div className="text-[13px]">{n.text}</div>
                      <div className="mt-1 font-mono text-[11px] text-[#64748B]">{n.author} · {formatDateTime(n.at)}</div>
                    </div>
                  ))
                )}
              </div>
            </Surface>
          </div>

          <div className="lg:col-span-4 space-y-5">
            <Surface className="p-5 space-y-4">
              <h2 className="font-display text-[14px] font-semibold">Ticket Controls</h2>
              <Field label="Status">
                <select value={detail.status} onChange={(e) => updateDetailField({ status: e.target.value })} className={inputClass}>
                  {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </Field>
              <Field label="Priority">
                <select value={detail.priority} onChange={(e) => updateDetailField({ priority: e.target.value })} className={inputClass}>
                  {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
              </Field>
              <Field label="Assigned Technician">
                <select value={detail.assigned_technician_id || ''} onChange={(e) => updateDetailField({ assigned_technician_id: e.target.value || null })} className={inputClass}>
                  <option value="">Unassigned</option>
                  {users.map((u) => <option key={u.id} value={u.id}>{u.full_name}</option>)}
                </select>
              </Field>
              <div className="pt-3 border-t border-[#DCE2EA] dark:border-[#242D3D] text-xs space-y-1.5">
                <div className="text-[#64748B]">Associated Customer</div>
                {detail.customer_id ? (
                  <button type="button" onClick={() => navigate(`/customers/${detail.customer_id}`)} className="text-[#0047FF] font-medium hover:underline cursor-pointer">
                    {detail.customer_code} — {detail.customer_name}
                  </button>
                ) : (
                  <div>{detail.requester_name || 'Unlinked'} {detail.requester_email ? `(${detail.requester_email})` : ''}</div>
                )}
              </div>
            </Surface>

            <Surface className="p-5 space-y-3">
              <h2 className="font-display text-[14px] font-semibold">Activity History</h2>
              <div className="divide-y divide-[#E2E8F0] dark:divide-[#242D3D]">
                {(detail.activity || []).map((a: any, idx: number) => (
                  <div key={idx} className="py-2.5 text-xs">
                    <div className="text-[#0B1018] dark:text-[#E2E8F0]">{a.text}</div>
                    <div className="mt-0.5 font-mono text-[11px] text-[#64748B]">{a.actor} · {formatDateTime(a.at)}</div>
                  </div>
                ))}
              </div>
            </Surface>
          </div>
        </div>
      </div>
    );
  }

  // LIST / BOARD VIEW
  const filtered = tickets.filter((t) => {
    if (statusFilter !== 'All' && t.status !== statusFilter) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      return t.subject.toLowerCase().includes(q) || t.ticket_number.toLowerCase().includes(q) || (t.customer_name || '').toLowerCase().includes(q);
    }
    return true;
  });

  return (
    <div className="space-y-5">
      <PageHeader
        title={requestsOnly ? 'Service Requests (kortrix.com Intake)' : 'Service Desk'}
        description={
          requestsOnly
            ? 'Inbound service requests submitted via the secured kortrix.com write-only intake API endpoint (POST /api/public/service-requests).'
            : 'Internal technical support ticketing queue with priority escalation, technician assignment, and full audit history.'
        }
        actions={
          <Button variant="primary" onClick={() => setModalOpen(true)}>
            <Plus className="w-4 h-4" /> Create Ticket
          </Button>
        }
      />

      {error && <div className="p-3 rounded-md bg-[#FEF2F2] border border-[#FECACA] text-xs text-[#B91C1C]">{error}</div>}

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search tickets..." className={`${inputClass} sm:w-64`} />
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className={`${inputClass} sm:w-44`}>
            <option value="All">All Statuses</option>
            {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div className="flex items-center gap-1 p-1 bg-[#EBF0F6] dark:bg-[#141A24] border border-[#DCE2EA] dark:border-[#242D3D] rounded-md self-start">
          <button type="button" onClick={() => setViewMode('table')} className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded cursor-pointer ${viewMode === 'table' ? 'bg-white dark:bg-[#0B1018] text-[#0B1018] dark:text-white' : 'text-[#526075]'}`}><List className="w-3.5 h-3.5" /> Table</button>
          <button type="button" onClick={() => setViewMode('board')} className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded cursor-pointer ${viewMode === 'board' ? 'bg-white dark:bg-[#0B1018] text-[#0B1018] dark:text-white' : 'text-[#526075]'}`}><Columns3 className="w-3.5 h-3.5" /> Board</button>
        </div>
      </div>

      {loading ? (
        <Surface className="p-8 text-center text-xs text-[#64748B]">Loading service desk...</Surface>
      ) : filtered.length === 0 ? (
        <EmptyState
          title={requestsOnly ? 'No website service requests received yet' : 'No support tickets open'}
          description={
            requestsOnly
              ? 'Once PUBLIC_INTAKE_API_KEY is configured and kortrix.com submits requests to POST /api/public/service-requests, they will appear here automatically.'
              : 'Create a support ticket manually to track residential or commercial technical support issues.'
          }
          action={<Button variant="primary" onClick={() => setModalOpen(true)}>Create Ticket</Button>}
        />
      ) : viewMode === 'table' ? (
        <Surface className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-[#DCE2EA] dark:border-[#242D3D] bg-[#F8FAFC] dark:bg-[#0F141D] text-[12px] font-semibold text-[#475569] dark:text-[#94A3B8]">
                <th className="py-2.5 px-4">Ticket #</th>
                <th className="py-2.5 px-3">Subject</th>
                <th className="py-2.5 px-3">Customer</th>
                <th className="py-2.5 px-3">Category</th>
                <th className="py-2.5 px-3">Priority</th>
                <th className="py-2.5 px-3">Status</th>
                <th className="py-2.5 px-3">Technician</th>
                <th className="py-2.5 px-4">Due</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E2E8F0] dark:divide-[#242D3D] text-[13px]">
              {filtered.map((t) => (
                <tr key={t.id} onClick={() => navigate(`/service-desk/${t.id}`)} className="hover:bg-[#F8FAFC] dark:hover:bg-[#1A2230] cursor-pointer">
                  <td className="py-2.5 px-4 font-mono text-[12px] text-[#0047FF] whitespace-nowrap">{t.ticket_number}</td>
                  <td className="py-2.5 px-3 font-medium text-[#0B1018] dark:text-white">{t.subject}</td>
                  <td className="py-2.5 px-3 text-[12.5px] text-[#526075]">{t.customer_name || t.requester_name || '—'}</td>
                  <td className="py-2.5 px-3 text-[12px] text-[#526075]">{t.service_category}</td>
                  <td className="py-2.5 px-3"><StatusText value={t.priority} /></td>
                  <td className="py-2.5 px-3"><StatusText value={t.status} /></td>
                  <td className="py-2.5 px-3 text-[12.5px] text-[#526075]">{t.technician_name || 'Unassigned'}</td>
                  <td className="py-2.5 px-4 font-mono text-[12px] text-[#526075]">{formatDate(t.due_date)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Surface>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {BOARD_COLUMNS.map((col) => {
            const colItems = filtered.filter((t) => t.status === col);
            return (
              <div key={col} className="bg-[#EBF0F6]/70 dark:bg-[#10151F] border border-[#DCE2EA] dark:border-[#242D3D] rounded-md p-2.5 space-y-2">
                <div className="flex justify-between text-xs font-semibold px-1">
                  <span>{col}</span>
                  <span className="font-mono text-[#64748B]">{colItems.length}</span>
                </div>
                {colItems.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => navigate(`/service-desk/${t.id}`)}
                    className="w-full text-left p-2.5 bg-white dark:bg-[#141A24] border border-[#DCE2EA] dark:border-[#242D3D] rounded hover:border-[#0047FF] cursor-pointer space-y-1"
                  >
                    <div className="font-mono text-[11px] text-[#0047FF]">{t.ticket_number}</div>
                    <div className="text-xs font-medium text-[#0B1018] dark:text-white line-clamp-2">{t.subject}</div>
                    <div className="flex justify-between text-[11px] pt-1">
                      <StatusText value={t.priority} />
                      <span className="text-[#64748B] truncate max-w-[90px]">{t.customer_name || 'Internal'}</span>
                    </div>
                  </button>
                ))}
              </div>
            );
          })}
        </div>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Create Support Ticket" maxWidth="max-w-2xl">
        <form onSubmit={handleCreateTicket} className="space-y-4">
          <Field label="Subject" required>
            <input required value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} placeholder="Concise summary of the technical issue" className={inputClass} />
          </Field>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Customer">
              <select value={form.customer_id} onChange={(e) => setForm({ ...form, customer_id: e.target.value })} className={inputClass}>
                <option value="">Internal / No Customer</option>
                {customers.map((c) => <option key={c.id} value={c.id}>{c.customer_code} — {c.name}</option>)}
              </select>
            </Field>
            <Field label="Service Category">
              <select value={form.service_category} onChange={(e) => setForm({ ...form, service_category: e.target.value })} className={inputClass}>
                <option>KORTRIX Infrastructure</option>
                <option>KORTRIX Security</option>
                <option>KORTRIX Lifecycle</option>
                <option>General Support</option>
              </select>
            </Field>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Field label="Priority">
              <select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })} className={inputClass}>
                {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </Field>
            <Field label="Department">
              <select value={form.department_id} onChange={(e) => setForm({ ...form, department_id: e.target.value })} className={inputClass}>
                {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </Field>
            <Field label="Due Date">
              <input type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} className={inputClass} />
            </Field>
          </div>
          <Field label="Assigned Technician">
            <select value={form.assigned_technician_id} onChange={(e) => setForm({ ...form, assigned_technician_id: e.target.value })} className={inputClass}>
              <option value="">Unassigned</option>
              {users.map((u) => <option key={u.id} value={u.id}>{u.full_name} ({u.email})</option>)}
            </select>
          </Field>
          <Field label="Description">
            <textarea rows={4} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className={inputClass} />
          </Field>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button type="submit" variant="primary">Create Ticket</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
