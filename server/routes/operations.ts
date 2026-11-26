import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import multer from 'multer';
import { z } from 'zod';
import { db, newId } from '../db.ts';
import { generateNextCode, recordAudit, requireAuth, requirePermission, resolveConfinedUploadPath } from '../security.ts';

const router = Router();
router.use(requireAuth);

// Secure private upload directory (outside public static folder)
const UPLOAD_DIR = path.resolve(process.cwd(), 'data', 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

const ALLOWED_EXTENSIONS = new Set([
  '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.csv', '.ppt', '.pptx',
  '.txt', '.md', '.png', '.jpg', '.jpeg', '.webp', '.svg', '.json', '.zip',
]);

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname || '').toLowerCase();
      cb(null, `${crypto.randomUUID()}${ext}`);
    },
  }),
  limits: { fileSize: 25 * 1024 * 1024 }, // 25MB max per corporate file
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    if (!ALLOWED_EXTENSIONS.has(ext)) {
      cb(new Error(`File type ${ext || 'unknown'} is not permitted by KORTRIX security policy.`));
      return;
    }
    cb(null, true);
  },
});

// ========================
// SERVICE CATALOG
// ========================
router.get('/services', requirePermission('service_catalog', 'view'), async (req, res) => {
  try {
    const division = String(req.query.division || '').trim();
    const items = division
      ? await db.query<any>('SELECT * FROM services WHERE division = ? ORDER BY service_code ASC', [division])
      : await db.query<any>('SELECT * FROM services ORDER BY division ASC, service_code ASC');
    res.json({ items });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load service catalog.' });
  }
});

const serviceSchema = z.object({
  service_code: z.string().trim().min(2).max(40).optional(),
  name: z.string().trim().min(2).max(180),
  division: z.enum(['KORTRIX Infrastructure', 'KORTRIX Security', 'KORTRIX Lifecycle']),
  description: z.string().max(2000).optional(),
  included_work: z.string().max(2000).optional(),
  exclusions: z.string().max(2000).optional(),
  pricing_model: z.enum(['Fixed Price', 'Hourly', 'Per Device', 'Per User', 'Recurring', 'Custom Quote']),
  price: z.number().min(0).nullable().optional(),
  estimated_duration: z.string().max(80).optional(),
  delivery_mode: z.enum(['On-Site Only', 'Remote Only', 'On-Site & Remote']),
  tax_classification: z.string().max(80).optional(),
  active: z.boolean().optional(),
  publication_status: z.enum(['Draft', 'Approved']).optional(),
});

router.post('/services', requirePermission('service_catalog', 'create'), async (req, res) => {
  try {
    const parsed = serviceSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid service payload.' });
      return;
    }
    const d = parsed.data;
    const prefix = d.division === 'KORTRIX Security' ? 'SEC' : d.division === 'KORTRIX Lifecycle' ? 'LIF' : 'INF';
    const countRow = await db.queryOne<any>('SELECT COUNT(*) AS cnt FROM services WHERE division = ?', [d.division]);
    const code = d.service_code || `${prefix}-${String(Number(countRow?.cnt || 0) + 1).padStart(3, '0')}`;
    const id = newId('svc');
    const now = new Date().toISOString();
    await db.execute(
      `INSERT INTO services (
        id, service_code, name, division, description, included_work, exclusions,
        pricing_model, price, estimated_duration, delivery_mode, tax_classification,
        active, publication_status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id, code, d.name, d.division, d.description || '', d.included_work || '', d.exclusions || '',
        d.pricing_model, d.price ?? null, d.estimated_duration || '', d.delivery_mode,
        d.tax_classification || 'Taxable Service', d.active === false ? 0 : 1, d.publication_status || 'Draft',
        now, now,
      ]
    );
    await recordAudit({ req, module: 'service_catalog', action: 'create', targetType: 'service', targetId: id, summary: `Added service ${code} — ${d.name}.` });
    res.status(201).json({ item: await db.queryOne('SELECT * FROM services WHERE id = ?', [id]) });
  } catch (err: any) {
    res.status(400).json({ error: err?.message?.includes('UNIQUE') ? 'Service code already exists.' : 'Failed to create service.' });
  }
});

router.put('/services/:id', requirePermission('service_catalog', 'edit'), async (req, res) => {
  try {
    const parsed = serviceSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid service update.' });
      return;
    }
    const d = parsed.data;
    const now = new Date().toISOString();
    await db.execute(
      `UPDATE services SET
        name = ?, division = ?, description = ?, included_work = ?, exclusions = ?,
        pricing_model = ?, price = ?, estimated_duration = ?, delivery_mode = ?,
        tax_classification = ?, active = ?, publication_status = ?, updated_at = ?
       WHERE id = ?`,
      [
        d.name, d.division, d.description || '', d.included_work || '', d.exclusions || '',
        d.pricing_model, d.price ?? null, d.estimated_duration || '', d.delivery_mode,
        d.tax_classification || 'Taxable Service', d.active === false ? 0 : 1, d.publication_status || 'Draft',
        now, req.params.id,
      ]
    );
    await recordAudit({ req, module: 'service_catalog', action: 'update', targetType: 'service', targetId: req.params.id, summary: `Updated service ${d.name} (${d.publication_status || 'Draft'}).` });
    res.json({ item: await db.queryOne('SELECT * FROM services WHERE id = ?', [req.params.id]) });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update service.' });
  }
});

router.delete('/services/:id', requirePermission('service_catalog', 'delete'), async (req, res) => {
  try {
    await db.execute('DELETE FROM services WHERE id = ?', [req.params.id]);
    await recordAudit({ req, module: 'service_catalog', action: 'delete', targetType: 'service', targetId: req.params.id, summary: `Removed service ${req.params.id}.` });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete service.' });
  }
});

// ========================
// PROJECTS & ROADMAP TASKS
// ========================
router.get('/projects', requirePermission('projects', 'view'), async (_req, res) => {
  try {
    const projects = await db.query<any>(
      `SELECT p.*, u.full_name AS owner_name,
              (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id) AS total_tasks,
              (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id AND t.status = 'Completed') AS completed_tasks
       FROM projects p
       LEFT JOIN users u ON u.id = p.owner_id
       ORDER BY CASE WHEN p.id = 'proj-kortrix-launch' THEN 0 ELSE 1 END, p.created_at DESC`
    );
    res.json({ items: projects });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load projects.' });
  }
});

router.post('/projects', requirePermission('projects', 'create'), async (req, res) => {
  try {
    const schema = z.object({
      name: z.string().trim().min(2).max(200),
      description: z.string().max(2000).optional(),
      category: z.string().max(60).optional(),
      status: z.enum(['Planning', 'Active', 'On Hold', 'Completed', 'Archived']).optional(),
      start_date: z.string().nullable().optional(),
      target_date: z.string().nullable().optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid project data.' });
      return;
    }
    const id = newId('prj');
    const code = await generateNextCode('projects', 'code', 'KTX-PRJ');
    const now = new Date().toISOString();
    await db.execute(
      `INSERT INTO projects (id, name, code, description, category, status, owner_id, start_date, target_date, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id, parsed.data.name, code, parsed.data.description || '', parsed.data.category || 'Operations',
        parsed.data.status || 'Active', req.authUser!.id, parsed.data.start_date || now.slice(0, 10),
        parsed.data.target_date || null, now, now,
      ]
    );
    await recordAudit({ req, module: 'projects', action: 'create', targetType: 'project', targetId: id, summary: `Created project ${code} — ${parsed.data.name}.` });
    res.status(201).json({ item: await db.queryOne('SELECT * FROM projects WHERE id = ?', [id]) });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create project.' });
  }
});

router.put('/projects/:id', requirePermission('projects', 'edit'), async (req, res) => {
  try {
    const schema = z.object({
      name: z.string().trim().min(2).max(200),
      description: z.string().max(2000).optional(),
      category: z.string().max(60).optional(),
      status: z.enum(['Planning', 'Active', 'On Hold', 'Completed', 'Archived']),
      target_date: z.string().nullable().optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid project payload.' });
      return;
    }
    await db.execute(
      `UPDATE projects SET name = ?, description = ?, category = ?, status = ?, target_date = ?, updated_at = ? WHERE id = ?`,
      [parsed.data.name, parsed.data.description || '', parsed.data.category || 'Operations', parsed.data.status, parsed.data.target_date || null, new Date().toISOString(), req.params.id]
    );
    await recordAudit({ req, module: 'projects', action: 'update', targetType: 'project', targetId: req.params.id, summary: `Updated project ${parsed.data.name}.` });
    res.json({ item: await db.queryOne('SELECT * FROM projects WHERE id = ?', [req.params.id]) });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update project.' });
  }
});

router.get('/tasks', requirePermission('projects', 'view'), async (req, res) => {
  try {
    const projectId = String(req.query.project_id || '').trim();
    const assignedToMe = req.query.mine === 'true';
    let sql = `SELECT t.*, p.name AS project_name, u.full_name AS assignee_name
               FROM tasks t
               LEFT JOIN projects p ON p.id = t.project_id
               LEFT JOIN users u ON u.id = t.assigned_user_id`;
    const params: any[] = [];
    const clauses: string[] = [];
    if (projectId) {
      clauses.push('t.project_id = ?');
      params.push(projectId);
    }
    if (assignedToMe) {
      clauses.push('t.assigned_user_id = ?');
      params.push(req.authUser!.id);
    }
    if (clauses.length > 0) sql += ' WHERE ' + clauses.join(' AND ');
    sql += ' ORDER BY t.sort_order ASC, t.created_at DESC';
    const rows = await db.query<any>(sql, params);
    const items = rows.map((r) => ({
      ...r,
      dependencies: JSON.parse(r.dependencies_json || '[]'),
      subtasks: JSON.parse(r.subtasks_json || '[]'),
    }));
    res.json({ items });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load tasks.' });
  }
});

const taskSchema = z.object({
  project_id: z.string().nullable().optional(),
  title: z.string().trim().min(2).max(240),
  description: z.string().max(2000).optional(),
  status: z.enum(['Pending', 'In Progress', 'Blocked', 'Completed']).optional(),
  priority: z.enum(['Low', 'Normal', 'High', 'Critical']).optional(),
  assigned_user_id: z.string().nullable().optional(),
  due_date: z.string().nullable().optional(),
  dependencies: z.array(z.string()).optional(),
  subtasks: z.array(z.object({ id: z.string(), title: z.string(), done: z.boolean() })).optional(),
  notes: z.string().max(2000).optional(),
});

router.post('/tasks', requirePermission('projects', 'create'), async (req, res) => {
  try {
    const parsed = taskSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid task input.' });
      return;
    }
    const d = parsed.data;
    const id = newId('tsk');
    const now = new Date().toISOString();
    const status = d.status || 'Pending';
    await db.execute(
      `INSERT INTO tasks (
        id, project_id, title, description, status, priority, assigned_user_id,
        due_date, dependencies_json, subtasks_json, notes, sort_order, completed_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 100, ?, ?, ?)`,
      [
        id, d.project_id || null, d.title, d.description || '', status, d.priority || 'Normal',
        d.assigned_user_id ?? req.authUser!.id, d.due_date || null,
        JSON.stringify(d.dependencies || []), JSON.stringify(d.subtasks || []),
        d.notes || '', status === 'Completed' ? now : null, now, now,
      ]
    );
    await recordAudit({ req, module: 'projects', action: 'create_task', targetType: 'task', targetId: id, summary: `Created task "${d.title}".` });
    res.status(201).json({ id });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create task.' });
  }
});

router.put('/tasks/:id', requirePermission('projects', 'edit'), async (req, res) => {
  try {
    const existing = await db.queryOne<any>('SELECT * FROM tasks WHERE id = ?', [req.params.id]);
    if (!existing) {
      res.status(404).json({ error: 'Task not found.' });
      return;
    }
    const parsed = taskSchema.partial().safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid task update.' });
      return;
    }
    const d = parsed.data;
    const now = new Date().toISOString();
    const nextStatus = d.status ?? existing.status;
    const completedAt = nextStatus === 'Completed' ? (existing.completed_at || now) : null;
    await db.execute(
      `UPDATE tasks SET
        project_id = ?, title = ?, description = ?, status = ?, priority = ?,
        assigned_user_id = ?, due_date = ?, dependencies_json = ?, subtasks_json = ?,
        notes = ?, completed_at = ?, updated_at = ?
       WHERE id = ?`,
      [
        d.project_id !== undefined ? d.project_id : existing.project_id,
        d.title ?? existing.title,
        d.description !== undefined ? d.description : existing.description,
        nextStatus,
        d.priority ?? existing.priority,
        d.assigned_user_id !== undefined ? d.assigned_user_id : existing.assigned_user_id,
        d.due_date !== undefined ? d.due_date : existing.due_date,
        d.dependencies !== undefined ? JSON.stringify(d.dependencies) : existing.dependencies_json,
        d.subtasks !== undefined ? JSON.stringify(d.subtasks) : existing.subtasks_json,
        d.notes !== undefined ? d.notes : existing.notes,
        completedAt,
        now,
        req.params.id,
      ]
    );
    await recordAudit({ req, module: 'projects', action: 'update_task', targetType: 'task', targetId: req.params.id, summary: `Updated task "${d.title ?? existing.title}" (${nextStatus}).` });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update task.' });
  }
});

router.delete('/tasks/:id', requirePermission('projects', 'delete'), async (req, res) => {
  try {
    await db.execute('DELETE FROM tasks WHERE id = ?', [req.params.id]);
    await recordAudit({ req, module: 'projects', action: 'delete_task', targetType: 'task', targetId: req.params.id, summary: `Deleted task ${req.params.id}.` });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete task.' });
  }
});

// ========================
// DOCUMENT MANAGEMENT (Private Corporate Storage)
// ========================
router.get('/document-folders', requirePermission('documents', 'view'), async (_req, res) => {
  try {
    const items = await db.query<any>('SELECT * FROM document_folders ORDER BY category ASC, name ASC');
    res.json({
      items: items.map((f) => ({
        ...f,
        allowed_departments: JSON.parse(f.allowed_departments_json || '[]'),
      })),
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load document folders.' });
  }
});

router.post('/document-folders', requirePermission('documents', 'create'), async (req, res) => {
  try {
    const schema = z.object({
      name: z.string().trim().min(1).max(150),
      category: z.string().trim().min(1).max(100),
      parent_id: z.string().nullable().optional(),
      allowed_departments: z.array(z.string()).optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid folder payload.' });
      return;
    }
    const id = newId('fld');
    await db.execute(
      `INSERT INTO document_folders (id, name, category, parent_id, allowed_departments_json, created_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [id, parsed.data.name, parsed.data.category, parsed.data.parent_id || null, JSON.stringify(parsed.data.allowed_departments || []), req.authUser!.id, new Date().toISOString()]
    );
    await recordAudit({ req, module: 'documents', action: 'create_folder', targetType: 'folder', targetId: id, summary: `Created folder "${parsed.data.name}" in ${parsed.data.category}.` });
    res.status(201).json({ id });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create folder.' });
  }
});

function canAccessDepartmentDocument(user: Express.Request['authUser'], allowedDepartments: string[]): boolean {
  if (!user) return false;
  if (user.role_name === 'Owner' || user.role_name === 'Administrator' || user.role_name === 'Executive') return true;
  if (!allowedDepartments || allowedDepartments.length === 0) return true;
  return Boolean(user.department_id && allowedDepartments.includes(user.department_id));
}

router.get('/documents', requirePermission('documents', 'view'), async (req, res) => {
  try {
    const category = String(req.query.category || '').trim();
    const customerId = String(req.query.customer_id || '').trim();
    const showArchived = req.query.archived === 'true';

    let sql = `SELECT d.*, u.full_name AS uploader_name, c.name AS customer_name
               FROM documents d
               LEFT JOIN users u ON u.id = d.uploaded_by
               LEFT JOIN customers c ON c.id = d.customer_id
               WHERE d.archived = ?`;
    const params: any[] = [showArchived ? 1 : 0];
    if (category) {
      sql += ' AND d.category = ?';
      params.push(category);
    }
    if (customerId) {
      sql += ' AND d.customer_id = ?';
      params.push(customerId);
    }
    sql += ' ORDER BY d.updated_at DESC';

    const rows = await db.query<any>(sql, params);
    const items = rows
      .map((r) => ({
        ...r,
        tags: JSON.parse(r.tags_json || '[]'),
        allowed_departments: JSON.parse(r.allowed_departments_json || '[]'),
        versions: JSON.parse(r.versions_json || '[]'),
      }))
      .filter((doc) => canAccessDepartmentDocument(req.authUser, doc.allowed_departments));

    res.json({ items });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load documents.' });
  }
});

router.post('/documents', requirePermission('documents', 'create'), upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: 'Please attach a valid file to upload.' });
      return;
    }
    const settings = await db.queryOne<any>('SELECT document_prefix FROM company_settings WHERE id = ?', ['default']);
    const code = await generateNextCode('documents', 'document_code', settings?.document_prefix || 'KTX-DOC');
    const id = newId('doc');
    const now = new Date().toISOString();

    const title = String(req.body.title || req.file.originalname).trim().slice(0, 200);
    const category = String(req.body.category || 'Operations').trim();
    const folderId = req.body.folder_id ? String(req.body.folder_id) : null;
    const customerId = req.body.customer_id ? String(req.body.customer_id) : null;
    const description = String(req.body.description || '').slice(0, 2000);
    const tags = String(req.body.tags || '')
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);
    let allowedDepts: string[] = [];
    try {
      allowedDepts = req.body.allowed_departments ? JSON.parse(req.body.allowed_departments) : [];
    } catch {
      allowedDepts = [];
    }

    const versions = [
      {
        version: 1,
        file_name: req.file.originalname,
        stored_name: req.file.filename,
        file_size: req.file.size,
        uploaded_by: req.authUser!.email,
        uploaded_at: now,
        notes: 'Initial upload',
      },
    ];

    await db.execute(
      `INSERT INTO documents (
        id, document_code, title, file_name, stored_name, mime_type, file_size,
        category, folder_id, customer_id, description, tags_json, allowed_departments_json,
        version, versions_json, uploaded_by, archived, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, 0, ?, ?)`,
      [
        id, code, title, req.file.originalname, req.file.filename, req.file.mimetype || 'application/octet-stream',
        req.file.size, category, folderId, customerId, description, JSON.stringify(tags),
        JSON.stringify(allowedDepts), JSON.stringify(versions), req.authUser!.id, now, now,
      ]
    );

    await recordAudit({ req, module: 'documents', action: 'upload', targetType: 'document', targetId: id, summary: `Uploaded private corporate document ${code} (${title}).` });
    res.status(201).json({ id, document_code: code });
  } catch (err: any) {
    res.status(400).json({ error: err?.message || 'Document upload failed.' });
  }
});

router.post('/documents/:id/version', requirePermission('documents', 'edit'), upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: 'Attach a file for the new document version.' });
      return;
    }
    const existing = await db.queryOne<any>('SELECT * FROM documents WHERE id = ?', [req.params.id]);
    if (!existing) {
      res.status(404).json({ error: 'Document not found.' });
      return;
    }
    const now = new Date().toISOString();
    const nextVersion = Number(existing.version || 1) + 1;
    const versions = JSON.parse(existing.versions_json || '[]');
    versions.unshift({
      version: nextVersion,
      file_name: req.file.originalname,
      stored_name: req.file.filename,
      file_size: req.file.size,
      uploaded_by: req.authUser!.email,
      uploaded_at: now,
      notes: String(req.body.notes || `Version ${nextVersion}`),
    });

    await db.execute(
      `UPDATE documents SET file_name = ?, stored_name = ?, mime_type = ?, file_size = ?,
        version = ?, versions_json = ?, updated_at = ? WHERE id = ?`,
      [req.file.originalname, req.file.filename, req.file.mimetype || 'application/octet-stream', req.file.size, nextVersion, JSON.stringify(versions), now, req.params.id]
    );
    await recordAudit({ req, module: 'documents', action: 'new_version', targetType: 'document', targetId: req.params.id, summary: `Uploaded v${nextVersion} for ${existing.document_code}.` });
    res.json({ ok: true, version: nextVersion });
  } catch (err) {
    res.status(500).json({ error: 'Failed to upload document version.' });
  }
});

router.put('/documents/:id', requirePermission('documents', 'edit'), async (req, res) => {
  try {
    const existing = await db.queryOne<any>('SELECT * FROM documents WHERE id = ?', [req.params.id]);
    if (!existing) {
      res.status(404).json({ error: 'Document not found.' });
      return;
    }
    const schema = z.object({
      title: z.string().trim().min(1).max(200).optional(),
      category: z.string().trim().max(100).optional(),
      description: z.string().max(2000).optional(),
      tags: z.array(z.string()).optional(),
      allowed_departments: z.array(z.string()).optional(),
      archived: z.boolean().optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid document metadata.' });
      return;
    }
    const d = parsed.data;
    await db.execute(
      `UPDATE documents SET title = ?, category = ?, description = ?, tags_json = ?,
        allowed_departments_json = ?, archived = ?, updated_at = ? WHERE id = ?`,
      [
        d.title ?? existing.title,
        d.category ?? existing.category,
        d.description !== undefined ? d.description : existing.description,
        d.tags !== undefined ? JSON.stringify(d.tags) : existing.tags_json,
        d.allowed_departments !== undefined ? JSON.stringify(d.allowed_departments) : existing.allowed_departments_json,
        d.archived !== undefined ? (d.archived ? 1 : 0) : existing.archived,
        new Date().toISOString(),
        req.params.id,
      ]
    );
    await recordAudit({ req, module: 'documents', action: 'update', targetType: 'document', targetId: req.params.id, summary: `Updated document metadata for ${existing.document_code}.` });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update document.' });
  }
});

router.get('/documents/:id/download', requirePermission('documents', 'view'), async (req, res) => {
  try {
    const doc = await db.queryOne<any>('SELECT * FROM documents WHERE id = ?', [req.params.id]);
    if (!doc) {
      res.status(404).json({ error: 'Document not found.' });
      return;
    }
    const allowedDepts = JSON.parse(doc.allowed_departments_json || '[]');
    if (!canAccessDepartmentDocument(req.authUser, allowedDepts)) {
      res.status(403).json({ error: 'Access denied by department document policy.' });
      return;
    }
    const versionParam = req.query.stored_name ? String(req.query.stored_name) : doc.stored_name;
    // Verify requested stored_name belongs to this document's version history
    const versions = JSON.parse(doc.versions_json || '[]');
    const matchedVersion = versions.find((v: any) => v.stored_name === versionParam);
    const targetStored = matchedVersion ? matchedVersion.stored_name : doc.stored_name;
    const downloadName = matchedVersion ? matchedVersion.file_name : doc.file_name;

    const fullPath = resolveConfinedUploadPath(UPLOAD_DIR, targetStored);
    if (!fullPath || !fs.existsSync(fullPath)) {
      res.status(404).json({ error: 'Document file binary not found on server.' });
      return;
    }
    await recordAudit({ req, module: 'documents', action: 'download', targetType: 'document', targetId: doc.id, summary: `Downloaded ${doc.document_code} (${downloadName}).` });
    res.setHeader('Content-Disposition', `attachment; filename="${path.basename(downloadName).replace(/"/g, '')}"`);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.sendFile(fullPath);
  } catch (err) {
    res.status(500).json({ error: 'Failed to download document.' });
  }
});

export default router;
