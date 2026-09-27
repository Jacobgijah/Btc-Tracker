import { ZodError } from 'zod';
import { Prisma } from '@prisma/client';
import { InsufficientHoldingsError } from '../services/portfolio.engine.js';

export function notFound(req, res) {
  res.status(404).json({ error: `Not found: ${req.method} ${req.originalUrl}` });
}

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  if (err instanceof ZodError) {
    const { formErrors, fieldErrors } = err.flatten();
    return res.status(400).json({ error: 'Validation failed', fieldErrors, formErrors });
  }

  if (err instanceof InsufficientHoldingsError) {
    return res.status(422).json({
      error: err.message,
      details: {
        transactionId: err.transactionId,
        date: err.date.toISOString(),
        attemptedSats: err.attemptedSats,
        availableSats: err.availableSats,
      },
    });
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
    return res.status(404).json({ error: 'Record not found' });
  }

  // Malformed JSON bodies / oversize payloads from express.json()
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Malformed JSON body' });
  }
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ error: 'Request body too large' });
  }

  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
}
