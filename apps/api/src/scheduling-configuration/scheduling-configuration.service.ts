import { Injectable } from '@nestjs/common';
import { WeeklySlotsRepository } from '../database/repositories/weekly-slots.repository';
import type { CourseCode, SubjectCode } from '../database/schema/catalog';

const courseLabels: Record<CourseCode, string> = {
  ESO_1: '1.º ESO',
  ESO_2: '2.º ESO',
  ESO_3: '3.º ESO',
  ESO_4: '4.º ESO',
  BACH_1: '1.º Bachillerato',
  BACH_2: '2.º Bachillerato',
  OTHER: 'Otro',
};

const subjectLabels: Record<SubjectCode, string> = {
  MATHEMATICS: 'Matemáticas',
  SOCIAL_SCIENCES_MATHEMATICS: 'Matemáticas CC. SS.',
  PHYSICS: 'Física',
  CHEMISTRY: 'Química',
  BIOLOGY: 'Biología',
  SPANISH_LANGUAGE: 'Lengua castellana',
  ENGLISH: 'Inglés',
};

@Injectable()
export class SchedulingConfigurationService {
  constructor(private readonly weeklySlotsRepository: WeeklySlotsRepository) {}

  async get() {
    return {
      timezone: 'Europe/Madrid' as const,
      slots: await this.weeklySlotsRepository.listActive(),
      courseLabels,
      subjectLabels,
    };
  }
}
