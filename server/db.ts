import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';
import mysql from 'mysql2/promise';
import crypto from 'crypto';

export type DbDialect = 'mysql' | 'sqlite';

export interface DbStatus {
  dialect: DbDialect;
  connected: boolean;
  host?: string;
  database: string;
  error?: string;
}

class UnifiedDatabase {
  public dialect: DbDialect = 'sqlite';
  private sqlite: Database.Database | null = null;
  private mysqlPool: mysql.Pool | null = null;
  private statusInfo: DbStatus = {
    dialect: 'sqlite',
    connected: false,
    database: 'data/kortrix_one.db',
  };

  async init(): Promise<void> {
    const mysqlHost = process.env.MYSQL_HOST?.trim();
    const mysqlUser = process.env.MYSQL_USER?.trim();
    const mysqlDatabase = process.env.MYSQL_DATABASE?.trim();

    if (mysqlHost && mysqlUser && mysqlDatabase) {
      try {
        const useSsl = String(process.env.MYSQL_SSL || '').trim().toLowerCase() === 'true';
        const pool = mysql.createPool({
          host: mysqlHost,
          port: Number(process.env.MYSQL_PORT || 3306),
          user: mysqlUser,
          password: process.env.MYSQL_PASSWORD || '',
          database: mysqlDatabase,
          waitForConnections: true,
          connectionLimit: 10,
          queueLimit: 0,
          connectTimeout: 8000,
          decimalNumbers: true,
          ssl: useSsl ? { rejectUnauthorized: false } : undefined,
        });
        const conn = await pool.getConnection();
        await conn.ping();
        conn.release();
        this.mysqlPool = pool;
        this.dialect = 'mysql';
        this.statusInfo = {
          dialect: 'mysql',
          connected: true,
          host: mysqlHost,
          database: mysqlDatabase,
        };
        await this.bootstrapSchema();
        await this.seedCorporateDefaults();
        return;
      } catch (err: any) {
        const isLocalhost = mysqlHost === 'localhost' || mysqlHost === '127.0.0.1';
        const hint = isLocalhost
          ? ' MYSQL_HOST is set to localhost, which points to this container rather than your external cPanel server.'
          : '';
        console.error('[KORTRIX DB] MySQL connection failed, falling back to local SQLite:', err?.message);
        this.statusInfo.error = `MySQL unreachable (${err?.code || err?.message || 'connection failed'}).${hint} Running on local SQLite fallback.`;
      }
    }

    // Local persistent SQLite relational database
    const dataDir = path.resolve(process.cwd(), 'data');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    const dbPath = path.join(dataDir, 'kortrix_one.db');
    this.sqlite = new Database(dbPath);
    this.sqlite.pragma('journal_mode = WAL');
    this.sqlite.pragma('foreign_keys = ON');
    this.dialect = 'sqlite';
    this.statusInfo = {
      dialect: 'sqlite',
      connected: true,
      database: 'data/kortrix_one.db',
      error: this.statusInfo.error,
    };

    await this.bootstrapSchema();
    await this.seedCorporateDefaults();
  }

  getStatus(): DbStatus {
    return { ...this.statusInfo };
  }

  async cleanupExpiredSessions(): Promise<void> {
    try {
      await this.execute('DELETE FROM sessions WHERE expires_at < ?', [new Date().toISOString()]);
    } catch {
      // Non-fatal
    }
  }

  async close(): Promise<void> {
    if (this.mysqlPool) {
      await this.mysqlPool.end();
      this.mysqlPool = null;
    }
    if (this.sqlite) {
      this.sqlite.close();
      this.sqlite = null;
    }
  }

  async query<T = any>(sql: string, params: any[] = []): Promise<T[]> {
    if (this.dialect === 'mysql' && this.mysqlPool) {
      const [rows] = await this.mysqlPool.execute(sql, params);
      return rows as T[];
    }
    if (!this.sqlite) throw new Error('Database not initialized');
    return this.sqlite.prepare(sql).all(...params) as T[];
  }

  async queryOne<T = any>(sql: string, params: any[] = []): Promise<T | null> {
    const rows = await this.query<T>(sql, params);
    return rows.length > 0 ? rows[0] : null;
  }

  async execute(sql: string, params: any[] = []): Promise<{ changes: number; lastInsertId: number | string }> {
    if (this.dialect === 'mysql' && this.mysqlPool) {
      const [res]: any = await this.mysqlPool.execute(sql, params);
      return { changes: res.affectedRows ?? 0, lastInsertId: res.insertId ?? 0 };
    }
    if (!this.sqlite) throw new Error('Database not initialized');
    const info = this.sqlite.prepare(sql).run(...params);
    return { changes: info.changes, lastInsertId: Number(info.lastInsertRowid) };
  }

  private async runDDL(sqliteSql: string, mysqlSql?: string): Promise<void> {
    const statement = this.dialect === 'mysql' ? (mysqlSql || sqliteSql) : sqliteSql;
    if (this.dialect === 'mysql' && this.mysqlPool) {
      await this.mysqlPool.query(statement);
    } else if (this.sqlite) {
      this.sqlite.exec(statement);
    }
  }

  private async bootstrapSchema(): Promise<void> {
    const tables: Array<[string, string]> = [
      [
        `CREATE TABLE IF NOT EXISTS departments (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL UNIQUE,
          code TEXT NOT NULL UNIQUE,
          description TEXT DEFAULT '',
          head_user_id TEXT,
          active INTEGER DEFAULT 1,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        )`,
        `CREATE TABLE IF NOT EXISTS departments (
          id VARCHAR(64) PRIMARY KEY,
          name VARCHAR(150) NOT NULL UNIQUE,
          code VARCHAR(32) NOT NULL UNIQUE,
          description TEXT,
          head_user_id VARCHAR(64),
          active TINYINT(1) DEFAULT 1,
          created_at VARCHAR(40) NOT NULL,
          updated_at VARCHAR(40) NOT NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
      ],
      [
        `CREATE TABLE IF NOT EXISTS roles (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL UNIQUE,
          description TEXT DEFAULT '',
          is_system INTEGER DEFAULT 1,
          permissions_json TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        )`,
        `CREATE TABLE IF NOT EXISTS roles (
          id VARCHAR(64) PRIMARY KEY,
          name VARCHAR(100) NOT NULL UNIQUE,
          description TEXT,
          is_system TINYINT(1) DEFAULT 1,
          permissions_json LONGTEXT NOT NULL,
          created_at VARCHAR(40) NOT NULL,
          updated_at VARCHAR(40) NOT NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
      ],
      [
        `CREATE TABLE IF NOT EXISTS users (
          id TEXT PRIMARY KEY,
          email TEXT NOT NULL UNIQUE,
          full_name TEXT NOT NULL,
          position TEXT DEFAULT '',
          department_id TEXT,
          role_id TEXT NOT NULL,
          employment_classification TEXT DEFAULT 'Founder / Principal',
          responsibilities TEXT DEFAULT '',
          password_hash TEXT,
          entra_oid TEXT,
          status TEXT DEFAULT 'Active',
          last_login_at TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        )`,
        `CREATE TABLE IF NOT EXISTS users (
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
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
      ],
      [
        `CREATE TABLE IF NOT EXISTS sessions (
          token_hash TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          ip_address TEXT,
          user_agent TEXT,
          expires_at TEXT NOT NULL,
          created_at TEXT NOT NULL
        )`,
        `CREATE TABLE IF NOT EXISTS sessions (
          token_hash VARCHAR(128) PRIMARY KEY,
          user_id VARCHAR(64) NOT NULL,
          ip_address VARCHAR(64),
          user_agent VARCHAR(255),
          expires_at VARCHAR(40) NOT NULL,
          created_at VARCHAR(40) NOT NULL,
          INDEX idx_sessions_user (user_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
      ],
      [
        `CREATE TABLE IF NOT EXISTS company_settings (
          id TEXT PRIMARY KEY,
          company_name TEXT NOT NULL,
          legal_status TEXT NOT NULL DEFAULT 'Pre-Formation (Not Registered LLC)',
          website TEXT NOT NULL,
          affiliation TEXT NOT NULL,
          primary_email TEXT NOT NULL,
          telephone TEXT NOT NULL,
          region TEXT NOT NULL,
          timezone TEXT NOT NULL,
          currency TEXT NOT NULL,
          brand_color TEXT NOT NULL,
          logo_data_url TEXT DEFAULT '',
          business_address TEXT DEFAULT '',
          mailing_address TEXT DEFAULT '',
          tax_rate REAL DEFAULT 0,
          tax_label TEXT DEFAULT 'NC Sales Tax',
          customer_prefix TEXT DEFAULT 'KTX-CUS',
          ticket_prefix TEXT DEFAULT 'KTX-TKT',
          work_order_prefix TEXT DEFAULT 'KTX-WO',
          asset_prefix TEXT DEFAULT 'KTX-AST',
          quote_prefix TEXT DEFAULT 'KTX-QUO',
          invoice_prefix TEXT DEFAULT 'KTX-INV',
          document_prefix TEXT DEFAULT 'KTX-DOC',
          business_hours_json TEXT DEFAULT '{}',
          notification_prefs_json TEXT DEFAULT '{}',
          asset_grading_json TEXT DEFAULT '[]',
          default_theme TEXT DEFAULT 'light',
          updated_at TEXT NOT NULL
        )`,
        `CREATE TABLE IF NOT EXISTS company_settings (
          id VARCHAR(64) PRIMARY KEY,
          company_name VARCHAR(160) NOT NULL,
          legal_status VARCHAR(160) NOT NULL DEFAULT 'Pre-Formation (Not Registered LLC)',
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
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
      ],
      [
        `CREATE TABLE IF NOT EXISTS customers (
          id TEXT PRIMARY KEY,
          customer_code TEXT NOT NULL UNIQUE,
          name TEXT NOT NULL,
          organization TEXT DEFAULT '',
          email TEXT DEFAULT '',
          telephone TEXT DEFAULT '',
          billing_address TEXT DEFAULT '',
          service_address TEXT DEFAULT '',
          customer_type TEXT NOT NULL DEFAULT 'Business',
          account_status TEXT NOT NULL DEFAULT 'Active',
          assigned_rep_id TEXT,
          notes TEXT DEFAULT '',
          communication_log_json TEXT DEFAULT '[]',
          archived INTEGER DEFAULT 0,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        )`,
        `CREATE TABLE IF NOT EXISTS customers (
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
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
      ],
      [
        `CREATE TABLE IF NOT EXISTS contacts (
          id TEXT PRIMARY KEY,
          customer_id TEXT,
          full_name TEXT NOT NULL,
          title TEXT DEFAULT '',
          email TEXT DEFAULT '',
          telephone TEXT DEFAULT '',
          is_primary INTEGER DEFAULT 0,
          notes TEXT DEFAULT '',
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        )`,
        `CREATE TABLE IF NOT EXISTS contacts (
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
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
      ],
      [
        `CREATE TABLE IF NOT EXISTS leads (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          organization TEXT DEFAULT '',
          email TEXT DEFAULT '',
          telephone TEXT DEFAULT '',
          customer_type TEXT DEFAULT 'Business',
          stage TEXT NOT NULL DEFAULT 'New',
          source TEXT DEFAULT 'Direct',
          estimated_value REAL DEFAULT 0,
          assigned_rep_id TEXT,
          notes TEXT DEFAULT '',
          converted_customer_id TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        )`,
        `CREATE TABLE IF NOT EXISTS leads (
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
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
      ],
      [
        `CREATE TABLE IF NOT EXISTS services (
          id TEXT PRIMARY KEY,
          service_code TEXT NOT NULL UNIQUE,
          name TEXT NOT NULL,
          division TEXT NOT NULL,
          description TEXT DEFAULT '',
          included_work TEXT DEFAULT '',
          exclusions TEXT DEFAULT '',
          pricing_model TEXT NOT NULL DEFAULT 'Custom Quote',
          price REAL,
          estimated_duration TEXT DEFAULT '',
          delivery_mode TEXT NOT NULL DEFAULT 'On-Site & Remote',
          tax_classification TEXT NOT NULL DEFAULT 'Taxable Service',
          active INTEGER DEFAULT 1,
          publication_status TEXT NOT NULL DEFAULT 'Draft',
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        )`,
        `CREATE TABLE IF NOT EXISTS services (
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
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
      ],
      [
        `CREATE TABLE IF NOT EXISTS tickets (
          id TEXT PRIMARY KEY,
          ticket_number TEXT NOT NULL UNIQUE,
          customer_id TEXT,
          requester_name TEXT DEFAULT '',
          requester_email TEXT DEFAULT '',
          subject TEXT NOT NULL,
          description TEXT DEFAULT '',
          service_category TEXT DEFAULT 'Infrastructure',
          assigned_technician_id TEXT,
          department_id TEXT,
          priority TEXT NOT NULL DEFAULT 'Normal',
          status TEXT NOT NULL DEFAULT 'New',
          source TEXT NOT NULL DEFAULT 'Internal',
          due_date TEXT,
          resolution TEXT DEFAULT '',
          internal_notes_json TEXT DEFAULT '[]',
          activity_json TEXT DEFAULT '[]',
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        )`,
        `CREATE TABLE IF NOT EXISTS tickets (
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
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
      ],
      [
        `CREATE TABLE IF NOT EXISTS work_orders (
          id TEXT PRIMARY KEY,
          work_order_number TEXT NOT NULL UNIQUE,
          customer_id TEXT,
          ticket_id TEXT,
          service_location TEXT DEFAULT '',
          assigned_technician_id TEXT,
          requested_services TEXT NOT NULL,
          scheduled_start TEXT,
          estimated_duration_mins INTEGER DEFAULT 60,
          service_instructions TEXT DEFAULT '',
          work_performed TEXT DEFAULT '',
          parts_materials_json TEXT DEFAULT '[]',
          labor_hours REAL DEFAULT 0,
          completion_notes TEXT DEFAULT '',
          status TEXT NOT NULL DEFAULT 'Scheduled',
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        )`,
        `CREATE TABLE IF NOT EXISTS work_orders (
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
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
      ],
      [
        `CREATE TABLE IF NOT EXISTS appointments (
          id TEXT PRIMARY KEY,
          title TEXT NOT NULL,
          customer_id TEXT,
          work_order_id TEXT,
          assigned_technician_id TEXT,
          start_time TEXT NOT NULL,
          end_time TEXT NOT NULL,
          location TEXT DEFAULT '',
          appointment_type TEXT DEFAULT 'On-Site Visit',
          status TEXT NOT NULL DEFAULT 'Scheduled',
          notes TEXT DEFAULT '',
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        )`,
        `CREATE TABLE IF NOT EXISTS appointments (
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
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
      ],
      [
        `CREATE TABLE IF NOT EXISTS assets (
          id TEXT PRIMARY KEY,
          asset_code TEXT NOT NULL UNIQUE,
          asset_tag TEXT DEFAULT '',
          serial_number TEXT DEFAULT '',
          manufacturer TEXT DEFAULT '',
          model TEXT DEFAULT '',
          category TEXT NOT NULL DEFAULT 'Laptop',
          processor TEXT DEFAULT '',
          memory TEXT DEFAULT '',
          storage TEXT DEFAULT '',
          condition_grade TEXT DEFAULT 'Unassessed',
          ownership TEXT NOT NULL DEFAULT 'Company-Owned',
          customer_id TEXT,
          physical_location TEXT DEFAULT '',
          acquisition_date TEXT,
          warranty_expiration TEXT,
          status TEXT NOT NULL DEFAULT 'In Stock',
          notes TEXT DEFAULT '',
          custody_chain_json TEXT DEFAULT '[]',
          activity_json TEXT DEFAULT '[]',
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        )`,
        `CREATE TABLE IF NOT EXISTS assets (
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
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
      ],
      [
        `CREATE TABLE IF NOT EXISTS document_folders (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          category TEXT NOT NULL,
          parent_id TEXT,
          allowed_departments_json TEXT DEFAULT '[]',
          created_by TEXT,
          created_at TEXT NOT NULL
        )`,
        `CREATE TABLE IF NOT EXISTS document_folders (
          id VARCHAR(64) PRIMARY KEY,
          name VARCHAR(180) NOT NULL,
          category VARCHAR(100) NOT NULL,
          parent_id VARCHAR(64),
          allowed_departments_json TEXT,
          created_by VARCHAR(64),
          created_at VARCHAR(40) NOT NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
      ],
      [
        `CREATE TABLE IF NOT EXISTS documents (
          id TEXT PRIMARY KEY,
          document_code TEXT NOT NULL UNIQUE,
          title TEXT NOT NULL,
          file_name TEXT NOT NULL,
          stored_name TEXT NOT NULL,
          mime_type TEXT NOT NULL,
          file_size INTEGER NOT NULL,
          category TEXT NOT NULL,
          folder_id TEXT,
          customer_id TEXT,
          description TEXT DEFAULT '',
          tags_json TEXT DEFAULT '[]',
          allowed_departments_json TEXT DEFAULT '[]',
          version INTEGER NOT NULL DEFAULT 1,
          versions_json TEXT DEFAULT '[]',
          uploaded_by TEXT,
          archived INTEGER DEFAULT 0,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        )`,
        `CREATE TABLE IF NOT EXISTS documents (
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
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
      ],
      [
        `CREATE TABLE IF NOT EXISTS projects (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          code TEXT NOT NULL UNIQUE,
          description TEXT DEFAULT '',
          category TEXT DEFAULT 'Corporate',
          status TEXT NOT NULL DEFAULT 'Active',
          owner_id TEXT,
          start_date TEXT,
          target_date TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        )`,
        `CREATE TABLE IF NOT EXISTS projects (
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
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
      ],
      [
        `CREATE TABLE IF NOT EXISTS tasks (
          id TEXT PRIMARY KEY,
          project_id TEXT,
          title TEXT NOT NULL,
          description TEXT DEFAULT '',
          status TEXT NOT NULL DEFAULT 'Pending',
          priority TEXT NOT NULL DEFAULT 'Normal',
          assigned_user_id TEXT,
          due_date TEXT,
          dependencies_json TEXT DEFAULT '[]',
          subtasks_json TEXT DEFAULT '[]',
          notes TEXT DEFAULT '',
          sort_order INTEGER DEFAULT 0,
          completed_at TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        )`,
        `CREATE TABLE IF NOT EXISTS tasks (
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
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
      ],
      [
        `CREATE TABLE IF NOT EXISTS quotations (
          id TEXT PRIMARY KEY,
          quote_number TEXT NOT NULL UNIQUE,
          customer_id TEXT,
          line_items_json TEXT NOT NULL DEFAULT '[]',
          subtotal REAL NOT NULL DEFAULT 0,
          discount_amount REAL NOT NULL DEFAULT 0,
          tax_rate REAL NOT NULL DEFAULT 0,
          tax_amount REAL NOT NULL DEFAULT 0,
          total REAL NOT NULL DEFAULT 0,
          expiration_date TEXT,
          notes TEXT DEFAULT '',
          terms TEXT DEFAULT '',
          status TEXT NOT NULL DEFAULT 'Draft',
          created_by TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        )`,
        `CREATE TABLE IF NOT EXISTS quotations (
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
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
      ],
      [
        `CREATE TABLE IF NOT EXISTS invoices (
          id TEXT PRIMARY KEY,
          invoice_number TEXT NOT NULL UNIQUE,
          customer_id TEXT,
          quotation_id TEXT,
          work_order_id TEXT,
          line_items_json TEXT NOT NULL DEFAULT '[]',
          subtotal REAL NOT NULL DEFAULT 0,
          tax_rate REAL NOT NULL DEFAULT 0,
          tax_amount REAL NOT NULL DEFAULT 0,
          total REAL NOT NULL DEFAULT 0,
          due_date TEXT,
          payment_status TEXT NOT NULL DEFAULT 'Unpaid',
          payment_reference TEXT DEFAULT '',
          paid_at TEXT,
          notes TEXT DEFAULT '',
          created_by TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        )`,
        `CREATE TABLE IF NOT EXISTS invoices (
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
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
      ],
      [
        `CREATE TABLE IF NOT EXISTS expenses (
          id TEXT PRIMARY KEY,
          vendor TEXT NOT NULL,
          category TEXT NOT NULL,
          amount REAL NOT NULL DEFAULT 0,
          expense_date TEXT NOT NULL,
          description TEXT DEFAULT '',
          receipt_document_id TEXT,
          created_by TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        )`,
        `CREATE TABLE IF NOT EXISTS expenses (
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
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
      ],
      [
        `CREATE TABLE IF NOT EXISTS notifications (
          id TEXT PRIMARY KEY,
          user_id TEXT,
          title TEXT NOT NULL,
          message TEXT NOT NULL,
          category TEXT DEFAULT 'System',
          link TEXT DEFAULT '/',
          is_read INTEGER DEFAULT 0,
          created_at TEXT NOT NULL
        )`,
        `CREATE TABLE IF NOT EXISTS notifications (
          id VARCHAR(64) PRIMARY KEY,
          user_id VARCHAR(64),
          title VARCHAR(200) NOT NULL,
          message TEXT NOT NULL,
          category VARCHAR(60) DEFAULT 'System',
          link VARCHAR(255) DEFAULT '/',
          is_read TINYINT(1) DEFAULT 0,
          created_at VARCHAR(40) NOT NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
      ],
      [
        `CREATE TABLE IF NOT EXISTS audit_logs (
          id TEXT PRIMARY KEY,
          actor_id TEXT,
          actor_email TEXT,
          module TEXT NOT NULL,
          action TEXT NOT NULL,
          target_type TEXT DEFAULT '',
          target_id TEXT DEFAULT '',
          summary TEXT NOT NULL,
          ip_address TEXT DEFAULT '',
          created_at TEXT NOT NULL
        )`,
        `CREATE TABLE IF NOT EXISTS audit_logs (
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
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
      ],
      [
        `CREATE TABLE IF NOT EXISTS integrations (
          id TEXT PRIMARY KEY,
          provider_key TEXT NOT NULL UNIQUE,
          name TEXT NOT NULL,
          category TEXT NOT NULL,
          description TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'Not Configured',
          config_json TEXT DEFAULT '{}',
          updated_at TEXT NOT NULL
        )`,
        `CREATE TABLE IF NOT EXISTS integrations (
          id VARCHAR(64) PRIMARY KEY,
          provider_key VARCHAR(64) NOT NULL UNIQUE,
          name VARCHAR(160) NOT NULL,
          category VARCHAR(80) NOT NULL,
          description TEXT NOT NULL,
          status VARCHAR(40) NOT NULL DEFAULT 'Not Configured',
          config_json TEXT,
          updated_at VARCHAR(40) NOT NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
      ]
    ];

    for (const [sqliteSql, mysqlSql] of tables) {
      await this.runDDL(sqliteSql, mysqlSql);
    }
  }

  private async seedCorporateDefaults(): Promise<void> {
    const now = new Date().toISOString();

    // 1. Company Settings (Official KORTRIX defaults — not an LLC until formation completed)
    const existingSettings = await this.queryOne('SELECT id FROM company_settings WHERE id = ?', ['default']);
    if (!existingSettings) {
      await this.execute(
        `INSERT INTO company_settings (
          id, company_name, legal_status, website, affiliation, primary_email, telephone,
          region, timezone, currency, brand_color, logo_data_url, business_address, mailing_address,
          tax_rate, tax_label, customer_prefix, ticket_prefix, work_order_prefix, asset_prefix,
          quote_prefix, invoice_prefix, document_prefix, business_hours_json, notification_prefs_json,
          asset_grading_json, default_theme, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
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
          JSON.stringify({
            monday: '09:00 - 17:00',
            tuesday: '09:00 - 17:00',
            wednesday: '09:00 - 17:00',
            thursday: '09:00 - 17:00',
            friday: '09:00 - 17:00',
            saturday: 'By Appointment',
            sunday: 'Closed',
          }),
          JSON.stringify({
            ticketCreated: true,
            workOrderAssigned: true,
            quoteAccepted: true,
            invoiceOverdue: true,
            securityAuditAlerts: true,
          }),
          JSON.stringify([
            { grade: 'Grade A', label: 'Like New / Mint', criteria: 'Fully functional, negligible cosmetic wear, passes full hardware diagnostics.' },
            { grade: 'Grade B', label: 'Good / Refurbished', criteria: 'Fully functional, minor light surface wear, verified storage & memory.' },
            { grade: 'Grade C', label: 'Fair / Operational', criteria: 'Functional with visible cosmetic scuffs or battery wear under 80%.' },
            { grade: 'Grade D', label: 'Repair / Parts Only', criteria: 'Hardware fault present; queued for repair, salvage, or disposition.' },
          ]),
          'light',
          now,
        ]
      );
    }

    // 2. Official Departments (9)
    const defaultDepartments = [
      { id: 'dept-exec', name: 'Executive Leadership', code: 'EXEC', description: 'Corporate governance, strategy, and executive oversight.' },
      { id: 'dept-admin', name: 'Corporate Administration', code: 'ADMN', description: 'Legal, compliance, documentation, and internal administration.' },
      { id: 'dept-ops', name: 'Operations', code: 'OPS', description: 'Service delivery, scheduling, dispatch, and operational workflows.' },
      { id: 'dept-infra', name: 'Infrastructure', code: 'INFR', description: 'Residential IT, business IT, networking, servers, and cloud systems.' },
      { id: 'dept-sec', name: 'Security', code: 'SEC', description: 'Endpoint protection, remediation, assessments, and backup recovery.' },
      { id: 'dept-life', name: 'Lifecycle', code: 'LIFE', description: 'ITAM, auditing, refurbishment, and asset disposition coordination.' },
      { id: 'dept-dev', name: 'Software Development', code: 'DEV', description: 'Internal platforms, KORTRIX ONE engineering, and integrations.' },
      { id: 'dept-sales', name: 'Sales & Marketing', code: 'SALE', description: 'Client acquisition, proposals, branding, and lead pipeline.' },
      { id: 'dept-fin', name: 'Finance', code: 'FIN', description: 'Quotations, invoicing, expense tracking, and financial operations.' },
    ];
    for (const d of defaultDepartments) {
      const exists = await this.queryOne('SELECT id FROM departments WHERE id = ?', [d.id]);
      if (!exists) {
        await this.execute(
          `INSERT INTO departments (id, name, code, description, active, created_at, updated_at)
           VALUES (?, ?, ?, ?, 1, ?, ?)`,
          [d.id, d.name, d.code, d.description, now, now]
        );
      }
    }

    // 3. Official Roles & Granular Module Permissions (10)
    const modules = ['dashboard', 'crm', 'service_desk', 'work_orders', 'service_catalog', 'assets', 'documents', 'projects', 'finance', 'employees', 'admin'];
    const buildPerms = (level: 'all' | 'exec' | 'manager' | 'tech' | 'support' | 'sales' | 'finance' | 'employee' | 'readonly') => {
      const perms: Record<string, Record<string, boolean>> = {};
      for (const m of modules) {
        if (level === 'all') {
          perms[m] = { view: true, create: true, edit: true, delete: true, export: true, admin: true };
        } else if (level === 'exec') {
          perms[m] = { view: true, create: true, edit: true, delete: m !== 'admin', export: true, admin: m === 'admin' };
        } else if (level === 'manager') {
          perms[m] = { view: m !== 'admin', create: m !== 'admin', edit: m !== 'admin', delete: false, export: m !== 'admin', admin: false };
        } else if (level === 'tech') {
          const ops = ['dashboard', 'service_desk', 'work_orders', 'assets', 'projects', 'documents', 'service_catalog'].includes(m);
          perms[m] = { view: ops || m === 'crm', create: ops, edit: ops, delete: false, export: false, admin: false };
        } else if (level === 'support') {
          const sup = ['dashboard', 'crm', 'service_desk', 'work_orders', 'documents', 'service_catalog'].includes(m);
          perms[m] = { view: sup, create: sup, edit: sup, delete: false, export: false, admin: false };
        } else if (level === 'sales') {
          const sal = ['dashboard', 'crm', 'service_catalog', 'finance', 'documents', 'projects'].includes(m);
          perms[m] = { view: sal, create: ['crm', 'finance'].includes(m), edit: ['crm', 'finance'].includes(m), delete: false, export: m === 'crm', admin: false };
        } else if (level === 'finance') {
          const fin = ['dashboard', 'finance', 'crm', 'service_catalog', 'documents'].includes(m);
          perms[m] = { view: fin, create: m === 'finance' || m === 'documents', edit: m === 'finance', delete: false, export: m === 'finance', admin: false };
        } else if (level === 'employee') {
          const emp = ['dashboard', 'projects', 'documents', 'service_catalog'].includes(m);
          perms[m] = { view: emp, create: m === 'projects' || m === 'documents', edit: m === 'projects', delete: false, export: false, admin: false };
        } else {
          perms[m] = { view: m !== 'admin', create: false, edit: false, delete: false, export: false, admin: false };
        }
      }
      return JSON.stringify(perms);
    };

    const defaultRoles = [
      { id: 'role-owner', name: 'Owner', description: 'Unrestricted platform ownership, governance, and security authority.', level: 'all' as const },
      { id: 'role-exec', name: 'Executive', description: 'Executive leadership visibility and cross-departmental management.', level: 'exec' as const },
      { id: 'role-admin', name: 'Administrator', description: 'System administration, user provisioning, and security configuration.', level: 'all' as const },
      { id: 'role-manager', name: 'Manager', description: 'Departmental operations oversight across teams and customers.', level: 'manager' as const },
      { id: 'role-tech', name: 'Technician', description: 'Field and remote service execution, work orders, tickets, and assets.', level: 'tech' as const },
      { id: 'role-support', name: 'Support Specialist', description: 'Service desk triage, customer communication, and scheduling.', level: 'support' as const },
      { id: 'role-sales', name: 'Sales Representative', description: 'CRM pipeline, leads, customer onboarding, and quotations.', level: 'sales' as const },
      { id: 'role-finance', name: 'Finance', description: 'Quotations, invoicing, expense recording, and financial summaries.', level: 'finance' as const },
      { id: 'role-employee', name: 'Employee', description: 'Internal corporate access to projects, tasks, and shared documentation.', level: 'employee' as const },
      { id: 'role-readonly', name: 'Read Only', description: 'Auditing and read-only visibility without mutation permissions.', level: 'readonly' as const },
    ];

    for (const r of defaultRoles) {
      const exists = await this.queryOne('SELECT id FROM roles WHERE id = ?', [r.id]);
      if (!exists) {
        await this.execute(
          `INSERT INTO roles (id, name, description, is_system, permissions_json, created_at, updated_at)
           VALUES (?, ?, ?, 1, ?, ?, ?)`,
          [r.id, r.name, r.description, buildPerms(r.level), now, now]
        );
      }
    }

    // 4. Founder Account ONLY (No fictional employees)
    const founder = await this.queryOne('SELECT id FROM users WHERE email = ?', ['dylan@kortrix.com']);
    if (!founder) {
      await this.execute(
        `INSERT INTO users (
          id, email, full_name, position, department_id, role_id,
          employment_classification, responsibilities, password_hash, status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, 'Active', ?, ?)`,
        [
          'user-founder',
          'dylan@kortrix.com',
          'Dylan',
          'Founder',
          'dept-exec',
          'role-owner',
          'Founder / Principal',
          'Executive leadership, infrastructure operations, security architecture, and platform administration.',
          now,
          now,
        ]
      );
    }

    // 5. Default Document Categories (Folders)
    const defaultDocCategories = [
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
    for (const cat of defaultDocCategories) {
      const id = 'folder-' + cat.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      const exists = await this.queryOne('SELECT id FROM document_folders WHERE id = ?', [id]);
      if (!exists) {
        await this.execute(
          `INSERT INTO document_folders (id, name, category, parent_id, allowed_departments_json, created_by, created_at)
           VALUES (?, ?, ?, NULL, '[]', 'user-founder', ?)`,
          [id, cat, cat, now]
        );
      }
    }

    // 6. Official Service Catalog (All 19 official KORTRIX services — unapproved prices left NULL)
    const officialServices = [
      // KORTRIX Infrastructure (8)
      { code: 'INF-001', division: 'KORTRIX Infrastructure', name: 'Residential technical support', model: 'Hourly', mode: 'On-Site & Remote', desc: 'Hands-on troubleshooting, OS configuration, software maintenance, and technical assistance for home environments.' },
      { code: 'INF-002', division: 'KORTRIX Infrastructure', name: 'Computer and device support', model: 'Fixed Price', mode: 'On-Site & Remote', desc: 'Diagnostics, hardware upgrades, OS installation, performance optimization, and workstation setup.' },
      { code: 'INF-003', division: 'KORTRIX Infrastructure', name: 'Home networking and Wi-Fi', model: 'Custom Quote', mode: 'On-Site Only', desc: 'Router and mesh deployment, coverage optimization, structured wiring troubleshooting, and secure wireless configuration.' },
      { code: 'INF-004', division: 'KORTRIX Infrastructure', name: 'TV and audio technology', model: 'Fixed Price', mode: 'On-Site Only', desc: 'Smart display configuration, home audio integration, streaming hardware setup, and cable management.' },
      { code: 'INF-005', division: 'KORTRIX Infrastructure', name: 'Managed business IT', model: 'Recurring', mode: 'On-Site & Remote', desc: 'Ongoing operational support, workstation lifecycle oversight, patch management, and SLA-backed IT administration.' },
      { code: 'INF-006', division: 'KORTRIX Infrastructure', name: 'Network infrastructure', model: 'Custom Quote', mode: 'On-Site & Remote', desc: 'Commercial switching, firewalls, VLAN segmentation, VPN connectivity, and structured network architecture.' },
      { code: 'INF-007', division: 'KORTRIX Infrastructure', name: 'Server and cloud services', model: 'Custom Quote', mode: 'On-Site & Remote', desc: 'On-premises server administration, virtualization, Microsoft 365 tenant engineering, and hybrid cloud infrastructure.' },
      { code: 'INF-008', division: 'KORTRIX Infrastructure', name: 'Software and integrations', model: 'Hourly', mode: 'Remote Only', desc: 'Business application deployment, license alignment, API integration planning, and internal workflow tooling.' },

      // KORTRIX Security (5)
      { code: 'SEC-001', division: 'KORTRIX Security', name: 'Malware remediation', model: 'Fixed Price', mode: 'On-Site & Remote', desc: 'Containment, removal of malicious software, system integrity verification, and post-incident hardening.' },
      { code: 'SEC-002', division: 'KORTRIX Security', name: 'Endpoint protection', model: 'Per Device', mode: 'On-Site & Remote', desc: 'Deployment and policy configuration of enterprise antivirus, EDR agents, and device encryption.' },
      { code: 'SEC-003', division: 'KORTRIX Security', name: 'Security assessments', model: 'Custom Quote', mode: 'On-Site & Remote', desc: 'Structured review of network posture, identity controls, access policies, and prioritized remediation roadmaps.' },
      { code: 'SEC-004', division: 'KORTRIX Security', name: 'Account security', model: 'Per User', mode: 'Remote Only', desc: 'MFA rollout, conditional access configuration, account recovery hygiene, and identity protection.' },
      { code: 'SEC-005', division: 'KORTRIX Security', name: 'Backup and recovery', model: 'Recurring', mode: 'On-Site & Remote', desc: '3-2-1 backup architecture, cloud and local redundancy verification, and disaster recovery readiness.' },

      // KORTRIX Lifecycle (6)
      { code: 'LIF-001', division: 'KORTRIX Lifecycle', name: 'IT asset management', model: 'Per Device', mode: 'On-Site & Remote', desc: 'Inventory registration, asset tagging, warranty tracking, and lifecycle reporting for organizational hardware.' },
      { code: 'LIF-002', division: 'KORTRIX Lifecycle', name: 'Device deployment', model: 'Per Device', mode: 'On-Site & Remote', desc: 'Standardized imaging, enrollment, peripheral staging, and end-user desk readiness.' },
      { code: 'LIF-003', division: 'KORTRIX Lifecycle', name: 'Equipment auditing', model: 'Custom Quote', mode: 'On-Site Only', desc: 'Physical hardware verification, serial reconciliation, condition grading, and retirement eligibility reviews.' },
      { code: 'LIF-004', division: 'KORTRIX Lifecycle', name: 'Equipment refurbishment', model: 'Per Device', mode: 'On-Site Only', desc: 'Component testing, storage replacement, cleaning, OS reload, and grading for secondary deployment.' },
      { code: 'LIF-005', division: 'KORTRIX Lifecycle', name: 'Asset disposition coordination', model: 'Custom Quote', mode: 'On-Site Only', desc: 'Chain-of-custody documentation, decommissioning logistics, and coordination with certified recycling partners.' },
      { code: 'LIF-006', division: 'KORTRIX Lifecycle', name: 'Data sanitization coordination', model: 'Per Device', mode: 'On-Site Only', desc: 'Coordinated media wiping workflows and custody documentation prior to hardware reuse or partner disposal.' },
    ];

    for (const s of officialServices) {
      const exists = await this.queryOne('SELECT id FROM services WHERE service_code = ?', [s.code]);
      if (!exists) {
        await this.execute(
          `INSERT INTO services (
            id, service_code, name, division, description, included_work, exclusions,
            pricing_model, price, estimated_duration, delivery_mode, tax_classification,
            active, publication_status, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, '', '', ?, NULL, '', ?, 'Taxable Service', 1, 'Draft', ?, ?)`,
          ['svc-' + s.code.toLowerCase(), s.code, s.name, s.division, s.desc, s.model, s.mode, now, now]
        );
      }
    }

    // 7. Initial KORTRIX Company Launch Project & Exact Tasks (Section 11)
    const launchProject = await this.queryOne('SELECT id FROM projects WHERE id = ?', ['proj-kortrix-launch']);
    if (!launchProject) {
      await this.execute(
        `INSERT INTO projects (id, name, code, description, category, status, owner_id, start_date, target_date, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          'proj-kortrix-launch',
          'KORTRIX Company Launch',
          'KTX-PRJ-001',
          'Official foundational corporate launch roadmap tracking infrastructure, legal formation readiness, service catalog finalization, and operational launch milestones.',
          'Corporate Roadmap',
          'Active',
          'user-founder',
          now.slice(0, 10),
          null,
          now,
          now,
        ]
      );

      const completedTasks = [
        'Establish company name',
        'Acquire kortrix.com',
        'Establish logo and branding',
        'Create social media accounts',
        'Deploy corporate website',
        'Establish Microsoft 365',
        'Create corporate email and shared mailboxes',
      ];
      const pendingTasks = [
        'Finalize website functionality',
        'Configure website form delivery',
        'Complete KORTRIX ONE',
        'Establish service catalog',
        'Finalize pricing',
        'Prepare corporate documentation',
        'Prepare customer agreements',
        'Develop marketing materials',
        'Register LLC when funding is available',
        'Obtain business insurance',
        'Establish financial accounts',
        'Prepare official business launch',
      ];

      let order = 1;
      for (const title of completedTasks) {
        await this.execute(
          `INSERT INTO tasks (id, project_id, title, description, status, priority, assigned_user_id, sort_order, completed_at, created_at, updated_at)
           VALUES (?, 'proj-kortrix-launch', ?, '', 'Completed', 'Normal', 'user-founder', ?, ?, ?, ?)`,
          [`task-launch-${order}`, title, order, now, now, now]
        );
        order++;
      }
      for (const title of pendingTasks) {
        await this.execute(
          `INSERT INTO tasks (id, project_id, title, description, status, priority, assigned_user_id, sort_order, completed_at, created_at, updated_at)
           VALUES (?, 'proj-kortrix-launch', ?, '', 'Pending', ?, 'user-founder', ?, NULL, ?, ?)`,
          [
            `task-launch-${order}`,
            title,
            title === 'Complete KORTRIX ONE' || title === 'Finalize pricing' ? 'High' : 'Normal',
            order,
            now,
            now,
          ]
        );
        order++;
      }
    }

    // 8. Official Integrations Registry (Accurately marked Not Configured / Disconnected)
    const defaultIntegrations = [
      {
        key: 'microsoft_entra_id',
        name: 'Microsoft Entra ID (SSO)',
        category: 'Microsoft 365',
        description: 'Enterprise OpenID Connect / OAuth 2.0 sign-in restricted to authorized @kortrix.com Microsoft 365 accounts (Primary: dylan@kortrix.com).',
        status: process.env.AZURE_TENANT_ID && process.env.AZURE_CLIENT_ID ? 'Configured (Pending Verification)' : 'Not Configured',
        config: { primaryAccount: 'dylan@kortrix.com', requiredScopes: ['openid', 'profile', 'email', 'User.Read'] },
      },
      {
        key: 'outlook_email',
        name: 'Outlook Email (Microsoft Graph)',
        category: 'Microsoft 365',
        description: 'Least-privilege transactional email notifications and ticket replies via Microsoft Graph Mail.Send.',
        status: 'Not Configured',
        config: { primaryAccount: 'dylan@kortrix.com', requiredScopes: ['Mail.Send'] },
      },
      {
        key: 'shared_mailboxes',
        name: 'Microsoft 365 Shared Mailboxes',
        category: 'Microsoft 365',
        description: 'Inbound routing for support and operations shared mailboxes into KORTRIX ONE Service Desk.',
        status: 'Not Configured',
        config: { requiredScopes: ['Mail.Read.Shared'] },
      },
      {
        key: 'outlook_calendar',
        name: 'Outlook Calendar Sync',
        category: 'Microsoft 365',
        description: 'Two-way technician appointment and work order scheduling sync via Microsoft Graph Calendars.ReadWrite.',
        status: 'Not Configured',
        config: { requiredScopes: ['Calendars.ReadWrite'] },
      },
      {
        key: 'kortrix_public_intake',
        name: 'kortrix.com Service Request Intake API',
        category: 'Public Website',
        description: 'Authenticated write-only endpoint (POST /api/public/service-requests) for incoming website inquiries without exposing internal ticket records.',
        status: process.env.PUBLIC_INTAKE_API_KEY ? 'Active (API Key Configured)' : 'Not Configured',
        config: { endpoint: '/api/public/service-requests', header: 'X-Kortrix-Intake-Key' },
      },
      {
        key: 'cpanel_mysql',
        name: 'cPanel MySQL / MariaDB Database',
        category: 'Infrastructure',
        description: 'External relational SQL database connection configured via server-side MYSQL_* environment variables.',
        status: this.dialect === 'mysql' ? 'Connected' : 'Not Configured',
        config: { activeEngine: this.dialect },
      },
      {
        key: 'stripe_billing',
        name: 'Stripe Payment Processing',
        category: 'Finance (Planned)',
        description: 'Future online invoice payment settlement. Live payment processing is intentionally disabled in this initial release.',
        status: 'Unavailable (Planned)',
        config: {},
      },
      {
        key: 'square_pos',
        name: 'Square Payments & POS',
        category: 'Finance (Planned)',
        description: 'Future on-site residential and commercial payment acceptance. Disabled until LLC and financial accounts are established.',
        status: 'Unavailable (Planned)',
        config: {},
      },
    ];

    for (const i of defaultIntegrations) {
      const exists = await this.queryOne('SELECT id FROM integrations WHERE provider_key = ?', [i.key]);
      if (!exists) {
        await this.execute(
          `INSERT INTO integrations (id, provider_key, name, category, description, status, config_json, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          ['int-' + i.key, i.key, i.name, i.category, i.description, i.status, JSON.stringify(i.config), now]
        );
      } else if (i.key === 'cpanel_mysql' || i.key === 'kortrix_public_intake' || i.key === 'microsoft_entra_id') {
        await this.execute(
          `UPDATE integrations SET status = ?, config_json = ?, updated_at = ? WHERE provider_key = ?`,
          [i.status, JSON.stringify(i.config), now, i.key]
        );
      }
    }
  }
}

export const db = new UnifiedDatabase();

export function newId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID().slice(0, 12)}`;
}
