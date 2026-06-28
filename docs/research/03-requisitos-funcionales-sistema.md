# Requisitos funcionales del sistema

## Proposito del documento

Este documento define las funcionalidades que debe ofrecer el sistema para cubrir el MVP.

Las reglas de negocio que estas funcionalidades deben respetar estan descritas en `02-contexto-negocio.md`.

## Usuarios y permisos

El sistema tendra dos usuarios principales:

1. Usuario del Profesor 1.
2. Usuario del Profesor 2.

Ambos usuarios tendran permisos completos sobre la plataforma.

No habra roles en el sistema en la primera version. La aplicacion no necesita gestionar perfiles diferenciados.

De momento no se contempla un usuario propio para el Profesor 3. Su informacion debe existir como profesor para poder asignarle alumnos, horarios y cuadrantes, pero no como usuario operativo del sistema salvo que se decida mas adelante.

## Gestion de personas

El sistema debe permitir registrar personas con los campos definidos en `02-contexto-negocio.md`.

El sistema debe permitir:

1. Consultar el listado de alumnos activos.
2. Consultar la lista de espera.
3. Abrir la vista de detalle de una persona.
4. Editar la informacion de una persona desde su detalle.
5. Mover una o varias personas desde lista de espera al listado de alumnos activos.
6. Eliminar personas tanto desde el listado de alumnos activos como desde la lista de espera.

Una persona no debe duplicarse al pasar de lista de espera a alumno activo. Debe conservar su informacion y cambiar su estado o clasificacion.

Cuando se elimine una persona activa que ya tenga asignaciones en algun horario, el sistema debe evitar que queden referencias inconsistentes.

Al registrar o editar una persona, el sistema debe conservar la informacion necesaria para calcular horarios: curso, asignaturas, horas semanales totales, horas semanales por asignatura, franjas no disponibles y personas relacionadas.

El formulario de persona debe exigir que cada asignatura seleccionada tenga indicado su numero de horas semanales.

La suma de horas semanales por asignatura debe coincidir con las horas semanales totales de la persona.

## Horario semanal global

El sistema debe mantener un horario semanal global de lunes a viernes.

Ese horario global se visualizara como tres cuadrantes semanales, uno por cada profesor.

Aunque la UI pueda mostrar los cuadrantes por separado, las asignaciones pertenecen a un unico horario global.

La validacion de cualquier cambio debe ejecutarse contra el horario global completo, no solo contra el cuadrante visible.

## Generacion automatica de horario

La funcionalidad core del sistema sera generar automaticamente el horario semanal global de la academia.

La generacion automatica se ejecutara desde la interfaz mediante una unica accion del usuario, por ejemplo un boton `Generar horario`.

No debe plantearse como tres generaciones independientes, una por profesor. Debido a la restriccion de no solape de alumnos, generar cada cuadrante por separado podria producir horarios incompatibles o soluciones de peor calidad.

El sistema debe resolver la planificacion de forma global y simultanea, y despues presentar el resultado separado por profesor.

Cada generacion debe tener en cuenta:

1. Horario de trabajo de cada profesor.
2. Asignaturas que puede atender cada profesor.
3. Cursos que puede atender cada profesor.
4. Capacidad ideal, minima y maxima de cada clase.
5. Franjas horarias no disponibles de cada persona.
6. Horas semanales totales que necesita cada persona.
7. Horas semanales por asignatura.
8. Personas relacionadas que se intentaran cuadrar juntas si es posible.
9. Imposibilidad de asignar a la misma persona a dos clases en la misma franja.

La generacion debe cumplir las horas semanales por asignatura cuando las asignaturas de una persona correspondan a profesores distintos. Si una persona necesita 2 horas de Fisica y 1 hora de Ingles, el horario generado debe asignar esas horas a los profesores compatibles correspondientes.

Cuando varias asignaturas de una persona correspondan al mismo profesor, el horario no necesita fijar que asignatura concreta se trabajara en cada clase. En ese caso, el generador debe respetar el total de horas con ese profesor.

El resultado esperado es un horario semanal global en el que cada profesor tenga, para cada franja horaria de una hora dentro de su horario de trabajo, una clase con personas compatibles con sus restricciones.

El objetivo de optimizacion sera completar las clases con 4 alumnos siempre que sea posible. Las clases con 3 alumnos se aceptaran como excepcion. Las clases con 5 alumnos solo se aceptaran si no queda mas remedio para cuadrar el horario.

## Generacion manual asistida

El sistema debe permitir generar un horario semanal vacio desde cero.

En este modo, el usuario podra ir completando manualmente las clases de cada profesor dentro del mismo horario global.

Mientras el usuario edita manualmente el horario, el sistema debe informar si una asignacion incumple alguna restriccion obligatoria o si se aleja de alguna preferencia relevante.

La planificacion manual asistida debe ser una alternativa funcional a la generacion automatica.

## Edicion de horarios

Todo horario debe ser editable, tanto si ha sido generado automaticamente como si ha sido creado vacio y completado manualmente.

La edicion puede realizarse desde la vista de un profesor concreto, pero la validacion debe ejecutarse contra el horario global completo.

Al editar una clase, el sistema debe validar:

1. Compatibilidad de profesor.
2. Compatibilidad de curso.
3. Compatibilidad de asignaturas.
4. Disponibilidad de profesor.
5. Disponibilidad de persona.
6. Capacidad de la clase.
7. No solape de la misma persona en la misma franja.
8. Duracion de una hora por clase.
9. Horas semanales por asignatura cuando impliquen profesores distintos.

## Visualizacion de horarios y cuadrantes

El sistema debe permitir visualizar:

1. El horario semanal global.
2. El cuadrante semanal por profesor.

En la vista operativa de cada clase bastara con mostrar el nombre y apellidos de cada alumno asignado.

No sera necesario mostrar curso ni asignaturas dentro de cada clase, porque esos datos ya se habran usado previamente para validar la asignacion.

Debe ser facil detectar:

1. Franjas llenas.
2. Franjas con huecos.
3. Franjas con excepciones de capacidad.
4. Personas asignadas a mas de un profesor en distintas franjas.
5. Asignaciones que dependan de una excepcion.

## Validaciones funcionales

El sistema debe diferenciar entre restricciones obligatorias y preferencias.

Restricciones obligatorias:

1. Compatibilidad entre profesor y asignaturas de la persona.
2. Compatibilidad entre profesor y curso de la persona.
3. Disponibilidad horaria del profesor.
4. Franjas no disponibles de la persona.
5. Capacidad minima de una clase activa.
6. Capacidad maxima de la clase.
7. No solapar a la misma persona en dos clases durante la misma franja.
8. Duracion de una hora por clase.
9. Cumplimiento de las horas semanales por asignatura cuando impliquen profesores distintos.

Preferencias:

1. Agrupar personas relacionadas cuando sea posible.
2. Mantener clases de 4 alumnos como capacidad ideal.
3. Evitar clases de 3 alumnos salvo necesidad.
4. Evitar clases de 5 alumnos salvo necesidad mayor.

Las preferencias deben intentarse, pero no deben impedir la generacion o edicion de un horario valido si no se pueden cumplir.

## Modificaciones de horario

El sistema debe contemplar que los horarios pueden cambiar.

Tipos de modificacion:

1. Modificacion temporal: cambio puntual durante un periodo concreto.
2. Modificacion permanente: cambio estable en el horario ordinario.

La definicion detallada de estas modificaciones se deja para una iteracion posterior, pero el modelo funcional debe asumir que el horario no es estatico.

## Dudas pendientes

1. Definir como se gestionaran ausencias, recuperaciones o cambios puntuales de asistencia.
2. Definir la experiencia exacta de resolucion cuando la generacion automatica no encuentre un horario completamente valido.
