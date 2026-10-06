# Edu Learning

A full-stack learning platform: browse programs, pick a study plan, pay, learn in a
video classroom with AI document summaries, take quizzes, earn certificates, book
1:1 mentor sessions and join live events. Built with React + Node/Express +
MongoDB, instrumented end to end with OpenTelemetry.

---

## Features & user journeys

| Journey | Where |
|---|---|
| Discover programs: search, filter by field, sort, wishlist | `/`, `/courses`, `/wishlist` |
| Program detail: syllabus, mentor, reviews & ratings | `/courses/:courseId` |
| Sign up / log in (strong passwords, lockout after repeated failures) | `/auth` |
| Checkout: study-plan dates (any start/end, hours-per-day pace), coupons, Razorpay | `/payment/:courseId` |
| Orders history & printable invoices | `/orders`, `/orders/:orderId` |
| Learner dashboard: continue learning, progress, study-plan pacing | `/dashboard` |
| Classroom: video lessons, progress tracking, AI summaries (Vertex Gemini) | `/lms/:courseId` |
| Course quiz with results & explanations | `/lms/:courseId/quiz` |
| Certificates (printable / save as PDF) | `/certificates`, `/certificates/:courseId` |
| 1:1 mentor sessions: browse, pick a slot, book, cancel | `/mentors`, `/mentors/:mentorId`, `/bookings` |
| Live events: register, cancel, my registrations | `/events`, `/bookings` |
| Profile & settings: details, notifications, change password | `/profile` |
| Help centre: FAQ, contact form, support tickets & replies | `/support` |
| Newsletter sign-up | site footer |
| Admin console: courses CRUD, document uploads, analytics | `/admin-upload` |

Light and dark themes (toggle in the header), fully responsive down to 360px.
Every failed API call surfaces as a toast with the server message, status code and a
trace reference.

---

## Tech stack

**Frontend:** React 19 (Create React App), React Router 7, Axios, react-player, OpenTelemetry Web (traces + logs).
**Backend:** Node 22, Express 4, Mongoose 8 (MongoDB), Redis (cache + rate limits), Razorpay, Google Vertex AI (Gemini) via `@google/genai`, OpenTelemetry Node SDK (traces, metrics, logs).
**Infra (local):** Docker for MongoDB, Redis, OpenTelemetry Collector and Jaeger.

```
IMARTICUS/
├── backend/            Express API (routes/, models/, services/, middleware/)
│   ├── instrumentation.js   OpenTelemetry bootstrap (loaded first by server.js)
│   ├── server.js            app setup, security, routes, graceful shutdown
│   ├── cluster.js           production entry: one worker per CPU
│   └── seed-*.js            data seeding scripts
├── frontend/           React app (src/pages, src/components, src/services)
└── observability/      OTel Collector + Jaeger docker-compose
```

---

## Running locally

### 1. Prerequisites
- Node.js 20+ and npm
- Docker Desktop

### 2. Databases
```bash
docker run -d --name imarticus-mongo -p 27017:27017 mongo:7
docker run -d --name imarticus-redis -p 6379:6379 redis:7
```

### 3. Observability stack (optional but recommended)
```bash
docker compose -f observability/docker-compose.yml up -d
```
- Jaeger (traces): http://localhost:16686
- Logs: `observability/logs/edu-logs.jsonl` (rotated) or `docker logs -f edu-otel-collector`

### 4. Backend
```bash
cd backend
npm install
cp .env.example .env   # then fill in the values (see below)
node seed-multiple-courses.js && node seed-user.js && node fix-passwords.js
node seed-catalog.js && node seed-coupons.js && node seed-quizzes.js && node seed-mentors-events.js
npm run dev            # http://localhost:5001  (nodemon)
```

### 5. Frontend
```bash
cd frontend
npm install
echo "REACT_APP_API_URL=http://localhost:5001/api" > .env.development.local
echo "REACT_APP_OTEL_ENDPOINT=http://localhost:4318" >> .env.development.local
npm start              # http://localhost:3000
```

Demo accounts after seeding: `student@test.com` / `student123`, `admin@test.com` / `admin123`.

> Port 5000 is taken by AirPlay on macOS, which is why the API runs on 5001.

---

## Configuration

### Backend (`backend/.env`)

| Variable | Purpose |
|---|---|
| `NODE_ENV` | `development` / `production` |
| `PORT` | API port (default 5001 locally) |
| `MONGO_URI` | MongoDB connection string |
| `JWT_SECRET` | Secret for signing session tokens (required in production) |
| `REDIS_URL` or `REDIS_HOST`/`REDIS_PORT`/`REDIS_PASSWORD` | Redis for caching and shared rate limits |
| `FRONTEND_URL` | Allowed CORS origins (comma separated) |
| `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` | Payments (test keys locally) |
| `FI_VERTEX_CREDENTIALS_JSON` | Google service-account JSON (single line) for Vertex AI |
| `FI_VERTEX_PROJECT`, `FI_VERTEX_LOCATION`, `FI_REASONING_MODEL` | Vertex project, region (`global`), model (`gemini-2.5-flash`) |
| `FI_AI_ENABLED`, `FI_VISION_ENABLED` | Toggle AI summaries / send PDFs directly to Gemini |
| `WEB_CONCURRENCY` | Worker processes in production (set to the instance's CPU count) |
| `MONGO_MAX_POOL_SIZE` | Mongo connections per worker (default 50) |
| `RATE_LIMIT_*`, `AUTH_MAX_FAILED_LOGINS`, `AUTH_LOCK_MINUTES` | Rate limits and account lockout tuning |
| `LOG_LEVEL` | `debug` / `info` / `warn` / `error` |
| `OTEL_SERVICE_NAME` | e.g. `edu-learning-api` |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | OTLP/HTTP endpoint (collector or vendor); unset = telemetry off |
| `OTEL_EXPORTER_OTLP_HEADERS` | Vendor auth header if needed |
| `OTEL_TRACES_SAMPLER`, `OTEL_TRACES_SAMPLER_ARG` | e.g. `parentbased_traceidratio`, `0.1` in production |

Never commit `.env` — it holds credentials.

### Frontend (`frontend/.env.*`)

| Variable | Purpose |
|---|---|
| `REACT_APP_API_URL` | API base URL, e.g. `https://api.example.com/api` |
| `REACT_APP_OTEL_ENDPOINT` | Public OTLP/HTTP collector URL (empty = browser telemetry off) |
| `REACT_APP_OTEL_SAMPLE_RATE` | Share of sessions traced (e.g. `0.1`) |

---

## Observability (OpenTelemetry)

All three signals are exported over OTLP/HTTP to the collector (`observability/otel-collector.yaml`).

**Traces**
- Auto-instrumented: HTTP, Express routes/middleware, MongoDB, Redis, outbound fetch (Gemini, Razorpay).
- Custom spans: `ai.summarize` (model, cache hit/miss, size), payments and sign-in attributes.
- Browser: page loads and API calls; W3C `traceparent` is propagated to the API, so one trace spans browser → API → database.
- Every API response carries `x-trace-id` and `x-request-id`; error toasts show the trace reference.

**Logs** (structured, correlated by `trace_id`/`span_id`)
- One record per API request: method, route, status, duration, user id/role, client IP, user agent, request id, and the error message for 4xx/5xx.
- Every `console.*` line from the API is bridged into OTel logs, with exception type/message/stack for errors.
- Browser logs: `ui.session_start`, `ui.page_view` (route journey), `ui.api_error` (status, path, backend trace id), `ui.exception` / `ui.unhandled_rejection` (with stack).
- Sensitive keys (passwords, tokens, secrets, signatures) are redacted.

**Metrics**
- `edu.auth.sign_ins`, `edu.auth.sign_in_failures` (by reason), `edu.payments.orders_created`, `edu.enrollments`,
  `edu.ai.summaries` (by cache result), `edu.ai.summary.duration` (ms), plus runtime/HTTP metrics.

**Using a hosted backend in production** (Grafana Cloud, Honeycomb, Datadog, New Relic…): point
`OTEL_EXPORTER_OTLP_ENDPOINT` (+ `OTEL_EXPORTER_OTLP_HEADERS`) at the vendor's OTLP endpoint, or run the collector
and swap its exporters. For the browser, expose a collector endpoint with CORS for your site's origin.

---

## Production notes

- `npm start` runs `cluster.js` (one worker per CPU; crashed workers restart).
- Course list/detail responses are cached in Redis and invalidated on admin changes.
- Rate limits are Redis-backed so they hold across instances; tune with `RATE_LIMIT_*`.
- Use MongoDB Atlas M10+ and a managed Redis. Total Mongo connections = instances × `WEB_CONCURRENCY` × `MONGO_MAX_POOL_SIZE`.
- Uploaded lesson documents are stored on local disk — use a persistent disk or object storage when running multiple instances.
- Frontend hosting configs: `frontend/netlify.toml`, `frontend/vercel.json` (SPA fallback, long-cache headers for hashed assets).
- Backend: `backend/render.yaml` lists the required environment variables (secrets set in the dashboard).

---

## Useful scripts

| Command | What it does |
|---|---|
| `backend: npm run dev` | API with auto-reload |
| `backend: npm start` | Clustered production server |
| `frontend: npm start` | Dev server |
| `frontend: npm run build` | Production build |
| `frontend: CI=true npm test` | Tests |
