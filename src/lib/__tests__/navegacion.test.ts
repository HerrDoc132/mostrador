import { describe, expect, it } from "vitest";
import { esModuloActivo, modulosVisibles } from "@/lib/navegacion";

/**
 * TP5-43: el panel lateral debe resaltar el módulo activo también en rutas
 * anidadas (detalle de producto, nueva venta, cuenta corriente, etc.).
 */
describe("esModuloActivo (TP5-43, requerimientos.md:171)", () => {
  it("marca Inicio solamente en la raíz", () => {
    expect(esModuloActivo("/", "/")).toBe(true);
    expect(esModuloActivo("/productos", "/")).toBe(false);
    expect(esModuloActivo("/ventas/nueva", "/")).toBe(false);
  });

  it("marca el módulo en rutas hijas", () => {
    expect(esModuloActivo("/productos/12", "/productos")).toBe(true);
    expect(esModuloActivo("/ventas/nueva", "/ventas")).toBe(true);
    expect(esModuloActivo("/ventas/9", "/ventas")).toBe(true);
    expect(esModuloActivo("/clientes/7/cuenta", "/clientes")).toBe(true);
  });

  it("no marca módulos distintos aunque compartan prefijo de texto", () => {
    expect(esModuloActivo("/movimientos-stock", "/productos")).toBe(false);
    expect(esModuloActivo("/deudores", "/clientes")).toBe(false);
    expect(esModuloActivo("/usuarios/3", "/ventas")).toBe(false);
  });

  it("acepta rutas con barra final", () => {
    expect(esModuloActivo("/clientes/", "/clientes")).toBe(true);
    expect(esModuloActivo("/ventas/nueva/", "/ventas")).toBe(true);
  });

  it("oculta Usuarios al vendedor y lo muestra al admin (TP5-43)", () => {
    expect(modulosVisibles("vendedor").map((modulo) => modulo.href)).not.toContain("/usuarios");
    expect(modulosVisibles("admin").map((modulo) => modulo.href)).toContain("/usuarios");
    expect(modulosVisibles("vendedor").map((modulo) => modulo.etiqueta)).toContain("Ventas");
  });
});
