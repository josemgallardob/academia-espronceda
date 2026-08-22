import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ActivatePeopleDto,
  CreatePersonDto,
  ListPeopleQueryDto,
  UpdatePersonDto,
} from './people.dto';
import { PeopleService } from './people.service';

@Controller('api/v1/people')
export class PeopleController {
  constructor(private readonly peopleService: PeopleService) {}

  @Get()
  list(@Query() query: ListPeopleQueryDto) {
    return this.peopleService.list(query.status);
  }

  @Post()
  create(@Body() input: CreatePersonDto) {
    return this.peopleService.create(input);
  }

  @Post('activate')
  @HttpCode(HttpStatus.OK)
  activate(@Body() input: ActivatePeopleDto) {
    return this.peopleService.activate(input);
  }

  @Get(':personId')
  get(@Param('personId') personId: string) {
    return this.peopleService.get(personId);
  }

  @Patch(':personId')
  update(@Param('personId') personId: string, @Body() input: UpdatePersonDto) {
    return this.peopleService.update(personId, input);
  }

  @Delete(':personId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(@Param('personId') personId: string): Promise<void> {
    await this.peopleService.delete(personId);
  }
}
