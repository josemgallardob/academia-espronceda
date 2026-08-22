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
  Min,
  ValidateNested,
} from 'class-validator';
import {
  courseCodes,
  personStatuses,
  subjectCodes,
  type CourseCode,
  type PersonStatus,
  type SubjectCode,
} from '../database/schema/catalog';

export class SubjectHoursDto {
  @IsIn(subjectCodes)
  subjectCode!: SubjectCode;

  @IsInt()
  @Min(1)
  weeklyHours!: number;
}

export class CreatePersonDto {
  @IsString()
  @IsNotEmpty()
  firstName!: string;

  @IsString()
  @IsNotEmpty()
  firstSurname!: string;

  @IsOptional()
  @IsString()
  secondSurname?: string | null;

  @IsIn(courseCodes)
  courseCode!: CourseCode;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique((subject: SubjectHoursDto) => subject.subjectCode)
  @ValidateNested({ each: true })
  @Type(() => SubjectHoursDto)
  subjectHours!: SubjectHoursDto[];

  @IsInt()
  @Min(1)
  weeklyHoursTotal!: number;

  @IsOptional()
  @IsString()
  schoolName?: string | null;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  unavailableSlotIds?: string[];

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  relatedPersonIds?: string[];

  @IsString()
  @IsNotEmpty()
  primaryPhone!: string;

  @IsOptional()
  @IsString()
  secondaryPhone?: string | null;

  @IsBoolean()
  isTutored!: boolean;

  @IsOptional()
  @IsString()
  tutorFullName?: string | null;

  @IsOptional()
  @IsString()
  comments?: string | null;

  @IsIn(personStatuses)
  status!: PersonStatus;
}

export class UpdatePersonDto {
  @IsOptional()
  @IsString()
  firstName?: string;

  @IsOptional()
  @IsString()
  firstSurname?: string;

  @IsOptional()
  @IsString()
  secondSurname?: string | null;

  @IsOptional()
  @IsIn(courseCodes)
  courseCode?: CourseCode;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique((subject: SubjectHoursDto) => subject.subjectCode)
  @ValidateNested({ each: true })
  @Type(() => SubjectHoursDto)
  subjectHours?: SubjectHoursDto[];

  @IsOptional()
  @IsInt()
  @Min(1)
  weeklyHoursTotal?: number;

  @IsOptional()
  @IsString()
  schoolName?: string | null;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  unavailableSlotIds?: string[];

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  relatedPersonIds?: string[];

  @IsOptional()
  @IsString()
  primaryPhone?: string;

  @IsOptional()
  @IsString()
  secondaryPhone?: string | null;

  @IsOptional()
  @IsBoolean()
  isTutored?: boolean;

  @IsOptional()
  @IsString()
  tutorFullName?: string | null;

  @IsOptional()
  @IsString()
  comments?: string | null;
}

export class ListPeopleQueryDto {
  @IsOptional()
  @IsIn(personStatuses)
  status?: PersonStatus;
}

export class ActivatePeopleDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique()
  @IsString({ each: true })
  personIds!: string[];
}
