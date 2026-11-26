import { Router } from 'express';
import { z } from 'zod';
import { db, newId } from '../db.ts';
import { hashPassword, recordAudit, requireAuth, requirePermission } from '../security.ts';

const router = Router();
router.use(requireAuth);

// --- EXECUTIVE DASHBOARD (100% live database metrics, zero fabricated data) ---
router.get('/dashboard', requirePermission('dashboard', 'view'), async (_req, res) => {
  try {
    const now = new Date();
    const monthPrefix = now.toISOString().slice(0, 7); // YYYY-MM

    const [
      customersRow,
      activeServiceReqsRow,
      openTicketsRow,
      scheduledApptsRow,
      outstandingQuotesRow,
      outstandingInvoicesRow,
      monthlyRevenueRow,
      managedAssetsRow,
      activeProjectsRow,
      upcomingTasksRow,
      launchTasks,
      recentAuditLogs,
      upcomingTasksList,
    ] = await Promise.all([
      db.queryOne<any>('SELECT COUNT(*) AS cnt FROM customers WHERE archived = 0'),
      db.queryOne<any>("SELECT COUNT(*) AS cnt FROM tickets WHERE status NOT IN ('Resolved', 'Closed', 'Cancelled') AND source = 'Public Intake'"),
      db.queryOne<any>("SELECT COUNT(*) AS cnt FROM tickets WHERE status NOT IN ('Resolved', 'Closed', 'Cancelled')"),
      db.queryOne<any>("SELECT COUNT(*) AS cnt FROM appointments WHERE status = 'Scheduled'"),
      db.queryOne<any>("SELECT COUNT(*) AS cnt, COALESCE(SUM(total), 0) AS sum_total FROM quotations WHERE status IN ('Draft', 'Sent')"),
      db.queryOne<any>("SELECT COUNT(*) AS cnt, COALESCE(SUM(total), 0) AS sum_total FROM invoices WHERE payment_status IN ('Unpaid', 'Partial', 'Overdue')"),
      db.queryOne<any>("SELECT COALESCE(SUM(total), 0) AS sum_total FROM invoices WHERE payment_status = 'Paid' AND paid_at LIKE ?", [`${monthPrefix}%`]),
      db.queryOne<any>("SELECT COUNT(*) AS cnt FROM assets WHERE status NOT IN ('Retired', 'Disposed')"),
      db.queryOne<any>("SELECT COUNT(*) AS cnt FROM projects WHERE status = 'Active'"),
      db.queryOne<any>("SELECT COUNT(*) AS cnt FROM tasks WHERE status != 'Completed'"),
      db.query<any>("SELECT id, title, status, priority FROM tasks WHERE project_id = 'proj-kortrix-launch' ORDER BY sort_order ASC"),
      db.query<any>('SELECT id, actor_email, module, action, target_type, target_id, summary, created_at FROM audit_logs ORDER BY created_at DESC LIMIT 12'),
      db.query<any>(
        `SELECT t.id, t.title, t.status, t.priority, t.due_date, p.name AS project_name
         FROM tasks t
         LEFT JOIN projects p ON p.id = t.project_id
         WHERE t.status != 'Completed'
         ORDER BY CASE WHEN t.due_date IS NULL OR t.due_date = '' THEN 1 ELSE 0 END, t.due_date ASC, t.sort_order ASC
         LIMIT 8`
      ),
    ]);

    const completedLaunch = launchTasks.filter((t) => t.status === 'Completed').length;

    res.json({
      metrics: {
        totalCustomers: Number(customersRow?.cnt || 0),
        activeServiceRequests: Number(activeServiceReqsRow?.cnt || 0),
        openSupportTickets: Number(openTicketsRow?.cnt || 0),
        scheduledAppointments: Number(scheduledApptsRow?.cnt || 0),
        outstandingQuotations: Number(outstandingQuotesRow?.cnt || 0),
        outstandingQuotationsValue: Number(outstandingQuotesRow?.sum_total || 0),
        outstandingInvoices: Number(outstandingInvoicesRow?.cnt || 0),
        outstandingInvoicesValue: Number(outstandingInvoicesRow?.sum_total || 0),
        monthlyRecordedRevenue: Number(monthlyRevenueRow?.sum_total || 0),
        managedAssets: Number(managedAssetsRow?.cnt || 0),
        activeProjects: Number(activeProjectsRow?.cnt || 0),
        upcomingTasks: Number(upcomingTasksRow?.cnt || 0),
      },
      launchRoadmap: {
        total: launchTasks.length,
        completed: completedLaunch,
        pending: launchTasks.length - completedLaunch,
      },
      upcomingTasksList,
      recentActivity: recentAuditLogs,
    });
  } catch (err) {
    console.error('[DASHBOARD]', err);
    res.status(500).json({ error: 'Failed to load dashboard metrics.' });
  }
});

// --- GLOBAL SEARCH ---
router.get('/search', async (req, res) => {
  try {
    const q = String(req.query.q || '').trim();
    if (q.length < 2) {
      res.json({ results: [] });
      return;
    }
    const like = `%${q}%`;
    const [customers, tickets, services, docs, tasks, assets] = await Promise.all([
      db.query<any>('SELECT id, customer_code AS code, name AS title, organization AS subtitle FROM customers WHERE name LIKE ? OR organization LIKE ? OR customer_code LIKE ? LIMIT 5', [like, like, like]),
      db.query<any>('SELECT id, ticket_number AS code, subject AS title, status AS subtitle FROM tickets WHERE subject LIKE ? OR ticket_number LIKE ? LIMIT 5', [like, like]),
      db.query<any>('SELECT id, service_code AS code, name AS title, division AS subtitle FROM services WHERE name LIKE ? OR division LIKE ? OR service_code LIKE ? LIMIT 5', [like, like, like]),
      db.query<any>('SELECT id, document_code AS code, title, category AS subtitle FROM documents WHERE archived = 0 AND (title LIKE ? OR file_name LIKE ? OR category LIKE ?) LIMIT 5', [like, like, like]),
      db.query<any>('SELECT id, status AS code, title, priority AS subtitle FROM tasks WHERE title LIKE ? LIMIT 5', [like]),
      db.query<any>('SELECT id, asset_code AS code, model AS title, serial_number AS subtitle FROM assets WHERE model LIKE ? OR serial_number LIKE ? OR asset_code LIKE ? LIMIT 5', [like, like, like]),
    ]);

    const results = [
      ...customers.map((r) => ({ type: 'Customer', id: r.id, code: r.code, title: r.title, subtitle: r.subtitle || 'CRM Account', path: `/customers/${r.id}` })),
      ...tickets.map((r) => ({ type: 'Ticket', id: r.id, code: r.code, title: r.title, subtitle: r.subtitle, path: `/service-desk/${r.id}` })),
      ...services.map((r) => ({ type: 'Service', id: r.id, code: r.code, title: r.title, subtitle: r.subtitle, path: '/service-catalog' })),
      ...docs.map((r) => ({ type: 'Document', id: r.id, code: r.code, title: r.title, subtitle: r.subtitle, path: '/documents' })),
      ...tasks.map((r) => ({ type: 'Task', id: r.id, code: r.code, title: r.title, subtitle: r.subtitle, path: '/roadmap' })),
      ...assets.map((r) => ({ type: 'Asset', id: r.id, code: r.code, title: r.title, subtitle: r.subtitle || 'ITAM', path: '/assets' })),
    ];

    res.json({ results });
  } catch (err) {
    console.error('[GLOBAL SEARCH]', err);
    res.status(500).json({ error: 'Search failed.' });
  }
});

// --- NOTIFICATIONS ---
router.get('/notifications', async (req, res) => {
  try {
    const items = await db.query<any>(
      'SELECT * FROM notifications WHERE user_id = ? OR user_id IS NULL ORDER BY created_at DESC LIMIT 50',
      [req.authUser!.id]
    );
    res.json({ items });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load notifications.' });
  }
});

router.patch('/notifications/:id/read', async (req, res) => {
  try {
    await db.execute('UPDATE notifications SET is_read = 1 WHERE id = ? AND (user_id = ? OR user_id IS NULL)', [req.params.id, req.authUser!.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update notification.' });
  }
});

router.post('/notifications/read-all', async (req, res) => {
  try {
    await db.execute('UPDATE notifications SET is_read = 1 WHERE user_id = ? OR user_id IS NULL', [req.authUser!.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to mark notifications read.' });
  }
});

// --- COMPANY SETTINGS ---
router.get('/settings', async (_req, res) => {
  try {
    const settings = await db.queryOne<any>('SELECT * FROM company_settings WHERE id = ?', ['default']);
    res.json({
      settings,
      dbStatus: db.getStatus(),
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load company settings.' });
  }
});

const settingsSchema = z.object({
  company_name: z.string().trim().min(1).max(160),
  legal_status: z.string().trim().min(1).max(160),
  website: z.string().trim().max(255),
  affiliation: z.string().trim().max(160),
  primary_email: z.string().trim().email(),
  telephone: z.string().trim().max(60),
  region: z.string().trim().max(120),
  timezone: z.string().trim().max(80),
  currency: z.string().trim().max(16),
  brand_color: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
  logo_data_url: z.string().max(700000).optional(),
  business_address: z.string().max(500).optional(),
  mailing_address: z.string().max(500).optional(),
  tax_rate: z.number().min(0).max(50),
  tax_label: z.string().max(80),
  customer_prefix: z.string().trim().min(2).max(20),
  ticket_prefix: z.string().trim().min(2).max(20),
  work_order_prefix: z.string().trim().min(2).max(20),
  asset_prefix: z.string().trim().min(2).max(20),
  quote_prefix: z.string().trim().min(2).max(20),
  invoice_prefix: z.string().trim().min(2).max(20),
  document_prefix: z.string().trim().min(2).max(20),
  business_hours_json: z.string().optional(),
  notification_prefs_json: z.string().optional(),
  asset_grading_json: z.string().optional(),
  default_theme: z.enum(['light', 'dark']),
});

router.put('/settings', requirePermission('admin', 'edit'), async (req, res) => {
  try {
    const parsed = settingsSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid settings payload.' });
      return;
    }
    const s = parsed.data;
    if (
      s.logo_data_url &&
      s.logo_data_url.length > 0 &&
      !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(s.logo_data_url)
    ) {
      res.status(400).json({ error: 'Logo must be a valid PNG, JPEG, or WebP image.' });
      return;
    }
    const now = new Date().toISOString();
    await db.execute(
      `UPDATE company_settings SET
        company_name = ?, legal_status = ?, website = ?, affiliation = ?, primary_email = ?, telephone = ?,
        region = ?, timezone = ?, currency = ?, brand_color = ?, logo_data_url = ?, business_address = ?,
        mailing_address = ?, tax_rate = ?, tax_label = ?, customer_prefix = ?, ticket_prefix = ?,
        work_order_prefix = ?, asset_prefix = ?, quote_prefix = ?, invoice_prefix = ?, document_prefix = ?,
        business_hours_json = ?, notification_prefs_json = ?, asset_grading_json = ?, default_theme = ?, updated_at = ?
       WHERE id = 'default'`,
      [
        s.company_name, s.legal_status, s.website, s.affiliation, s.primary_email, s.telephone,
        s.region, s.timezone, s.currency, s.brand_color, s.logo_data_url ?? '', s.business_address ?? '',
        s.mailing_address ?? '', s.tax_rate, s.tax_label, s.customer_prefix, s.ticket_prefix,
        s.work_order_prefix, s.asset_prefix, s.quote_prefix, s.invoice_prefix, s.document_prefix,
        s.business_hours_json ?? '{}', s.notification_prefs_json ?? '{}', s.asset_grading_json ?? '[]',
        s.default_theme, now,
      ]
    );
    await recordAudit({
      req,
      module: 'settings',
      action: 'update',
      targetType: 'company_settings',
      targetId: 'default',
      summary: `Updated corporate configuration for ${s.company_name}.`,
    });
    const updated = await db.queryOne('SELECT * FROM company_settings WHERE id = ?', ['default']);
    res.json({ settings: updated });
  } catch (err) {
    console.error('[SETTINGS UPDATE]', err);
    res.status(500).json({ error: 'Failed to update company settings.' });
  }
});

// --- DEPARTMENTS ---
router.get('/departments', async (_req, res) => {
  try {
    const items = await db.query<any>(
      `SELECT d.*, (SELECT COUNT(*) FROM users u WHERE u.department_id = d.id) AS member_count
       FROM departments d ORDER BY d.name ASC`
    );
    res.json({ items });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load departments.' });
  }
});

router.post('/departments', requirePermission('employees', 'create'), async (req, res) => {
  try {
    const schema = z.object({
      name: z.string().trim().min(2).max(150),
      code: z.string().trim().min(2).max(20).transform((v) => v.toUpperCase()),
      description: z.string().max(500).optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid department data.' });
      return;
    }
    const id = newId('dept');
    const now = new Date().toISOString();
    await db.execute(
      `INSERT INTO departments (id, name, code, description, active, created_at, updated_at) VALUES (?, ?, ?, ?, 1, ?, ?)`,
      [id, parsed.data.name, parsed.data.code, parsed.data.description || '', now, now]
    );
    await recordAudit({ req, module: 'departments', action: 'create', targetType: 'department', targetId: id, summary: `Created department ${parsed.data.name}.` });
    res.status(201).json({ item: await db.queryOne('SELECT * FROM departments WHERE id = ?', [id]) });
  } catch (err: any) {
    res.status(400).json({ error: err?.message?.includes('UNIQUE') ? 'Department name or code already exists.' : 'Failed to create department.' });
  }
});

router.put('/departments/:id', requirePermission('employees', 'edit'), async (req, res) => {
  try {
    const schema = z.object({
      name: z.string().trim().min(2).max(150),
      code: z.string().trim().min(2).max(20).transform((v) => v.toUpperCase()),
      description: z.string().max(500).optional(),
      active: z.boolean().optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid department payload.' });
      return;
    }
    const now = new Date().toISOString();
    await db.execute(
      `UPDATE departments SET name = ?, code = ?, description = ?, active = ?, updated_at = ? WHERE id = ?`,
      [parsed.data.name, parsed.data.code, parsed.data.description || '', parsed.data.active === false ? 0 : 1, now, req.params.id]
    );
    await recordAudit({ req, module: 'departments', action: 'update', targetType: 'department', targetId: req.params.id, summary: `Updated department ${parsed.data.name}.` });
    res.json({ item: await db.queryOne('SELECT * FROM departments WHERE id = ?', [req.params.id]) });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update department.' });
  }
});

// --- USERS & EMPLOYEES (No SSN, no payroll banking fields) ---
router.get('/users', requirePermission('employees', 'view'), async (_req, res) => {
  try {
    const items = await db.query<any>(
      `SELECT u.id, u.email, u.full_name, u.position, u.department_id, u.role_id,
              u.employment_classification, u.responsibilities, u.status, u.last_login_at, u.created_at,
              d.name AS department_name, r.name AS role_name
       FROM users u
       LEFT JOIN departments d ON d.id = u.department_id
       LEFT JOIN roles r ON r.id = u.role_id
       ORDER BY u.created_at ASC`
    );
    res.json({ items });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load internal users.' });
  }
});

router.post('/users', requirePermission('admin', 'create'), async (req, res) => {
  try {
    const schema = z.object({
      email: z.string().trim().email(),
      full_name: z.string().trim().min(2).max(160),
      position: z.string().trim().max(160).optional(),
      department_id: z.string().nullable().optional(),
      role_id: z.string().min(1),
      employment_classification: z.string().trim().max(80).optional(),
      responsibilities: z.string().max(1000).optional(),
      password: z.string().min(10, 'Initial password must be at least 10 characters').max(200),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid user data.' });
      return;
    }
    const id = newId('usr');
    const now = new Date().toISOString();
    const passHash = hashPassword(parsed.data.password);
    await db.execute(
      `INSERT INTO users (
        id, email, full_name, position, department_id, role_id,
        employment_classification, responsibilities, password_hash, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'Active', ?, ?)`,
      [
        id,
        parsed.data.email.toLowerCase(),
        parsed.data.full_name,
        parsed.data.position || '',
        parsed.data.department_id || null,
        parsed.data.role_id,
        parsed.data.employment_classification || 'Full-Time',
        parsed.data.responsibilities || '',
        passHash,
        now,
        now,
      ]
    );
    await recordAudit({ req, module: 'users', action: 'create', targetType: 'user', targetId: id, summary: `Provisioned internal account for ${parsed.data.email}.` });
    res.status(201).json({ id });
  } catch (err: any) {
    res.status(400).json({ error: err?.message?.includes('UNIQUE') ? 'An account with this email already exists.' : 'Failed to create user.' });
  }
});

router.put('/users/:id', requirePermission('admin', 'edit'), async (req, res) => {
  try {
    const schema = z.object({
      full_name: z.string().trim().min(2).max(160),
      position: z.string().trim().max(160).optional(),
      department_id: z.string().nullable().optional(),
      role_id: z.string().min(1),
      employment_classification: z.string().trim().max(80).optional(),
      responsibilities: z.string().max(1000).optional(),
      status: z.enum(['Active', 'Deactivated']).optional(),
      new_password: z.string().min(10).max(200).optional().or(z.literal('')),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid user update.' });
      return;
    }
    if (req.params.id === 'user-founder' && parsed.data.status === 'Deactivated') {
      res.status(400).json({ error: 'The primary founder Owner account cannot be deactivated.' });
      return;
    }
    const now = new Date().toISOString();
    await db.execute(
      `UPDATE users SET full_name = ?, position = ?, department_id = ?, role_id = ?,
        employment_classification = ?, responsibilities = ?, status = ?, updated_at = ?
       WHERE id = ?`,
      [
        parsed.data.full_name,
        parsed.data.position || '',
        parsed.data.department_id || null,
        parsed.data.role_id,
        parsed.data.employment_classification || 'Full-Time',
        parsed.data.responsibilities || '',
        parsed.data.status || 'Active',
        now,
        req.params.id,
      ]
    );
    if (parsed.data.new_password) {
      const hash = hashPassword(parsed.data.new_password);
      await db.execute('UPDATE users SET password_hash = ? WHERE id = ?', [hash, req.params.id]);
    }
    if (parsed.data.status === 'Deactivated') {
      await db.execute('DELETE FROM sessions WHERE user_id = ?', [req.params.id]);
    }
    await recordAudit({ req, module: 'users', action: 'update', targetType: 'user', targetId: req.params.id, summary: `Updated account ${parsed.data.full_name} (${parsed.data.status || 'Active'}).` });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update user.' });
  }
});

// --- ROLES & PERMISSIONS ---
router.get('/roles', requirePermission('admin', 'view'), async (_req, res) => {
  try {
    const rows = await db.query<any>('SELECT * FROM roles ORDER BY is_system DESC, name ASC');
    const items = rows.map((r) => ({
      ...r,
      permissions: JSON.parse(r.permissions_json || '{}'),
    }));
    res.json({ items });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load roles.' });
  }
});

router.put('/roles/:id', requirePermission('admin', 'admin'), async (req, res) => {
  try {
    const role = await db.queryOne<any>('SELECT * FROM roles WHERE id = ?', [req.params.id]);
    if (!role) {
      res.status(404).json({ error: 'Role not found.' });
      return;
    }
    if (role.name === 'Owner') {
      res.status(400).json({ error: 'Owner role permissions are permanently locked to full access.' });
      return;
    }
    const schema = z.object({
      description: z.string().max(400).optional(),
      permissions: z.record(z.string(), z.record(z.string(), z.boolean())),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid permissions matrix.' });
      return;
    }
    await db.execute(
      'UPDATE roles SET description = ?, permissions_json = ?, updated_at = ? WHERE id = ?',
      [parsed.data.description ?? role.description, JSON.stringify(parsed.data.permissions), new Date().toISOString(), req.params.id]
    );
    await recordAudit({ req, module: 'roles', action: 'update_permissions', targetType: 'role', targetId: req.params.id, summary: `Modified RBAC permission matrix for role ${role.name}.` });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update role permissions.' });
  }
});

// --- AUDIT LOGS ---
router.get('/audit-logs', requirePermission('admin', 'view'), async (req, res) => {
  try {
    const moduleFilter = String(req.query.module || '').trim();
    const rawLimit = Number(req.query.limit);
    const limit = Number.isFinite(rawLimit) ? Math.min(200, Math.max(10, Math.floor(rawLimit))) : 100;
    const items = moduleFilter
      ? await db.query<any>(`SELECT * FROM audit_logs WHERE module = ? ORDER BY created_at DESC LIMIT ${limit}`, [moduleFilter])
      : await db.query<any>(`SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT ${limit}`);
    res.json({ items });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load audit logs.' });
  }
});

// --- INTEGRATIONS ---
router.get('/integrations', requirePermission('admin', 'view'), async (_req, res) => {
  try {
    const rows = await db.query<any>('SELECT * FROM integrations ORDER BY category ASC, name ASC');
    const items = rows.map((r) => ({
      ...r,
      config: JSON.parse(r.config_json || '{}'),
    }));
    res.json({
      items,
      dbStatus: db.getStatus(),
      envChecks: {
        mysqlConfigured: Boolean(process.env.MYSQL_HOST && process.env.MYSQL_USER && process.env.MYSQL_DATABASE),
        entraConfigured: Boolean(process.env.AZURE_TENANT_ID && process.env.AZURE_CLIENT_ID && process.env.AZURE_CLIENT_SECRET),
        publicIntakeConfigured: Boolean(process.env.PUBLIC_INTAKE_API_KEY),
      },
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load integrations.' });
  }
});

router.post('/integrations/mysql/test', requirePermission('admin', 'admin'), async (_req, res) => {
  const host = process.env.MYSQL_HOST?.trim();
  const port = Number(process.env.MYSQL_PORT || 3306);
  const user = process.env.MYSQL_USER?.trim();
  const database = process.env.MYSQL_DATABASE?.trim();
  if (!host || !user || !database) {
    res.status(400).json({
      ok: false,
      error: 'MYSQL_HOST, MYSQL_USER, and MYSQL_DATABASE are not set in server Secrets / environment variables yet.',
    });
    return;
  }
  const mysql = await import('mysql2/promise');
  try {
    const useSsl = String(process.env.MYSQL_SSL || '').trim().toLowerCase() === 'true';
    const conn = await mysql.createConnection({
      host,
      port,
      user,
      password: process.env.MYSQL_PASSWORD || '',
      database,
      connectTimeout: 8000,
      ssl: useSsl ? { rejectUnauthorized: false } : undefined,
    });
    await conn.ping();
    await conn.end();
    res.json({ ok: true, message: `Connected successfully to MySQL database "${database}" on ${host}:${port}. Restart the server to switch active storage if currently on SQLite.` });
  } catch (err: any) {
    const isLocalhost = host === 'localhost' || host === '127.0.0.1';
    const hint = isLocalhost
      ? ' Tip: "localhost" only works when KORTRIX ONE runs on the cPanel server itself. From cloud hosting, use your cPanel server public hostname/IP and enable Remote Database Access in cPanel.'
      : ' Check your cPanel Remote Database Access allowlist and verify the hostname, port 3306, username, password, and database name.';
    res.status(400).json({
      ok: false,
      error: `MySQL connection failed (${err?.code || err?.message || 'unreachable'}).${hint}`,
    });
  }
});

export default router;
