import { config } from './config.js';
import { app } from './app.js';
import { prisma } from './lib/prisma.js';

const server = app.listen(config.PORT, () => {
  console.log(`API listening on http://localhost:${config.PORT}`);
});

let shuttingDown = false;

async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`${signal} received, shutting down...`);

  // Force exit if connections don't drain in time.
  const timer = setTimeout(() => process.exit(1), 10_000);
  timer.unref();

  server.close(async (err) => {
    await prisma.$disconnect();
    process.exit(err ? 1 : 0);
  });
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
