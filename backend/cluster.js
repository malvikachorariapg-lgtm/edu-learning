// Production entry point: forks one worker per CPU (override with WEB_CONCURRENCY).
// Workers share the listening port; the primary restarts crashed workers.
require('dotenv').config();
const cluster = require('node:cluster');
const os = require('node:os');

const numWorkers = parseInt(process.env.WEB_CONCURRENCY, 10) || os.availableParallelism();

if (numWorkers <= 1 || !cluster.isPrimary) {
  require('./server');
} else {
  console.log(` Primary ${process.pid} starting ${numWorkers} workers`);

  let shuttingDown = false;
  const recentCrashes = [];

  for (let i = 0; i < numWorkers; i++) cluster.fork();

  cluster.on('exit', (worker, code, signal) => {
    if (shuttingDown) {
      if (Object.keys(cluster.workers).length === 0) process.exit(0);
      return;
    }

    console.error(` Worker ${worker.process.pid} exited (code ${code}, signal ${signal}). Restarting...`);

    // Crash-loop guard: if workers die repeatedly (e.g. bad config), stop the whole process
    const now = Date.now();
    recentCrashes.push(now);
    while (recentCrashes.length && now - recentCrashes[0] > 60000) recentCrashes.shift();
    if (recentCrashes.length > numWorkers * 5) {
      console.error(' Too many worker crashes in 60s, exiting primary');
      process.exit(1);
    }

    setTimeout(() => cluster.fork(), 1000);
  });

  const shutdown = (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(` Primary received ${signal}, stopping workers...`);
    for (const id in cluster.workers) {
      cluster.workers[id].process.kill('SIGTERM');
    }
    setTimeout(() => process.exit(0), (Number(process.env.SHUTDOWN_TIMEOUT_MS) || 10000) + 2000).unref();
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}
