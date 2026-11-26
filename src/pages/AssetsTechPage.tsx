import React, { useEffect, useState, useCallback } from 'react';
import { Plus, Download, Upload, Printer, ShieldAlert, History, Edit3 } from 'lucide-react';
import { apiFetch, exportToCsv, formatDate, formatDateTime } from '../lib/api';
import { useApp } from '../context/AppContext';
import { Button, EmptyState, Field, inputClass, Modal, PageHeader, StatusText, Surface } from '../components/ui';

const ASSET_CATEGORIES = ['Computer', 'Laptop', 'Server', 'Monitor', 'Networking Equipment', 'Mobile Device', 'Storage Media', 'Peripheral'] as const;
const ASSET_STATUSES = ['In Stock', 'Deployed', 'Assigned', 'Under Evaluation', 'Under Repair', 'Refurbished', 'Pending Retirement', 'Retired', 'Disposed'] as const;

export const AssetsTechPage: React.FC<{ view: 'assets' | 'infrastructure' | 'security' | 'lifecycle' }> = ({ view }) => {
  const { settings } = useApp();
  const [assets, setAssets] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [tickets, setTickets] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [assetModal, setAssetModal] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [labelAsset, setLabelAsset] = useState<any | null>(null);
  const [custodyAsset, setCustodyAsset] = useState<any | null>(null);
  const [importModal, setImportModal] = useState(false);
  const [csvText, setCsvText] = useState('');

  const [form, setForm] = useState({
    asset_tag: '', serial_number: '', manufacturer: '', model: '', category: 'Laptop',
    processor: '', memory: '', storage: '', condition_grade: 'Unassessed',
    ownership: 'Company-Owned', customer_id: '', physical_location: '',
    acquisition_date: '', warranty_expiration: '', status: 'In Stock', notes: '',
  });

  const [custodyForm, setCustodyForm] = useState({
    event_type: 'Intake Received',
    custodian: '',
    location: '',
    notes: '',
  });

  const gradingCriteria: { grade: string; label: string; criteria: string }[] = (() => {
    try {
      return JSON.parse(settings?.asset_grading_json || '[]');
    } catch {
      return [];
    }
  })();

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [aRes, cRes, tRes] = await Promise.all([
        apiFetch<{ items: any[] }>('/api/assets'),
        apiFetch<{ items: any[] }>('/api/customers'),
        view !== 'assets' ? apiFetch<{ items: any[] }>('/api/tickets') : Promise.resolve({ items: [] }),
      ]);
      setAssets(aRes.items || []);
      setCustomers(cRes.items || []);
      setTickets(tRes.items || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [view]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const openCreate = () => {
    setEditing(null);
    setForm({
      asset_tag: '', serial_number: '', manufacturer: '', model: '', category: view === 'infrastructure' ? 'Networking Equipment' : 'Laptop',
      processor: '', memory: '', storage: '', condition_grade: 'Unassessed',
      ownership: view === 'lifecycle' ? 'Lifecycle Intake' : 'Company-Owned', customer_id: '', physical_location: '',
      acquisition_date: '', warranty_expiration: '', status: view === 'lifecycle' ? 'Under Evaluation' : 'In Stock', notes: '',
    });
    setAssetModal(true);
  };

  const openEdit = (a: any) => {
    setEditing(a);
    setForm({
      asset_tag: a.asset_tag || '', serial_number: a.serial_number || '', manufacturer: a.manufacturer || '',
      model: a.model || '', category: a.category || 'Laptop', processor: a.processor || '',
      memory: a.memory || '', storage: a.storage || '', condition_grade: a.condition_grade || 'Unassessed',
      ownership: a.ownership || 'Company-Owned', customer_id: a.customer_id || '', physical_location: a.physical_location || '',
      acquisition_date: a.acquisition_date || '', warranty_expiration: a.warranty_expiration || '',
      status: a.status || 'In Stock', notes: a.notes || '',
    });
    setAssetModal(true);
  };

  const handleSaveAsset = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const payload = {
      ...form,
      customer_id: form.customer_id || null,
      acquisition_date: form.acquisition_date || null,
      warranty_expiration: form.warranty_expiration || null,
    };
    try {
      if (editing) await apiFetch(`/api/assets/${editing.id}`, { method: 'PUT', body: JSON.stringify(payload) });
      else await apiFetch('/api/assets', { method: 'POST', body: JSON.stringify(payload) });
      setAssetModal(false);
      await loadData();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleCustodySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!custodyAsset) return;
    await apiFetch(`/api/assets/${custodyAsset.id}/custody`, { method: 'POST', body: JSON.stringify(custodyForm) });
    setCustodyForm({ event_type: 'Intake Received', custodian: '', location: '', notes: '' });
    setCustodyAsset(null);
    await loadData();
  };

  const handleCsvImport = async (e: React.FormEvent) => {
    e.preventDefault();
    const lines = csvText.trim().split('\n').filter(Boolean);
    if (lines.length < 2) {
      setError('CSV must include a header row and at least one data row.');
      return;
    }
    const headers = lines[0].split(',').map((h) => h.trim().toLowerCase());
    const rows = lines.slice(1).map((line) => {
      const cols = line.split(',').map((c) => c.trim());
      const obj: Record<string, string> = {};
      headers.forEach((h, i) => { obj[h] = cols[i] || ''; });
      return obj;
    });
    await apiFetch('/api/assets/import', { method: 'POST', body: JSON.stringify({ rows }) });
    setImportModal(false);
    setCsvText('');
    await loadData();
  };

  const filteredAssets = assets.filter((a) => {
    if (view === 'infrastructure' && !['Server', 'Networking Equipment', 'Computer'].includes(a.category)) return false;
    if (view === 'lifecycle' && !['Under Evaluation', 'Refurbished', 'Pending Retirement', 'Retired', 'Disposed'].includes(a.status) && a.ownership !== 'Lifecycle Intake') return false;
    if (statusFilter !== 'All' && a.status !== statusFilter) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      return (
        a.asset_code.toLowerCase().includes(q) ||
        (a.model || '').toLowerCase().includes(q) ||
        (a.serial_number || '').toLowerCase().includes(q) ||
        (a.manufacturer || '').toLowerCase().includes(q)
      );
    }
    return true;
  });

  const viewMeta = {
    assets: { title: 'IT Asset Management (ITAM)', desc: 'Inventory, hardware specifications, condition grading, printable asset labels, and assignment history.' },
    infrastructure: { title: 'KORTRIX Infrastructure Operations', desc: 'Servers, networking equipment, workstations, and active infrastructure support tickets.' },
    security: { title: 'KORTRIX Security Operations', desc: 'Security assessments, incident tickets, and endpoint protection tracking. Remote device control and automated scanning are excluded by policy.' },
    lifecycle: { title: 'KORTRIX Lifecycle & Disposition', desc: 'Equipment auditing, refurbishment grading, chain-of-custody logs, and partner disposition coordination.' },
  }[view];

  const securityTickets = tickets.filter((t) => t.service_category === 'KORTRIX Security');

  return (
    <div className="space-y-5">
      <PageHeader
        title={viewMeta.title}
        description={viewMeta.desc}
        actions={
          <>
            {view === 'assets' && (
              <>
                <Button variant="secondary" onClick={() => setImportModal(true)}><Upload className="w-4 h-4" /> Import CSV</Button>
                {filteredAssets.length > 0 && (
                  <Button
                    variant="secondary"
                    onClick={() =>
                      exportToCsv(
                        'kortrix-assets.csv',
                        filteredAssets.map((a) => ({
                          asset_code: a.asset_code, asset_tag: a.asset_tag, serial_number: a.serial_number,
                          manufacturer: a.manufacturer, model: a.model, category: a.category,
                          condition_grade: a.condition_grade, ownership: a.ownership, status: a.status, location: a.physical_location,
                        }))
                      )
                    }
                  >
                    <Download className="w-4 h-4" /> Export CSV
                  </Button>
                )}
              </>
            )}
            <Button variant="primary" onClick={openCreate}><Plus className="w-4 h-4" /> Register Asset</Button>
          </>
        }
      />

      {error && <div className="p-3 rounded-md bg-[#FEF2F2] border border-[#FECACA] text-xs text-[#B91C1C]">{error}</div>}

      {view === 'lifecycle' && (
        <Surface className="p-4 flex items-start gap-3 text-xs text-[#475569] dark:text-[#94A3B8]">
          <ShieldAlert className="w-4 h-4 text-[#B45309] shrink-0 mt-0.5" />
          <div>
            <span className="font-semibold text-[#0B1018] dark:text-white">Lifecycle Compliance Notice:</span> KORTRIX ONE maintains internal chain-of-custody logs and disposition coordination records. Automated data destruction certificates are intentionally omitted until certified third-party partner integrations or formal certifications are established.
          </div>
        </Surface>
      )}

      {view === 'security' && (
        <Surface className="p-5 space-y-3">
          <h2 className="font-display text-[14px] font-semibold">Active Security Tickets & Assessments</h2>
          {securityTickets.length === 0 ? (
            <div className="text-xs text-[#64748B]">No security tickets or assessments currently open. Create a ticket under KORTRIX Security in Service Desk.</div>
          ) : (
            <div className="divide-y divide-[#E2E8F0] dark:divide-[#242D3D]">
              {securityTickets.map((t) => (
                <div key={t.id} className="py-2.5 flex items-center justify-between text-[13px]">
                  <div><span className="font-mono text-xs text-[#0047FF] mr-2">{t.ticket_number}</span><span>{t.subject}</span></div>
                  <div className="flex items-center gap-3"><StatusText value={t.priority} /><StatusText value={t.status} /></div>
                </div>
              ))}
            </div>
          )}
        </Surface>
      )}

      {/* Search & Status Filters */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search asset ID, serial, model..." className={`${inputClass} sm:w-64`} />
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className={`${inputClass} sm:w-44`}>
            <option value="All">All Statuses</option>
            {ASSET_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div className="text-xs text-[#64748B] font-mono tabular-nums">{filteredAssets.length} asset(s)</div>
      </div>

      {loading ? (
        <Surface className="p-8 text-center text-xs text-[#64748B]">Loading IT assets...</Surface>
      ) : filteredAssets.length === 0 ? (
        <EmptyState
          title="No technology assets recorded"
          description="Register company-owned, customer-owned, or lifecycle intake devices with serial numbers, hardware specs, and custody logs."
          action={<Button variant="primary" onClick={openCreate}>Register First Asset</Button>}
        />
      ) : (
        <Surface className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-[#DCE2EA] dark:border-[#242D3D] bg-[#F8FAFC] dark:bg-[#0F141D] text-[12px] font-semibold text-[#475569] dark:text-[#94A3B8]">
                <th className="py-2.5 px-4">Asset ID</th>
                <th className="py-2.5 px-3">Device / Hardware</th>
                <th className="py-2.5 px-3">Serial #</th>
                <th className="py-2.5 px-3">Category</th>
                <th className="py-2.5 px-3">Grade</th>
                <th className="py-2.5 px-3">Ownership</th>
                <th className="py-2.5 px-3">Status</th>
                <th className="py-2.5 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E2E8F0] dark:divide-[#242D3D] text-[13px]">
              {filteredAssets.map((a) => (
                <tr key={a.id} className="hover:bg-[#F8FAFC] dark:hover:bg-[#1A2230]">
                  <td className="py-2.5 px-4 font-mono text-[12px] text-[#0047FF] whitespace-nowrap">{a.asset_code}</td>
                  <td className="py-2.5 px-3">
                    <div className="font-medium text-[#0B1018] dark:text-white">{a.manufacturer} {a.model}</div>
                    <div className="text-[11.5px] text-[#64748B]">
                      {[a.processor, a.memory, a.storage].filter(Boolean).join(' · ') || a.physical_location || '—'}
                    </div>
                  </td>
                  <td className="py-2.5 px-3 font-mono text-[12px] text-[#526075]">{a.serial_number || '—'}</td>
                  <td className="py-2.5 px-3 text-[12.5px] text-[#526075]">{a.category}</td>
                  <td className="py-2.5 px-3 text-[12px] font-mono text-[#475569] dark:text-[#CBD5E1]">{a.condition_grade}</td>
                  <td className="py-2.5 px-3 text-[12px] text-[#526075]">
                    {a.ownership}
                    {a.customer_name && <div className="text-[11px] text-[#0047FF]">{a.customer_name}</div>}
                  </td>
                  <td className="py-2.5 px-3"><StatusText value={a.status} /></td>
                  <td className="py-2.5 px-4 text-right whitespace-nowrap">
                    <button type="button" onClick={() => setLabelAsset(a)} className="p-1.5 text-[#526075] hover:text-[#0047FF] cursor-pointer" title="Printable Asset Label">
                      <Printer className="w-3.5 h-3.5" />
                    </button>
                    <button type="button" onClick={() => setCustodyAsset(a)} className="p-1.5 text-[#526075] hover:text-[#0047FF] cursor-pointer" title="Chain of Custody">
                      <History className="w-3.5 h-3.5" />
                    </button>
                    <button type="button" onClick={() => openEdit(a)} className="p-1.5 text-[#526075] hover:text-[#0047FF] cursor-pointer" title="Edit asset">
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Surface>
      )}

      {/* Asset Grading Criteria Reference */}
      {gradingCriteria.length > 0 && (
        <Surface className="p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-display text-[14px] font-semibold">Asset Condition Grading Rubric</h2>
            <span className="text-xs text-[#64748B]">Editable in Administration -&gt; Company Settings</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
            {gradingCriteria.map((g) => (
              <div key={g.grade} className="p-3 bg-[#F8FAFC] dark:bg-[#0F141D] border border-[#DCE2EA] dark:border-[#242D3D] rounded">
                <div className="font-semibold text-[#0B1018] dark:text-white">{g.grade} · {g.label}</div>
                <div className="mt-1 text-[#526075] dark:text-[#94A3B8] leading-relaxed">{g.criteria}</div>
              </div>
            ))}
          </div>
        </Surface>
      )}

      {/* Register / Edit Asset Modal */}
      <Modal open={assetModal} onClose={() => setAssetModal(false)} title={editing ? `Edit Asset — ${editing.asset_code}` : 'Register Technology Asset'} maxWidth="max-w-2xl">
        <form onSubmit={handleSaveAsset} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Field label="Manufacturer"><input value={form.manufacturer} onChange={(e) => setForm({ ...form, manufacturer: e.target.value })} placeholder="Dell, Lenovo, Cisco..." className={inputClass} /></Field>
            <Field label="Model" required><input required value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} placeholder="ThinkPad T14 Gen 4" className={inputClass} /></Field>
            <Field label="Category">
              <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className={inputClass}>
                {ASSET_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </Field>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Field label="Asset Tag"><input value={form.asset_tag} onChange={(e) => setForm({ ...form, asset_tag: e.target.value })} placeholder="Auto if blank" className={`${inputClass} font-mono`} /></Field>
            <Field label="Serial Number"><input value={form.serial_number} onChange={(e) => setForm({ ...form, serial_number: e.target.value })} className={`${inputClass} font-mono`} /></Field>
            <Field label="Condition Grade">
              <select value={form.condition_grade} onChange={(e) => setForm({ ...form, condition_grade: e.target.value })} className={inputClass}>
                <option value="Unassessed">Unassessed</option>
                {gradingCriteria.map((g) => <option key={g.grade} value={g.grade}>{g.grade} ({g.label})</option>)}
              </select>
            </Field>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Field label="Processor"><input value={form.processor} onChange={(e) => setForm({ ...form, processor: e.target.value })} className={inputClass} /></Field>
            <Field label="Memory"><input value={form.memory} onChange={(e) => setForm({ ...form, memory: e.target.value })} className={inputClass} /></Field>
            <Field label="Storage"><input value={form.storage} onChange={(e) => setForm({ ...form, storage: e.target.value })} className={inputClass} /></Field>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Field label="Ownership">
              <select value={form.ownership} onChange={(e) => setForm({ ...form, ownership: e.target.value })} className={inputClass}>
                <option>Company-Owned</option><option>Customer-Owned</option><option>Lifecycle Intake</option>
              </select>
            </Field>
            <Field label="Associated Customer">
              <select value={form.customer_id} onChange={(e) => setForm({ ...form, customer_id: e.target.value })} className={inputClass}>
                <option value="">None / Internal</option>
                {customers.map((c) => <option key={c.id} value={c.id}>{c.customer_code} — {c.name}</option>)}
              </select>
            </Field>
            <Field label="Current Status">
              <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className={inputClass}>
                {ASSET_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </Field>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Field label="Physical Location"><input value={form.physical_location} onChange={(e) => setForm({ ...form, physical_location: e.target.value })} className={inputClass} /></Field>
            <Field label="Acquisition Date"><input type="date" value={form.acquisition_date} onChange={(e) => setForm({ ...form, acquisition_date: e.target.value })} className={inputClass} /></Field>
            <Field label="Warranty Expiration"><input type="date" value={form.warranty_expiration} onChange={(e) => setForm({ ...form, warranty_expiration: e.target.value })} className={inputClass} /></Field>
          </div>
          <Field label="Notes"><textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className={inputClass} /></Field>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setAssetModal(false)}>Cancel</Button>
            <Button type="submit" variant="primary">{editing ? 'Save Asset' : 'Register Asset'}</Button>
          </div>
        </form>
      </Modal>

      {/* Printable Asset Label Modal */}
      <Modal open={Boolean(labelAsset)} onClose={() => setLabelAsset(null)} title="Printable Asset Label">
        {labelAsset && (
          <div className="space-y-4">
            <div className="p-5 border-2 border-[#0B1018] rounded bg-white text-[#0B1018] font-mono">
              <div className="flex justify-between items-center border-b border-[#0B1018] pb-2">
                <span className="font-display font-bold tracking-wider text-sm">KORTRIX ITAM</span>
                <span className="text-xs font-semibold">{labelAsset.asset_code}</span>
              </div>
              <div className="mt-3 text-sm font-bold">{labelAsset.manufacturer} {labelAsset.model}</div>
              <div className="mt-1 text-xs">Tag: {labelAsset.asset_tag || labelAsset.asset_code}</div>
              <div className="text-xs">S/N: {labelAsset.serial_number || 'N/A'}</div>
              <div className="text-xs">Category: {labelAsset.category} · Grade: {labelAsset.condition_grade}</div>
              <div className="mt-2 pt-2 border-t border-[#DCE2EA] text-[10px] text-[#526075] flex justify-between">
                <span>one.kortrix.com</span>
                <span>{formatDate(labelAsset.created_at)}</span>
              </div>
            </div>
            <div className="flex justify-end gap-2 no-print">
              <Button variant="secondary" onClick={() => setLabelAsset(null)}>Close</Button>
              <Button variant="primary" onClick={() => window.print()}><Printer className="w-4 h-4" /> Print Label</Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Chain of Custody Modal */}
      <Modal open={Boolean(custodyAsset)} onClose={() => setCustodyAsset(null)} title={`Chain of Custody — ${custodyAsset?.asset_code || ''}`}>
        {custodyAsset && (
          <div className="space-y-4">
            <div className="divide-y divide-[#E2E8F0] dark:divide-[#242D3D] border border-[#DCE2EA] dark:border-[#242D3D] rounded-md max-h-52 overflow-y-auto">
              {(custodyAsset.custody_chain || []).length === 0 ? (
                <div className="p-4 text-xs text-[#64748B]">No chain-of-custody entries recorded yet.</div>
              ) : (
                custodyAsset.custody_chain.map((c: any) => (
                  <div key={c.id} className="p-3 text-xs">
                    <div className="font-medium text-[#0B1018] dark:text-white">{c.event_type} · Custodian: {c.custodian}</div>
                    {c.location && <div className="text-[#526075]">Location: {c.location}</div>}
                    {c.notes && <div className="text-[#526075]">{c.notes}</div>}
                    <div className="font-mono text-[10.5px] text-[#64748B] mt-1">{c.recorded_by} · {formatDateTime(c.at)}</div>
                  </div>
                ))
              )}
            </div>
            <form onSubmit={handleCustodySubmit} className="space-y-3 pt-2 border-t border-[#DCE2EA] dark:border-[#242D3D]">
              <Field label="Event Type">
                <select value={custodyForm.event_type} onChange={(e) => setCustodyForm({ ...custodyForm, event_type: e.target.value })} className={inputClass}>
                  <option>Intake Received</option><option>Assigned to User</option><option>Transferred</option>
                  <option>Sanitization Coordinated</option><option>Partner Recycling Transfer</option><option>Disposed</option>
                </select>
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Custodian / Recipient" required><input required value={custodyForm.custodian} onChange={(e) => setCustodyForm({ ...custodyForm, custodian: e.target.value })} className={inputClass} /></Field>
                <Field label="Location"><input value={custodyForm.location} onChange={(e) => setCustodyForm({ ...custodyForm, location: e.target.value })} className={inputClass} /></Field>
              </div>
              <Field label="Notes"><textarea rows={2} value={custodyForm.notes} onChange={(e) => setCustodyForm({ ...custodyForm, notes: e.target.value })} className={inputClass} /></Field>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="secondary" onClick={() => setCustodyAsset(null)}>Close</Button>
                <Button type="submit" variant="primary">Record Custody Event</Button>
              </div>
            </form>
          </div>
        )}
      </Modal>

      {/* CSV Import Modal */}
      <Modal open={importModal} onClose={() => setImportModal(false)} title="Import Assets via CSV">
        <form onSubmit={handleCsvImport} className="space-y-4">
          <Field label="Paste CSV Data" hint="Required column: model. Optional: manufacturer, serial_number, asset_tag, category, ownership, status, physical_location">
            <textarea
              rows={6}
              required
              value={csvText}
              onChange={(e) => setCsvText(e.target.value)}
              placeholder={'manufacturer,model,serial_number,category,status\nLenovo,ThinkPad T14,PF3ABCD1,Laptop,In Stock'}
              className={`${inputClass} font-mono text-xs`}
            />
          </Field>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setImportModal(false)}>Cancel</Button>
            <Button type="submit" variant="primary">Import Records</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
