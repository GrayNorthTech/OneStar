import React, { useEffect, useState, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Upload, FolderPlus, Download, Archive, History, Edit3, Folder, FileText, Lock } from 'lucide-react';
import { apiDownloadFile, apiFetch, formatDateTime, formatFileSize } from '../lib/api';
import { Button, EmptyState, Field, inputClass, Modal, PageHeader, Surface } from '../components/ui';

const CATEGORIES = [
  'Corporate & Legal',
  'Finance & Accounting',
  'Operations',
  'Services & Pricing',
  'Branding & Marketing',
  'Technology & Development',
  'Customers & Contracts',
  'Policies & Compliance',
  'Human Resources',
];

export const DocumentsPage: React.FC<{ policiesOnly?: boolean }> = ({ policiesOnly = false }) => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [selectedCategory, setSelectedCategory] = useState<string>(policiesOnly ? 'Policies & Compliance' : 'All');
  const [documents, setDocuments] = useState<any[]>([]);
  const [folders, setFolders] = useState<any[]>([]);
  const [departments, setDepartments] = useState<any[]>([]);
  const [showArchived, setShowArchived] = useState(false);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [uploadOpen, setUploadOpen] = useState(false);
  const [folderOpen, setFolderOpen] = useState(false);
  const [versionDoc, setVersionDoc] = useState<any | null>(null);
  const [editDoc, setEditDoc] = useState<any | null>(null);

  const [file, setFile] = useState<File | null>(null);
  const [uploadForm, setUploadForm] = useState({
    title: '',
    category: policiesOnly ? 'Policies & Compliance' : 'Corporate & Legal',
    description: '',
    tags: '',
    allowed_departments: [] as string[],
  });
  const [folderForm, setFolderForm] = useState({ name: '', category: policiesOnly ? 'Policies & Compliance' : 'Operations' });
  const [versionFile, setVersionFile] = useState<File | null>(null);
  const [versionNotes, setVersionNotes] = useState('');
  const [editForm, setEditForm] = useState({ title: '', category: '', description: '', tags: '' });

  useEffect(() => {
    if (policiesOnly) setSelectedCategory('Policies & Compliance');
  }, [policiesOnly]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const catParam = selectedCategory !== 'All' ? `&category=${encodeURIComponent(selectedCategory)}` : '';
      const [dRes, fRes, deptRes] = await Promise.all([
        apiFetch<{ items: any[] }>(`/api/documents?archived=${showArchived}${catParam}`),
        apiFetch<{ items: any[] }>('/api/document-folders'),
        apiFetch<{ items: any[] }>('/api/departments'),
      ]);
      setDocuments(dRes.items || []);
      setFolders(fRes.items || []);
      setDepartments(deptRes.items || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load documents.');
    } finally {
      setLoading(false);
    }
  }, [selectedCategory, showArchived]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (searchParams.get('new') === '1') {
      setUploadOpen(true);
      setSearchParams({});
    }
  }, [searchParams, setSearchParams]);

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) {
      setError('Select a file to upload.');
      return;
    }
    setError('');
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('title', uploadForm.title || file.name);
      fd.append('category', uploadForm.category);
      fd.append('description', uploadForm.description);
      fd.append('tags', uploadForm.tags);
      fd.append('allowed_departments', JSON.stringify(uploadForm.allowed_departments));
      await apiFetch('/api/documents', { method: 'POST', body: fd });
      setUploadOpen(false);
      setFile(null);
      setUploadForm({ title: '', category: policiesOnly ? 'Policies & Compliance' : 'Corporate & Legal', description: '', tags: '', allowed_departments: [] });
      await loadData();
    } catch (err: any) {
      setError(err.message || 'Upload failed.');
    }
  };

  const handleCreateFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiFetch('/api/document-folders', { method: 'POST', body: JSON.stringify(folderForm) });
      setFolderOpen(false);
      setFolderForm({ name: '', category: policiesOnly ? 'Policies & Compliance' : 'Operations' });
      await loadData();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleUploadVersion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!versionDoc || !versionFile) return;
    try {
      const fd = new FormData();
      fd.append('file', versionFile);
      fd.append('notes', versionNotes);
      await apiFetch(`/api/documents/${versionDoc.id}/version`, { method: 'POST', body: fd });
      setVersionDoc(null);
      setVersionFile(null);
      setVersionNotes('');
      await loadData();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editDoc) return;
    try {
      await apiFetch(`/api/documents/${editDoc.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          title: editForm.title,
          category: editForm.category,
          description: editForm.description,
          tags: editForm.tags.split(',').map((t) => t.trim()).filter(Boolean),
        }),
      });
      setEditDoc(null);
      await loadData();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleToggleArchive = async (doc: any) => {
    await apiFetch(`/api/documents/${doc.id}`, { method: 'PUT', body: JSON.stringify({ archived: !doc.archived }) });
    await loadData();
  };

  const handleDownload = async (doc: any, storedName?: string, fileName?: string) => {
    try {
      const qs = storedName ? `?stored_name=${encodeURIComponent(storedName)}` : '';
      await apiDownloadFile(`/api/documents/${doc.id}/download${qs}`, fileName || doc.file_name);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const filteredDocs = documents.filter((d) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      d.title.toLowerCase().includes(q) ||
      d.file_name.toLowerCase().includes(q) ||
      d.document_code.toLowerCase().includes(q) ||
      (d.tags || []).some((t: string) => t.toLowerCase().includes(q))
    );
  });

  const visibleFolders = folders.filter((f) => selectedCategory === 'All' || f.category === selectedCategory);

  return (
    <div className="space-y-5">
      <PageHeader
        title={policiesOnly ? 'Policies & Procedures' : 'Corporate Document Management'}
        description={
          policiesOnly
            ? 'Official SOPs, cybersecurity standards, employee policies, and compliance documentation stored in private server storage.'
            : 'Internal SharePoint alternative with private server-enforced storage, department permissions, and document versioning.'
        }
        actions={
          <>
            <Button variant="secondary" onClick={() => setFolderOpen(true)}>
              <FolderPlus className="w-4 h-4" /> New Folder
            </Button>
            <Button variant="primary" onClick={() => setUploadOpen(true)}>
              <Upload className="w-4 h-4" /> Upload Document
            </Button>
          </>
        }
      />

      {error && (
        <div className="p-3 rounded-md bg-[#FEF2F2] dark:bg-[#450A0A]/40 border border-[#FECACA] text-xs text-[#B91C1C]">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Category Tree Sidebar */}
        {!policiesOnly && (
          <Surface className="lg:col-span-3 p-3 space-y-1">
            <div className="px-2.5 py-1.5 text-[11px] font-semibold text-[#64748B]">Document Categories</div>
            <button
              type="button"
              onClick={() => setSelectedCategory('All')}
              className={`w-full text-left px-2.5 py-1.5 rounded text-[13px] cursor-pointer ${
                selectedCategory === 'All'
                  ? 'bg-[#0047FF]/10 text-[#0047FF] font-medium'
                  : 'text-[#334155] dark:text-[#CBD5E1] hover:bg-[#F4F6F9] dark:hover:bg-[#1C2432]'
              }`}
            >
              All Corporate Documents
            </button>
            {CATEGORIES.map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setSelectedCategory(cat)}
                className={`w-full text-left px-2.5 py-1.5 rounded text-[13px] flex items-center gap-2 cursor-pointer ${
                  selectedCategory === cat
                    ? 'bg-[#0047FF]/10 text-[#0047FF] font-medium'
                    : 'text-[#334155] dark:text-[#CBD5E1] hover:bg-[#F4F6F9] dark:hover:bg-[#1C2432]'
                }`}
              >
                <Folder className="w-3.5 h-3.5 shrink-0 opacity-75" />
                <span className="truncate">{cat}</span>
              </button>
            ))}
          </Surface>
        )}

        {/* Main Document Library */}
        <div className={`${policiesOnly ? 'lg:col-span-12' : 'lg:col-span-9'} space-y-4`}>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search document title, code, filename, or tags..."
              className={`${inputClass} sm:w-80`}
            />
            <div className="flex items-center gap-3 text-xs text-[#64748B]">
              <span className="inline-flex items-center gap-1">
                <Lock className="w-3.5 h-3.5" /> Private authenticated storage
              </span>
              <button
                type="button"
                onClick={() => setShowArchived((s) => !s)}
                className="text-[#0047FF] hover:underline font-medium cursor-pointer"
              >
                {showArchived ? 'View Active Documents' : 'View Archived'}
              </button>
            </div>
          </div>

          {visibleFolders.length > 0 && selectedCategory !== 'All' && (
            <div className="flex flex-wrap gap-2">
              {visibleFolders.filter((f) => f.name !== selectedCategory).map((f) => (
                <div key={f.id} className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white dark:bg-[#141A24] border border-[#DCE2EA] dark:border-[#242D3D] rounded-md text-xs text-[#334155] dark:text-[#CBD5E1]">
                  <Folder className="w-3.5 h-3.5 text-[#0047FF]" />
                  <span>{f.name}</span>
                </div>
              ))}
            </div>
          )}

          {loading ? (
            <Surface className="p-8 text-center text-xs text-[#64748B]">Loading corporate repository...</Surface>
          ) : filteredDocs.length === 0 ? (
            <EmptyState
              title={showArchived ? 'No archived documents' : 'No documents uploaded yet'}
              description="Upload PDFs, Office files, spreadsheets, policies, or contracts into private server-protected storage."
              action={<Button variant="primary" onClick={() => setUploadOpen(true)}>Upload First Document</Button>}
            />
          ) : (
            <Surface className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-[#DCE2EA] dark:border-[#242D3D] bg-[#F8FAFC] dark:bg-[#0F141D] text-[12px] font-semibold text-[#475569] dark:text-[#94A3B8]">
                    <th className="py-2.5 px-4">Code</th>
                    <th className="py-2.5 px-3">Document</th>
                    <th className="py-2.5 px-3">Category</th>
                    <th className="py-2.5 px-3">Version</th>
                    <th className="py-2.5 px-3">Size</th>
                    <th className="py-2.5 px-3">Updated</th>
                    <th className="py-2.5 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E2E8F0] dark:divide-[#242D3D] text-[13px]">
                  {filteredDocs.map((doc) => (
                    <tr key={doc.id} className="hover:bg-[#F8FAFC] dark:hover:bg-[#1A2230]">
                      <td className="py-2.5 px-4 font-mono text-[12px] text-[#526075] whitespace-nowrap">{doc.document_code}</td>
                      <td className="py-2.5 px-3">
                        <div className="flex items-center gap-2 font-medium text-[#0B1018] dark:text-white">
                          <FileText className="w-3.5 h-3.5 text-[#0047FF] shrink-0" />
                          <span>{doc.title}</span>
                        </div>
                        <div className="text-[11.5px] text-[#64748B] mt-0.5">
                          {doc.file_name}
                          {doc.tags?.length > 0 && ` · ${doc.tags.join(', ')}`}
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-[12.5px] text-[#475569] dark:text-[#CBD5E1]">{doc.category}</td>
                      <td className="py-2.5 px-3 font-mono text-[12px] tabular-nums">v{doc.version}</td>
                      <td className="py-2.5 px-3 font-mono text-[12px] text-[#526075] tabular-nums">{formatFileSize(doc.file_size)}</td>
                      <td className="py-2.5 px-3 font-mono text-[12px] text-[#526075] whitespace-nowrap">{formatDateTime(doc.updated_at)}</td>
                      <td className="py-2.5 px-4 text-right whitespace-nowrap">
                        <button type="button" onClick={() => handleDownload(doc)} className="p-1.5 text-[#475569] hover:text-[#0047FF] cursor-pointer" title="Download">
                          <Download className="w-3.5 h-3.5" />
                        </button>
                        <button type="button" onClick={() => setVersionDoc(doc)} className="p-1.5 text-[#475569] hover:text-[#0047FF] cursor-pointer" title="Version history & upload new version">
                          <History className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setEditDoc(doc);
                            setEditForm({ title: doc.title, category: doc.category, description: doc.description || '', tags: (doc.tags || []).join(', ') });
                          }}
                          className="p-1.5 text-[#475569] hover:text-[#0047FF] cursor-pointer"
                          title="Edit metadata"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        <button type="button" onClick={() => handleToggleArchive(doc)} className="p-1.5 text-[#475569] hover:text-[#B45309] cursor-pointer" title={doc.archived ? 'Restore' : 'Archive'}>
                          <Archive className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Surface>
          )}
        </div>
      </div>

      {/* Upload Modal */}
      <Modal open={uploadOpen} onClose={() => setUploadOpen(false)} title="Upload Corporate Document" subtitle="Files are stored privately on the server with role & department access controls.">
        <form onSubmit={handleUpload} className="space-y-4">
          <Field label="Select File" required hint="Approved types: PDF, DOCX, XLSX, CSV, PPTX, TXT, PNG, JPG, ZIP (Max 25 MB)">
            <input type="file" required onChange={(e) => setFile(e.target.files?.[0] || null)} className={inputClass} />
          </Field>
          <Field label="Document Title" required>
            <input required value={uploadForm.title} onChange={(e) => setUploadForm({ ...uploadForm, title: e.target.value })} placeholder="e.g., Master Service Agreement Template" className={inputClass} />
          </Field>
          <Field label="Category">
            <select value={uploadForm.category} onChange={(e) => setUploadForm({ ...uploadForm, category: e.target.value })} className={inputClass}>
              {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </Field>
          <Field label="Tags (comma separated)">
            <input value={uploadForm.tags} onChange={(e) => setUploadForm({ ...uploadForm, tags: e.target.value })} placeholder="sop, legal, template" className={inputClass} />
          </Field>
          <Field label="Department Access Restriction" hint="Leave unchecked for all authorized employees; select specific departments to restrict access.">
            <div className="grid grid-cols-2 gap-1.5 mt-1 max-h-32 overflow-y-auto p-2 border border-[#DCE2EA] dark:border-[#2B3548] rounded-md">
              {departments.map((d) => (
                <label key={d.id} className="flex items-center gap-2 text-xs text-[#334155] dark:text-[#CBD5E1]">
                  <input
                    type="checkbox"
                    checked={uploadForm.allowed_departments.includes(d.id)}
                    onChange={(e) => {
                      const next = e.target.checked
                        ? [...uploadForm.allowed_departments, d.id]
                        : uploadForm.allowed_departments.filter((id) => id !== d.id);
                      setUploadForm({ ...uploadForm, allowed_departments: next });
                    }}
                  />
                  <span>{d.name}</span>
                </label>
              ))}
            </div>
          </Field>
          <Field label="Description">
            <textarea rows={2} value={uploadForm.description} onChange={(e) => setUploadForm({ ...uploadForm, description: e.target.value })} className={inputClass} />
          </Field>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setUploadOpen(false)}>Cancel</Button>
            <Button type="submit" variant="primary">Upload Securely</Button>
          </div>
        </form>
      </Modal>

      {/* New Folder Modal */}
      <Modal open={folderOpen} onClose={() => setFolderOpen(false)} title="Create Folder">
        <form onSubmit={handleCreateFolder} className="space-y-4">
          <Field label="Folder Name" required>
            <input required value={folderForm.name} onChange={(e) => setFolderForm({ ...folderForm, name: e.target.value })} className={inputClass} />
          </Field>
          <Field label="Parent Category">
            <select value={folderForm.category} onChange={(e) => setFolderForm({ ...folderForm, category: e.target.value })} className={inputClass}>
              {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </Field>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setFolderOpen(false)}>Cancel</Button>
            <Button type="submit" variant="primary">Create Folder</Button>
          </div>
        </form>
      </Modal>

      {/* Version History Modal */}
      <Modal open={Boolean(versionDoc)} onClose={() => setVersionDoc(null)} title={`Version History — ${versionDoc?.document_code || ''}`} subtitle={versionDoc?.title}>
        {versionDoc && (
          <div className="space-y-5">
            <div className="divide-y divide-[#E2E8F0] dark:divide-[#242D3D] border border-[#DCE2EA] dark:border-[#242D3D] rounded-md">
              {(versionDoc.versions || []).map((v: any) => (
                <div key={v.version} className="p-3 flex items-center justify-between gap-3 text-xs">
                  <div>
                    <div className="font-medium text-[#0B1018] dark:text-white">
                      v{v.version} · {v.file_name}
                    </div>
                    <div className="text-[#64748B] mt-0.5">
                      {v.uploaded_by} · {formatDateTime(v.uploaded_at)} · {formatFileSize(v.file_size)}
                    </div>
                    {v.notes && <div className="text-[#475569] dark:text-[#94A3B8] mt-0.5">{v.notes}</div>}
                  </div>
                  <Button variant="secondary" size="sm" onClick={() => handleDownload(versionDoc, v.stored_name, v.file_name)}>
                    <Download className="w-3.5 h-3.5" /> Download
                  </Button>
                </div>
              ))}
            </div>
            <form onSubmit={handleUploadVersion} className="space-y-3 pt-2 border-t border-[#DCE2EA] dark:border-[#242D3D]">
              <div className="text-xs font-semibold text-[#0B1018] dark:text-white">Upload New Version (v{Number(versionDoc.version || 1) + 1})</div>
              <input type="file" required onChange={(e) => setVersionFile(e.target.files?.[0] || null)} className={inputClass} />
              <input value={versionNotes} onChange={(e) => setVersionNotes(e.target.value)} placeholder="Revision notes (e.g., Updated terms section)" className={inputClass} />
              <div className="flex justify-end">
                <Button type="submit" variant="primary" size="sm">Upload New Version</Button>
              </div>
            </form>
          </div>
        )}
      </Modal>

      {/* Edit Metadata Modal */}
      <Modal open={Boolean(editDoc)} onClose={() => setEditDoc(null)} title="Edit Document Metadata">
        <form onSubmit={handleSaveEdit} className="space-y-4">
          <Field label="Title" required>
            <input required value={editForm.title} onChange={(e) => setEditForm({ ...editForm, title: e.target.value })} className={inputClass} />
          </Field>
          <Field label="Category">
            <select value={editForm.category} onChange={(e) => setEditForm({ ...editForm, category: e.target.value })} className={inputClass}>
              {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </Field>
          <Field label="Tags">
            <input value={editForm.tags} onChange={(e) => setEditForm({ ...editForm, tags: e.target.value })} className={inputClass} />
          </Field>
          <Field label="Description">
            <textarea rows={3} value={editForm.description} onChange={(e) => setEditForm({ ...editForm, description: e.target.value })} className={inputClass} />
          </Field>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setEditDoc(null)}>Cancel</Button>
            <Button type="submit" variant="primary">Save Metadata</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
