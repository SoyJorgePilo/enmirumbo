# Delta: plataforma-astro

> Capacidad nueva de ADR-013 (Fase 1). Describe el marco sobre el que corre el sitio, no comportamiento de producto: **ningún comportamiento de las capacidades existentes cambia**, y sus specs siguen siendo el contrato. Vive en la rama `migracion-astro` hasta el corte (T-027).

## ADDED Requirements

### Requirement: El sitio se construye con Astro, sin base de datos y sin Next

El build oficial (`npm run build`) DEBE ser el de Astro con salida para Vercel, y DEBE completarse sin ninguna base de datos accesible, igual que hoy. El build NO DEBE invocar a Next ni compilar o publicar como ruta nada de `src/app/`, que convive en el repositorio hasta el corte. La raíz de certificación de Supabase (`certs/supabase-root-2021-ca.crt`) DEBE viajar dentro de la función del servidor en la salida del build, porque `pg` la abre en tiempo de ejecución y ninguna importación la delata.

#### Scenario: build sin base

- **WHEN** se corre `npm run build` con `DATABASE_URL` apuntando a un puerto donde no hay nadie
- **THEN** termina con éxito, deja la salida para Vercel y no intenta conectarse

#### Scenario: el build no es el de Next

- **WHEN** se corre `npm run build` en un clon limpio
- **THEN** no se genera `.next/` y ninguna ruta de la salida proviene de un archivo de `src/app/`

#### Scenario: el certificado viaja con la función

- **WHEN** se inspecciona la salida del build
- **THEN** `certs/supabase-root-2021-ca.crt` está dentro del paquete de la función del servidor, en la ruta relativa que usa `sslrootcert`

### Requirement: Los componentes de React se pintan en servidor sin JavaScript de cliente

Un componente de `src/components/` usado desde Astro sin directiva `client:` DEBE renderizarse a HTML en el servidor y NO DEBE agregar a la página ningún `<script>`, `modulepreload` ni isla de hidratación. Es la premisa de ADR-013 que permite conservar los componentes y sus pruebas.

#### Scenario: componente React sin JS

- **WHEN** las pruebas renderizan un archivo `.astro` que usa un componente de `src/components/` sin directiva `client:`
- **THEN** el HTML contiene el marcado del componente y no contiene `<script`, `modulepreload` ni `astro-island`

### Requirement: Los componentes no dependen de Next para enlaces e imágenes

Ningún archivo de `src/components/` DEBE importar `next/link` ni `next/image`. En su lugar DEBEN usar una capa de compatibilidad propia, `Link` e `Imagen`, que para las props que hoy se usan produzca el mismo HTML que producían los de Next: un `<a>` con su `href` y atributos, y un `<img>` sin optimizador, con el posicionamiento de relleno, `loading="lazy"` salvo en la imagen prioritaria y `fetchpriority="high"` en esa. Ningún texto, clase ni atributo visible al vecino DEBE cambiar.

#### Scenario: ningún componente importa Next

- **WHEN** se busca `next/link` o `next/image` en `src/components/`
- **THEN** no aparece ninguna coincidencia

#### Scenario: el enlace se pinta igual

- **WHEN** se renderiza en servidor `Link` y `next/link` con el mismo `href`, `className` e hijos, como los usa el header ("EnMiRumbo" hacia `/`)
- **THEN** los dos HTML son idénticos

#### Scenario: la foto se pinta igual

- **WHEN** se renderiza en servidor `Imagen` y `next/image` con las props de `MarcadorFoto` (relleno, sin optimizar, `sizes`, `className`, `alt`), con y sin prioridad
- **THEN** los dos `<img>` llevan los mismos atributos y valores, la no prioritaria con `loading="lazy"`, la prioritaria con `fetchpriority="high"`, y ninguno apunta a `/_next/image`

#### Scenario: las pruebas de render no se enteran

- **WHEN** se corren los 41 archivos de pruebas que renderizan con `react-dom/server`
- **THEN** todos pasan sin que se haya modificado, quitado ni saltado ninguna aserción

### Requirement: La suite completa sigue en verde y puede probar Astro

`npm test` DEBE seguir corriendo toda la suite actual contra PostgreSQL, con el mismo número de archivos y sin aserciones modificadas, quitadas ni saltadas; solo se admiten pruebas nuevas. La configuración de pruebas DEBE además permitir renderizar archivos `.astro`, para que las fases siguientes prueben sus páginas.

#### Scenario: la misma suite, en verde

- **WHEN** se corre `npm test` en la rama contra la base local o la del CI
- **THEN** pasan todos los archivos que pasaban antes del change, y el diff de `tests/` solo agrega archivos o casos

#### Scenario: las pruebas pueden pintar Astro

- **WHEN** una prueba de Vitest renderiza un archivo `.astro`
- **THEN** obtiene su HTML sin levantar un servidor

### Requirement: El lint no depende de Next y no pierde dureza

`npm run lint` DEBE pasar sin errores sobre todo el código del repositorio (incluidos `src/app/`, `tests/` y los `.astro`) sin usar `eslint-config-next`. DEBE seguir aplicando las reglas que hoy aplica fuera de las propias de Next: las de TypeScript, las de React, las de hooks y las de accesibilidad.

#### Scenario: sin la configuración de Next

- **WHEN** se revisa la configuración de ESLint
- **THEN** no importa `eslint-config-next` ni declara reglas `@next/next/*`

#### Scenario: un hook mal usado reprueba

- **WHEN** alguien llama un hook de React dentro de una condición en un componente
- **THEN** `npm run lint` falla señalando la regla de hooks

#### Scenario: una imagen sin texto alternativo reprueba

- **WHEN** alguien agrega un `<img>` sin `alt` en un componente
- **THEN** `npm run lint` lo señala

### Requirement: El CI prueba el nuevo marco con la misma exigencia

Cada Pull Request DEBE correr en el CI, en este orden: lint, revisión de tipos, el build de Astro sin base accesible, las migraciones y el seed sobre el PostgreSQL efímero, y la suite completa. Cualquiera de esos pasos en rojo DEBE reprobar el PR. La revisión de tipos DEBE cubrir `.astro`, `.ts` y `.tsx` de `src/`, incluido `src/app/` mientras exista, porque el build de Astro ya no revisa los tipos como lo hacía el de Next.

#### Scenario: PR a la rama de la migración

- **WHEN** se abre un PR hacia `migracion-astro`
- **THEN** el CI corre lint, tipos, `astro build` sin base, migraciones, seed y `npm test`, y el PR solo queda en verde si todos pasan

#### Scenario: un error de tipos reprueba

- **WHEN** un PR introduce un error de tipos en un archivo de `src/`
- **THEN** el CI falla en el paso de tipos aunque el build y las pruebas pasen

### Requirement: El andamio no cambia nada que vea el vecino ni el admin

Este cambio NO DEBE agregar, quitar ni alterar ninguna ruta, texto de UI, cabecera, consulta a la base ni spec consolidada. Los únicos cambios en `src/components/` DEBEN ser la línea de importación de `Link`/`Imagen`; `src/lib/` y `src/app/` NO DEBEN modificarse. Nada de este cambio llega a `main` antes del corte.

#### Scenario: el diff no toca producto

- **WHEN** se revisa el diff del change
- **THEN** no hay cambios en `src/lib/`, `src/app/`, `openspec/specs/`, `vercel.json` ni `prisma/`, y en `src/components/` solo cambian líneas de `import`, salvo los archivos nuevos de la capa de compatibilidad

#### Scenario: producción no se entera

- **WHEN** se integra el change
- **THEN** su PR apunta a `migracion-astro`, no a `main`, y el sitio de producción sigue sirviendo la versión de Next
