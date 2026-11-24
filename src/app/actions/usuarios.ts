"use server";

/** TP5-47: actions de usuarios; delegan en el servicio (RF-U4, RF-U5). */
import { runAction } from "@/lib/action-result";
import { requireSession } from "@/lib/api";
import { createUsuario, resetPassword, updateUsuario } from "@/services/usuarios";

export async function crearUsuarioAccion(input: unknown) {
  return runAction(async () => {
    const actor = await requireSession();
    return createUsuario(input, actor);
  });
}

export async function actualizarUsuarioAccion(id: number, input: unknown) {
  return runAction(async () => {
    const actor = await requireSession();
    return updateUsuario(id, input, actor);
  });
}

export async function resetPasswordUsuarioAccion(id: number) {
  return runAction(async () => {
    const actor = await requireSession();
    return resetPassword(id, actor);
  });
}
