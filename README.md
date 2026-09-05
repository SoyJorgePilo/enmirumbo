# EnMiRumbo · Directorio de Negocios de Tizayuca

> "Necesito un plomero", "necesito una fonda", "necesito una escuela de futbol."

Directorio web donde los negocios de Tizayuca, Hidalgo se registran solos desde el celular en menos de 5 minutos — sin cuentas ni contraseñas — y los vecinos los encuentran y les escriben directo por WhatsApp. Cada negocio se verifica manualmente antes de publicarse: **negocios verificados, de vecino a vecino**.

🌱 **Este proyecto se construye en público.** El PRD, el backlog, las especificaciones, las decisiones y el diario de desarrollo viven en este repo. Además del producto, documentamos el proceso: un flujo de desarrollo asistido por agentes de IA que va de la spec al pull request.

## El proyecto

- 📄 [PRD](docs/PRD.md) — qué construimos y por qué (investigación de mercado incluida)
- 🗂️ [Backlog](docs/backlog.md) — épicas e historias del MVP
- 🔁 [Proceso de desarrollo](docs/proceso.md) — PRD → ticket → spec → agentes → PR
- 🧭 [Decisiones](docs/decisiones/) — ADRs
- 📓 [Devlog](docs/devlog/) — el diario building in public
- 📐 [Specs](openspec/) — spec-driven development con OpenSpec

## Stack

Next.js (App Router) · TypeScript · Tailwind CSS · Prisma + PostgreSQL — ver [ADR-001](docs/decisiones/ADR-001-stack.md) y [ADR-004](docs/decisiones/ADR-004-db-produccion.md).

El mismo motor en todos lados: la base local es PostgreSQL, igual que producción.

## Desarrollo

```bash
npm install
npm run db:local       # PostgreSQL local (déjalo corriendo en otra terminal)
npx prisma migrate deploy
npm run db:seed        # catálogos (categorías, colonias, giros)
npm run db:seed:demo   # negocios FICTICIOS para ver el directorio en local
npm run dev            # http://localhost:3000
npm run lint
npm run build
npm test
```

### Variables de entorno

Copia `.env.example` como `.env` (`cp .env.example .env`); ahí está documentada cada variable, y [`docs/despliegue.md`](docs/despliegue.md) las junta todas con lo que hay que poner en producción. Una es requisito de despliegue y conviene tenerla a la vista:

- **`SITIO_URL`** — la URL pública del sitio, sin diagonal final. De ella salen el `sitemap.xml`, las URLs canónicas de cada página, la vista previa al compartir por WhatsApp o Facebook y el link de la ficha que el admin manda al aprobar. En local, sin declararla, se usa `http://localhost:3000`. **En producción, sin ella, el sitio falla a la vista y no a escondidas:** el sitemap responde vacío, no se publican canónicas ni imagen de vista previa absolutas, `robots.txt` omite la línea del sitemap y queda un aviso en el log del servidor — antes que publicar direcciones a `localhost` que Google intentaría rastrear.

### Fotos de los negocios

Un negocio puede subir una foto al registrarse. El servidor la valida por
contenido (no por la extensión), la comprime, le quita los metadatos —el EXIF
de un celular trae GPS— y guarda dos variantes: una para la tarjeta del
listado y otra para la ficha.

**Los archivos no viven en el repo ni en `public/`** ([ADR-006](docs/decisiones/ADR-006-almacenamiento-imagenes.md)):
caen en el directorio que diga la variable de entorno `FOTOS_DIR`, que por
defecto es `.fotos/` en la raíz del proyecto (ignorado por git). Se sirven por
una ruta interna que comprueba en cada petición que el negocio esté publicado,
así que la foto de un registro en revisión no es accesible desde fuera del
panel.

Para verlo de punta a punta en local: `npm run dev`, registra un negocio con
foto en `/registro`, apruébalo desde `/admin` (necesita `PANEL_CONTRASENA` y
`PANEL_SESION_SECRETO` en tu `.env`, ver `.env.example`) y ábrelo en el
listado de su categoría. Las fotos aparecen en `.fotos/`; puedes borrar ese
directorio cuando quieras y volver a sembrar.

Si alguna vez el proceso muere justo entre que se escriben los archivos y se
guarda la ficha, esa foto queda sin dueño (y sin dueño, el borrado ARCO ya no
la alcanza). Para recogerlas:

```bash
npm run fotos:barrer-huerfanos -- --dry-run   # solo mira y reporta
npm run fotos:barrer-huerfanos                # borra las que no son de nadie
```

Solo toca archivos con la forma que escribe el servidor, respeta los recién
escritos (por si son un alta en curso) y se planta si la base a la que apunta
no parece la correcta: si no tiene ni un negocio, o si de golpe "casi todo"
resultara huérfano —que es lo que pasa cuando uno apunta sin querer a staging o
a `test.db`— no borra nada y lo dice. Para esos casos, cuando de verdad haya
que borrarlas, `-- --forzar`. En producción le toca un cron: anotado para T-013.

> **Pendiente de despliegue:** el adaptador local escribe en el sistema de
> archivos, que en un hosting serverless es efímero. Publicar el sitio CON
> fotos depende de que E0-3 confirme proveedor de almacenamiento (ADR-006); el
> día que pase, se escribe el adaptador del proveedor detrás del mismo puerto
> (`src/lib/fotos/almacen.ts`) y se cambia la variable de entorno, sin que
> cambie nada de lo que ve el usuario.

## Estado

🚧 **Pre-MVP** — construyendo las fundaciones. Sigue el avance en el [devlog](docs/devlog/).
