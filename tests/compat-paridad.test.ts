/**
 * Spec `plataforma-astro` (change `agregar-andamio-astro`, T-022),
 * requirement "Los componentes no dependen de Next para enlaces e imágenes":
 * la capa propia (`src/components/compat/`) pinta en servidor el MISMO HTML
 * que `next/link` y `next/image` con las props que hoy se usan.
 *
 * Mientras `next` siga instalado, la referencia es el propio Next. En T-027,
 * al retirarlo, estas comparaciones se congelan con el HTML literal esperado
 * (proposal.md, "Fuera de este change").
 */
import { createElement as h, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import NextImage from "next/image";
import NextLink from "next/link";
import { describe, expect, it } from "vitest";

import { Imagen } from "@/components/compat/imagen";
import { Link } from "@/components/compat/link";

const pintar = (nodo: ReactNode) => renderToStaticMarkup(nodo);

describe("compat · Link pinta lo mismo que next/link", () => {
  // Scenario: el enlace se pinta igual (el wordmark del header).
  it('header: "EnMiRumbo" hacia /', () => {
    const props = { href: "/", className: "inline-flex min-h-11 items-center py-2" };
    const hijos = h("span", { className: "text-xl font-bold tracking-tight text-tinta" }, "EnMiRumbo");
    const propio = pintar(h(Link, props, hijos));
    expect(propio).toBe(pintar(h(NextLink, props, hijos)));
    expect(propio).toContain('href="/"');
  });

  it("tarjeta: el nombre del negocio hacia su ficha", () => {
    const props = { href: "/negocio/taller-ficticio-abc123", className: "after:absolute after:inset-0" };
    expect(pintar(h(Link, props, "Taller Ficticio"))).toBe(
      pintar(h(NextLink, props, "Taller Ficticio")),
    );
  });

  it("filtros y paginación: aria-current y aria-label pasan tal cual", () => {
    const props = {
      href: "/admin/negocios?estado=publicado&pagina=2",
      className: "rounded-full px-3",
      "aria-current": "page" as const,
      "aria-label": "Página 2",
    };
    expect(pintar(h(Link, props, "2"))).toBe(pintar(h(NextLink, props, "2")));
  });
});

describe("compat · Imagen pinta lo mismo que next/image (props de MarcadorFoto)", () => {
  const propsMarcador = (prioridad: boolean) => ({
    src: "/api/foto/0123456789abcdef0123456789abcdef/tarjeta",
    alt: "Foto de Taller Ficticio",
    fill: true as const,
    priority: prioridad,
    unoptimized: true as const,
    sizes: "(min-width: 640px) 33vw, 100vw",
    className: "object-cover ",
  });

  // Scenario: la foto se pinta igual — sin prioridad.
  it("sin prioridad: mismo HTML y carga diferida", () => {
    const propio = pintar(h(Imagen, propsMarcador(false)));
    expect(propio).toBe(pintar(h(NextImage, propsMarcador(false))));
    expect(propio).toContain('loading="lazy"');
    expect(propio).toContain("position:absolute");
    expect(propio).not.toContain("/_next/image");
  });

  // Scenario: la foto se pinta igual — con prioridad.
  it("con prioridad: mismo HTML y sin carga diferida", () => {
    const propio = pintar(h(Imagen, propsMarcador(true)));
    expect(propio).toBe(pintar(h(NextImage, propsMarcador(true))));
    expect(propio).not.toContain('loading="lazy"');
    expect(propio).not.toContain("/_next/image");
  });

  it("un className distinto (la ficha, el panel) también coincide", () => {
    const props = { ...propsMarcador(false), className: "object-cover rounded-xl" };
    expect(pintar(h(Imagen, props))).toBe(pintar(h(NextImage, props)));
  });
});
