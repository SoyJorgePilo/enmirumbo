# NecesitoUno · Directorio de Negocios de Tizayuca

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

Next.js (App Router) · TypeScript · Tailwind CSS · Prisma + SQLite — ver [ADR-001](docs/decisiones/ADR-001-stack.md).

## Desarrollo

```bash
npm install
npm run db:seed        # catálogos (categorías, colonias, giros)
npm run db:seed:demo   # negocios FICTICIOS para ver el directorio en local
npm run dev            # http://localhost:3000
npm run lint
npm run build
npm test
```

### Variables de entorno

Copia `.env.example` como `.env` (`cp .env.example .env`); ahí está documentada cada variable. Una es requisito de despliegue y conviene tenerla a la vista:

- **`SITIO_URL`** — la URL pública del sitio, sin diagonal final. De ella salen el `sitemap.xml`, las URLs canónicas de cada página, la vista previa al compartir por WhatsApp o Facebook y el link de la ficha que el admin manda al aprobar. En local, sin declararla, se usa `http://localhost:3000`. **En producción, sin ella, el sitio falla a la vista y no a escondidas:** el sitemap responde vacío, no se publican canónicas ni imagen de vista previa absolutas, `robots.txt` omite la línea del sitemap y queda un aviso en el log del servidor — antes que publicar direcciones a `localhost` que Google intentaría rastrear.

## Estado

🚧 **Pre-MVP** — construyendo las fundaciones. Sigue el avance en el [devlog](docs/devlog/).
