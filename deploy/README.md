# Hosting on the Portainer VPS

The whole platform runs on the same VPS as the other site, as one Portainer
stack: the API (which also serves the web app), the worker, Postgres, Redis
and a nightly backup. Nginx Proxy Manager puts it on a domain with HTTPS,
exactly as it does for `dev.nadanaloga.com`.

Nothing else is needed — no Vercel, no Neon, no Upstash.

```
Browser ──HTTPS──▶ Nginx Proxy Manager ──▶ socialboost-api:3001 ──▶ socialboost-db
                                                   │                  socialboost-redis
                                                   └─ socialboost-worker (reels, scheduled posts, metrics)
```

## 1. DNS

At the domain registrar, add an **A record** for the domain (and one for
`www`) pointing at the VPS: **62.171.159.200** (the Contabo server, with
Portainer at `https://62.171.159.200:9443` and Nginx Proxy Manager at
`http://62.171.159.200:81`). Wait until `https://dnschecker.org` shows it
resolving.

## 2. Create the stack in Portainer

1. **Stacks → Add stack**, name `socialboost`.
2. Build method **Repository**:
   - Repository URL: `https://github.com/Nadanalogaa/socialMediaNew`
   - Reference: `refs/heads/main`
   - Compose path: `docker-compose.yml`
3. **Environment variables → Advanced mode** and paste the contents of
   [`stack.env.example`](stack.env.example) with the values filled in.
   `PROXY_NETWORK` must be the Docker network Nginx Proxy Manager sits on:
   **Portainer → Networks**, look for the one attached to the
   `nginx-proxy-manager` container (not `bridge`/`host`/`none`).
   The secrets are in `.env.production` on your Mac. Keep `JWT_SECRET` and
   `TOKEN_ENCRYPTION_KEY` **identical** to the current ones, or every saved
   login and every connected Facebook/Instagram account stops working.
   Leave `DATABASE_URL` and `REDIS_URL` out: the stack has its own.
4. **Deploy the stack.** The first build takes 3–5 minutes (it compiles the
   app). All five containers should turn green; `socialboost-api` becomes
   healthy once its migrations have run.

To ship a code change later: **Stacks → socialboost → Pull and redeploy**.
(Or turn on *GitOps updates* with a 5-minute poll and it deploys itself on
every push to `main`.)

## 3. Copy the database from Neon

Once, before switching the domain over. On the VPS (SSH, or Portainer's
console on any container with Docker access — SSH is simpler):

```sh
curl -fsSL https://raw.githubusercontent.com/Nadanalogaa/socialMediaNew/main/deploy/migrate-from-neon.sh -o migrate-from-neon.sh
NEON_URL='<DATABASE_URL from .env.production>' POSTGRES_PASSWORD='<the one in the stack>' sh migrate-from-neon.sh
```

It prints the row counts at the end (expect 1 user, 7 connections). The
script can be re-run safely.

## 4. Put it on the domain

In **Nginx Proxy Manager → Hosts → Proxy Hosts → Add**:

| Field | Value |
|---|---|
| Domain names | `postreels.nadanaloga.com` (your choice) |
| Scheme / Forward host / port | `http` / `socialboost-api` / `3001` |
| Websockets support | on |
| Block common exploits | on |
| SSL tab | Request a new certificate (Let's Encrypt), **Force SSL**, **HTTP/2**, **HSTS** |

Open the domain: the app should load, and `https://<domain>/api/health`
should answer `{"status":"ok"}`.

## 5. Tell Meta about the new address

In <https://developers.facebook.com/apps/> → *SocialMedia* app, replace the
old `social-media-new-omega.vercel.app` everywhere with the new domain:

- **App settings → Basic**: App domains; Privacy policy URL
  (`https://<domain>/privacy-policy.html`); Terms of service URL
  (`https://<domain>/terms-of-service.html`); User data deletion
  (`https://<domain>/data-deletion.html`); Website → Site URL.
- **Facebook Login for Business → Settings**: Valid OAuth redirect URIs,
  Allowed domains for the JavaScript SDK, Deauthorize callback URL
  (`https://<domain>/api/webhooks/meta/deauthorize`), Data deletion request URL.
- **Webhooks** (if subscribed): callback URL.

Until this is done, Facebook login works only from the old address.

## 6. Switch off Vercel

Only after steps 1–5 are verified on the new domain:

- Vercel dashboard → the project → **Settings → Delete project**.
- Neon: keep the project for a week as a fallback, then delete it.
- Upstash: delete the Redis database.

The code no longer has any Vercel-specific files; the repository builds the
same way everywhere.

## Day to day

- **Logs**: Portainer → Containers → `socialboost-api` / `socialboost-worker`
  → Logs. A reel being published shows `Publish job finished` in the worker.
- **Backups**: a dump is written every night to the `socialboost-backups`
  volume (30 kept). To restore one:
  `docker exec -i socialboost-db psql -U socialboost socialboost < dump.sql`
  (after `gunzip`).
- **Updating secrets**: Stacks → socialboost → Environment variables → Update
  the stack. Changing `TOKEN_ENCRYPTION_KEY` invalidates stored tokens.
- **Resource use**: the stack idles at ~400 MB RAM. The video pipeline
  renders in the browser, so the server does no transcoding.

## Keeping it safe

The server holds customers' Facebook and Instagram tokens.

- Only ports 22, 80, 443 and Portainer's 9443 should be open on the VPS firewall.
- The database and Redis publish no ports; they are reachable only from
  containers on the proxy network.
- The volume `socialboost-pgdata` belongs to this database alone. Never mount
  it in another container (this is how the other site's database was
  corrupted in September 2026).
- Rotate the Meta app secret, Cloudinary and Gemini keys before onboarding
  paying customers: the current values have been pasted in chats.
