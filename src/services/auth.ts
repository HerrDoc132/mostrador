import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { db, type Database } from "@/db";
import { usuarios } from "@/db/schema";
import { ApiError } from "@/lib/errors";
import { validationError } from "@/lib/validation";

/**
 * Servicio de autenticación (RF-U1, RF-U2).
 * No conoce HTTP: recibe datos sin validar y devuelve datos públicos.
 */

export const loginSchema = z.object({
  email: z
    .string({ required_error: "El email es obligatorio." })
    .trim()
    .email("El email no es válido.")
    .transform((value) => value.toLowerCase()),
  password: z
    .string({ required_error: "La contraseña es obligatoria." })
    .min(1, "La contraseña es obligatoria."),
});

export interface PublicUser {
  id: number;
  nombre: string;
  email: string;
  rol: "admin" | "vendedor";
}

export interface SessionIdentity {
  userId: number;
}

export interface LoginResult {
  user: PublicUser;
  session: { userId: number; email: string; rol: "admin" | "vendedor" };
}

export type UserRow = typeof usuarios.$inferSelect;

export function toPublicUser(user: UserRow): PublicUser {
  return {
    id: user.id,
    nombre: user.nombre,
    email: user.email,
    rol: user.rol,
  };
}

/**
 * RF-U1: valida credenciales y devuelve el usuario público + identidad de sesión.
 * Email inexistente, contraseña incorrecta o usuario inactivo => mismo 401.
 */
export async function login(
  input: unknown,
  database: Database = db
): Promise<LoginResult> {
  const parsed = loginSchema.safeParse(input);
  if (!parsed.success) throw validationError(parsed.error);

  const { email, password } = parsed.data;

  const [user] = await database
    .select()
    .from(usuarios)
    .where(eq(usuarios.email, email))
    .limit(1);

  const passwordMatches = user
    ? await bcrypt.compare(password, user.passwordHash)
    : false;

  if (!user || !passwordMatches || !user.activo) {
    throw new ApiError(
      401,
      "CREDENCIALES_INVALIDAS",
      "Email o contraseña incorrectos."
    );
  }

  return {
    user: toPublicUser(user),
    session: { userId: user.id, email: user.email, rol: user.rol },
  };
}

/**
 * RF-U2: revalida la sesión contra la base en cada pedido.
 * Un usuario desactivado o eliminado pierde acceso aunque la cookie siga vigente.
 */
export async function getCurrentUser(
  session: SessionIdentity,
  database: Database = db
): Promise<PublicUser> {
  const [user] = await database
    .select()
    .from(usuarios)
    .where(eq(usuarios.id, session.userId))
    .limit(1);

  if (!user || !user.activo) {
    throw new ApiError(
      401,
      "NO_AUTENTICADO",
      "La sesión no es válida o el usuario está inactivo."
    );
  }

  return toPublicUser(user);
}

export const changePasswordSchema = z.object({
  actual: z
    .string({ required_error: "La contraseña actual es obligatoria." })
    .min(1, "La contraseña actual es obligatoria."),
  nueva: z
    .string({ required_error: "La nueva contraseña es obligatoria." })
    .min(8, "La nueva contraseña debe tener al menos 8 caracteres."),
});

/**
 * RF-U5: cada usuario cambia su propia contraseña verificando la actual.
 */
export async function changeOwnPassword(
  input: unknown,
  actor: PublicUser,
  database: Database = db
): Promise<void> {
  const parsed = changePasswordSchema.safeParse(input);
  if (!parsed.success) throw validationError(parsed.error);

  const { actual, nueva } = parsed.data;

  const [user] = await database
    .select()
    .from(usuarios)
    .where(eq(usuarios.id, actor.id))
    .limit(1);

  if (!user) {
    throw new ApiError(401, "NO_AUTENTICADO", "La sesión no es válida.");
  }

  const matches = await bcrypt.compare(actual, user.passwordHash);
  if (!matches) {
    throw new ApiError(
      422,
      "CONTRASENA_ACTUAL_INCORRECTA",
      "La contraseña actual es incorrecta."
    );
  }

  const passwordHash = await bcrypt.hash(nueva, 10);
  await database
    .update(usuarios)
    .set({ passwordHash })
    .where(eq(usuarios.id, actor.id));
}

/**
 * Verifica el rol del usuario autenticado. Se usa dentro de cada servicio.
 */
export function assertRole(
  user: PublicUser,
  ...roles: Array<PublicUser["rol"]>
): void {
  if (!roles.includes(user.rol)) {
    throw new ApiError(
      403,
      "SIN_PERMISO",
      "No tenés permiso para realizar esta operación."
    );
  }
}
