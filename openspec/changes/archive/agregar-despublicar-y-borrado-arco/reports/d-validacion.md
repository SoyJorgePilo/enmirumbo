# Reporte de validación · agregar-despublicar-y-borrado-arco (T-015)

**Veredicto: APROBADO.**

El change cumple sus cuatro deltas de spec, los seis criterios de aceptación del
ticket y los tres gates mecánicos; la auditoría de la etapa C cierra limpia tras
una iteración. La fusión con `main` (T-009 SEO local, T-008 foto y la enmienda
legal del PR #12) está resuelta, y el punto de integración que este change había
dejado documentado —el borrado de los archivos de la foto en el hard delete ARCO—
**queda activo y verificado con archivos de verdad**.

Nada de lo que sigue se tomó de `a-ui.md`, `b-dev.md` ni `c-seguridad.md`: todo
se re-verificó contra el diff, contra el código y —lo que se podía— contra un
servidor real en el puerto 3400, incluida una ficha CON foto.

---

## 1. Cobertura de spec (scenario por scenario)

Los cuatro deltas suman **21 requirements y 60 scenarios**. Muestreo dirigido a
lo que la spec fija con literal exacto o con una condición de carrera:

| Capacidad | Verificación independiente |
| --- | --- |
| `revision-admin` › despublicar condicionada | `despublicarFicha` hace `updateMany({ where: { id, estado: publicado } })`. Contra el servidor: motivo vacío → `303 …?errorDespublicar=motivo` y "Escribe por qué la despublicas" en pantalla, fila intacta; con motivo → `303 …/despublicado` y la fila en `en_revision` con fecha y motivo. |
| › aviso por WhatsApp | El `wa.me` servido trae el mensaje **carácter por carácter** como lo exige el scenario, con el nombre entre `«»` y el motivo del admin. |
| › borrado en dos pasos | La pantalla de confirmación sirve los 6 literales **en el orden exacto** de la spec (comprobado por posición en el HTML). Tres recargas del GET no borran nada. `borra`, vacío y `DELETE` → `?errorBorrar=palabra` y la fila sigue ahí; `"  bOrRaR  "` → borra. |
| › el borrado se lleva todo | Con foto real en el almacén: desaparecen la fila, sus 3 vínculos con giros y **los dos archivos `.webp`** del disco; la foto del negocio vecino sobrevive. Segundo envío → `?resultado=ya-no-existe` y "Esta ficha ya no existe.", sin 500. |
| › sesión obligatoria | `/admin/registros/<id>/borrar` sin cookie responde `307 → /admin` **igual** para un id que existe y para uno inventado; ni un byte del negocio en el cuerpo. |
| › acciones según estado | Publicada: despublicar + borrar, sin aprobar ni rechazar. En revisión: aprobar + rechazar + borrar, sin despublicar. Rechazada: solo borrar. El control de borrar va después de los datos. |
| › cola y 48 horas | Ficha registrada en enero y despublicada hoy: renglón con "Hace menos de una hora", **sin** "Lleva más de 48 horas", el conteo de atrasados dice 1 (el otro registro) y va debajo del más viejo. Etiqueta "Ya estaba publicada, la despublicaste" presente. |
| › republicar conserva los giros | Los 3 checkboxes llegan `checked` (giros 20, 22, 23). Aprobando sin tocar nada: `publicadoEn` pasa a la fecha de hoy, los 3 giros siguen, y el rastro de la despublicación **no** se limpia. |
| `modelo-datos` › rastro y cascada | Migración de dos `ALTER TABLE ADD COLUMN`, sin redefinir la tabla ni tocar los CHECK. El invariante de cascada se prueba recorriendo `PRAGMA foreign_key_list` de **todas** las tablas, así que una relación futura sin cascada rompe la suite. |
| `directorio-publico` › desaparece de todo | Tras despublicar: home, `/belleza`, `/belleza?colonia=`, `/estetica`, `/estetica-tizayuca-centro`, `/buscar` y `/sitemap.xml` — cero apariciones del nombre, WhatsApp, teléfono, dirección, horario y motivo. Su ficha da `404` y el HTML es idéntico al de un id inventado (solo difieren los ids aleatorios que Next inyecta en modo dev). |
| `paginas-legales` › el pendiente sale | Ver la desviación documentada en §3. |

**Scenarios sin cobertura automatizable, con su razón:**

1. `revision-admin` › "decidir con los reportes a la vista" — la capacidad de
   reportes (T-011) no existe todavía. El detalle tiene el comentario ancla en
   el lugar exacto entre los datos y las acciones. Deuda de merge de T-011.
2. `revision-admin` › "la confirmación funciona sin JavaScript y en el celular"
   — la mitad de "sin JS" **sí** quedó verificada (todos los POST de este
   reporte son envíos de formulario sin un solo byte de JavaScript de cliente).
   Los tres anchos, el scroll horizontal, las áreas táctiles y el contraste AA
   siguen necesitando ojos humanos: van como pendiente en el PR.

## 2. Criterios de aceptación del ticket

Los seis se cumplen. El único que merece nota es el quinto ("los reportes
pendientes se muestran junto a las acciones"): depende de T-011, que no ha
mergeado; queda el punto de integración marcado en `page.tsx`. El sexto (flujo
ARCO documentado) está en el requirement del borrado y en `design.md` §4.

## 3. Hallazgos

Ninguno bloqueante. Dos informativos y una deuda nueva.

### INFO 1 — Desviación deliberada del delta de `paginas-legales` (aceptada)

El delta dice, literalmente, que el renglón del flujo ARCO **"se retira"**, y su
scenario que "ya no encuentran el renglón del flujo ARCO en el panel". La
implementación no lo retira: lo **acota** a acceso y rectificación
(`src/lib/legales/textos.ts`), a raíz del hallazgo MEDIO 2 de la etapa C.

Lo verifiqué y **le doy la razón a la implementación**: el renglón original
juntaba las cuatro letras de ARCO, y de esas cuatro este change resuelve dos
(cancelación y oposición). Borrarlo entero dejaría la lista interna de
pendientes legales afirmando que el panel ya atiende el acceso y la
rectificación, que el mismo aviso promete ("escríbenos y los quitamos",
"rectificarlos si están mal") y para las que el panel no tiene ninguna pantalla.
Un checklist de lanzamiento que miente por omisión es peor que un renglón de
más. La suite lo ata en las dos direcciones: ningún pendiente puede seguir
mencionando despublicar o borrar, y acceso/rectificación tiene que seguir
declarado.

**Acción al consolidar en `openspec/specs/`:** redactar el requirement con la
acotación, no con el retiro. No requiere aprobación humana previa al merge (el
texto publicado del aviso y de los términos no cambia ni un carácter — verificado
contra las suites de `legales-paginas` y `legales-adversarial`, en verde).

### INFO 2 — El detalle repinta los giros previos si el admin los desmarca todos y falla otra validación

`src/app/admin/registros/[id]/page.tsx`: `sp.giro ? listaCadenas(sp.giro) :
(registro.girosIds ?? [])`. Si el admin desmarca **los tres** giros y la
aprobación falla por otra cosa (colonia "Otra" sin normalizar), el redirect
vuelve sin ningún parámetro `giro`, así que el formulario vuelve a pintar los
giros viejos marcados y su intención de quitarlos se pierde en silencio.

No viola ningún scenario —"conservando lo que ya había elegido" aplica al caso
de 4 giros, donde los parámetros sí viajan— y el admin lo ve en pantalla antes
de reenviar. Discriminar por `sp.errorAprobar` en vez de por `sp.giro` lo
arregla en una línea. **Al backlog**, no bloquea.

### DEUDA 1 (heredada, confirmada) — `rechazarRegistro` sigue recortando el motivo en silencio

`despublicarFicha` rechaza el motivo que se pasa de los 500 caracteres en vez de
recortarlo, porque ese texto viaja dentro del WhatsApp que se le manda al
negocio y una frase cortada a media palabra es un mensaje roto a un tercero
(hallazgo BAJO 3 de la etapa C). `rechazarRegistro` hace lo contrario desde
T-005, y su propia spec lo fija: corregirlo es un cambio de spec y no cabe en
este change. **Al backlog** (BAJO 5 de `c-seguridad.md`).

### DEUDA 2 (heredada) — Bitácora de acciones destructivas + segundo factor

Hoy nadie puede demostrar quién despublicó o borró, ni cuándo, y el panel tiene
un solo factor. Con un solo admin es tolerable; con dos, no. **Al backlog como
un solo ticket** (BAJO 4 de `c-seguridad.md`), que es como lo dejó la etapa C.

## 4. Alcance

Sin scope creep en el diff de la implementación: los 16 archivos tocados y los
12 nuevos corresponden uno a uno con el "Impacto en código" de la propuesta.

Lo único que sale de esa lista lo agregó **esta etapa**, y es integración, no
funcionalidad nueva: `src/lib/negocio.ts` pasa de `delete` a `deleteMany` y su
tipo de cliente se afloja, para que `borrarNegocio` pueda delegarle el hard
delete completo (fila + giros + **archivos de la foto**) sin duplicar un segundo
camino de borrado que mañana se olvide de la imagen. Va explicado en el mensaje
del commit de la fusión.

## 5. Gates mecánicos (ejecutados por mí, sobre el árbol fusionado)

| Gate | Resultado |
| --- | --- |
| `npm run lint` | limpio |
| `npm test` | **1741 pruebas, 63 archivos**, todas en verde (base de la rama antes de fusionar: 1163 en 40) |
| `npm run build` (con `SITIO_URL`) | correcto, 23 rutas |
| `npm run build` (sin `.env`, como CI) | correcto |
| `npx prisma migrate deploy` + `migrate status` | 5 migraciones aplicadas, **sin drift**, pese a que la de este change (`20260904141721`) es anterior por nombre a la del renombre de la foto (`20260905090000`): esa usa `RENAME COLUMN` y no redefine la tabla, así que el orden no cambia el esquema |

## 6. Datos personales y secretos

- Ningún dato real en el diff. Las fixtures nuevas usan la serie `771999 4xxx`,
  `7xxx`, `8xxx` y `9xxx` y nombres inventados.
- `motivoDespublicacion` y `despublicadoEn` solo se nombran en `src/lib/admin`,
  `src/components/admin`, `src/app/admin` y `src/lib/legales` — cero superficie
  pública (verificado por grep sobre todo `src/`).
- **Log del servidor tras el flujo completo** (despublicar → republicar →
  borrar, con foto): cero apariciones del nombre, del WhatsApp, del teléfono
  fijo, de la dirección, del "¿qué ofreces?" y del motivo.
- La URL posterior al borrado es `/admin/borrado-hecho?resultado=borrado`: sin
  id, sin nombre, sin nada del negocio.
- Sin `any`, sin `"use client"` en ningún archivo nuevo del panel, sin
  dependencias nuevas.

## 7. Lo que sigue en manos de un humano

1. **Revisión visual del flujo BORRAR a 390 px** (y 768/1280), con el
   JavaScript de cliente deshabilitado: la pantalla de confirmación con un
   nombre de negocio larguísimo, las áreas táctiles ≥44 px y el contraste AA del
   bloque "⚠ Acción irreversible".
2. **El CI de GitHub Actions tiene que quedar en verde en el PR.** Esta
   validación local no lo sustituye.
3. **El merge lo hace un humano**, siempre.
