// AI Service - Vertex AI (Gemini) document summarization
// - Single lazily-created GoogleGenAI client per process
// - Summaries cached in Redis (keyed by model + document identity) and
//   concurrent requests for the same document deduped in-process
const crypto = require('crypto');
const pdfParse = require('pdf-parse');
const { getRedisClient } = require('../config/redis');
const { withSpan, counters, histograms } = require('./telemetry');

const PROMPT_VERSION = 'v1';
// Inline request payload limit on Vertex is ~20MB; base64 inflates by ~4/3
const MAX_INLINE_PDF_BYTES = 14 * 1024 * 1024;
const MAX_TEXT_CHARS = 120000;

class AIServiceError extends Error {
  constructor(message, status = 500, details = null) {
    super(message);
    this.name = 'AIServiceError';
    this.status = status;
    this.details = details;
  }
}

const getAIConfig = () => ({
  enabled: process.env.FI_AI_ENABLED === 'true',
  vision: process.env.FI_VISION_ENABLED === 'true',
  model: process.env.FI_REASONING_MODEL || 'gemini-2.5-flash',
  project: process.env.FI_VERTEX_PROJECT,
  location: process.env.FI_VERTEX_LOCATION || 'global',
  timeoutMs: Number(process.env.FI_AI_TIMEOUT_MS) || 90000,
  cacheTtlSeconds: Number(process.env.FI_SUMMARY_CACHE_TTL) || 30 * 24 * 60 * 60
});

let client = null;

// Lazy singleton - created on first use, reused for every request
const getClient = () => {
  if (client) return client;

  const { project, location } = getAIConfig();
  if (!process.env.FI_VERTEX_CREDENTIALS_JSON || !project) {
    throw new AIServiceError('AI service is not configured on the server (missing Vertex AI project or credentials).', 503);
  }

  let credentials;
  try {
    credentials = JSON.parse(process.env.FI_VERTEX_CREDENTIALS_JSON);
  } catch (e) {
    // Never echo the credential value
    throw new AIServiceError('AI service is misconfigured: FI_VERTEX_CREDENTIALS_JSON is not valid JSON.', 503);
  }

  // Loaded lazily so the app boots even if the SDK has issues and AI is disabled
  const { GoogleGenAI } = require('@google/genai');
  client = new GoogleGenAI({
    vertexai: true,
    project,
    location,
    googleAuthOptions: {
      credentials,
      scopes: ['https://www.googleapis.com/auth/cloud-platform']
    }
  });
  return client;
};

const SYSTEM_INSTRUCTION = 'You are an expert educational assistant for the Edu Learning platform. ' +
  'You write clear, accurate, well-structured study summaries that help students learn. ' +
  'Only use information contained in the provided document; do not invent facts.';

const buildPrompt = ({ lessonTitle, documentName }, sourceNote) => `Create a structured study summary of the attached course document.
Lesson: ${lessonTitle || 'N/A'}
Document: ${documentName || 'N/A'}
${sourceNote}

Format the output as plain text (it is displayed as-is, so do not use markdown bold/italics, tables or code fences). Use exactly these sections, each heading on its own line in capitals, with "•" bullets:

OVERVIEW
2-4 sentences describing what the document covers and why it matters.

KEY POINTS
5-8 bullets with the most important ideas, facts, methods or formulas.

KEY TERMS
4-8 bullets in the form "Term - short definition".

TAKEAWAYS
3-5 bullets on what a student should remember or be able to apply.

Keep it concise (about 250-450 words).`;

// Map SDK / network errors to user-friendly messages + HTTP status
const toServiceError = (error, model) => {
  if (error instanceof AIServiceError) return error;
  const status = error.status || error.code;
  const raw = (error.message || '').slice(0, 500);

  if (error.name === 'AbortError' || /abort|timed? ?out/i.test(raw)) {
    return new AIServiceError('The AI service took too long to respond. Please try again.', 504);
  }
  if (status === 401 || status === 403) {
    return new AIServiceError('AI service authentication/permission error (check the Vertex AI service account roles and that the Vertex AI API is enabled).', 502, raw);
  }
  if (status === 404) {
    return new AIServiceError(`AI model "${model}" was not found or is not available in this project/location.`, 502, raw);
  }
  if (status === 429) {
    return new AIServiceError('The AI service is busy right now. Please try again in a minute.', 503, raw);
  }
  if (status === 400) {
    return new AIServiceError('The AI service could not process this document.', 422, raw);
  }
  return new AIServiceError('Error generating summary from the AI service.', 502, raw);
};

const generate = async (parts) => {
  const { model, timeoutMs } = getAIConfig();
  const ai = getClient();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await ai.models.generateContent({
      model,
      contents: [{ role: 'user', parts }],
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        temperature: 0.3,
        maxOutputTokens: 2048,
        // Summaries don't need extended reasoning; keeps latency/cost down
        thinkingConfig: { thinkingBudget: 0 },
        abortSignal: controller.signal,
        httpOptions: { timeout: timeoutMs, retryOptions: { attempts: 2 } }
      }
    });

    const text = (response.text || '').trim();
    if (!text) {
      const reason = response.candidates?.[0]?.finishReason || 'empty response';
      throw new AIServiceError(`The AI service returned no summary (${reason}).`, 502);
    }
    return text;
  } catch (error) {
    throw toServiceError(error, model);
  } finally {
    clearTimeout(timer);
  }
};

const extractText = async (buffer) => {
  let text = '';
  try {
    const pdfData = await pdfParse(buffer);
    text = (pdfData.text || '').trim();
  } catch (e) {
    throw new AIServiceError('Could not read the PDF document.', 422, e.message);
  }
  if (!text) {
    throw new AIServiceError('No text content found in PDF (it may be a scanned document).', 400);
  }
  return text.length > MAX_TEXT_CHARS ? text.slice(0, MAX_TEXT_CHARS) : text;
};

const summarizeFromText = async (buffer, meta) => {
  const text = await extractText(buffer);
  return generate([
    { text: buildPrompt(meta, 'The document text is provided below.') },
    { text: `DOCUMENT TEXT:\n${text}` }
  ]);
};

// Summarize a PDF buffer. Vision mode sends the PDF itself (works for scanned PDFs);
// falls back to text extraction when vision is off, the file is too large, or Gemini rejects the file.
const summarizePdf = async (buffer, meta) => {
  const { vision } = getAIConfig();

  if (vision && buffer.length <= MAX_INLINE_PDF_BYTES) {
    try {
      return await generate([
        { inlineData: { mimeType: 'application/pdf', data: buffer.toString('base64') } },
        { text: buildPrompt(meta, 'The document is attached as a PDF.') }
      ]);
    } catch (error) {
      if (error.status !== 422) throw error;
      console.warn('AI vision summarization rejected the PDF, falling back to text extraction:', error.details || error.message);
    }
  }

  return summarizeFromText(buffer, meta);
};

// In-process dedupe of concurrent summaries for the same document
const inFlight = new Map();

/**
 * Get a cached summary or generate one.
 * @param {object} opts
 * @param {string} opts.documentId  stable identity of the document (path + size + mtime)
 * @param {() => Promise<Buffer>} opts.loadBuffer
 * @param {{lessonTitle: string, documentName: string}} opts.meta
 * @returns {Promise<{summary: string, cached: boolean}>}
 */
const getDocumentSummary = ({ documentId, loadBuffer, meta }) => {
  const { model, vision } = getAIConfig();
  return withSpan('ai.summarize', {
    'gen_ai.system': 'vertex_ai',
    'gen_ai.request.model': model,
    'edu.ai.mode': vision ? 'vision' : 'text',
    'edu.lesson.title': meta?.lessonTitle || ''
  }, async (span) => {
    const started = Date.now();
    const result = await summarizeWithCache({ documentId, loadBuffer, meta });
    span.setAttribute('edu.ai.cache', result.cacheResult);
    span.setAttribute('edu.ai.summary_chars', result.summary.length);
    counters.summaries.add(1, { cache: result.cacheResult, model });
    if (result.cacheResult === 'miss') histograms.aiLatency.record(Date.now() - started, { model });
    return { summary: result.summary, cached: result.cacheResult !== 'miss' };
  });
};

const summarizeWithCache = async ({ documentId, loadBuffer, meta }) => {
  const { model, vision, cacheTtlSeconds } = getAIConfig();
  const hash = crypto.createHash('sha256').update(`${documentId}|${vision ? 'vision' : 'text'}`).digest('hex');
  const cacheKey = `ai:summary:${PROMPT_VERSION}:${model}:${hash}`;

  const redis = getRedisClient();
  if (redis) {
    try {
      const cached = await redis.get(cacheKey);
      if (cached) return { summary: cached, cacheResult: 'hit' };
    } catch (e) {
      // cache read failure is non-fatal
    }
  }

  if (inFlight.has(cacheKey)) {
    const summary = await inFlight.get(cacheKey);
    return { summary, cacheResult: 'inflight' };
  }

  const promise = (async () => {
    const buffer = await loadBuffer();
    const summary = await summarizePdf(buffer, meta);
    const r = getRedisClient();
    if (r) {
      r.setex(cacheKey, cacheTtlSeconds, summary).catch(err => console.log('Summary cache set error:', err.message));
    }
    return summary;
  })();

  inFlight.set(cacheKey, promise);
  try {
    const summary = await promise;
    return { summary, cacheResult: 'miss' };
  } finally {
    inFlight.delete(cacheKey);
  }
};

module.exports = {
  AIServiceError,
  getAIConfig,
  getDocumentSummary
};
