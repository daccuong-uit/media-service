import { z } from 'zod';

const configSchema = z.object({
  PORT: z.coerce.number().default(3003),
  NODE_ENV: z.string().default('development'),
  DATABASE_URL: z.string(),
  REDIS_URL: z.string(),
  CORS_ORIGIN: z.string().default('*'),
  MINIO_ENDPOINT: z.string(),
  MINIO_PORT: z.coerce.number().default(9000),
  MINIO_USE_SSL: z.preprocess((val) => val === 'true', z.boolean()).default(false),
  MINIO_ACCESS_KEY: z.string(),
  MINIO_SECRET_KEY: z.string(),
  MINIO_BUCKET: z.string().default('media'),
});

const env = configSchema.parse({
  PORT: process.env.MEDIA_SERVICE_PORT,
  NODE_ENV: process.env.NODE_ENV,
  DATABASE_URL: process.env.MEDIA_DATABASE_URL,
  REDIS_URL: process.env.REDIS_URL,
  CORS_ORIGIN: process.env.CORS_ORIGIN,
  MINIO_ENDPOINT: process.env.MINIO_ENDPOINT,
  MINIO_PORT: process.env.MINIO_PORT,
  MINIO_USE_SSL: process.env.MINIO_USE_SSL,
  MINIO_ACCESS_KEY: process.env.MINIO_ACCESS_KEY,
  MINIO_SECRET_KEY: process.env.MINIO_SECRET_KEY,
  MINIO_BUCKET: process.env.MINIO_BUCKET,
});

export const appConfig = env;
export type AppConfig = typeof env;
