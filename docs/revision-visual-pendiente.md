# Revisión visual pendiente (ojo humano)

Lista consolidada de todo lo que los validadores del pipeline dejaron marcado como
**pendiente de ojos humanos**: nada de esto lo puede cerrar un test, porque exige un
navegador real, un celular real o un visto bueno de copy/diseño. Compilada de los
reportes `d-validacion.md` (y `c-seguridad.md` donde aplica) de los 13 changes
archivados, PRs #3 a #16.

## Cómo recorrerla

- Sitio local corriendo: `npm run dev` → http://localhost:3000
- Datos de mentira: `npm run db:seed && npm run db:seed:demo` (12 negocios ficticios,
  con publicados, uno en revisión y uno rechazado)
- Panel: http://localhost:3000/admin con la contraseña local (variables del `.env`)
- Los tres anchos se prueban con el modo responsivo del navegador (Cmd+Opt+M en
  Chrome/Firefox): **390px** (celular, el que manda), **768px** (tableta) y
  **1280px** (escritorio). Si un punto no dice ancho, revísalo en los tres.
- Regla general en todo el sitio: sin scroll horizontal, áreas táctiles que se
  sientan de ≥44px, texto legible, y el verde de WhatsApp solo en la acción principal.

---

## Lote 3 (feedback del fundador, 2026-09-04 — pendiente de implementar)

- [ ] Campo **Tu WhatsApp** (y teléfono fijo): agregar `pattern` HTML para que el
  navegador frene letras antes de enviar, sin JS. El servidor ya rechaza texto y
  el teclado del celular ya sale numérico (`inputMode`); esto cubre el tecleo
  libre en escritorio. Superficie sensible (formulario de registro) → entra por
  pipeline, no por ruta corta.
- Gestión de negocios publicados desde el panel → ya es ticket **T-018**.
- [ ] Tras el merge de T-019: el wordmark "EnMiRumbo" en el encabezado a 390px —
  que no se parta ni se sienta apretado (nota de la spec del rebrand).

---

## 1. Home y navegación

- [ ] **Header y footer en los tres anchos.** La marca "EnMiRumbo" arriba,
      el footer con los dos enlaces legales abajo, sin nada encimado ni cortado. El
      validador de PR #3 lo dejó dicho: lo responsive se verificó "por construcción;
      el render en navegador real queda como confirmación visual del humano".
- [ ] **Home a 390px:** un solo título ("¿Qué necesitas en Tizayuca?"), el buscador
      **antes** de la cuadrícula de categorías, las 8 categorías, el bloque de deporte
      al mismo nivel y el botón de registrar al final. Que el orden se sienta natural
      al hacer scroll con el pulgar. (PRs #6 y #7: "revisión visual a 390/768/1280 px
      que ningún test cubre".)
- [ ] **Enlaces legales del footer:** que se puedan tocar con el dedo sin atinarle
      (≥44px) y que se distingan como enlaces. (PR #9, tarea 26 del change, declarada
      humana desde el inicio.)
- [ ] **El verde de acción en pantalla real:** el contraste pasó por script (todos los
      pares ≥4.5:1), pero falta el ojo: que el botón verde se vea como EL botón en una
      pantalla de celular con brillo normal. (PR #3.)

## 2. Registro completo (con foto y sus errores)

Recorrido: home → "Registra tu negocio gratis" → llenar → enviar → pantalla de gracias.

- [ ] **El formulario entero a 390/768/1280px:** campos de ancho completo en celular,
      etiquetas legibles, nada desbordado. (PR #5: "con él van la revisión visual a
      390/768/1280 px".)
- [ ] **Copy sin visto bueno del fundador** (PR #5 lo lista explícito): el texto del
      botón **"Registrar mi negocio"**, los **6 ejemplos de "¿qué ofreces?"** que no
      son literales del PRD, y los **textos de ayuda** bajo los campos. Leerlos en voz
      alta: ¿suenan a Tizayuca o a manual?
- [ ] **Decisión pendiente: errores sin rojo.** Hoy un campo con error se marca con
      borde grueso + "⚠" + negritas (sin color rojo, para no romper la paleta de una
      sola vía de T-002). Enviar el formulario vacío y decidir: ¿así se entiende, o
      hace falta rojo? (PR #5: "la decisión sobre si los errores deben llevar rojo".)
- [ ] **El salto de foco:** al enviar con errores, ¿el cursor/vista brinca al primer
      campo con error? Solo se comprueba con navegador real. (PR #5.)
- [ ] **Doble toque del botón:** picar "enviar" dos veces rápido — el botón debe
      deshabilitarse y no crear dos fichas. (PR #5.)
- [ ] **El ejemplo cambia en vivo:** al elegir categoría, el placeholder de "¿qué
      ofreces?" cambia al ejemplo de esa categoría (con JS encendido). (PR #5.)
- [ ] **Subir una foto desde el celular** (o el modo responsivo): elegir foto, enviar,
      y ver que aparezca después de aprobar. Probar también los errores: una imagen
      muy pesada, un archivo que no es imagen — el mensaje debe ser claro y no perder
      lo capturado. (PR #11: "revisión visual con fotos reales a 390/768/1280 px".)
- [ ] **La casilla "quitar la foto"** al reenviar un registro rechazado: que se vea y
      se entienda igual para todos. (PR #11.)
- [ ] **La línea de la versión del aviso** antes de la casilla de consentimiento:
      "Estás aceptando la versión 1 del aviso de privacidad." — visible y ligada a la
      casilla. (PR #15.)
- [ ] **Pantalla de gracias** a 390px: el mensaje del PRD, sin formulario, sin nada raro.

## 3. Directorio (listados, giros, ficha, compartir)

- [ ] **Listado de categoría a 390px** (ej. `/servicios-del-hogar`): tarjetas con foto
      o marcador, nombre, colonia, "A domicilio" y el botón de WhatsApp como
      protagonista. Filtro de colonias usable con el dedo. (PR #6.)
- [ ] **La ficha SIN foto a 390px — lo primero que hay que mirar.** El validador de
      PR #6 lo marcó como su nota visual principal: "la ficha abre con un marcador de
      foto `aspect-video` a todo lo ancho... a 390px empuja el `h1` y el botón de
      WhatsApp hacia abajo". Abrir una ficha sin foto y decidir si el marcador se
      queda, se encoge o se va.
- [ ] **La ficha CON foto a 390px:** PR #11 lo dejó dicho tal cual — "sin ojos humanos
      no se puede afirmar que la foto no le roba protagonismo al botón de WhatsApp".
      El botón verde debe seguir mandando.
- [ ] **Decisión de producto: "Teléfono: <texto>".** Cuando el fijo guardado no es
      marcable, la ficha lo imprime como texto sin botón "Llamar". El validador de
      PR #6 lo aceptó pero lo dejó "señalado para el humano del PR". ¿Se queda así?
- [ ] **Páginas por giro** (`/plomeria`, `/futbol`, `/plomeria-huicalco`): mismo
      listado, encabezados correctos ("Plomería en Tizayuca", "Clases de futbol en
      Tizayuca"), enlaces de colonias solo donde hay contenido. (PR #10: "revisión
      visual a 390/768/1280 px — pendiente humano; en este entorno no hay navegador".)
- [ ] **Reportar un negocio:** ficha → "Reportar este negocio" (al final) → formulario
      → confirmación. Los tres anchos, motivos legibles, sin opción premarcada.
      (PR #16: "revisión visual a 390px, 768px y 1280px del flujo de reportar... los
      ojos faltan".)
- [ ] **Vista previa de compartir en local:** http://localhost:3000/opengraph-image
      debe responder la imagen de marca. La prueba real de compartir por WhatsApp va
      en la sección de despliegue (necesita URL pública).

## 4. Buscador

- [ ] **Los tres estados de `/buscar` a 390px** (PR #7, tarea 17: "no está cerrada por
      ojos humanos"):
      1. Sin escribir nada → "¿Qué estás buscando?" + las 8 categorías.
      2. Con resultados → probar `plomero`, `comida` (encuentra la fonda por su giro,
         no por su nombre) y `futbol`.
      3. Sin resultados → `veterinario espacial` → el mensaje y las categorías como
         salida, no un callejón.
- [ ] **El campo de búsqueda en la home a 390px:** que campo y botón se toquen bien y
      no se encimen con las categorías. (PR #7.)

## 5. Legales

- [ ] **`/aviso-de-privacidad` y `/terminos` a 390/768/1280px:** páginas largas de puro
      texto — legibles, con jerarquía clara, sin líneas kilométricas en escritorio.
      (PR #9, tarea 26: "declarada desde el inicio como humana".)
- [ ] **La marca de borrador visible:** ambas páginas deben decir que son borrador
      mientras no pase la revisión legal.
- [ ] **Los 7 placeholders del responsable** (`[NOMBRE O RAZÓN SOCIAL]`, domicilio,
      correo ARCO, correo de contacto, WhatsApp, fecha, jurisdicción): localizarlos y
      programar su llenado. Ojo (PR #15): completarlos **estrena la versión 2 del
      aviso** — es contenido publicado y entra en la huella del guardián.
- [ ] **Recordatorio no-visual pero del mismo dueño:** la revisión legal profesional
      (E6-3) antes de quitar la marca de borrador. (PRs #9 y #15.)

## 6. Panel de admin (`/admin`)

- [ ] **Entrar desde el celular (390px):** pantalla de acceso, contraseña equivocada
      (mensaje claro), y todo el panel usable con el pulgar. El validador de PR #8:
      "el único scenario que no pude cerrar yo: 'revisar desde el celular' (390px,
      áreas táctiles, contraste AA)... la comprobación visual real es del humano".
- [ ] **La cola a 390px:** orden del más viejo al más nuevo, el aviso "Lleva más de
      48 horas" que se note, y la sección "Negocios reportados" arriba cuando hay
      reportes. (PRs #8 y #16.)
- [ ] **El detalle de un registro a 390px:** todos los datos capturados legibles, los
      "No capturado" claros, y la constancia de consentimiento con su versión — los
      tres casos: con versión, "(versión no registrada)" y la línea de reaceptación
      tras un reenvío. (PRs #8 y #15.)
- [ ] **Los reportes se leen ANTES de decidir:** en un negocio reportado, la sección de
      reportes va entre los datos y los botones de acción; al atender el último
      reporte aparece "Reporte atendido." y la sección se va. (PR #16: "revisión
      visual... del panel con reportes".)
- [ ] **Aprobar:** elegir giros y colonia, aprobar, y la pantalla "Ya quedó publicado."
      con su botón de avisar por WhatsApp. Los errores del formulario de aprobación
      ("Elige la colonia...") visibles en celular. (PR #8.)
- [ ] **Rechazar:** con motivo, y ver que el mensaje de WhatsApp interpole el motivo
      completo. (PR #8.)
- [ ] **Despublicar:** motivo obligatorio, pantalla de confirmación, y verificar a ojo
      que la ficha desapareció del sitio público. (PR #13.)
- [ ] **El flujo BORRAR a 390px — el más delicado.** PR #13 lo pide con detalle: "la
      pantalla de confirmación con un nombre de negocio larguísimo, las áreas táctiles
      ≥44 px y el contraste AA del bloque '⚠ Acción irreversible'". Crear un negocio
      de mentira con nombre muy largo y recorrer los dos pasos (escribir "borrar").

## 7. Casos especiales (sin JavaScript, celular real)

- [ ] **El sitio sin JavaScript** (desactivarlo en las herramientas del navegador):
      el registro completo (con foto), el buscador y el flujo de reportar deben
      funcionar igual — todo se verificó con `curl`, pero falta verlo. (PRs #5, #7,
      #16.)
- [ ] **El panel entero sin JavaScript:** entrar, cola, aprobar, rechazar, despublicar
      y borrar. PR #13 lo pide explícito para el borrado ("con el JavaScript de
      cliente deshabilitado") y PR #14 para el panel con la medición puesta ("probar...
      el panel con el JavaScript deshabilitado").
- [ ] **"Llamar" en un celular real:** el botón `tel:` de una ficha debe abrir el
      marcador del teléfono. En escritorio no hay forma de probarlo. (PR #14, tarea
      #25: "probar 'Llamar' en un celular real".)
- [ ] **Safari en iPhone — teléfonos fantasma:** falta la meta `format-detection`, así
      que "Safari en iOS puede volver a convertir en `tel:` el texto que parezca
      teléfono" dentro de "¿qué ofreces?", dirección u horario (PR #6, hallazgo menor).
      Abrir una ficha en un iPhone y ver si aparecen enlaces azules donde no van.
- [ ] **Lector de pantalla (opcional, cuando toque accesibilidad completa):** el
      "Revisar →" de la cola es `aria-hidden` y las tarjetas del listado usan `h3`
      colgando del `h1` sin `h2` — ninguno viola spec, pero los dos validadores
      (PRs #6 y #8) pidieron mirarlos "cuando se revisen los lectores de pantalla del
      sitio completo".

---

## Al desplegar: los 3 checks que exigen el sitio en producción

- [ ] **Lighthouse en la URL real: carga <2s en 4G.** La meta del proyecto (CLAUDE.md)
      es medible solo contra el sitio publicado, con red simulada 4G y un celular de
      gama media. Correr Lighthouse (móvil) sobre la home, un listado y una ficha.
- [ ] **Compartir una ficha por WhatsApp de verdad.** Mandar la URL de una ficha a un
      chat y ver la tarjeta: título, descripción y la imagen `og:image` (la foto del
      negocio si tiene, la de marca si no). Exige `SITIO_URL` configurada en el
      build — sin ella no hay canónicas ni `og:image` (PR #10).
- [ ] **Umami midiendo.** La tarea #25 de PR #14 quedó abierta a propósito: "crear la
      cuenta, pegar las dos variables, redesplegar, y probar 'Llamar' en un celular
      real y el panel con el JavaScript deshabilitado". Verificar en el tablero de
      Umami que caen las vistas y los eventos (`whatsapp-ficha`, `llamar`,
      `como-llegar`) y que navegar el panel **no** registra nada. Ojo (PR #15):
      encender la medición obliga a editar el párrafo de cookies del aviso — y eso
      estrena la versión 2.
