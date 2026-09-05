import { Module } from '@nestjs/common';
import { MediaController } from './controllers/media.controller';
import { MediaService } from './services/media.service';
import { StorageModule } from '../../common/storage/storage.module';
import { PrismaModule } from '../../common/database/prisma.module';
import { QueueModule } from '../../common/queue/queue.module';

@Module({
  imports: [StorageModule, PrismaModule, QueueModule],
  controllers: [MediaController],
  providers: [MediaService],
})
export class MediaModule { }
