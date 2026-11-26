import { Router } from 'express';
import { z } from 'zod';
import { db, newId } from '../db.ts';
import {
  generateNextCode,
  rateLimit,
  recordAudit,
  requireAuth,
  requirePermission,
  timingSafeStringCompare,
} from '../security.ts';

const router = Router();

// ========================
// PUBLIC WEBSITE INTAKE API (Write-only, API-key authenticated, never exposes internal tickets)
// ========================
router.post('/public/service-requests', rateLimit('public-intake', 15, 10 * 60 * 1000), async (req, res) => {
  try {
    const expectedKey = process.env.PUBLIC_INTAKE_API_KEY?.trim();
    const providedKey = String(req.headers['x-kortrix-intake-key'] || '');
    if (!expectedKey || !providedKey || !timingSafeStringCompare(providedKey, expectedKey)) {
      res.status(401).json({ error: 'Unauthorized intake request.' });
      return;
    }
    const schema = z.object({
      name: z.string().trim().min(2).max(160),
      email: z.string().trim().email(),
      subject: z.string().trim().min(3).max(240),
      description: z.string().trim().min(5).max(4000),
      service_category: z.string().trim().max(80).optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid service request payload.' });
      return;
    }
    const settings = await db.queryOne<any>('SELECT ticket_prefix FROM company_settings WHERE id = ?', ['default']);
    const ticketNumber = await generateNextCode('tickets', 'ticket_number', settings?.ticket_prefix || 'KTX-TKT');
    const id = newId('tkt');
    const now = new Date().toISOString();
    await db.execute(
      `INSERT INTO tickets (
        id, ticket_number, customer_id, requester_name, requester_email, subject, description,
        service_category, priority, status, source, internal_notes_json, activity_json, created_at, updated_at
      ) VALUES (?, ?, NULL, ?, ?, ?, ?, ?, 'Normal', 'New', 'Public Intake', '[]', ?, ?, ?)`,
      [
        id, ticketNumber, parsed.data.name, parsed.data.email, parsed.data.subject, parsed.data.description,
        parsed.data.service_category || 'Infrastructure',
        JSON.stringify([{ at: now, actor: 'kortrix.com Intake', text: 'Service request received from kortrix.com.' }]),
        now, now,
      ]
    );
    await db.execute(
      `INSERT INTO notifications (id, user_id, title, message, category, link, is_read, created_at)
       VALUES (?, NULL, ?, ?, 'Service Desk', ?, 0, ?)`,
      [newId('ntf'), `New website request ${ticketNumber}`, `${parsed.data.name} submitted "${parsed.data.subject}".`, `/service-desk/${id}`, now]
    );
    await recordAudit({ actorEmail: 'kortrix.com-intake', module: 'service_desk', action: 'public_intake', targetType: 'ticket', targetId: id, summary: `Created intake ticket ${ticketNumber}.` });
    res.status(201).json({ received: true, reference: ticketNumber });
  } catch (err) {
    res.status(500).json({ error: 'Unable to submit service request.' });
  }
});

// All routes below require authenticated internal session
router.use(requireAuth);

// ========================
// CRM: CUSTOMERS, CONTACTS, LEADS
// ========================
router.get('/customers', requirePermission('crm', 'view'), async (req, res) => {
  try {
    const showArchived = req.query.archived === 'true';
    const items = await db.query<any>(
      `SELECT c.*, u.full_name AS assigned_rep_name
       FROM customers c
       LEFT JOIN users u ON u.id = c.assigned_rep_id
       WHERE c.archived = ?
       ORDER BY c.created_at DESC`,
      [showArchived ? 1 : 0]
    );
    res.json({ items });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load customers.' });
  }
});

const customerSchema = z.object({
  name: z.string().trim().min(2).max(180),
  organization: z.string().trim().max(180).optional(),
  email: z.string().trim().email().or(z.literal('')).optional(),
  telephone: z.string().trim().max(60).optional(),
  billing_address: z.string().max(400).optional(),
  service_address: z.string().max(400).optional(),
  customer_type: z.enum(['Residential', 'Business', 'Educational Institution', 'Enterprise', 'Other Organization']),
  account_status: z.enum(['Active', 'Onboarding', 'On Hold', 'Inactive']).optional(),
  assigned_rep_id: z.string().nullable().optional(),
  notes: z.string().max(3000).optional(),
  archived: z.boolean().optional(),
});

router.post('/customers', requirePermission('crm', 'create'), async (req, res) => {
  try {
    const parsed = customerSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid customer record.' });
      return;
    }
    const d = parsed.data;
    const settings = await db.queryOne<any>('SELECT customer_prefix FROM company_settings WHERE id = ?', ['default']);
    const code = await generateNextCode('customers', 'customer_code', settings?.customer_prefix || 'KTX-CUS');
    const id = newId('cus');
    const now = new Date().toISOString();
    await db.execute(
      `INSERT INTO customers (
        id, customer_code, name, organization, email, telephone, billing_address, service_address,
        customer_type, account_status, assigned_rep_id, notes, communication_log_json, archived, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '[]', 0, ?, ?)`,
      [
        id, code, d.name, d.organization || '', d.email || '', d.telephone || '', d.billing_address || '',
        d.service_address || '', d.customer_type, d.account_status || 'Active',
        d.assigned_rep_id || req.authUser!.id, d.notes || '', now, now,
      ]
    );
    await recordAudit({ req, module: 'crm', action: 'create_customer', targetType: 'customer', targetId: id, summary: `Created customer ${code} (${d.name}).` });
    res.status(201).json({ item: await db.queryOne('SELECT * FROM customers WHERE id = ?', [id]) });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create customer.' });
  }
});

router.put('/customers/:id', requirePermission('crm', 'edit'), async (req, res) => {
  try {
    const existing = await db.queryOne<any>('SELECT * FROM customers WHERE id = ?', [req.params.id]);
    if (!existing) {
      res.status(404).json({ error: 'Customer not found.' });
      return;
    }
    const parsed = customerSchema.partial().safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid customer update.' });
      return;
    }
    const d = parsed.data;
    await db.execute(
      `UPDATE customers SET
        name = ?, organization = ?, email = ?, telephone = ?, billing_address = ?, service_address = ?,
        customer_type = ?, account_status = ?, assigned_rep_id = ?, notes = ?, archived = ?, updated_at = ?
       WHERE id = ?`,
      [
        d.name ?? existing.name,
        d.organization !== undefined ? d.organization : existing.organization,
        d.email !== undefined ? d.email : existing.email,
        d.telephone !== undefined ? d.telephone : existing.telephone,
        d.billing_address !== undefined ? d.billing_address : existing.billing_address,
        d.service_address !== undefined ? d.service_address : existing.service_address,
        d.customer_type ?? existing.customer_type,
        d.account_status ?? existing.account_status,
        d.assigned_rep_id !== undefined ? d.assigned_rep_id : existing.assigned_rep_id,
        d.notes !== undefined ? d.notes : existing.notes,
        d.archived !== undefined ? (d.archived ? 1 : 0) : existing.archived,
        new Date().toISOString(),
        req.params.id,
      ]
    );
    await recordAudit({ req, module: 'crm', action: 'update_customer', targetType: 'customer', targetId: req.params.id, summary: `Updated customer ${existing.customer_code}.` });
    res.json({ item: await db.queryOne('SELECT * FROM customers WHERE id = ?', [req.params.id]) });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update customer.' });
  }
});

router.get('/customers/:id/profile', requirePermission('crm', 'view'), async (req, res) => {
  try {
    const customer = await db.queryOne<any>(
      `SELECT c.*, u.full_name AS assigned_rep_name FROM customers c LEFT JOIN users u ON u.id = c.assigned_rep_id WHERE c.id = ?`,
      [req.params.id]
    );
    if (!customer) {
      res.status(404).json({ error: 'Customer not found.' });
      return;
    }
    const [contacts, tickets, workOrders, assets, quotations, invoices, documents] = await Promise.all([
      db.query<any>('SELECT * FROM contacts WHERE customer_id = ? ORDER BY is_primary DESC, full_name ASC', [req.params.id]),
      db.query<any>('SELECT * FROM tickets WHERE customer_id = ? ORDER BY created_at DESC', [req.params.id]),
      db.query<any>('SELECT * FROM work_orders WHERE customer_id = ? ORDER BY created_at DESC', [req.params.id]),
      db.query<any>('SELECT * FROM assets WHERE customer_id = ? ORDER BY created_at DESC', [req.params.id]),
      db.query<any>('SELECT * FROM quotations WHERE customer_id = ? ORDER BY created_at DESC', [req.params.id]),
      db.query<any>('SELECT * FROM invoices WHERE customer_id = ? ORDER BY created_at DESC', [req.params.id]),
      db.query<any>('SELECT * FROM documents WHERE customer_id = ? AND archived = 0 ORDER BY updated_at DESC', [req.params.id]),
    ]);
    res.json({
      customer: { ...customer, communication_log: JSON.parse(customer.communication_log_json || '[]') },
      contacts, tickets, workOrders, assets, quotations, invoices, documents,
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load customer profile.' });
  }
});

router.post('/customers/:id/communication', requirePermission('crm', 'edit'), async (req, res) => {
  try {
    const customer = await db.queryOne<any>('SELECT id, customer_code, communication_log_json FROM customers WHERE id = ?', [req.params.id]);
    if (!customer) {
      res.status(404).json({ error: 'Customer not found.' });
      return;
    }
    const schema = z.object({ channel: z.enum(['Phone', 'Email', 'On-Site', 'Meeting', 'Note']), summary: z.string().trim().min(2).max(2000) });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Provide channel and summary.' });
      return;
    }
    const log = JSON.parse(customer.communication_log_json || '[]');
    log.unshift({
      id: newId('com'),
      channel: parsed.data.channel,
      summary: parsed.data.summary,
      author: req.authUser!.full_name,
      at: new Date().toISOString(),
    });
    await db.execute('UPDATE customers SET communication_log_json = ?, updated_at = ? WHERE id = ?', [JSON.stringify(log), new Date().toISOString(), req.params.id]);
    res.status(201).json({ communication_log: log });
  } catch (err) {
    res.status(500).json({ error: 'Failed to log communication.' });
  }
});

// CONTACTS
router.get('/contacts', requirePermission('crm', 'view'), async (_req, res) => {
  try {
    const items = await db.query<any>(
      `SELECT ct.*, c.name AS customer_name, c.organization AS customer_org
       FROM contacts ct LEFT JOIN customers c ON c.id = ct.customer_id ORDER BY ct.full_name ASC`
    );
    res.json({ items });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load contacts.' });
  }
});

router.post('/contacts', requirePermission('crm', 'create'), async (req, res) => {
  try {
    const schema = z.object({
      customer_id: z.string().nullable().optional(),
      full_name: z.string().trim().min(2).max(160),
      title: z.string().max(120).optional(),
      email: z.string().email().or(z.literal('')).optional(),
      telephone: z.string().max(60).optional(),
      is_primary: z.boolean().optional(),
      notes: z.string().max(1000).optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid contact payload.' });
      return;
    }
    const id = newId('cnt');
    const now = new Date().toISOString();
    await db.execute(
      `INSERT INTO contacts (id, customer_id, full_name, title, email, telephone, is_primary, notes, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, parsed.data.customer_id || null, parsed.data.full_name, parsed.data.title || '', parsed.data.email || '', parsed.data.telephone || '', parsed.data.is_primary ? 1 : 0, parsed.data.notes || '', now, now]
    );
    res.status(201).json({ id });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create contact.' });
  }
});

router.delete('/contacts/:id', requirePermission('crm', 'delete'), async (req, res) => {
  try {
    await db.execute('DELETE FROM contacts WHERE id = ?', [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete contact.' });
  }
});

// LEADS
router.get('/leads', requirePermission('crm', 'view'), async (_req, res) => {
  try {
    const items = await db.query<any>('SELECT * FROM leads ORDER BY updated_at DESC');
    res.json({ items });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load leads.' });
  }
});

const leadSchema = z.object({
  name: z.string().trim().min(2).max(180),
  organization: z.string().max(180).optional(),
  email: z.string().email().or(z.literal('')).optional(),
  telephone: z.string().max(60).optional(),
  customer_type: z.enum(['Residential', 'Business', 'Educational Institution', 'Enterprise', 'Other Organization']).optional(),
  stage: z.enum(['New', 'Contacted', 'Qualified', 'Proposal Sent', 'Negotiation', 'Won', 'Lost']).optional(),
  source: z.string().max(80).optional(),
  estimated_value: z.number().min(0).optional(),
  notes: z.string().max(2000).optional(),
});

router.post('/leads', requirePermission('crm', 'create'), async (req, res) => {
  try {
    const parsed = leadSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid lead payload.' });
      return;
    }
    const d = parsed.data;
    const id = newId('led');
    const now = new Date().toISOString();
    await db.execute(
      `INSERT INTO leads (id, name, organization, email, telephone, customer_type, stage, source, estimated_value, assigned_rep_id, notes, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, d.name, d.organization || '', d.email || '', d.telephone || '', d.customer_type || 'Business', d.stage || 'New', d.source || 'Direct', d.estimated_value || 0, req.authUser!.id, d.notes || '', now, now]
    );
    await recordAudit({ req, module: 'crm', action: 'create_lead', targetType: 'lead', targetId: id, summary: `Created lead ${d.name} (${d.stage || 'New'}).` });
    res.status(201).json({ id });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create lead.' });
  }
});

router.put('/leads/:id', requirePermission('crm', 'edit'), async (req, res) => {
  try {
    const existing = await db.queryOne<any>('SELECT * FROM leads WHERE id = ?', [req.params.id]);
    if (!existing) {
      res.status(404).json({ error: 'Lead not found.' });
      return;
    }
    const parsed = leadSchema.partial().safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid lead update.' });
      return;
    }
    const d = parsed.data;
    await db.execute(
      `UPDATE leads SET name = ?, organization = ?, email = ?, telephone = ?, customer_type = ?, stage = ?, source = ?, estimated_value = ?, notes = ?, updated_at = ? WHERE id = ?`,
      [
        d.name ?? existing.name, d.organization ?? existing.organization, d.email ?? existing.email,
        d.telephone ?? existing.telephone, d.customer_type ?? existing.customer_type, d.stage ?? existing.stage,
        d.source ?? existing.source, d.estimated_value ?? existing.estimated_value, d.notes ?? existing.notes,
        new Date().toISOString(), req.params.id,
      ]
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update lead.' });
  }
});

router.post('/leads/:id/convert', requirePermission('crm', 'create'), async (req, res) => {
  try {
    const lead = await db.queryOne<any>('SELECT * FROM leads WHERE id = ?', [req.params.id]);
    if (!lead) {
      res.status(404).json({ error: 'Lead not found.' });
      return;
    }
    const settings = await db.queryOne<any>('SELECT customer_prefix FROM company_settings WHERE id = ?', ['default']);
    const code = await generateNextCode('customers', 'customer_code', settings?.customer_prefix || 'KTX-CUS');
    const cusId = newId('cus');
    const now = new Date().toISOString();
    await db.execute(
      `INSERT INTO customers (id, customer_code, name, organization, email, telephone, customer_type, account_status, assigned_rep_id, notes, communication_log_json, archived, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'Active', ?, ?, '[]', 0, ?, ?)`,
      [cusId, code, lead.name, lead.organization || '', lead.email || '', lead.telephone || '', lead.customer_type || 'Business', req.authUser!.id, lead.notes || '', now, now]
    );
    await db.execute("UPDATE leads SET stage = 'Won', converted_customer_id = ?, updated_at = ? WHERE id = ?", [cusId, now, lead.id]);
    await recordAudit({ req, module: 'crm', action: 'convert_lead', targetType: 'customer', targetId: cusId, summary: `Converted lead ${lead.name} to customer ${code}.` });
    res.status(201).json({ customer_id: cusId, customer_code: code });
  } catch (err) {
    res.status(500).json({ error: 'Failed to convert lead.' });
  }
});

// ========================
// SERVICE DESK / TICKETS
// ========================
router.get('/tickets', requirePermission('service_desk', 'view'), async (req, res) => {
  try {
    const sourceFilter = String(req.query.source || '').trim();
    const sql = `SELECT t.*, c.name AS customer_name, u.full_name AS technician_name, d.name AS department_name
                 FROM tickets t
                 LEFT JOIN customers c ON c.id = t.customer_id
                 LEFT JOIN users u ON u.id = t.assigned_technician_id
                 LEFT JOIN departments d ON d.id = t.department_id
                 ${sourceFilter ? 'WHERE t.source = ?' : ''}
                 ORDER BY t.updated_at DESC`;
    const items = await db.query<any>(sql, sourceFilter ? [sourceFilter] : []);
    res.json({ items });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load tickets.' });
  }
});

router.get('/tickets/:id', requirePermission('service_desk', 'view'), async (req, res) => {
  try {
    const ticket = await db.queryOne<any>(
      `SELECT t.*, c.name AS customer_name, c.email AS customer_email, c.telephone AS customer_telephone, c.customer_code,
              u.full_name AS technician_name, d.name AS department_name
       FROM tickets t
       LEFT JOIN customers c ON c.id = t.customer_id
       LEFT JOIN users u ON u.id = t.assigned_technician_id
       LEFT JOIN departments d ON d.id = t.department_id
       WHERE t.id = ?`,
      [req.params.id]
    );
    if (!ticket) {
      res.status(404).json({ error: 'Ticket not found.' });
      return;
    }
    res.json({
      ticket: {
        ...ticket,
        internal_notes: JSON.parse(ticket.internal_notes_json || '[]'),
        activity: JSON.parse(ticket.activity_json || '[]'),
      },
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load ticket.' });
  }
});

const ticketSchema = z.object({
  customer_id: z.string().nullable().optional(),
  subject: z.string().trim().min(3).max(240),
  description: z.string().max(5000).optional(),
  service_category: z.string().max(80).optional(),
  assigned_technician_id: z.string().nullable().optional(),
  department_id: z.string().nullable().optional(),
  priority: z.enum(['Low', 'Normal', 'High', 'Critical']).optional(),
  status: z.enum(['New', 'Assigned', 'In Progress', 'Awaiting Customer', 'Awaiting Parts', 'Escalated', 'Resolved', 'Closed', 'Cancelled']).optional(),
  due_date: z.string().nullable().optional(),
  resolution: z.string().max(3000).optional(),
});

router.post('/tickets', requirePermission('service_desk', 'create'), async (req, res) => {
  try {
    const parsed = ticketSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid ticket data.' });
      return;
    }
    const d = parsed.data;
    const settings = await db.queryOne<any>('SELECT ticket_prefix FROM company_settings WHERE id = ?', ['default']);
    const ticketNumber = await generateNextCode('tickets', 'ticket_number', settings?.ticket_prefix || 'KTX-TKT');
    const id = newId('tkt');
    const now = new Date().toISOString();
    const activity = [{ at: now, actor: req.authUser!.full_name, text: `Created ticket ${ticketNumber} (${d.priority || 'Normal'} priority).` }];

    await db.execute(
      `INSERT INTO tickets (
        id, ticket_number, customer_id, subject, description, service_category,
        assigned_technician_id, department_id, priority, status, source, due_date,
        resolution, internal_notes_json, activity_json, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Internal', ?, '', '[]', ?, ?, ?)`,
      [
        id, ticketNumber, d.customer_id || null, d.subject, d.description || '',
        d.service_category || 'KORTRIX Infrastructure', d.assigned_technician_id || req.authUser!.id,
        d.department_id || 'dept-ops', d.priority || 'Normal', d.status || 'New', d.due_date || null,
        JSON.stringify(activity), now, now,
      ]
    );
    await recordAudit({ req, module: 'service_desk', action: 'create_ticket', targetType: 'ticket', targetId: id, summary: `Opened ticket ${ticketNumber}: ${d.subject}.` });
    res.status(201).json({ id, ticket_number: ticketNumber });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create ticket.' });
  }
});

router.put('/tickets/:id', requirePermission('service_desk', 'edit'), async (req, res) => {
  try {
    const existing = await db.queryOne<any>('SELECT * FROM tickets WHERE id = ?', [req.params.id]);
    if (!existing) {
      res.status(404).json({ error: 'Ticket not found.' });
      return;
    }
    const parsed = ticketSchema.partial().safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid ticket update.' });
      return;
    }
    const d = parsed.data;
    const now = new Date().toISOString();
    const activity = JSON.parse(existing.activity_json || '[]');
    if (d.status && d.status !== existing.status) {
      activity.unshift({ at: now, actor: req.authUser!.full_name, text: `Status changed from ${existing.status} to ${d.status}.` });
    }
    if (d.priority && d.priority !== existing.priority) {
      activity.unshift({ at: now, actor: req.authUser!.full_name, text: `Priority changed to ${d.priority}.` });
    }

    await db.execute(
      `UPDATE tickets SET
        customer_id = ?, subject = ?, description = ?, service_category = ?, assigned_technician_id = ?,
        department_id = ?, priority = ?, status = ?, due_date = ?, resolution = ?, activity_json = ?, updated_at = ?
       WHERE id = ?`,
      [
        d.customer_id !== undefined ? d.customer_id : existing.customer_id,
        d.subject ?? existing.subject,
        d.description !== undefined ? d.description : existing.description,
        d.service_category ?? existing.service_category,
        d.assigned_technician_id !== undefined ? d.assigned_technician_id : existing.assigned_technician_id,
        d.department_id !== undefined ? d.department_id : existing.department_id,
        d.priority ?? existing.priority,
        d.status ?? existing.status,
        d.due_date !== undefined ? d.due_date : existing.due_date,
        d.resolution !== undefined ? d.resolution : existing.resolution,
        JSON.stringify(activity),
        now,
        req.params.id,
      ]
    );
    await recordAudit({ req, module: 'service_desk', action: 'update_ticket', targetType: 'ticket', targetId: req.params.id, summary: `Updated ticket ${existing.ticket_number} (${d.status ?? existing.status}).` });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update ticket.' });
  }
});

router.post('/tickets/:id/notes', requirePermission('service_desk', 'edit'), async (req, res) => {
  try {
    const existing = await db.queryOne<any>('SELECT * FROM tickets WHERE id = ?', [req.params.id]);
    if (!existing) {
      res.status(404).json({ error: 'Ticket not found.' });
      return;
    }
    const text = String(req.body.text || '').trim();
    if (!text) {
      res.status(400).json({ error: 'Internal note text is required.' });
      return;
    }
    const now = new Date().toISOString();
    const notes = JSON.parse(existing.internal_notes_json || '[]');
    notes.unshift({ id: newId('not'), author: req.authUser!.full_name, text, at: now });
    const activity = JSON.parse(existing.activity_json || '[]');
    activity.unshift({ at: now, actor: req.authUser!.full_name, text: 'Added internal technical note.' });
    await db.execute('UPDATE tickets SET internal_notes_json = ?, activity_json = ?, updated_at = ? WHERE id = ?', [JSON.stringify(notes), JSON.stringify(activity), now, req.params.id]);
    res.status(201).json({ internal_notes: notes, activity });
  } catch (err) {
    res.status(500).json({ error: 'Failed to add internal note.' });
  }
});

// ========================
// WORK ORDERS & APPOINTMENTS
// ========================
router.get('/work-orders', requirePermission('work_orders', 'view'), async (_req, res) => {
  try {
    const rows = await db.query<any>(
      `SELECT w.*, c.name AS customer_name, u.full_name AS technician_name, t.ticket_number
       FROM work_orders w
       LEFT JOIN customers c ON c.id = w.customer_id
       LEFT JOIN users u ON u.id = w.assigned_technician_id
       LEFT JOIN tickets t ON t.id = w.ticket_id
       ORDER BY w.created_at DESC`
    );
    res.json({ items: rows.map((r) => ({ ...r, parts_materials: JSON.parse(r.parts_materials_json || '[]') })) });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load work orders.' });
  }
});

const workOrderSchema = z.object({
  customer_id: z.string().nullable().optional(),
  ticket_id: z.string().nullable().optional(),
  service_location: z.string().max(400).optional(),
  assigned_technician_id: z.string().nullable().optional(),
  requested_services: z.string().trim().min(2).max(1000),
  scheduled_start: z.string().nullable().optional(),
  estimated_duration_mins: z.number().min(15).max(1440).optional(),
  service_instructions: z.string().max(3000).optional(),
  work_performed: z.string().max(3000).optional(),
  parts_materials: z.array(z.object({ item: z.string(), qty: z.number(), cost: z.number() })).optional(),
  labor_hours: z.number().min(0).max(500).optional(),
  completion_notes: z.string().max(3000).optional(),
  status: z.enum(['Draft', 'Scheduled', 'Dispatched', 'In Progress', 'Awaiting Parts', 'Completed', 'Cancelled']).optional(),
});

router.post('/work-orders', requirePermission('work_orders', 'create'), async (req, res) => {
  try {
    const parsed = workOrderSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid work order payload.' });
      return;
    }
    const d = parsed.data;
    const settings = await db.queryOne<any>('SELECT work_order_prefix FROM company_settings WHERE id = ?', ['default']);
    const woNumber = await generateNextCode('work_orders', 'work_order_number', settings?.work_order_prefix || 'KTX-WO');
    const id = newId('wo');
    const now = new Date().toISOString();
    await db.execute(
      `INSERT INTO work_orders (
        id, work_order_number, customer_id, ticket_id, service_location, assigned_technician_id,
        requested_services, scheduled_start, estimated_duration_mins, service_instructions,
        work_performed, parts_materials_json, labor_hours, completion_notes, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id, woNumber, d.customer_id || null, d.ticket_id || null, d.service_location || '',
        d.assigned_technician_id || req.authUser!.id, d.requested_services, d.scheduled_start || null,
        d.estimated_duration_mins || 60, d.service_instructions || '', d.work_performed || '',
        JSON.stringify(d.parts_materials || []), d.labor_hours || 0, d.completion_notes || '',
        d.status || 'Scheduled', now, now,
      ]
    );
    await recordAudit({ req, module: 'work_orders', action: 'create', targetType: 'work_order', targetId: id, summary: `Created work order ${woNumber}.` });
    res.status(201).json({ id, work_order_number: woNumber });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create work order.' });
  }
});

router.put('/work-orders/:id', requirePermission('work_orders', 'edit'), async (req, res) => {
  try {
    const existing = await db.queryOne<any>('SELECT * FROM work_orders WHERE id = ?', [req.params.id]);
    if (!existing) {
      res.status(404).json({ error: 'Work order not found.' });
      return;
    }
    const parsed = workOrderSchema.partial().safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid work order update.' });
      return;
    }
    const d = parsed.data;
    await db.execute(
      `UPDATE work_orders SET
        customer_id = ?, ticket_id = ?, service_location = ?, assigned_technician_id = ?,
        requested_services = ?, scheduled_start = ?, estimated_duration_mins = ?, service_instructions = ?,
        work_performed = ?, parts_materials_json = ?, labor_hours = ?, completion_notes = ?, status = ?, updated_at = ?
       WHERE id = ?`,
      [
        d.customer_id !== undefined ? d.customer_id : existing.customer_id,
        d.ticket_id !== undefined ? d.ticket_id : existing.ticket_id,
        d.service_location ?? existing.service_location,
        d.assigned_technician_id !== undefined ? d.assigned_technician_id : existing.assigned_technician_id,
        d.requested_services ?? existing.requested_services,
        d.scheduled_start !== undefined ? d.scheduled_start : existing.scheduled_start,
        d.estimated_duration_mins ?? existing.estimated_duration_mins,
        d.service_instructions ?? existing.service_instructions,
        d.work_performed ?? existing.work_performed,
        d.parts_materials !== undefined ? JSON.stringify(d.parts_materials) : existing.parts_materials_json,
        d.labor_hours ?? existing.labor_hours,
        d.completion_notes ?? existing.completion_notes,
        d.status ?? existing.status,
        new Date().toISOString(),
        req.params.id,
      ]
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update work order.' });
  }
});

router.get('/appointments', requirePermission('work_orders', 'view'), async (_req, res) => {
  try {
    const items = await db.query<any>(
      `SELECT a.*, c.name AS customer_name, u.full_name AS technician_name
       FROM appointments a
       LEFT JOIN customers c ON c.id = a.customer_id
       LEFT JOIN users u ON u.id = a.assigned_technician_id
       ORDER BY a.start_time ASC`
    );
    res.json({ items });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load appointments.' });
  }
});

router.post('/appointments', requirePermission('work_orders', 'create'), async (req, res) => {
  try {
    const schema = z.object({
      title: z.string().trim().min(2).max(200),
      customer_id: z.string().nullable().optional(),
      work_order_id: z.string().nullable().optional(),
      assigned_technician_id: z.string().nullable().optional(),
      start_time: z.string().min(10),
      end_time: z.string().min(10),
      location: z.string().max(400).optional(),
      appointment_type: z.string().max(60).optional(),
      status: z.enum(['Scheduled', 'Completed', 'Rescheduled', 'Cancelled']).optional(),
      notes: z.string().max(2000).optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid appointment payload.' });
      return;
    }
    const d = parsed.data;
    const id = newId('apt');
    const now = new Date().toISOString();
    await db.execute(
      `INSERT INTO appointments (id, title, customer_id, work_order_id, assigned_technician_id, start_time, end_time, location, appointment_type, status, notes, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, d.title, d.customer_id || null, d.work_order_id || null, d.assigned_technician_id || req.authUser!.id, d.start_time, d.end_time, d.location || '', d.appointment_type || 'On-Site Visit', d.status || 'Scheduled', d.notes || '', now, now]
    );
    await recordAudit({ req, module: 'appointments', action: 'create', targetType: 'appointment', targetId: id, summary: `Scheduled appointment "${d.title}".` });
    res.status(201).json({ id });
  } catch (err) {
    res.status(500).json({ error: 'Failed to schedule appointment.' });
  }
});

router.put('/appointments/:id', requirePermission('work_orders', 'edit'), async (req, res) => {
  try {
    const existing = await db.queryOne<any>('SELECT * FROM appointments WHERE id = ?', [req.params.id]);
    if (!existing) {
      res.status(404).json({ error: 'Appointment not found.' });
      return;
    }
    const schema = z.object({
      title: z.string().trim().min(2).max(200).optional(),
      start_time: z.string().min(10).max(40).optional(),
      end_time: z.string().min(10).max(40).optional(),
      location: z.string().max(400).optional(),
      status: z.enum(['Scheduled', 'Completed', 'Rescheduled', 'Cancelled']).optional(),
      assigned_technician_id: z.string().nullable().optional(),
      notes: z.string().max(2000).optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid appointment update.' });
      return;
    }
    const d = parsed.data;
    await db.execute(
      `UPDATE appointments SET title = ?, start_time = ?, end_time = ?, location = ?, status = ?, assigned_technician_id = ?, notes = ?, updated_at = ? WHERE id = ?`,
      [
        d.title ?? existing.title,
        d.start_time ?? existing.start_time,
        d.end_time ?? existing.end_time,
        d.location ?? existing.location,
        d.status ?? existing.status,
        d.assigned_technician_id !== undefined ? d.assigned_technician_id : existing.assigned_technician_id,
        d.notes ?? existing.notes,
        new Date().toISOString(),
        req.params.id,
      ]
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update appointment.' });
  }
});

// ========================
// IT ASSET MANAGEMENT (ITAM)
// ========================
router.get('/assets', requirePermission('assets', 'view'), async (_req, res) => {
  try {
    const rows = await db.query<any>(
      `SELECT a.*, c.name AS customer_name
       FROM assets a LEFT JOIN customers c ON c.id = a.customer_id
       ORDER BY a.created_at DESC`
    );
    res.json({
      items: rows.map((r) => ({
        ...r,
        custody_chain: JSON.parse(r.custody_chain_json || '[]'),
        activity: JSON.parse(r.activity_json || '[]'),
      })),
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load IT assets.' });
  }
});

const assetSchema = z.object({
  asset_tag: z.string().max(80).optional(),
  serial_number: z.string().max(120).optional(),
  manufacturer: z.string().max(100).optional(),
  model: z.string().trim().min(1).max(140),
  category: z.enum(['Computer', 'Laptop', 'Server', 'Monitor', 'Networking Equipment', 'Mobile Device', 'Storage Media', 'Peripheral']),
  processor: z.string().max(120).optional(),
  memory: z.string().max(80).optional(),
  storage: z.string().max(80).optional(),
  condition_grade: z.string().max(40).optional(),
  ownership: z.enum(['Company-Owned', 'Customer-Owned', 'Lifecycle Intake']),
  customer_id: z.string().nullable().optional(),
  physical_location: z.string().max(160).optional(),
  acquisition_date: z.string().nullable().optional(),
  warranty_expiration: z.string().nullable().optional(),
  status: z.enum(['In Stock', 'Deployed', 'Assigned', 'Under Evaluation', 'Under Repair', 'Refurbished', 'Pending Retirement', 'Retired', 'Disposed']).optional(),
  notes: z.string().max(3000).optional(),
});

router.post('/assets', requirePermission('assets', 'create'), async (req, res) => {
  try {
    const parsed = assetSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid asset payload.' });
      return;
    }
    const d = parsed.data;
    const settings = await db.queryOne<any>('SELECT asset_prefix FROM company_settings WHERE id = ?', ['default']);
    const code = await generateNextCode('assets', 'asset_code', settings?.asset_prefix || 'KTX-AST');
    const id = newId('ast');
    const now = new Date().toISOString();
    await db.execute(
      `INSERT INTO assets (
        id, asset_code, asset_tag, serial_number, manufacturer, model, category,
        processor, memory, storage, condition_grade, ownership, customer_id,
        physical_location, acquisition_date, warranty_expiration, status, notes,
        custody_chain_json, activity_json, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '[]', ?, ?, ?)`,
      [
        id, code, d.asset_tag || code, d.serial_number || '', d.manufacturer || '', d.model, d.category,
        d.processor || '', d.memory || '', d.storage || '', d.condition_grade || 'Unassessed',
        d.ownership, d.customer_id || null, d.physical_location || '', d.acquisition_date || null,
        d.warranty_expiration || null, d.status || 'In Stock', d.notes || '',
        JSON.stringify([{ at: now, actor: req.authUser!.full_name, text: `Registered asset ${code}.` }]),
        now, now,
      ]
    );
    await recordAudit({ req, module: 'assets', action: 'create', targetType: 'asset', targetId: id, summary: `Registered IT asset ${code} (${d.manufacturer || ''} ${d.model}).` });
    res.status(201).json({ id, asset_code: code });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create asset.' });
  }
});

router.put('/assets/:id', requirePermission('assets', 'edit'), async (req, res) => {
  try {
    const existing = await db.queryOne<any>('SELECT * FROM assets WHERE id = ?', [req.params.id]);
    if (!existing) {
      res.status(404).json({ error: 'Asset not found.' });
      return;
    }
    const parsed = assetSchema.partial().safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid asset update.' });
      return;
    }
    const d = parsed.data;
    const now = new Date().toISOString();
    const activity = JSON.parse(existing.activity_json || '[]');
    if (d.status && d.status !== existing.status) {
      activity.unshift({ at: now, actor: req.authUser!.full_name, text: `Status updated from ${existing.status} to ${d.status}.` });
    }
    await db.execute(
      `UPDATE assets SET
        asset_tag = ?, serial_number = ?, manufacturer = ?, model = ?, category = ?,
        processor = ?, memory = ?, storage = ?, condition_grade = ?, ownership = ?,
        customer_id = ?, physical_location = ?, acquisition_date = ?, warranty_expiration = ?,
        status = ?, notes = ?, activity_json = ?, updated_at = ?
       WHERE id = ?`,
      [
        d.asset_tag ?? existing.asset_tag, d.serial_number ?? existing.serial_number,
        d.manufacturer ?? existing.manufacturer, d.model ?? existing.model, d.category ?? existing.category,
        d.processor ?? existing.processor, d.memory ?? existing.memory, d.storage ?? existing.storage,
        d.condition_grade ?? existing.condition_grade, d.ownership ?? existing.ownership,
        d.customer_id !== undefined ? d.customer_id : existing.customer_id,
        d.physical_location ?? existing.physical_location,
        d.acquisition_date !== undefined ? d.acquisition_date : existing.acquisition_date,
        d.warranty_expiration !== undefined ? d.warranty_expiration : existing.warranty_expiration,
        d.status ?? existing.status, d.notes ?? existing.notes, JSON.stringify(activity), now, req.params.id,
      ]
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update asset.' });
  }
});

router.post('/assets/:id/custody', requirePermission('assets', 'edit'), async (req, res) => {
  try {
    const existing = await db.queryOne<any>('SELECT * FROM assets WHERE id = ?', [req.params.id]);
    if (!existing) {
      res.status(404).json({ error: 'Asset not found.' });
      return;
    }
    const schema = z.object({
      event_type: z.enum(['Intake Received', 'Assigned to User', 'Transferred', 'Sanitization Coordinated', 'Partner Recycling Transfer', 'Disposed']),
      custodian: z.string().trim().min(2).max(160),
      location: z.string().max(160).optional(),
      notes: z.string().max(1000).optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid chain-of-custody entry.' });
      return;
    }
    const now = new Date().toISOString();
    const custody = JSON.parse(existing.custody_chain_json || '[]');
    custody.unshift({ id: newId('coc'), ...parsed.data, recorded_by: req.authUser!.full_name, at: now });
    await db.execute('UPDATE assets SET custody_chain_json = ?, updated_at = ? WHERE id = ?', [JSON.stringify(custody), now, req.params.id]);
    await recordAudit({ req, module: 'assets', action: 'custody_event', targetType: 'asset', targetId: existing.id, summary: `Recorded ${parsed.data.event_type} for ${existing.asset_code}.` });
    res.status(201).json({ custody_chain: custody });
  } catch (err) {
    res.status(500).json({ error: 'Failed to record chain-of-custody event.' });
  }
});

router.post('/assets/import', requirePermission('assets', 'create'), async (req, res) => {
  try {
    const rows = Array.isArray(req.body.rows) ? req.body.rows.slice(0, 200) : [];
    const settings = await db.queryOne<any>('SELECT asset_prefix FROM company_settings WHERE id = ?', ['default']);
    const prefix = settings?.asset_prefix || 'KTX-AST';
    let imported = 0;
    const now = new Date().toISOString();
    for (const r of rows) {
      if (!r?.model) continue;
      const code = await generateNextCode('assets', 'asset_code', prefix);
      await db.execute(
        `INSERT INTO assets (id, asset_code, asset_tag, serial_number, manufacturer, model, category, ownership, status, physical_location, notes, custody_chain_json, activity_json, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '[]', '[]', ?, ?)`,
        [
          newId('ast'), code, String(r.asset_tag || code), String(r.serial_number || ''),
          String(r.manufacturer || ''), String(r.model), String(r.category || 'Laptop'),
          String(r.ownership || 'Company-Owned'), String(r.status || 'In Stock'),
          String(r.physical_location || ''), String(r.notes || ''), now, now,
        ]
      );
      imported++;
    }
    await recordAudit({ req, module: 'assets', action: 'csv_import', summary: `Imported ${imported} IT assets via CSV.` });
    res.status(201).json({ imported });
  } catch (err) {
    res.status(500).json({ error: 'Failed to import assets.' });
  }
});

// ========================
// FINANCE: QUOTATIONS, INVOICES, EXPENSES, SUMMARY
// ========================
const lineItemSchema = z.object({
  description: z.string().trim().min(1).max(300),
  service_id: z.string().nullable().optional(),
  quantity: z.number().min(0.01),
  unit_price: z.number().min(0),
});

router.get('/quotations', requirePermission('finance', 'view'), async (_req, res) => {
  try {
    const rows = await db.query<any>(
      `SELECT q.*, c.name AS customer_name, c.organization AS customer_org, c.email AS customer_email, c.billing_address
       FROM quotations q LEFT JOIN customers c ON c.id = q.customer_id ORDER BY q.created_at DESC`
    );
    res.json({ items: rows.map((r) => ({ ...r, line_items: JSON.parse(r.line_items_json || '[]') })) });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load quotations.' });
  }
});

router.post('/quotations', requirePermission('finance', 'create'), async (req, res) => {
  try {
    const schema = z.object({
      customer_id: z.string().nullable().optional(),
      line_items: z.array(lineItemSchema).min(1),
      discount_amount: z.number().min(0).optional(),
      tax_rate: z.number().min(0).max(50).optional(),
      expiration_date: z.string().nullable().optional(),
      notes: z.string().max(2000).optional(),
      terms: z.string().max(2000).optional(),
      status: z.enum(['Draft', 'Sent', 'Accepted', 'Rejected', 'Expired']).optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid quotation.' });
      return;
    }
    const d = parsed.data;
    const subtotal = d.line_items.reduce((acc, item) => acc + item.quantity * item.unit_price, 0);
    const discount = Math.min(subtotal, d.discount_amount || 0);
    const taxable = Math.max(0, subtotal - discount);
    const taxRate = d.tax_rate || 0;
    const taxAmount = Number(((taxable * taxRate) / 100).toFixed(2));
    const total = Number((taxable + taxAmount).toFixed(2));

    const settings = await db.queryOne<any>('SELECT quote_prefix FROM company_settings WHERE id = ?', ['default']);
    const quoteNumber = await generateNextCode('quotations', 'quote_number', settings?.quote_prefix || 'KTX-QUO');
    const id = newId('quo');
    const now = new Date().toISOString();
    await db.execute(
      `INSERT INTO quotations (
        id, quote_number, customer_id, line_items_json, subtotal, discount_amount, tax_rate, tax_amount,
        total, expiration_date, notes, terms, status, created_by, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id, quoteNumber, d.customer_id || null, JSON.stringify(d.line_items), subtotal, discount, taxRate, taxAmount,
        total, d.expiration_date || null, d.notes || '', d.terms || 'Quote valid for 30 days. Payment due upon completion unless otherwise agreed.',
        d.status || 'Draft', req.authUser!.id, now, now,
      ]
    );
    await recordAudit({ req, module: 'finance', action: 'create_quotation', targetType: 'quotation', targetId: id, summary: `Created quotation ${quoteNumber} ($${total.toFixed(2)}).` });
    res.status(201).json({ id, quote_number: quoteNumber });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create quotation.' });
  }
});

router.put('/quotations/:id', requirePermission('finance', 'edit'), async (req, res) => {
  try {
    const existing = await db.queryOne<any>('SELECT * FROM quotations WHERE id = ?', [req.params.id]);
    if (!existing) {
      res.status(404).json({ error: 'Quotation not found.' });
      return;
    }
    const schema = z.object({
      status: z.enum(['Draft', 'Sent', 'Accepted', 'Rejected', 'Expired']).optional(),
      notes: z.string().max(2000).optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid quotation update.' });
      return;
    }
    const status = parsed.data.status || existing.status;
    await db.execute('UPDATE quotations SET status = ?, notes = ?, updated_at = ? WHERE id = ?', [status, parsed.data.notes ?? existing.notes, new Date().toISOString(), req.params.id]);
    await recordAudit({ req, module: 'finance', action: 'update_quotation', targetType: 'quotation', targetId: req.params.id, summary: `Updated quotation ${existing.quote_number} to ${status}.` });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update quotation.' });
  }
});

router.post('/quotations/:id/convert-invoice', requirePermission('finance', 'create'), async (req, res) => {
  try {
    const quote = await db.queryOne<any>('SELECT * FROM quotations WHERE id = ?', [req.params.id]);
    if (!quote) {
      res.status(404).json({ error: 'Quotation not found.' });
      return;
    }
    const settings = await db.queryOne<any>('SELECT invoice_prefix FROM company_settings WHERE id = ?', ['default']);
    const invoiceNumber = await generateNextCode('invoices', 'invoice_number', settings?.invoice_prefix || 'KTX-INV');
    const id = newId('inv');
    const now = new Date().toISOString();
    const dueDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    await db.execute(
      `INSERT INTO invoices (
        id, invoice_number, customer_id, quotation_id, line_items_json, subtotal, tax_rate, tax_amount,
        total, due_date, payment_status, payment_reference, notes, created_by, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Unpaid', '', ?, ?, ?, ?)`,
      [id, invoiceNumber, quote.customer_id, quote.id, quote.line_items_json, quote.subtotal, quote.tax_rate, quote.tax_amount, quote.total, dueDate, quote.notes || '', req.authUser!.id, now, now]
    );
    await db.execute("UPDATE quotations SET status = 'Accepted', updated_at = ? WHERE id = ?", [now, quote.id]);
    await recordAudit({ req, module: 'finance', action: 'convert_quote_to_invoice', targetType: 'invoice', targetId: id, summary: `Converted ${quote.quote_number} to invoice ${invoiceNumber}.` });
    res.status(201).json({ id, invoice_number: invoiceNumber });
  } catch (err) {
    res.status(500).json({ error: 'Failed to convert quotation to invoice.' });
  }
});

router.get('/invoices', requirePermission('finance', 'view'), async (_req, res) => {
  try {
    const rows = await db.query<any>(
      `SELECT i.*, c.name AS customer_name, c.organization AS customer_org, c.billing_address
       FROM invoices i LEFT JOIN customers c ON c.id = i.customer_id ORDER BY i.created_at DESC`
    );
    res.json({ items: rows.map((r) => ({ ...r, line_items: JSON.parse(r.line_items_json || '[]') })) });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load invoices.' });
  }
});

router.post('/invoices', requirePermission('finance', 'create'), async (req, res) => {
  try {
    const schema = z.object({
      customer_id: z.string().nullable().optional(),
      work_order_id: z.string().nullable().optional(),
      line_items: z.array(lineItemSchema).min(1),
      tax_rate: z.number().min(0).max(50).optional(),
      due_date: z.string().nullable().optional(),
      notes: z.string().max(2000).optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid invoice payload.' });
      return;
    }
    const d = parsed.data;
    const subtotal = d.line_items.reduce((acc, item) => acc + item.quantity * item.unit_price, 0);
    const taxRate = d.tax_rate || 0;
    const taxAmount = Number(((subtotal * taxRate) / 100).toFixed(2));
    const total = Number((subtotal + taxAmount).toFixed(2));

    const settings = await db.queryOne<any>('SELECT invoice_prefix FROM company_settings WHERE id = ?', ['default']);
    const invoiceNumber = await generateNextCode('invoices', 'invoice_number', settings?.invoice_prefix || 'KTX-INV');
    const id = newId('inv');
    const now = new Date().toISOString();
    await db.execute(
      `INSERT INTO invoices (
        id, invoice_number, customer_id, work_order_id, line_items_json, subtotal, tax_rate, tax_amount,
        total, due_date, payment_status, payment_reference, notes, created_by, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Unpaid', '', ?, ?, ?, ?)`,
      [id, invoiceNumber, d.customer_id || null, d.work_order_id || null, JSON.stringify(d.line_items), subtotal, taxRate, taxAmount, total, d.due_date || null, d.notes || '', req.authUser!.id, now, now]
    );
    await recordAudit({ req, module: 'finance', action: 'create_invoice', targetType: 'invoice', targetId: id, summary: `Created invoice ${invoiceNumber} ($${total.toFixed(2)}).` });
    res.status(201).json({ id, invoice_number: invoiceNumber });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create invoice.' });
  }
});

router.put('/invoices/:id', requirePermission('finance', 'edit'), async (req, res) => {
  try {
    const existing = await db.queryOne<any>('SELECT * FROM invoices WHERE id = ?', [req.params.id]);
    if (!existing) {
      res.status(404).json({ error: 'Invoice not found.' });
      return;
    }
    const schema = z.object({
      payment_status: z.enum(['Unpaid', 'Partial', 'Paid', 'Overdue', 'Void']).optional(),
      payment_reference: z.string().max(160).optional(),
      notes: z.string().max(2000).optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid invoice update.' });
      return;
    }
    const status = parsed.data.payment_status || existing.payment_status;
    const now = new Date().toISOString();
    const paidAt = status === 'Paid' ? (existing.paid_at || now) : null;
    await db.execute(
      'UPDATE invoices SET payment_status = ?, payment_reference = ?, paid_at = ?, notes = ?, updated_at = ? WHERE id = ?',
      [status, parsed.data.payment_reference ?? existing.payment_reference, paidAt, parsed.data.notes ?? existing.notes, now, req.params.id]
    );
    await recordAudit({ req, module: 'finance', action: 'update_invoice', targetType: 'invoice', targetId: req.params.id, summary: `Marked invoice ${existing.invoice_number} as ${status}.` });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update invoice.' });
  }
});

router.get('/expenses', requirePermission('finance', 'view'), async (_req, res) => {
  try {
    const items = await db.query<any>('SELECT * FROM expenses ORDER BY expense_date DESC, created_at DESC');
    res.json({ items });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load expenses.' });
  }
});

router.post('/expenses', requirePermission('finance', 'create'), async (req, res) => {
  try {
    const schema = z.object({
      vendor: z.string().trim().min(1).max(160),
      category: z.string().trim().min(1).max(80),
      amount: z.number().min(0.01),
      expense_date: z.string().min(8),
      description: z.string().max(1000).optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid expense record.' });
      return;
    }
    const d = parsed.data;
    const id = newId('exp');
    const now = new Date().toISOString();
    await db.execute(
      `INSERT INTO expenses (id, vendor, category, amount, expense_date, description, created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, d.vendor, d.category, d.amount, d.expense_date, d.description || '', req.authUser!.id, now, now]
    );
    await recordAudit({ req, module: 'finance', action: 'create_expense', targetType: 'expense', targetId: id, summary: `Recorded expense of $${d.amount.toFixed(2)} to ${d.vendor}.` });
    res.status(201).json({ id });
  } catch (err) {
    res.status(500).json({ error: 'Failed to record expense.' });
  }
});

router.delete('/expenses/:id', requirePermission('finance', 'delete'), async (req, res) => {
  try {
    await db.execute('DELETE FROM expenses WHERE id = ?', [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete expense.' });
  }
});

router.get('/finance/summary', requirePermission('finance', 'view'), async (_req, res) => {
  try {
    const [paidInv, unpaidInv, quotesOpen, totalExp] = await Promise.all([
      db.queryOne<any>("SELECT COALESCE(SUM(total), 0) AS total, COUNT(*) AS cnt FROM invoices WHERE payment_status = 'Paid'"),
      db.queryOne<any>("SELECT COALESCE(SUM(total), 0) AS total, COUNT(*) AS cnt FROM invoices WHERE payment_status IN ('Unpaid', 'Partial', 'Overdue')"),
      db.queryOne<any>("SELECT COALESCE(SUM(total), 0) AS total, COUNT(*) AS cnt FROM quotations WHERE status IN ('Draft', 'Sent')"),
      db.queryOne<any>('SELECT COALESCE(SUM(amount), 0) AS total, COUNT(*) AS cnt FROM expenses'),
    ]);
    const revenue = Number(paidInv?.total || 0);
    const expenses = Number(totalExp?.total || 0);
    res.json({
      recordedRevenue: revenue,
      paidInvoicesCount: Number(paidInv?.cnt || 0),
      outstandingReceivables: Number(unpaidInv?.total || 0),
      outstandingInvoicesCount: Number(unpaidInv?.cnt || 0),
      openQuotesValue: Number(quotesOpen?.total || 0),
      openQuotesCount: Number(quotesOpen?.cnt || 0),
      totalExpenses: expenses,
      expensesCount: Number(totalExp?.cnt || 0),
      netRecordedPosition: Number((revenue - expenses).toFixed(2)),
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to compute financial summary.' });
  }
});

export default router;
