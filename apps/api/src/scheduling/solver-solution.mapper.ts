import { randomUUID } from 'node:crypto';
import type { SubjectTeacherAllocation, WeeklyClass } from './schedule';
import type { SolverSolution } from './solver-contract';
import { solverInvalidResponse } from './solver-errors';

export function toDraftClasses(
  solution: SolverSolution,
  studentsById: Map<string, { displayName: string }>,
  identity: () => string = randomUUID,
): {
  classes: WeeklyClass[];
  subjectTeacherAllocations: SubjectTeacherAllocation[];
} {
  return {
    classes: solution.classes.map((weeklyClass) => ({
      id: weeklyClass.id,
      teacherId: weeklyClass.teacherId,
      slotId: weeklyClass.slotId,
      assignments: weeklyClass.studentIds.map((studentId) => {
        const student = studentsById.get(studentId);
        if (!student) {
          throw solverInvalidResponse(
            `El generador asignó al alumno desconocido ${studentId}.`,
          );
        }
        return {
          id: identity(),
          studentId,
          studentDisplayName: student.displayName,
        };
      }),
      findingFingerprints: [],
    })),
    subjectTeacherAllocations: solution.subjectTeacherAllocations.map(
      (allocation) => ({
        studentId: allocation.studentId,
        teacherId: allocation.teacherId,
        totalHours: allocation.totalHours,
        subjectHours: allocation.subjectHours.map((item) => ({
          subjectCode: item.subjectCode,
          weeklyHours: item.weeklyHours,
        })),
      }),
    ),
  };
}
