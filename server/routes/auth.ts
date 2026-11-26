import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db.ts';
import {
  createSession,
  hashPassword,
  loadAuthUserById,
  rateLimit,
  recordAudit,
  requireAuth,
  revokeSession,
  timingSafeStringCompare,
  verifyPassword,
} from '../security.ts';

const router = Router();

const loginSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1).max(200),
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(200),
  newPassword: z.string().min(10, 'New password must be at least 10 characters.').max(200),
});

// Minimal unauthenticated status — exposes zero database internals or user records
router.get('/status', async (_req, res) => {
  try {
    const founder = await db.queryOne<any>('SELECT id, password_hash FROM users WHERE email = ?', ['dylan@kortrix.com']);
    const envPasscodeSet = Boolean(process.env.OWNER_ADMIN_PASSCODE && process.env.OWNER_ADMIN_PASSCODE.trim().length > 0);
    const entraConfigured = Boolean(process.env.AZURE_TENANT_ID && process.env.AZURE_CLIENT_ID && process.env.AZURE_CLIENT_SECRET);
    const authConfigured = envPasscodeSet || Boolean(founder?.password_hash) || entraConfigured;

    const settings = await db.queryOne<any>(
      'SELECT company_name, logo_data_url, brand_color, default_theme FROM company_settings WHERE id = ?',
      ['default']
    );

    res.json({
      authConfigured,
      entraConfigured,
      branding: {
        companyName: settings?.company_name || 'KORTRIX',
        logoDataUrl: settings?.logo_data_url || '',
        brandColor: settings?.brand_color || '#0047FF',
        defaultTheme: settings?.default_theme || 'light',
      },
    });
  } catch (err) {
    console.error('[AUTH STATUS]', err);
    res.status(500).json({ error: 'Unable to verify platform authentication status.' });
  }
});

router.post('/login', rateLimit('auth-login', 20, 15 * 60 * 1000), async (req, res) => {
  try {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Please provide a valid corporate email and password.' });
      return;
    }

    const email = parsed.data.email.toLowerCase();
    const user = await db.queryOne<any>('SELECT id, email, password_hash, status FROM users WHERE LOWER(email) = ?', [email]);
    if (!user || user.status !== 'Active') {
      await recordAudit({
        req,
        actorEmail: email,
        module: 'auth',
        action: 'login_failed',
        summary: `Failed sign-in attempt for ${email}.`,
      });
      res.status(401).json({ error: 'Invalid corporate email or password.' });
      return;
    }

    const envOwnerPasscode = process.env.OWNER_ADMIN_PASSCODE?.trim();
    let authenticated = false;

    // Configured server-side OWNER_ADMIN_PASSCODE grants Owner access for dylan@kortrix.com
    if (email === 'dylan@kortrix.com' && envOwnerPasscode) {
      authenticated = timingSafeStringCompare(parsed.data.password, envOwnerPasscode);
    }
    if (!authenticated && user.password_hash) {
      authenticated = verifyPassword(parsed.data.password, user.password_hash);
    }

    if (!authenticated) {
      await recordAudit({
        req,
        actorId: user.id,
        actorEmail: email,
        module: 'auth',
        action: 'login_failed',
        summary: `Invalid password provided for ${email}.`,
      });
      res.status(401).json({ error: 'Invalid corporate email or password.' });
      return;
    }

    const session = await createSession(user.id, req.ip || '', String(req.headers['user-agent'] || ''));
    const authUser = await loadAuthUserById(user.id);
    await recordAudit({
      req,
      actorId: user.id,
      actorEmail: email,
      module: 'auth',
      action: 'login_success',
      targetType: 'user',
      targetId: user.id,
      summary: 'Signed in to KORTRIX ONE.',
    });

    res.json({
      token: session.token,
      expiresAt: session.expiresAt,
      user: authUser,
    });
  } catch (err) {
    console.error('[AUTH LOGIN]', err);
    res.status(500).json({ error: 'Authentication failed due to a server error.' });
  }
});

router.post('/change-password', requireAuth, async (req, res) => {
  try {
    const parsed = changePasswordSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid password input.' });
      return;
    }
    const user = await db.queryOne<any>('SELECT id, email, password_hash FROM users WHERE id = ?', [req.authUser!.id]);
    if (!user) {
      res.status(404).json({ error: 'Account not found.' });
      return;
    }

    const envOwnerPasscode = process.env.OWNER_ADMIN_PASSCODE?.trim();
    let currentValid = false;
    if (user.email.toLowerCase() === 'dylan@kortrix.com' && envOwnerPasscode) {
      currentValid = timingSafeStringCompare(parsed.data.currentPassword, envOwnerPasscode);
    }
    if (!currentValid && user.password_hash) {
      currentValid = verifyPassword(parsed.data.currentPassword, user.password_hash);
    }
    if (!currentValid) {
      res.status(401).json({ error: 'Current password is incorrect.' });
      return;
    }

    const nextHash = hashPassword(parsed.data.newPassword);
    await db.execute('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?', [
      nextHash,
      new Date().toISOString(),
      user.id,
    ]);
    await recordAudit({
      req,
      module: 'auth',
      action: 'change_password',
      targetType: 'user',
      targetId: user.id,
      summary: 'Updated account password.',
    });
    res.json({ ok: true });
  } catch (err) {
    console.error('[CHANGE PASSWORD]', err);
    res.status(500).json({ error: 'Unable to update password.' });
  }
});

router.post('/logout', requireAuth, async (req, res) => {
  try {
    if (req.sessionTokenHash) {
      await revokeSession(req.sessionTokenHash);
    }
    await recordAudit({
      req,
      module: 'auth',
      action: 'logout',
      summary: 'Signed out of KORTRIX ONE.',
    });
    res.json({ ok: true });
  } catch (err) {
    console.error('[AUTH LOGOUT]', err);
    res.status(500).json({ error: 'Logout failed.' });
  }
});

router.get('/me', requireAuth, async (req, res) => {
  try {
    const unread = await db.queryOne<any>(
      'SELECT COUNT(*) AS count FROM notifications WHERE (user_id = ? OR user_id IS NULL) AND is_read = 0',
      [req.authUser!.id]
    );
    res.json({
      user: req.authUser,
      unreadNotifications: Number(unread?.count || 0),
    });
  } catch (err) {
    console.error('[AUTH ME]', err);
    res.status(500).json({ error: 'Failed to load profile.' });
  }
});

export default router;
