# Deploying the worker to a VPS

The worker is the one piece that cannot run on a serverless host: it is a
long-lived process that consumes a queue. Everything else stays where it is —
the frontend and API on Vercel, Postgres on Neon, Redis on Upstash.

**What it handles:** reels and video posts (Instagram takes ~90 seconds to
transcode), scheduled posts, and metrics refreshes. Photo posts publish inside
the request and do not need this.

## 1. Create the server

Any provider will do. For Indian latency, **DigitalOcean Bangalore** or
**Linode Mumbai**; the cheapest tier (1 GB RAM) is ample.

Choose **Ubuntu 24.04** and add your SSH key during creation.

## 2. Install Docker

```bash
ssh root@YOUR_SERVER_IP
curl -fsSL https://get.docker.com | sh
```

## 3. Copy the project across

From your own machine, in the project directory:

```bash
rsync -av --exclude node_modules --exclude .git --exclude legacy \
  ./ root@YOUR_SERVER_IP:/opt/socialboost/

# The credentials, kept out of git and copied separately.
scp .env.production root@YOUR_SERVER_IP:/opt/socialboost/.env
```

## 4. Start it

```bash
ssh root@YOUR_SERVER_IP
cd /opt/socialboost
docker compose up -d --build
docker compose logs -f worker      # expect "Worker started"
```

The worker restarts automatically if it crashes or the server reboots.

## 5. Portainer (optional)

Browse to `https://YOUR_SERVER_IP:9443` and set an admin password within a few
minutes of first start — Portainer locks itself if left unclaimed.

From there you can watch logs, restart the worker and see resource use without
needing SSH.

## Updating after a code change

```bash
rsync -av --exclude node_modules --exclude .git --exclude legacy \
  ./ root@YOUR_SERVER_IP:/opt/socialboost/
ssh root@YOUR_SERVER_IP 'cd /opt/socialboost && docker compose up -d --build'
```

## Securing it

The server holds your customers' access tokens, so treat it accordingly:

```bash
# Portainer and SSH only; nothing else needs to be reachable.
ufw allow 22/tcp && ufw allow 9443/tcp && ufw --force enable

# Unattended security updates.
apt update && apt install -y unattended-upgrades
```

Disable password SSH login in `/etc/ssh/sshd_config` (`PasswordAuthentication no`)
and rely on your key.

## Checking it is working

```bash
docker compose logs --tail=50 worker
```

A queued reel should produce `Publish job finished` within a minute or two of
being published from the app.
