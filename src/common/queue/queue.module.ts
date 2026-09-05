import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { appConfig } from '../../config/app.config';

@Module({
  imports: [
    BullModule.forRoot({
      connection: {
        host: new URL(appConfig.REDIS_URL).hostname,
        port: parseInt(new URL(appConfig.REDIS_URL).port),
        password: new URL(appConfig.REDIS_URL).password,
      },
    }),
    BullModule.registerQueue({
      name: 'media-processing',
    }),
  ],
  exports: [BullModule],
})
export class QueueModule { }
