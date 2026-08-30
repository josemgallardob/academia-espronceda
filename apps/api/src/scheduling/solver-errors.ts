import { ProblemDetailsException } from '../http/problem-details.exception';

export function generationInfeasible(detail?: string): ProblemDetailsException {
  return new ProblemDetailsException({
    status: 409,
    code: 'GENERATION_INFEASIBLE',
    title: 'No se pudo generar un horario',
    detail:
      detail ??
      'El generador no encontró una solución válida para los datos actuales.',
  });
}

export function solverUnavailable(detail?: string): ProblemDetailsException {
  return new ProblemDetailsException({
    status: 502,
    code: 'SOLVER_UNAVAILABLE',
    title: 'El servicio de generación no está disponible',
    detail:
      detail ?? 'No se pudo completar la llamada al generador de horarios.',
  });
}

export function solverInvalidResponse(
  detail?: string,
): ProblemDetailsException {
  return new ProblemDetailsException({
    status: 502,
    code: 'SOLVER_INVALID_RESPONSE',
    title: 'La respuesta del generador no es válida',
    detail:
      detail ??
      'El generador devolvió un resultado que no se puede traducir al dominio.',
  });
}

export function solverResultDiverged(detail: string): ProblemDetailsException {
  return new ProblemDetailsException({
    status: 502,
    code: 'SOLVER_RESULT_DIVERGED',
    title: 'El resultado del generador no coincide con la validación',
    detail,
  });
}

export function generationBusy(): ProblemDetailsException {
  return new ProblemDetailsException({
    status: 503,
    code: 'GENERATION_BUSY',
    title: 'Ya hay una generación en curso',
    detail: 'Espere a que termine la generación actual antes de lanzar otra.',
  });
}
