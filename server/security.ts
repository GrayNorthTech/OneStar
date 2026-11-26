import crypto from 'crypto';
import path from 'path';
import type { Request, Response, NextFunction } from 'express';
import { db, newId } from './db.ts';

export interface AuthUser {
  id: string;
  email: string;
  full_name: string;
  position: string;
  department_id: string | null;
  role_id: string;
  role_name: string;
  status: string;
  permissions: Record<string, Record<string, boolean>>;
}

declare global {
  namespace Express {
    interface Request {
      authUser?: AuthUser;
      sessionTokenHash?: string;
    }
  }
}

import { hashPassword, verifyPassword, timingSafeStringCompare } from './password.ts';
export { hashPassword, verifyPassword, timingSafeStringCompare };

export function hashSessionToken(rawToken: string): string {
  return crypto.createHash('sha256').update(rawToken).digest('hex');
}

export async function createSession(userId: string, ip: string, userAgent: string): Promise<{ token: string; expiresAt: string }> {
  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = hashSessionToken(rawToken);
  const now = new Date();
  const expires = new Date(now.getTime() + 12 * 60 * 60 * 1000); // 12-hour internal session
  await db.execute(
    `INSERT INTO sessions (token_hash, user_id, ip_address, user_agent, expires_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [tokenHash, userId, ip.slice(0, 60), userAgent.slice(0, 250), expires.toISOString(), now.toISOString()]
  );
  await db.execute('UPDATE users SET last_login_at = ?, updated_at = ? WHERE id = ?', [now.toISOString(), now.toISOString(), userId]);
  return { token: rawToken, expiresAt: expires.toISOString() };
}

export async function revokeSession(tokenHash: string): Promise<void> {
  await db.execute('DELETE FROM sessions WHERE token_hash = ?', [tokenHash]);
}

export async function loadAuthUserById(userId: string): Promise<AuthUser | null> {
  const row = await db.queryOne<any>(
    `SELECT u.id, u.email, u.full_name, u.position, u.department_id, u.role_id, u.status,
            r.name AS role_name, r.permissions_json
     FROM users u
     JOIN roles r ON r.id = u.role_id
     WHERE u.id = ?`,
    [userId]
  );
  if (!row || row.status !== 'Active') return null;
  let permissions: Record<string, Record<string, boolean>> = {};
  try {
    permissions = JSON.parse(row.permissions_json || '{}');
  } catch {
    permissions = {};
  }
  return {
    id: row.id,
    email: row.email,
    full_name: row.full_name,
    position: row.position || '',
    department_id: row.department_id,
    role_id: row.role_id,
    role_name: row.role_name,
    status: row.status,
    permissions,
  };
}

export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
    if (!token) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }
    const tokenHash = hashSessionToken(token);
    const session = await db.queryOne<any>('SELECT user_id, expires_at FROM sessions WHERE token_hash = ?', [tokenHash]);
    if (!session) {
      res.status(401).json({ error: 'Invalid or expired session.' });
      return;
    }
    if (new Date(session.expires_at).getTime() < Date.now()) {
      await db.execute('DELETE FROM sessions WHERE token_hash = ?', [tokenHash]);
      res.status(401).json({ error: 'Session expired. Please sign in again.' });
      return;
    }
    const user = await loadAuthUserById(session.user_id);
    if (!user) {
      res.status(403).json({ error: 'Account is deactivated or unavailable.' });
      return;
    }
    req.authUser = user;
    req.sessionTokenHash = tokenHash;
    next();
  } catch (err) {
    console.error('[KORTRIX AUTH]', err);
    res.status(500).json({ error: 'Authentication verification failed.' });
  }
}

export function requirePermission(moduleName: string, action: 'view' | 'create' | 'edit' | 'delete' | 'export' | 'admin') {
  return (req: Request, res: Response, next: NextFunction): void => {
    const user = req.authUser;
    if (!user) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }
    if (user.role_name === 'Owner') {
      next();
      return;
    }
    const allowed = Boolean(user.permissions?.[moduleName]?.[action]);
    if (!allowed) {
      res.status(403).json({ error: `Insufficient permissions (${moduleName}:${action}).` });
      return;
    }
    next();
  };
}

// Simple in-memory rate limiter for auth & public endpoints
const rateBuckets = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(keyPrefix: string, maxRequests: number, windowMs: number) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const key = `${keyPrefix}:${ip}`;
    const now = Date.now();
    const bucket = rateBuckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      rateBuckets.set(key, { count: 1, resetAt: now + windowMs });
      next();
      return;
    }
    if (bucket.count >= maxRequests) {
      res.status(429).json({ error: 'Too many requests. Please wait before retrying.' });
      return;
    }
    bucket.count += 1;
    next();
  };
}

export async function recordAudit(params: {
  req?: Request;
  actorId?: string | null;
  actorEmail?: string | null;
  module: string;
  action: string;
  targetType?: string;
  targetId?: string;
  summary: string;
}): Promise<void> {
  const actorId = params.actorId ?? params.req?.authUser?.id ?? null;
  const actorEmail = params.actorEmail ?? params.req?.authUser?.email ?? 'system';
  const ip = params.req?.ip || params.req?.socket?.remoteAddress || '';
  try {
    await db.execute(
      `INSERT INTO audit_logs (id, actor_id, actor_email, module, action, target_type, target_id, summary, ip_address, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        newId('aud'),
        actorId,
        actorEmail,
        params.module,
        params.action,
        params.targetType || '',
        params.targetId || '',
        params.summary,
        ip.slice(0, 60),
        new Date().toISOString(),
      ]
    );
  } catch (err) {
    console.error('[KORTRIX AUDIT] Failed to write audit log:', err);
  }
}

export async function generateNextCode(table: string, column: string, prefix: string): Promise<string> {
  // Whitelist table and column names to strictly prevent SQL injection
  const allowedTargets: Record<string, string> = {
    customers: 'customer_code',
    tickets: 'ticket_number',
    work_orders: 'work_order_number',
    assets: 'asset_code',
    quotations: 'quote_number',
    invoices: 'invoice_number',
    documents: 'document_code',
    projects: 'code',
  };
  if (allowedTargets[table] !== column) {
    throw new Error('Invalid code sequence target');
  }
  const rows = await db.query<any>(`SELECT ${column} AS code FROM ${table}`);
  let maxNum = 0;
  const escaped = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`^${escaped}-(\\d+)$`);
  for (const r of rows) {
    const match = String(r.code || '').match(regex);
    if (match) {
      const n = parseInt(match[1], 10);
      if (n > maxNum) maxNum = n;
    }
  }
  return `${prefix}-${String(maxNum + 1).padStart(4, '0')}`;
}

export function resolveConfinedUploadPath(baseDir: string, storedName: string): string | null {
  if (!storedName || storedName.includes('/') || storedName.includes('\\') || storedName.includes('..')) {
    return null;
  }
  const resolvedBase = path.resolve(baseDir);
  const resolvedTarget = path.resolve(resolvedBase, storedName);
  if (!resolvedTarget.startsWith(resolvedBase + path.sep)) {
    return null;
  }
  return resolvedTarget;
}
