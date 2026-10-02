/**
 * Middleware único del spike (ADR-013 clave 4):
 *
 * 1. Sesión: la ruta protegida exige una cookie firmada válida; si no, 307 a
 *    la página de acceso, sin renderizar nada protegido.
 * 2. Formularios sin JS (POST/Redirect/GET): toda Action llamada desde un
 *    `<form method="POST">` se resuelve aquí y SIEMPRE termina en un 303 a
 *    una ruta fija. No se usa el `Referer` para volver —como en el ejemplo
 *    de la doc de Astro— porque con `Referrer-Policy: strict-origin` el
 *    navegador solo manda el origen, y la vuelta caería en la portada.
 * 3. Cabeceras de seguridad en toda respuesta por petición, incluidas las
 *    redirecciones, el 307 y el 404.
 */
import { getActionContext } from "astro:actions";
import { getSecret } from "astro:env/server";
import { defineMiddleware } from "astro:middleware";

import { aplicarCabeceras } from "./lib/cabeceras";
import { COOKIE_AVISO_REPORTE } from "./lib/reporte";
import { esSesionValida, NOMBRE_COOKIE, secretoDeSesion, VARIABLE_SECRETO } from "./lib/sesion";

const RUTA_PROTEGIDA = "/protegida";
const COOKIE_AVISO_ACCESO = "spike_aviso_acceso";
const OPCIONES_AVISO = { httpOnly: true, sameSite: "lax", secure: true, maxAge: 60 } as const;

export const onRequest = defineMiddleware(async (context, next) => {
  if (context.isPrerendered) return next();
  const ruta = context.url.pathname;

  if (ruta === RUTA_PROTEGIDA || ruta.startsWith(`${RUTA_PROTEGIDA}/`)) {
    const secreto = secretoDeSesion(getSecret(VARIABLE_SECRETO));
    const valor = context.cookies.get(NOMBRE_COOKIE)?.value;
    if (secreto === null || !esSesionValida(valor, secreto)) {
      return aplicarCabeceras(context.redirect("/acceso", 307), ruta);
    }
  }

  const { action } = getActionContext(context);
  if (action?.calledFrom === "form") {
    const resultado = await action.handler();
    let destino: string;
    if (action.name === "reportar") {
      if (resultado.error) {
        context.cookies.set(COOKIE_AVISO_REPORTE, resultado.error.message, {
          ...OPCIONES_AVISO,
          path: "/reportar",
        });
        destino = "/reportar";
      } else {
        destino = "/reportar/gracias";
      }
    } else if (action.name === "entrar") {
      if (resultado.error) {
        context.cookies.set(COOKIE_AVISO_ACCESO, "sin-secreto", { ...OPCIONES_AVISO, path: "/acceso" });
        destino = "/acceso";
      } else {
        destino = RUTA_PROTEGIDA;
      }
    } else {
      destino = "/";
    }
    return aplicarCabeceras(context.redirect(destino, 303), ruta);
  }

  return aplicarCabeceras(await next(), ruta);
});
