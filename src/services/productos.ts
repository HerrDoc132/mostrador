import { and, asc, eq, like, or, sql } from "drizzle-orm";
import { z } from "zod";
import { db, type Database } from "@/db";
import { categorias, productos } from "@/db/schema";
import { ApiError } from "@/lib/errors";
import { validationError } from "@/lib/validation";
import { assertRole, type PublicUser } from "@/services/auth";
import { moverStock } from "@/services/stock";

/**
 * Servicio de productos (RF-P1, RF-P2, RF-P3).
 * La existencia se modifica exclusivamente vía moverStock() (RF-P4/5/6, Regla 2).
 */

export const listProductosQuerySchema = z.object({
  q: z.string().trim().max(120).optional(),
  categoriaId: z.coerce.number().int().positive().optional(),
  bajoMinimo: z
    .union([z.literal("true"), z.literal("false"), z.boolean()])
    .optional(),
  activo: z.union([z.literal("true"), z.literal("false"), z.literal("todos")]).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export const createProductoSchema = z.object({
  codigo: z
    .string({ required_error: "El código es obligatorio." })
    .trim()
    .min(1, "El código es obligatorio.")
    .max(40),
  descripcion: z
    .string({ required_error: "La descripción es obligatoria." })
    .trim()
    .min(1, "La descripción es obligatoria.")
    .max(200),
  categoriaId: z.coerce
    .number({ required_error: "La categoría es obligatoria." })
    .int()
    .positive("La categoría es obligatoria."),
  precio: z.coerce
    .number({ required_error: "El precio es obligatorio." })
    .int("El precio debe ser un entero en centavos.")
    .min(0, "El precio no puede ser negativo."),
  stockMinimo: z.coerce
    .number({ required_error: "El stock mínimo es obligatorio." })
    .int("El stock mínimo debe ser un entero.")
    .min(0, "El stock mínimo no puede ser negativo."),
  stockInicial: z.coerce
    .number()
    .int("El stock inicial debe ser un entero.")
    .min(0, "El stock inicial no puede ser negativo.")
    .optional(),
});

export const updateProductoSchema = z
  .object({
    codigo: z.string().trim().min(1).max(40).optional(),
    descripcion: z.string().trim().min(1).max(200).optional(),
    categoriaId: z.coerce.number().int().positive().optional(),
    precio: z.coerce.number().int().min(0).optional(),
    stockMinimo: z.coerce.number().int().min(0).optional(),
    activo: z.boolean().optional(),
  })
  .strict()
  .refine((data) => Object.values(data).some((value) => value !== undefined), {
    message: "Enviá al menos un campo para actualizar.",
  });

function assertValidId(id: number): void {
  if (!Number.isInteger(id) || id <= 0) {
    throw new ApiError(404, "NO_ENCONTRADO", "El producto no existe.");
  }
}

function isUniqueViolation(error: unknown): boolean {
  const code = (error as { code?: string } | null)?.code;
  return (
    code === "SQLITE_CONSTRAINT_UNIQUE" ||
    (error instanceof Error && /unique constraint/i.test(error.message))
  );
}

function bajoMinimoSql() {
  return sql<boolean>`(${productos.existencia} <= ${productos.stockMinimo})`;
}

function productoSelect() {
  return {
    id: productos.id,
    codigo: productos.codigo,
    descripcion: productos.descripcion,
    precio: productos.precio,
    existencia: productos.existencia,
    stockMinimo: productos.stockMinimo,
    activo: productos.activo,
    bajoMinimo: bajoMinimoSql(),
    categoria: {
      id: categorias.id,
      nombre: categorias.nombre,
    },
  };
}

/**
 * RF-P1: listado paginado con búsqueda, filtros y marca de bajo mínimo.
 */
export async function listProductos(
  query: unknown,
  actor: PublicUser,
  database: Database = db
) {
  const parsed = listProductosQuerySchema.safeParse(query ?? {});
  if (!parsed.success) throw validationError(parsed.error);

  const { q, categoriaId, bajoMinimo, activo, page, pageSize } = parsed.data;
  const term = q ? `%${q}%` : undefined;

  const condiciones = [];

  if (term) {
    condiciones.push(
      or(like(productos.codigo, term), like(productos.descripcion, term))
    );
  }
  if (categoriaId !== undefined) {
    condiciones.push(eq(productos.categoriaId, categoriaId));
  }
  if (bajoMinimo === "true" || bajoMinimo === true) {
    condiciones.push(sql`${productos.existencia} <= ${productos.stockMinimo}`);
  }

  // activo: true por defecto; "todos" solo para admin
  if (activo === "todos") {
    if (actor.rol !== "admin") {
      condiciones.push(eq(productos.activo, true));
    }
  } else if (activo === "false") {
    condiciones.push(eq(productos.activo, false));
  } else {
    condiciones.push(eq(productos.activo, true));
  }

  const where = condiciones.length > 0 ? and(...condiciones) : undefined;

  const [{ total }] = await database
    .select({ total: sql<number>`count(*)` })
    .from(productos)
    .innerJoin(categorias, eq(productos.categoriaId, categorias.id))
    .where(where);

  const rows = await database
    .select(productoSelect())
    .from(productos)
    .innerJoin(categorias, eq(productos.categoriaId, categorias.id))
    .where(where)
    .orderBy(asc(productos.descripcion))
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  return {
    data: rows.map((row) => ({ ...row, bajoMinimo: Boolean(row.bajoMinimo) })),
    page,
    pageSize,
    total: Number(total),
  };
}

/**
 * RF-P1: detalle de producto con categoría embebida.
 */
export async function getProducto(
  id: number,
  _actor: PublicUser,
  database: Database = db
) {
  assertValidId(id);

  const [row] = await database
    .select(productoSelect())
    .from(productos)
    .innerJoin(categorias, eq(productos.categoriaId, categorias.id))
    .where(eq(productos.id, id))
    .limit(1);

  if (!row) {
    throw new ApiError(404, "NO_ENCONTRADO", "El producto no existe.");
  }

  return { ...row, bajoMinimo: Boolean(row.bajoMinimo) };
}

/**
 * RF-P2: alta de producto. Solo admin.
 * Si se informa stockInicial > 0, crea movimiento de ingreso "Stock inicial"
 * en la misma transacción.
 */
export async function createProducto(
  input: unknown,
  actor: PublicUser,
  database: Database = db
) {
  assertRole(actor, "admin");

  const parsed = createProductoSchema.safeParse(input);
  if (!parsed.success) throw validationError(parsed.error);

  const { codigo, descripcion, categoriaId, precio, stockMinimo, stockInicial } =
    parsed.data;

  const [categoria] = await database
    .select({ id: categorias.id, activa: categorias.activa })
    .from(categorias)
    .where(eq(categorias.id, categoriaId))
    .limit(1);

  if (!categoria || !categoria.activa) {
    throw new ApiError(
      422,
      "VALIDACION",
      "La categoría seleccionada no es válida.",
      [{ campo: "categoriaId", mensaje: "La categoría no existe o está inactiva." }]
    );
  }

  try {
    return await database.transaction(async (tx) => {
      const [created] = await tx
        .insert(productos)
        .values({
          codigo,
          descripcion,
          categoriaId,
          precio,
          stockMinimo,
          existencia: 0,
        })
        .returning();

      let existencia = 0;
      if (stockInicial && stockInicial > 0) {
        const result = await moverStock(
          {
            productoId: created.id,
            tipo: "ingreso",
            cantidad: stockInicial,
            motivo: "Stock inicial",
            usuarioId: actor.id,
          },
          tx
        );
        existencia = result.existenciaResultante;
      }

      const [cat] = await tx
        .select({ nombre: categorias.nombre })
        .from(categorias)
        .where(eq(categorias.id, categoriaId))
        .limit(1);

      return {
        id: created.id,
        codigo: created.codigo,
        descripcion: created.descripcion,
        categoria: { id: categoriaId, nombre: cat!.nombre },
        precio: created.precio,
        existencia,
        stockMinimo: created.stockMinimo,
        activo: created.activo,
        bajoMinimo: existencia <= created.stockMinimo,
      };
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new ApiError(
        409,
        "CODIGO_DUPLICADO",
        "Ya existe un producto con ese código."
      );
    }
    throw error;
  }
}

/**
 * RF-P2, RF-P3: edición de datos o baja lógica. Solo admin.
 * Rechaza explícitamente el campo `existencia` (422 VALIDACION).
 */
export async function updateProducto(
  id: number,
  input: unknown,
  actor: PublicUser,
  database: Database = db
) {
  assertRole(actor, "admin");
  assertValidId(id);

  // Rechazar campo prohibido antes de parsear con strict, para mensaje claro.
  if (input && typeof input === "object" && "existencia" in (input as object)) {
    throw new ApiError(
      422,
      "VALIDACION",
      "La existencia no se puede editar directamente.",
      [{ campo: "existencia", mensaje: "La existencia solo cambia mediante movimientos de stock." }]
    );
  }

  const parsed = updateProductoSchema.safeParse(input);
  if (!parsed.success) throw validationError(parsed.error);

  const changes = parsed.data;

  const [target] = await database
    .select({ id: productos.id })
    .from(productos)
    .where(eq(productos.id, id))
    .limit(1);

  if (!target) {
    throw new ApiError(404, "NO_ENCONTRADO", "El producto no existe.");
  }

  if (changes.categoriaId !== undefined) {
    const [cat] = await database
      .select({ id: categorias.id, activa: categorias.activa })
      .from(categorias)
      .where(eq(categorias.id, changes.categoriaId))
      .limit(1);
    if (!cat || !cat.activa) {
      throw new ApiError(
        422,
        "VALIDACION",
        "La categoría seleccionada no es válida.",
        [{ campo: "categoriaId", mensaje: "La categoría no existe o está inactiva." }]
      );
    }
  }

  const values: Partial<typeof productos.$inferInsert> = {};
  if (changes.codigo !== undefined) values.codigo = changes.codigo;
  if (changes.descripcion !== undefined) values.descripcion = changes.descripcion;
  if (changes.categoriaId !== undefined) values.categoriaId = changes.categoriaId;
  if (changes.precio !== undefined) values.precio = changes.precio;
  if (changes.stockMinimo !== undefined) values.stockMinimo = changes.stockMinimo;
  if (changes.activo !== undefined) values.activo = changes.activo;

  try {
    const [updated] = await database
      .update(productos)
      .set(values)
      .where(eq(productos.id, id))
      .returning({ id: productos.id });

    if (!updated) {
      throw new ApiError(404, "NO_ENCONTRADO", "El producto no existe.");
    }

    return await getProducto(id, actor, database);
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new ApiError(
        409,
        "CODIGO_DUPLICADO",
        "Ya existe un producto con ese código."
      );
    }
    throw error;
  }
}
