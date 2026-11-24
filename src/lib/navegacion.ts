/**
 * Configuración del panel lateral (RF-U2, requerimientos.md:60,72,171-172).
 * La lógica de "módulo activo" vive acá para que la navbar y sus tests
 * compartan la misma regla.
 */

export type RolNav = "admin" | "vendedor";

export type EnlaceModulo = {
  readonly href: string;
  readonly etiqueta: string;
};

/** Módulos principales del panel lateral, en el orden de la spec. */
export const MODULOS_NAV: readonly EnlaceModulo[] = [
  { href: "/", etiqueta: "Inicio" },
  { href: "/productos", etiqueta: "Productos" },
  { href: "/clientes", etiqueta: "Clientes" },
  { href: "/ventas", etiqueta: "Ventas" },
  { href: "/usuarios", etiqueta: "Usuarios" },
] as const;

/** Enlaces secundarios agrupados dentro de los módulos. */
export const SUBENLACES_NAV: readonly EnlaceModulo[] = [
  { href: "/ventas/nueva", etiqueta: "Nueva venta" },
  { href: "/movimientos-stock", etiqueta: "Movimientos" },
  { href: "/deudores", etiqueta: "Deudores" },
  { href: "/perfil", etiqueta: "Mi perfil" },
] as const;

function normalizar(pathname: string): string {
  const sinBarraFinal = pathname.replace(/\/$/, "");
  return sinBarraFinal === "" ? "/" : sinBarraFinal;
}

/** RF-U2: el mantenimiento de usuarios es exclusivo del administrador. */
export function modulosVisibles(rol: RolNav): readonly EnlaceModulo[] {
  return MODULOS_NAV.filter((modulo) => rol === "admin" || modulo.href !== "/usuarios");
}

/** RF: módulo activo resaltado; la raíz solo coincide con la raíz. */
export function esModuloActivo(pathname: string, href: string): boolean {
  const ruta = normalizar(pathname);
  const destino = normalizar(href);
  if (destino === "/") return ruta === "/";
  return ruta === destino || ruta.startsWith(`${destino}/`);
}
