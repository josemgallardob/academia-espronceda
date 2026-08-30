import { Module } from '@nestjs/common';
import { E2eResetController } from './e2e-reset.controller';

@Module({
  controllers: [E2eResetController],
})
export class E2eResetModule {}
