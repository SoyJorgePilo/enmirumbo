# ADR-012 · Aligerar el harness (proceso v0.6)

**Fecha:** 2026-10-01 · **Estado:** aceptada · Aplica la regla de `docs/proceso.md` §Medición: el harness tampoco crece ni pesa sin evidencia.

## Contexto

Tras 28 corridas registradas, el costo del pipeline lo dominan los textos que cada etapa debe leer de la anterior (reportes archivados de hasta 64 KB; 1.28 MB en total) y una bitácora de métricas con celdas de ensayo. Las compuertas en sí (etapa C, validador, CI, puntos humanos) siguen justificadas por ADR-009 y por los altos hallados desde entonces.

## Decisión

1. Reportes de etapa y del validador: tope ~150 líneas, hallazgos como `archivo:línea` + una frase.
2. Etapa C condicional: solo si el change cruza una frontera de confianza (entrada pública, escritura admin, tokens, archivos, datos personales, infra).
3. `/rapido` de solo docs/comentarios/config sin comportamiento: sin validador; CI + humano.
4. Filas de métricas de una línea; narrativa en `d-validacion.md`.
5. Errata: los 6 agentes seguían diciendo "NecesitoUno" (T-019).

## Alternativas descartadas

- Quitar o fusionar la etapa C o la A: los datos de ADR-009 las sostienen.
- Cambiar modelos por agente: rompe la comparabilidad (ADR-008).
- Dejar de correr gates en dev/C: se evalúa después de ver el efecto de 1 y 2.

## Cuándo revisarla

Si una etapa C saltada es seguida de un hallazgo de seguridad post-merge, se endurece el criterio de "frontera de confianza". Revisar tras ~5 corridas con v0.6.
