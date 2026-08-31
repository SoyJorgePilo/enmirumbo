# ADR-007 · Hosting y deploy

**Fecha:** 2026-08-31 · **Estado:** propuesta — se decide al ejecutar E0-3

## Contexto y problema

El sitio debe desplegarse en continuo desde `main` (el pipeline multiagente termina en PRs mergeados), servir páginas SSR/ISR rápido hacia México, y regenerar fichas cuando el admin aprueba cambios. Presupuesto de validación: ~$0.

## Drivers de la decisión

1. Rendimiento hacia usuarios en México en 4G (edge/CDN cercano)
2. Deploy automático por merge a main + preview deploys por PR (encaja con el flujo de PRs del pipeline)
3. Soporte de primera clase de Next.js App Router (ISR, `next/image`, server actions) sin configuración artesanal
4. Costo $0 en validación, y una salida clara si el precio escala después
5. Operabilidad de una persona: cero servidores que administrar

## Opciones consideradas

### Vercel
Soporte nativo de Next.js (es su creador): ISR, imágenes y server actions funcionan sin fricción; previews por PR gratis; CDN con presencia en México (QRO). Contras: los precios post-hobby escalan fuerte; el plan Hobby prohíbe uso comercial — el MVP no monetiza (PRD §4), pero al monetizar (PRD §12) habría que pagar Pro o migrar; cierto lock-in en features propietarias si no se disciplina el uso.

### Netlify / Cloudflare Pages (+ Workers)
Cloudflare tiene la mejor red y precios de egress; con OpenNext el soporte de Next.js mejoró mucho. Contras: Next.js sigue siendo ciudadano de segunda (breaking changes de App Router llegan con retraso a los adaptadores — riesgo directo con nuestra versión nueva de Next), y depurar incompatibilidades de adaptador es el tipo de yak-shaving que una persona sola no debe pagar en un MVP.

### Railway / Fly.io / Render (contenedor)
Next.js en un contenedor: sin sorpresas de adaptador y precios previsibles. Contras: pierde ISR/optimización de imagen "gratis" (hay que configurar cache), los planes gratuitos duermen la instancia (contra <2s), y suma mantenimiento de imagen Docker.

### VPS propio
Descartado por el driver 5 — administrar servidores no es el aprendizaje que este proyecto persigue, y el costo de un error de seguridad con datos personales lo paga la confianza del directorio.

## Recomendación (pendiente de confirmar en E0-3)

**Vercel Hobby durante la validación**, con dos disciplinas para mantener la salida barata: (a) nada de features exclusivas de Vercel fuera de lo que Next.js estándar ofrece — si mañana hay que irse a un contenedor, que sea un `Dockerfile` y no una reescritura; (b) la decisión se re-evalúa ANTES de monetizar (los términos del plan Hobby lo exigen), con Cloudflare+OpenNext y Railway como candidatos según el estado de sus adaptadores en ese momento.

## Consecuencias (si se confirma)

- Positivas: deploy y previews por PR el mismo día; ISR resuelve "regenerar la ficha al aprobar" sin código de infraestructura.
- Negativas: fecha de caducidad conocida (monetización → plan de pago o migración); métricas de rendimiento dependen del edge de un tercero.

## Cuándo revisarla

En E0-3 con una prueba de rendimiento real desde México; y obligatoriamente al activar cualquier vía de ingreso (PRD §12).
