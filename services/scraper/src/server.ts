// ---------------------------------------------------------------------------
// Fastify HTTP server for the scraper service
// ---------------------------------------------------------------------------

import Fastify from 'fastify';
import { SCRAPER_PORT, WEBHOOK_SECRET } from './config.js';
import { scrapeQueue, type ScrapeJobData } from './queue.js';
import { HealthChecker } from './health/checker.js';
import { RedditScraper } from './scrapers/reddit.js';
import { RedditTransformer } from './transformers/reddit.js';
import { detectSignals, getRegisteredDetectors } from './signals/index.js';

// ---------------------------------------------------------------------------
// Bootstrap
// ---------------------------------------------------------------------------

const server = Fastify({
  logger: {
    level: 'info',
    transport:
      process.env.NODE_ENV !== 'production'
        ? { target: 'pino-pretty', options: { colorize: true } }
        : undefined,
  },
});

const healthChecker = new HealthChecker();

// ---------------------------------------------------------------------------
// POST /webhook/scrape — receive scrape job requests from the orchestrator
// ---------------------------------------------------------------------------

interface WebhookScrapeBody {
  source: string;
  params: Record<string, unknown>;
  priority?: number;
  triggeredBy?: string;
  analysisId?: string;
  sectionNumber?: number;
}

server.post<{ Body: WebhookScrapeBody }>('/webhook/scrape', async (request, reply) => {
  // Validate webhook secret
  const secret = request.headers['x-webhook-secret'] as string | undefined;
  if (WEBHOOK_SECRET && secret !== WEBHOOK_SECRET) {
    return reply.status(401).send({ error: 'Invalid webhook secret' });
  }

  const { source, params, priority, triggeredBy, analysisId, sectionNumber } = request.body;

  if (!source || !params) {
    return reply.status(400).send({ error: 'Missing required fields: source, params' });
  }

  const jobData: ScrapeJobData = {
    source,
    params,
    priority: priority ?? 10,
    triggeredBy: triggeredBy ?? 'webhook',
    analysisId,
    sectionNumber,
  };

  const job = await scrapeQueue.add(`scrape:${source}`, jobData, {
    priority: jobData.priority,
  });

  request.log.info({ jobId: job.id, source }, 'Scrape job enqueued');

  return reply.status(202).send({
    jobId: job.id,
    source,
    status: 'queued',
  });
});

// ---------------------------------------------------------------------------
// GET /health — scraper health status
// ---------------------------------------------------------------------------

server.get('/health', async (_request, reply) => {
  try {
    const status = await healthChecker.checkAll();
    const isHealthy = Object.values(status.sources).every(
      (s) => s.status !== 'error',
    );

    return reply.status(isHealthy ? 200 : 503).send({
      status: isHealthy ? 'healthy' : 'degraded',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      sources: status.sources,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return reply.status(503).send({
      status: 'error',
      error: message,
      timestamp: new Date().toISOString(),
    });
  }
});

// ---------------------------------------------------------------------------
// POST /scrape/reddit — direct trigger for Reddit scraping (MVP testing)
// ---------------------------------------------------------------------------

interface RedditScrapeBody {
  keywords: string[];
  subreddits?: string[];
  limit?: number;
}

server.post<{ Body: RedditScrapeBody }>('/scrape/reddit', async (request, reply) => {
  const { keywords, subreddits, limit } = request.body;

  if (!keywords || !Array.isArray(keywords) || keywords.length === 0) {
    return reply.status(400).send({ error: 'keywords must be a non-empty array' });
  }

  try {
    const scraper = new RedditScraper();
    const rawItems = await scraper.scrape({
      type: 'keyword_search',
      keywords,
      subreddits: subreddits ?? ['SaaS', 'startups', 'Entrepreneur', 'microsaas'],
      limit: limit ?? 25,
    });

    const transformer = new RedditTransformer();
    const normalized = transformer.transform(rawItems);

    request.log.info(
      { rawCount: rawItems.length, normalizedCount: normalized.length },
      'Reddit scrape completed',
    );

    return reply.send({
      status: 'ok',
      rawCount: rawItems.length,
      normalizedCount: normalized.length,
      raw: rawItems,
      normalized,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    request.log.error({ error: message }, 'Reddit scrape failed');
    return reply.status(500).send({ error: message });
  }
});

// ---------------------------------------------------------------------------
// POST /scrape/reddit/pipeline — full pipeline: scrape → transform → detect
// ---------------------------------------------------------------------------

server.post<{ Body: RedditScrapeBody }>('/scrape/reddit/pipeline', async (request, reply) => {
  const { keywords, subreddits, limit } = request.body;

  if (!keywords || !Array.isArray(keywords) || keywords.length === 0) {
    return reply.status(400).send({ error: 'keywords must be a non-empty array' });
  }

  try {
    // 1. Scrape
    const scraper = new RedditScraper();
    const rawItems = await scraper.scrape({
      type: 'keyword_search',
      keywords,
      subreddits: subreddits ?? ['SaaS', 'startups', 'Entrepreneur', 'microsaas'],
      limit: limit ?? 25,
    });

    // 2. Transform
    const transformer = new RedditTransformer();
    const normalized = transformer.transform(rawItems);

    // 3. Detect signals
    const signals = await detectSignals(normalized);

    request.log.info(
      { rawCount: rawItems.length, normalizedCount: normalized.length, signalCount: signals.length },
      'Reddit pipeline completed',
    );

    return reply.send({
      status: 'ok',
      rawCount: rawItems.length,
      normalizedCount: normalized.length,
      signalCount: signals.length,
      signals,
      normalized,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    request.log.error({ error: message }, 'Reddit pipeline failed');
    return reply.status(500).send({ error: message });
  }
});

// ---------------------------------------------------------------------------
// GET /signals/detectors — list registered signal detectors
// ---------------------------------------------------------------------------

server.get('/signals/detectors', async (_request, reply) => {
  return reply.send({
    detectors: getRegisteredDetectors(),
  });
});

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

async function start(): Promise<void> {
  try {
    await server.listen({ port: SCRAPER_PORT, host: '0.0.0.0' });
    server.log.info(`Scraper service listening on port ${SCRAPER_PORT}`);
  } catch (err) {
    server.log.fatal(err, 'Failed to start scraper service');
    process.exit(1);
  }
}

start();
