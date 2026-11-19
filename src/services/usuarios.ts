import { and, asc, eq, like, ne, or, sql } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { db, type Database } from "@/db";
import { usuarios } from "@/db/schema";
import { ApiError } from "@/lib/errors";
import { validationError } from "@/lib/validation";
import {
  assertRole,
  toPublicUser,
  type PublicUser,
} from "@/services/auth";
import { randomBytes } from "node:crypto";

/**
 * Servicio de gestión de usuarios (RF-U4, RF-U5).
 * Todas las funciones administrativas verifican el rol antes de operar.
 */

export const listUsuariosQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  activo: z.enum(["true", "false"]).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export const createUsuarioSchema = z.object({
  nombre: z
    .string({ required_error: "El nombre es obligatorio." })
    .trim()
    .min(1, "El nombre es obligatorio.")
    .max(120, "El nombre es demasiado largo."),
  email: z
    .string({ required_error: "El email es obligatorio." })
    .trim()
    .email("El email no es válido.")
    .transform((value) => value.toLowerCase()),
  rol: z.enum(["admin", "vendedor"], {
    required_error: "El rol es obligatorio.",
    invalid_type_error: "El rol debe ser admin o vendedor.",
  }),
  password: z
    .string({ required_error: "La contraseña es obligatoria." })
    .min(8, "La contraseña debe tener al menos 8 caracteres."),
});

export const updateUsuarioSchema = z
  .object({
    nombre: z.string().trim().min(1).max(120).optional(),
    email: z
      .string()
      .trim()
      .email("El email no es válido.")
      .transform((value) => value.toLowerCase())
      .optional(),
    rol: z.enum(["admin", "vendedor"]).optional(),
    activo: z.boolean().optional(),
  })
  .refine((data) => Object.values(data).some((value) => value !== undefined), {
    message: "Enviá al menos un campo para actualizar.",
  });

export interface AdminUser extends PublicUser {
  activo: boolean;
}

function toAdminUser(user: typeof usuarios.$inferSelect): AdminUser {
  return { ...toPublicUser(user), activo: user.activo };
}

export interface PaginatedUsers {
  data: AdminUser[];
  page: number;
  pageSize: number;
  total: number;
}

function assertValidId(id: number): void {
  if (!Number.isInteger(id) || id <= 0) {
    throw new ApiError(404, "NO_ENCONTRADO", "El usuario no existe.");
  }
}

function isUniqueViolation(error: unknown): boolean {
  const code = (error as { code?: string } | null)?.code;
  return (
    code === "SQLITE_CONSTRAINT_UNIQUE" ||
    (error instanceof Error && /unique constraint/i.test(error.message))
  );
}

/**
 * RF-U4: listado paginado con búsqueda por nombre/email y filtro por activo.
 * Nunca expone passwordHash.
 */
export async function listUsuarios(
  input: unknown,
  actor: PublicUser,
  database: Database = db
): Promise<PaginatedUsers> {
  assertRole(actor, "admin");

  const parsed = listUsuariosQuerySchema.safeParse(input ?? {});
  if (!parsed.success) throw validationError(parsed.error);

  const { q, activo, page, pageSize } = parsed.data;
  const term = q ? `%${q}%` : undefined;

  const where = and(
    term
      ? or(like(usuarios.nombre, term), like(usuarios.email, term))
      : undefined,
    activo !== undefined ? eq(usuarios.activo, activo === "true") : undefined
  );

  const [{ total }] = await database
    .select({ total: sql<number>`count(*)` })
    .from(usuarios)
    .where(where);

  const rows = await database
    .select()
    .from(usuarios)
    .where(where)
    .orderBy(asc(usuarios.id))
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  return {
    data: rows.map(toAdminUser),
    page,
    pageSize,
    total: Number(total),
  };
}

/**
 * RF-U4: alta de usuario. Solo admin.
 */
export async function createUsuario(
  input: unknown,
  actor: PublicUser,
  database: Database = db
): Promise<AdminUser> {
  assertRole(actor, "admin");

  const parsed = createUsuarioSchema.safeParse(input);
  if (!parsed.success) throw validationError(parsed.error);

  const { nombre, email, rol, password } = parsed.data;

  const [existing] = await database
    .select({ id: usuarios.id })
    .from(usuarios)
    .where(eq(usuarios.email, email))
    .limit(1);

  if (existing) {
    throw new ApiError(
      409,
      "EMAIL_DUPLICADO",
      "Ya existe un usuario con ese email."
    );
  }

  const passwordHash = await bcrypt.hash(password, 10);

  try {
    const [created] = await database
      .insert(usuarios)
      .values({ nombre, email, rol, passwordHash })
      .returning();

    return toAdminUser(created);
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new ApiError(
        409,
        "EMAIL_DUPLICADO",
        "Ya existe un usuario con ese email."
      );
    }
    throw error;
  }
}

/**
 * RF-U4: edición de datos, rol y estado. Solo admin.
 * Un admin no puede desactivarse ni cambiarse el rol a sí mismo.
 */
export async function updateUsuario(
  id: number,
  input: unknown,
  actor: PublicUser,
  database: Database = db
): Promise<AdminUser> {
  assertRole(actor, "admin");
  assertValidId(id);

  const parsed = updateUsuarioSchema.safeParse(input);
  if (!parsed.success) throw validationError(parsed.error);

  const changes = parsed.data;

  const [target] = await database
    .select()
    .from(usuarios)
    .where(eq(usuarios.id, id))
    .limit(1);

  if (!target) {
    throw new ApiError(404, "NO_ENCONTRADO", "El usuario no existe.");
  }

  if (id === actor.id) {
    if (changes.activo === false) {
      throw new ApiError(
        422,
        "OPERACION_SOBRE_SI_MISMO",
        "No podés desactivar tu propio usuario."
      );
    }
    if (changes.rol !== undefined && changes.rol !== actor.rol) {
      throw new ApiError(
        422,
        "OPERACION_SOBRE_SI_MISMO",
        "No podés cambiar tu propio rol."
      );
    }
  }

  if (changes.email && changes.email !== target.email) {
    const [duplicate] = await database
      .select({ id: usuarios.id })
      .from(usuarios)
      .where(and(eq(usuarios.email, changes.email), ne(usuarios.id, id)))
      .limit(1);

    if (duplicate) {
      throw new ApiError(
        409,
        "EMAIL_DUPLICADO",
        "Ya existe un usuario con ese email."
      );
    }
  }

  const values: Partial<typeof usuarios.$inferInsert> = {};
  if (changes.nombre !== undefined) values.nombre = changes.nombre;
  if (changes.email !== undefined) values.email = changes.email;
  if (changes.rol !== undefined) values.rol = changes.rol;
  if (changes.activo !== undefined) values.activo = changes.activo;

  try {
    const [updated] = await database
      .update(usuarios)
      .set(values)
      .where(eq(usuarios.id, id))
      .returning();

    if (!updated) {
      throw new ApiError(404, "NO_ENCONTRADO", "El usuario no existe.");
    }

    return toAdminUser(updated);
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new ApiError(
        409,
        "EMAIL_DUPLICADO",
        "Ya existe un usuario con ese email."
      );
    }
    throw error;
  }
}

/**
 * RF-U5: el admin genera una contraseña temporal y la devuelve una sola vez.
 */
export async function resetPassword(
  id: number,
  actor: PublicUser,
  database: Database = db
): Promise<{ passwordTemporal: string }> {
  assertRole(actor, "admin");
  assertValidId(id);

  const [target] = await database
    .select({ id: usuarios.id })
    .from(usuarios)
    .where(eq(usuarios.id, id))
    .limit(1);

  if (!target) {
    throw new ApiError(404, "NO_ENCONTRADO", "El usuario no existe.");
  }

  const passwordTemporal = randomBytes(9).toString("base64url");
  const passwordHash = await bcrypt.hash(passwordTemporal, 10);

  await database
    .update(usuarios)
    .set({ passwordHash })
    .where(eq(usuarios.id, id));

  return { passwordTemporal };
}
