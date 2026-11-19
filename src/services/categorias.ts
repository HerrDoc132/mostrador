import { and, asc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db, type Database } from "@/db";
import { categorias, productos } from "@/db/schema";
import { ApiError } from "@/lib/errors";
import { validationError } from "@/lib/validation";
import { assertRole, type PublicUser } from "@/services/auth";

/**
 * Servicio de categorías (RF-P7).
 * No conoce HTTP. Recibe el actor autenticado y datos sin validar.
 */

export const createCategoriaSchema = z.object({
  nombre: z
    .string({ required_error: "El nombre es obligatorio." })
    .trim()
    .min(1, "El nombre es obligatorio.")
    .max(120, "El nombre es demasiado largo."),
});

export const updateCategoriaSchema = z
  .object({
    nombre: z.string().trim().min(1).max(120).optional(),
    activa: z.boolean().optional(),
  })
  .refine((data) => Object.values(data).some((value) => value !== undefined), {
    message: "Enviá al menos un campo para actualizar.",
  });

function assertValidId(id: number): void {
  if (!Number.isInteger(id) || id <= 0) {
    throw new ApiError(404, "NO_ENCONTRADO", "La categoría no existe.");
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
 * RF-P7: lista todas las categorías activas, sin paginar.
 */
export async function listCategorias(
  _actor: PublicUser,
  database: Database = db
) {
  return database
    .select({
      id: categorias.id,
      nombre: categorias.nombre,
      activa: categorias.activa,
    })
    .from(categorias)
    .where(eq(categorias.activa, true))
    .orderBy(asc(categorias.nombre));
}

/**
 * RF-P7: alta de categoría. Solo admin.
 */
export async function createCategoria(
  input: unknown,
  actor: PublicUser,
  database: Database = db
) {
  assertRole(actor, "admin");

  const parsed = createCategoriaSchema.safeParse(input);
  if (!parsed.success) throw validationError(parsed.error);

  const { nombre } = parsed.data;

  try {
    const [created] = await database
      .insert(categorias)
      .values({ nombre })
      .returning({ id: categorias.id, nombre: categorias.nombre, activa: categorias.activa });

    return created;
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new ApiError(
        409,
        "NOMBRE_DUPLICADO",
        "Ya existe una categoría con ese nombre."
      );
    }
    throw error;
  }
}

/**
 * RF-P7: edición o baja lógica de categoría. Solo admin.
 * No permite desactivar si tiene productos activos asociados.
 */
export async function updateCategoria(
  id: number,
  input: unknown,
  actor: PublicUser,
  database: Database = db
) {
  assertRole(actor, "admin");
  assertValidId(id);

  const parsed = updateCategoriaSchema.safeParse(input);
  if (!parsed.success) throw validationError(parsed.error);

  const changes = parsed.data;

  const [target] = await database
    .select()
    .from(categorias)
    .where(eq(categorias.id, id))
    .limit(1);

  if (!target) {
    throw new ApiError(404, "NO_ENCONTRADO", "La categoría no existe.");
  }

  if (changes.activa === false) {
    const [{ total }] = await database
      .select({ total: sql<number>`count(*)` })
      .from(productos)
      .where(and(eq(productos.categoriaId, id), eq(productos.activo, true)));

    if (Number(total) > 0) {
      throw new ApiError(
        409,
        "CATEGORIA_EN_USO",
        "No se puede desactivar una categoría que tiene productos activos."
      );
    }
  }

  const values: Partial<typeof categorias.$inferInsert> = {};
  if (changes.nombre !== undefined) values.nombre = changes.nombre;
  if (changes.activa !== undefined) values.activa = changes.activa;

  try {
    const [updated] = await database
      .update(categorias)
      .set(values)
      .where(eq(categorias.id, id))
      .returning({ id: categorias.id, nombre: categorias.nombre, activa: categorias.activa });

    if (!updated) {
      throw new ApiError(404, "NO_ENCONTRADO", "La categoría no existe.");
    }

    return updated;
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new ApiError(
        409,
        "NOMBRE_DUPLICADO",
        "Ya existe una categoría con ese nombre."
      );
    }
    throw error;
  }
}
