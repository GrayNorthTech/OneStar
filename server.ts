import 'dotenv/config';
import express from 'express';
import path from 'path';
import fs from 'fs';
import { db } from './server/db.ts';
import authRoutes from './server/routes/auth.ts';
import coreRoutes from './server/routes/core.ts';
import operationsRoutes from './server/routes/operations.ts';
import businessRoutes from './server/routes/business.ts';

async function startServer() {
  await db.init();
  await db.cleanupExpiredSessions();
  const status = db.getStatus();
  const isProd = process.env.NODE_ENV === 'production';
  console.log(`[KORTRIX ONE] Database initialized (${status.dialect}: ${status.database}) · mode=${isProd ? 'production' : 'development'}`);

  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  // Enterprise security headers
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    if (isProd && (req.secure || req.headers['x-forwarded-proto'] === 'https')) {
      res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }
    next();
  });

  // Never cache confidential API responses
  app.use('/api', (_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.setHeader('Pragma', 'no-cache');
    next();
  });

  app.use(express.json({ limit: '2mb' }));
  app.use(express.urlencoded({ extended: false }));

  // Minimal safe health check for uptime monitors & load balancers
  app.get('/api/health', (_req, res) => {
    const dbState = db.getStatus();
    res.status(dbState.connected ? 200 : 503).json({
      status: dbState.connected ? 'ok' : 'degraded',
      service: 'KORTRIX ONE',
    });
  });

  // Mount API routes
  app.use('/api/auth', authRoutes);
  app.use('/api', coreRoutes);
  app.use('/api', operationsRoutes);
  app.use('/api', businessRoutes);

  // Clean API 404 & production-safe error handler
  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'API endpoint not found.' });
  });

  app.use('/api', (err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error('[KORTRIX API ERROR]', err?.message || err);
    const statusCode = Number(err?.status) || 500;
    const message = isProd && statusCode >= 500 ? 'Internal server error.' : (err?.message || 'Internal server error.');
    res.status(statusCode).json({ error: message });
  });

  const distDir = path.resolve(process.cwd(), 'dist');

  if (!isProd) {
    // Dynamic import keeps Vite completely out of production runtime memory
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else if (fs.existsSync(distDir)) {
    app.use(express.static(distDir, { maxAge: '7d', index: false }));
    app.get('*', (_req, res) => {
      res.setHeader('Cache-Control', 'no-cache');
      res.sendFile(path.join(distDir, 'index.html'));
    });
  } else {
    console.warn('[KORTRIX ONE] dist/ directory missing. Run "npm run build" before starting in production mode.');
  }

  const PORT = Number(process.env.PORT || 3000);
  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`[KORTRIX ONE] Enterprise server listening on http://0.0.0.0:${PORT}`);
  });

  // Periodic expired session pruning (every 60 minutes)
  const cleanupTimer = setInterval(() => {
    db.cleanupExpiredSessions();
  }, 60 * 60 * 1000);
  cleanupTimer.unref();

  // Graceful shutdown for Docker / Cloud Run / cPanel process managers
  const shutdown = async (signal: string) => {
    console.log(`[KORTRIX ONE] Received ${signal}. Closing server and database connections...`);
    clearInterval(cleanupTimer);
    server.close(async () => {
      await db.close();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10000).unref();
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

startServer().catch((err) => {
  console.error('[KORTRIX ONE] Fatal startup error:', err);
  process.exit(1);
});
