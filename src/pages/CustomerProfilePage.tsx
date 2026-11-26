import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, MessageSquarePlus, Save } from 'lucide-react';
import { apiFetch, formatCurrency, formatDate, formatDateTime } from '../lib/api';
import { Button, Field, inputClass, PageHeader, StatusText, Surface } from '../components/ui';

type ProfileTab = 'overview' | 'contacts' | 'tickets' | 'workOrders' | 'assets' | 'quotations' | 'invoices' | 'documents';

export const CustomerProfilePage: React.FC = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState<any | null>(null);
  const [tab, setTab] = useState<ProfileTab>('overview');
  const [loading, setLoading] = useState(true);
  const [commChannel, setCommChannel] = useState<'Phone' | 'Email' | 'On-Site' | 'Meeting' | 'Note'>('Phone');
  const [commSummary, setCommSummary] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [savingNotes, setSavingNotes] = useState(false);

  const loadProfile = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const res = await apiFetch<any>(`/api/customers/${id}/profile`);
      setData(res);
      setEditNotes(res.customer?.notes || '');
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  const addCommunication = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id || !commSummary.trim()) return;
    await apiFetch(`/api/customers/${id}/communication`, {
      method: 'POST',
      body: JSON.stringify({ channel: commChannel, summary: commSummary }),
    });
    setCommSummary('');
    await loadProfile();
  };

  const saveNotes = async () => {
    if (!id) return;
    setSavingNotes(true);
    try {
      await apiFetch(`/api/customers/${id}`, { method: 'PUT', body: JSON.stringify({ notes: editNotes }) });
      await loadProfile();
    } finally {
      setSavingNotes(false);
    }
  };

  if (loading) return <Surface className="p-8 text-center text-xs text-[#64748B]">Loading customer profile...</Surface>;
  if (!data?.customer) return <Surface className="p-8 text-center text-sm text-[#64748B]">Customer record not found.</Surface>;

  const c = data.customer;
  const tabs: { key: ProfileTab; label: string; count?: number }[] = [
    { key: 'overview', label: 'Overview & Log' },
    { key: 'contacts', label: 'Contacts', count: data.contacts.length },
    { key: 'tickets', label: 'Service Desk', count: data.tickets.length },
    { key: 'workOrders', label: 'Work Orders', count: data.workOrders.length },
    { key: 'assets', label: 'Assets', count: data.assets.length },
    { key: 'quotations', label: 'Quotations', count: data.quotations.length },
    { key: 'invoices', label: 'Invoices', count: data.invoices.length },
    { key: 'documents', label: 'Documents', count: data.documents.length },
  ];

  return (
    <div className="space-y-5">
      <button type="button" onClick={() => navigate('/customers')} className="inline-flex items-center gap-1.5 text-xs font-medium text-[#526075] hover:text-[#0047FF] cursor-pointer">
        <ArrowLeft className="w-3.5 h-3.5" /> Back to Customers
      </button>

      <PageHeader
        title={`${c.name}${c.organization ? ` — ${c.organization}` : ''}`}
        description={`${c.customer_code} · ${c.customer_type} · Account Status: ${c.account_status} · Created ${formatDate(c.created_at)}`}
        actions={
          <>
            <Button variant="secondary" onClick={() => navigate('/service-desk?new=1')}>New Ticket</Button>
            <Button variant="primary" onClick={() => navigate('/quotations?new=1')}>Create Quotation</Button>
          </>
        }
      />

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-[#DCE2EA] dark:border-[#242D3D] overflow-x-auto">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`px-3.5 py-2.5 text-[13px] font-medium border-b-2 whitespace-nowrap cursor-pointer transition-colors ${
              tab === t.key
                ? 'border-[#0047FF] text-[#0047FF]'
                : 'border-transparent text-[#526075] dark:text-[#94A3B8] hover:text-[#0B1018] dark:hover:text-white'
            }`}
          >
            {t.label}
            {t.count !== undefined && <span className="ml-1.5 font-mono text-[11.5px] opacity-75">({t.count})</span>}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          <Surface className="lg:col-span-5 p-5 space-y-4">
            <h2 className="font-display text-[14px] font-semibold">Account Details</h2>
            <dl className="grid grid-cols-2 gap-y-3 gap-x-4 text-[12.5px]">
              <div><dt className="text-[#64748B]">Customer ID</dt><dd className="font-mono mt-0.5">{c.customer_code}</dd></div>
              <div><dt className="text-[#64748B]">Status</dt><dd className="mt-0.5"><StatusText value={c.account_status} /></dd></div>
              <div><dt className="text-[#64748B]">Email</dt><dd className="mt-0.5 break-all">{c.email || '—'}</dd></div>
              <div><dt className="text-[#64748B]">Telephone</dt><dd className="font-mono mt-0.5">{c.telephone || '—'}</dd></div>
              <div className="col-span-2"><dt className="text-[#64748B]">Billing Address</dt><dd className="mt-0.5">{c.billing_address || '—'}</dd></div>
              <div className="col-span-2"><dt className="text-[#64748B]">Service Address</dt><dd className="mt-0.5">{c.service_address || '—'}</dd></div>
              <div className="col-span-2"><dt className="text-[#64748B]">Assigned Representative</dt><dd className="mt-0.5">{c.assigned_rep_name || 'Unassigned'}</dd></div>
            </dl>
            <div className="pt-3 border-t border-[#DCE2EA] dark:border-[#242D3D] space-y-2">
              <Field label="Account Notes">
                <textarea rows={3} value={editNotes} onChange={(e) => setEditNotes(e.target.value)} className={inputClass} />
              </Field>
              <Button variant="secondary" size="sm" onClick={saveNotes} disabled={savingNotes}>
                <Save className="w-3.5 h-3.5" /> {savingNotes ? 'Saving...' : 'Save Notes'}
              </Button>
            </div>
          </Surface>

          <Surface className="lg:col-span-7 p-5 space-y-4">
            <h2 className="font-display text-[14px] font-semibold">Communication History</h2>
            <form onSubmit={addCommunication} className="flex flex-col sm:flex-row gap-2">
              <select value={commChannel} onChange={(e) => setCommChannel(e.target.value as any)} className={`${inputClass} sm:w-36`}>
                <option>Phone</option><option>Email</option><option>On-Site</option><option>Meeting</option><option>Note</option>
              </select>
              <input value={commSummary} onChange={(e) => setCommSummary(e.target.value)} placeholder="Log call summary, email follow-up, or site note..." className={inputClass} />
              <Button type="submit" variant="primary"><MessageSquarePlus className="w-4 h-4" /> Log</Button>
            </form>
            <div className="divide-y divide-[#E2E8F0] dark:divide-[#242D3D]">
              {(c.communication_log || []).length === 0 ? (
                <div className="py-8 text-center text-xs text-[#64748B]">No communications logged for this customer yet.</div>
              ) : (
                c.communication_log.map((entry: any) => (
                  <div key={entry.id} className="py-3">
                    <div className="text-[13px] text-[#0B1018] dark:text-white">{entry.summary}</div>
                    <div className="mt-1 text-[11.5px] font-mono text-[#64748B]">
                      {entry.channel} · {entry.author} · {formatDateTime(entry.at)}
                    </div>
                  </div>
                ))
              )}
            </div>
          </Surface>
        </div>
      )}

      {tab === 'contacts' && (
        <Surface className="p-5">
          {data.contacts.length === 0 ? <div className="text-xs text-[#64748B]">No contacts associated with this customer.</div> : (
            <div className="divide-y divide-[#E2E8F0] dark:divide-[#242D3D]">
              {data.contacts.map((ct: any) => (
                <div key={ct.id} className="py-3 flex justify-between text-[13px]">
                  <div><div className="font-medium">{ct.full_name}</div><div className="text-xs text-[#64748B]">{ct.title || 'Contact'} · {ct.email || '—'}</div></div>
                  <div className="font-mono text-xs text-[#526075]">{ct.telephone || '—'}</div>
                </div>
              ))}
            </div>
          )}
        </Surface>
      )}

      {tab === 'tickets' && (
        <Surface className="p-5">
          {data.tickets.length === 0 ? <div className="text-xs text-[#64748B]">No support tickets linked to this customer.</div> : (
            <div className="divide-y divide-[#E2E8F0] dark:divide-[#242D3D]">
              {data.tickets.map((t: any) => (
                <div key={t.id} onClick={() => navigate(`/service-desk/${t.id}`)} className="py-3 flex justify-between items-center cursor-pointer hover:text-[#0047FF]">
                  <div><span className="font-mono text-xs text-[#526075] mr-2">{t.ticket_number}</span><span className="font-medium text-[13px]">{t.subject}</span></div>
                  <StatusText value={t.status} />
                </div>
              ))}
            </div>
          )}
        </Surface>
      )}

      {tab === 'workOrders' && (
        <Surface className="p-5">
          {data.workOrders.length === 0 ? <div className="text-xs text-[#64748B]">No work orders recorded for this customer.</div> : (
            <div className="divide-y divide-[#E2E8F0] dark:divide-[#242D3D]">
              {data.workOrders.map((w: any) => (
                <div key={w.id} className="py-3 flex justify-between text-[13px]">
                  <div><span className="font-mono text-xs text-[#526075] mr-2">{w.work_order_number}</span><span>{w.requested_services}</span></div>
                  <StatusText value={w.status} />
                </div>
              ))}
            </div>
          )}
        </Surface>
      )}

      {tab === 'assets' && (
        <Surface className="p-5">
          {data.assets.length === 0 ? <div className="text-xs text-[#64748B]">No technology assets assigned to this customer.</div> : (
            <div className="divide-y divide-[#E2E8F0] dark:divide-[#242D3D]">
              {data.assets.map((a: any) => (
                <div key={a.id} className="py-3 flex justify-between text-[13px]">
                  <div><span className="font-mono text-xs text-[#526075] mr-2">{a.asset_code}</span><span>{a.manufacturer} {a.model} ({a.category})</span></div>
                  <StatusText value={a.status} />
                </div>
              ))}
            </div>
          )}
        </Surface>
      )}

      {tab === 'quotations' && (
        <Surface className="p-5">
          {data.quotations.length === 0 ? <div className="text-xs text-[#64748B]">No quotations issued to this customer.</div> : (
            <div className="divide-y divide-[#E2E8F0] dark:divide-[#242D3D]">
              {data.quotations.map((q: any) => (
                <div key={q.id} className="py-3 flex justify-between text-[13px]">
                  <span className="font-mono">{q.quote_number}</span>
                  <div className="flex items-center gap-4"><span className="font-mono">{formatCurrency(q.total)}</span><StatusText value={q.status} /></div>
                </div>
              ))}
            </div>
          )}
        </Surface>
      )}

      {tab === 'invoices' && (
        <Surface className="p-5">
          {data.invoices.length === 0 ? <div className="text-xs text-[#64748B]">No invoices issued to this customer.</div> : (
            <div className="divide-y divide-[#E2E8F0] dark:divide-[#242D3D]">
              {data.invoices.map((inv: any) => (
                <div key={inv.id} className="py-3 flex justify-between text-[13px]">
                  <span className="font-mono">{inv.invoice_number}</span>
                  <div className="flex items-center gap-4"><span className="font-mono">{formatCurrency(inv.total)}</span><StatusText value={inv.payment_status} /></div>
                </div>
              ))}
            </div>
          )}
        </Surface>
      )}

      {tab === 'documents' && (
        <Surface className="p-5">
          {data.documents.length === 0 ? <div className="text-xs text-[#64748B]">No customer-specific documents linked yet.</div> : (
            <div className="divide-y divide-[#E2E8F0] dark:divide-[#242D3D]">
              {data.documents.map((d: any) => (
                <div key={d.id} className="py-3 flex justify-between text-[13px]">
                  <span>{d.document_code} — {d.title}</span>
                  <span className="text-xs text-[#64748B]">{d.category}</span>
                </div>
              ))}
            </div>
          )}
        </Surface>
      )}
    </div>
  );
};
