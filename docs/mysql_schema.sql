-- KORTRIX ONE — Complete MySQL / MariaDB Schema & Corporate Seed (cPanel phpMyAdmin Ready)
-- Import this file in cPanel phpMyAdmin to create all 23 tables and idempotently seed
-- the Owner account (dylan@kortrix.com), roles, departments, services, and launch roadmap.
-- Note: On first server boot, KORTRIX ONE also auto-seeds and hashes OWNER_ADMIN_PASSCODE.

CREATE TABLE IF NOT EXISTS departments (
  id VARCHAR(64) PRIMARY KEY,
  name VARCHAR(150) NOT NULL UNIQUE,
  code VARCHAR(32) NOT NULL UNIQUE,
  description TEXT,
  head_user_id VARCHAR(64),
  active TINYINT(1) DEFAULT 1,
  created_at VARCHAR(40) NOT NULL,
  updated_at VARCHAR(40) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS roles (
  id VARCHAR(64) PRIMARY KEY,
  name VARCHAR(100) NOT NULL UNIQUE,
  description TEXT,
  is_system TINYINT(1) DEFAULT 1,
  permissions_json LONGTEXT NOT NULL,
  created_at VARCHAR(40) NOT NULL,
  updated_at VARCHAR(40) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS users (
  id VARCHAR(64) PRIMARY KEY,
  email VARCHAR(190) NOT NULL UNIQUE,
  full_name VARCHAR(160) NOT NULL,
  position VARCHAR(160) DEFAULT '',
  department_id VARCHAR(64),
  role_id VARCHAR(64) NOT NULL,
  employment_classification VARCHAR(80) DEFAULT 'Founder / Principal',
  responsibilities TEXT,
  password_hash VARCHAR(255),
  entra_oid VARCHAR(128),
  status VARCHAR(32) DEFAULT 'Active',
  last_login_at VARCHAR(40),
  created_at VARCHAR(40) NOT NULL,
  updated_at VARCHAR(40) NOT NULL,
  INDEX idx_users_role (role_id),
  INDEX idx_users_dept (department_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS sessions (
  token_hash VARCHAR(128) PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL,
  ip_address VARCHAR(64),
  user_agent VARCHAR(255),
  expires_at VARCHAR(40) NOT NULL,
  created_at VARCHAR(40) NOT NULL,
  INDEX idx_sessions_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS company_settings (
  id VARCHAR(64) PRIMARY KEY,
  company_name VARCHAR(160) NOT NULL,
  legal_status VARCHAR(160) NOT NULL DEFAULT 'Pre-Formation (LLC Registration Pending)',
  website VARCHAR(255) NOT NULL,
  affiliation VARCHAR(160) NOT NULL,
  primary_email VARCHAR(190) NOT NULL,
  telephone VARCHAR(60) NOT NULL,
  region VARCHAR(120) NOT NULL,
  timezone VARCHAR(80) NOT NULL,
  currency VARCHAR(16) NOT NULL,
  brand_color VARCHAR(16) NOT NULL,
  logo_data_url LONGTEXT,
  business_address TEXT,
  mailing_address TEXT,
  tax_rate DECIMAL(6,3) DEFAULT 0,
  tax_label VARCHAR(80) DEFAULT 'NC Sales Tax',
  customer_prefix VARCHAR(32) DEFAULT 'KTX-CUS',
  ticket_prefix VARCHAR(32) DEFAULT 'KTX-TKT',
  work_order_prefix VARCHAR(32) DEFAULT 'KTX-WO',
  asset_prefix VARCHAR(32) DEFAULT 'KTX-AST',
  quote_prefix VARCHAR(32) DEFAULT 'KTX-QUO',
  invoice_prefix VARCHAR(32) DEFAULT 'KTX-INV',
  document_prefix VARCHAR(32) DEFAULT 'KTX-DOC',
  business_hours_json TEXT,
  notification_prefs_json TEXT,
  asset_grading_json TEXT,
  default_theme VARCHAR(16) DEFAULT 'light',
  updated_at VARCHAR(40) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS customers (
  id VARCHAR(64) PRIMARY KEY,
  customer_code VARCHAR(40) NOT NULL UNIQUE,
  name VARCHAR(180) NOT NULL,
  organization VARCHAR(180) DEFAULT '',
  email VARCHAR(190) DEFAULT '',
  telephone VARCHAR(60) DEFAULT '',
  billing_address TEXT,
  service_address TEXT,
  customer_type VARCHAR(60) NOT NULL DEFAULT 'Business',
  account_status VARCHAR(40) NOT NULL DEFAULT 'Active',
  assigned_rep_id VARCHAR(64),
  notes TEXT,
  communication_log_json LONGTEXT,
  archived TINYINT(1) DEFAULT 0,
  created_at VARCHAR(40) NOT NULL,
  updated_at VARCHAR(40) NOT NULL,
  INDEX idx_customers_type (customer_type),
  INDEX idx_customers_status (account_status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS contacts (
  id VARCHAR(64) PRIMARY KEY,
  customer_id VARCHAR(64),
  full_name VARCHAR(160) NOT NULL,
  title VARCHAR(120) DEFAULT '',
  email VARCHAR(190) DEFAULT '',
  telephone VARCHAR(60) DEFAULT '',
  is_primary TINYINT(1) DEFAULT 0,
  notes TEXT,
  created_at VARCHAR(40) NOT NULL,
  updated_at VARCHAR(40) NOT NULL,
  INDEX idx_contacts_customer (customer_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS leads (
  id VARCHAR(64) PRIMARY KEY,
  name VARCHAR(180) NOT NULL,
  organization VARCHAR(180) DEFAULT '',
  email VARCHAR(190) DEFAULT '',
  telephone VARCHAR(60) DEFAULT '',
  customer_type VARCHAR(60) DEFAULT 'Business',
  stage VARCHAR(40) NOT NULL DEFAULT 'New',
  source VARCHAR(80) DEFAULT 'Direct',
  estimated_value DECIMAL(12,2) DEFAULT 0,
  assigned_rep_id VARCHAR(64),
  notes TEXT,
  converted_customer_id VARCHAR(64),
  created_at VARCHAR(40) NOT NULL,
  updated_at VARCHAR(40) NOT NULL,
  INDEX idx_leads_stage (stage)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS services (
  id VARCHAR(64) PRIMARY KEY,
  service_code VARCHAR(40) NOT NULL UNIQUE,
  name VARCHAR(180) NOT NULL,
  division VARCHAR(80) NOT NULL,
  description TEXT,
  included_work TEXT,
  exclusions TEXT,
  pricing_model VARCHAR(40) NOT NULL DEFAULT 'Custom Quote',
  price DECIMAL(12,2) NULL,
  estimated_duration VARCHAR(80) DEFAULT '',
  delivery_mode VARCHAR(60) NOT NULL DEFAULT 'On-Site & Remote',
  tax_classification VARCHAR(80) NOT NULL DEFAULT 'Taxable Service',
  active TINYINT(1) DEFAULT 1,
  publication_status VARCHAR(32) NOT NULL DEFAULT 'Draft',
  created_at VARCHAR(40) NOT NULL,
  updated_at VARCHAR(40) NOT NULL,
  INDEX idx_services_division (division)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS tickets (
  id VARCHAR(64) PRIMARY KEY,
  ticket_number VARCHAR(40) NOT NULL UNIQUE,
  customer_id VARCHAR(64),
  requester_name VARCHAR(160) DEFAULT '',
  requester_email VARCHAR(190) DEFAULT '',
  subject VARCHAR(240) NOT NULL,
  description TEXT,
  service_category VARCHAR(80) DEFAULT 'Infrastructure',
  assigned_technician_id VARCHAR(64),
  department_id VARCHAR(64),
  priority VARCHAR(32) NOT NULL DEFAULT 'Normal',
  status VARCHAR(40) NOT NULL DEFAULT 'New',
  source VARCHAR(40) NOT NULL DEFAULT 'Internal',
  due_date VARCHAR(40),
  resolution TEXT,
  internal_notes_json LONGTEXT,
  activity_json LONGTEXT,
  created_at VARCHAR(40) NOT NULL,
  updated_at VARCHAR(40) NOT NULL,
  INDEX idx_tickets_status (status),
  INDEX idx_tickets_customer (customer_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS work_orders (
  id VARCHAR(64) PRIMARY KEY,
  work_order_number VARCHAR(40) NOT NULL UNIQUE,
  customer_id VARCHAR(64),
  ticket_id VARCHAR(64),
  service_location TEXT,
  assigned_technician_id VARCHAR(64),
  requested_services TEXT NOT NULL,
  scheduled_start VARCHAR(40),
  estimated_duration_mins INT DEFAULT 60,
  service_instructions TEXT,
  work_performed TEXT,
  parts_materials_json LONGTEXT,
  labor_hours DECIMAL(8,2) DEFAULT 0,
  completion_notes TEXT,
  status VARCHAR(40) NOT NULL DEFAULT 'Scheduled',
  created_at VARCHAR(40) NOT NULL,
  updated_at VARCHAR(40) NOT NULL,
  INDEX idx_wo_customer (customer_id),
  INDEX idx_wo_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS appointments (
  id VARCHAR(64) PRIMARY KEY,
  title VARCHAR(200) NOT NULL,
  customer_id VARCHAR(64),
  work_order_id VARCHAR(64),
  assigned_technician_id VARCHAR(64),
  start_time VARCHAR(40) NOT NULL,
  end_time VARCHAR(40) NOT NULL,
  location TEXT,
  appointment_type VARCHAR(60) DEFAULT 'On-Site Visit',
  status VARCHAR(40) NOT NULL DEFAULT 'Scheduled',
  notes TEXT,
  created_at VARCHAR(40) NOT NULL,
  updated_at VARCHAR(40) NOT NULL,
  INDEX idx_appt_start (start_time)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS assets (
  id VARCHAR(64) PRIMARY KEY,
  asset_code VARCHAR(40) NOT NULL UNIQUE,
  asset_tag VARCHAR(80) DEFAULT '',
  serial_number VARCHAR(120) DEFAULT '',
  manufacturer VARCHAR(100) DEFAULT '',
  model VARCHAR(140) DEFAULT '',
  category VARCHAR(60) NOT NULL DEFAULT 'Laptop',
  processor VARCHAR(120) DEFAULT '',
  memory VARCHAR(80) DEFAULT '',
  storage VARCHAR(80) DEFAULT '',
  condition_grade VARCHAR(40) DEFAULT 'Unassessed',
  ownership VARCHAR(40) NOT NULL DEFAULT 'Company-Owned',
  customer_id VARCHAR(64),
  physical_location VARCHAR(160) DEFAULT '',
  acquisition_date VARCHAR(40),
  warranty_expiration VARCHAR(40),
  status VARCHAR(40) NOT NULL DEFAULT 'In Stock',
  notes TEXT,
  custody_chain_json LONGTEXT,
  activity_json LONGTEXT,
  created_at VARCHAR(40) NOT NULL,
  updated_at VARCHAR(40) NOT NULL,
  INDEX idx_assets_status (status),
  INDEX idx_assets_customer (customer_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS document_folders (
  id VARCHAR(64) PRIMARY KEY,
  name VARCHAR(180) NOT NULL,
  category VARCHAR(100) NOT NULL,
  parent_id VARCHAR(64),
  allowed_departments_json TEXT,
  created_by VARCHAR(64),
  created_at VARCHAR(40) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS documents (
  id VARCHAR(64) PRIMARY KEY,
  document_code VARCHAR(40) NOT NULL UNIQUE,
  title VARCHAR(200) NOT NULL,
  file_name VARCHAR(255) NOT NULL,
  stored_name VARCHAR(255) NOT NULL,
  mime_type VARCHAR(120) NOT NULL,
  file_size BIGINT NOT NULL,
  category VARCHAR(100) NOT NULL,
  folder_id VARCHAR(64),
  customer_id VARCHAR(64),
  description TEXT,
  tags_json TEXT,
  allowed_departments_json TEXT,
  version INT NOT NULL DEFAULT 1,
  versions_json LONGTEXT,
  uploaded_by VARCHAR(64),
  archived TINYINT(1) DEFAULT 0,
  created_at VARCHAR(40) NOT NULL,
  updated_at VARCHAR(40) NOT NULL,
  INDEX idx_docs_category (category)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS projects (
  id VARCHAR(64) PRIMARY KEY,
  name VARCHAR(200) NOT NULL,
  code VARCHAR(40) NOT NULL UNIQUE,
  description TEXT,
  category VARCHAR(60) DEFAULT 'Corporate',
  status VARCHAR(40) NOT NULL DEFAULT 'Active',
  owner_id VARCHAR(64),
  start_date VARCHAR(40),
  target_date VARCHAR(40),
  created_at VARCHAR(40) NOT NULL,
  updated_at VARCHAR(40) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS tasks (
  id VARCHAR(64) PRIMARY KEY,
  project_id VARCHAR(64),
  title VARCHAR(240) NOT NULL,
  description TEXT,
  status VARCHAR(40) NOT NULL DEFAULT 'Pending',
  priority VARCHAR(32) NOT NULL DEFAULT 'Normal',
  assigned_user_id VARCHAR(64),
  due_date VARCHAR(40),
  dependencies_json TEXT,
  subtasks_json LONGTEXT,
  notes TEXT,
  sort_order INT DEFAULT 0,
  completed_at VARCHAR(40),
  created_at VARCHAR(40) NOT NULL,
  updated_at VARCHAR(40) NOT NULL,
  INDEX idx_tasks_project (project_id),
  INDEX idx_tasks_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS quotations (
  id VARCHAR(64) PRIMARY KEY,
  quote_number VARCHAR(40) NOT NULL UNIQUE,
  customer_id VARCHAR(64),
  line_items_json LONGTEXT NOT NULL,
  subtotal DECIMAL(12,2) NOT NULL DEFAULT 0,
  discount_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  tax_rate DECIMAL(6,3) NOT NULL DEFAULT 0,
  tax_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  total DECIMAL(12,2) NOT NULL DEFAULT 0,
  expiration_date VARCHAR(40),
  notes TEXT,
  terms TEXT,
  status VARCHAR(32) NOT NULL DEFAULT 'Draft',
  created_by VARCHAR(64),
  created_at VARCHAR(40) NOT NULL,
  updated_at VARCHAR(40) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS invoices (
  id VARCHAR(64) PRIMARY KEY,
  invoice_number VARCHAR(40) NOT NULL UNIQUE,
  customer_id VARCHAR(64),
  quotation_id VARCHAR(64),
  work_order_id VARCHAR(64),
  line_items_json LONGTEXT NOT NULL,
  subtotal DECIMAL(12,2) NOT NULL DEFAULT 0,
  tax_rate DECIMAL(6,3) NOT NULL DEFAULT 0,
  tax_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  total DECIMAL(12,2) NOT NULL DEFAULT 0,
  due_date VARCHAR(40),
  payment_status VARCHAR(32) NOT NULL DEFAULT 'Unpaid',
  payment_reference VARCHAR(160) DEFAULT '',
  paid_at VARCHAR(40),
  notes TEXT,
  created_by VARCHAR(64),
  created_at VARCHAR(40) NOT NULL,
  updated_at VARCHAR(40) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS expenses (
  id VARCHAR(64) PRIMARY KEY,
  vendor VARCHAR(160) NOT NULL,
  category VARCHAR(80) NOT NULL,
  amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  expense_date VARCHAR(40) NOT NULL,
  description TEXT,
  receipt_document_id VARCHAR(64),
  created_by VARCHAR(64),
  created_at VARCHAR(40) NOT NULL,
  updated_at VARCHAR(40) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS notifications (
  id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(64),
  title VARCHAR(200) NOT NULL,
  message TEXT NOT NULL,
  category VARCHAR(60) DEFAULT 'System',
  link VARCHAR(255) DEFAULT '/',
  is_read TINYINT(1) DEFAULT 0,
  created_at VARCHAR(40) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS audit_logs (
  id VARCHAR(64) PRIMARY KEY,
  actor_id VARCHAR(64),
  actor_email VARCHAR(190),
  module VARCHAR(60) NOT NULL,
  action VARCHAR(60) NOT NULL,
  target_type VARCHAR(60) DEFAULT '',
  target_id VARCHAR(64) DEFAULT '',
  summary TEXT NOT NULL,
  ip_address VARCHAR(64) DEFAULT '',
  created_at VARCHAR(40) NOT NULL,
  INDEX idx_audit_created (created_at),
  INDEX idx_audit_module (module)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS integrations (
  id VARCHAR(64) PRIMARY KEY,
  provider_key VARCHAR(64) NOT NULL UNIQUE,
  name VARCHAR(160) NOT NULL,
  category VARCHAR(80) NOT NULL,
  description TEXT NOT NULL,
  status VARCHAR(40) NOT NULL DEFAULT 'Not Configured',
  config_json TEXT,
  updated_at VARCHAR(40) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =============================================================================
-- SECTION 2: OFFICIAL KORTRIX CORPORATE SEED DATA (IDEMPOTENT)
-- Safe to re-run in cPanel phpMyAdmin. Uses INSERT IGNORE so existing records
-- and customized settings are never overwritten.
-- Zero fictional customers, employees, revenue, or test records are included.
-- =============================================================================

SET @seed_ts = DATE_FORMAT(UTC_TIMESTAMP(), '%Y-%m-%dT%H:%i:%s.000Z');
SET @seed_date = DATE_FORMAT(UTC_TIMESTAMP(), '%Y-%m-%d');

-- 1. Company Settings (Official KORTRIX Defaults)
INSERT IGNORE INTO company_settings (
  id, company_name, legal_status, website, affiliation, primary_email, telephone,
  region, timezone, currency, brand_color, logo_data_url, business_address, mailing_address,
  tax_rate, tax_label, customer_prefix, ticket_prefix, work_order_prefix, asset_prefix,
  quote_prefix, invoice_prefix, document_prefix, business_hours_json, notification_prefs_json,
  asset_grading_json, default_theme, updated_at
) VALUES (
  'default',
  'KORTRIX',
  'Pre-Formation (LLC Registration Pending)',
  'https://kortrix.com',
  'TheGrayUSA',
  'dylan@kortrix.com',
  '336.686.4728',
  'North Carolina',
  'America/New_York',
  'USD',
  '#0047FF',
  '',
  'North Carolina, United States',
  'North Carolina, United States',
  0,
  'NC Sales Tax (Configure Once Registered)',
  'KTX-CUS',
  'KTX-TKT',
  'KTX-WO',
  'KTX-AST',
  'KTX-QUO',
  'KTX-INV',
  'KTX-DOC',
  '{"monday":"09:00 - 17:00","tuesday":"09:00 - 17:00","wednesday":"09:00 - 17:00","thursday":"09:00 - 17:00","friday":"09:00 - 17:00","saturday":"By Appointment","sunday":"Closed"}',
  '{"ticketCreated":true,"workOrderAssigned":true,"quoteAccepted":true,"invoiceOverdue":true,"securityAuditAlerts":true}',
  '[{"grade":"Grade A","label":"Like New / Mint","criteria":"Fully functional, negligible cosmetic wear, passes full hardware diagnostics."},{"grade":"Grade B","label":"Good / Refurbished","criteria":"Fully functional, minor light surface wear, verified storage & memory."},{"grade":"Grade C","label":"Fair / Operational","criteria":"Functional with visible cosmetic scuffs or battery wear under 80%."},{"grade":"Grade D","label":"Repair / Parts Only","criteria":"Hardware fault present; queued for repair, salvage, or disposition."}]',
  'light',
  @seed_ts
);

-- 2. Official Departments (9)
INSERT IGNORE INTO departments (id, name, code, description, active, created_at, updated_at) VALUES
  ('dept-exec', 'Executive Leadership', 'EXEC', 'Corporate governance, strategy, and executive oversight.', 1, @seed_ts, @seed_ts),
  ('dept-admin', 'Corporate Administration', 'ADMN', 'Legal, compliance, documentation, and internal administration.', 1, @seed_ts, @seed_ts),
  ('dept-ops', 'Operations', 'OPS', 'Service delivery, scheduling, dispatch, and operational workflows.', 1, @seed_ts, @seed_ts),
  ('dept-infra', 'Infrastructure', 'INFR', 'Residential IT, business IT, networking, servers, and cloud systems.', 1, @seed_ts, @seed_ts),
  ('dept-sec', 'Security', 'SEC', 'Endpoint protection, remediation, assessments, and backup recovery.', 1, @seed_ts, @seed_ts),
  ('dept-life', 'Lifecycle', 'LIFE', 'ITAM, auditing, refurbishment, and asset disposition coordination.', 1, @seed_ts, @seed_ts),
  ('dept-dev', 'Software Development', 'DEV', 'Internal platforms, KORTRIX ONE engineering, and integrations.', 1, @seed_ts, @seed_ts),
  ('dept-sales', 'Sales & Marketing', 'SALE', 'Client acquisition, proposals, branding, and lead pipeline.', 1, @seed_ts, @seed_ts),
  ('dept-fin', 'Finance', 'FIN', 'Quotations, invoicing, expense tracking, and financial operations.', 1, @seed_ts, @seed_ts);

-- 3. Official Roles & Granular Module Permissions (10)
INSERT IGNORE INTO roles (id, name, description, is_system, permissions_json, created_at, updated_at) VALUES
  ('role-owner', 'Owner', 'Unrestricted platform ownership, governance, and security authority.', 1,
   '{"dashboard":{"view":true,"create":true,"edit":true,"delete":true,"export":true,"admin":true},"crm":{"view":true,"create":true,"edit":true,"delete":true,"export":true,"admin":true},"service_desk":{"view":true,"create":true,"edit":true,"delete":true,"export":true,"admin":true},"work_orders":{"view":true,"create":true,"edit":true,"delete":true,"export":true,"admin":true},"service_catalog":{"view":true,"create":true,"edit":true,"delete":true,"export":true,"admin":true},"assets":{"view":true,"create":true,"edit":true,"delete":true,"export":true,"admin":true},"documents":{"view":true,"create":true,"edit":true,"delete":true,"export":true,"admin":true},"projects":{"view":true,"create":true,"edit":true,"delete":true,"export":true,"admin":true},"finance":{"view":true,"create":true,"edit":true,"delete":true,"export":true,"admin":true},"employees":{"view":true,"create":true,"edit":true,"delete":true,"export":true,"admin":true},"admin":{"view":true,"create":true,"edit":true,"delete":true,"export":true,"admin":true}}',
   @seed_ts, @seed_ts),
  ('role-exec', 'Executive', 'Executive leadership visibility and cross-departmental management.', 1,
   '{"dashboard":{"view":true,"create":true,"edit":true,"delete":true,"export":true,"admin":false},"crm":{"view":true,"create":true,"edit":true,"delete":true,"export":true,"admin":false},"service_desk":{"view":true,"create":true,"edit":true,"delete":true,"export":true,"admin":false},"work_orders":{"view":true,"create":true,"edit":true,"delete":true,"export":true,"admin":false},"service_catalog":{"view":true,"create":true,"edit":true,"delete":true,"export":true,"admin":false},"assets":{"view":true,"create":true,"edit":true,"delete":true,"export":true,"admin":false},"documents":{"view":true,"create":true,"edit":true,"delete":true,"export":true,"admin":false},"projects":{"view":true,"create":true,"edit":true,"delete":true,"export":true,"admin":false},"finance":{"view":true,"create":true,"edit":true,"delete":true,"export":true,"admin":false},"employees":{"view":true,"create":true,"edit":true,"delete":true,"export":true,"admin":false},"admin":{"view":true,"create":true,"edit":true,"delete":false,"export":true,"admin":true}}',
   @seed_ts, @seed_ts),
  ('role-admin', 'Administrator', 'System administration, user provisioning, and security configuration.', 1,
   '{"dashboard":{"view":true,"create":true,"edit":true,"delete":true,"export":true,"admin":true},"crm":{"view":true,"create":true,"edit":true,"delete":true,"export":true,"admin":true},"service_desk":{"view":true,"create":true,"edit":true,"delete":true,"export":true,"admin":true},"work_orders":{"view":true,"create":true,"edit":true,"delete":true,"export":true,"admin":true},"service_catalog":{"view":true,"create":true,"edit":true,"delete":true,"export":true,"admin":true},"assets":{"view":true,"create":true,"edit":true,"delete":true,"export":true,"admin":true},"documents":{"view":true,"create":true,"edit":true,"delete":true,"export":true,"admin":true},"projects":{"view":true,"create":true,"edit":true,"delete":true,"export":true,"admin":true},"finance":{"view":true,"create":true,"edit":true,"delete":true,"export":true,"admin":true},"employees":{"view":true,"create":true,"edit":true,"delete":true,"export":true,"admin":true},"admin":{"view":true,"create":true,"edit":true,"delete":true,"export":true,"admin":true}}',
   @seed_ts, @seed_ts),
  ('role-manager', 'Manager', 'Departmental operations oversight across teams and customers.', 1,
   '{"dashboard":{"view":true,"create":true,"edit":true,"delete":false,"export":true,"admin":false},"crm":{"view":true,"create":true,"edit":true,"delete":false,"export":true,"admin":false},"service_desk":{"view":true,"create":true,"edit":true,"delete":false,"export":true,"admin":false},"work_orders":{"view":true,"create":true,"edit":true,"delete":false,"export":true,"admin":false},"service_catalog":{"view":true,"create":true,"edit":true,"delete":false,"export":true,"admin":false},"assets":{"view":true,"create":true,"edit":true,"delete":false,"export":true,"admin":false},"documents":{"view":true,"create":true,"edit":true,"delete":false,"export":true,"admin":false},"projects":{"view":true,"create":true,"edit":true,"delete":false,"export":true,"admin":false},"finance":{"view":true,"create":true,"edit":true,"delete":false,"export":true,"admin":false},"employees":{"view":true,"create":true,"edit":true,"delete":false,"export":true,"admin":false},"admin":{"view":false,"create":false,"edit":false,"delete":false,"export":false,"admin":false}}',
   @seed_ts, @seed_ts),
  ('role-tech', 'Technician', 'Field and remote service execution, work orders, tickets, and assets.', 1,
   '{"dashboard":{"view":true,"create":true,"edit":true,"delete":false,"export":false,"admin":false},"crm":{"view":true,"create":false,"edit":false,"delete":false,"export":false,"admin":false},"service_desk":{"view":true,"create":true,"edit":true,"delete":false,"export":false,"admin":false},"work_orders":{"view":true,"create":true,"edit":true,"delete":false,"export":false,"admin":false},"service_catalog":{"view":true,"create":true,"edit":true,"delete":false,"export":false,"admin":false},"assets":{"view":true,"create":true,"edit":true,"delete":false,"export":false,"admin":false},"documents":{"view":true,"create":true,"edit":true,"delete":false,"export":false,"admin":false},"projects":{"view":true,"create":true,"edit":true,"delete":false,"export":false,"admin":false},"finance":{"view":false,"create":false,"edit":false,"delete":false,"export":false,"admin":false},"employees":{"view":false,"create":false,"edit":false,"delete":false,"export":false,"admin":false},"admin":{"view":false,"create":false,"edit":false,"delete":false,"export":false,"admin":false}}',
   @seed_ts, @seed_ts),
  ('role-support', 'Support Specialist', 'Service desk triage, customer communication, and scheduling.', 1,
   '{"dashboard":{"view":true,"create":true,"edit":true,"delete":false,"export":false,"admin":false},"crm":{"view":true,"create":true,"edit":true,"delete":false,"export":false,"admin":false},"service_desk":{"view":true,"create":true,"edit":true,"delete":false,"export":false,"admin":false},"work_orders":{"view":true,"create":true,"edit":true,"delete":false,"export":false,"admin":false},"service_catalog":{"view":true,"create":true,"edit":true,"delete":false,"export":false,"admin":false},"assets":{"view":false,"create":false,"edit":false,"delete":false,"export":false,"admin":false},"documents":{"view":true,"create":true,"edit":true,"delete":false,"export":false,"admin":false},"projects":{"view":false,"create":false,"edit":false,"delete":false,"export":false,"admin":false},"finance":{"view":false,"create":false,"edit":false,"delete":false,"export":false,"admin":false},"employees":{"view":false,"create":false,"edit":false,"delete":false,"export":false,"admin":false},"admin":{"view":false,"create":false,"edit":false,"delete":false,"export":false,"admin":false}}',
   @seed_ts, @seed_ts),
  ('role-sales', 'Sales Representative', 'CRM pipeline, leads, customer onboarding, and quotations.', 1,
   '{"dashboard":{"view":true,"create":false,"edit":false,"delete":false,"export":false,"admin":false},"crm":{"view":true,"create":true,"edit":true,"delete":false,"export":true,"admin":false},"service_desk":{"view":false,"create":false,"edit":false,"delete":false,"export":false,"admin":false},"work_orders":{"view":false,"create":false,"edit":false,"delete":false,"export":false,"admin":false},"service_catalog":{"view":true,"create":false,"edit":false,"delete":false,"export":false,"admin":false},"assets":{"view":false,"create":false,"edit":false,"delete":false,"export":false,"admin":false},"documents":{"view":true,"create":false,"edit":false,"delete":false,"export":false,"admin":false},"projects":{"view":true,"create":false,"edit":false,"delete":false,"export":false,"admin":false},"finance":{"view":true,"create":true,"edit":true,"delete":false,"export":false,"admin":false},"employees":{"view":false,"create":false,"edit":false,"delete":false,"export":false,"admin":false},"admin":{"view":false,"create":false,"edit":false,"delete":false,"export":false,"admin":false}}',
   @seed_ts, @seed_ts),
  ('role-finance', 'Finance', 'Quotations, invoicing, expense recording, and financial summaries.', 1,
   '{"dashboard":{"view":true,"create":false,"edit":false,"delete":false,"export":false,"admin":false},"crm":{"view":true,"create":false,"edit":false,"delete":false,"export":false,"admin":false},"service_desk":{"view":false,"create":false,"edit":false,"delete":false,"export":false,"admin":false},"work_orders":{"view":false,"create":false,"edit":false,"delete":false,"export":false,"admin":false},"service_catalog":{"view":true,"create":false,"edit":false,"delete":false,"export":false,"admin":false},"assets":{"view":false,"create":false,"edit":false,"delete":false,"export":false,"admin":false},"documents":{"view":true,"create":true,"edit":false,"delete":false,"export":false,"admin":false},"projects":{"view":false,"create":false,"edit":false,"delete":false,"export":false,"admin":false},"finance":{"view":true,"create":true,"edit":true,"delete":false,"export":true,"admin":false},"employees":{"view":false,"create":false,"edit":false,"delete":false,"export":false,"admin":false},"admin":{"view":false,"create":false,"edit":false,"delete":false,"export":false,"admin":false}}',
   @seed_ts, @seed_ts),
  ('role-employee', 'Employee', 'Internal corporate access to projects, tasks, and shared documentation.', 1,
   '{"dashboard":{"view":true,"create":false,"edit":false,"delete":false,"export":false,"admin":false},"crm":{"view":false,"create":false,"edit":false,"delete":false,"export":false,"admin":false},"service_desk":{"view":false,"create":false,"edit":false,"delete":false,"export":false,"admin":false},"work_orders":{"view":false,"create":false,"edit":false,"delete":false,"export":false,"admin":false},"service_catalog":{"view":true,"create":false,"edit":false,"delete":false,"export":false,"admin":false},"assets":{"view":false,"create":false,"edit":false,"delete":false,"export":false,"admin":false},"documents":{"view":true,"create":true,"edit":false,"delete":false,"export":false,"admin":false},"projects":{"view":true,"create":true,"edit":true,"delete":false,"export":false,"admin":false},"finance":{"view":false,"create":false,"edit":false,"delete":false,"export":false,"admin":false},"employees":{"view":false,"create":false,"edit":false,"delete":false,"export":false,"admin":false},"admin":{"view":false,"create":false,"edit":false,"delete":false,"export":false,"admin":false}}',
   @seed_ts, @seed_ts),
  ('role-readonly', 'Read Only', 'Auditing and read-only visibility without mutation permissions.', 1,
   '{"dashboard":{"view":true,"create":false,"edit":false,"delete":false,"export":false,"admin":false},"crm":{"view":true,"create":false,"edit":false,"delete":false,"export":false,"admin":false},"service_desk":{"view":true,"create":false,"edit":false,"delete":false,"export":false,"admin":false},"work_orders":{"view":true,"create":false,"edit":false,"delete":false,"export":false,"admin":false},"service_catalog":{"view":true,"create":false,"edit":false,"delete":false,"export":false,"admin":false},"assets":{"view":true,"create":false,"edit":false,"delete":false,"export":false,"admin":false},"documents":{"view":true,"create":false,"edit":false,"delete":false,"export":false,"admin":false},"projects":{"view":true,"create":false,"edit":false,"delete":false,"export":false,"admin":false},"finance":{"view":true,"create":false,"edit":false,"delete":false,"export":false,"admin":false},"employees":{"view":true,"create":false,"edit":false,"delete":false,"export":false,"admin":false},"admin":{"view":false,"create":false,"edit":false,"delete":false,"export":false,"admin":false}}',
   @seed_ts, @seed_ts);

-- 4. Founder / Owner Account ONLY (Zero plaintext passwords in SQL)
-- password_hash is automatically populated with a salted scrypt hash on first
-- server boot when OWNER_ADMIN_PASSCODE is set in your server environment, OR
-- you can generate a ready-to-paste phpMyAdmin UPDATE statement via:
--   npm run owner:sql
INSERT IGNORE INTO users (
  id, email, full_name, position, department_id, role_id,
  employment_classification, responsibilities, password_hash, status, created_at, updated_at
) VALUES (
  'user-founder',
  'dylan@kortrix.com',
  'Dylan',
  'Founder',
  'dept-exec',
  'role-owner',
  'Founder / Principal',
  'Executive leadership, infrastructure operations, security architecture, and platform administration.',
  NULL,
  'Active',
  @seed_ts,
  @seed_ts
);

-- 5. Default Document Categories (9)
INSERT IGNORE INTO document_folders (id, name, category, parent_id, allowed_departments_json, created_by, created_at) VALUES
  ('folder-corporate-legal', 'Corporate & Legal', 'Corporate & Legal', NULL, '[]', 'user-founder', @seed_ts),
  ('folder-finance-accounting', 'Finance & Accounting', 'Finance & Accounting', NULL, '[]', 'user-founder', @seed_ts),
  ('folder-operations', 'Operations', 'Operations', NULL, '[]', 'user-founder', @seed_ts),
  ('folder-services-pricing', 'Services & Pricing', 'Services & Pricing', NULL, '[]', 'user-founder', @seed_ts),
  ('folder-branding-marketing', 'Branding & Marketing', 'Branding & Marketing', NULL, '[]', 'user-founder', @seed_ts),
  ('folder-technology-development', 'Technology & Development', 'Technology & Development', NULL, '[]', 'user-founder', @seed_ts),
  ('folder-customers-contracts', 'Customers & Contracts', 'Customers & Contracts', NULL, '[]', 'user-founder', @seed_ts),
  ('folder-policies-compliance', 'Policies & Compliance', 'Policies & Compliance', NULL, '[]', 'user-founder', @seed_ts),
  ('folder-human-resources', 'Human Resources', 'Human Resources', NULL, '[]', 'user-founder', @seed_ts);

-- 6. Official KORTRIX Service Catalog (19 Services — Unpriced Drafts)
INSERT IGNORE INTO services (
  id, service_code, name, division, description, included_work, exclusions,
  pricing_model, price, estimated_duration, delivery_mode, tax_classification,
  active, publication_status, created_at, updated_at
) VALUES
  ('svc-inf-001', 'INF-001', 'Residential technical support', 'KORTRIX Infrastructure', 'Hands-on troubleshooting, OS configuration, software maintenance, and technical assistance for home environments.', '', '', 'Hourly', NULL, '', 'On-Site & Remote', 'Taxable Service', 1, 'Draft', @seed_ts, @seed_ts),
  ('svc-inf-002', 'INF-002', 'Computer and device support', 'KORTRIX Infrastructure', 'Diagnostics, hardware upgrades, OS installation, performance optimization, and workstation setup.', '', '', 'Fixed Price', NULL, '', 'On-Site & Remote', 'Taxable Service', 1, 'Draft', @seed_ts, @seed_ts),
  ('svc-inf-003', 'INF-003', 'Home networking and Wi-Fi', 'KORTRIX Infrastructure', 'Router and mesh deployment, coverage optimization, structured wiring troubleshooting, and secure wireless configuration.', '', '', 'Custom Quote', NULL, '', 'On-Site Only', 'Taxable Service', 1, 'Draft', @seed_ts, @seed_ts),
  ('svc-inf-004', 'INF-004', 'TV and audio technology', 'KORTRIX Infrastructure', 'Smart display configuration, home audio integration, streaming hardware setup, and cable management.', '', '', 'Fixed Price', NULL, '', 'On-Site Only', 'Taxable Service', 1, 'Draft', @seed_ts, @seed_ts),
  ('svc-inf-005', 'INF-005', 'Managed business IT', 'KORTRIX Infrastructure', 'Ongoing operational support, workstation lifecycle oversight, patch management, and SLA-backed IT administration.', '', '', 'Recurring', NULL, '', 'On-Site & Remote', 'Taxable Service', 1, 'Draft', @seed_ts, @seed_ts),
  ('svc-inf-006', 'INF-006', 'Network infrastructure', 'KORTRIX Infrastructure', 'Commercial switching, firewalls, VLAN segmentation, VPN connectivity, and structured network architecture.', '', '', 'Custom Quote', NULL, '', 'On-Site & Remote', 'Taxable Service', 1, 'Draft', @seed_ts, @seed_ts),
  ('svc-inf-007', 'INF-007', 'Server and cloud services', 'KORTRIX Infrastructure', 'On-premises server administration, virtualization, Microsoft 365 tenant engineering, and hybrid cloud infrastructure.', '', '', 'Custom Quote', NULL, '', 'On-Site & Remote', 'Taxable Service', 1, 'Draft', @seed_ts, @seed_ts),
  ('svc-inf-008', 'INF-008', 'Software and integrations', 'KORTRIX Infrastructure', 'Business application deployment, license alignment, API integration planning, and internal workflow tooling.', '', '', 'Hourly', NULL, '', 'Remote Only', 'Taxable Service', 1, 'Draft', @seed_ts, @seed_ts),
  ('svc-sec-001', 'SEC-001', 'Malware remediation', 'KORTRIX Security', 'Containment, removal of malicious software, system integrity verification, and post-incident hardening.', '', '', 'Fixed Price', NULL, '', 'On-Site & Remote', 'Taxable Service', 1, 'Draft', @seed_ts, @seed_ts),
  ('svc-sec-002', 'SEC-002', 'Endpoint protection', 'KORTRIX Security', 'Deployment and policy configuration of enterprise antivirus, EDR agents, and device encryption.', '', '', 'Per Device', NULL, '', 'On-Site & Remote', 'Taxable Service', 1, 'Draft', @seed_ts, @seed_ts),
  ('svc-sec-003', 'SEC-003', 'Security assessments', 'KORTRIX Security', 'Structured review of network posture, identity controls, access policies, and prioritized remediation roadmaps.', '', '', 'Custom Quote', NULL, '', 'On-Site & Remote', 'Taxable Service', 1, 'Draft', @seed_ts, @seed_ts),
  ('svc-sec-004', 'SEC-004', 'Account security', 'KORTRIX Security', 'MFA rollout, conditional access configuration, account recovery hygiene, and identity protection.', '', '', 'Per User', NULL, '', 'Remote Only', 'Taxable Service', 1, 'Draft', @seed_ts, @seed_ts),
  ('svc-sec-005', 'SEC-005', 'Backup and recovery', 'KORTRIX Security', '3-2-1 backup architecture, cloud and local redundancy verification, and disaster recovery readiness.', '', '', 'Recurring', NULL, '', 'On-Site & Remote', 'Taxable Service', 1, 'Draft', @seed_ts, @seed_ts),
  ('svc-lif-001', 'LIF-001', 'IT asset management', 'KORTRIX Lifecycle', 'Inventory registration, asset tagging, warranty tracking, and lifecycle reporting for organizational hardware.', '', '', 'Per Device', NULL, '', 'On-Site & Remote', 'Taxable Service', 1, 'Draft', @seed_ts, @seed_ts),
  ('svc-lif-002', 'LIF-002', 'Device deployment', 'KORTRIX Lifecycle', 'Standardized imaging, enrollment, peripheral staging, and end-user desk readiness.', '', '', 'Per Device', NULL, '', 'On-Site & Remote', 'Taxable Service', 1, 'Draft', @seed_ts, @seed_ts),
  ('svc-lif-003', 'LIF-003', 'Equipment auditing', 'KORTRIX Lifecycle', 'Physical hardware verification, serial reconciliation, condition grading, and retirement eligibility reviews.', '', '', 'Custom Quote', NULL, '', 'On-Site Only', 'Taxable Service', 1, 'Draft', @seed_ts, @seed_ts),
  ('svc-lif-004', 'LIF-004', 'Equipment refurbishment', 'KORTRIX Lifecycle', 'Component testing, storage replacement, cleaning, OS reload, and grading for secondary deployment.', '', '', 'Per Device', NULL, '', 'On-Site Only', 'Taxable Service', 1, 'Draft', @seed_ts, @seed_ts),
  ('svc-lif-005', 'LIF-005', 'Asset disposition coordination', 'KORTRIX Lifecycle', 'Chain-of-custody documentation, decommissioning logistics, and coordination with certified recycling partners.', '', '', 'Custom Quote', NULL, '', 'On-Site Only', 'Taxable Service', 1, 'Draft', @seed_ts, @seed_ts),
  ('svc-lif-006', 'LIF-006', 'Data sanitization coordination', 'KORTRIX Lifecycle', 'Coordinated media wiping workflows and custody documentation prior to hardware reuse or partner disposal.', '', '', 'Per Device', NULL, '', 'On-Site Only', 'Taxable Service', 1, 'Draft', @seed_ts, @seed_ts);

-- 7. KORTRIX Company Launch Roadmap Project & Tasks (19)
INSERT IGNORE INTO projects (id, name, code, description, category, status, owner_id, start_date, target_date, created_at, updated_at) VALUES (
  'proj-kortrix-launch',
  'KORTRIX Company Launch',
  'KTX-PRJ-001',
  'Official foundational corporate launch roadmap tracking infrastructure, legal formation readiness, service catalog finalization, and operational launch milestones.',
  'Corporate Roadmap',
  'Active',
  'user-founder',
  @seed_date,
  NULL,
  @seed_ts,
  @seed_ts
);

INSERT IGNORE INTO tasks (id, project_id, title, description, status, priority, assigned_user_id, sort_order, completed_at, created_at, updated_at) VALUES
  ('task-launch-1', 'proj-kortrix-launch', 'Establish company name', '', 'Completed', 'Normal', 'user-founder', 1, @seed_ts, @seed_ts, @seed_ts),
  ('task-launch-2', 'proj-kortrix-launch', 'Acquire kortrix.com', '', 'Completed', 'Normal', 'user-founder', 2, @seed_ts, @seed_ts, @seed_ts),
  ('task-launch-3', 'proj-kortrix-launch', 'Establish logo and branding', '', 'Completed', 'Normal', 'user-founder', 3, @seed_ts, @seed_ts, @seed_ts),
  ('task-launch-4', 'proj-kortrix-launch', 'Create social media accounts', '', 'Completed', 'Normal', 'user-founder', 4, @seed_ts, @seed_ts, @seed_ts),
  ('task-launch-5', 'proj-kortrix-launch', 'Deploy corporate website', '', 'Completed', 'Normal', 'user-founder', 5, @seed_ts, @seed_ts, @seed_ts),
  ('task-launch-6', 'proj-kortrix-launch', 'Establish Microsoft 365', '', 'Completed', 'Normal', 'user-founder', 6, @seed_ts, @seed_ts, @seed_ts),
  ('task-launch-7', 'proj-kortrix-launch', 'Create corporate email and shared mailboxes', '', 'Completed', 'Normal', 'user-founder', 7, @seed_ts, @seed_ts, @seed_ts),
  ('task-launch-8', 'proj-kortrix-launch', 'Finalize website functionality', '', 'Pending', 'Normal', 'user-founder', 8, NULL, @seed_ts, @seed_ts),
  ('task-launch-9', 'proj-kortrix-launch', 'Configure website form delivery', '', 'Pending', 'Normal', 'user-founder', 9, NULL, @seed_ts, @seed_ts),
  ('task-launch-10', 'proj-kortrix-launch', 'Complete KORTRIX ONE', '', 'Pending', 'High', 'user-founder', 10, NULL, @seed_ts, @seed_ts),
  ('task-launch-11', 'proj-kortrix-launch', 'Establish service catalog', '', 'Pending', 'Normal', 'user-founder', 11, NULL, @seed_ts, @seed_ts),
  ('task-launch-12', 'proj-kortrix-launch', 'Finalize pricing', '', 'Pending', 'High', 'user-founder', 12, NULL, @seed_ts, @seed_ts),
  ('task-launch-13', 'proj-kortrix-launch', 'Prepare corporate documentation', '', 'Pending', 'Normal', 'user-founder', 13, NULL, @seed_ts, @seed_ts),
  ('task-launch-14', 'proj-kortrix-launch', 'Prepare customer agreements', '', 'Pending', 'Normal', 'user-founder', 14, NULL, @seed_ts, @seed_ts),
  ('task-launch-15', 'proj-kortrix-launch', 'Develop marketing materials', '', 'Pending', 'Normal', 'user-founder', 15, NULL, @seed_ts, @seed_ts),
  ('task-launch-16', 'proj-kortrix-launch', 'Register LLC when funding is available', '', 'Pending', 'Normal', 'user-founder', 16, NULL, @seed_ts, @seed_ts),
  ('task-launch-17', 'proj-kortrix-launch', 'Obtain business insurance', '', 'Pending', 'Normal', 'user-founder', 17, NULL, @seed_ts, @seed_ts),
  ('task-launch-18', 'proj-kortrix-launch', 'Establish financial accounts', '', 'Pending', 'Normal', 'user-founder', 18, NULL, @seed_ts, @seed_ts),
  ('task-launch-19', 'proj-kortrix-launch', 'Prepare official business launch', '', 'Pending', 'Normal', 'user-founder', 19, NULL, @seed_ts, @seed_ts);

-- 8. Official Integrations Registry (8)
INSERT IGNORE INTO integrations (id, provider_key, name, category, description, status, config_json, updated_at) VALUES
  ('int-microsoft_entra_id', 'microsoft_entra_id', 'Microsoft Entra ID (SSO)', 'Microsoft 365', 'Enterprise OpenID Connect / OAuth 2.0 sign-in restricted to authorized @kortrix.com Microsoft 365 accounts (Primary: dylan@kortrix.com).', 'Not Configured', '{"primaryAccount":"dylan@kortrix.com","requiredScopes":["openid","profile","email","User.Read"]}', @seed_ts),
  ('int-outlook_email', 'outlook_email', 'Outlook Email (Microsoft Graph)', 'Microsoft 365', 'Least-privilege transactional email notifications and ticket replies via Microsoft Graph Mail.Send.', 'Not Configured', '{"primaryAccount":"dylan@kortrix.com","requiredScopes":["Mail.Send"]}', @seed_ts),
  ('int-shared_mailboxes', 'shared_mailboxes', 'Microsoft 365 Shared Mailboxes', 'Microsoft 365', 'Inbound routing for support and operations shared mailboxes into KORTRIX ONE Service Desk.', 'Not Configured', '{"requiredScopes":["Mail.Read.Shared"]}', @seed_ts),
  ('int-outlook_calendar', 'outlook_calendar', 'Outlook Calendar Sync', 'Microsoft 365', 'Two-way technician appointment and work order scheduling sync via Microsoft Graph Calendars.ReadWrite.', 'Not Configured', '{"requiredScopes":["Calendars.ReadWrite"]}', @seed_ts),
  ('int-kortrix_public_intake', 'kortrix_public_intake', 'kortrix.com Service Request Intake API', 'Public Website', 'Authenticated write-only endpoint (POST /api/public/service-requests) for incoming website inquiries without exposing internal ticket records.', 'Not Configured', '{"endpoint":"/api/public/service-requests","header":"X-Kortrix-Intake-Key"}', @seed_ts),
  ('int-cpanel_mysql', 'cpanel_mysql', 'cPanel MySQL / MariaDB Database', 'Infrastructure', 'External relational SQL database connection configured via server-side MYSQL_* environment variables.', 'Connected', '{"activeEngine":"mysql"}', @seed_ts),
  ('int-stripe_billing', 'stripe_billing', 'Stripe Payment Processing', 'Finance (Planned)', 'Future online invoice payment settlement. Live payment processing is intentionally disabled in this initial release.', 'Unavailable (Planned)', '{}', @seed_ts),
  ('int-square_pos', 'square_pos', 'Square Payments & POS', 'Finance (Planned)', 'Future on-site residential and commercial payment acceptance. Disabled until LLC and financial accounts are established.', 'Unavailable (Planned)', '{}', @seed_ts);
