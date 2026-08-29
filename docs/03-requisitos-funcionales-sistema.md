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

El resultado de la validacion sera informativo y no bloqueara por si mismo la confirmacion del horario. La decision final de confirmar y persistir un horario semanal global, incluso si contiene conflictos o recomendaciones incumplidas, correspondera al usuario.

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

Un alumno no puede compartirse entre dos profesores cuando uno solo puede cubrir todas sus asignaturas. Esta condicion es HARD: el generador no puede relajarla ni devolver un horario con ese reparto innecesario. Solo se admite mas de un profesor cuando las asignaturas del alumno lo exigen. Un borrador manual que incumpla esta regla no se puede confirmar.

Cuando varias asignaturas de una persona correspondan al mismo profesor, el horario no necesita fijar que asignatura concreta se trabajara en cada clase. En ese caso, el generador debe respetar el total de horas con ese profesor.

El resultado esperado es un horario semanal global en el que cada profesor tenga, para cada franja horaria de una hora dentro de su horario de trabajo, una clase con personas compatibles con sus restricciones. Esta condición es HARD: el generador no puede relajarla ni devolver un horario con esas franjas vacías. Si una franja del profesor admite al menos un alumno compatible y disponible, debe quedar ocupada; si no existe esa solución, la generación es infactible.

El objetivo de optimizacion sera completar las clases con 4 alumnos siempre que sea posible. Las clases con 3 alumnos se aceptaran como excepcion. Las clases con 5 alumnos solo se aceptaran si no queda mas remedio para cuadrar el horario.

El generador intentara obtener primero un horario que cumpla todas las restricciones y, en la medida de lo posible, las preferencias de planificacion.

Si no encuentra una solucion completamente valida, no debe finalizar sin resultado. Debe generar el horario mas proximo posible, minimizando y priorizando los conflictos segun su gravedad, y devolver tambien el detalle completo de las reglas y preferencias que no haya podido satisfacer.

La interfaz debe indicar de forma destacada cuando el resultado automatico no sea completamente valido. Este resultado se tratara como un borrador pendiente de revision y solo se persistira como horario confirmado si el usuario realiza expresamente la accion de confirmacion.

## Separacion entre generacion automatica y validacion

El sistema debe diferenciar claramente entre generar un horario desde cero y validar un horario que ya existe.

La generacion automatica es una operacion de busqueda y optimizacion: debe decidir simultaneamente las asignaciones del horario semanal global y encontrar la mejor solucion posible conforme a las reglas y preferencias de planificacion.

La validacion evalua una solucion ya construida. Se utilizara durante la creacion manual, las interacciones de arrastrar y soltar, la edicion de un borrador y la comprobacion final previa a la confirmacion. Estas validaciones deben ser deterministas e inmediatas y no deben volver a ejecutar el motor de generacion.

La generacion automatica y las validaciones de horarios existentes deben sujetarse al mismo catalogo de reglas, con el mismo significado, clasificacion y criterios de incumplimiento. Una solucion devuelta por el generador sin conflictos debe superar tambien la validacion global sin conflictos. Cualquier discrepancia entre ambos resultados se considerara un defecto de consistencia del sistema.

## Generacion manual asistida

El sistema debe permitir generar un horario semanal vacio desde cero.

En este modo, el usuario podra ir completando manualmente las clases mediante una interfaz de arrastrar y soltar (`drag and drop`).

La interfaz mostrara el listado vigente de alumnos activos. Cada alumno podra arrastrarse desde este listado hasta una clase de una hora del cuadrante del profesor seleccionado.

Junto al nombre de cada alumno se mostrara un contador visual, similar a un `badge`, con el numero de horas semanales que todavia quedan por asignarle. El contador partira de sus horas semanales totales y disminuira en una unidad por cada clase a la que se incorpore al alumno.

El numero de horas semanales contratado sera el objetivo de asignacion del alumno. Por ejemplo, un alumno con 3 horas semanales debera aparecer normalmente en tres clases de una hora durante la semana.

Cuando el contador llegue a cero, el alumno permanecera visible y se mostrara como completo. El sistema advertira antes de asignarlo a otra clase, pero no bloqueara la decision del usuario. Si se confirma la asignacion excepcional, el contador reflejara el exceso de horas y la asignacion se registrara como conflicto.

Al soltar un alumno sobre una clase valida, se añadira al listado de alumnos de esa clase para el profesor correspondiente y se descontara una unidad de su contador de horas restantes.

Cada alumno asignado a una clase tendra junto a su nombre un pequeño boton para retirarlo de ella. Al retirarlo, la asignacion se eliminara y su contador de horas restantes aumentara en una unidad, de modo que vuelva a estar disponible para otra asignacion.

Si al intentar soltar un alumno sobre una clase se incumple una regla o validacion, el sistema mostrara una alerta visible explicando el motivo y permitira al usuario cancelar la operacion o mantener la asignacion bajo su responsabilidad. Si decide mantenerla, se actualizaran el borrador y el contador, y el conflicto quedara identificado tanto en la clase como en el listado global de avisos.

Mientras el usuario edita manualmente el horario, el sistema debe recalcular e informar de cualquier regla incumplida o preferencia relevante no satisfecha, sin impedir que el usuario continue trabajando o confirme finalmente el horario.

La planificacion manual asistida debe ser una alternativa funcional a la generacion automatica.

## Edicion de horarios

Todo horario debe ser editable, tanto si ha sido generado automaticamente como si ha sido creado vacio y completado manualmente.

La edicion utilizara el mismo mecanismo de arrastrar y soltar, contadores de horas restantes y retirada de alumnos descrito para la generacion manual asistida.

La edicion se realizara desde la vista de un profesor concreto para reducir la complejidad visual, pero cada cambio debe validarse contra el horario semanal global completo de todos los profesores.

Las validaciones de edicion generaran conflictos y avisos, pero no bloquearan la modificacion ni la posterior confirmacion del horario por parte del usuario.

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
10. No superar las horas semanales totales contratadas por la persona.

## Visualizacion de horarios y cuadrantes

El sistema debe permitir visualizar:

1. El horario semanal global.
2. El cuadrante semanal por profesor.

La interfaz operativa del cuadrante estara filtrada por un profesor cada vez.

Para evitar mostrar un cuadrante excesivamente grande, la interfaz mostrara un unico dia de la semana cada vez. El usuario podra desplazarse al dia anterior o posterior mediante una navegacion de paginacion clasica con controles de anterior y siguiente.

El filtro visual por profesor y dia no modifica el alcance de la validacion: todas las asignaciones se comprobaran contra el horario semanal global de todos los profesores.

Las clases o franjas horarias que contengan algun conflicto se resaltaran con un color de fondo rojo `danger` suave para que puedan localizarse rapidamente sin dificultar la lectura de su contenido.

La pagina del cuadrante diario incluira una pestaña de avisos. Esta pestaña mostrara a nivel global todos los conflictos e incompatibilidades del horario semanal completo, aunque el cuadrante visible este filtrado por un profesor y un dia concretos.

Cada aviso debe identificar de forma comprensible las personas, profesores, dias y horas afectados y explicar la regla incumplida. Ejemplos: `El alumno X tiene asignadas dos clases simultaneas el martes a las 19:00 con dos profesores distintos` o `El profesor X tiene una clase con solo dos alumnos asignados el jueves a las 20:00`.

La pestaña debe actualizarse al generar o editar el horario y permitir al usuario conocer todos los conflictos antes de confirmarlo.

En la vista operativa de cada clase bastara con mostrar el nombre y apellidos de cada alumno asignado.

No sera necesario mostrar curso ni asignaturas dentro de cada clase, porque esos datos ya se habran usado previamente para validar la asignacion.

Debe ser facil detectar:

1. Franjas llenas.
2. Franjas con huecos.
3. Franjas con excepciones de capacidad.
4. Personas asignadas a mas de un profesor en distintas franjas.
5. Asignaciones que dependan de una excepcion.

## Validaciones funcionales y capacidad de decision

El sistema debe diferenciar entre reglas que el generador debe cumplir y preferencias que debe optimizar.

Reglas de cumplimiento para la generacion automatica:

1. Compatibilidad entre profesor y asignaturas de la persona.
2. Compatibilidad entre profesor y curso de la persona.
3. Disponibilidad horaria del profesor.
4. Franjas no disponibles de la persona.
5. Capacidad minima de una clase activa.
6. Capacidad maxima de la clase.
7. No solapar a la misma persona en dos clases durante la misma franja.
8. Duracion de una hora por clase.
9. Cumplimiento de las horas semanales por asignatura cuando impliquen profesores distintos.
10. No superar las horas semanales totales contratadas por la persona.
11. No repartir a un alumno entre mas profesores de los necesarios para cubrir sus asignaturas.

Preferencias:

1. Agrupar personas relacionadas cuando sea posible.
2. Mantener clases de 4 alumnos como capacidad ideal.
3. Evitar clases de 3 alumnos salvo necesidad.
4. Evitar clases de 5 alumnos salvo necesidad mayor.

Las reglas anteriores son obligatorias como objetivo del algoritmo de generacion automatica. Si no pueden cumplirse todas simultaneamente, el algoritmo devolvera la mejor solucion encontrada y señalara cada incumplimiento.

Las preferencias deben intentarse y sus desviaciones deben comunicarse al usuario cuando sean relevantes.

Ni las reglas ni las preferencias actuaran como un bloqueo absoluto para la edicion manual o la confirmacion. Su funcion sera validar, clasificar y explicar los conflictos para que la decision humana sea informada.

## Confirmacion y persistencia del horario

Todo horario generado automaticamente, creado manualmente o editado se considerara un borrador hasta que el usuario lo confirme de forma explicita.

Antes de confirmar, el sistema ejecutara una validacion final contra el horario semanal global completo y mostrara un resumen de todos los conflictos y recomendaciones pendientes.

Si no existen conflictos, el usuario podra confirmar y persistir el horario normalmente.

Si existen conflictos, el sistema no bloqueara la persistencia, pero pedira una confirmacion consciente que indique claramente que el horario se guardara con incidencias. La accion final y la responsabilidad de aceptar esas excepciones corresponderan al usuario.

El sistema debe conservar junto al horario confirmado el resultado de su validacion, de forma que no se pierda la informacion sobre los conflictos aceptados.

## Modificaciones de horario

El sistema debe contemplar que los horarios pueden cambiar.

Tipos de modificacion:

1. Modificacion temporal: cambio puntual durante un periodo concreto.
2. Modificacion permanente: cambio estable en el horario ordinario.

La definicion detallada de estas modificaciones se deja para una iteracion posterior, pero el modelo funcional debe asumir que el horario no es estatico.

## Dudas pendientes

1. Definir como se gestionaran ausencias, recuperaciones o cambios puntuales de asistencia.
