import React, { useEffect, useState, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Plus, CheckCircle2, Circle, Trash2, Columns3, List, Edit3 } from 'lucide-react';
import { apiFetch, formatDate } from '../lib/api';
import { Button, EmptyState, Field, inputClass, Modal, PageHeader, StatusText, Surface } from '../components/ui';

interface Project {
  id: string;
  name: string;
  code: string;
  description: string;
  category: string;
  status: string;
  owner_name?: string;
  start_date?: string;
  target_date?: string;
  total_tasks: number;
  completed_tasks: number;
}

interface Task {
  id: string;
  project_id: string | null;
  project_name?: string;
  title: string;
  description: string;
  status: 'Pending' | 'In Progress' | 'Blocked' | 'Completed';
  priority: 'Low' | 'Normal' | 'High' | 'Critical';
  assigned_user_id: string | null;
  assignee_name?: string;
  due_date: string | null;
  subtasks: { id: string; title: string; done: boolean }[];
  notes: string;
}

const STATUS_COLUMNS: Task['status'][] = ['Pending', 'In Progress', 'Blocked', 'Completed'];

export const RoadmapProjectsPage: React.FC<{ mode: 'roadmap' | 'projects' | 'tasks' }> = ({ mode }) => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [projects, setProjects] = useState<Project[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>(mode === 'roadmap' ? 'proj-kortrix-launch' : '');
  const [viewMode, setViewMode] = useState<'list' | 'board'>('list');
  const [statusFilter, setStatusFilter] = useState<string>('All');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  const [projectModalOpen, setProjectModalOpen] = useState(false);
  const [taskModalOpen, setTaskModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);

  const [projectForm, setProjectForm] = useState({ name: '', description: '', category: 'Corporate', status: 'Active', target_date: '' });
  const [taskForm, setTaskForm] = useState({
    project_id: mode === 'roadmap' ? 'proj-kortrix-launch' : '',
    title: '',
    description: '',
    status: 'Pending' as Task['status'],
    priority: 'Normal' as Task['priority'],
    assigned_user_id: '',
    due_date: '',
    notes: '',
    subtasksText: '',
  });
  const [error, setError] = useState('');

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const taskQuery = mode === 'tasks' ? '?mine=true' : selectedProjectId ? `?project_id=${encodeURIComponent(selectedProjectId)}` : '';
      const [pRes, tRes, uRes] = await Promise.all([
        apiFetch<{ items: Project[] }>('/api/projects'),
        apiFetch<{ items: Task[] }>(`/api/tasks${taskQuery}`),
        apiFetch<{ items: any[] }>('/api/users').catch(() => ({ items: [] })),
      ]);
      setProjects(pRes.items || []);
      setTasks(tRes.items || []);
      setUsers(uRes.items || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load project workspace.');
    } finally {
      setLoading(false);
    }
  }, [mode, selectedProjectId]);

  useEffect(() => {
    if (mode === 'roadmap') setSelectedProjectId('proj-kortrix-launch');
    else if (mode === 'tasks') setSelectedProjectId('');
  }, [mode]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (searchParams.get('new') === '1') {
      openCreateTask();
      setSearchParams({});
    }
  }, [searchParams, setSearchParams]);

  const openCreateTask = () => {
    setEditingTask(null);
    setTaskForm({
      project_id: selectedProjectId || (projects[0]?.id ?? 'proj-kortrix-launch'),
      title: '',
      description: '',
      status: 'Pending',
      priority: 'Normal',
      assigned_user_id: users[0]?.id || '',
      due_date: '',
      notes: '',
      subtasksText: '',
    });
    setTaskModalOpen(true);
  };

  const openEditTask = (t: Task) => {
    setEditingTask(t);
    setTaskForm({
      project_id: t.project_id || '',
      title: t.title,
      description: t.description || '',
      status: t.status,
      priority: t.priority,
      assigned_user_id: t.assigned_user_id || '',
      due_date: t.due_date || '',
      notes: t.notes || '',
      subtasksText: (t.subtasks || []).map((s) => `${s.done ? '[x] ' : ''}${s.title}`).join('\n'),
    });
    setTaskModalOpen(true);
  };

  const handleSaveProject = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      await apiFetch('/api/projects', { method: 'POST', body: JSON.stringify(projectForm) });
      setProjectModalOpen(false);
      setProjectForm({ name: '', description: '', category: 'Corporate', status: 'Active', target_date: '' });
      await loadData();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleSaveTask = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const subtasks = taskForm.subtasksText
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line, idx) => {
        const done = line.toLowerCase().startsWith('[x]');
        return { id: `sub-${idx}`, title: line.replace(/^\[[xX ]\]\s*/, ''), done };
      });
    const payload = {
      project_id: taskForm.project_id || null,
      title: taskForm.title,
      description: taskForm.description,
      status: taskForm.status,
      priority: taskForm.priority,
      assigned_user_id: taskForm.assigned_user_id || null,
      due_date: taskForm.due_date || null,
      notes: taskForm.notes,
      subtasks,
    };
    try {
      if (editingTask) {
        await apiFetch(`/api/tasks/${editingTask.id}`, { method: 'PUT', body: JSON.stringify(payload) });
      } else {
        await apiFetch('/api/tasks', { method: 'POST', body: JSON.stringify(payload) });
      }
      setTaskModalOpen(false);
      await loadData();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const toggleTaskComplete = async (t: Task) => {
    const nextStatus: Task['status'] = t.status === 'Completed' ? 'Pending' : 'Completed';
    await apiFetch(`/api/tasks/${t.id}`, { method: 'PUT', body: JSON.stringify({ status: nextStatus }) });
    await loadData();
  };

  const updateTaskStatus = async (t: Task, nextStatus: Task['status']) => {
    await apiFetch(`/api/tasks/${t.id}`, { method: 'PUT', body: JSON.stringify({ status: nextStatus }) });
    await loadData();
  };

  const deleteTask = async (id: string) => {
    await apiFetch(`/api/tasks/${id}`, { method: 'DELETE' });
    await loadData();
  };

  const filteredTasks = tasks.filter((t) => {
    if (statusFilter !== 'All' && t.status !== statusFilter) return false;
    if (search.trim() && !t.title.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const activeProject = projects.find((p) => p.id === selectedProjectId);

  const pageMeta = {
    roadmap: {
      title: 'Company Roadmap — KORTRIX Launch',
      desc: 'Official foundational milestones for KORTRIX corporate launch. All tasks are editable and stored in the database.',
    },
    projects: {
      title: 'Projects & Delivery Management',
      desc: 'Track internal engineering, corporate initiatives, and client deployment projects.',
    },
    tasks: {
      title: 'My Tasks',
      desc: 'Personal operational queue across company roadmap milestones and active projects.',
    },
  }[mode];

  return (
    <div className="space-y-5">
      <PageHeader
        title={pageMeta.title}
        description={pageMeta.desc}
        actions={
          <>
            {mode !== 'tasks' && (
              <Button variant="secondary" onClick={() => setProjectModalOpen(true)}>
                <Plus className="w-4 h-4" /> New Project
              </Button>
            )}
            <Button variant="primary" onClick={openCreateTask}>
              <Plus className="w-4 h-4" /> Create Task
            </Button>
          </>
        }
      />

      {error && (
        <div className="p-3 rounded-md bg-[#FEF2F2] dark:bg-[#450A0A]/40 border border-[#FECACA] text-xs text-[#B91C1C]">
          {error}
        </div>
      )}

      {/* Project Selector Cards (on Projects or Roadmap) */}
      {mode !== 'tasks' && projects.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {projects.map((p) => {
            const pct = p.total_tasks > 0 ? Math.round((p.completed_tasks / p.total_tasks) * 100) : 0;
            const isSelected = selectedProjectId === p.id;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => setSelectedProjectId(isSelected && mode === 'projects' ? '' : p.id)}
                className={`text-left p-4 rounded-md border transition-colors cursor-pointer ${
                  isSelected
                    ? 'bg-white dark:bg-[#141A24] border-[#0047FF] ring-1 ring-[#0047FF]'
                    : 'bg-white dark:bg-[#141A24] border-[#DCE2EA] dark:border-[#242D3D] hover:border-[#94A3B8]'
                }`}
              >
                <div className="flex items-center justify-between gap-2 text-xs text-[#64748B] font-mono">
                  <span>{p.code}</span>
                  <StatusText value={p.status} />
                </div>
                <div className="mt-1.5 font-display text-[14.5px] font-semibold text-[#0B1018] dark:text-white truncate">
                  {p.name}
                </div>
                <div className="mt-3 flex items-center justify-between text-xs text-[#526075] dark:text-[#94A3B8]">
                  <span className="tabular-nums">{p.completed_tasks} / {p.total_tasks} tasks</span>
                  <span className="font-mono font-semibold tabular-nums">{pct}%</span>
                </div>
                <div className="mt-1.5 h-1.5 bg-[#EBF0F6] dark:bg-[#0B1018] rounded-sm overflow-hidden">
                  <div className="h-full bg-[#0047FF]" style={{ width: `${pct}%` }} />
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Toolbar: Search, Status Filter, List/Board Switch */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter tasks..."
            className={`${inputClass} sm:w-64`}
          />
          <div className="flex items-center gap-1 p-1 bg-[#EBF0F6] dark:bg-[#141A24] border border-[#DCE2EA] dark:border-[#242D3D] rounded-md">
            {['All', 'Pending', 'In Progress', 'Blocked', 'Completed'].map((st) => (
              <button
                key={st}
                type="button"
                onClick={() => setStatusFilter(st)}
                className={`px-2.5 py-1 text-xs font-medium rounded transition-colors cursor-pointer whitespace-nowrap ${
                  statusFilter === st
                    ? 'bg-white dark:bg-[#0B1018] text-[#0B1018] dark:text-white shadow-xs'
                    : 'text-[#526075] dark:text-[#94A3B8] hover:text-[#0B1018] dark:hover:text-white'
                }`}
              >
                {st}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-1 p-1 bg-[#EBF0F6] dark:bg-[#141A24] border border-[#DCE2EA] dark:border-[#242D3D] rounded-md self-start">
          <button
            type="button"
            onClick={() => setViewMode('list')}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded cursor-pointer ${
              viewMode === 'list' ? 'bg-white dark:bg-[#0B1018] text-[#0B1018] dark:text-white' : 'text-[#526075]'
            }`}
          >
            <List className="w-3.5 h-3.5" /> List
          </button>
          <button
            type="button"
            onClick={() => setViewMode('board')}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded cursor-pointer ${
              viewMode === 'board' ? 'bg-white dark:bg-[#0B1018] text-[#0B1018] dark:text-white' : 'text-[#526075]'
            }`}
          >
            <Columns3 className="w-3.5 h-3.5" /> Board
          </button>
        </div>
      </div>

      {/* Task List or Board */}
      {loading ? (
        <Surface className="p-8 text-center text-xs text-[#64748B]">Loading tasks...</Surface>
      ) : filteredTasks.length === 0 ? (
        <EmptyState
          title="No matching tasks"
          description={activeProject ? `No tasks match your current filter in ${activeProject.name}.` : 'Create a task to track operational work items.'}
          action={<Button variant="primary" onClick={openCreateTask}>Create Task</Button>}
        />
      ) : viewMode === 'list' ? (
        <Surface className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-[#DCE2EA] dark:border-[#242D3D] bg-[#F8FAFC] dark:bg-[#0F141D] text-[12px] font-semibold text-[#475569] dark:text-[#94A3B8]">
                <th className="py-2.5 px-4 w-10"></th>
                <th className="py-2.5 px-3">Task / Milestone</th>
                <th className="py-2.5 px-3">Project</th>
                <th className="py-2.5 px-3">Priority</th>
                <th className="py-2.5 px-3">Status</th>
                <th className="py-2.5 px-3">Assignee</th>
                <th className="py-2.5 px-3">Due Date</th>
                <th className="py-2.5 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E2E8F0] dark:divide-[#242D3D] text-[13px]">
              {filteredTasks.map((t) => (
                <tr key={t.id} className="hover:bg-[#F8FAFC] dark:hover:bg-[#1A2230]">
                  <td className="py-2.5 px-4">
                    <button
                      type="button"
                      onClick={() => toggleTaskComplete(t)}
                      aria-label={t.status === 'Completed' ? 'Mark task pending' : 'Mark task completed'}
                      className="text-[#64748B] hover:text-[#0047FF] cursor-pointer"
                    >
                      {t.status === 'Completed' ? (
                        <CheckCircle2 className="w-4 h-4 text-[#15803D]" />
                      ) : (
                        <Circle className="w-4 h-4" />
                      )}
                    </button>
                  </td>
                  <td className="py-2.5 px-3">
                    <div className={`font-medium ${t.status === 'Completed' ? 'line-through text-[#64748B]' : 'text-[#0B1018] dark:text-white'}`}>
                      {t.title}
                    </div>
                    {t.subtasks && t.subtasks.length > 0 && (
                      <div className="text-[11.5px] text-[#64748B] font-mono mt-0.5">
                        {t.subtasks.filter((s) => s.done).length}/{t.subtasks.length} subtasks complete
                      </div>
                    )}
                  </td>
                  <td className="py-2.5 px-3 text-[12.5px] text-[#526075] dark:text-[#94A3B8]">
                    {t.project_name || '—'}
                  </td>
                  <td className="py-2.5 px-3"><StatusText value={t.priority} /></td>
                  <td className="py-2.5 px-3"><StatusText value={t.status} /></td>
                  <td className="py-2.5 px-3 text-[12.5px] text-[#475569] dark:text-[#CBD5E1]">{t.assignee_name || 'Unassigned'}</td>
                  <td className="py-2.5 px-3 font-mono text-[12px] text-[#526075] dark:text-[#94A3B8] tabular-nums">{formatDate(t.due_date)}</td>
                  <td className="py-2.5 px-4 text-right whitespace-nowrap">
                    <button type="button" onClick={() => openEditTask(t)} className="p-1.5 text-[#526075] hover:text-[#0047FF] cursor-pointer" title="Edit task">
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>
                    <button type="button" onClick={() => deleteTask(t.id)} className="p-1.5 text-[#526075] hover:text-[#DC2626] cursor-pointer" title="Delete task">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Surface>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {STATUS_COLUMNS.map((col) => {
            const colTasks = filteredTasks.filter((t) => t.status === col);
            return (
              <div key={col} className="bg-[#EBF0F6]/70 dark:bg-[#10151F] border border-[#DCE2EA] dark:border-[#242D3D] rounded-md p-3 flex flex-col gap-2.5">
                <div className="flex items-center justify-between px-1">
                  <span className="font-display text-[13px] font-semibold text-[#0B1018] dark:text-white">{col}</span>
                  <span className="font-mono text-xs text-[#64748B] tabular-nums">{colTasks.length}</span>
                </div>
                {colTasks.map((t) => (
                  <div key={t.id} className="p-3 bg-white dark:bg-[#141A24] border border-[#DCE2EA] dark:border-[#242D3D] rounded-md space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => openEditTask(t)}
                        className="text-left text-[13px] font-medium text-[#0B1018] dark:text-white hover:text-[#0047FF] cursor-pointer"
                      >
                        {t.title}
                      </button>
                    </div>
                    <div className="flex items-center justify-between text-[11.5px] text-[#64748B]">
                      <StatusText value={t.priority} />
                      <span className="font-mono">{formatDate(t.due_date)}</span>
                    </div>
                    <select
                      aria-label="Change task status"
                      value={t.status}
                      onChange={(e) => updateTaskStatus(t, e.target.value as Task['status'])}
                      className="w-full mt-1 px-2 py-1 text-xs rounded border border-[#DCE2EA] dark:border-[#2B3548] bg-[#F8FAFC] dark:bg-[#0B1018] text-[#334155] dark:text-[#CBD5E1]"
                    >
                      {STATUS_COLUMNS.map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      )}

      {/* New Project Modal */}
      <Modal open={projectModalOpen} onClose={() => setProjectModalOpen(false)} title="Create Project">
        <form onSubmit={handleSaveProject} className="space-y-4">
          <Field label="Project Name" required>
            <input required value={projectForm.name} onChange={(e) => setProjectForm({ ...projectForm, name: e.target.value })} className={inputClass} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Category">
              <select value={projectForm.category} onChange={(e) => setProjectForm({ ...projectForm, category: e.target.value })} className={inputClass}>
                <option>Corporate</option>
                <option>Infrastructure</option>
                <option>Security</option>
                <option>Lifecycle</option>
                <option>Software Development</option>
                <option>Client Deployment</option>
              </select>
            </Field>
            <Field label="Target Completion Date">
              <input type="date" value={projectForm.target_date} onChange={(e) => setProjectForm({ ...projectForm, target_date: e.target.value })} className={inputClass} />
            </Field>
          </div>
          <Field label="Description">
            <textarea rows={3} value={projectForm.description} onChange={(e) => setProjectForm({ ...projectForm, description: e.target.value })} className={inputClass} />
          </Field>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setProjectModalOpen(false)}>Cancel</Button>
            <Button type="submit" variant="primary">Create Project</Button>
          </div>
        </form>
      </Modal>

      {/* Create / Edit Task Modal */}
      <Modal open={taskModalOpen} onClose={() => setTaskModalOpen(false)} title={editingTask ? 'Edit Task' : 'Create Task'}>
        <form onSubmit={handleSaveTask} className="space-y-4">
          <Field label="Task Title" required>
            <input required value={taskForm.title} onChange={(e) => setTaskForm({ ...taskForm, title: e.target.value })} className={inputClass} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Project">
              <select value={taskForm.project_id} onChange={(e) => setTaskForm({ ...taskForm, project_id: e.target.value })} className={inputClass}>
                <option value="">General (No Project)</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </Field>
            <Field label="Assigned User">
              <select value={taskForm.assigned_user_id} onChange={(e) => setTaskForm({ ...taskForm, assigned_user_id: e.target.value })} className={inputClass}>
                <option value="">Unassigned</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>{u.full_name} ({u.email})</option>
                ))}
              </select>
            </Field>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Status">
              <select value={taskForm.status} onChange={(e) => setTaskForm({ ...taskForm, status: e.target.value as Task['status'] })} className={inputClass}>
                {STATUS_COLUMNS.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </Field>
            <Field label="Priority">
              <select value={taskForm.priority} onChange={(e) => setTaskForm({ ...taskForm, priority: e.target.value as Task['priority'] })} className={inputClass}>
                <option>Low</option><option>Normal</option><option>High</option><option>Critical</option>
              </select>
            </Field>
            <Field label="Due Date">
              <input type="date" value={taskForm.due_date} onChange={(e) => setTaskForm({ ...taskForm, due_date: e.target.value })} className={inputClass} />
            </Field>
          </div>
          <Field label="Subtasks" hint="One subtask per line. Prefix with [x] to mark complete.">
            <textarea rows={3} value={taskForm.subtasksText} onChange={(e) => setTaskForm({ ...taskForm, subtasksText: e.target.value })} placeholder="Draft checklist item" className={inputClass} />
          </Field>
          <Field label="Notes">
            <textarea rows={2} value={taskForm.notes} onChange={(e) => setTaskForm({ ...taskForm, notes: e.target.value })} className={inputClass} />
          </Field>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setTaskModalOpen(false)}>Cancel</Button>
            <Button type="submit" variant="primary">{editingTask ? 'Save Changes' : 'Create Task'}</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
