import React, { useEffect, useState, useCallback } from 'react';
import { Plus, Edit3, Trash2 } from 'lucide-react';
import { apiFetch, formatCurrency } from '../lib/api';
import { Button, Field, inputClass, Modal, PageHeader, StatusText, Surface } from '../components/ui';

const DIVISIONS = ['All', 'KORTRIX Infrastructure', 'KORTRIX Security', 'KORTRIX Lifecycle'] as const;
const PRICING_MODELS = ['Fixed Price', 'Hourly', 'Per Device', 'Per User', 'Recurring', 'Custom Quote'] as const;

export const ServiceCatalogPage: React.FC = () => {
  const [services, setServices] = useState<any[]>([]);
  const [divisionFilter, setDivisionFilter] = useState<string>('All');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [error, setError] = useState('');

  const [form, setForm] = useState({
    name: '',
    division: 'KORTRIX Infrastructure',
    description: '',
    included_work: '',
    exclusions: '',
    pricing_model: 'Custom Quote',
    price: '',
    estimated_duration: '',
    delivery_mode: 'On-Site & Remote',
    tax_classification: 'Taxable Service',
    active: true,
    publication_status: 'Draft',
  });

  const loadServices = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch<{ items: any[] }>('/api/services');
      setServices(res.items || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadServices();
  }, [loadServices]);

  const openCreate = () => {
    setEditing(null);
    setForm({
      name: '',
      division: divisionFilter !== 'All' ? divisionFilter : 'KORTRIX Infrastructure',
      description: '',
      included_work: '',
      exclusions: '',
      pricing_model: 'Custom Quote',
      price: '',
      estimated_duration: '',
      delivery_mode: 'On-Site & Remote',
      tax_classification: 'Taxable Service',
      active: true,
      publication_status: 'Draft',
    });
    setModalOpen(true);
  };

  const openEdit = (svc: any) => {
    setEditing(svc);
    setForm({
      name: svc.name,
      division: svc.division,
      description: svc.description || '',
      included_work: svc.included_work || '',
      exclusions: svc.exclusions || '',
      pricing_model: svc.pricing_model,
      price: svc.price !== null && svc.price !== undefined ? String(svc.price) : '',
      estimated_duration: svc.estimated_duration || '',
      delivery_mode: svc.delivery_mode,
      tax_classification: svc.tax_classification || 'Taxable Service',
      active: Boolean(svc.active),
      publication_status: svc.publication_status || 'Draft',
    });
    setModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const payload = {
      ...form,
      price: form.price.trim() === '' ? null : Number(form.price),
    };
    try {
      if (editing) {
        await apiFetch(`/api/services/${editing.id}`, { method: 'PUT', body: JSON.stringify(payload) });
      } else {
        await apiFetch('/api/services', { method: 'POST', body: JSON.stringify(payload) });
      }
      setModalOpen(false);
      await loadServices();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleDelete = async (id: string) => {
    await apiFetch(`/api/services/${id}`, { method: 'DELETE' });
    await loadServices();
  };

  const filtered = services.filter((s) => {
    if (divisionFilter !== 'All' && s.division !== divisionFilter) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      return s.name.toLowerCase().includes(q) || s.service_code.toLowerCase().includes(q) || (s.description || '').toLowerCase().includes(q);
    }
    return true;
  });

  return (
    <div className="space-y-5">
      <PageHeader
        title="Service Catalog & Pricing"
        description="Official KORTRIX divisions and service definitions. Unapproved prices remain blank until formally reviewed and approved."
        actions={
          <Button variant="primary" onClick={openCreate}>
            <Plus className="w-4 h-4" /> Add Service
          </Button>
        }
      />

      {error && (
        <div className="p-3 rounded-md bg-[#FEF2F2] dark:bg-[#450A0A]/40 border border-[#FECACA] text-xs text-[#B91C1C]">
          {error}
        </div>
      )}

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-1 p-1 bg-[#EBF0F6] dark:bg-[#141A24] border border-[#DCE2EA] dark:border-[#242D3D] rounded-md overflow-x-auto">
          {DIVISIONS.map((div) => (
            <button
              key={div}
              type="button"
              onClick={() => setDivisionFilter(div)}
              className={`px-3 py-1 text-xs font-medium rounded whitespace-nowrap cursor-pointer ${
                divisionFilter === div
                  ? 'bg-white dark:bg-[#0B1018] text-[#0B1018] dark:text-white'
                  : 'text-[#526075] dark:text-[#94A3B8] hover:text-[#0B1018] dark:hover:text-white'
              }`}
            >
              {div}
            </button>
          ))}
        </div>
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search services..."
          className={`${inputClass} sm:w-64`}
        />
      </div>

      <Surface className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-[#DCE2EA] dark:border-[#242D3D] bg-[#F8FAFC] dark:bg-[#0F141D] text-[12px] font-semibold text-[#475569] dark:text-[#94A3B8]">
              <th className="py-2.5 px-4">Service ID</th>
              <th className="py-2.5 px-3">Service Name</th>
              <th className="py-2.5 px-3">Division</th>
              <th className="py-2.5 px-3">Pricing Model</th>
              <th className="py-2.5 px-3 text-right">Unit Price</th>
              <th className="py-2.5 px-3">Delivery</th>
              <th className="py-2.5 px-3">Publication</th>
              <th className="py-2.5 px-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#E2E8F0] dark:divide-[#242D3D] text-[13px]">
            {loading ? (
              <tr><td colSpan={8} className="py-8 text-center text-xs text-[#64748B]">Loading service catalog...</td></tr>
            ) : (
              filtered.map((s) => (
                <tr key={s.id} className="hover:bg-[#F8FAFC] dark:hover:bg-[#1A2230]">
                  <td className="py-2.5 px-4 font-mono text-[12px] text-[#526075] whitespace-nowrap">{s.service_code}</td>
                  <td className="py-2.5 px-3">
                    <div className="font-medium text-[#0B1018] dark:text-white">{s.name}</div>
                    {s.description && <div className="text-[11.5px] text-[#64748B] line-clamp-1 max-w-md">{s.description}</div>}
                  </td>
                  <td className="py-2.5 px-3 text-[12.5px] text-[#475569] dark:text-[#CBD5E1] whitespace-nowrap">{s.division}</td>
                  <td className="py-2.5 px-3 text-[12.5px] text-[#475569] dark:text-[#CBD5E1] whitespace-nowrap">{s.pricing_model}</td>
                  <td className="py-2.5 px-3 text-right font-mono tabular-nums whitespace-nowrap">
                    {s.price !== null && s.price !== undefined ? (
                      <span className="text-[#0B1018] dark:text-white font-medium">{formatCurrency(s.price)}</span>
                    ) : (
                      <span className="text-[#94A3B8] text-xs">Unset</span>
                    )}
                  </td>
                  <td className="py-2.5 px-3 text-[12px] text-[#526075] dark:text-[#94A3B8] whitespace-nowrap">{s.delivery_mode}</td>
                  <td className="py-2.5 px-3 whitespace-nowrap">
                    <StatusText value={s.publication_status} />
                    {!s.active && <span className="text-[11px] text-[#94A3B8] ml-1.5">· Inactive</span>}
                  </td>
                  <td className="py-2.5 px-4 text-right whitespace-nowrap">
                    <button type="button" onClick={() => openEdit(s)} className="p-1.5 text-[#526075] hover:text-[#0047FF] cursor-pointer" title="Edit service">
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>
                    <button type="button" onClick={() => handleDelete(s.id)} className="p-1.5 text-[#526075] hover:text-[#DC2626] cursor-pointer" title="Delete service">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </Surface>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? `Edit Service — ${editing.service_code}` : 'Add Service Offering'} maxWidth="max-w-2xl">
        <form onSubmit={handleSave} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Service Name" required>
              <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inputClass} />
            </Field>
            <Field label="Division" required>
              <select value={form.division} onChange={(e) => setForm({ ...form, division: e.target.value })} className={inputClass}>
                <option>KORTRIX Infrastructure</option>
                <option>KORTRIX Security</option>
                <option>KORTRIX Lifecycle</option>
              </select>
            </Field>
          </div>
          <Field label="Description">
            <textarea rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className={inputClass} />
          </Field>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Included Work">
              <textarea rows={2} value={form.included_work} onChange={(e) => setForm({ ...form, included_work: e.target.value })} className={inputClass} />
            </Field>
            <Field label="Exclusions">
              <textarea rows={2} value={form.exclusions} onChange={(e) => setForm({ ...form, exclusions: e.target.value })} className={inputClass} />
            </Field>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Field label="Pricing Model">
              <select value={form.pricing_model} onChange={(e) => setForm({ ...form, pricing_model: e.target.value })} className={inputClass}>
                {PRICING_MODELS.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </Field>
            <Field label="Price (USD)" hint="Leave blank if unapproved">
              <input type="number" step="0.01" min="0" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} placeholder="Blank" className={`${inputClass} font-mono`} />
            </Field>
            <Field label="Estimated Duration">
              <input value={form.estimated_duration} onChange={(e) => setForm({ ...form, estimated_duration: e.target.value })} placeholder="e.g., 1-2 hours" className={inputClass} />
            </Field>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Field label="Delivery Availability">
              <select value={form.delivery_mode} onChange={(e) => setForm({ ...form, delivery_mode: e.target.value })} className={inputClass}>
                <option>On-Site & Remote</option>
                <option>On-Site Only</option>
                <option>Remote Only</option>
              </select>
            </Field>
            <Field label="Tax Classification">
              <input value={form.tax_classification} onChange={(e) => setForm({ ...form, tax_classification: e.target.value })} className={inputClass} />
            </Field>
            <Field label="Publication Status">
              <select value={form.publication_status} onChange={(e) => setForm({ ...form, publication_status: e.target.value })} className={inputClass}>
                <option value="Draft">Draft</option>
                <option value="Approved">Approved</option>
              </select>
            </Field>
          </div>
          <label className="inline-flex items-center gap-2 text-xs text-[#334155] dark:text-[#CBD5E1]">
            <input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} />
            <span>Service Active in Internal Catalog</span>
          </label>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button type="submit" variant="primary">{editing ? 'Save Service' : 'Add Service'}</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
