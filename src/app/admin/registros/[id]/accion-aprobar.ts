"use server";

/**
 * Server Action de "Aprobar y publicar" (spec `revision-admin`, requirement
 * "Aprobar asigna giros, normaliza la colonia, marca el origen y publica la
 * ficha").
 *
 * Primero la guarda de sesión (design.md §3: una Server Action es un endpoint
 * propio, no una parte de la página), luego la lectura del formulario y toda
 * la regla de negocio en `src/lib/admin/transiciones.ts`. Termina siempre en
 * un `redirect` (POST-Redirect-GET): recargar la pantalla de confirmación no
 * repite la transición.
 *
 * Los errores vuelven al detalle por la URL, con lo ya elegido, para que el
 * formulario conserve la selección sin ningún JavaScript de cliente.
 */
import { redirect } from "next/navigation";

import { RUTA_COLA_ADMIN, requerirSesionAdmin } from "@/lib/admin/guarda";
import { aprobarRegistro } from "@/lib/admin/transiciones";
import { ORIGEN_NEGOCIO_DEFAULT, type OrigenNegocio } from "@/lib/negocio";
import { obtenerPrisma } from "@/lib/prisma";

/**
 * Id de catálogo tal como llega del formulario, o `null` si no lo parece.
 *
 * La cota de magnitud no es cosmética (hallazgo MEDIO 1 de la etapa C): un id
 * de 20 cifras pasa el "solo dígitos", no cabe en el entero de 64 bits de la
 * columna y hace que Prisma lance dentro de la Server Action, o sea un 500 en
 * la pantalla principal del panel. Aquí, en el borde, cualquier cosa que no
 * sea un id de catálogo plausible se marca como inválida y sale por el camino
 * de error normal del formulario.
 */
function idDeCatalogo(valor: string): number | null {
  if (!/^\d{1,9}$/.test(valor)) return null;
  const id = Number(valor);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

/** Ids de giro del envío, sin repetir, más si alguno vino mal formado. */
function girosDelFormulario(valores: FormDataEntryValue[]): {
  ids: number[];
  hayInvalidos: boolean;
} {
  const crudos = valores
    .map((valor) => String(valor).trim())
    .filter((valor) => valor !== "");
  const ids = crudos.map(idDeCatalogo);
  return {
    ids: [...new Set(ids.filter((id): id is number => id !== null))],
    hayInvalidos: ids.some((id) => id === null),
  };
}

export async function aprobarRegistroAccion(
  id: string,
  formData: FormData,
): Promise<void> {
  await requerirSesionAdmin();

  const giros = girosDelFormulario(formData.getAll("giro"));
  const coloniaCruda = String(formData.get("coloniaId") ?? "").trim();
  const coloniaId = coloniaCruda === "" ? null : idDeCatalogo(coloniaCruda);
  const origen: OrigenNegocio =
    formData.get("origen") === "siembra" ? "siembra" : ORIGEN_NEGOCIO_DEFAULT;

  const girosIds = giros.ids;

  // Un valor mal formado se responde como lo que es —un giro o una colonia que
  // no están en el catálogo— sin llegar a consultar la base.
  const invalido: "giros" | "colonia" | null = giros.hayInvalidos
    ? "giros"
    : coloniaCruda !== "" && coloniaId === null
      ? "colonia"
      : null;

  const resultado = invalido
    ? ({ resultado: "error", error: invalido } as const)
    : await aprobarRegistro(obtenerPrisma(), id, {
        girosIds,
        coloniaId,
        origen,
      });

  if (resultado.resultado === "aprobado") {
    redirect(`/admin/registros/${id}/aprobado`);
  }
  if (resultado.resultado === "ya-resuelto") {
    redirect(`/admin/registros/${id}/ya-resuelto`);
  }
  if (resultado.resultado === "no-encontrado") {
    redirect(RUTA_COLA_ADMIN);
  }

  // Error de validación: se vuelve al detalle conservando lo elegido. Solo
  // vuelve lo que se pudo interpretar: un valor mal formado no se le devuelve
  // al navegador tal cual.
  const parametros = new URLSearchParams();
  for (const giroId of girosIds) parametros.append("giro", String(giroId));
  if (coloniaId !== null) parametros.set("colonia", String(coloniaId));
  parametros.set("origen", origen);
  parametros.set("errorAprobar", resultado.error);

  redirect(`/admin/registros/${id}?${parametros.toString()}`);
}
