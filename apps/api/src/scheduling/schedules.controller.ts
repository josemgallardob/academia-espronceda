import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/auth.types';
import {
  toMutationResponse,
  toPublicEvaluation,
  toPublicSchedule,
  toScheduleListResponse,
} from './schedule-http.mapper';
import {
  AddAssignmentRequestDto,
  ConfirmScheduleRequestDto,
  ListSchedulesQueryDto,
  MoveAssignmentRequestDto,
  RevisionRequestDto,
  SetSubjectTeacherAllocationsRequestDto,
} from './schedules.dto';
import { SchedulesService } from './schedules.service';

@Controller('api/v1/schedules')
export class SchedulesController {
  constructor(private readonly schedules: SchedulesService) {}

  @Get()
  async list(@Query() query: ListSchedulesQueryDto) {
    return toScheduleListResponse(await this.schedules.list(query.state));
  }

  @Get('current')
  async current() {
    return toPublicSchedule(await this.schedules.getCurrent());
  }

  @Post('drafts')
  async createDraft() {
    return toPublicSchedule(await this.schedules.createEmptyDraft());
  }

  @Get(':scheduleId')
  async get(@Param('scheduleId') scheduleId: string) {
    return toPublicSchedule(await this.schedules.get(scheduleId));
  }

  @Post(':scheduleId/revisions')
  async createRevision(@Param('scheduleId') scheduleId: string) {
    return toPublicSchedule(
      await this.schedules.createRevisionFromConfirmed(scheduleId),
    );
  }

  @Post(':scheduleId/assignments')
  @HttpCode(HttpStatus.OK)
  async addAssignment(
    @Param('scheduleId') scheduleId: string,
    @Body() body: AddAssignmentRequestDto,
  ) {
    return toMutationResponse(
      await this.schedules.addAssignment(scheduleId, body),
    );
  }

  @Delete(':scheduleId/assignments/:assignmentId')
  @HttpCode(HttpStatus.OK)
  async removeAssignment(
    @Param('scheduleId') scheduleId: string,
    @Param('assignmentId') assignmentId: string,
    @Query('expectedRevision', ParseIntPipe) expectedRevision: number,
  ) {
    return toMutationResponse(
      await this.schedules.removeAssignment(scheduleId, {
        expectedRevision,
        assignmentId,
      }),
    );
  }

  @Post(':scheduleId/assignments/:assignmentId/move')
  @HttpCode(HttpStatus.OK)
  async moveAssignment(
    @Param('scheduleId') scheduleId: string,
    @Param('assignmentId') assignmentId: string,
    @Body() body: MoveAssignmentRequestDto,
  ) {
    return toMutationResponse(
      await this.schedules.moveAssignment(scheduleId, {
        expectedRevision: body.expectedRevision,
        assignmentId,
        targetTeacherId: body.targetTeacherId,
        targetSlotId: body.targetSlotId,
      }),
    );
  }

  @Put(':scheduleId/students/:studentId/subject-teacher-allocations')
  @HttpCode(HttpStatus.OK)
  async setAllocations(
    @Param('scheduleId') scheduleId: string,
    @Param('studentId') studentId: string,
    @Body() body: SetSubjectTeacherAllocationsRequestDto,
  ) {
    return toMutationResponse(
      await this.schedules.setSubjectTeacherAllocations(scheduleId, studentId, {
        expectedRevision: body.expectedRevision,
        allocations: body.allocations,
      }),
    );
  }

  @Post(':scheduleId/validate')
  @HttpCode(HttpStatus.OK)
  async validate(
    @Param('scheduleId') scheduleId: string,
    @Body() body: RevisionRequestDto,
  ) {
    const schedule = await this.schedules.validate(
      scheduleId,
      body.expectedRevision,
    );
    if (!schedule.evaluation) {
      throw new Error('Validation must persist an evaluation');
    }
    return toPublicEvaluation(schedule.evaluation);
  }

  @Post(':scheduleId/confirm')
  @HttpCode(HttpStatus.OK)
  async confirm(
    @Param('scheduleId') scheduleId: string,
    @Body() body: ConfirmScheduleRequestDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return toPublicSchedule(
      await this.schedules.confirm(scheduleId, {
        expectedRevision: body.expectedRevision,
        validationFingerprint: body.validationFingerprint,
        acceptRelaxableConflicts: body.acceptRelaxableConflicts,
        userId: user.id,
      }),
    );
  }
}
