import React, { useEffect, useState, useCallback } from 'react';
import { Plus, Save, Download, Upload, Database, ShieldCheck, Plug } from 'lucide-react';
import { apiFetch, exportToCsv, formatDateTime } from '../lib/api';
import { useApp } from '../context/AppContext';
import { KortrixLogo } from '../components/KortrixLogo';
import { Button, Field, inputClass, Modal, PageHeader, StatusText, Surface } from '../components/ui';

const RBAC_MODULES = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'crm', label: 'CRM' },
  { key: 'service_desk', label: 'Service Desk' },
  { key: 'work_orders', label: 'Work Orders & Cal' },
  { key: 'service_catalog', label: 'Service Catalog' },
  { key: 'assets', label: 'Asset Mgmt' },
  { key: 'documents', label: 'Documents' },
  { key: 'projects', label: 'Projects & Roadmap' },
  { key: 'finance', label: 'Finance' },
  { key: 'employees', label: 'Employees & Depts' },
  { key: 'admin', label: 'Administration' },
];
const RBAC_ACTIONS = ['view', 'create', 'edit', 'delete', 'export', 'admin'] as const;

export const AdminPage: React.FC<{ section: 'users' | 'roles' | 'audit-logs' | 'integrations' | 'settings' }> = ({ section }) => {
  const { refreshSettings, setTheme } = useApp();
  const [users, setUsers] = useState<any[]>([]);
  const [roles, setRoles] = useState<any[]>([]);
  const [departments, setDepartments] = useState<any[]>([]);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [integrations, setIntegrations] = useState<any[]>([]);
  const [dbStatus, setDbStatus] = useState<any | null>(null);
  const [settingsForm, setSettingsForm] = useState<any | null>(null);
  const [selectedRoleId, setSelectedRoleId] = useState<string>('');
  const [auditModule, setAuditModule] = useState('');
  const [userModal, setUserModal] = useState(false);
  const [editingUser, setEditingUser] = useState<any | null>(null);
  const [userForm, setUserForm] = useState({
    email: '', full_name: '', position: '', department_id: 'dept-ops', role_id: 'role-tech',
    employment_classification: 'Full-Time', responsibilities: '', password: '', status: 'Active',
  });
  const [statusMessage, setStatusMessage] = useState('');
  const [error, setError] = useState('');

  const loadData = useCallback(async () => {
    setError('');
    try {
      if (section === 'users') {
        const [uRes, rRes, dRes] = await Promise.all([
          apiFetch<{ items: any[] }>('/api/users'),
          apiFetch<{ items: any[] }>('/api/roles'),
          apiFetch<{ items: any[] }>('/api/departments'),
        ]);
        setUsers(uRes.items || []);
        setRoles(rRes.items || []);
        setDepartments(dRes.items || []);
      } else if (section === 'roles') {
        const rRes = await apiFetch<{ items: any[] }>('/api/roles');
        setRoles(rRes.items || []);
        if (!selectedRoleId && rRes.items?.length) setSelectedRoleId(rRes.items[0].id);
      } else if (section === 'audit-logs') {
        const qs = auditModule ? `?module=${encodeURIComponent(auditModule)}` : '';
        const aRes = await apiFetch<{ items: any[] }>(`/api/audit-logs${qs}`);
        setAuditLogs(aRes.items || []);
      } else if (section === 'integrations') {
        const iRes = await apiFetch<{ items: any[]; dbStatus: any }>('/api/integrations');
        setIntegrations(iRes.items || []);
        setDbStatus(iRes.dbStatus);
      } else if (section === 'settings') {
        const sRes = await apiFetch<{ settings: any; dbStatus: any }>('/api/settings');
        setSettingsForm(sRes.settings);
        setDbStatus(sRes.dbStatus);
      }
    } catch (err: any) {
      setError(err.message);
    }
  }, [section, auditModule, selectedRoleId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleSaveUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      if (editingUser) {
        await apiFetch(`/api/users/${editingUser.id}`, {
          method: 'PUT',
          body: JSON.stringify({
            full_name: userForm.full_name,
            position: userForm.position,
            department_id: userForm.department_id || null,
            role_id: userForm.role_id,
            employment_classification: userForm.employment_classification,
            responsibilities: userForm.responsibilities,
            status: userForm.status,
            new_password: userForm.password,
          }),
        });
      } else {
        await apiFetch('/api/users', { method: 'POST', body: JSON.stringify(userForm) });
      }
      setUserModal(false);
      setStatusMessage(editingUser ? 'User account updated.' : 'Internal user provisioned.');
      await loadData();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const selectedRole = roles.find((r) => r.id === selectedRoleId);

  const toggleRolePerm = (mod: string, act: string) => {
    if (!selectedRole || selectedRole.name === 'Owner') return;
    setRoles((prev) =>
      prev.map((r) => {
        if (r.id !== selectedRole.id) return r;
        const nextPerms = {
          ...r.permissions,
          [mod]: { ...(r.permissions?.[mod] || {}), [act]: !r.permissions?.[mod]?.[act] },
        };
        return { ...r, permissions: nextPerms };
      })
    );
  };

  const saveRolePermissions = async () => {
    if (!selectedRole || selectedRole.name === 'Owner') return;
    setError('');
    try {
      await apiFetch(`/api/roles/${selectedRole.id}`, {
        method: 'PUT',
        body: JSON.stringify({ description: selectedRole.description, permissions: selectedRole.permissions }),
      });
      setStatusMessage(`Saved server-enforced RBAC permissions for ${selectedRole.name}.`);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleLogoFile = (file: File | null) => {
    if (!file || !settingsForm) return;
    if (file.size > 450 * 1024) {
      setError('Logo file must be under 450 KB.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string' && reader.result.startsWith('data:image/')) {
        setSettingsForm({ ...settingsForm, logo_data_url: reader.result });
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!settingsForm) return;
    setError('');
    try {
      await apiFetch('/api/settings', {
        method: 'PUT',
        body: JSON.stringify({
          ...settingsForm,
          tax_rate: Number(settingsForm.tax_rate || 0),
        }),
      });
      setTheme(settingsForm.default_theme);
      await refreshSettings();
      setStatusMessage('Company settings saved and applied across KORTRIX ONE.');
    } catch (err: any) {
      setError(err.message);
    }
  };

  return (
    <div className="space-y-5">
      {statusMessage && (
        <div className="p-3 rounded-md bg-[#F0FDF4] dark:bg-[#052E16]/40 border border-[#BBF7D0] dark:border-[#14532D] text-xs text-[#15803D] dark:text-[#4ADE80] flex justify-between">
          <span>{statusMessage}</span>
          <button type="button" onClick={() => setStatusMessage('')} className="underline cursor-pointer">Dismiss</button>
        </div>
      )}
      {error && <div className="p-3 rounded-md bg-[#FEF2F2] border border-[#FECACA] text-xs text-[#B91C1C]">{error}</div>}

      {/* USER MANAGEMENT */}
      {section === 'users' && (
        <>
          <PageHeader
            title="User Management"
            description="Provision internal KORTRIX accounts, assign RBAC roles, and deactivate access. Public self-registration is permanently disabled."
            actions={
              <Button
                variant="primary"
                onClick={() => {
                  setEditingUser(null);
                  setUserForm({ email: '', full_name: '', position: '', department_id: 'dept-ops', role_id: 'role-tech', employment_classification: 'Full-Time', responsibilities: '', password: '', status: 'Active' });
                  setUserModal(true);
                }}
              >
                <Plus className="w-4 h-4" /> Provision Internal User
              </Button>
            }
          />
          <Surface className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[#DCE2EA] dark:border-[#242D3D] bg-[#F8FAFC] dark:bg-[#0F141D] text-[12px] font-semibold text-[#475569] dark:text-[#94A3B8]">
                  <th className="py-2.5 px-4">User</th>
                  <th className="py-2.5 px-3">Role</th>
                  <th className="py-2.5 px-3">Department</th>
                  <th className="py-2.5 px-3">Last Sign-In</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E2E8F0] dark:divide-[#242D3D] text-[13px]">
                {users.map((u) => (
                  <tr key={u.id} className="hover:bg-[#F8FAFC] dark:hover:bg-[#1A2230]">
                    <td className="py-2.5 px-4">
                      <div className="font-medium">{u.full_name}</div>
                      <div className="font-mono text-[11.5px] text-[#64748B]">{u.email}</div>
                    </td>
                    <td className="py-2.5 px-3 font-medium">{u.role_name}</td>
                    <td className="py-2.5 px-3 text-[12.5px] text-[#526075]">{u.department_name || '—'}</td>
                    <td className="py-2.5 px-3 font-mono text-[12px] text-[#526075]">{formatDateTime(u.last_login_at)}</td>
                    <td className="py-2.5 px-3"><StatusText value={u.status} /></td>
                    <td className="py-2.5 px-4 text-right">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => {
                          setEditingUser(u);
                          setUserForm({
                            email: u.email, full_name: u.full_name, position: u.position || '',
                            department_id: u.department_id || '', role_id: u.role_id,
                            employment_classification: u.employment_classification || 'Full-Time',
                            responsibilities: u.responsibilities || '', password: '', status: u.status,
                          });
                          setUserModal(true);
                        }}
                      >
                        Manage
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Surface>

          <Modal open={userModal} onClose={() => setUserModal(false)} title={editingUser ? `Manage Account — ${editingUser.email}` : 'Provision Internal Staff Account'}>
            <form onSubmit={handleSaveUser} className="space-y-4">
              {!editingUser && (
                <Field label="Corporate Email" required>
                  <input type="email" required value={userForm.email} onChange={(e) => setUserForm({ ...userForm, email: e.target.value })} placeholder="employee@kortrix.com" className={inputClass} />
                </Field>
              )}
              <div className="grid grid-cols-2 gap-3">
                <Field label="Full Name" required><input required value={userForm.full_name} onChange={(e) => setUserForm({ ...userForm, full_name: e.target.value })} className={inputClass} /></Field>
                <Field label="Position"><input value={userForm.position} onChange={(e) => setUserForm({ ...userForm, position: e.target.value })} className={inputClass} /></Field>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="RBAC Role" required>
                  <select value={userForm.role_id} onChange={(e) => setUserForm({ ...userForm, role_id: e.target.value })} className={inputClass}>
                    {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                  </select>
                </Field>
                <Field label="Department">
                  <select value={userForm.department_id} onChange={(e) => setUserForm({ ...userForm, department_id: e.target.value })} className={inputClass}>
                    <option value="">None</option>
                    {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Employment Classification">
                  <select value={userForm.employment_classification} onChange={(e) => setUserForm({ ...userForm, employment_classification: e.target.value })} className={inputClass}>
                    <option>Founder / Principal</option><option>Full-Time</option><option>Part-Time</option><option>Contractor</option>
                  </select>
                </Field>
                {editingUser && (
                  <Field label="Account Status">
                    <select value={userForm.status} onChange={(e) => setUserForm({ ...userForm, status: e.target.value })} className={inputClass}>
                      <option value="Active">Active</option><option value="Deactivated">Deactivated (Revokes Sessions)</option>
                    </select>
                  </Field>
                )}
              </div>
              <Field label={editingUser ? 'Reset Password (optional)' : 'Initial Password'} required={!editingUser} hint="Minimum 10 characters; hashed server-side via scrypt.">
                <input type="password" required={!editingUser} minLength={editingUser ? 0 : 10} value={userForm.password} onChange={(e) => setUserForm({ ...userForm, password: e.target.value })} className={inputClass} />
              </Field>
              <Field label="Assigned Responsibilities"><textarea rows={2} value={userForm.responsibilities} onChange={(e) => setUserForm({ ...userForm, responsibilities: e.target.value })} className={inputClass} /></Field>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="secondary" onClick={() => setUserModal(false)}>Cancel</Button>
                <Button type="submit" variant="primary">{editingUser ? 'Save Account' : 'Create User'}</Button>
              </div>
            </form>
          </Modal>
        </>
      )}

      {/* ROLES & PERMISSIONS */}
      {section === 'roles' && (
        <>
          <PageHeader
            title="Roles & Permissions (Server-Enforced RBAC)"
            description="Granular module-level permissions verified on every Express API route."
            actions={
              selectedRole && selectedRole.name !== 'Owner' ? (
                <Button variant="primary" onClick={saveRolePermissions}><Save className="w-4 h-4" /> Save Role Matrix</Button>
              ) : null
            }
          />
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
            <Surface className="lg:col-span-3 p-2.5 space-y-1">
              {roles.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => setSelectedRoleId(r.id)}
                  className={`w-full text-left px-3 py-2 rounded text-[13px] cursor-pointer ${
                    selectedRoleId === r.id
                      ? 'bg-[#0047FF]/10 text-[#0047FF] font-medium'
                      : 'text-[#334155] dark:text-[#CBD5E1] hover:bg-[#F4F6F9] dark:hover:bg-[#1C2432]'
                  }`}
                >
                  <div>{r.name}</div>
                </button>
              ))}
            </Surface>

            <Surface className="lg:col-span-9 p-5 space-y-4 overflow-x-auto">
              {selectedRole && (
                <>
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h2 className="font-display text-[15px] font-semibold">{selectedRole.name}</h2>
                      <p className="text-xs text-[#64748B] mt-0.5">{selectedRole.description}</p>
                    </div>
                    {selectedRole.name === 'Owner' && (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-[#15803D]">
                        <ShieldCheck className="w-4 h-4" /> Locked Full Authority
                      </span>
                    )}
                  </div>
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-[#DCE2EA] dark:border-[#242D3D] text-[12px] font-semibold text-[#475569] dark:text-[#94A3B8]">
                        <th className="py-2 px-3">Module</th>
                        {RBAC_ACTIONS.map((a) => <th key={a} className="py-2 px-3 text-center capitalize">{a}</th>)}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#E2E8F0] dark:divide-[#242D3D] text-[13px]">
                      {RBAC_MODULES.map((m) => (
                        <tr key={m.key}>
                          <td className="py-2.5 px-3 font-medium">{m.label}</td>
                          {RBAC_ACTIONS.map((a) => (
                            <td key={a} className="py-2.5 px-3 text-center">
                              <input
                                type="checkbox"
                                disabled={selectedRole.name === 'Owner'}
                                checked={selectedRole.name === 'Owner' ? true : Boolean(selectedRole.permissions?.[m.key]?.[a])}
                                onChange={() => toggleRolePerm(m.key, a)}
                                className="h-4 w-4 accent-[#0047FF] cursor-pointer"
                              />
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </>
              )}
            </Surface>
          </div>
        </>
      )}

      {/* AUDIT LOGS */}
      {section === 'audit-logs' && (
        <>
          <PageHeader
            title="Security & Activity Audit Logs"
            description="Immutable server-recorded log of authentication events, corporate record mutations, downloads, and permission changes."
            actions={
              auditLogs.length > 0 ? (
                <Button variant="secondary" onClick={() => exportToCsv('kortrix-audit-logs.csv', auditLogs)}>
                  <Download className="w-4 h-4" /> Export CSV
                </Button>
              ) : null
            }
          />
          <div className="flex items-center gap-2">
            <select value={auditModule} onChange={(e) => setAuditModule(e.target.value)} className={`${inputClass} sm:w-56`}>
              <option value="">All Modules</option>
              <option value="auth">Authentication</option>
              <option value="settings">Company Settings</option>
              <option value="documents">Documents</option>
              <option value="projects">Projects & Roadmap</option>
              <option value="service_catalog">Service Catalog</option>
              <option value="crm">CRM</option>
              <option value="service_desk">Service Desk</option>
              <option value="assets">Assets</option>
              <option value="finance">Finance</option>
              <option value="users">Users</option>
              <option value="roles">Roles</option>
            </select>
          </div>
          <Surface className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[#DCE2EA] dark:border-[#242D3D] bg-[#F8FAFC] dark:bg-[#0F141D] text-[12px] font-semibold text-[#475569] dark:text-[#94A3B8]">
                  <th className="py-2.5 px-4">Timestamp</th>
                  <th className="py-2.5 px-3">Actor</th>
                  <th className="py-2.5 px-3">Module / Action</th>
                  <th className="py-2.5 px-3">Summary</th>
                  <th className="py-2.5 px-4">IP</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E2E8F0] dark:divide-[#242D3D] text-[12.5px]">
                {auditLogs.map((l) => (
                  <tr key={l.id}>
                    <td className="py-2.5 px-4 font-mono text-[11.5px] text-[#526075] whitespace-nowrap">{formatDateTime(l.created_at)}</td>
                    <td className="py-2.5 px-3 font-mono text-[12px]">{l.actor_email || 'system'}</td>
                    <td className="py-2.5 px-3 font-mono text-[11.5px] text-[#475569]">{l.module} · {l.action}</td>
                    <td className="py-2.5 px-3">{l.summary}</td>
                    <td className="py-2.5 px-4 font-mono text-[11.5px] text-[#64748B]">{l.ip_address || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Surface>
        </>
      )}

      {/* INTEGRATIONS */}
      {section === 'integrations' && (
        <>
          <PageHeader
            title="Integrations & Infrastructure Connections"
            description="Honest configuration status for Microsoft 365 Business Basic (dylan@kortrix.com), cPanel MySQL database, kortrix.com Intake API, and planned payment gateways."
          />

          {/* cPanel MySQL Connection Card */}
          <Surface className="p-5 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <Database className="w-5 h-5 text-[#0047FF] mt-0.5 shrink-0" />
                <div>
                  <h2 className="font-display text-[15px] font-semibold">cPanel MySQL / Relational Database Engine</h2>
                  <p className="text-xs text-[#526075] dark:text-[#94A3B8] mt-0.5">
                    Currently active engine: <strong className="font-mono text-[#0B1018] dark:text-white">{dbStatus?.dialect?.toUpperCase() || 'SQLITE'}</strong> ({dbStatus?.database}).
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <StatusText value={dbStatus?.dialect === 'mysql' ? 'Connected' : 'Not Configured'} />
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={async () => {
                    setError('');
                    setStatusMessage('');
                    try {
                      const res = await apiFetch<{ message: string }>('/api/integrations/mysql/test', { method: 'POST' });
                      setStatusMessage(res.message);
                    } catch (err: any) {
                      setError(err.message);
                    }
                  }}
                >
                  Test MySQL Connection
                </Button>
              </div>
            </div>
            {dbStatus?.error && (
              <div className="p-3 rounded bg-[#FEF2F2] dark:bg-[#450A0A]/40 border border-[#FECACA] dark:border-[#7F1D1D] text-xs text-[#B91C1C] dark:text-[#FCA5A5]">
                {dbStatus.error}
              </div>
            )}
            <div className="p-3.5 rounded bg-[#F8FAFC] dark:bg-[#0B1018] border border-[#DCE2EA] dark:border-[#242D3D] text-xs space-y-1.5 font-mono text-[#334155] dark:text-[#CBD5E1]">
              <div># Configure these in Settings -&gt; Secrets (never in source code):</div>
              <div>MYSQL_HOST · MYSQL_PORT=3306 · MYSQL_USER · MYSQL_PASSWORD · MYSQL_DATABASE · MYSQL_SSL=false</div>
              <div className="text-[#64748B] font-sans pt-1">
                Use your cPanel server&apos;s public hostname or IP for MYSQL_HOST when hosting in the cloud (use &quot;localhost&quot; only when deploying Node.js directly on the cPanel server), and authorize remote connections in cPanel -&gt; Remote Database Access.
              </div>
            </div>
          </Surface>

          {/* Integrations Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {integrations.map((intg) => (
              <Surface key={intg.id} className="p-5 flex flex-col justify-between gap-3">
                <div>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <Plug className="w-4 h-4 text-[#0047FF]" />
                      <h3 className="font-display text-[14px] font-semibold text-[#0B1018] dark:text-white">{intg.name}</h3>
                    </div>
                    <StatusText value={intg.status} />
                  </div>
                  <div className="mt-1 text-[11.5px] font-mono text-[#64748B]">{intg.category}</div>
                  <p className="mt-2 text-[12.5px] text-[#526075] dark:text-[#94A3B8] leading-relaxed">{intg.description}</p>
                </div>
                {intg.config?.requiredScopes && (
                  <div className="pt-2.5 border-t border-[#DCE2EA] dark:border-[#242D3D] text-[11.5px] font-mono text-[#64748B]">
                    Least-privilege scopes: {intg.config.requiredScopes.join(', ')}
                  </div>
                )}
                {intg.config?.endpoint && (
                  <div className="pt-2.5 border-t border-[#DCE2EA] dark:border-[#242D3D] text-[11.5px] font-mono text-[#64748B]">
                    POST {intg.config.endpoint} · Header: {intg.config.header}
                  </div>
                )}
              </Surface>
            ))}
          </div>
        </>
      )}

      {/* COMPANY SETTINGS */}
      {section === 'settings' && settingsForm && (
        <>
          <PageHeader
            title="Company Settings"
            description="Official corporate identity, custom KORTRIX logo upload, numbering sequences, tax configuration, and appearance."
          />
          <form onSubmit={handleSaveSettings} className="space-y-5">
            <Surface className="p-5 space-y-4">
              <h2 className="font-display text-[14px] font-semibold">Official Branding & Corporate Identity</h2>
              <div className="flex flex-col sm:flex-row sm:items-center gap-5 pb-4 border-b border-[#DCE2EA] dark:border-[#242D3D]">
                <div className="p-4 border border-[#DCE2EA] dark:border-[#242D3D] rounded bg-[#F8FAFC] dark:bg-[#0B1018]">
                  <KortrixLogo logoDataUrl={settingsForm.logo_data_url} />
                </div>
                <div className="space-y-2">
                  <div className="text-xs font-medium text-[#334155] dark:text-[#CBD5E1]">Official KORTRIX Logo (PNG / JPEG / WebP — preserves exact geometry)</div>
                  <div className="flex items-center gap-2">
                    <label className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-[#DCE2EA] dark:border-[#2B3548] bg-white dark:bg-[#141A24] hover:bg-[#F4F6F9] cursor-pointer">
                      <Upload className="w-3.5 h-3.5" /> Upload Logo File
                      <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => handleLogoFile(e.target.files?.[0] || null)} />
                    </label>
                    {settingsForm.logo_data_url && (
                      <Button type="button" variant="ghost" size="sm" onClick={() => setSettingsForm({ ...settingsForm, logo_data_url: '' })}>Reset Default</Button>
                    )}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <Field label="Company Name" required><input required value={settingsForm.company_name} onChange={(e) => setSettingsForm({ ...settingsForm, company_name: e.target.value })} className={inputClass} /></Field>
                <Field label="Legal Formation Status" hint="Do not identify as registered LLC until formation is complete.">
                  <input value={settingsForm.legal_status} onChange={(e) => setSettingsForm({ ...settingsForm, legal_status: e.target.value })} className={inputClass} />
                </Field>
                <Field label="Corporate Affiliation"><input value={settingsForm.affiliation} onChange={(e) => setSettingsForm({ ...settingsForm, affiliation: e.target.value })} className={inputClass} /></Field>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <Field label="Website"><input value={settingsForm.website} onChange={(e) => setSettingsForm({ ...settingsForm, website: e.target.value })} className={inputClass} /></Field>
                <Field label="Primary Email" required><input type="email" required value={settingsForm.primary_email} onChange={(e) => setSettingsForm({ ...settingsForm, primary_email: e.target.value })} className={inputClass} /></Field>
                <Field label="Telephone"><input value={settingsForm.telephone} onChange={(e) => setSettingsForm({ ...settingsForm, telephone: e.target.value })} className={`${inputClass} font-mono`} /></Field>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                <Field label="Region"><input value={settingsForm.region} onChange={(e) => setSettingsForm({ ...settingsForm, region: e.target.value })} className={inputClass} /></Field>
                <Field label="Time Zone"><input value={settingsForm.timezone} onChange={(e) => setSettingsForm({ ...settingsForm, timezone: e.target.value })} className={`${inputClass} font-mono`} /></Field>
                <Field label="Currency"><input value={settingsForm.currency} onChange={(e) => setSettingsForm({ ...settingsForm, currency: e.target.value })} className={`${inputClass} font-mono`} /></Field>
                <Field label="Default Theme">
                  <select value={settingsForm.default_theme} onChange={(e) => setSettingsForm({ ...settingsForm, default_theme: e.target.value })} className={inputClass}>
                    <option value="light">Light Interface (Default)</option>
                    <option value="dark">Dark Interface</option>
                  </select>
                </Field>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label="Business Address"><input value={settingsForm.business_address || ''} onChange={(e) => setSettingsForm({ ...settingsForm, business_address: e.target.value })} className={inputClass} /></Field>
                <Field label="Mailing Address"><input value={settingsForm.mailing_address || ''} onChange={(e) => setSettingsForm({ ...settingsForm, mailing_address: e.target.value })} className={inputClass} /></Field>
              </div>
            </Surface>

            <Surface className="p-5 space-y-4">
              <h2 className="font-display text-[14px] font-semibold">Record Numbering Prefixes & Tax Defaults</h2>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <Field label="Customer Prefix"><input value={settingsForm.customer_prefix} onChange={(e) => setSettingsForm({ ...settingsForm, customer_prefix: e.target.value })} className={`${inputClass} font-mono`} /></Field>
                <Field label="Ticket Prefix"><input value={settingsForm.ticket_prefix} onChange={(e) => setSettingsForm({ ...settingsForm, ticket_prefix: e.target.value })} className={`${inputClass} font-mono`} /></Field>
                <Field label="Work Order Prefix"><input value={settingsForm.work_order_prefix} onChange={(e) => setSettingsForm({ ...settingsForm, work_order_prefix: e.target.value })} className={`${inputClass} font-mono`} /></Field>
                <Field label="Asset Prefix"><input value={settingsForm.asset_prefix} onChange={(e) => setSettingsForm({ ...settingsForm, asset_prefix: e.target.value })} className={`${inputClass} font-mono`} /></Field>
                <Field label="Quotation Prefix"><input value={settingsForm.quote_prefix} onChange={(e) => setSettingsForm({ ...settingsForm, quote_prefix: e.target.value })} className={`${inputClass} font-mono`} /></Field>
                <Field label="Invoice Prefix"><input value={settingsForm.invoice_prefix} onChange={(e) => setSettingsForm({ ...settingsForm, invoice_prefix: e.target.value })} className={`${inputClass} font-mono`} /></Field>
                <Field label="Document Prefix"><input value={settingsForm.document_prefix} onChange={(e) => setSettingsForm({ ...settingsForm, document_prefix: e.target.value })} className={`${inputClass} font-mono`} /></Field>
                <Field label="Default Tax Rate (%)"><input type="number" step="0.01" min="0" max="50" value={settingsForm.tax_rate} onChange={(e) => setSettingsForm({ ...settingsForm, tax_rate: e.target.value })} className={`${inputClass} font-mono`} /></Field>
              </div>
            </Surface>

            <div className="flex justify-end">
              <Button type="submit" variant="primary"><Save className="w-4 h-4" /> Save Company Settings</Button>
            </div>
          </form>
        </>
      )}
    </div>
  );
};
