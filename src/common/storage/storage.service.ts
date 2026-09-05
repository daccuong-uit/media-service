import { Injectable, OnModuleInit, InternalServerErrorException } from '@nestjs/common';
import * as Minio from 'minio';
import { appConfig } from '../../config/app.config';
import { createLogger } from '@platform/logger';

const logger = createLogger({ service: 'media-service:storage' });

@Injectable()
export class StorageService implements OnModuleInit {
  private minioClient: Minio.Client;

  constructor() {
    this.minioClient = new Minio.Client({
      endPoint: appConfig.MINIO_ENDPOINT,
      port: appConfig.MINIO_PORT,
      useSSL: appConfig.MINIO_USE_SSL,
      accessKey: appConfig.MINIO_ACCESS_KEY,
      secretKey: appConfig.MINIO_SECRET_KEY,
    });
  }

  async onModuleInit() {
    await this.ensureBucketExists();
  }

  private async ensureBucketExists() {
    const bucketName = appConfig.MINIO_BUCKET;
    try {
      const exists = await this.minioClient.bucketExists(bucketName);
      if (!exists) {
        await this.minioClient.makeBucket(bucketName);
        logger.info(`Bucket "${bucketName}" created successfully.`);
      }
    } catch (error: any) {
      logger.error(`Error ensuring bucket exists: ${error.message}`);
      throw new InternalServerErrorException('Storage initialization failed');
    }
  }

  async uploadFile(fileName: string, buffer: Buffer, size: number, mimeType: string) {
    try {
      await this.minioClient.putObject(
        appConfig.MINIO_BUCKET,
        fileName,
        buffer,
        size,
        { 'Content-Type': mimeType }
      );
      return fileName;
    } catch (error: any) {
      logger.error(`Error uploading file to MinIO: ${error.message}`);
      throw new InternalServerErrorException('File upload failed');
    }
  }

  async uploadStream(fileName: string, stream: any, size?: number, mimeType?: string) {
    try {
      await this.minioClient.putObject(
        appConfig.MINIO_BUCKET,
        fileName,
        stream,
        size,
        { 'Content-Type': mimeType || 'application/octet-stream' }
      );
      return fileName;
    } catch (error: any) {
      logger.error(`Error uploading stream to MinIO: ${error.message}`);
      throw new InternalServerErrorException('Stream upload failed');
    }
  }

  async getFile(fileName: string): Promise<Buffer> {
    try {
      const stream = await this.getFileStream(fileName);
      return new Promise((resolve, reject) => {
        const chunks: any[] = [];
        stream.on('data', (chunk: any) => chunks.push(chunk));
        stream.on('error', (err: any) => reject(err));
        stream.on('end', () => resolve(Buffer.concat(chunks)));
      });
    } catch (error: any) {
      logger.error(`Error getting file from MinIO: ${error.message}`);
      throw new InternalServerErrorException('Failed to retrieve file');
    }
  }

  async getFileStream(fileName: string): Promise<any> {
    try {
      return await this.minioClient.getObject(appConfig.MINIO_BUCKET, fileName);
    } catch (error: any) {
      logger.error(`Error getting file stream from MinIO: ${error.message}`);
      throw new InternalServerErrorException('Failed to retrieve file stream');
    }
  }

  /**
   * Stream a byte range of an object from MinIO without buffering.
   * Uses MinIO SDK's getPartialObject(bucket, object, offset, length).
   *
   * @param fileName  Object name in MinIO
   * @param offset    First byte to read (0-based, inclusive)
   * @param length    Number of bytes to read. 0 means read to end of object.
   */
  async getFileStreamRange(fileName: string, offset: number, length: number): Promise<any> {
    try {
      return await this.minioClient.getPartialObject(
        appConfig.MINIO_BUCKET,
        fileName,
        offset,
        length,
      );
    } catch (error: any) {
      logger.error(`Error getting partial object from MinIO: ${error.message}`);
      throw new InternalServerErrorException('Failed to retrieve partial file stream');
    }
  }


  async getPresignedUrl(fileName: string, expiry: number = 3600) {
    try {
      return await this.minioClient.presignedGetObject(appConfig.MINIO_BUCKET, fileName, expiry);
    } catch (error: any) {
      logger.error(`Error generating presigned URL: ${error.message}`);
      throw new InternalServerErrorException('Failed to generate download URL');
    }
  }

  async deleteFile(fileName: string) {
    try {
      await this.minioClient.removeObject(appConfig.MINIO_BUCKET, fileName);
    } catch (error: any) {
      logger.error(`Error deleting file from MinIO: ${error.message}`);
      throw new InternalServerErrorException('File deletion failed');
    }
  }

  async getPresignedPutUrl(fileName: string, mimeType: string, expiry: number = 3600) {
    try {
      // Dùng presignedPutObject của MinIO SDK
      return await this.minioClient.presignedPutObject(
        appConfig.MINIO_BUCKET,
        fileName,
        expiry
      );
    } catch (error: any) {
      logger.error(`Error generating presigned PUT URL: ${error.message}`);
      throw new InternalServerErrorException('Failed to generate upload URL');
    }
  }

  async statObject(fileName: string) {
    try {
      return await this.minioClient.statObject(appConfig.MINIO_BUCKET, fileName);
    } catch (error: any) {
      logger.error(`Error getting object stats from MinIO for ${fileName}: ${error.message}`);
      throw new InternalServerErrorException('Failed to verify object existence on MinIO');
    }
  }
}
