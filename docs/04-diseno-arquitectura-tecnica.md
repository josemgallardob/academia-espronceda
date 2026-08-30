# Diseno y arquitectura tecnica

## Proposito del documento

Este documento recoge las decisiones tecnicas iniciales para el MVP.

El objetivo es definir una arquitectura pragmatica, mantenible y suficientemente flexible para cubrir la gestion de personas, la generacion de horarios y futuras ampliaciones razonables.

## Convenciones de idioma y comentarios

La interfaz de usuario estara completamente en español. Esto incluye textos, etiquetas, botones, formularios, mensajes de validacion, alertas, avisos de conflictos, dialogos de confirmacion y formatos visibles de fechas, dias y horas.

El codigo y todos los identificadores tecnicos se escribiran en ingles y utilizaran nombres suficientemente descriptivos. Esta convencion se aplicara a:

1. Variables, constantes, funciones y metodos.
2. Clases, interfaces, tipos, enums y decoradores.
3. Modulos, componentes, servicios y repositorios.
4. Archivos, directorios y nombres de paquetes.
5. Tablas, columnas, indices y migraciones.
6. Rutas, propiedades y codigos de los contratos API.
7. Variables de entorno y archivos de configuracion.
8. Identificadores del catalogo de reglas y conflictos.
9. Tests, fixtures y nombres de casos de prueba.
10. Logs y mensajes tecnicos no visibles para el usuario.

Los codigos internos y mensajes tecnicos de la API estaran en ingles, mientras que Angular sera responsable de presentar al usuario su texto equivalente en español. El contenido de la documentacion funcional y de producto podra mantenerse en español.

Los comentarios dentro del codigo se escribiran en ingles y se utilizaran con moderacion. Deben explicar principalmente el motivo de una decision, una invariante importante, una limitacion externa o un comportamiento que no resulte evidente al leer el codigo.

Se evitaran comentarios que repitan literalmente lo que ya expresa el codigo, bloques de codigo comentado y anotaciones de bajo valor. Cuando el codigo pueda hacerse mas claro mediante mejores nombres o una funcion bien delimitada, se preferira esa mejora antes que añadir un comentario.

Los comentarios `TODO` deberan ser concretos, accionables y explicar la condicion necesaria para resolverlos. No se utilizaran como sustituto de tareas del backlog.

## Stack tecnologico elegido

### Frontend

El frontend sera una aplicacion web construida con Angular.

Angular encaja con el tipo de aplicacion prevista porque el sistema tendra formularios ricos, vistas de detalle, listados, cuadrantes editables, validaciones visuales y estados de UI relevantes.

### Backend

El backend sera una API construida con NestJS.

NestJS encaja porque ofrece una estructura clara para separar modulos, controladores, servicios, validaciones y logica de negocio.

El backend sera la API publica y el responsable de aplicar las reglas funcionales del sistema sobre horarios existentes. Tambien orquestara la generacion automatica, pero no ejecutara directamente el solver. El frontend no debe duplicar la logica critica de validacion ni de generacion de horarios.

### Motor de scheduling

El motor de scheduling sera un servicio interno construido con Python y FastAPI.

Utilizara Google OR-Tools CP-SAT para resolver la generacion automatica del horario semanal global como un problema discreto de restricciones y optimizacion.

El servicio estara separado del backend NestJS mediante una API HTTP interna, pero se mantendra en el mismo repositorio que el frontend y el backend. No sera un segundo backend funcional: no gestionara autenticacion, no accedera directamente a Turso/libSQL y no persistira horarios.

### Base de datos

La base de datos sera Turso/libSQL.

El acceso desde NestJS se realizara mediante Drizzle ORM. El esquema se declarara en TypeScript y las migraciones SQL se generaran y aplicaran con Drizzle Kit.

Drizzle quedara limitado a la capa de infraestructura y persistencia. Las reglas de negocio, el validador y los casos de uso no dependeran de tablas ni tipos propios del ORM.

Esta decision mantiene una base ligera y alineada con el volumen reducido del negocio, pero evita depender de un archivo SQLite local y de un filesystem persistente en el servidor de despliegue.

Con Turso/libSQL se mantiene abierta la posibilidad de desplegar en PaaS o en opciones serverless sin bloquear la arquitectura por la persistencia local de SQLite.

## Arquitectura general

La arquitectura inicial se compone de:

1. Frontend Angular.
2. Backend NestJS.
3. Motor de scheduling Python expuesto mediante FastAPI.
4. Base de datos Turso/libSQL.

El frontend consumira la API del backend.

El backend concentrara la logica de negocio, la validacion de horarios existentes, la persistencia y la orquestacion de la generacion automatica.

Para generar un horario desde cero, NestJS construira la entrada del problema y llamara por HTTP al motor Python. El motor devolvera una propuesta de asignaciones, el estado de la resolucion, la puntuacion y los conflictos detectados. NestJS transformara ese resultado al modelo funcional de la aplicacion y lo tratara como un borrador.

Los tres componentes de aplicacion se mantendran en un mismo repositorio, aunque NestJS y Python se ejecuten como procesos o contenedores separados. La separacion responde a sus responsabilidades y runtimes diferentes, no a la necesidad inicial de mantener productos o ciclos de despliegue independientes.

La base de datos almacenara las entidades principales del sistema: usuarios, personas, profesores, horarios, clases, asignaciones, resultados de validacion y configuracion funcional necesaria.

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
9. Resaltar las clases con conflictos y mostrar el listado global de avisos del horario semanal.
10. Solicitar una confirmacion explicita antes de persistir un horario con conflictos conocidos.
11. Gestionar el formulario de acceso, el cierre de sesion y la redireccion al login cuando la sesion expire.

El frontend puede realizar validaciones basicas de formulario para mejorar la experiencia de usuario, pero las validaciones funcionales definitivas deben ejecutarse en backend.

### Gestion del estado del frontend

Para el MVP no se usara inicialmente NgRx con un patron Redux global, ya que la complejidad prevista no justifica el coste adicional de acciones, reducers, efectos y selectores para toda la aplicacion.

La estrategia inicial sera:

1. Mantener el estado local de interfaz, como filtros, pestanas activas, selecciones, formularios y modales, dentro de los componentes mediante Angular Signals.
2. Gestionar los datos obtenidos del backend, como personas, profesores y horarios, mediante servicios o fachadas apoyados en Signals y RxJS.
3. Mantener el estado compartido acotado a cada funcionalidad, evitando un store global salvo que exista una necesidad demostrada.
4. Mantener en el backend las reglas de negocio y validaciones definitivas, sin convertir el estado del frontend en una segunda fuente de verdad.

La edicion del horario es la funcionalidad con mayor probabilidad de necesitar una gestion de estado mas estructurada. Si durante su implementacion aparecen flujos asincronos encadenados, actualizaciones optimistas con rollback, deshacer y rehacer, multiples vistas modificando simultaneamente el mismo estado o problemas recurrentes de consistencia, se podra introducir un store limitado a esta funcionalidad, preferiblemente mediante NgRx Signal Store.

NgRx con Redux global solo se incorporara si la complejidad real de la aplicacion demuestra que sus garantias y trazabilidad compensan el coste arquitectonico. No se adoptara de forma preventiva.

### Backend NestJS

Responsabilidades:

1. Exponer la API del sistema.
2. Gestionar personas, alumnos activos y lista de espera.
3. Gestionar horarios, clases y asignaciones.
4. Aplicar las reglas de negocio deterministas sobre horarios existentes.
5. Validar las interacciones de edicion, incluido el arrastrar y soltar, contra el horario semanal global.
6. Ejecutar la validacion completa previa a la confirmacion y devolver conflictos estructurados sin imponer un bloqueo absoluto a la decision del usuario.
7. Evaluar preferencias de planificacion sobre soluciones existentes.
8. Construir la entrada del motor Python, solicitar por HTTP la generacion automatica y transformar su respuesta en un borrador de horario.
9. Validar el resultado recibido del motor antes de presentarlo o persistirlo.
10. Persistir y recuperar informacion desde Turso/libSQL.
11. Verificar credenciales, emitir y validar JWT, proteger la API y aplicar las medidas de seguridad de sesion.

El backend debe ser la fuente de verdad funcional de cara al frontend para evaluar un horario y calcular sus conflictos. Tambien debe permitir persistir un horario con incidencias cuando la peticion incluya la confirmacion explicita del usuario y conservar el resultado de la validacion aceptada.

### Motor de scheduling Python

Responsabilidades:

1. Recibir desde NestJS un problema de planificacion completo y autocontenido.
2. Construir el modelo CP-SAT.
3. Aplicar al modelo el catalogo vigente de reglas y preferencias.
4. Resolver simultaneamente el horario semanal global de todos los profesores.
5. Intentar primero una solucion estricta y, cuando corresponda, obtener la mejor solucion relajada posible.
6. Devolver asignaciones, estado del solver, puntuacion y conflictos estructurados.
7. Respetar limites configurables de tiempo y recursos por generacion.

El motor no accedera a la base de datos ni sera consumido directamente por Angular. NestJS sera su unico consumidor dentro de la aplicacion.

### Base de datos Turso/libSQL

Responsabilidades:

1. Persistir los datos del sistema.
2. Permitir despliegues sin dependencia de un archivo SQLite local.
3. Mantener una solucion ligera y suficiente para el volumen esperado.
4. Gestionar el esquema y las migraciones mediante Drizzle ORM y Drizzle Kit.

## Estrategia de autenticacion

La autenticacion del MVP sera deliberadamente simple y estara limitada a los dos propietarios de la academia.

Ambos usuarios tendran las mismas capacidades. No se implementaran roles, permisos diferenciados, registro publico, invitaciones, login social ni administracion de cuentas desde la interfaz.

Las dos cuentas se crearan previamente mediante un seed seguro o un comando administrativo. Las credenciales iniciales no se incluiran en el repositorio ni en migraciones versionadas.

### Modelo de usuario

La tabla de usuarios incluira como minimo:

1. Identificador.
2. Nombre de usuario unico.
3. Email unico.
4. Hash de contraseña.
5. Estado activo.
6. Version de token.
7. Fecha del ultimo acceso.
8. Fechas de creacion y actualizacion.

El formulario de acceso utilizara un unico campo de identificacion que aceptara nombre de usuario o email, junto con la contraseña.

La autenticacion devolvera siempre un mensaje generico cuando las credenciales no sean validas, sin revelar si el usuario o email existe.

### Almacenamiento de contraseñas

Las contraseñas se almacenaran mediante Argon2id con salt individual y parametros de coste configurables. Nunca se almacenaran en texto plano, mediante cifrado reversible ni con funciones hash rapidas de proposito general.

El alta inicial y cualquier cambio o restablecimiento de contraseña se realizaran exclusivamente mediante un script administrativo. No se implementara esta funcionalidad en Angular ni se expondra un endpoint publico para ella.

El script recibira el usuario o email de la cuenta, solicitara la nueva contraseña de forma interactiva sin mostrarla en pantalla ni incluirla en los argumentos del proceso, generara el nuevo hash Argon2id e incrementara la version de token para invalidar las sesiones emitidas anteriormente.

El script requerira acceso administrativo explicito a la configuracion de la base de datos y no registrara contraseñas, hashes ni secretos en los logs.

### Emision y validacion del JWT

NestJS emitira un JWT despues de verificar correctamente las credenciales.

El payload sera minimo e incluira:

1. `sub` con el identificador del usuario.
2. Nombre de usuario.
3. Version de token.
4. Emisor.
5. Audiencia.
6. Fecha de emision.
7. Fecha de expiracion.

No se incluiran roles ni permisos.

NestJS validara en cada peticion:

1. Firma y algoritmo esperado.
2. Expiracion.
3. Emisor y audiencia.
4. Existencia y estado activo del usuario.
5. Coincidencia de la version de token.

Para el MVP se utilizara firma simetrica HS256 con un secreto aleatorio fuerte almacenado en la configuracion segura del entorno. El secreto no se incluira en el codigo fuente.

La duracion del JWT sera configurable y estara orientada a cubrir una jornada de trabajo, inicialmente entre 8 y 12 horas. No se implementaran refresh tokens ni renovacion silenciosa. Una vez expirado el token, el usuario debera autenticarse de nuevo.

### Transporte y almacenamiento en el navegador

El JWT se transportara en una cookie con las propiedades `HttpOnly`, `Secure`, `SameSite=Strict` y `Path=/`, preferiblemente con el prefijo `__Host-`.

Angular no almacenara el JWT en `localStorage` ni `sessionStorage` y no necesitara acceder a su contenido. El navegador enviara la cookie automaticamente en las llamadas a la API NestJS.

Si frontend y backend se sirven desde origenes distintos, Angular enviara las peticiones con credenciales y NestJS limitara CORS exclusivamente a los origenes configurados. No se combinara el uso de credenciales con un origen comodin.

Cerrar sesion eliminara la cookie. Desactivar un usuario, cambiar su contraseña o incrementar manualmente su version de token invalidara sus JWT anteriores.

### Proteccion CSRF

Al utilizar una cookie de autenticacion, las operaciones que modifican estado estaran protegidas frente a CSRF.

Se utilizara el mecanismo XSRF de Angular:

1. El backend emitira un token XSRF separado del JWT.
2. Angular enviara ese valor en la cabecera `X-XSRF-TOKEN`.
3. NestJS verificara la correspondencia entre el token esperado y la cabecera en peticiones `POST`, `PUT`, `PATCH` y `DELETE`.
4. NestJS comprobara tambien el origen de las peticiones que modifican estado.

La cookie `SameSite=Strict` se considerara una defensa adicional, no la unica proteccion CSRF.

### Endpoints y proteccion de la API

La API incluira inicialmente:

1. `POST /auth/login`.
2. `POST /auth/logout`.
3. `GET /auth/me`.

Se aplicara un guard de autenticacion global en NestJS. Solo el login, el endpoint de salud y otros endpoints declarados expresamente publicos quedaran fuera del guard.

El login tendra limitacion de intentos por IP e identificador. Se registraran los accesos y fallos relevantes sin incluir contraseñas, JWT completos ni otros secretos en los logs.

Todo el trafico autenticado utilizara HTTPS en los entornos desplegados y NestJS aplicara cabeceras de seguridad.

### Autenticacion del motor Python

El JWT identifica usuarios humanos ante la API publica NestJS y no se propagara como mecanismo de acceso al motor Python.

FastAPI continuara siendo un servicio interno, sin usuarios ni roles. La comunicacion NestJS a FastAPI estara limitada a la red privada y utilizara un secreto de servicio independiente o un mecanismo equivalente de autenticacion interna.

Angular nunca consumira directamente el motor Python.

## Generacion automatica de horarios

La generacion automatica se iniciara desde el frontend, sera orquestada por NestJS y se ejecutara en el motor Python mediante Google OR-Tools CP-SAT.

El frontend solo debe solicitar la accion, por ejemplo desde un boton `Generar horario`, y mostrar el resultado o los problemas encontrados.

NestJS obtendra los datos vigentes, construira el contrato de entrada y llamara al servicio FastAPI por HTTP. Angular no tendra acceso directo al motor Python.

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

La solucion tecnica elegida para esta parte es CP-SAT, ejecutado en Python. El modelo utilizara restricciones obligatorias para la solucion estricta y objetivos ponderados para optimizar preferencias. Si se necesita una solucion relajada, los conflictos de negocio relajables se priorizaran segun su gravedad sin permitir que las preferencias compensen indebidamente incumplimientos mas importantes.

El solver debe buscar primero una solucion que cumpla todas las reglas y optimice las preferencias. Si no existe o no se encuentra una solucion completamente valida, debe devolver la mejor solucion disponible junto con un diagnostico estructurado de los conflictos, en lugar de finalizar sin horario.

El volumen esperado del negocio es reducido, con un maximo aproximado de 70-75 alumnos activos, tres profesores y franjas semanales acotadas. Esto hace viable el uso de un solver sin una arquitectura compleja.

## Contrato entre NestJS y el motor Python

La comunicacion entre NestJS y FastAPI se realizara mediante HTTP interno y un contrato explicito y versionado.

El contrato debe:

1. Ser independiente de las entidades concretas de persistencia.
2. Incluir todos los datos necesarios para resolver sin que Python consulte la base de datos.
3. Definir de forma inequivoca asignaciones, reglas incumplidas, puntuaciones y estados del solver.
4. Incluir la version del contrato y la version del catalogo de reglas utilizadas.
5. Ser validado tanto en NestJS como en Python.
6. Mantener identificadores estables para las reglas y preferencias.

La API interna incluira inicialmente una operacion versionada para generar horarios, por ejemplo `POST /v1/schedules/solve`, y un endpoint de salud. La API del motor no se expondra directamente al frontend ni a clientes externos.

## Validacion de horarios existentes

Las validaciones de horarios ya construidos se ejecutaran en NestJS mediante un servicio determinista basado en reglas.

Este servicio se utilizara para:

1. Validar cada operacion de arrastrar y soltar.
2. Recalcular conflictos durante la creacion manual y la edicion.
3. Evaluar el horario semanal global despues de varios cambios.
4. Ejecutar la validacion final antes de confirmar y persistir.
5. Validar el borrador recibido del motor Python.

Estas operaciones no llamaran al motor Python ni ejecutaran CP-SAT. Evaluaran una solucion concreta y deben responder con rapidez suficiente para mantener fluida la interaccion de la interfaz.

El solver se reservara para operaciones de busqueda y optimizacion, inicialmente la generacion automatica desde cero. Una futura reparacion automatica del horario podria volver a utilizarlo, pero no forma parte de la validacion determinista.

## Catalogo compartido de reglas

El motor Python y el servicio de validacion de NestJS deben estar sujetos al mismo catalogo funcional de reglas.

El catalogo sera un artefacto versionado y neutral respecto al lenguaje, mantenido dentro del repositorio. Para cada regla definira como minimo:

1. Identificador estable.
2. Nombre y descripcion.
3. Clasificacion como regla obligatoria o preferencia.
4. Severidad.
5. Condicion funcional de cumplimiento o incumplimiento.
6. Datos y entidades implicadas.
7. Criterios necesarios para explicar el conflicto al usuario.

Cada runtime tendra una implementacion adaptada a su cometido:

1. Python traducira las reglas a restricciones, variables y terminos del objetivo CP-SAT.
2. NestJS evaluara las mismas reglas de forma determinista sobre un horario existente.

La coherencia entre ambas implementaciones es una condicion arquitectonica obligatoria. Una solucion que el motor devuelva sin conflictos debe producir cero conflictos al validarse en NestJS. Del mismo modo, los incumplimientos declarados por el motor deben poder expresarse mediante los mismos identificadores y criterios que utiliza el backend.

Para evitar divergencias se mantendran casos de prueba y fixtures compartidos. Como prueba de integracion minima, todo horario generado por Python se validara posteriormente en NestJS y ambos resultados deberan ser coherentes con la version del catalogo indicada en el contrato.

## Estrategia de testing

La estrategia de testing seguira un enfoque por capas orientado al riesgo: muchos tests rapidos sobre la logica de dominio, una capa relevante de integracion entre componentes reales y un conjunto reducido de pruebas end-to-end sobre los recorridos criticos del usuario.

No se perseguira un porcentaje global de cobertura como objetivo aislado. La prioridad sera cubrir exhaustivamente las ramas, invariantes y casos limite del validador de horarios, el contrato entre NestJS y Python y el comportamiento del solver.

Principios generales:

1. Probar comportamiento observable y reglas de negocio, no detalles privados de implementacion.
2. Mantener cada test aislado, reproducible e independiente del orden de ejecucion.
3. Utilizar factories, builders y fixtures con nombres funcionales para construir datos de prueba.
4. Evitar mocks de la logica propia cuando pueda probarse la integracion real con un coste razonable.
5. Simular solamente fronteras externas que no controle la aplicacion.
6. Ejecutar las pruebas automaticas en integracion continua desde el inicio del desarrollo.
7. Mantener semillas y limites de ejecucion controlados en las pruebas del solver.

### Tests unitarios y de dominio

La mayor concentracion de tests estara en la logica determinista del backend NestJS.

El servicio de validacion debe poder probarse sin arrancar HTTP, Angular, la base de datos ni el motor Python. Cada regla del catalogo tendra ejemplos positivos, negativos y casos limite.

Se probaran como minimo:

1. Disponibilidad de alumnos y profesores.
2. Compatibilidad de cursos y asignaturas.
3. Horas contratadas, asignadas, restantes y excedidas.
4. Capacidades minima, ideal y maxima.
5. Solapes de una persona entre profesores.
6. Reparto de horas por asignatura.
7. Alta y retirada de asignaciones.
8. Clasificacion, severidad y explicacion de conflictos.
9. Confirmacion de borradores con y sin incidencias.
10. Persistencia del resultado de validacion aceptado por el usuario.
11. Validacion de credenciales, version de token y expiracion de sesiones.

Los tests se expresaran con una estructura equivalente a `Given`, `When`, `Then`, sin introducir inicialmente un framework BDD adicional.

Angular utilizara Vitest y las utilidades oficiales de Angular para probar servicios, componentes y su DOM. NestJS utilizara Jest y `@nestjs/testing`, siguiendo las herramientas integradas por defecto en cada framework.

El motor Python utilizara `pytest` para probar la construccion del modelo CP-SAT, la traduccion de entradas, la interpretacion de estados del solver y la serializacion de respuestas. Las funciones puras de modelado y puntuacion se probaran separadas de FastAPI.

### Property-based testing

Las reglas con muchas combinaciones utilizaran property-based testing para complementar los ejemplos escritos manualmente.

NestJS utilizara `fast-check` para generar personas, disponibilidades, clases y horarios. Python utilizara `Hypothesis` cuando la propiedad pertenezca especificamente al modelo o al adaptador del solver.

Se comprobaran invariantes como:

1. Un alumno asignado `n` veces tiene como saldo `horas contratadas - n`.
2. Retirar una asignacion deshace exactamente su efecto sobre el horario y los contadores.
3. Todo solape existente es detectado por el validador.
4. Todo conflicto referencia entidades y franjas existentes.
5. Validar dos veces el mismo horario produce el mismo resultado.
6. Reordenar los datos de entrada no cambia la validez funcional del horario.
7. Añadir un incumplimiento no mejora la puntuacion de la solucion.
8. Persistir y recuperar un horario conserva asignaciones, estado y conflictos aceptados.

Cuando una propiedad falle, el caso reducido por la herramienta se conservara como fixture de regresion si representa un defecto relevante.

### Tests del solver y de optimizacion

Los tests del solver no exigiran un cuadrante exacto, porque pueden existir varias soluciones equivalentes. Verificaran las propiedades funcionales, la puntuacion y el diagnostico de la solucion devuelta.

Se mantendra un conjunto versionado de problemas de referencia, como minimo:

1. `minimal-valid`.
2. `multiple-valid-solutions`.
3. `impossible-availability`.
4. `student-overlap`.
5. `insufficient-capacity`.
6. `cross-subject-teachers`.
7. `best-effort-required`.
8. `weekly-hours-exceeded`.

Sobre estos problemas se comprobara que:

1. Un caso factible conocido produce una solucion sin conflictos.
2. Un caso imposible produce una solucion relajada o parcial con sus conflictos explicados.
3. La puntuacion y los incumplimientos devueltos son coherentes.
4. Las preferencias nunca compensan indebidamente una regla de mayor gravedad.
5. El solver respeta el limite de tiempo configurado y conserva la mejor solucion encontrada.
6. La respuesta distingue correctamente entre solucion optima, factible, relajada, no encontrada y error tecnico.
7. Una misma semilla y configuracion permiten reproducir un fallo de prueba.

El solver y el validador no compartiran una unica implementacion ejecutable de las reglas. Python propondra y puntuara durante la busqueda; NestJS evaluara independientemente la solucion concreta. Todo resultado generado por Python se pasara por el validador NestJS y las divergencias haran fallar la prueba.

### Tests de integracion del backend

NestJS se probara por modulos y mediante peticiones HTTP reales con Supertest.

Los tests de integracion cubriran:

1. Creacion y edicion de personas.
2. Creacion de un horario vacio.
3. Modificacion de asignaciones mediante las operaciones equivalentes al arrastrar y soltar.
4. Consulta del listado global de avisos.
5. Confirmacion de un horario sin conflictos.
6. Confirmacion explicita de un horario con incidencias.
7. Rechazo de la persistencia con incidencias cuando falte la confirmacion expresa.
8. Recuperacion de un horario confirmado junto con los conflictos aceptados.
9. Login valido e invalido sin revelar la existencia de la cuenta.
10. Emision, expiracion e invalidacion del JWT por cambio administrativo de contraseña o version de token.
11. Propiedades de la cookie, logout, guard global y proteccion CSRF.
12. Limitacion de intentos sobre el endpoint de login.

La persistencia se probara contra una base Turso/libSQL local y aislada por suite, ejecutando las migraciones reales. No se sustituira el repositorio por un mock en las pruebas destinadas a verificar consultas, restricciones, transacciones o migraciones.

Se añadira un numero reducido de smoke tests contra una base Turso remota exclusiva de pruebas para verificar configuracion, autenticacion y comportamiento de la conexion desplegada.

FastAPI se probara con `pytest` y su cliente de pruebas. Las pruebas cubriran validacion del contrato, respuestas de error, limites de tiempo, endpoint de salud y transformacion entre el contrato HTTP y el modelo CP-SAT.

### Tests de contrato entre NestJS y Python

El contrato HTTP interno se verificara en ambos runtimes a partir de un esquema versionado comun.

Se probaran como minimo:

1. Compatibilidad de peticiones y respuestas con la version declarada.
2. Campos obligatorios, enumeraciones, identificadores y formatos.
3. Compatibilidad del catalogo de reglas y sus versiones.
4. Respuestas de error y estados del solver.
5. Lectura por NestJS de respuestas reales producidas por FastAPI.
6. Lectura por FastAPI de fixtures reales producidos por NestJS.

Inicialmente se utilizaran esquemas compartidos y fixtures de contrato dentro del monorepositorio. No se introducira Pact mientras ambos servicios mantengan repositorio, pipeline y versionado coordinados. Se reconsiderara si sus despliegues o ciclos de versionado pasan a ser independientes.

### Tests de componentes Angular

Los componentes Angular se probaran a traves de su plantilla y comportamiento visible.

Se cubriran especialmente:

1. Contadores de horas restantes y excedidas.
2. Estado visual de alumnos completos o con conflicto.
3. Alertas previas a una asignacion excepcional.
4. Resaltado `danger` de clases conflictivas.
5. Actualizacion de la pestaña global de avisos.
6. Navegacion entre dias y profesores.
7. Dialogo de confirmacion con resumen de incidencias.
8. Cancelacion y aceptacion de operaciones excepcionales.
9. Errores de red y respuestas invalidas del backend.

Las pruebas consultaran los elementos mediante roles, etiquetas, texto visible o identificadores de prueba estables. No dependeran de clases CSS o de la estructura interna del DOM salvo cuando el estilo sea precisamente el comportamiento verificado.

### Tests end-to-end

Playwright cubrira un conjunto reducido de recorridos completos:

1. Crear un alumno, generar un horario valido, revisarlo y confirmarlo.
2. Crear un horario vacio, asignar alumnos manualmente y guardarlo.
3. Crear un solape, recibir la alerta, mantenerlo y confirmar con incidencias.
4. Retirar un alumno de una clase y recuperar su hora disponible.
5. Navegar entre dias y profesores conservando el estado semanal global.
6. Recibir una solucion automatica relajada, revisar sus avisos y decidir si confirmarla.

Los tests seran independientes y controlaran sus propios datos. En cada push a la rama principal se ejecutaran los recorridos criticos en Chromium. La suite completa se ejecutara tambien en Firefox y WebKit antes de una entrega o de forma programada.

### Regresion visual

Las capturas de regresion visual se reservaran para vistas estables y de alto valor, principalmente el cuadrante diario, los estados de conflicto y el dialogo final de confirmacion. No se utilizaran snapshots masivos de componentes como sustituto de aserciones funcionales.

### Ejecucion en integracion continua

El proyecto sera desarrollado inicialmente por una sola persona y utilizara `main` como rama principal. No sera obligatorio crear pull requests ni solicitar aprobaciones para integrar cambios.

Los cambios ordinarios podran realizarse directamente sobre `main` mediante commits pequeños y frecuentes. Se podran utilizar ramas de corta duracion para funcionalidades grandes, experimentos o refactorizaciones de mayor riesgo, pero su uso sera opcional.

En cada push a `main` se ejecuta `.github/workflows/ci.yml`, sin exigir pull request:

1. Formato, lint y comprobacion de tipos (lint mas builds).
2. Tests unitarios y property-based de TypeScript y Python.
3. Tests de integracion HTTP de NestJS sobre libSQL local. FastAPI se cubre con su suite pytest.
4. Validacion de contratos versionados.
5. Build de Angular, NestJS y motor Python.

Los recorridos end-to-end criticos en Chromium quedan como job reservado del mismo workflow,
lanzable a mano con `include_extended` cuando esa suite exista en `main`.

Antes de un despliegue, al crear una version o de forma programada se ejecutara:

1. Suite end-to-end completa en Chromium, Firefox y WebKit.
2. Regresion visual seleccionada.
3. Conjunto ampliado de datasets del solver.
4. Smoke tests contra los servicios y la base de datos del entorno de pruebas.

Los fallos intermitentes no se resolveran mediante reintentos indefinidos. Deben diagnosticarse, aislarse y corregirse; los reintentos se limitaran a absorber fallos transitorios conocidos de infraestructura.

El despliegue solo podra continuar cuando las comprobaciones obligatorias de la rama principal hayan finalizado correctamente.

## Despliegue

La plataforma de despliegue no queda cerrada en esta fase.

La eleccion de Turso/libSQL evita depender de un disco persistente local para la base de datos, por lo que no se cierra la puerta a despliegues PaaS o serverless.

Opciones compatibles:

1. Azure App Service.
2. Render.
3. Railway.
4. Fly.io.
5. Vercel u otra plataforma serverless, si los tiempos de ejecucion encajan con la generacion automatica.

NestJS y el motor Python podran desplegarse como dos procesos o contenedores privados dentro de la misma unidad operativa. Inicialmente compartiran repositorio, pipeline y versionado, sin necesidad de colas, descubrimiento de servicios ni escalado independiente.

La comunicacion HTTP entre ambos debe mantenerse en una red interna. El despliegue debera configurar timeout, limites de concurrencia y observabilidad para las llamadas de generacion.

La unica cautela relevante para serverless es el servicio Python de generacion automatica. Si el tiempo de arranque o de resolucion no encaja con los limites de la plataforma elegida, el motor debera ejecutarse como un servicio persistente o proceso dedicado.

## Evolutivos previstos

La arquitectura debe permitir incorporar mas adelante:

1. Envio de comunicaciones por WhatsApp.
2. Generacion de PDFs de cuadrantes.
3. Almacenamiento de archivos generados o adjuntos.

Estos evolutivos no cambian la arquitectura base.

Para PDFs o artefactos binarios, la recomendacion inicial es almacenar referencias a archivos en base de datos y usar almacenamiento externo o gestionado para el contenido cuando sea necesario. No se recomienda acoplar el modelo principal a base64 en base de datos salvo casos muy puntuales y controlados.

## Principios tecnicos

1. NestJS es la API publica y la fuente de verdad funcional para validar horarios existentes.
2. El frontend no debe duplicar logica critica de generacion o validacion.
3. La generacion de horarios debe resolver el horario global, no cuadrantes aislados.
4. La generacion desde cero debe ejecutarse en el motor Python con CP-SAT; la validacion de soluciones existentes debe ejecutarse en NestJS sin llamar al solver.
5. Python y NestJS deben aplicar el mismo catalogo versionado de reglas y mantener resultados coherentes.
6. La comunicacion entre NestJS y FastAPI debe realizarse mediante un contrato HTTP explicito y versionado.
7. El motor Python no debe acceder directamente a la base de datos ni exponerse al frontend.
8. La base de datos debe mantenerse simple y suficiente para el volumen real del negocio.
9. La arquitectura debe permitir despliegue flexible sin depender de SQLite local.
10. Los evolutivos no deben condicionar innecesariamente el MVP.
11. El estado del frontend debe gestionarse inicialmente con Signals, RxJS y servicios o fachadas por funcionalidad, introduciendo NgRx solo ante necesidades concretas de complejidad y coordinacion.
12. La estrategia de testing debe priorizar el dominio, las propiedades del horario y la coherencia independiente entre el solver Python y el validador NestJS.
13. Drizzle ORM sera la capa de acceso a Turso/libSQL y no formara parte del dominio.
14. La autenticacion utilizara dos cuentas precreadas, sin roles, mediante credenciales clasicas y JWT en cookie segura.
15. La UI y sus mensajes estaran en español; el codigo, los identificadores tecnicos, los tests y los comentarios estaran en ingles.
16. Los comentarios de codigo seran escasos y explicaran decisiones o comportamientos no evidentes, evitando ruido y repeticion.

## Decisiones pendientes

1. Elegir plataforma final de despliegue.
2. Definir estrategia de almacenamiento para PDFs o archivos futuros.
