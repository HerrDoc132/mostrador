"use server";

/** TP5-47: actions de productos; delegan en el servicio (RF-P2, RF-P3). */
import { runAction } from "@/lib/action-result";
import { requireSession } from "@/lib/api";
import { createProducto, updateProducto } from "@/services/productos";

export async function crearProductoAccion(input: unknown) {
  return runAction(async () => {
    const actor = await requireSession();
    return createProducto(input, actor);
  });
}

export async function actualizarProductoAccion(id: number, input: unknown) {
  return runAction(async () => {
    const actor = await requireSession();
    return updateProducto(id, input, actor);
  });
}

/** Atajo para el botón de alta/baja; el servicio valida el cambio. */
export async function alternarActivoProductoAccion(id: number, activo: boolean) {
  return runAction(async () => {
    const actor = await requireSession();
    return updateProducto(id, { activo }, actor);
  });
}
