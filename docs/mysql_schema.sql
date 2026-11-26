-- KORTRIX ONE — MySQL / MariaDB Schema (cPanel Ready)
-- Run in cPanel phpMyAdmin OR let KORTRIX ONE auto-bootstrap these tables on startup
-- once MYSQL_HOST, MYSQL_PORT, MYSQL_USER, MYSQL_PASSWORD, and MYSQL_DATABASE are set.

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
