"use server";

/** TP5-47: actions de categorías; delegan en el servicio (RF-P7). */
import { runAction } from "@/lib/action-result";
import { requireSession } from "@/lib/api";
import { createCategoria, updateCategoria } from "@/services/categorias";

export async function crearCategoriaAccion(input: unknown) {
  return runAction(async () => {
    const actor = await requireSession();
    return createCategoria(input, actor);
  });
}

export async function actualizarCategoriaAccion(id: number, input: unknown) {
  return runAction(async () => {
    const actor = await requireSession();
    return updateCategoria(id, input, actor);
  });
}
