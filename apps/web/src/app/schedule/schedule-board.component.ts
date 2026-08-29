import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { finalize } from 'rxjs';
import { problemMessage } from '../people/people-api';
import { ScheduleStore, slotLabel } from './schedule-api';
import {
  DAY_LABELS,
  WEEK_DAYS,
  type EvaluationOutcome,
  type Schedule,
  type ScheduleAssignment,
  type ScheduleFinding,
  type StudentHours,
  type WeeklySlot,
} from './schedule.models';

const HIDDEN_UI_RULE_IDS = new Set([
  'CLASS_CAPACITY_IDEAL',
  'PREFERRED_TEACHER_BACH1_SCIENCES',
  'PREFERRED_TEACHER_OTHER_SCIENCES',
]);

const SLOT_HIGHLIGHT_HIDDEN_RULE_IDS = new Set([
  ...HIDDEN_UI_RULE_IDS,
  'CLASS_CAPACITY_MINIMUM',
  'CLASS_CAPACITY_MAXIMUM',
]);

type BoardTab = 'quadrant' | 'warnings';

interface Notice {
  tone: 'error' | 'success' | 'warning';
  message: string;
}

@Component({
  selector: 'app-schedule-board',
  imports: [RouterLink],
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
  readonly findings = computed(() =>
    visibleFindings(this.store.schedule()?.evaluation?.findings ?? []),
  );

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

  generateDraft(): void {
    this.notice.set(null);
    this.confirmOpen.set(false);
    this.store.generateDraft().subscribe({
      next: (schedule) => {
        this.notice.set(generationNotice(schedule));
        this.tab.set(hasFindings(schedule) ? 'warnings' : 'quadrant');
      },
      error: (error: unknown) =>
        this.notice.set({
          tone: 'error',
          message: problemMessage(error, 'No se ha podido generar el horario.'),
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
    if (!weeklyClass) {
      return false;
    }
    const fingerprints = new Set(weeklyClass.findingFingerprints);
    return this.findings().some(
      (finding) =>
        !SLOT_HIGHLIGHT_HIDDEN_RULE_IDS.has(finding.ruleId) &&
        fingerprints.has(finding.fingerprint),
    );
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
    const outcome = this.uiOutcome();
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

  scheduleQualityLabel(
    schedule: Schedule,
  ): { tone: 'valid' | 'approximate'; label: string } | null {
    if (schedule.state !== 'DRAFT' || schedule.classes.length === 0 || !schedule.evaluation) {
      return null;
    }
    if (
      schedule.evaluation.outcome === 'HAS_RELAXABLE_CONFLICTS' ||
      schedule.evaluation.outcome === 'BLOCKED'
    ) {
      return { tone: 'approximate', label: 'Aproximado' };
    }
    return { tone: 'valid', label: 'Válido' };
  }

  confirmMessage(): string {
    const evaluation = this.store.schedule()?.evaluation;
    if (!evaluation) {
      return '';
    }
    const outcome = this.uiOutcome();
    if (outcome === 'BLOCKED') {
      return 'Hay reglas que impiden confirmar. Revisa la pestaña de avisos y corrige las asignaciones bloqueantes.';
    }
    if (outcome === 'HAS_RELAXABLE_CONFLICTS') {
      return 'El horario se guardará con incidencias conocidas. La responsabilidad de aceptar estas excepciones es tuya.';
    }
    if (outcome === 'VALID_WITH_RECOMMENDATIONS') {
      return 'El horario es válido. Quedan recomendaciones de calidad que puedes aceptar al confirmar.';
    }
    return 'El horario no tiene conflictos. Puedes confirmarlo como horario vigente.';
  }

  private uiOutcome(): EvaluationOutcome | undefined {
    return uiOutcome(this.store.schedule()?.evaluation?.outcome, this.findings());
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

function generationNotice(schedule: Schedule): Notice {
  const outcome = uiOutcome(
    schedule.evaluation?.outcome,
    visibleFindings(schedule.evaluation?.findings ?? []),
  );
  if (outcome === 'HAS_RELAXABLE_CONFLICTS' || outcome === 'BLOCKED') {
    return {
      tone: 'warning',
      message:
        'El horario generado es aproximado: no cumple todas las reglas. Revisa los avisos, edítalo si hace falta y confírmalo bajo tu responsabilidad.',
    };
  }
  if (outcome === 'VALID_WITH_RECOMMENDATIONS') {
    return {
      tone: 'success',
      message:
        'Se ha generado un horario válido con recomendaciones. Revisa los avisos antes de confirmar.',
    };
  }
  return {
    tone: 'success',
    message: 'Se ha generado un horario válido. Puedes revisarlo, editarlo y confirmarlo.',
  };
}

function hasFindings(schedule: Schedule): boolean {
  return visibleFindings(schedule.evaluation?.findings ?? []).length > 0;
}

function visibleFindings(findings: ScheduleFinding[]): ScheduleFinding[] {
  return findings.filter((finding) => !HIDDEN_UI_RULE_IDS.has(finding.ruleId));
}

function uiOutcome(
  outcome: EvaluationOutcome | undefined,
  visible: ScheduleFinding[],
): EvaluationOutcome | undefined {
  if (outcome === 'VALID_WITH_RECOMMENDATIONS' && visible.length === 0) {
    return 'IDEAL';
  }
  return outcome;
}
