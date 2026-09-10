# SocialBoost

Multi-channel marketing platform for small businesses: organic social publishing,
ad creatives, WhatsApp campaigns and (later) paid campaign management.

## Requirements

- Node.js 20+
- PostgreSQL 14+
- Redis 6+

## First-time setup

```bash
# 1. Start the services
brew services start postgresql@14
brew services start redis

# 2. Create the database
createdb socialboost

# 3. Install dependencies (npm workspaces: shared, server, web)
npm install

# 4. Build the shared package — server and web both import its types
npm run build -w shared

# 5. Create the database tables
npm run db:migrate
```

Copy `.env.example` to `.env` and fill it in. `DATABASE_URL`, `JWT_SECRET` and
`TOKEN_ENCRYPTION_KEY` are required; the app refuses to boot without them.

Generate the two secrets with:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"  # JWT_SECRET
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"  # TOKEN_ENCRYPTION_KEY
```

## Running it

```bash
npm run dev
```

This starts three processes together:

| Process | Port | What it does |
|---|---|---|
| `web` | 5173 | Vite dev server — **open http://localhost:5173** |
| `api` | 3001 | Express API. `/api` calls from the web app are proxied here |
| `worker` | — | BullMQ consumer for publishing, rendering and WhatsApp sends |

Open <http://localhost:5173>, click **Sign up**, and create an account.

To run just one piece: `npm run dev:api`, `npm run dev:worker`, or `npm run dev:web`.

## Checking it works

```bash
curl http://localhost:3001/health
# {"status":"ok","uptime":...}
```

## Layout

```
shared/    Domain model, ad-template model and Zod API contracts.
           Imported by both server and web, so a payload change breaks
           the build on both sides instead of failing in production.
server/    Express API + BullMQ workers.
  src/db/          Drizzle schema and migrations
  src/http/        App wiring, auth/tenant middleware, error boundary
  src/modules/     One folder per feature (auth, connections, posts, ...)
  src/integrations/  Meta, Google, Cloudinary, Gemini, Razorpay adapters
  src/queue/       Queue definitions
web/       React + Vite + Tailwind. Capacitor wraps this build for mobile.
legacy/    The previous single-tenant app, kept as a reference for the
           Meta publishing logic being ported across. Not part of the build.
```

## Other commands

```bash
npm run typecheck              # all three packages
npm run build                  # production build
npm run db:generate            # create a migration after editing schema.ts
npm run db:migrate             # apply pending migrations
npm run db:studio              # browse the database
```

## Notes

- Credentials for connected accounts are AES-256-GCM encrypted at rest and never
  sent to the browser.
- Anything that outlives a request — Instagram video processing, template
  rendering, WhatsApp sends — runs on the worker, not in a route handler.
- `.env` is gitignored. Rotate any key that has previously been committed.
