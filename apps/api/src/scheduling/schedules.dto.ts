import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Min,
  ValidateNested,
} from 'class-validator';
import {
  scheduleStates,
  subjectCodes,
  type ScheduleState,
  type SubjectCode,
} from '../database/schema/catalog';
import { FINGERPRINT_PATTERN } from './schedule';

export class ListSchedulesQueryDto {
  @IsOptional()
  @IsIn(scheduleStates)
  state?: ScheduleState;
}

export class RevisionRequestDto {
  @IsInt()
  @Min(0)
  expectedRevision!: number;
}

export class AddAssignmentRequestDto {
  @IsInt()
  @Min(0)
  expectedRevision!: number;

  @IsString()
  @IsNotEmpty()
  studentId!: string;

  @IsString()
  @IsNotEmpty()
  teacherId!: string;

  @IsString()
  @IsNotEmpty()
  slotId!: string;
}

export class MoveAssignmentRequestDto {
  @IsInt()
  @Min(0)
  expectedRevision!: number;

  @IsString()
  @IsNotEmpty()
  targetTeacherId!: string;

  @IsString()
  @IsNotEmpty()
  targetSlotId!: string;
}

export class SubjectHoursDto {
  @IsIn(subjectCodes)
  subjectCode!: SubjectCode;

  @IsInt()
  @Min(1)
  weeklyHours!: number;
}

export class SubjectTeacherAllocationDto {
  @IsString()
  @IsNotEmpty()
  studentId!: string;

  @IsString()
  @IsNotEmpty()
  teacherId!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique((item: SubjectHoursDto) => item.subjectCode)
  @ValidateNested({ each: true })
  @Type(() => SubjectHoursDto)
  subjectHours!: SubjectHoursDto[];

  @IsInt()
  @Min(1)
  totalHours!: number;
}

export class SetSubjectTeacherAllocationsRequestDto {
  @IsInt()
  @Min(0)
  expectedRevision!: number;

  @IsArray()
  @ArrayMinSize(2)
  @ValidateNested({ each: true })
  @Type(() => SubjectTeacherAllocationDto)
  allocations!: SubjectTeacherAllocationDto[];
}

export class ConfirmScheduleRequestDto {
  @IsInt()
  @Min(0)
  expectedRevision!: number;

  @IsString()
  @Matches(FINGERPRINT_PATTERN)
  validationFingerprint!: string;

  @IsBoolean()
  acceptRelaxableConflicts!: boolean;
}
