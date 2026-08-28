import { Injectable } from '@nestjs/common';
import { TeachersRepository } from '../database/repositories/teachers.repository';

export interface TeacherOption {
  id: string;
  displayName: string;
  availableSlotIds: string[];
}

@Injectable()
export class TeachersService {
  constructor(private readonly teachersRepository: TeachersRepository) {}

  async listOptions(): Promise<TeacherOption[]> {
    return (await this.teachersRepository.listCapabilities())
      .filter((teacher) => teacher.isActive)
      .map(({ id, displayName, availableSlotIds }) => ({
        id,
        displayName,
        availableSlotIds,
      }));
  }
}
