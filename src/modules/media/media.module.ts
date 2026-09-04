import { Module } from '@nestjs/common';
import { MediaController } from './media.controller';
import { MediaService } from './media.service';
import { StorageModule } from '../../infrastructure/storage/storage.module';
import { PrismaModule } from '../../infrastructure/database/prisma.module';
import { QueueModule } from '../../infrastructure/queue/queue.module';

@Module({
  imports: [StorageModule, PrismaModule, QueueModule],
  controllers: [MediaController],
  providers: [MediaService],
})
export class MediaModule { }
