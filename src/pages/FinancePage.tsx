import React, { useEffect, useState, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Plus, Printer, ArrowRight, Trash2, Info } from 'lucide-react';
import { apiFetch, formatCurrency, formatDate } from '../lib/api';
import { useApp } from '../context/AppContext';
import { KortrixLogo } from '../components/KortrixLogo';
import { Button, EmptyState, Field, inputClass, Modal, PageHeader, StatusText, Surface } from '../components/ui';

interface LineItem {
  description: string;
  service_id?: string | null;
  quantity: number;
  unit_price: number;
}

export const FinancePage: React.FC<{ section: 'quotations' | 'invoices' | 'expenses' | 'overview' }> = ({ section }) => {
  const { settings } = useApp();
  const [searchParams, setSearchParams] = useSearchParams();
  const currency = settings?.currency || 'USD';

  const [quotations, setQuotations] = useState<any[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [expenses, setExpenses] = useState<any[]>([]);
  const [summary, setSummary] = useState<any | null>(null);
  const [customers, setCustomers] = useState<any[]>([]);
  const [services, setServices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [quoteModal, setQuoteModal] = useState(false);
  const [invoiceModal, setInvoiceModal] = useState(false);
  const [expenseModal, setExpenseModal] = useState(false);
  const [printDoc, setPrintDoc] = useState<{ kind: 'Quotation' | 'Invoice'; data: any } | null>(null);

  const [docCustomerId, setDocCustomerId] = useState('');
  const [docLines, setDocLines] = useState<LineItem[]>([{ description: '', quantity: 1, unit_price: 0 }]);
  const [docDiscount, setDocDiscount] = useState('0');
  const [docTaxRate, setDocTaxRate] = useState(String(settings?.tax_rate || 0));
  const [docDate, setDocDate] = useState('');
  const [docNotes, setDocNotes] = useState('');
  const [docTerms, setDocTerms] = useState('Valid for 30 days. Payment due upon completion unless otherwise agreed in writing.');

  const [expenseForm, setExpenseForm] = useState({
    vendor: '', category: 'Software & Subscriptions', amount: '', expense_date: new Date().toISOString().slice(0, 10), description: '',
  });

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [qRes, iRes, eRes, sRes, cRes, svcRes] = await Promise.all([
        apiFetch<{ items: any[] }>('/api/quotations'),
        apiFetch<{ items: any[] }>('/api/invoices'),
        apiFetch<{ items: any[] }>('/api/expenses'),
        apiFetch<any>('/api/finance/summary'),
        apiFetch<{ items: any[] }>('/api/customers'),
        apiFetch<{ items: any[] }>('/api/services'),
      ]);
      setQuotations(qRes.items || []);
      setInvoices(iRes.items || []);
      setExpenses(eRes.items || []);
      setSummary(sRes);
      setCustomers(cRes.items || []);
      setServices(svcRes.items || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (searchParams.get('new') === '1') {
      if (section === 'quotations') openNewQuote();
      else if (section === 'invoices') openNewInvoice();
      else if (section === 'expenses') setExpenseModal(true);
      setSearchParams({});
    }
  }, [searchParams, section, setSearchParams]);

  const resetLineEditor = () => {
    setDocCustomerId('');
    setDocLines([{ description: '', quantity: 1, unit_price: 0 }]);
    setDocDiscount('0');
    setDocTaxRate(String(settings?.tax_rate || 0));
    setDocDate('');
    setDocNotes('');
  };

  const openNewQuote = () => { resetLineEditor(); setQuoteModal(true); };
  const openNewInvoice = () => { resetLineEditor(); setInvoiceModal(true); };

  const addServiceLine = (serviceId: string) => {
    const svc = services.find((s) => s.id === serviceId);
    if (!svc) return;
    setDocLines((prev) => [
      ...prev.filter((l) => l.description.trim() !== ''),
      { description: `${svc.service_code} — ${svc.name}`, service_id: svc.id, quantity: 1, unit_price: Number(svc.price || 0) },
    ]);
  };

  const handleSaveQuote = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      await apiFetch('/api/quotations', {
        method: 'POST',
        body: JSON.stringify({
          customer_id: docCustomerId || null,
          line_items: docLines.filter((l) => l.description.trim()),
          discount_amount: Number(docDiscount || 0),
          tax_rate: Number(docTaxRate || 0),
          expiration_date: docDate || null,
          notes: docNotes,
          terms: docTerms,
        }),
      });
      setQuoteModal(false);
      await loadData();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleSaveInvoice = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      await apiFetch('/api/invoices', {
        method: 'POST',
        body: JSON.stringify({
          customer_id: docCustomerId || null,
          line_items: docLines.filter((l) => l.description.trim()),
          tax_rate: Number(docTaxRate || 0),
          due_date: docDate || null,
          notes: docNotes,
        }),
      });
      setInvoiceModal(false);
      await loadData();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleSaveExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiFetch('/api/expenses', {
        method: 'POST',
        body: JSON.stringify({ ...expenseForm, amount: Number(expenseForm.amount) }),
      });
      setExpenseModal(false);
      setExpenseForm({ vendor: '', category: 'Software & Subscriptions', amount: '', expense_date: new Date().toISOString().slice(0, 10), description: '' });
      await loadData();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const updateQuoteStatus = async (id: string, status: string) => {
    await apiFetch(`/api/quotations/${id}`, { method: 'PUT', body: JSON.stringify({ status }) });
    await loadData();
  };

  const convertToInvoice = async (id: string) => {
    await apiFetch(`/api/quotations/${id}/convert-invoice`, { method: 'POST' });
    await loadData();
  };

  const updateInvoiceStatus = async (id: string, payment_status: string) => {
    await apiFetch(`/api/invoices/${id}`, { method: 'PUT', body: JSON.stringify({ payment_status }) });
    await loadData();
  };

  const deleteExpense = async (id: string) => {
    await apiFetch(`/api/expenses/${id}`, { method: 'DELETE' });
    await loadData();
  };

  const draftSubtotal = docLines.reduce((acc, l) => acc + (Number(l.quantity) || 0) * (Number(l.unit_price) || 0), 0);
  const draftTax = Math.max(0, draftSubtotal - (Number(docDiscount) || 0)) * ((Number(docTaxRate) || 0) / 100);
  const draftTotal = Math.max(0, draftSubtotal - (Number(docDiscount) || 0)) + draftTax;

  const titles = {
    quotations: { title: 'Quotations', desc: 'Prepare client proposals from the official KORTRIX service catalog with printable PDF output.' },
    invoices: { title: 'Invoices', desc: 'Track operational billing, payment references, and due dates. Live payment processing is not enabled yet.' },
    expenses: { title: 'Expense Tracking', desc: 'Record operational vendor costs, software subscriptions, tools, and hardware expenditures.' },
    overview: { title: 'Financial Overview', desc: 'Real-time operational totals calculated strictly from stored invoices, quotations, and expenses.' },
  }[section];

  return (
    <div className="space-y-5">
      <PageHeader
        title={titles.title}
        description={titles.desc}
        actions={
          <>
            {section === 'quotations' && <Button variant="primary" onClick={openNewQuote}><Plus className="w-4 h-4" /> Create Quotation</Button>}
            {section === 'invoices' && <Button variant="primary" onClick={openNewInvoice}><Plus className="w-4 h-4" /> Create Invoice</Button>}
            {section === 'expenses' && <Button variant="primary" onClick={() => setExpenseModal(true)}><Plus className="w-4 h-4" /> Log Expense</Button>}
          </>
        }
      />

      {error && <div className="p-3 rounded-md bg-[#FEF2F2] border border-[#FECACA] text-xs text-[#B91C1C]">{error}</div>}

      {/* FINANCIAL OVERVIEW */}
      {section === 'overview' && (
        <div className="space-y-5">
          <Surface className="p-4 flex items-start gap-3 text-xs text-[#475569] dark:text-[#94A3B8]">
            <Info className="w-4 h-4 text-[#0047FF] shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold text-[#0B1018] dark:text-white">Operational Tracking Scope:</span> This module tracks internal quotations, invoices, and operational expenses for KORTRIX. It is not a full double-entry accounting or tax compliance system, and live Square/Stripe payment processing is intentionally disabled until formal business accounts are active.
            </div>
          </Surface>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              { label: 'Recorded Paid Revenue', val: formatCurrency(summary?.recordedRevenue || 0, currency), sub: `${summary?.paidInvoicesCount || 0} paid invoice(s)` },
              { label: 'Outstanding Receivables', val: formatCurrency(summary?.outstandingReceivables || 0, currency), sub: `${summary?.outstandingInvoicesCount || 0} unpaid invoice(s)` },
              { label: 'Recorded Expenses', val: formatCurrency(summary?.totalExpenses || 0, currency), sub: `${summary?.expensesCount || 0} expense record(s)` },
              { label: 'Net Recorded Position', val: formatCurrency(summary?.netRecordedPosition || 0, currency), sub: `${summary?.openQuotesCount || 0} open quotes (${formatCurrency(summary?.openQuotesValue || 0, currency)})` },
            ].map((k) => (
              <Surface key={k.label} className="p-4">
                <div className="text-xs text-[#526075] dark:text-[#94A3B8]">{k.label}</div>
                <div className="mt-2 font-mono text-2xl font-semibold tabular-nums text-[#0B1018] dark:text-white">{k.val}</div>
                <div className="mt-1 text-[11.5px] font-mono text-[#64748B]">{k.sub}</div>
              </Surface>
            ))}
          </div>
        </div>
      )}

      {/* QUOTATIONS */}
      {section === 'quotations' && (
        loading ? <Surface className="p-8 text-center text-xs text-[#64748B]">Loading quotations...</Surface> :
        quotations.length === 0 ? (
          <EmptyState title="No quotations created" description="Build itemized quotations from the KORTRIX Service Catalog or custom line items." action={<Button variant="primary" onClick={openNewQuote}>Create First Quotation</Button>} />
        ) : (
          <Surface className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[#DCE2EA] dark:border-[#242D3D] bg-[#F8FAFC] dark:bg-[#0F141D] text-[12px] font-semibold text-[#475569] dark:text-[#94A3B8]">
                  <th className="py-2.5 px-4">Quote #</th>
                  <th className="py-2.5 px-3">Customer</th>
                  <th className="py-2.5 px-3">Expires</th>
                  <th className="py-2.5 px-3 text-right">Total</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E2E8F0] dark:divide-[#242D3D] text-[13px]">
                {quotations.map((q) => (
                  <tr key={q.id} className="hover:bg-[#F8FAFC] dark:hover:bg-[#1A2230]">
                    <td className="py-2.5 px-4 font-mono text-[12px] text-[#0047FF]">{q.quote_number}</td>
                    <td className="py-2.5 px-3 font-medium">{q.customer_name || 'Unassigned'}</td>
                    <td className="py-2.5 px-3 font-mono text-[12px] text-[#526075]">{formatDate(q.expiration_date)}</td>
                    <td className="py-2.5 px-3 text-right font-mono font-medium tabular-nums">{formatCurrency(q.total, currency)}</td>
                    <td className="py-2.5 px-3">
                      <select value={q.status} onChange={(e) => updateQuoteStatus(q.id, e.target.value)} className="px-2 py-1 text-xs rounded border border-[#DCE2EA] dark:border-[#2B3548] bg-white dark:bg-[#0B1018]">
                        <option>Draft</option><option>Sent</option><option>Accepted</option><option>Rejected</option><option>Expired</option>
                      </select>
                    </td>
                    <td className="py-2.5 px-4 text-right whitespace-nowrap space-x-1">
                      <Button variant="ghost" size="sm" onClick={() => setPrintDoc({ kind: 'Quotation', data: q })}><Printer className="w-3.5 h-3.5" /> PDF</Button>
                      <Button variant="secondary" size="sm" onClick={() => convertToInvoice(q.id)}>Convert to Invoice <ArrowRight className="w-3.5 h-3.5" /></Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Surface>
        )
      )}

      {/* INVOICES */}
      {section === 'invoices' && (
        invoices.length === 0 ? (
          <EmptyState title="No invoices recorded" description="Convert an accepted quotation or create a direct invoice for completed services." action={<Button variant="primary" onClick={openNewInvoice}>Create First Invoice</Button>} />
        ) : (
          <Surface className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[#DCE2EA] dark:border-[#242D3D] bg-[#F8FAFC] dark:bg-[#0F141D] text-[12px] font-semibold text-[#475569] dark:text-[#94A3B8]">
                  <th className="py-2.5 px-4">Invoice #</th>
                  <th className="py-2.5 px-3">Customer</th>
                  <th className="py-2.5 px-3">Due Date</th>
                  <th className="py-2.5 px-3 text-right">Total</th>
                  <th className="py-2.5 px-3">Payment Status</th>
                  <th className="py-2.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E2E8F0] dark:divide-[#242D3D] text-[13px]">
                {invoices.map((inv) => (
                  <tr key={inv.id} className="hover:bg-[#F8FAFC] dark:hover:bg-[#1A2230]">
                    <td className="py-2.5 px-4 font-mono text-[12px] text-[#0047FF]">{inv.invoice_number}</td>
                    <td className="py-2.5 px-3 font-medium">{inv.customer_name || 'Unassigned'}</td>
                    <td className="py-2.5 px-3 font-mono text-[12px] text-[#526075]">{formatDate(inv.due_date)}</td>
                    <td className="py-2.5 px-3 text-right font-mono font-medium tabular-nums">{formatCurrency(inv.total, currency)}</td>
                    <td className="py-2.5 px-3">
                      <select value={inv.payment_status} onChange={(e) => updateInvoiceStatus(inv.id, e.target.value)} className="px-2 py-1 text-xs rounded border border-[#DCE2EA] dark:border-[#2B3548] bg-white dark:bg-[#0B1018]">
                        <option>Unpaid</option><option>Partial</option><option>Paid</option><option>Overdue</option><option>Void</option>
                      </select>
                    </td>
                    <td className="py-2.5 px-4 text-right">
                      <Button variant="ghost" size="sm" onClick={() => setPrintDoc({ kind: 'Invoice', data: inv })}><Printer className="w-3.5 h-3.5" /> Printable PDF</Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Surface>
        )
      )}

      {/* EXPENSES */}
      {section === 'expenses' && (
        expenses.length === 0 ? (
          <EmptyState title="No operational expenses logged" description="Record software subscriptions, domain renewals, hardware parts, or corporate operating expenses." action={<Button variant="primary" onClick={() => setExpenseModal(true)}>Log First Expense</Button>} />
        ) : (
          <Surface className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[#DCE2EA] dark:border-[#242D3D] bg-[#F8FAFC] dark:bg-[#0F141D] text-[12px] font-semibold text-[#475569] dark:text-[#94A3B8]">
                  <th className="py-2.5 px-4">Date</th>
                  <th className="py-2.5 px-3">Vendor</th>
                  <th className="py-2.5 px-3">Category</th>
                  <th className="py-2.5 px-3">Description</th>
                  <th className="py-2.5 px-3 text-right">Amount</th>
                  <th className="py-2.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E2E8F0] dark:divide-[#242D3D] text-[13px]">
                {expenses.map((ex) => (
                  <tr key={ex.id} className="hover:bg-[#F8FAFC] dark:hover:bg-[#1A2230]">
                    <td className="py-2.5 px-4 font-mono text-[12px] text-[#526075]">{formatDate(ex.expense_date)}</td>
                    <td className="py-2.5 px-3 font-medium">{ex.vendor}</td>
                    <td className="py-2.5 px-3 text-[12.5px] text-[#526075]">{ex.category}</td>
                    <td className="py-2.5 px-3 text-[12.5px] text-[#526075]">{ex.description || '—'}</td>
                    <td className="py-2.5 px-3 text-right font-mono font-medium tabular-nums">{formatCurrency(ex.amount, currency)}</td>
                    <td className="py-2.5 px-4 text-right">
                      <button type="button" onClick={() => deleteExpense(ex.id)} className="p-1.5 text-[#64748B] hover:text-[#DC2626] cursor-pointer"><Trash2 className="w-3.5 h-3.5" /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Surface>
        )
      )}

      {/* Create Quotation / Invoice Modal */}
      <Modal open={quoteModal || invoiceModal} onClose={() => { setQuoteModal(false); setInvoiceModal(false); }} title={quoteModal ? 'Create Quotation' : 'Create Invoice'} maxWidth="max-w-3xl">
        <form onSubmit={quoteModal ? handleSaveQuote : handleSaveInvoice} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Customer">
              <select value={docCustomerId} onChange={(e) => setDocCustomerId(e.target.value)} className={inputClass}>
                <option value="">Select customer...</option>
                {customers.map((c) => <option key={c.id} value={c.id}>{c.customer_code} — {c.name}</option>)}
              </select>
            </Field>
            <Field label={quoteModal ? 'Expiration Date' : 'Due Date'}>
              <input type="date" value={docDate} onChange={(e) => setDocDate(e.target.value)} className={inputClass} />
            </Field>
          </div>

          <Field label="Quick Add from Service Catalog">
            <select defaultValue="" onChange={(e) => { if (e.target.value) { addServiceLine(e.target.value); e.target.value = ''; } }} className={inputClass}>
              <option value="">Choose an official KORTRIX service to insert...</option>
              {services.map((s) => (
                <option key={s.id} value={s.id}>{s.service_code} — {s.name} ({s.price != null ? formatCurrency(s.price) : 'Price Unset'})</option>
              ))}
            </select>
          </Field>

          <div className="space-y-2">
            <div className="flex justify-between items-center text-xs font-semibold text-[#334155] dark:text-[#CBD5E1]">
              <span>Line Items</span>
              <button type="button" onClick={() => setDocLines([...docLines, { description: '', quantity: 1, unit_price: 0 }])} className="text-[#0047FF] hover:underline cursor-pointer">+ Add Custom Line</button>
            </div>
            {docLines.map((line, idx) => (
              <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                <input required placeholder="Service or item description" value={line.description} onChange={(e) => setDocLines(docLines.map((l, i) => i === idx ? { ...l, description: e.target.value } : l))} className={`${inputClass} col-span-6`} />
                <input type="number" step="0.25" min="0.01" value={line.quantity} onChange={(e) => setDocLines(docLines.map((l, i) => i === idx ? { ...l, quantity: Number(e.target.value) } : l))} className={`${inputClass} col-span-2 font-mono`} />
                <input type="number" step="0.01" min="0" value={line.unit_price} onChange={(e) => setDocLines(docLines.map((l, i) => i === idx ? { ...l, unit_price: Number(e.target.value) } : l))} className={`${inputClass} col-span-3 font-mono`} />
                <button type="button" onClick={() => docLines.length > 1 && setDocLines(docLines.filter((_, i) => i !== idx))} className="col-span-1 text-center text-[#64748B] hover:text-[#DC2626] cursor-pointer">×</button>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-3 gap-3 pt-2 border-t border-[#DCE2EA] dark:border-[#242D3D]">
            {quoteModal && (
              <Field label="Discount ($)"><input type="number" min="0" step="0.01" value={docDiscount} onChange={(e) => setDocDiscount(e.target.value)} className={`${inputClass} font-mono`} /></Field>
            )}
            <Field label="Tax Rate (%)"><input type="number" min="0" max="50" step="0.01" value={docTaxRate} onChange={(e) => setDocTaxRate(e.target.value)} className={`${inputClass} font-mono`} /></Field>
            <div className="flex flex-col justify-end text-right font-mono">
              <div className="text-xs text-[#64748B]">Estimated Total</div>
              <div className="text-lg font-semibold text-[#0B1018] dark:text-white">{formatCurrency(draftTotal, currency)}</div>
            </div>
          </div>

          <Field label="Notes"><textarea rows={2} value={docNotes} onChange={(e) => setDocNotes(e.target.value)} className={inputClass} /></Field>
          {quoteModal && <Field label="Terms"><textarea rows={2} value={docTerms} onChange={(e) => setDocTerms(e.target.value)} className={inputClass} /></Field>}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => { setQuoteModal(false); setInvoiceModal(false); }}>Cancel</Button>
            <Button type="submit" variant="primary">{quoteModal ? 'Save Quotation' : 'Save Invoice'}</Button>
          </div>
        </form>
      </Modal>

      {/* Log Expense Modal */}
      <Modal open={expenseModal} onClose={() => setExpenseModal(false)} title="Record Operational Expense">
        <form onSubmit={handleSaveExpense} className="space-y-4">
          <Field label="Vendor" required><input required value={expenseForm.vendor} onChange={(e) => setExpenseForm({ ...expenseForm, vendor: e.target.value })} className={inputClass} /></Field>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Category">
              <select value={expenseForm.category} onChange={(e) => setExpenseForm({ ...expenseForm, category: e.target.value })} className={inputClass}>
                <option>Software & Subscriptions</option><option>Hardware & Parts</option><option>Hosting & Domains</option>
                <option>Legal & Registration</option><option>Insurance</option><option>Marketing</option><option>Operations</option>
              </select>
            </Field>
            <Field label="Amount ($)" required><input type="number" step="0.01" min="0.01" required value={expenseForm.amount} onChange={(e) => setExpenseForm({ ...expenseForm, amount: e.target.value })} className={`${inputClass} font-mono`} /></Field>
            <Field label="Date" required><input type="date" required value={expenseForm.expense_date} onChange={(e) => setExpenseForm({ ...expenseForm, expense_date: e.target.value })} className={inputClass} /></Field>
          </div>
          <Field label="Description"><textarea rows={2} value={expenseForm.description} onChange={(e) => setExpenseForm({ ...expenseForm, description: e.target.value })} className={inputClass} /></Field>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setExpenseModal(false)}>Cancel</Button>
            <Button type="submit" variant="primary">Save Expense</Button>
          </div>
        </form>
      </Modal>

      {/* Printable PDF Quotation / Invoice Dialog */}
      <Modal open={Boolean(printDoc)} onClose={() => setPrintDoc(null)} title={`Printable ${printDoc?.kind || ''}`} maxWidth="max-w-3xl">
        {printDoc && (
          <div className="space-y-5">
            <div className="p-6 bg-white text-[#0B1018] border border-[#DCE2EA] rounded space-y-5">
              <div className="flex justify-between items-start border-b border-[#DCE2EA] pb-4">
                <div>
                  <KortrixLogo logoDataUrl={settings?.logo_data_url} />
                  <div className="mt-2 text-xs text-[#526075] space-y-0.5">
                    <div>{settings?.business_address || 'North Carolina'}</div>
                    <div>{settings?.primary_email || 'dylan@kortrix.com'} · {settings?.telephone || '336.686.4728'}</div>
                    <div>{settings?.website || 'https://kortrix.com'}</div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-display text-xl font-bold text-[#0047FF]">{printDoc.kind.toUpperCase()}</div>
                  <div className="font-mono text-sm font-semibold mt-1">{printDoc.data.quote_number || printDoc.data.invoice_number}</div>
                  <div className="text-xs text-[#526075] mt-1">Issued: {formatDate(printDoc.data.created_at)}</div>
                </div>
              </div>

              <div className="text-xs">
                <div className="text-[#64748B] font-semibold">Prepared For</div>
                <div className="text-sm font-medium mt-0.5">{printDoc.data.customer_name || 'Client'}</div>
                {printDoc.data.customer_org && <div>{printDoc.data.customer_org}</div>}
                {printDoc.data.billing_address && <div className="text-[#526075]">{printDoc.data.billing_address}</div>}
              </div>

              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-[#0B1018] font-semibold">
                    <th className="py-2">Description</th>
                    <th className="py-2 text-right">Qty</th>
                    <th className="py-2 text-right">Unit Price</th>
                    <th className="py-2 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E2E8F0]">
                  {(printDoc.data.line_items || []).map((li: any, idx: number) => (
                    <tr key={idx}>
                      <td className="py-2">{li.description}</td>
                      <td className="py-2 text-right font-mono">{li.quantity}</td>
                      <td className="py-2 text-right font-mono">{formatCurrency(li.unit_price, currency)}</td>
                      <td className="py-2 text-right font-mono">{formatCurrency(li.quantity * li.unit_price, currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="flex justify-end">
                <div className="w-60 space-y-1 text-xs font-mono">
                  <div className="flex justify-between"><span>Subtotal</span><span>{formatCurrency(printDoc.data.subtotal, currency)}</span></div>
                  {Number(printDoc.data.discount_amount || 0) > 0 && (
                    <div className="flex justify-between"><span>Discount</span><span>-{formatCurrency(printDoc.data.discount_amount, currency)}</span></div>
                  )}
                  <div className="flex justify-between"><span>Tax ({printDoc.data.tax_rate}%)</span><span>{formatCurrency(printDoc.data.tax_amount, currency)}</span></div>
                  <div className="flex justify-between text-sm font-bold border-t border-[#0B1018] pt-1.5"><span>Total</span><span>{formatCurrency(printDoc.data.total, currency)}</span></div>
                </div>
              </div>

              {(printDoc.data.notes || printDoc.data.terms) && (
                <div className="pt-3 border-t border-[#DCE2EA] text-[11.5px] text-[#526075] space-y-1">
                  {printDoc.data.notes && <div><strong>Notes:</strong> {printDoc.data.notes}</div>}
                  {printDoc.data.terms && <div><strong>Terms:</strong> {printDoc.data.terms}</div>}
                </div>
              )}
            </div>
            <div className="flex justify-end gap-2 no-print">
              <Button variant="secondary" onClick={() => setPrintDoc(null)}>Close</Button>
              <Button variant="primary" onClick={() => window.print()}><Printer className="w-4 h-4" /> Print / Save as PDF</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};
