import bcrypt from "bcryptjs";
import { eq, sql } from "drizzle-orm";
import type { SQLiteTable } from "drizzle-orm/sqlite-core";
import type { Database } from "@/db";
import {
  categorias,
  clientes,
  facturas,
  movimientosCuenta,
  movimientosStock,
  pagos,
  productos,
  usuarios,
} from "@/db/schema";
import { ApiError } from "@/lib/errors";
import { toPublicUser, type PublicUser } from "@/services/auth";
import { createCategoria } from "@/services/categorias";
import { createCliente } from "@/services/clientes";
import { createFactura } from "@/services/facturas";
import { registrarPago } from "@/services/pagos";
import { createProducto } from "@/services/productos";
import { fechaLocal } from "@/services/tablero";

/**
 * TP5-42 / requerimientos.md:179 — datos iniciales del sistema.
 *
 * Regla: todo se crea con los servicios de dominio (validación, permisos,
 * transacciones y movimientos de stock/cuenta), salvo el bootstrap de los dos
 * usuarios, que no puede usar `createUsuario` porque ese servicio exige un
 * admin previo (RF-U3).
 *
 * La fecha de emisión se normaliza después de cada alta porque `createFactura`
 * usa el reloj de SQLite; es un UPDATE del campo, nunca un INSERT directo.
 */

const NOMBRES_CATEGORIAS = [
  "Ferretería",
  "Pinturería",
  "Electricidad",
  "Plomería",
  "Limpieza",
] as const;

const CANTIDAD_PRODUCTOS = 30;
const CANTIDAD_CLIENTES = 10;
const CANTIDAD_FACTURAS = 50;
const DIAS_HISTORIAL = 30;

export interface ResultadoSeed {
  admin: PublicUser;
  vendedor: PublicUser;
  categorias: number;
  productos: number;
  clientes: number;
  facturas: number;
}

type LineaPlanificada = { productoId: number; cantidad: number };
type FormaPago = "contado" | "tarjeta" | "cuenta_corriente";

type FacturaPlanificada = {
  clienteId: number | null;
  forma: FormaPago;
  items: LineaPlanificada[];
  fecha: string;
};

function codigoProducto(indice: number): string {
  return `P-${String(indice + 1).padStart(3, "0")}`;
}

function documentoCliente(indice: number): string {
  return String(30000001 + indice);
}

/** 15 UTC = 12 de Buenos Aires: mismo día calendario local. */
function isoDelDiaLocal(dia: string): string {
  const [anio, mes, diaDelMes] = dia.split("-").map(Number);
  return new Date(Date.UTC(anio, mes - 1, diaDelMes, 15)).toISOString();
}

function diaLocalDesplazado(ahora: Date, diasAtras: number): string {
  const [anio, mes, dia] = fechaLocal(ahora).split("-").map(Number);
  return new Date(Date.UTC(anio, mes - 1, dia) - diasAtras * 86_400_000)
    .toISOString()
    .slice(0, 10);
}

/** Índices de los dos renglones de cada factura; determinista y sin stock repetido. */
function indicesProductos(indice: number): [number, number] {
  const primero = (indice * 7) % CANTIDAD_PRODUCTOS;
  let segundo = (indice * 13 + 5) % CANTIDAD_PRODUCTOS;
  if (segundo === primero) segundo = (segundo + 1) % CANTIDAD_PRODUCTOS;
  return [primero, segundo];
}

function demandaInicial(): number[] {
  const demanda = Array.from({ length: CANTIDAD_PRODUCTOS }, () => 0);
  for (let indice = 0; indice < CANTIDAD_FACTURAS; indice++) {
    const [primero, segundo] = indicesProductos(indice);
    demanda[primero] += (indice % 3) + 1;
    demanda[segundo] += 1;
  }
  return demanda;
}

function esDuplicado(error: unknown, code: string): boolean {
  return error instanceof ApiError && error.code === code;
}

async function contar(database: Database, tabla: SQLiteTable): Promise<number> {
  const [fila] = await database
    .select({ total: sql<number>`COUNT(*)` })
    .from(tabla);
  return Number(fila?.total ?? 0);
}

async function asegurarUsuarios(database: Database): Promise<{
  admin: PublicUser;
  vendedor: PublicUser;
}> {
  await database
    .insert(usuarios)
    .values({
      email: "admin@comercio.test",
      nombre: "Administrador General",
      passwordHash: await bcrypt.hash("admin123", 10),
      rol: "admin",
      activo: true,
    })
    .onConflictDoNothing();

  await database
    .insert(usuarios)
    .values({
      email: "vendedor@comercio.test",
      nombre: "Vendedor Mostrador",
      passwordHash: await bcrypt.hash("vendedor123", 10),
      rol: "vendedor",
      activo: true,
    })
    .onConflictDoNothing();

  const filas = await database.select().from(usuarios);
  const admin = filas.find((usuario) => usuario.email === "admin@comercio.test");
  const vendedor = filas.find((usuario) => usuario.email === "vendedor@comercio.test");
  if (!admin || !vendedor) {
    throw new Error("No se pudieron inicializar los usuarios del seed.");
  }
  return { admin: toPublicUser(admin), vendedor: toPublicUser(vendedor) };
}

async function asegurarCategorias(
  database: Database,
  admin: PublicUser
): Promise<number[]> {
  const existentes = await database.select().from(categorias);
  const ids = new Map(existentes.map((fila) => [fila.nombre, fila.id]));

  for (const nombre of NOMBRES_CATEGORIAS) {
    if (ids.has(nombre)) continue;
    try {
      const creada = await createCategoria({ nombre }, admin, database);
      ids.set(nombre, creada.id);
    } catch (error) {
      if (!esDuplicado(error, "NOMBRE_DUPLICADO")) throw error;
      const [fila] = await database
        .select({ id: categorias.id })
        .from(categorias)
        .where(eq(categorias.nombre, nombre));
      if (fila) ids.set(nombre, fila.id);
    }
  }

  return NOMBRES_CATEGORIAS.map((nombre) => {
    const id = ids.get(nombre);
    if (id === undefined) throw new Error(`No se pudo crear la categoría ${nombre}.`);
    return id;
  });
}

async function asegurarProductos(
  database: Database,
  admin: PublicUser,
  idsCategorias: number[]
): Promise<number[]> {
  const demanda = demandaInicial();
  const existentes = await database.select().from(productos);
  const ids = new Map(existentes.map((fila) => [fila.codigo, fila.id]));

  for (let indice = 0; indice < CANTIDAD_PRODUCTOS; indice++) {
    const codigo = codigoProducto(indice);
    if (ids.has(codigo)) continue;
    try {
      const creado = await createProducto(
        {
          codigo,
          descripcion: `Producto de prueba ${String(indice + 1).padStart(2, "0")}`,
          categoriaId: idsCategorias[indice % idsCategorias.length],
          precio: 1500 + indice * 137,
          stockMinimo: 2,
          // Cubre todas las ventas planificadas más un colchón (RF-S1).
          stockInicial: demanda[indice] + 10,
        },
        admin,
        database
      );
      ids.set(codigo, creado.id);
    } catch (error) {
      if (!esDuplicado(error, "CODIGO_DUPLICADO")) throw error;
      const [fila] = await database
        .select({ id: productos.id })
        .from(productos)
        .where(eq(productos.codigo, codigo));
      if (fila) ids.set(codigo, fila.id);
    }
  }

  return Array.from({ length: CANTIDAD_PRODUCTOS }, (_, indice) => {
    const id = ids.get(codigoProducto(indice));
    if (id === undefined) throw new Error(`No se pudo crear el producto ${codigoProducto(indice)}.`);
    return id;
  });
}

async function asegurarClientes(
  database: Database,
  admin: PublicUser
): Promise<{ todos: number[]; conCc: number[] }> {
  const existentes = await database.select().from(clientes);
  const ids = new Map(existentes.map((fila) => [fila.nroDoc, fila.id]));

  for (let indice = 0; indice < CANTIDAD_CLIENTES; indice++) {
    const nroDoc = documentoCliente(indice);
    if (ids.has(nroDoc)) continue;
    const conCc = indice % 3 === 0;
    try {
      const creado = await createCliente(
        {
          tipoDoc: "DNI",
          nroDoc,
          nombre: `Cliente de prueba ${String(indice + 1).padStart(2, "0")}`,
          domicilio: `Calle Falsa ${indice + 100}`,
          telefono: `5555-${String(1000 + indice)}`,
          email: `cliente${indice + 1}@ejemplo.test`,
          cuentaCorriente: conCc,
          limiteCredito: conCc ? 5_000_000 : null,
        },
        admin,
        database
      );
      ids.set(nroDoc, creado.id);
    } catch (error) {
      if (!esDuplicado(error, "DOCUMENTO_DUPLICADO")) throw error;
      const [fila] = await database
        .select({ id: clientes.id })
        .from(clientes)
        .where(eq(clientes.nroDoc, nroDoc));
      if (fila) ids.set(nroDoc, fila.id);
    }
  }

  const todos = Array.from({ length: CANTIDAD_CLIENTES }, (_, indice) => {
    const id = ids.get(documentoCliente(indice));
    if (id === undefined) throw new Error(`No se pudo crear el cliente ${documentoCliente(indice)}.`);
    return id;
  });
  const filas = await database.select().from(clientes);
  const conCc = todos.filter((id) => filas.find((fila) => fila.id === id)?.cuentaCorriente);
  if (conCc.length === 0) throw new Error("El seed necesita clientes con cuenta corriente.");
  return { todos, conCc };
}

function planificarFacturas(
  idsProductos: number[],
  idsClientesCc: number[],
  todosLosClientes: number[],
  ahora: Date,
  desde: number
): FacturaPlanificada[] {
  const formas: FormaPago[] = ["contado", "tarjeta", "cuenta_corriente"];
  return Array.from({ length: CANTIDAD_FACTURAS - desde }, (_, offset) => {
    const indice = desde + offset;
    const [primero, segundo] = indicesProductos(indice);
    const forma = formas[indice % formas.length];
    const clienteId =
      forma === "cuenta_corriente"
        ? idsClientesCc[indice % idsClientesCc.length]
        : indice % 5 === 0
          ? null
          : todosLosClientes[indice % todosLosClientes.length];

    return {
      clienteId,
      forma,
      items: [
        { productoId: idsProductos[primero], cantidad: (indice % 3) + 1 },
        { productoId: idsProductos[segundo], cantidad: 1 },
      ],
      fecha: isoDelDiaLocal(
        diaLocalDesplazado(ahora, DIAS_HISTORIAL - 1 - (indice % DIAS_HISTORIAL))
      ),
    };
  });
}

async function emitirFacturas(
  database: Database,
  admin: PublicUser,
  plan: FacturaPlanificada[]
): Promise<number> {
  const emitidas = await contar(database, facturas);

  for (const factura of plan) {
    const pago =
      factura.forma === "contado"
        ? { forma: "contado" as const }
        : factura.forma === "tarjeta"
          ? {
              forma: "tarjeta" as const,
              tarjeta: { tipo: "credito" as const, marca: "Visa", ultimos4: "4242" },
            }
          : { forma: "cuenta_corriente" as const };

    const creada = await createFactura(
      { clienteId: factura.clienteId, items: factura.items, pago },
      admin,
      database
    );

    await database
      .update(facturas)
      .set({ fecha: factura.fecha })
      .where(eq(facturas.id, creada.id));
    await database
      .update(movimientosStock)
      .set({ fecha: factura.fecha })
      .where(eq(movimientosStock.facturaId, creada.id));
    await database
      .update(movimientosCuenta)
      .set({ fecha: factura.fecha })
      .where(eq(movimientosCuenta.facturaId, creada.id));
  }

  return emitidas + plan.length;
}

async function registrarPagosDePrueba(
  database: Database,
  admin: PublicUser,
  idsClientesCc: number[],
  ahora: Date
): Promise<void> {
  const fechaPago = isoDelDiaLocal(diaLocalDesplazado(ahora, 1));
  for (const [indice, clienteId] of idsClientesCc.slice(0, 2).entries()) {
    const pago = await registrarPago(
      clienteId,
      {
        importe: 10_000,
        medio: indice === 0 ? "efectivo" : "transferencia",
        observacion: "Pago de prueba del seed",
      },
      admin,
      database
    );
    await database.update(pagos).set({ fecha: fechaPago }).where(eq(pagos.id, pago.id));
    await database
      .update(movimientosCuenta)
      .set({ fecha: fechaPago })
      .where(eq(movimientosCuenta.pagoId, pago.id));
  }
}

/** TP5-42: carga idempotente del conjunto completo de datos de demostración. */
export async function cargarDatosDePrueba(
  database: Database,
  ahora: Date = new Date()
): Promise<ResultadoSeed> {
  const { admin, vendedor } = await asegurarUsuarios(database);
  const idsCategorias = await asegurarCategorias(database, admin);
  const idsProductos = await asegurarProductos(database, admin, idsCategorias);
  const { todos: idsClientes, conCc: idsClientesCc } = await asegurarClientes(database, admin);

  const emitidas = await contar(database, facturas);
  const plan = planificarFacturas(idsProductos, idsClientesCc, idsClientes, ahora, emitidas);
  const totalFacturas = await emitirFacturas(database, admin, plan);

  if (plan.length > 0 && totalFacturas >= CANTIDAD_FACTURAS) {
    await registrarPagosDePrueba(database, admin, idsClientesCc, ahora);
  }

  const [conteoCategorias, conteoProductos, conteoClientes] = await Promise.all([
    contar(database, categorias),
    contar(database, productos),
    contar(database, clientes),
  ]);

  return {
    admin,
    vendedor,
    categorias: conteoCategorias,
    productos: conteoProductos,
    clientes: conteoClientes,
    facturas: totalFacturas,
  };
}
