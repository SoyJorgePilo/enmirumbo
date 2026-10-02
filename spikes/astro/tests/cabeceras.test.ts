import { describe, expect, it } from "vitest";

import {
  cabecerasDeSeguridad,
  politicaDeSeguridadDeContenido,
} from "../../../src/lib/seguridad/csp";
import { aplicarCabeceras, cabecerasPara, RUTA_FORMULARIO } from "../src/lib/cabeceras";

const deProduccion = Object.fromEntries(cabecerasDeSeguridad().map(({ key, value }) => [key, value]));

describe("cabeceras del spike (spec spike-astro: mismas cabeceras que producción)", () => {
  it("una ruta cualquiera lleva exactamente las cuatro de cabecerasDeSeguridad()", () => {
    expect(cabecerasPara("/")).toEqual(deProduccion);
    expect(cabecerasPara("/no-existe")).toEqual(deProduccion);
    expect(cabecerasPara("/protegida")).toEqual(deProduccion);
  });

  it("la página del formulario cambia SOLO Referrer-Policy a strict-origin", () => {
    expect(RUTA_FORMULARIO).toBe("/reportar");
    expect(cabecerasPara("/reportar")).toEqual({ ...deProduccion, "Referrer-Policy": "strict-origin" });
    // Con o sin diagonal final es la misma página.
    expect(cabecerasPara("/reportar/")["Referrer-Policy"]).toBe("strict-origin");
    // La confirmación ya no es la página del formulario.
    expect(cabecerasPara("/reportar/gracias")).toEqual(deProduccion);
  });

  it("la CSP es la de producción y no lleva nonce", () => {
    const csp = cabecerasPara("/")["Content-Security-Policy"];
    expect(csp).toBe(politicaDeSeguridadDeContenido());
    expect(csp).not.toContain("nonce-");
  });

  it("aplica las cabeceras también a una redirección con cabeceras inmutables", () => {
    const original = Response.redirect("https://ejemplo.test/reportar/gracias", 303);
    const respuesta = aplicarCabeceras(original, "/reportar");
    expect(respuesta.status).toBe(303);
    expect(respuesta.headers.get("Location")).toBe("https://ejemplo.test/reportar/gracias");
    expect(respuesta.headers.get("Referrer-Policy")).toBe("strict-origin");
    expect(respuesta.headers.get("X-Frame-Options")).toBe("DENY");
  });
});
