import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Plus, Download, Archive, ArrowRight, UserCheck, Trash2 } from 'lucide-react';
import { apiFetch, exportToCsv, formatCurrency, formatDate } from '../lib/api';
import { Button, EmptyState, Field, inputClass, Modal, PageHeader, StatusText, Surface } from '../components/ui';

const CUSTOMER_TYPES = ['Residential', 'Business', 'Educational Institution', 'Enterprise', 'Other Organization'] as const;
const LEAD_STAGES = ['New', 'Contacted', 'Qualified', 'Proposal Sent', 'Negotiation', 'Won', 'Lost'] as const;

export const CrmPage: React.FC<{ section: 'customers' | 'organizations' | 'contacts' | 'leads' }> = ({ section }) => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [customers, setCustomers] = useState<any[]>([]);
  const [contacts, setContacts] = useState<any[]>([]);
  const [leads, setLeads] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('All');
  const [showArchived, setShowArchived] = useState(false);
  const [leadView, setLeadView] = useState<'table' | 'pipeline'>('table');
  const [error, setError] = useState('');

  const [customerModal, setCustomerModal] = useState(false);
  const [contactModal, setContactModal] = useState(false);
  const [leadModal, setLeadModal] = useState(false);

  const [custForm, setCustForm] = useState({
    name: '', organization: '', email: '', telephone: '', billing_address: '', service_address: '',
    customer_type: section === 'organizations' ? 'Business' : 'Residential', account_status: 'Active', notes: '',
  });
  const [contactForm, setContactForm] = useState({ customer_id: '', full_name: '', title: '', email: '', telephone: '', is_primary: false, notes: '' });
  const [leadForm, setLeadForm] = useState({ name: '', organization: '', email: '', telephone: '', customer_type: 'Business', stage: 'New', source: 'Direct', estimated_value: '', notes: '' });

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [cRes, ctRes, lRes] = await Promise.all([
        apiFetch<{ items: any[] }>(`/api/customers?archived=${showArchived}`),
        apiFetch<{ items: any[] }>('/api/contacts'),
        apiFetch<{ items: any[] }>('/api/leads'),
      ]);
      setCustomers(cRes.items || []);
      setContacts(ctRes.items || []);
      setLeads(lRes.items || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [showArchived]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (searchParams.get('new') === '1') {
      if (section === 'contacts') setContactModal(true);
      else if (section === 'leads') setLeadModal(true);
      else setCustomerModal(true);
      setSearchParams({});
    }
  }, [searchParams, section, setSearchParams]);

  const handleCreateCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      const res = await apiFetch<{ item: any }>('/api/customers', { method: 'POST', body: JSON.stringify(custForm) });
      setCustomerModal(false);
      setCustForm({ name: '', organization: '', email: '', telephone: '', billing_address: '', service_address: '', customer_type: 'Business', account_status: 'Active', notes: '' });
      await loadData();
      if (res.item?.id) navigate(`/customers/${res.item.id}`);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleArchiveCustomer = async (c: any) => {
    await apiFetch(`/api/customers/${c.id}`, { method: 'PUT', body: JSON.stringify({ archived: !c.archived }) });
    await loadData();
  };

  const handleCreateContact = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiFetch('/api/contacts', { method: 'POST', body: JSON.stringify({ ...contactForm, customer_id: contactForm.customer_id || null }) });
      setContactModal(false);
      setContactForm({ customer_id: '', full_name: '', title: '', email: '', telephone: '', is_primary: false, notes: '' });
      await loadData();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleDeleteContact = async (id: string) => {
    await apiFetch(`/api/contacts/${id}`, { method: 'DELETE' });
    await loadData();
  };

  const handleCreateLead = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiFetch('/api/leads', {
        method: 'POST',
        body: JSON.stringify({ ...leadForm, estimated_value: leadForm.estimated_value ? Number(leadForm.estimated_value) : 0 }),
      });
      setLeadModal(false);
      setLeadForm({ name: '', organization: '', email: '', telephone: '', customer_type: 'Business', stage: 'New', source: 'Direct', estimated_value: '', notes: '' });
      await loadData();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleLeadStage = async (id: string, stage: string) => {
    await apiFetch(`/api/leads/${id}`, { method: 'PUT', body: JSON.stringify({ stage }) });
    await loadData();
  };

  const handleConvertLead = async (id: string) => {
    const res = await apiFetch<{ customer_id: string }>(`/api/leads/${id}/convert`, { method: 'POST' });
    await loadData();
    if (res.customer_id) navigate(`/customers/${res.customer_id}`);
  };

  const filteredCustomers = customers.filter((c) => {
    if (section === 'organizations' && c.customer_type === 'Residential') return false;
    if (typeFilter !== 'All' && c.customer_type !== typeFilter) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      return (
        c.name.toLowerCase().includes(q) ||
        (c.organization || '').toLowerCase().includes(q) ||
        (c.customer_code || '').toLowerCase().includes(q) ||
        (c.email || '').toLowerCase().includes(q)
      );
    }
    return true;
  });

  const filteredContacts = contacts.filter((ct) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return ct.full_name.toLowerCase().includes(q) || (ct.email || '').toLowerCase().includes(q) || (ct.customer_name || '').toLowerCase().includes(q);
  });

  const filteredLeads = leads.filter((l) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return l.name.toLowerCase().includes(q) || (l.organization || '').toLowerCase().includes(q) || l.stage.toLowerCase().includes(q);
  });

  const titles = {
    customers: { title: 'Customers', desc: 'Residential, business, educational, and enterprise accounts with full lifecycle records.' },
    organizations: { title: 'Organizations', desc: 'Commercial, institutional, and enterprise client organizations.' },
    contacts: { title: 'Contacts Directory', desc: 'Authorized points of contact linked across customer accounts.' },
    leads: { title: 'Leads Pipeline', desc: 'Track prospective residential and commercial opportunities through conversion.' },
  }[section];

  return (
    <div className="space-y-5">
      <PageHeader
        title={titles.title}
        description={titles.desc}
        actions={
          <>
            {(section === 'customers' || section === 'organizations') && filteredCustomers.length > 0 && (
              <Button
                variant="secondary"
                onClick={() =>
                  exportToCsv(
                    'kortrix-customers.csv',
                    filteredCustomers.map((c) => ({
                      customer_code: c.customer_code,
                      name: c.name,
                      organization: c.organization,
                      type: c.customer_type,
                      status: c.account_status,
                      email: c.email,
                      telephone: c.telephone,
                      created_at: c.created_at,
                    }))
                  )
                }
              >
                <Download className="w-4 h-4" /> Export CSV
              </Button>
            )}
            {section === 'contacts' ? (
              <Button variant="primary" onClick={() => setContactModal(true)}>
                <Plus className="w-4 h-4" /> Add Contact
              </Button>
            ) : section === 'leads' ? (
              <Button variant="primary" onClick={() => setLeadModal(true)}>
                <Plus className="w-4 h-4" /> New Lead
              </Button>
            ) : (
              <Button variant="primary" onClick={() => setCustomerModal(true)}>
                <Plus className="w-4 h-4" /> Create Customer
              </Button>
            )}
          </>
        }
      />

      {error && (
        <div className="p-3 rounded-md bg-[#FEF2F2] dark:bg-[#450A0A]/40 border border-[#FECACA] text-xs text-[#B91C1C]">
          {error}
        </div>
      )}

      {/* Search & Filters */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={`Search ${section}...`}
            className={`${inputClass} sm:w-72`}
          />
          {(section === 'customers' || section === 'organizations') && (
            <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className={`${inputClass} sm:w-48`}>
              <option value="All">All Account Types</option>
              {CUSTOMER_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          )}
        </div>

        {(section === 'customers' || section === 'organizations') && (
          <button type="button" onClick={() => setShowArchived((s) => !s)} className="text-xs font-medium text-[#0047FF] hover:underline cursor-pointer self-start sm:self-auto">
            {showArchived ? 'Show Active Customers' : 'View Archived Accounts'}
          </button>
        )}

        {section === 'leads' && (
          <div className="flex items-center gap-1 p-1 bg-[#EBF0F6] dark:bg-[#141A24] border border-[#DCE2EA] dark:border-[#242D3D] rounded-md self-start">
            <button type="button" onClick={() => setLeadView('table')} className={`px-2.5 py-1 text-xs font-medium rounded cursor-pointer ${leadView === 'table' ? 'bg-white dark:bg-[#0B1018] text-[#0B1018] dark:text-white' : 'text-[#526075]'}`}>Table</button>
            <button type="button" onClick={() => setLeadView('pipeline')} className={`px-2.5 py-1 text-xs font-medium rounded cursor-pointer ${leadView === 'pipeline' ? 'bg-white dark:bg-[#0B1018] text-[#0B1018] dark:text-white' : 'text-[#526075]'}`}>Stages Board</button>
          </div>
        )}
      </div>

      {/* CUSTOMERS / ORGANIZATIONS TABLE */}
      {(section === 'customers' || section === 'organizations') && (
        loading ? (
          <Surface className="p-8 text-center text-xs text-[#64748B]">Loading customer records...</Surface>
        ) : filteredCustomers.length === 0 ? (
          <EmptyState
            title="No customer records found"
            description="KORTRIX ONE starts with a clean production workspace. Create your first residential or business customer account to begin."
            action={<Button variant="primary" onClick={() => setCustomerModal(true)}>Create First Customer</Button>}
          />
        ) : (
          <Surface className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[#DCE2EA] dark:border-[#242D3D] bg-[#F8FAFC] dark:bg-[#0F141D] text-[12px] font-semibold text-[#475569] dark:text-[#94A3B8]">
                  <th className="py-2.5 px-4">Customer ID</th>
                  <th className="py-2.5 px-3">Name / Organization</th>
                  <th className="py-2.5 px-3">Type</th>
                  <th className="py-2.5 px-3">Contact</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-3">Created</th>
                  <th className="py-2.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E2E8F0] dark:divide-[#242D3D] text-[13px]">
                {filteredCustomers.map((c) => (
                  <tr key={c.id} className="hover:bg-[#F8FAFC] dark:hover:bg-[#1A2230]">
                    <td className="py-2.5 px-4 font-mono text-[12px] text-[#526075] whitespace-nowrap">{c.customer_code}</td>
                    <td className="py-2.5 px-3">
                      <button type="button" onClick={() => navigate(`/customers/${c.id}`)} className="font-medium text-[#0B1018] dark:text-white hover:text-[#0047FF] text-left cursor-pointer">
                        {c.name}
                      </button>
                      {c.organization && <div className="text-[11.5px] text-[#64748B]">{c.organization}</div>}
                    </td>
                    <td className="py-2.5 px-3 text-[12.5px] text-[#475569] dark:text-[#CBD5E1]">{c.customer_type}</td>
                    <td className="py-2.5 px-3 text-[12px] text-[#526075]">
                      <div>{c.email || '—'}</div>
                      <div className="font-mono text-[11.5px]">{c.telephone || ''}</div>
                    </td>
                    <td className="py-2.5 px-3"><StatusText value={c.account_status} /></td>
                    <td className="py-2.5 px-3 font-mono text-[12px] text-[#526075]">{formatDate(c.created_at)}</td>
                    <td className="py-2.5 px-4 text-right whitespace-nowrap">
                      <Button variant="ghost" size="sm" onClick={() => navigate(`/customers/${c.id}`)}>
                        Profile <ArrowRight className="w-3.5 h-3.5" />
                      </Button>
                      <button type="button" onClick={() => handleArchiveCustomer(c)} className="p-1.5 text-[#64748B] hover:text-[#B45309] cursor-pointer" title={c.archived ? 'Restore' : 'Archive'}>
                        <Archive className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Surface>
        )
      )}

      {/* CONTACTS TABLE */}
      {section === 'contacts' && (
        filteredContacts.length === 0 ? (
          <EmptyState
            title="No contacts recorded"
            description="Add individual decision-makers, IT contacts, or billing representatives linked to customer accounts."
            action={<Button variant="primary" onClick={() => setContactModal(true)}>Add Contact</Button>}
          />
        ) : (
          <Surface className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[#DCE2EA] dark:border-[#242D3D] bg-[#F8FAFC] dark:bg-[#0F141D] text-[12px] font-semibold text-[#475569] dark:text-[#94A3B8]">
                  <th className="py-2.5 px-4">Full Name</th>
                  <th className="py-2.5 px-3">Title</th>
                  <th className="py-2.5 px-3">Customer Account</th>
                  <th className="py-2.5 px-3">Email</th>
                  <th className="py-2.5 px-3">Telephone</th>
                  <th className="py-2.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E2E8F0] dark:divide-[#242D3D] text-[13px]">
                {filteredContacts.map((ct) => (
                  <tr key={ct.id} className="hover:bg-[#F8FAFC] dark:hover:bg-[#1A2230]">
                    <td className="py-2.5 px-4 font-medium text-[#0B1018] dark:text-white">
                      {ct.full_name} {ct.is_primary ? <span className="text-[11px] text-[#0047FF] ml-1">· Primary</span> : null}
                    </td>
                    <td className="py-2.5 px-3 text-[12.5px] text-[#526075]">{ct.title || '—'}</td>
                    <td className="py-2.5 px-3 text-[12.5px] text-[#475569] dark:text-[#CBD5E1]">{ct.customer_name || 'Unlinked'}</td>
                    <td className="py-2.5 px-3 text-[12.5px] text-[#526075]">{ct.email || '—'}</td>
                    <td className="py-2.5 px-3 font-mono text-[12px] text-[#526075]">{ct.telephone || '—'}</td>
                    <td className="py-2.5 px-4 text-right">
                      <button type="button" onClick={() => handleDeleteContact(ct.id)} className="p-1.5 text-[#64748B] hover:text-[#DC2626] cursor-pointer">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Surface>
        )
      )}

      {/* LEADS TABLE OR PIPELINE */}
      {section === 'leads' && (
        filteredLeads.length === 0 ? (
          <EmptyState
            title="No leads in pipeline"
            description="Track prospective residential or commercial opportunities across New, Contacted, Qualified, Proposal Sent, Negotiation, Won, and Lost stages."
            action={<Button variant="primary" onClick={() => setLeadModal(true)}>Create First Lead</Button>}
          />
        ) : leadView === 'table' ? (
          <Surface className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[#DCE2EA] dark:border-[#242D3D] bg-[#F8FAFC] dark:bg-[#0F141D] text-[12px] font-semibold text-[#475569] dark:text-[#94A3B8]">
                  <th className="py-2.5 px-4">Prospect</th>
                  <th className="py-2.5 px-3">Type</th>
                  <th className="py-2.5 px-3">Stage</th>
                  <th className="py-2.5 px-3">Source</th>
                  <th className="py-2.5 px-3 text-right">Est. Value</th>
                  <th className="py-2.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E2E8F0] dark:divide-[#242D3D] text-[13px]">
                {filteredLeads.map((l) => (
                  <tr key={l.id} className="hover:bg-[#F8FAFC] dark:hover:bg-[#1A2230]">
                    <td className="py-2.5 px-4">
                      <div className="font-medium text-[#0B1018] dark:text-white">{l.name}</div>
                      <div className="text-[11.5px] text-[#64748B]">{l.organization || l.email || '—'}</div>
                    </td>
                    <td className="py-2.5 px-3 text-[12.5px] text-[#526075]">{l.customer_type}</td>
                    <td className="py-2.5 px-3">
                      <select value={l.stage} onChange={(e) => handleLeadStage(l.id, e.target.value)} className="px-2 py-1 text-xs rounded border border-[#DCE2EA] dark:border-[#2B3548] bg-white dark:bg-[#0B1018]">
                        {LEAD_STAGES.map((st) => <option key={st} value={st}>{st}</option>)}
                      </select>
                    </td>
                    <td className="py-2.5 px-3 text-[12.5px] text-[#526075]">{l.source}</td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums">{formatCurrency(l.estimated_value)}</td>
                    <td className="py-2.5 px-4 text-right whitespace-nowrap">
                      {!l.converted_customer_id ? (
                        <Button variant="secondary" size="sm" onClick={() => handleConvertLead(l.id)}>
                          <UserCheck className="w-3.5 h-3.5" /> Convert to Customer
                        </Button>
                      ) : (
                        <button type="button" onClick={() => navigate(`/customers/${l.converted_customer_id}`)} className="text-xs text-[#0047FF] hover:underline cursor-pointer">
                          View Customer
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Surface>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-4 lg:grid-cols-7 gap-3 overflow-x-auto">
            {LEAD_STAGES.map((stage) => {
              const items = filteredLeads.filter((l) => l.stage === stage);
              return (
                <div key={stage} className="bg-[#EBF0F6]/70 dark:bg-[#10151F] border border-[#DCE2EA] dark:border-[#242D3D] rounded-md p-2.5 min-w-[180px] space-y-2">
                  <div className="flex items-center justify-between text-xs font-semibold px-1">
                    <span className="truncate">{stage}</span>
                    <span className="font-mono text-[#64748B]">{items.length}</span>
                  </div>
                  {items.map((l) => (
                    <div key={l.id} className="p-2.5 bg-white dark:bg-[#141A24] border border-[#DCE2EA] dark:border-[#242D3D] rounded text-xs space-y-1.5">
                      <div className="font-medium text-[#0B1018] dark:text-white">{l.name}</div>
                      {l.organization && <div className="text-[11px] text-[#64748B]">{l.organization}</div>}
                      <div className="font-mono text-[11px] text-[#475569]">{formatCurrency(l.estimated_value)}</div>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        )
      )}

      {/* Create Customer Modal */}
      <Modal open={customerModal} onClose={() => setCustomerModal(false)} title="Create Customer Account" maxWidth="max-w-2xl">
        <form onSubmit={handleCreateCustomer} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Customer Name" required>
              <input required value={custForm.name} onChange={(e) => setCustForm({ ...custForm, name: e.target.value })} className={inputClass} />
            </Field>
            <Field label="Company / Organization">
              <input value={custForm.organization} onChange={(e) => setCustForm({ ...custForm, organization: e.target.value })} className={inputClass} />
            </Field>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Customer Type" required>
              <select value={custForm.customer_type} onChange={(e) => setCustForm({ ...custForm, customer_type: e.target.value })} className={inputClass}>
                {CUSTOMER_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </Field>
            <Field label="Account Status">
              <select value={custForm.account_status} onChange={(e) => setCustForm({ ...custForm, account_status: e.target.value })} className={inputClass}>
                <option>Active</option><option>Onboarding</option><option>On Hold</option><option>Inactive</option>
              </select>
            </Field>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Email">
              <input type="email" value={custForm.email} onChange={(e) => setCustForm({ ...custForm, email: e.target.value })} className={inputClass} />
            </Field>
            <Field label="Telephone">
              <input value={custForm.telephone} onChange={(e) => setCustForm({ ...custForm, telephone: e.target.value })} className={inputClass} />
            </Field>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Billing Address">
              <textarea rows={2} value={custForm.billing_address} onChange={(e) => setCustForm({ ...custForm, billing_address: e.target.value })} className={inputClass} />
            </Field>
            <Field label="Service Address">
              <textarea rows={2} value={custForm.service_address} onChange={(e) => setCustForm({ ...custForm, service_address: e.target.value })} className={inputClass} />
            </Field>
          </div>
          <Field label="Internal Notes">
            <textarea rows={2} value={custForm.notes} onChange={(e) => setCustForm({ ...custForm, notes: e.target.value })} className={inputClass} />
          </Field>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setCustomerModal(false)}>Cancel</Button>
            <Button type="submit" variant="primary">Create Customer</Button>
          </div>
        </form>
      </Modal>

      {/* Add Contact Modal */}
      <Modal open={contactModal} onClose={() => setContactModal(false)} title="Add Contact">
        <form onSubmit={handleCreateContact} className="space-y-4">
          <Field label="Full Name" required>
            <input required value={contactForm.full_name} onChange={(e) => setContactForm({ ...contactForm, full_name: e.target.value })} className={inputClass} />
          </Field>
          <Field label="Linked Customer Account">
            <select value={contactForm.customer_id} onChange={(e) => setContactForm({ ...contactForm, customer_id: e.target.value })} className={inputClass}>
              <option value="">None / Unlinked</option>
              {customers.map((c) => <option key={c.id} value={c.id}>{c.customer_code} — {c.name}</option>)}
            </select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Title / Role"><input value={contactForm.title} onChange={(e) => setContactForm({ ...contactForm, title: e.target.value })} className={inputClass} /></Field>
            <Field label="Telephone"><input value={contactForm.telephone} onChange={(e) => setContactForm({ ...contactForm, telephone: e.target.value })} className={inputClass} /></Field>
          </div>
          <Field label="Email"><input type="email" value={contactForm.email} onChange={(e) => setContactForm({ ...contactForm, email: e.target.value })} className={inputClass} /></Field>
          <label className="inline-flex items-center gap-2 text-xs">
            <input type="checkbox" checked={contactForm.is_primary} onChange={(e) => setContactForm({ ...contactForm, is_primary: e.target.checked })} />
            <span>Primary account contact</span>
          </label>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setContactModal(false)}>Cancel</Button>
            <Button type="submit" variant="primary">Save Contact</Button>
          </div>
        </form>
      </Modal>

      {/* New Lead Modal */}
      <Modal open={leadModal} onClose={() => setLeadModal(false)} title="Create Lead">
        <form onSubmit={handleCreateLead} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Lead Name" required><input required value={leadForm.name} onChange={(e) => setLeadForm({ ...leadForm, name: e.target.value })} className={inputClass} /></Field>
            <Field label="Organization"><input value={leadForm.organization} onChange={(e) => setLeadForm({ ...leadForm, organization: e.target.value })} className={inputClass} /></Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Email"><input type="email" value={leadForm.email} onChange={(e) => setLeadForm({ ...leadForm, email: e.target.value })} className={inputClass} /></Field>
            <Field label="Telephone"><input value={leadForm.telephone} onChange={(e) => setLeadForm({ ...leadForm, telephone: e.target.value })} className={inputClass} /></Field>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Type">
              <select value={leadForm.customer_type} onChange={(e) => setLeadForm({ ...leadForm, customer_type: e.target.value })} className={inputClass}>
                {CUSTOMER_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </Field>
            <Field label="Stage">
              <select value={leadForm.stage} onChange={(e) => setLeadForm({ ...leadForm, stage: e.target.value })} className={inputClass}>
                {LEAD_STAGES.map((st) => <option key={st} value={st}>{st}</option>)}
              </select>
            </Field>
            <Field label="Est. Value ($)"><input type="number" min="0" step="0.01" value={leadForm.estimated_value} onChange={(e) => setLeadForm({ ...leadForm, estimated_value: e.target.value })} className={`${inputClass} font-mono`} /></Field>
          </div>
          <Field label="Notes"><textarea rows={2} value={leadForm.notes} onChange={(e) => setLeadForm({ ...leadForm, notes: e.target.value })} className={inputClass} /></Field>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setLeadModal(false)}>Cancel</Button>
            <Button type="submit" variant="primary">Save Lead</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
