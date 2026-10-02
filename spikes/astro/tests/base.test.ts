import { describe, expect, it } from "vitest";

import { revisarConexion } from "../src/lib/base";

const existe = () => true;
const noExiste = () => false;
const REMOTA = "postgresql://usuario:clave@db.ejemplo.test:5432/postgres";

describe("conexión a la base del spike: TLS verificado o nada", () => {
  it("sin URL falla a la vista", () => {
    expect(revisarConexion(undefined, existe)).toEqual({ ok: false, motivo: "sin-url" });
    expect(revisarConexion("  ", existe)).toEqual({ ok: false, motivo: "sin-url" });
  });

  it("una base remota sin verify-full no se abre", () => {
    expect(revisarConexion(REMOTA, existe)).toEqual({ ok: false, motivo: "sin-verificacion" });
    expect(revisarConexion(`${REMOTA}?sslmode=require`, existe)).toEqual({
      ok: false,
      motivo: "sin-verificacion",
    });
  });

  it("verify-full sin certificado (o con uno que no viajó) no se abre", () => {
    expect(revisarConexion(`${REMOTA}?sslmode=verify-full`, existe)).toEqual({
      ok: false,
      motivo: "sin-certificado",
    });
    expect(
      revisarConexion(`${REMOTA}?sslmode=verify-full&sslrootcert=certs/supabase-root-2021-ca.crt`, noExiste),
    ).toEqual({ ok: false, motivo: "sin-certificado" });
  });

  it("verify-full con el certificado presente sí se abre", () => {
    expect(
      revisarConexion(`${REMOTA}?sslmode=verify-full&sslrootcert=certs/supabase-root-2021-ca.crt`, existe),
    ).toEqual({ ok: true });
  });

  it("un ?host= o ?hostaddr= que cambie el destino real no se acepta", () => {
    const url = "postgresql://u:c@localhost:5432/x?host=db.ejemplo.test";
    expect(revisarConexion(url, existe)).toEqual({ ok: false, motivo: "no-interpretable" });
    expect(revisarConexion(`${REMOTA}?sslmode=verify-full&sslrootcert=a.crt&hostaddr=1.2.3.4`, existe)).toEqual({
      ok: false,
      motivo: "no-interpretable",
    });
  });

  it("contra una base de esta máquina no se exige TLS (misma regla que la app)", () => {
    expect(revisarConexion("postgresql://postgres:postgres@localhost:51214/template1?sslmode=disable", noExiste)).toEqual({
      ok: true,
    });
  });
});
