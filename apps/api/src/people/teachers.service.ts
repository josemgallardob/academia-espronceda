import { Injectable } from '@nestjs/common';
import { TeachersRepository } from '../database/repositories/teachers.repository';
import type { CourseCode, SubjectCode } from '../database/schema/catalog';

export interface TeacherOption {
  id: string;
  displayName: string;
  availableSlotIds: string[];
  subjectCodes: SubjectCode[];
  courseCodes: CourseCode[];
}

@Injectable()
export class TeachersService {
  constructor(private readonly teachersRepository: TeachersRepository) {}

  async listOptions(): Promise<TeacherOption[]> {
    return (await this.teachersRepository.listCapabilities())
      .filter((teacher) => teacher.isActive)
      .map(
        ({ id, displayName, availableSlotIds, subjectCodes, courseCodes }) => ({
          id,
          displayName,
          availableSlotIds,
          subjectCodes,
          courseCodes,
        }),
      );
  }
}
