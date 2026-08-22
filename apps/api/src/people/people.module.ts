import { Module } from '@nestjs/common';
import { PeopleController } from './people.controller';
import { PeopleService } from './people.service';
import { TeachersController } from './teachers.controller';
import { TeachersService } from './teachers.service';

@Module({
  controllers: [PeopleController, TeachersController],
  providers: [PeopleService, TeachersService],
})
export class PeopleModule {}
