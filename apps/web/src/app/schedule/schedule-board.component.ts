import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { finalize } from 'rxjs';
import { problemMessage } from '../people/people-api';
import { ScheduleStore, slotLabel } from './schedule-api';
import {
  DAY_LABELS,
  WEEK_DAYS,
  type ScheduleAssignment,
  type StudentHours,
  type WeeklySlot,
} from './schedule.models';

type BoardTab = 'quadrant' | 'warnings';

interface Notice {
  tone: 'error' | 'success' | 'warning';
  message: string;
}

@Component({
  selector: 'app-schedule-board',
  templateUrl: './schedule-board.component.html',
  styleUrl: './schedule-board.component.scss',
})
export class ScheduleBoardComponent implements OnInit {
  readonly store = inject(ScheduleStore);
  readonly tab = signal<BoardTab>('quadrant');
  readonly notice = signal<Notice | null>(null);
  readonly confirmOpen = signal(false);
  readonly draggingStudentId = signal<string | null>(null);

  readonly weekDays = WEEK_DAYS;
  readonly dayLabels = DAY_LABELS;
  readonly slotLabel = slotLabel;

  readonly isEditable = computed(() => this.store.schedule()?.state === 'DRAFT');
  readonly findings = computed(() => this.store.schedule()?.evaluation?.findings ?? []);

  ngOnInit(): void {
    this.store.load();
  }

  retry(): void {
    this.notice.set(null);
    this.store.load();
  }

  errorMessage(): string {
    const workspace = this.store.workspace();
    return workspace.kind === 'error' ? workspace.message : '';
  }

  createDraft(): void {
    this.notice.set(null);
    this.store.createEmptyDraft().subscribe({
      error: (error: unknown) =>
        this.notice.set({
          tone: 'error',
          message: problemMessage(error, 'No se ha podido crear el borrador.'),
        }),
    });
  }

  startRevision(): void {
    this.notice.set(null);
    this.store.createRevision().subscribe({
      error: (error: unknown) =>
        this.notice.set({
          tone: 'error',
          message: problemMessage(error, 'No se ha podido crear una revisión editable.'),
        }),
    });
  }

  selectTeacher(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    this.store.selectTeacher(value);
  }

  classHasConflict(slot: WeeklySlot): boolean {
    const weeklyClass = this.store.classForSlot(slot.id);
    return Boolean(weeklyClass && weeklyClass.findingFingerprints.length > 0);
  }

  onDragStart(studentId: string, event: DragEvent): void {
    if (!this.isEditable()) {
      event.preventDefault();
      return;
    }
    this.draggingStudentId.set(studentId);
    event.dataTransfer?.setData('text/plain', studentId);
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'copy';
    }
  }

  onDragEnd(): void {
    this.draggingStudentId.set(null);
  }

  onDragOver(event: DragEvent): void {
    if (this.isEditable()) {
      event.preventDefault();
      if (event.dataTransfer) {
        event.dataTransfer.dropEffect = 'copy';
      }
    }
  }

  onDrop(slot: WeeklySlot, event: DragEvent): void {
    event.preventDefault();
    const studentId = event.dataTransfer?.getData('text/plain') || this.draggingStudentId();
    this.draggingStudentId.set(null);
    const teacherId = this.store.selectedTeacherId();
    if (!studentId || !teacherId || !this.isEditable()) {
      return;
    }
    this.assignStudent(studentId, teacherId, slot.id);
  }

  removeStudent(assignment: ScheduleAssignment): void {
    if (!this.isEditable()) {
      return;
    }
    this.notice.set(null);
    this.store.removeAssignment(assignment.id).subscribe({
      error: (error: unknown) =>
        this.notice.set({
          tone: 'error',
          message: problemMessage(error, 'No se ha podido retirar al alumno.'),
        }),
    });
  }

  openConfirm(): void {
    this.notice.set(null);
    this.store.validate().subscribe({
      next: () => this.confirmOpen.set(true),
      error: (error: unknown) =>
        this.notice.set({
          tone: 'error',
          message: problemMessage(error, 'No se ha podido validar el horario.'),
        }),
    });
  }

  closeConfirm(): void {
    this.confirmOpen.set(false);
  }

  confirmSchedule(): void {
    const evaluation = this.store.schedule()?.evaluation;
    if (!evaluation || evaluation.outcome === 'BLOCKED') {
      return;
    }
    this.store
      .confirm(evaluation.counts.relaxableErrors > 0)
      .pipe(finalize(() => this.confirmOpen.set(false)))
      .subscribe({
        next: () =>
          this.notice.set({
            tone: 'success',
            message:
              evaluation.counts.relaxableErrors > 0
                ? 'Horario confirmado con incidencias bajo tu responsabilidad.'
                : 'Horario confirmado correctamente.',
          }),
        error: (error: unknown) =>
          this.notice.set({
            tone: 'error',
            message: problemMessage(error, 'No se ha podido confirmar el horario.'),
          }),
      });
  }

  remainingBadge(item: StudentHours): string {
    if (item.remainingHours > 0) {
      return `${item.remainingHours}`;
    }
    if (item.remainingHours === 0) {
      return '0';
    }
    return `+${Math.abs(item.remainingHours)}`;
  }

  remainingTone(item: StudentHours): string {
    if (item.remainingHours > 0) {
      return 'remaining';
    }
    if (item.remainingHours === 0) {
      return 'complete';
    }
    return 'exceeded';
  }

  confirmTitle(): string {
    const outcome = this.store.schedule()?.evaluation?.outcome;
    if (outcome === 'BLOCKED') {
      return 'No se puede confirmar el horario';
    }
    if (outcome === 'HAS_RELAXABLE_CONFLICTS') {
      return 'Confirmar horario con incidencias';
    }
    if (outcome === 'VALID_WITH_RECOMMENDATIONS') {
      return 'Confirmar horario con recomendaciones';
    }
    return 'Confirmar horario';
  }

  confirmMessage(): string {
    const evaluation = this.store.schedule()?.evaluation;
    if (!evaluation) {
      return '';
    }
    if (evaluation.outcome === 'BLOCKED') {
      return 'Hay reglas que impiden confirmar. Revisa la pestaña de avisos y corrige las asignaciones bloqueantes.';
    }
    if (evaluation.outcome === 'HAS_RELAXABLE_CONFLICTS') {
      return 'El horario se guardará con incidencias conocidas. La responsabilidad de aceptar estas excepciones es tuya.';
    }
    if (evaluation.outcome === 'VALID_WITH_RECOMMENDATIONS') {
      return 'El horario es válido. Quedan recomendaciones de calidad que puedes aceptar al confirmar.';
    }
    return 'El horario no tiene conflictos. Puedes confirmarlo como horario vigente.';
  }

  private assignStudent(studentId: string, teacherId: string, slotId: string): void {
    this.notice.set(null);
    this.store.addAssignment(studentId, teacherId, slotId).subscribe({
      error: (error: unknown) =>
        this.notice.set({
          tone: 'error',
          message: problemMessage(error, 'No se ha podido asignar al alumno.'),
        }),
    });
  }
}
