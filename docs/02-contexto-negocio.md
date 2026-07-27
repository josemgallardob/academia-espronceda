# Contexto de negocio

## Proposito del documento

Este documento recoge las reglas y condiciones propias de la operativa de la academia.

No describe pantallas, botones ni decisiones tecnicas. Define el dominio que el sistema debe respetar.

## Vocabulario del dominio

### Persona

Entidad base del dominio.

Una persona puede estar en lista de espera o ser alumno activo.

### Alumno activo

Persona que forma parte de la operativa activa de la academia y puede ser incluida en horarios.

### Lista de espera

Estado de una persona que todavia no forma parte de la operativa activa.

La lista de espera se usa cuando se decide que la academia esta completa y no se quieren incorporar nuevas personas directamente al listado activo de alumnos.

### Clase

Franja de una hora asignada a un profesor dentro del horario semanal.

Una clase contiene varias personas asignadas. No representa una clase grupal de una unica asignatura.

### Horario semanal global

Planificacion semanal completa de la academia.

Incluye las clases de los tres profesores y debe tratarse como una unidad, porque una persona no puede estar en dos clases a la vez.

### Cuadrante por profesor

Vista del horario semanal global filtrada por un profesor concreto.

## Contexto operativo

La academia cuenta actualmente con tres profesores:

1. Profesor 1: perfil de ciencias para 2o Bachillerato.
2. Profesor 2: perfil de ciencias para ESO y 1o Bachillerato.
3. Profesor 3: perfil de Lengua e Ingles.

La actividad principal se desarrolla por las tardes, de lunes a viernes.

Existe tambien horario de verano por las mananas, pero queda fuera del MVP y se conserva solo como condicion futura.

## Cursos

Los cursos disponibles son:

1. 1o ESO.
2. 2o ESO.
3. 3o ESO.
4. 4o ESO.
5. 1o Bachillerato.
6. 2o Bachillerato.
7. Otros.

El curso `Otros` se trata como un curso mas.

Se reserva para casos excepcionales, como personas que quieran preparar una prueba de acceso a formacion profesional u otros itinerarios no encajables en ESO o Bachillerato.

## Asignaturas

Las asignaturas impartidas son:

1. Matematicas.
2. Matematicas CCSS.
3. Fisica.
4. Quimica.
5. Biologia.
6. Lengua.
7. Ingles.

Una persona puede apuntarse a una o varias asignaturas.

## Horario habitual de apertura

| Dia | Horario |
| --- | --- |
| Lunes | 16:00-21:00 |
| Martes | 16:00-21:00 |
| Miercoles | 16:00-21:00 |
| Jueves | 16:00-21:00 |
| Viernes | 16:00-19:00 |

Cada horario semanal debe construirse dentro de estas franjas de apertura y respetando la disponibilidad concreta de cada profesor.

## Profesores

### Profesor 1: ciencias de 2o Bachillerato

El Profesor 1 es el profesor principal para las asignaturas de ciencias de 2o Bachillerato.

Asignaturas:

1. Matematicas.
2. Matematicas CCSS.
3. Fisica.
4. Quimica.

Cursos habituales:

1. 2o Bachillerato.

Excepciones:

1. Puede impartir clase a algunos alumnos de 1o Bachillerato si es necesario para cuadrar horarios.
2. Esta excepcion no debe considerarse la norma.

Horario:

| Dia | Horario |
| --- | --- |
| Lunes | 16:00-21:00 |
| Martes | 16:00-21:00 |
| Miercoles | 16:00-21:00 |
| Jueves | 16:00-21:00 |
| Viernes | 16:00-19:00 |

### Profesor 2: ciencias de ESO y 1o Bachillerato

El Profesor 2 es el profesor principal para las asignaturas de ciencias desde 1o ESO hasta 1o Bachillerato.

Asignaturas:

1. Matematicas.
2. Matematicas CCSS.
3. Fisica.
4. Quimica.
5. Biologia.

Cursos:

1. 1o ESO.
2. 2o ESO.
3. 3o ESO.
4. 4o ESO.
5. 1o Bachillerato.

Restricciones:

1. No puede atender alumnos de 2o Bachillerato.
2. No puede recibir alumnos para asignaturas que no imparte, como Ingles o Lengua.

Horario:

| Dia | Horario |
| --- | --- |
| Lunes | 16:00-20:00 |
| Martes | 16:00-21:00 |
| Miercoles | 16:00-20:00 |
| Jueves | 16:00-21:00 |
| Viernes | 16:00-19:00 |

### Profesor 3: Lengua e Ingles

El Profesor 3 es el profesor de Lengua e Ingles para todos los cursos ordinarios.

Asignaturas:

1. Ingles.
2. Lengua.

Cursos:

1. 1o ESO.
2. 2o ESO.
3. 3o ESO.
4. 4o ESO.
5. 1o Bachillerato.
6. 2o Bachillerato.

Horario:

| Dia | Horario |
| --- | --- |
| Lunes | 16:00-20:00 |
| Martes | 16:00-20:00 |
| Miercoles | 16:00-20:00 |
| Jueves | 16:00-20:00 |
| Viernes | 16:00-19:00 |

## Datos de una persona

Campos:

1. Nombre.
2. Primer apellido.
3. Segundo apellido.
4. Una o varias asignaturas.
5. Curso.
6. Centro educativo.
7. Franjas horarias no disponibles.
8. Persona o personas relacionadas.
9. Horas semanales totales.
10. Horas semanales por asignatura.
11. Numero de telefono de contacto.
12. Numero de telefono de contacto secundario.
13. Marca de tutorizado.
14. Nombre completo del tutor.
15. Comentarios adicionales.

Campos obligatorios:

1. Nombre.
2. Primer apellido.
3. Asignaturas.
4. Curso.
5. Horas semanales totales.
6. Horas semanales por asignatura.
7. Numero de telefono de contacto.
8. Marca de tutorizado.

Campos opcionales:

1. Segundo apellido.
2. Centro educativo.
3. Franjas horarias no disponibles.
4. Persona o personas relacionadas.
5. Numero de telefono de contacto secundario.
6. Nombre completo del tutor.
7. Comentarios adicionales.

Las personas relacionadas permiten indicar si una persona viene asociada a un hermano, amigo o companero de clase para intentar cuadrarlos juntos cuando sea posible. Esta relacion ayuda a planificar, pero no debe bloquear el horario si no se puede cumplir.

Las horas semanales totales indican cuantas clases de una hora debe recibir la persona a la semana. Ejemplo: una hora el lunes, una el miercoles y una el viernes equivalen a 3 horas semanales.

Las horas semanales por asignatura indican cuantas horas semanales corresponden a cada asignatura seleccionada.

Siempre que se seleccione una asignatura, sera obligatorio indicar cuantas horas semanales corresponden a esa asignatura.

La suma de las horas semanales por asignatura debe coincidir con las horas semanales totales.

Ejemplo: una persona apuntada a Fisica e Ingles con 3 horas semanales puede tener una distribucion de 2 horas de Fisica y 1 hora de Ingles.

Cuando todas las asignaturas de una persona corresponden al mismo profesor, las horas por asignatura no obligan a fijar que asignatura concreta se trabajara en cada clase. En ese caso, basta con asignar las horas semanales totales con ese profesor, y la persona podra gestionar con el profesor que asignatura trabaja cada semana.

Ejemplo: una persona de 2o Bachillerato apuntada a Matematicas y Fisica con 3 horas semanales normalmente quedara con el Profesor 1 para todas sus horas. Una semana podra dedicar 2 horas a Matematicas y 1 a Fisica, otra semana invertirlo, o dedicar las 3 horas a Fisica si lo necesita.

Cuando las asignaturas de una persona corresponden a profesores distintos, las horas semanales por asignatura si deben respetarse para construir el horario. En ese caso, el reparto determina cuantas horas semanales debe recibir la persona con cada profesor.

Ejemplo: una persona de 1o Bachillerato apuntada a Fisica e Ingles con 3 horas semanales y distribucion de 2 horas de Fisica y 1 hora de Ingles debe quedar asignada 2 horas con el profesor compatible con Fisica y 1 hora con el profesor compatible con Ingles.

La marca de tutorizado indica si la persona con la que se contacta o se gestionan los temas del alumno es el propio alumno o no.

El nombre completo del tutor permite registrar, cuando aplique, el nombre y apellidos de la persona a la que dirigirse para tratar temas del alumno.

## Modelo de clases

Las clases funcionan como grupos reducidos de atencion individualizada.

Cada clase:

1. Dura una hora.
2. Es independiente de las demas.
3. Pertenece a un profesor.
4. Contiene personas asignadas a esa franja.

En una misma hora, un profesor puede atender a alumnos de cursos y asignaturas distintas, siempre que cada alumno encaje con las asignaturas y cursos que puede atender ese profesor.

Una vez que un alumno queda asignado a una clase concreta con un profesor, no es necesario fijar que asignatura concreta trabajara en cada sesion cuando las asignaturas que justifican esa asignacion pertenecen al mismo profesor. Curso, asignaturas y horas semanales por asignatura sirven para construir y validar el horario, pero no para definir el contenido de cada clase semanal.

## Capacidad de clases

La capacidad ideal de cada clase es de 4 alumnos.

La capacidad minima aceptable para una clase activa es de 3 alumnos.

La capacidad maxima es de 5 alumnos.

Las clases de 3 alumnos se aceptan como excepcion.

Las clases de 5 alumnos son aun mas excepcionales y solo deben aceptarse si no queda otra alternativa razonable para cuadrar horarios.

## Reglas de asignacion

Para que una asignacion se considere libre de conflictos debe cumplir que:

1. El profesor imparte al menos una de sus asignaturas.
2. El profesor puede atender su curso.
3. El profesor esta disponible en la franja.
4. La persona esta disponible en la franja.
5. La clase no supera la capacidad maxima.
6. La persona no tiene ya otra clase asignada en el mismo dia y hora.
7. La asignacion respeta las horas semanales por asignatura cuando las asignaturas de la persona implican profesores distintos.

La restriccion de no solape hace que los cuadrantes de los tres profesores sean interdependientes.

Ejemplo: si una persona ya tiene clase el lunes de 19:00 a 20:00 con el Profesor 1, asignarla tambien el lunes de 19:00 a 20:00 con el Profesor 3 producira un conflicto de solape que debera mostrarse al usuario.

Estas reglas deben guiar la generacion automatica y la validacion del horario global. No obstante, representan la operativa esperada del negocio y no un bloqueo tecnico absoluto: el usuario podra confirmar excepcionalmente un horario que incumpla alguna de ellas siempre que el sistema identifique los conflictos, explique sus consecuencias y solicite una confirmacion expresa e informada.

## Curso `Otros`

El curso `Otros` representa casos excepcionales fuera del itinerario ordinario ESO/Bachillerato.

Regla inicial:

1. Si la persona de curso `Otros` necesita una asignatura que imparte el Profesor 1, pasa por defecto al Profesor 1.
2. Si la persona de curso `Otros` necesita Lengua o Ingles, pasa por defecto al Profesor 3.

El Profesor 2 no se considera profesor por defecto para los casos `Otros` en esta primera definicion.

## Preferencias de planificacion

Las siguientes condiciones son preferencias, no restricciones obligatorias:

1. Agrupar personas relacionadas cuando sea posible.
2. Mantener clases de 4 alumnos como capacidad ideal.
3. Evitar clases de 3 alumnos salvo necesidad.
4. Evitar clases de 5 alumnos salvo necesidad mayor.

Las preferencias deben intentarse, pero no deben impedir un horario valido si no se pueden cumplir.
