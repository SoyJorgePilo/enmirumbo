# ADR-005 · Analítica cookieless

**Fecha:** 2026-08-31 · **Estado:** propuesta — se decide al ejecutar E7

## Contexto y problema

El PRD (§9-10, v0.8) exige analítica desde el día 1 con eventos definidos (formulario iniciado/enviado, vista de ficha, clics a WhatsApp/llamar/cómo llegar), exclusión de bots, y sin banner de cookies. Las métricas del §10 — los umbrales que deciden el destino del MVP — dependen de que esto mida bien.

## Drivers de la decisión

1. Sin cookies de rastreo → sin banner de consentimiento (fricción cero, coherente con el principio rector y con LFPDPPP)
2. Eventos personalizados con propiedades (categoría, colonia de la ficha) para la "señal de foco" del PRD §10
3. Filtrado de bots/crawlers confiable — el tráfico SEO es parte del plan y no debe inflar las vistas
4. Peso del script: la meta <2s en 4G no tolera un tag manager
5. Costo ~$0 en la fase de validación

## Opciones consideradas

### Plausible
Cookieless por diseño, script <1KB, eventos con propiedades, filtrado de bots decente, UI simple que hasta sirve para el devlog público. Contras: de pago (~$9/mes) tras el trial; self-host posible pero añade operación.

### Umami (self-host o cloud)
Open source, cookieless, gratuito self-hosteado y con plan cloud gratuito (hobby). Contras: el self-host contradice la operabilidad de una persona; el plan gratuito cloud tiene límites de eventos que hay que verificar contra las 300 visitas/semana + eventos.

### Google Analytics 4
Gratuito e ilimitado. **Por qué no:** requiere banner de consentimiento (fricción directa contra el principio rector), su modelo de eventos es desproporcionado para 5 eventos, el script pesa contra la meta de 4G, y enviar datos de comportamiento de vecinos a Google es exactamente la conversación LFPDPPP que no queremos tener. Descartado no por capacidad sino por costo de fricción y confianza.

### Sin proveedor: eventos propios en la DB
Contar vistas y clics en nuestra propia tabla. Pros: control total, cero terceros. Contras: reinventar deduplicación, bots y visitantes únicos — semanas de trabajo para medir peor; los visitantes únicos sin cookies son genuinamente difíciles de hacer bien.

## Recomendación (pendiente de confirmar en E7)

**Umami Cloud (plan gratuito) primero; migrar a Plausible si los límites aprietan.** Ambos cumplen los 5 drivers; Umami gana en costo cero y la migración entre ellos es barata porque nuestros 6 eventos son un contrato chico. Complemento: los contadores que el producto necesita mostrar (nada en el MVP) o auditar con precisión legal vivirían en la DB propia — la analítica es para decidir, no es registro contable.

## Consecuencias (si se confirma)

- Positivas: sin banner, sin fricción, métricas del §10 medibles desde el primer deploy.
- Negativas: dependencia de un tercero para la memoria histórica de métricas; los visitantes únicos cookieless son estimados (salted hash diario) — suficiente para umbrales, no para precisión científica.

## Cuándo revisarla

Al ejecutar E7 (verificar límites del plan gratuito con números reales) y si el MVP valida y llega la fase de monetización, donde la analítica de leads (PRD §12) pedirá eventos más ricos.
