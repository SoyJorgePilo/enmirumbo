# Visión Fase 2 — EnMiRumbo después del MVP

> Borrador de trabajo (2026-09-04), escrito con Fable a partir de la conversación con el fundador.
> **No es el PRD**: nada de esto frena el lanzamiento. Cuando una pieza madure, se convertirá
> en enmienda al PRD y de ahí en tickets, por el proceso de siempre.

## La tesis

Directorios hay miles y todos hacen lo mismo: esperar a que alguien busque. La ventaja
real de EnMiRumbo no es el listado — es la **confianza** (cada negocio verificado por un
humano) y la **inmediatez** (todo pasa por WhatsApp). La fase 2 explota esas dos ventajas,
no las diluye.

## 1. El diferenciador: el pedido (dejar de ser directorio, ser el que consigue)

Hoy el vecino de Tizayuca publica en grupos de Facebook *"¿alguien conoce un plomero que
venga hoy por mi colonia?"* y recibe decenas de comentarios revueltos sin saber quién es
de fiar.

**El pedido invierte el flujo**: el vecino escribe qué necesita, cuándo y en qué colonia.
EnMiRumbo se lo hace llegar solo a los negocios verificados de esa categoría/zona, y los
interesados le responden por WhatsApp. Tres respuestas de gente verificada > cuarenta
comentarios de Facebook.

- Es la vieja marca convertida en feature: "necesito uno" vive dentro de EnMiRumbo.
- Nadie lo ofrece en ciudades chicas de México con verificación humana de por medio.
- Es la base del modelo de negocio de mediano plazo (ver §2.3).

**Cuidado LFPDPPP que hay que diseñar bien**: un pedido implica compartir datos del
vecino (necesidad, colonia, contacto) con terceros (los negocios). Opciones a evaluar en
su spec: que el vecino sea siempre quien inicia el WhatsApp (el negocio recibe el pedido
anónimo y un botón "me interesa" que le muestra su interés al vecino, no su teléfono), o
consentimiento explícito por pedido. El aviso de privacidad necesitará una sección nueva.

## 2. Monetización: escalera, no cobro de entrada

**Reglas de oro**: al vecino nunca se le cobra; registrarse y tener ficha siempre será
gratis. La confianza es el foso — la publicidad se etiqueta con honestidad.

1. **"Tu ficha en números" (gratis, el sembrador)** — WhatsApp mensual automático a cada
   negocio: *"Tu ficha apareció 47 veces este mes y 12 personas te escribieron."* Los
   datos ya existen (Umami + eventos). Demuestra valor antes de pedir un peso.
2. **Destacados** — 2-3 lugares por categoría marcados "Destacado" (etiquetado visible),
   ~$99–149 MXN/mes, con techo duro para no degradar el listado orgánico. Arranca cuando
   haya ~50 negocios publicados.
3. **Pedidos con prioridad / por lead** — cuando el sistema de pedidos tenga volumen:
   prioridad de aviso para destacados, o pago por lead respondido. El negocio de verdad
   a mediano plazo.

**Operativo**: monetizar obliga a salir del plan Hobby de Vercel (ADR-007) → Pro, ~$20
USD/mes; se paga con un solo destacado. Cobros: probablemente transferencia/efectivo al
inicio (así opera Tizayuca), pasarela después.

## 3. Experiencia

### Para el que se registra
- **El kit al aprobarse** (el "wow" más barato): junto al mensaje de aprobación, un póster
  con QR de su ficha listo para imprimir y una tarjeta digital para su estado de WhatsApp.
  El negocio gana algo tangible al instante; cada póster pegado es publicidad de
  EnMiRumbo. (Generación server-side con sharp, que ya está en el stack.)
- Edición por enlace de gestión — ya viene en el MVP (T-014).
- "Tu ficha en números" (§2.1) también es experiencia: sentirse visto.

### Para el que busca
- **"Abierto ahora"**: chip verde + filtro derivado del horario guiado que ya se captura.
- **Filtro "a domicilio"**: el dato ya existe en la ficha.
- Más adelante: fotos múltiples, catálogo simple por ficha (precios de palabra, como se
  manejan aquí).

## 4. Orden propuesto (después del lanzamiento)

| Cuándo | Qué | Por qué primero |
|---|---|---|
| Semanas 1–2 | Kit QR + tarjeta | Alimenta la siembra puerta a puerta |
| Mes 2 | Tu ficha en números | Retención + siembra de monetización |
| Mes 2–3 | Abierto ahora + filtro a domicilio | Mejoras visibles para el vecino |
| Trimestre | **Pedidos** (el gran feature) | Necesita masa de negocios verificados |
| ~50 negocios | Destacados | Monetización sin degradar confianza |

## 5. Qué NO entra (ni en fase 2)

Cuentas de usuario para vecinos, reseñas con estrellas (veneno en ciudades chicas: se
vuelven arma entre competidores; la verificación humana es nuestro sustituto), pedidos a
comisión sobre venta, y venta de datos (nunca, LFPDPPP y punto).

## 6. Métricas que dirán si funciona

- Pedidos: % de pedidos con ≥1 respuesta en <2h; repetición de vecinos.
- Kit: % de negocios que comparten su tarjeta/póster (trackeable por UTM del QR).
- Ficha en números: % de negocios que responden al mensaje mensual.
- Destacados: churn mensual; quejas de vecinos por publicidad (debe ser ~0).
