import React, { useEffect, useState, useCallback } from 'react';
import { Plus, CheckCheck } from 'lucide-react';
import { apiFetch, formatDateTime } from '../lib/api';
import { useApp } from '../context/AppContext';
import { Button, EmptyState, Field, inputClass, Modal, PageHeader, StatusText, Surface } from '../components/ui';

export const OrganizationPage: React.FC<{ section: 'employees' | 'departments' | 'notifications' }> = ({ section }) => {
  const { refreshProfile } = useApp();
  const [users, setUsers] = useState<any[]>([]);
  const [departments, setDepartments] = useState<any[]>([]);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [deptModal, setDeptModal] = useState(false);
  const [deptForm, setDeptForm] = useState({ name: '', code: '', description: '' });
  const [error, setError] = useState('');

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      if (section === 'employees') {
        const res = await apiFetch<{ items: any[] }>('/api/users');
        setUsers(res.items || []);
      } else if (section === 'departments') {
        const res = await apiFetch<{ items: any[] }>('/api/departments');
        setDepartments(res.items || []);
      } else {
        const res = await apiFetch<{ items: any[] }>('/api/notifications');
        setNotifications(res.items || []);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [section]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleCreateDept = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      await apiFetch('/api/departments', { method: 'POST', body: JSON.stringify(deptForm) });
      setDeptModal(false);
      setDeptForm({ name: '', code: '', description: '' });
      await loadData();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const markAllRead = async () => {
    await apiFetch('/api/notifications/read-all', { method: 'POST' });
    await loadData();
    await refreshProfile();
  };

  return (
    <div className="space-y-5">
      {section === 'employees' && (
        <>
          <PageHeader
            title="Employees Directory"
            description="Internal KORTRIX personnel directory. No fictional staff are pre-seeded, and sensitive payroll/SSN fields are excluded by design."
          />
          {loading ? (
            <Surface className="p-8 text-center text-xs text-[#64748B]">Loading directory...</Surface>
          ) : (
            <Surface className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-[#DCE2EA] dark:border-[#242D3D] bg-[#F8FAFC] dark:bg-[#0F141D] text-[12px] font-semibold text-[#475569] dark:text-[#94A3B8]">
                    <th className="py-2.5 px-4">Name</th>
                    <th className="py-2.5 px-3">Position</th>
                    <th className="py-2.5 px-3">Department</th>
                    <th className="py-2.5 px-3">Business Email</th>
                    <th className="py-2.5 px-3">Classification</th>
                    <th className="py-2.5 px-3">Role</th>
                    <th className="py-2.5 px-4">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E2E8F0] dark:divide-[#242D3D] text-[13px]">
                  {users.map((u) => (
                    <tr key={u.id} className="hover:bg-[#F8FAFC] dark:hover:bg-[#1A2230]">
                      <td className="py-2.5 px-4">
                        <div className="font-medium text-[#0B1018] dark:text-white">{u.full_name}</div>
                        {u.responsibilities && <div className="text-[11.5px] text-[#64748B] line-clamp-1 max-w-sm">{u.responsibilities}</div>}
                      </td>
                      <td className="py-2.5 px-3 text-[12.5px]">{u.position || '—'}</td>
                      <td className="py-2.5 px-3 text-[12.5px] text-[#526075]">{u.department_name || '—'}</td>
                      <td className="py-2.5 px-3 font-mono text-[12px] text-[#526075]">{u.email}</td>
                      <td className="py-2.5 px-3 text-[12px] text-[#526075]">{u.employment_classification || '—'}</td>
                      <td className="py-2.5 px-3 text-[12.5px] font-medium">{u.role_name}</td>
                      <td className="py-2.5 px-4"><StatusText value={u.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Surface>
          )}
        </>
      )}

      {section === 'departments' && (
        <>
          <PageHeader
            title="Departments"
            description="Official KORTRIX organizational structure governing internal permissions, service routing, and document access."
            actions={<Button variant="primary" onClick={() => setDeptModal(true)}><Plus className="w-4 h-4" /> Add Department</Button>}
          />
          {error && <div className="p-3 rounded-md bg-[#FEF2F2] border border-[#FECACA] text-xs text-[#B91C1C]">{error}</div>}
          <Surface className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[#DCE2EA] dark:border-[#242D3D] bg-[#F8FAFC] dark:bg-[#0F141D] text-[12px] font-semibold text-[#475569] dark:text-[#94A3B8]">
                  <th className="py-2.5 px-4">Code</th>
                  <th className="py-2.5 px-3">Department Name</th>
                  <th className="py-2.5 px-3">Mandate / Scope</th>
                  <th className="py-2.5 px-3 text-right">Assigned Staff</th>
                  <th className="py-2.5 px-4">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E2E8F0] dark:divide-[#242D3D] text-[13px]">
                {departments.map((d) => (
                  <tr key={d.id} className="hover:bg-[#F8FAFC] dark:hover:bg-[#1A2230]">
                    <td className="py-2.5 px-4 font-mono text-[12px] text-[#0047FF]">{d.code}</td>
                    <td className="py-2.5 px-3 font-medium text-[#0B1018] dark:text-white">{d.name}</td>
                    <td className="py-2.5 px-3 text-[12.5px] text-[#526075]">{d.description}</td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums">{d.member_count ?? 0}</td>
                    <td className="py-2.5 px-4"><StatusText value={d.active ? 'Active' : 'Inactive'} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Surface>

          <Modal open={deptModal} onClose={() => setDeptModal(false)} title="Create Department">
            <form onSubmit={handleCreateDept} className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2"><Field label="Department Name" required><input required value={deptForm.name} onChange={(e) => setDeptForm({ ...deptForm, name: e.target.value })} className={inputClass} /></Field></div>
                <Field label="Code" required><input required maxLength={12} value={deptForm.code} onChange={(e) => setDeptForm({ ...deptForm, code: e.target.value.toUpperCase() })} placeholder="OPS" className={`${inputClass} font-mono`} /></Field>
              </div>
              <Field label="Description"><textarea rows={2} value={deptForm.description} onChange={(e) => setDeptForm({ ...deptForm, description: e.target.value })} className={inputClass} /></Field>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="secondary" onClick={() => setDeptModal(false)}>Cancel</Button>
                <Button type="submit" variant="primary">Create Department</Button>
              </div>
            </form>
          </Modal>
        </>
      )}

      {section === 'notifications' && (
        <>
          <PageHeader
            title="Notification Center"
            description="Operational alerts, website intake events, and system notices."
            actions={<Button variant="secondary" onClick={markAllRead}><CheckCheck className="w-4 h-4" /> Mark All Read</Button>}
          />
          {notifications.length === 0 ? (
            <EmptyState title="No notifications" description="When new website service requests or system alerts occur, they will be recorded here." />
          ) : (
            <Surface className="divide-y divide-[#E2E8F0] dark:divide-[#242D3D]">
              {notifications.map((n) => (
                <div key={n.id} className={`px-5 py-3.5 flex items-start justify-between gap-4 ${n.is_read ? 'opacity-70' : ''}`}>
                  <div>
                    <div className="text-[13.5px] font-medium text-[#0B1018] dark:text-white">{n.title}</div>
                    <div className="text-[12.5px] text-[#526075] mt-0.5">{n.message}</div>
                    <div className="font-mono text-[11px] text-[#64748B] mt-1">{n.category} · {formatDateTime(n.created_at)}</div>
                  </div>
                  <StatusText value={n.is_read ? 'Read' : 'New'} />
                </div>
              ))}
            </Surface>
          )}
        </>
      )}
    </div>
  );
};
