import './lib/bigint.js';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { config } from './config.js';
import authRoutes from './routes/auth.routes.js';
import transactionRoutes from './routes/transactions.routes.js';
import portfolioRoutes from './routes/portfolio.routes.js';
import settingsRoutes from './routes/settings.routes.js';
import pricesRoutes from './routes/prices.routes.js';
import adminRoutes from './routes/admin.routes.js';
import { notFound, errorHandler } from './middleware/errorHandler.js';

export const app = express();

app.disable('x-powered-by');
app.use(helmet());
app.use(cors({ origin: config.CLIENT_ORIGIN }));
app.use(express.json({ limit: '100kb' }));

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.use('/auth', authRoutes);
app.use('/transactions', transactionRoutes);
app.use('/portfolio', portfolioRoutes);
app.use('/settings', settingsRoutes);
app.use('/prices', pricesRoutes);
app.use('/admin', adminRoutes);

app.use(notFound);
app.use(errorHandler);
