"use server";

/**
 * TP5-47: envoltorios de Server Actions para los formularios de clientes.
 * Solo adaptan la sesión y el resultado; la validación, los permisos y la
 * transacción siguen viviendo en `src/services/clientes.ts`.
 */
import { runAction } from "@/lib/action-result";
import { requireSession } from "@/lib/api";
import { createCliente, updateCliente } from "@/services/clientes";

export async function crearClienteAccion(input: unknown) {
  return runAction(async () => {
    const actor = await requireSession();
    return createCliente(input, actor);
  });
}

export async function actualizarClienteAccion(id: number, input: unknown) {
  return runAction(async () => {
    const actor = await requireSession();
    return updateCliente(id, input, actor);
  });
}
