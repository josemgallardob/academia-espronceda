import { Controller, Get } from '@nestjs/common';
import { TeachersService } from './teachers.service';

@Controller('api/v1/teachers')
export class TeachersController {
  constructor(private readonly teachersService: TeachersService) {}

  @Get()
  listOptions() {
    return this.teachersService.listOptions();
  }
}
