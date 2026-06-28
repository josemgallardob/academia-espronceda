# Motivo de ser, objetivos y alcance

## Proposito del documento

Este documento define por que existe el proyecto, que objetivo persigue y cual es el alcance del MVP.

No contiene reglas detalladas de negocio ni requisitos de interfaz. Para eso se usan:

1. `02-contexto-negocio.md`: reglas propias de la academia.
2. `03-requisitos-funcionales-sistema.md`: funcionalidades que debe ofrecer la aplicacion.
3. `04-diseno-arquitectura-tecnica.md`: decisiones tecnicas y arquitectura, pendiente de desarrollar.

## Motivo de ser

El proyecto existe para automatizar y digitalizar los principales procesos operativos de una pequena academia de ensenanza privada.

Actualmente, esos procesos se gestionan de forma manual. Esto genera carga administrativa, dependencia de conocimiento informal, riesgo de errores, dificultad para mantener informacion actualizada y poca trazabilidad cuando hay cambios durante el curso.

La plataforma debe convertir esos procesos manuales en flujos claros, centralizados, trazables y mantenibles.

## Problema principal

La academia necesita reducir el esfuerzo operativo asociado a tareas repetitivas y sensibles a errores.

El problema no es solo guardar informacion. El problema principal es coordinar procesos que cambian con frecuencia y que afectan a alumnos, profesores, horarios, plazas disponibles y personas de contacto.

El valor de la plataforma estara en:

1. Centralizar informacion.
2. Reducir duplicidades.
3. Facilitar cambios.
4. Evitar errores de asignacion.
5. Hacer trazable la planificacion semanal.

## Procesos prioritarios

### Registro y gestion de personas

El sistema debe permitir registrar y mantener la informacion necesaria de las personas que quieren asistir a la academia o que ya forman parte de ella como alumnos activos.

Esto incluye tanto nuevas incorporaciones para el inicio de curso como altas durante el curso.

### Planificacion semanal

El sistema debe permitir generar, mantener y editar el horario semanal de la academia.

Aunque la visualizacion pueda separarse por profesor, la planificacion debe entenderse como un horario semanal global, porque una misma persona no puede estar asignada a dos profesores en la misma franja.

## Objetivo principal

Construir una plataforma propia que permita gestionar de forma centralizada, trazable y mas eficiente los procesos operativos que hoy dependen de trabajo manual.

El objetivo principal del MVP es cubrir:

1. Gestion de personas, alumnos activos y lista de espera.
2. Generacion automatica del horario semanal global.
3. Edicion manual asistida del horario.
4. Visualizacion de cuadrantes por profesor.

## Alcance del MVP

El MVP incluye:

1. Registro y edicion de personas.
2. Gestion de alumnos activos.
3. Gestion de lista de espera.
4. Generacion automatica de un horario semanal global.
5. Creacion manual de un horario vacio.
6. Edicion de horarios generados o manuales.
7. Validacion de restricciones de negocio.
8. Visualizacion del horario global y de los cuadrantes por profesor.

## Fuera del alcance inicial

Quedan fuera del alcance inicial los procesos que no sean necesarios para resolver los dos dolores principales: gestion de personas y planificacion semanal.

Tambien quedan para iteraciones posteriores:

1. Horario de verano.
2. Ausencias.
3. Recuperaciones.
4. Cambios puntuales de asistencia.
5. Experiencia detallada para resolver horarios que no puedan generarse completamente.

Estos procesos podran estudiarse cuando el MVP aporte valor operativo real.

## Criterio de exito

El proyecto estara justificado si permite gestionar la operativa principal con menos trabajo manual, menos errores, informacion mas centralizada y cambios mas faciles de seguir.

El MVP debe ser util para la operativa real de la academia antes de intentar cubrir necesidades secundarias.
