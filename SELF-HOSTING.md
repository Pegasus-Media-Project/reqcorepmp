# Self-Hosting Reqcore

Reqcore is open-source and self-hostable. This is a DIY path, provided best-effort and without support or an SLA — the Reqcore team's own support and uptime commitments apply only to the hosted cloud product at [reqcore.com](https://reqcore.com). The reference path below uses Docker Compose to run the app, PostgreSQL, and S3-compatible object storage together.

Code under [`ee/`](ee) is licensed separately (see [`ee/LICENSE`](ee/LICENSE)) and gates itself behind the same plan checks as the hosted product; without your own billing configured, those features stay locked.

## Quick Start

```bash
mkdir reqcore && cd reqcore
curl -fsSLO https://raw.githubusercontent.com/reqcore-inc/reqcore/main/docker-compose.production.yml
curl -fsSLO https://raw.githubusercontent.com/reqcore-inc/reqcore/main/setup.sh
chmod +x setup.sh
./setup.sh
docker compose -f docker-compose.production.yml up -d
```

Open [http://localhost:3000](http://localhost:3000) and create the first account.

## Updates

```bash
docker compose -f docker-compose.production.yml pull app
docker compose -f docker-compose.production.yml up -d
```

Updates keep your database volume and uploaded files intact. Always back up the Postgres and MinIO volumes before major upgrades.

For architecture and deployment details, see [ARCHITECTURE.md](ARCHITECTURE.md).
