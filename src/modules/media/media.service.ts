import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { StorageService } from '../../infrastructure/storage/storage.service';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Media } from '@prisma/client-media';
import { v4 as uuidv4 } from 'uuid';
import * as path from 'path';

@Injectable()
export class MediaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    @InjectQueue('media-processing') private readonly mediaQueue: Queue,
  ) {}



  async createPresignedUpload(userId: string, originalName: string, mimeType: string, fileSize: number): Promise<{ mediaId: string; uploadUrl: string }> {
    const fileId = uuidv4();
    const ext = path.extname(originalName) || (mimeType.includes('/') ? `.${mimeType.split('/')[1]}` : '.bin');
    const fileName = `${fileId}${ext}`;

    const uploadUrl = await this.storage.getPresignedPutUrl(fileName, mimeType, 3600);

    const media = await this.prisma.media.create({
      data: {
        id: fileId,
        file_name: fileName,
        original_name: originalName,
        mime_type: mimeType,
        file_size: BigInt(fileSize),
        storage_path: fileName,
        fallback_url: fileName,
        user_id: userId,
        status: 'pending',
      },
    });

    return { mediaId: media.id, uploadUrl };
  }

  async completeUpload(mediaId: string): Promise<Media> {
    const media = await this.getMedia(mediaId);
    
    // Verify file actually exists on MinIO
    const stat = await this.storage.statObject(media.storage_path);
    
    // Update real file size from MinIO and change status to processing
    const updatedMedia = await this.prisma.media.update({
      where: { id: mediaId },
      data: { 
        status: 'processing',
        file_size: BigInt(stat.size)
      },
    });

    await this.mediaQueue.add('process', {
      mediaId: updatedMedia.id,
      storagePath: updatedMedia.storage_path,
      mimeType: updatedMedia.mime_type,
    });

    return updatedMedia;
  }



  async listMedia(query: {
    userId?: string;
    status?: string;
    type?: string;
    page?: number;
    limit?: number;
  }): Promise<Media[]> {
    const where: any = {};

    if (query.userId) {
      where.user_id = query.userId;
    }

    if (query.status) {
      where.status = query.status;
    }

    if (query.type) {
      if (query.type === 'image' || query.type === 'video' || query.type === 'audio') {
        where.mime_type = { startsWith: `${query.type}/` };
      } else if (query.type === 'file') {
        where.NOT = [
          { mime_type: { startsWith: 'image/' } },
          { mime_type: { startsWith: 'video/' } },
          { mime_type: { startsWith: 'audio/' } },
        ];
      }
    }

    const page = query.page && query.page > 0 ? query.page : 1;
    const limit = query.limit && query.limit > 0 ? Math.min(query.limit, 100) : 20;
    const skip = (page - 1) * limit;

    return this.prisma.media.findMany({
      where,
      orderBy: { created_at: 'desc' },
      skip,
      take: limit,
    });
  }

  async getStatus(id: string): Promise<{
    id: string;
    status: string;
    metadata: any;
    mime_type: string;
    created_at: Date;
    thumbnailPath: string | null;
    duration: number | null;
  }> {
    const media = await this.getMedia(id);
    const metadata = media.metadata as any;

    // Extract duration from ffprobe metadata if available
    let duration: number | null = null;
    if (metadata?.metadata?.format?.duration) {
      duration = parseFloat(metadata.metadata.format.duration);
    } else if (metadata?.metadata?.streams) {
      const videoStream = metadata.metadata.streams.find((s: any) => s.codec_type === 'video');
      if (videoStream?.duration) {
        duration = parseFloat(videoStream.duration);
      }
    }

    return {
      id: media.id,
      status: media.status,
      metadata: metadata,
      mime_type: media.mime_type,
      created_at: media.created_at,
      thumbnailPath: (media as any).thumbnail_path ?? metadata?.thumbnail ?? null,
      duration,
    };
  }

  async getPreview(id: string): Promise<any> {
    const media = await this.getMedia(id);
    const metadata = media.metadata as any;
    const downloadUrl = await this.getDownloadUrl(id);

    return {
      id: media.id,
      fileName: media.file_name,
      originalName: media.original_name,
      mimeType: media.mime_type,
      fileSize: media.file_size.toString(),
      status: media.status,
      thumbnailPath: (media as any).thumbnail_path || metadata?.thumbnail || null,
      hlsPath: metadata?.hls_path || null,
      processedPath: metadata?.processed_path || null,
      metadata: metadata || {},
      downloadUrl,
      createdAt: media.created_at,
    };
  }

  async reprocessMedia(id: string): Promise<Media> {
    const media = await this.getMedia(id);
    const updated = await this.updateStatus(id, 'pending');
    await this.mediaQueue.add('process', {
      mediaId: media.id,
      storagePath: media.storage_path,
      mimeType: media.mime_type,
    });
    return updated;
  }

  async getMedia(id: string): Promise<Media> {
    const media = await this.prisma.media.findUnique({ where: { id } });
    if (!media) throw new NotFoundException('Không tìm thấy tệp media');
    return media;
  }

  async getDownloadUrl(id: string): Promise<string> {
    const media = await this.getMedia(id);
    return this.storage.getPresignedUrl(media.storage_path);
  }

  async deleteMedia(id: string): Promise<void> {
    const media = await this.getMedia(id);
    
    // 1. Delete from MinIO
    await this.storage.deleteFile(media.storage_path);

    // 2. Delete from DB
    await this.prisma.media.delete({ where: { id } });
  }

  async updateStatus(id: string, status: string, metadata?: any, thumbnail_path?: string, storage_path?: string, fallback_url?: string): Promise<Media> {
    const data: any = { status };
    if (metadata !== undefined) data.metadata = metadata;
    if (thumbnail_path !== undefined) data.thumbnail_path = thumbnail_path;
    if (storage_path !== undefined) data.storage_path = storage_path;
    if (fallback_url !== undefined) data.fallback_url = fallback_url;
    return this.prisma.media.update({
      where: { id },
      data,
    });
  }

  async getAccessUrls(id: string): Promise<any> {
    const media = await this.getMedia(id);
    const metadata = media.metadata as any;
    
    // Generate original URL
    const originalUrl = await this.storage.getPresignedUrl(media.storage_path);
    
    let thumbnailUrl = null;
    if ((media as any).thumbnail_path) {
      thumbnailUrl = await this.storage.getPresignedUrl((media as any).thumbnail_path);
    } else if (metadata?.thumbnail) {
      thumbnailUrl = await this.storage.getPresignedUrl(metadata.thumbnail);
    }
    
    let hlsUrl = null;
    if (metadata?.hls_path) {
      hlsUrl = await this.storage.getPresignedUrl(metadata.hls_path);
    }
    
    let fallbackUrl = null;
    if ((media as any).fallback_url) {
      fallbackUrl = await this.storage.getPresignedUrl((media as any).fallback_url);
    }
    
    return {
      original: originalUrl,
      thumbnail: thumbnailUrl,
      hls: hlsUrl,
      fallback: fallbackUrl
    };
  }

  async getRewrittenHlsPlaylist(id: string): Promise<string> {
    const media = await this.getMedia(id);
    const metadata = media.metadata as any;
    if (!metadata?.hls_path) {
      throw new NotFoundException('HLS not ready or not supported for this media');
    }
    
    // Fetch the m3u8 file content from MinIO
    const buffer = await this.storage.getFile(metadata.hls_path);
    const m3u8Text = buffer.toString('utf8');
    
    // The m3u8 file has lines like "segment_0.ts". We need to replace them with presigned URLs.
    const lines = m3u8Text.split('\n');
    const rewrittenLines = await Promise.all(lines.map(async (line) => {
      // If line is a .ts file (not a comment or empty line)
      if (line.trim() && !line.startsWith('#')) {
        const segmentPath = `hls/${id}/${line.trim()}`;
        // Generate presigned URL for the segment
        const presignedUrl = await this.storage.getPresignedUrl(segmentPath);
        return presignedUrl;
      }
      return line;
    }));
    
    return rewrittenLines.join('\n');
  }
}
