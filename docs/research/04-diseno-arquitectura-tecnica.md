# Diseno y arquitectura tecnica

## Proposito del documento

Este documento recoge las decisiones tecnicas iniciales para el MVP.

El objetivo es definir una arquitectura pragmatica, mantenible y suficientemente flexible para cubrir la gestion de personas, la generacion de horarios y futuras ampliaciones razonables.

## Stack tecnologico elegido

### Frontend

El frontend sera una aplicacion web construida con Angular.

Angular encaja con el tipo de aplicacion prevista porque el sistema tendra formularios ricos, vistas de detalle, listados, cuadrantes editables, validaciones visuales y estados de UI relevantes.

### Backend

El backend sera una API construida con NestJS.

NestJS encaja porque ofrece una estructura clara para separar modulos, controladores, servicios, validaciones y logica de negocio.

El backend sera el responsable de aplicar las reglas funcionales del sistema. El frontend no debe duplicar la logica critica de validacion ni de generacion de horarios.

### Base de datos

La base de datos sera Turso/libSQL.

Esta decision mantiene una base ligera y alineada con el volumen reducido del negocio, pero evita depender de un archivo SQLite local y de un filesystem persistente en el servidor de despliegue.

Con Turso/libSQL se mantiene abierta la posibilidad de desplegar en PaaS o en opciones serverless sin bloquear la arquitectura por la persistencia local de SQLite.

## Arquitectura general

La arquitectura inicial se compone de:

1. Frontend Angular.
2. Backend NestJS.
3. Base de datos Turso/libSQL.

El frontend consumira la API del backend.

El backend concentrara la logica de negocio, la persistencia y la generacion de horarios.

La base de datos almacenara las entidades principales del sistema: personas, profesores, horarios, clases, asignaciones y configuracion funcional necesaria.

## Responsabilidades por capa

### Frontend Angular

Responsabilidades:

1. Gestionar la experiencia de usuario.
2. Mostrar listados de alumnos activos y lista de espera.
3. Mostrar y editar detalles de personas.
4. Mostrar el horario semanal global y los cuadrantes por profesor.
5. Permitir crear horarios vacios.
6. Permitir lanzar la generacion automatica de horarios.
7. Permitir editar horarios de forma asistida.
8. Mostrar errores, advertencias y estados de validacion devueltos por el backend.

El frontend puede realizar validaciones basicas de formulario para mejorar la experiencia de usuario, pero las validaciones funcionales definitivas deben ejecutarse en backend.

### Backend NestJS

Responsabilidades:

1. Exponer la API del sistema.
2. Gestionar personas, alumnos activos y lista de espera.
3. Gestionar horarios, clases y asignaciones.
4. Aplicar reglas de negocio.
5. Validar restricciones obligatorias.
6. Evaluar preferencias de planificacion.
7. Ejecutar la generacion automatica del horario semanal global.
8. Persistir y recuperar informacion desde Turso/libSQL.

El backend debe ser la fuente de verdad para decidir si una asignacion es valida.

### Base de datos Turso/libSQL

Responsabilidades:

1. Persistir los datos del sistema.
2. Permitir despliegues sin dependencia de un archivo SQLite local.
3. Mantener una solucion ligera y suficiente para el volumen esperado.

## Generacion automatica de horarios

La generacion automatica debe ejecutarse en el backend.

El frontend solo debe solicitar la accion, por ejemplo desde un boton `Generar horario`, y mostrar el resultado o los problemas encontrados.

La generacion debe resolver el horario semanal global de forma simultanea para los tres profesores. No debe generar cada cuadrante de forma independiente.

La generacion debe tener en cuenta:

1. Disponibilidad de profesores.
2. Curso de cada persona.
3. Asignaturas de cada persona.
4. Horas semanales totales.
5. Horas semanales por asignatura.
6. Franjas no disponibles de cada persona.
7. Personas relacionadas.
8. Capacidad minima, ideal y maxima de las clases.
9. No solape de una persona en la misma franja.

La solucion tecnica recomendada para esta parte es usar un solver de restricciones/optimizacion en el backend, en lugar de implementar un algoritmo manual basado solo en reglas secuenciales.

El volumen esperado del negocio es reducido, con un maximo aproximado de 70-75 alumnos activos, tres profesores y franjas semanales acotadas. Esto hace viable el uso de un solver sin una arquitectura compleja.

## Despliegue

La plataforma de despliegue no queda cerrada en esta fase.

La eleccion de Turso/libSQL evita depender de un disco persistente local para la base de datos, por lo que no se cierra la puerta a despliegues PaaS o serverless.

Opciones compatibles:

1. Azure App Service.
2. Render.
3. Railway.
4. Fly.io.
5. Vercel u otra plataforma serverless, si los tiempos de ejecucion encajan con la generacion automatica.

La unica cautela relevante para serverless es la generacion automatica de horarios. Si el solver necesitara mas tiempo del permitido por la plataforma elegida, esa parte podria moverse a un backend persistente o a un proceso dedicado.

## Evolutivos previstos

La arquitectura debe permitir incorporar mas adelante:

1. Envio de comunicaciones por WhatsApp.
2. Generacion de PDFs de cuadrantes.
3. Almacenamiento de archivos generados o adjuntos.

Estos evolutivos no cambian la arquitectura base.

Para PDFs o artefactos binarios, la recomendacion inicial es almacenar referencias a archivos en base de datos y usar almacenamiento externo o gestionado para el contenido cuando sea necesario. No se recomienda acoplar el modelo principal a base64 en base de datos salvo casos muy puntuales y controlados.

## Principios tecnicos

1. El backend es la fuente de verdad de las reglas de negocio.
2. El frontend no debe duplicar logica critica de generacion o validacion.
3. La generacion de horarios debe resolver el horario global, no cuadrantes aislados.
4. La base de datos debe mantenerse simple y suficiente para el volumen real del negocio.
5. La arquitectura debe permitir despliegue flexible sin depender de SQLite local.
6. Los evolutivos no deben condicionar innecesariamente el MVP.

## Decisiones pendientes

1. Elegir plataforma final de despliegue.
2. Elegir ORM o capa de acceso a datos para NestJS y Turso/libSQL.
3. Elegir solver concreto para la generacion automatica.
4. Definir estrategia de autenticacion.
5. Definir estrategia de testing.
6. Definir estrategia de almacenamiento para PDFs o archivos futuros.
