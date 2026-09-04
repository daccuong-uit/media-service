import {
  Controller,
  Post,
  Get,
  Delete,
  Param,
  Query,
  UseInterceptors,
  UploadedFile,
  ParseUUIDPipe,
  Header,
  Body,
  Res,
  Req,
  Headers,
} from '@nestjs/common';
import { Response, Request } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiConsumes, ApiBody, ApiResponse, ApiHeader, ApiQuery } from '@nestjs/swagger';
import { MediaService } from './media.service';

@ApiTags('media')
@Controller('media')
export class MediaController {
  constructor(private readonly mediaService: MediaService) {}

  @Post('presigned-upload')
  @ApiOperation({ summary: 'Get a presigned URL to upload a file directly to MinIO' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        originalName: { type: 'string' },
        mimeType: { type: 'string' },
        fileSize: { type: 'number' },
        userId: { type: 'string' },
      },
    },
  })
  async getPresignedUpload(
    @Body() body: { originalName: string; mimeType: string; fileSize: number; userId?: string },
    @Headers('x-user-id') userIdFromHeader: string,
    @Req() req: any,
  ) {
    const userId = userIdFromHeader || body.userId || req.user?.id || '00000000-0000-0000-0000-000000000000';
    return this.mediaService.createPresignedUpload(userId, body.originalName, body.mimeType, body.fileSize);
  }

  @Post(':id/complete')
  @ApiOperation({ summary: 'Complete a direct upload and start processing' })
  async completeUpload(@Param('id', ParseUUIDPipe) id: string) {
    const media = await this.mediaService.completeUpload(id);
    return {
      id: media.id,
      fileName: media.file_name,
      status: media.status,
    };
  }


  @Get()
  @ApiOperation({ summary: 'List media items' })
  @ApiQuery({ name: 'userId', required: false, type: 'string' })
  @ApiQuery({ name: 'status', required: false, type: 'string', enum: ['pending', 'processing', 'ready', 'failed'] })
  @ApiQuery({ name: 'type', required: false, type: 'string', enum: ['image', 'video', 'audio', 'file'] })
  @ApiQuery({ name: 'page', required: false, type: 'number' })
  @ApiQuery({ name: 'limit', required: false, type: 'number' })
  async listMedia(
    @Query('userId') userId?: string,
    @Query('status') status?: string,
    @Query('type') type?: string,
    @Query('page') page = '1',
    @Query('limit') limit = '20',
  ) {
    const pageNumber = Math.max(1, Number(page) || 1);
    const limitNumber = Math.min(100, Math.max(1, Number(limit) || 20));
    const items = await this.mediaService.listMedia({
      userId,
      status,
      type,
      page: pageNumber,
      limit: limitNumber,
    });

    return {
      items: items.map((media) => ({
        id: media.id,
        fileName: media.file_name,
        originalName: media.original_name,
        mimeType: media.mime_type,
        fileSize: media.file_size.toString(),
        status: media.status,
        createdAt: media.created_at,
      })),
      page: pageNumber,
      limit: limitNumber,
      count: items.length,
    };
  }

  @Get(':id/status')
  @ApiOperation({ summary: 'Get media processing status' })
  async getStatus(@Param('id', ParseUUIDPipe) id: string) {
    return this.mediaService.getStatus(id);
  }

  @Get(':id/preview')
  @ApiOperation({ summary: 'Get preview information for media' })
  async getPreview(@Param('id', ParseUUIDPipe) id: string) {
    return this.mediaService.getPreview(id);
  }

  @Post(':id/reprocess')
  @ApiOperation({ summary: 'Reprocess media file' })
  async reprocessMedia(@Param('id', ParseUUIDPipe) id: string) {
    return this.mediaService.reprocessMedia(id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get media metadata' })
  @ApiResponse({ status: 200, description: 'Returns media metadata' })
  @ApiResponse({ status: 404, description: 'Media not found' })
  async getMetadata(@Param('id', ParseUUIDPipe) id: string) {
    const media = await this.mediaService.getMedia(id);
    return {
      id: media.id,
      fileName: media.file_name,
      originalName: media.original_name,
      mimeType: media.mime_type,
      fileSize: media.file_size.toString(),
      status: media.status,
      createdAt: media.created_at,
    };
  }

  @Get(':id/access')
  @ApiOperation({ summary: 'Get direct access URLs (presigned) for media' })
  @ApiResponse({ status: 200, description: 'Returns access URLs' })
  async getAccessUrls(@Param('id', ParseUUIDPipe) id: string) {
    return this.mediaService.getAccessUrls(id);
  }


  @Get(':id/hls/index.m3u8')
  @ApiOperation({ summary: 'Get HLS playlist with rewritten presigned segment URLs' })
  @ApiResponse({ status: 200, description: 'M3U8 playlist for HLS streaming' })
  @ApiResponse({ status: 404, description: 'HLS not available for this media' })
  async getHlsPlaylist(@Param('id', ParseUUIDPipe) id: string, @Res() res: Response) {
    const playlistText = await this.mediaService.getRewrittenHlsPlaylist(id);
    res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
    res.send(playlistText);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a media file' })
  @ApiResponse({ status: 200, description: 'Media deleted successfully' })
  @ApiResponse({ status: 404, description: 'Media not found' })
  async delete(@Param('id', ParseUUIDPipe) id: string) {
    await this.mediaService.deleteMedia(id);
    return { success: true };
  }

  @Post(':id/status')
  @ApiOperation({ summary: 'Update media processing status (Internal)' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: ['pending', 'processing', 'ready', 'failed'] },
        metadata: { type: 'object' },
        thumbnail_path: { type: 'string' },
        storage_path: { type: 'string' },
        fallback_url: { type: 'string' },
      },
    },
  })
  async updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { status: string; metadata?: any; thumbnail_path?: string; storage_path?: string; fallback_url?: string },
  ) {
    return this.mediaService.updateStatus(id, body.status, body.metadata, body.thumbnail_path, body.storage_path, body.fallback_url);
  }
}
