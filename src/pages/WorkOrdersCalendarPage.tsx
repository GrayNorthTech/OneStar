import React, { useEffect, useState, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Plus, ChevronLeft, ChevronRight, Edit3 } from 'lucide-react';
import { apiFetch, formatDateTime } from '../lib/api';
import { Button, EmptyState, Field, inputClass, Modal, PageHeader, StatusText, Surface } from '../components/ui';

export const WorkOrdersCalendarPage: React.FC<{ mode: 'work-orders' | 'appointments' | 'calendar' }> = ({ mode }) => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [workOrders, setWorkOrders] = useState<any[]>([]);
  const [appointments, setAppointments] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [tickets, setTickets] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [calView, setCalView] = useState<'month' | 'week' | 'day'>('month');
  const [cursorDate, setCursorDate] = useState(() => new Date());

  const [woModal, setWoModal] = useState(false);
  const [editingWo, setEditingWo] = useState<any | null>(null);
  const [apptModal, setApptModal] = useState(false);

  const [woForm, setWoForm] = useState({
    customer_id: '', ticket_id: '', service_location: '', assigned_technician_id: '',
    requested_services: '', scheduled_start: '', estimated_duration_mins: '60',
    service_instructions: '', work_performed: '', labor_hours: '0', completion_notes: '', status: 'Scheduled',
  });
  const [apptForm, setApptForm] = useState({
    title: '', customer_id: '', work_order_id: '', assigned_technician_id: '',
    start_time: new Date().toISOString().slice(0, 16),
    end_time: new Date(Date.now() + 60 * 60 * 1000).toISOString().slice(0, 16),
    location: '', appointment_type: 'On-Site Visit', notes: '',
  });

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [wRes, aRes, cRes, tRes, uRes] = await Promise.all([
        apiFetch<{ items: any[] }>('/api/work-orders'),
        apiFetch<{ items: any[] }>('/api/appointments'),
        apiFetch<{ items: any[] }>('/api/customers'),
        apiFetch<{ items: any[] }>('/api/tickets'),
        apiFetch<{ items: any[] }>('/api/users').catch(() => ({ items: [] })),
      ]);
      setWorkOrders(wRes.items || []);
      setAppointments(aRes.items || []);
      setCustomers(cRes.items || []);
      setTickets(tRes.items || []);
      setUsers(uRes.items || []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (searchParams.get('new') === '1') {
      if (mode === 'work-orders') openCreateWo();
      else setApptModal(true);
      setSearchParams({});
    }
  }, [searchParams, mode, setSearchParams]);

  const openCreateWo = () => {
    setEditingWo(null);
    setWoForm({
      customer_id: '', ticket_id: '', service_location: '', assigned_technician_id: users[0]?.id || '',
      requested_services: '', scheduled_start: '', estimated_duration_mins: '60',
      service_instructions: '', work_performed: '', labor_hours: '0', completion_notes: '', status: 'Scheduled',
    });
    setWoModal(true);
  };

  const openEditWo = (w: any) => {
    setEditingWo(w);
    setWoForm({
      customer_id: w.customer_id || '',
      ticket_id: w.ticket_id || '',
      service_location: w.service_location || '',
      assigned_technician_id: w.assigned_technician_id || '',
      requested_services: w.requested_services || '',
      scheduled_start: w.scheduled_start ? w.scheduled_start.slice(0, 16) : '',
      estimated_duration_mins: String(w.estimated_duration_mins || 60),
      service_instructions: w.service_instructions || '',
      work_performed: w.work_performed || '',
      labor_hours: String(w.labor_hours || 0),
      completion_notes: w.completion_notes || '',
      status: w.status || 'Scheduled',
    });
    setWoModal(true);
  };

  const handleSaveWo = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      ...woForm,
      customer_id: woForm.customer_id || null,
      ticket_id: woForm.ticket_id || null,
      assigned_technician_id: woForm.assigned_technician_id || null,
      scheduled_start: woForm.scheduled_start || null,
      estimated_duration_mins: Number(woForm.estimated_duration_mins || 60),
      labor_hours: Number(woForm.labor_hours || 0),
    };
    if (editingWo) {
      await apiFetch(`/api/work-orders/${editingWo.id}`, { method: 'PUT', body: JSON.stringify(payload) });
    } else {
      await apiFetch('/api/work-orders', { method: 'POST', body: JSON.stringify(payload) });
    }
    setWoModal(false);
    await loadData();
  };

  const handleCreateAppt = async (e: React.FormEvent) => {
    e.preventDefault();
    await apiFetch('/api/appointments', {
      method: 'POST',
      body: JSON.stringify({
        ...apptForm,
        customer_id: apptForm.customer_id || null,
        work_order_id: apptForm.work_order_id || null,
        assigned_technician_id: apptForm.assigned_technician_id || null,
      }),
    });
    setApptModal(false);
    await loadData();
  };

  const updateApptStatus = async (id: string, status: string) => {
    await apiFetch(`/api/appointments/${id}`, { method: 'PUT', body: JSON.stringify({ status }) });
    await loadData();
  };

  // Calendar grid helpers
  const year = cursorDate.getFullYear();
  const month = cursorDate.getMonth();
  const monthStart = new Date(year, month, 1);
  const startDayOfWeek = monthStart.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const shiftCursor = (dir: number) => {
    const next = new Date(cursorDate);
    if (calView === 'month') next.setMonth(next.getMonth() + dir);
    else if (calView === 'week') next.setDate(next.getDate() + dir * 7);
    else next.setDate(next.getDate() + dir);
    setCursorDate(next);
  };

  const eventsOnDate = (dateStr: string) => {
    const appts = appointments.filter((a) => (a.start_time || '').startsWith(dateStr));
    const wos = workOrders.filter((w) => (w.scheduled_start || '').startsWith(dateStr));
    return [
      ...appts.map((a) => ({ id: a.id, title: a.title, time: (a.start_time || '').slice(11, 16), type: 'Appointment', status: a.status })),
      ...wos.map((w) => ({ id: w.id, title: `${w.work_order_number} · ${w.requested_services}`, time: (w.scheduled_start || '').slice(11, 16), type: 'Work Order', status: w.status })),
    ];
  };

  const weekStart = new Date(cursorDate);
  weekStart.setDate(cursorDate.getDate() - cursorDate.getDay());
  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(weekStart.getDate() + i);
    return d;
  });

  const toIsoDate = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

  return (
    <div className="space-y-5">
      <PageHeader
        title={mode === 'work-orders' ? 'Work Orders' : mode === 'appointments' ? 'Appointments' : 'Operations Calendar'}
        description={
          mode === 'work-orders'
            ? 'Field and remote service job execution with instructions, labor hours, and completion records.'
            : 'Internal technician dispatch calendar. Microsoft 365 Outlook Calendar sync is prepared in Integrations and currently not configured.'
        }
        actions={
          <>
            <Button variant="secondary" onClick={openCreateWo}><Plus className="w-4 h-4" /> New Work Order</Button>
            <Button variant="primary" onClick={() => setApptModal(true)}><Plus className="w-4 h-4" /> Schedule Appointment</Button>
          </>
        }
      />

      {mode === 'work-orders' && (
        loading ? (
          <Surface className="p-8 text-center text-xs text-[#64748B]">Loading work orders...</Surface>
        ) : workOrders.length === 0 ? (
          <EmptyState
            title="No work orders created"
            description="Dispatch residential or business service work orders linked to customers and support tickets."
            action={<Button variant="primary" onClick={openCreateWo}>Create First Work Order</Button>}
          />
        ) : (
          <Surface className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[#DCE2EA] dark:border-[#242D3D] bg-[#F8FAFC] dark:bg-[#0F141D] text-[12px] font-semibold text-[#475569] dark:text-[#94A3B8]">
                  <th className="py-2.5 px-4">Work Order #</th>
                  <th className="py-2.5 px-3">Requested Services</th>
                  <th className="py-2.5 px-3">Customer</th>
                  <th className="py-2.5 px-3">Technician</th>
                  <th className="py-2.5 px-3">Scheduled</th>
                  <th className="py-2.5 px-3 text-right">Labor Hrs</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E2E8F0] dark:divide-[#242D3D] text-[13px]">
                {workOrders.map((w) => (
                  <tr key={w.id} className="hover:bg-[#F8FAFC] dark:hover:bg-[#1A2230]">
                    <td className="py-2.5 px-4 font-mono text-[12px] text-[#0047FF] whitespace-nowrap">{w.work_order_number}</td>
                    <td className="py-2.5 px-3">
                      <div className="font-medium text-[#0B1018] dark:text-white">{w.requested_services}</div>
                      {w.service_location && <div className="text-[11.5px] text-[#64748B]">{w.service_location}</div>}
                    </td>
                    <td className="py-2.5 px-3 text-[12.5px] text-[#526075]">{w.customer_name || '—'}</td>
                    <td className="py-2.5 px-3 text-[12.5px] text-[#526075]">{w.technician_name || 'Unassigned'}</td>
                    <td className="py-2.5 px-3 font-mono text-[12px] text-[#526075] whitespace-nowrap">{formatDateTime(w.scheduled_start)}</td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums">{Number(w.labor_hours || 0).toFixed(1)}</td>
                    <td className="py-2.5 px-3"><StatusText value={w.status} /></td>
                    <td className="py-2.5 px-4 text-right">
                      <button type="button" onClick={() => openEditWo(w)} className="p-1.5 text-[#526075] hover:text-[#0047FF] cursor-pointer"><Edit3 className="w-3.5 h-3.5" /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Surface>
        )
      )}

      {mode === 'appointments' && (
        appointments.length === 0 ? (
          <EmptyState
            title="No scheduled appointments"
            description="Schedule on-site visits, consultations, or remote sessions with customers."
            action={<Button variant="primary" onClick={() => setApptModal(true)}>Schedule First Appointment</Button>}
          />
        ) : (
          <Surface className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[#DCE2EA] dark:border-[#242D3D] bg-[#F8FAFC] dark:bg-[#0F141D] text-[12px] font-semibold text-[#475569] dark:text-[#94A3B8]">
                  <th className="py-2.5 px-4">Appointment</th>
                  <th className="py-2.5 px-3">Customer</th>
                  <th className="py-2.5 px-3">Start</th>
                  <th className="py-2.5 px-3">Location</th>
                  <th className="py-2.5 px-3">Technician</th>
                  <th className="py-2.5 px-4">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E2E8F0] dark:divide-[#242D3D] text-[13px]">
                {appointments.map((a) => (
                  <tr key={a.id} className="hover:bg-[#F8FAFC] dark:hover:bg-[#1A2230]">
                    <td className="py-2.5 px-4 font-medium">{a.title}</td>
                    <td className="py-2.5 px-3 text-[12.5px] text-[#526075]">{a.customer_name || '—'}</td>
                    <td className="py-2.5 px-3 font-mono text-[12px] text-[#526075] whitespace-nowrap">{formatDateTime(a.start_time)}</td>
                    <td className="py-2.5 px-3 text-[12.5px] text-[#526075]">{a.location || a.appointment_type}</td>
                    <td className="py-2.5 px-3 text-[12.5px] text-[#526075]">{a.technician_name || 'Unassigned'}</td>
                    <td className="py-2.5 px-4">
                      <select value={a.status} onChange={(e) => updateApptStatus(a.id, e.target.value)} className="px-2 py-1 text-xs rounded border border-[#DCE2EA] dark:border-[#2B3548] bg-white dark:bg-[#0B1018]">
                        <option>Scheduled</option><option>Completed</option><option>Rescheduled</option><option>Cancelled</option>
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Surface>
        )
      )}

      {mode === 'calendar' && (
        <Surface className="p-4 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Button variant="secondary" size="sm" onClick={() => shiftCursor(-1)} aria-label="Previous period"><ChevronLeft className="w-4 h-4" /></Button>
              <Button variant="secondary" size="sm" onClick={() => setCursorDate(new Date())}>Today</Button>
              <Button variant="secondary" size="sm" onClick={() => shiftCursor(1)} aria-label="Next period"><ChevronRight className="w-4 h-4" /></Button>
              <span className="ml-2 font-display text-[15px] font-semibold text-[#0B1018] dark:text-white">
                {cursorDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric', ...(calView === 'day' ? { day: 'numeric' } : {}) })}
              </span>
            </div>
            <div className="flex items-center gap-1 p-1 bg-[#EBF0F6] dark:bg-[#0B1018] border border-[#DCE2EA] dark:border-[#242D3D] rounded-md self-start">
              {(['day', 'week', 'month'] as const).map((v) => (
                <button key={v} type="button" onClick={() => setCalView(v)} className={`px-3 py-1 text-xs font-medium rounded capitalize cursor-pointer ${calView === v ? 'bg-white dark:bg-[#141A24] text-[#0B1018] dark:text-white' : 'text-[#526075]'}`}>
                  {v}
                </button>
              ))}
            </div>
          </div>

          {calView === 'month' && (
            <div className="grid grid-cols-7 border-t border-l border-[#DCE2EA] dark:border-[#242D3D]">
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
                <div key={d} className="p-2 text-xs font-semibold text-[#526075] bg-[#F8FAFC] dark:bg-[#0F141D] border-r border-b border-[#DCE2EA] dark:border-[#242D3D]">{d}</div>
              ))}
              {Array.from({ length: startDayOfWeek }).map((_, idx) => (
                <div key={`empty-${idx}`} className="min-h-[92px] bg-[#F8FAFC]/60 dark:bg-[#0B1018]/40 border-r border-b border-[#DCE2EA] dark:border-[#242D3D]" />
              ))}
              {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((dayNum) => {
                const iso = `${year}-${String(month + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
                const evs = eventsOnDate(iso);
                return (
                  <div key={dayNum} className="min-h-[92px] p-1.5 border-r border-b border-[#DCE2EA] dark:border-[#242D3D] space-y-1">
                    <div className="font-mono text-[11.5px] text-[#526075]">{dayNum}</div>
                    {evs.map((ev) => (
                      <div key={ev.id} className="px-1.5 py-0.5 text-[11px] bg-[#0047FF]/10 text-[#0047FF] dark:text-[#60A5FA] rounded truncate">
                        {ev.time ? `${ev.time} ` : ''}{ev.title}
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          )}

          {calView === 'week' && (
            <div className="grid grid-cols-1 md:grid-cols-7 border-t border-l border-[#DCE2EA] dark:border-[#242D3D]">
              {weekDays.map((d) => {
                const iso = toIsoDate(d);
                const evs = eventsOnDate(iso);
                return (
                  <div key={iso} className="min-h-[220px] p-2 border-r border-b border-[#DCE2EA] dark:border-[#242D3D] space-y-2">
                    <div className="text-xs font-semibold text-[#334155] dark:text-[#CBD5E1]">
                      {d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                    </div>
                    {evs.length === 0 ? (
                      <div className="text-[11px] text-[#94A3B8]">No events</div>
                    ) : (
                      evs.map((ev) => (
                        <div key={ev.id} className="p-1.5 bg-[#0047FF]/10 text-[#0047FF] dark:text-[#60A5FA] rounded text-[11.5px]">
                          <div className="font-mono text-[10.5px]">{ev.time || 'Scheduled'}</div>
                          <div className="font-medium">{ev.title}</div>
                        </div>
                      ))
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {calView === 'day' && (
            <div className="space-y-2">
              {eventsOnDate(toIsoDate(cursorDate)).length === 0 ? (
                <div className="py-10 text-center text-xs text-[#64748B]">No appointments or work orders scheduled for this day.</div>
              ) : (
                eventsOnDate(toIsoDate(cursorDate)).map((ev) => (
                  <div key={ev.id} className="p-3 border border-[#DCE2EA] dark:border-[#242D3D] rounded-md flex items-center justify-between">
                    <div>
                      <div className="font-medium text-[13px]">{ev.title}</div>
                      <div className="text-xs text-[#64748B] font-mono">{ev.time || 'All day'} · {ev.type}</div>
                    </div>
                    <StatusText value={ev.status} />
                  </div>
                ))
              )}
            </div>
          )}
        </Surface>
      )}

      {/* Work Order Modal */}
      <Modal open={woModal} onClose={() => setWoModal(false)} title={editingWo ? `Edit Work Order — ${editingWo.work_order_number}` : 'Create Work Order'} maxWidth="max-w-2xl">
        <form onSubmit={handleSaveWo} className="space-y-4">
          <Field label="Requested Services" required>
            <input required value={woForm.requested_services} onChange={(e) => setWoForm({ ...woForm, requested_services: e.target.value })} placeholder="e.g., Commercial firewall installation & VLAN setup" className={inputClass} />
          </Field>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Customer">
              <select value={woForm.customer_id} onChange={(e) => setWoForm({ ...woForm, customer_id: e.target.value })} className={inputClass}>
                <option value="">Select customer...</option>
                {customers.map((c) => <option key={c.id} value={c.id}>{c.customer_code} — {c.name}</option>)}
              </select>
            </Field>
            <Field label="Related Ticket">
              <select value={woForm.ticket_id} onChange={(e) => setWoForm({ ...woForm, ticket_id: e.target.value })} className={inputClass}>
                <option value="">None</option>
                {tickets.map((t) => <option key={t.id} value={t.id}>{t.ticket_number} — {t.subject}</option>)}
              </select>
            </Field>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Field label="Scheduled Date & Time">
              <input type="datetime-local" value={woForm.scheduled_start} onChange={(e) => setWoForm({ ...woForm, scheduled_start: e.target.value })} className={inputClass} />
            </Field>
            <Field label="Est. Duration (mins)">
              <input type="number" min="15" value={woForm.estimated_duration_mins} onChange={(e) => setWoForm({ ...woForm, estimated_duration_mins: e.target.value })} className={`${inputClass} font-mono`} />
            </Field>
            <Field label="Status">
              <select value={woForm.status} onChange={(e) => setWoForm({ ...woForm, status: e.target.value })} className={inputClass}>
                <option>Draft</option><option>Scheduled</option><option>Dispatched</option><option>In Progress</option><option>Awaiting Parts</option><option>Completed</option><option>Cancelled</option>
              </select>
            </Field>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Service Location"><input value={woForm.service_location} onChange={(e) => setWoForm({ ...woForm, service_location: e.target.value })} className={inputClass} /></Field>
            <Field label="Labor Hours"><input type="number" step="0.25" min="0" value={woForm.labor_hours} onChange={(e) => setWoForm({ ...woForm, labor_hours: e.target.value })} className={`${inputClass} font-mono`} /></Field>
          </div>
          <Field label="Service Instructions"><textarea rows={2} value={woForm.service_instructions} onChange={(e) => setWoForm({ ...woForm, service_instructions: e.target.value })} className={inputClass} /></Field>
          <Field label="Work Performed / Completion Notes"><textarea rows={2} value={woForm.work_performed} onChange={(e) => setWoForm({ ...woForm, work_performed: e.target.value })} className={inputClass} /></Field>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setWoModal(false)}>Cancel</Button>
            <Button type="submit" variant="primary">{editingWo ? 'Save Work Order' : 'Create Work Order'}</Button>
          </div>
        </form>
      </Modal>

      {/* Appointment Modal */}
      <Modal open={apptModal} onClose={() => setApptModal(false)} title="Schedule Appointment">
        <form onSubmit={handleCreateAppt} className="space-y-4">
          <Field label="Appointment Title" required>
            <input required value={apptForm.title} onChange={(e) => setApptForm({ ...apptForm, title: e.target.value })} placeholder="e.g., Network Assessment Site Visit" className={inputClass} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Start Time" required><input type="datetime-local" required value={apptForm.start_time} onChange={(e) => setApptForm({ ...apptForm, start_time: e.target.value })} className={inputClass} /></Field>
            <Field label="End Time" required><input type="datetime-local" required value={apptForm.end_time} onChange={(e) => setApptForm({ ...apptForm, end_time: e.target.value })} className={inputClass} /></Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Customer">
              <select value={apptForm.customer_id} onChange={(e) => setApptForm({ ...apptForm, customer_id: e.target.value })} className={inputClass}>
                <option value="">None / Internal</option>
                {customers.map((c) => <option key={c.id} value={c.id}>{c.customer_code} — {c.name}</option>)}
              </select>
            </Field>
            <Field label="Technician">
              <select value={apptForm.assigned_technician_id} onChange={(e) => setApptForm({ ...apptForm, assigned_technician_id: e.target.value })} className={inputClass}>
                <option value="">Unassigned</option>
                {users.map((u) => <option key={u.id} value={u.id}>{u.full_name}</option>)}
              </select>
            </Field>
          </div>
          <Field label="Location"><input value={apptForm.location} onChange={(e) => setApptForm({ ...apptForm, location: e.target.value })} className={inputClass} /></Field>
          <Field label="Notes"><textarea rows={2} value={apptForm.notes} onChange={(e) => setApptForm({ ...apptForm, notes: e.target.value })} className={inputClass} /></Field>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setApptModal(false)}>Cancel</Button>
            <Button type="submit" variant="primary">Schedule</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
