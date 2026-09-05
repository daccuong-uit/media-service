# Media Service

Media Service owns media metadata, upload records, storage paths, processing status, and the `media_db` PostgreSQL database. File processing is delegated to `media-worker` through Redis/queue infrastructure.

## Docker

From the Agent repository:

```powershell
docker compose up -d media-postgres media-service media-worker
```

Health check: `http://localhost:3003/health`.

MinIO stores media objects. PostgreSQL stores metadata only. Media does not use IAM or Social databases.

## Configuration

`.env.example` documents the local contract. Compose injects container addresses such as `media-postgres`, `redis`, and `minio`. Do not commit `.env`.

## Changes and deployment

Push to the Media repository to run CI and publish its image. Running containers do not auto-update after Git push. Update locally with:

```powershell
docker compose build media-service
docker compose up -d media-service
```

Changes to worker code require rebuilding and recreating `media-worker` separately.
