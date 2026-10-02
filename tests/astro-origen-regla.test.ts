/**
 * La regla de origen, función pura (change `migrar-formularios-publicos-astro`,
 * design.md §1; tasks.md #8). Es la que aplica Next a las Server Actions
 * (`next/dist/server/app-render/action-handler.js`, `parseHostHeader`): el
 * host del `Origin` contra el PRIMER valor de `X-Forwarded-Host` o, si no
 * viene, contra `Host`; sin lista de orígenes permitidos; sin `Origin`,
 * procede. Todo ficticio (`.example`).
 */
import { describe, expect, it } from "vitest";

import { envioDeOtroOrigen } from "../src/astro/origen";

type Caso = [descripcion: string, metodo: string, cabeceras: Record<string, string>, rechazado: boolean];

const CASOS: Caso[] = [
  // Métodos seguros: nunca se revisan.
  ["GET con Origin ajeno", "GET", { origin: "https://ajeno.example", host: "enmirumbo.example" }, false],
  ["HEAD con Origin null", "HEAD", { origin: "null", host: "enmirumbo.example" }, false],
  ["OPTIONS con Origin malformado", "OPTIONS", { origin: "::::", host: "enmirumbo.example" }, false],
  // Los cinco casos de la tabla de design.md §1.
  ["POST sin Origin", "POST", { host: "enmirumbo.example" }, false],
  ["POST con Origin null", "POST", { origin: "null", host: "enmirumbo.example" }, true],
  ["POST con Origin malformado", "POST", { origin: "no es una url", host: "enmirumbo.example" }, true],
  ["POST con Origin vacío", "POST", { origin: "", host: "enmirumbo.example" }, true],
  ["POST con Origin ajeno", "POST", { origin: "https://ajeno.example", host: "enmirumbo.example" }, true],
  ["POST con el mismo host", "POST", { origin: "https://enmirumbo.example", host: "enmirumbo.example" }, false],
  // Solo el host: el esquema no se compara (igual que Next).
  ["POST con otro esquema y el mismo host", "POST", { origin: "http://enmirumbo.example", host: "enmirumbo.example" }, false],
  // X-Forwarded-Host: manda su primer valor, aunque Host diga otra cosa.
  [
    "X-Forwarded-Host con lista: se compara el primero",
    "POST",
    { origin: "https://enmirumbo.example", host: "interno.vercel", "x-forwarded-host": "enmirumbo.example, otro.example" },
    false,
  ],
  [
    "X-Forwarded-Host distinto, aunque Host coincida",
    "POST",
    { origin: "https://enmirumbo.example", host: "enmirumbo.example", "x-forwarded-host": "otro.example" },
    true,
  ],
  [
    "el segundo valor de X-Forwarded-Host no cuenta",
    "POST",
    { origin: "https://otro.example", host: "interno.vercel", "x-forwarded-host": "enmirumbo.example, otro.example" },
    true,
  ],
  // Puerto e IPv6: el host del Origin incluye el puerto, como `Host`.
  ["puerto igual", "POST", { origin: "http://localhost:4321", host: "localhost:4321" }, false],
  ["puerto distinto", "POST", { origin: "http://localhost:4321", host: "localhost:4322" }, true],
  ["IPv6 con puerto", "POST", { origin: "http://[::1]:4321", host: "[::1]:4321" }, false],
  ["IPv6 distinto", "POST", { origin: "http://[::1]:4321", host: "[::2]:4321" }, true],
  // Sin nada contra qué comparar: rechazo, como Next.
  ["sin Host ni X-Forwarded-Host", "POST", { origin: "https://enmirumbo.example" }, true],
  // Otros métodos con cuerpo: la misma regla (alcance de Astro, design.md §1).
  ["PUT ajeno", "PUT", { origin: "https://ajeno.example", host: "enmirumbo.example" }, true],
  ["DELETE propio", "DELETE", { origin: "https://enmirumbo.example", host: "enmirumbo.example" }, false],
  ["PATCH null", "PATCH", { origin: "null", host: "enmirumbo.example" }, true],
];

describe("regla de origen (design.md §1)", () => {
  it.each(CASOS)("%s", (_descripcion, metodo, cabeceras, rechazado) => {
    expect(envioDeOtroOrigen(metodo, new Headers(cabeceras))).toBe(rechazado);
  });

  it("no hay lista de orígenes permitidos: el código no la declara", async () => {
    const { readFileSync } = await import("node:fs");
    const fuente = readFileSync(new URL("../src/astro/origen.ts", import.meta.url), "utf8");
    expect(fuente).not.toMatch(/allowedOrigins|ORIGENES_PERMITIDOS/);
  });
});
