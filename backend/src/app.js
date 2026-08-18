import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import path from 'node:path';
import { getConfig } from './config/env.js';
import { errorHandler } from './middleware/error-handler.js';
import { notFound } from './middleware/not-found.js';
import authRoutes from './routes/auth-routes.js';
import adminRoutes from './routes/admin-routes.js';
import dashboardRoutes from './routes/dashboard-routes.js';
import cronRoutes from './routes/cron-routes.js';
import destinationChecklistRoutes from './routes/destination-checklist-routes.js';
import notificationRoutes from './routes/notification-routes.js';
import passportRoutes from './routes/passport-routes.js';
import reminderRoutes from './routes/reminder-routes.js';
import testRoutes from './routes/test-routes.js';
import travelDocumentRoutes from './routes/travel-document-routes.js';
import travelHistoryRoutes from './routes/travel-history-routes.js';
import visaRoutes from './routes/visa-routes.js';

const config = getConfig();

const visaRequirementsWidgetPolicy = [
  "default-src 'none'",
  "base-uri 'none'",
  "connect-src https://content11p.visahq.org",
  "font-src 'none'",
  "form-action 'none'",
  `frame-ancestors ${config.frontendOrigins.join(' ')}`,
  "img-src data:",
  "object-src 'none'",
  "script-src 'unsafe-inline' https://www.visahq.com",
  "style-src 'unsafe-inline'",
].join('; ');

export function createApp() {
  const app = express();

  app.set('trust proxy', 1);
  app.disable('x-powered-by');
  app.use(helmet());
  app.use(
    cors({
      credentials: true,
      exposedHeaders: ['Content-Disposition'],
      origin(origin, callback) {
        if (!origin || config.frontendOrigins.includes(origin)) {
          return callback(null, true);
        }
        return callback(new Error('Origin is not allowed by CORS'));
      },
    }),
  );
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());

  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: config.nodeEnv === 'test' ? 1000 : 100,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
  });

  app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));
  app.use('/api/cron', cronRoutes);
  app.use('/api/auth', authLimiter, authRoutes);
  app.use('/api/admin', adminRoutes);
  app.use('/api/dashboard', dashboardRoutes);
  app.use('/api/reminders', reminderRoutes);
  app.use('/api/notifications', notificationRoutes);
  app.use('/api/destination-checklists', destinationChecklistRoutes);
  app.use('/api/passports', passportRoutes);
  app.use('/api/visas', visaRoutes);
  app.use('/api/travel-documents', travelDocumentRoutes);
  app.use('/api/travel-history', travelHistoryRoutes);
  if (config.nodeEnv !== 'production') app.use('/api/test', testRoutes);

  if (config.serveFrontend) {
    app.use(express.static(config.frontendDistDirectory, {
      index: 'index.html',
      setHeaders(res, filePath) {
        if (path.basename(filePath) === 'visa-requirements-widget.html') {
          res.setHeader('Content-Security-Policy', visaRequirementsWidgetPolicy);
        }
      },
    }));
    app.use((req, res, next) => {
      const privatePathPrefixes = ['/storage', '/uploads', '/backend/storage'];
      if (
        req.method !== 'GET' ||
        req.path.startsWith('/api/') ||
        privatePathPrefixes.some((prefix) => req.path === prefix || req.path.startsWith(`${prefix}/`))
      ) {
        return next();
      }
      return res.sendFile(path.join(config.frontendDistDirectory, 'index.html'));
    });
  }

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
