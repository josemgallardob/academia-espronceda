import { Injectable } from '@nestjs/common';
import { TeachersRepository } from '../database/repositories/teachers.repository';

export interface TeacherOption {
  id: string;
  displayName: string;
}

@Injectable()
export class TeachersService {
  constructor(private readonly teachersRepository: TeachersRepository) {}

  async listOptions(): Promise<TeacherOption[]> {
    return (await this.teachersRepository.listActive()).map(
      ({ id, displayName }) => ({ id, displayName }),
    );
  }
}
