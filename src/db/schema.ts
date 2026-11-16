import { sql } from "drizzle-orm";
import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

export const usuarios = sqliteTable("usuarios", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  email: text("email").notNull().unique(),
  nombre: text("nombre").notNull(),
  passwordHash: text("password_hash").notNull(),
  rol: text("rol", { enum: ["admin", "vendedor"] }).notNull(),
  activo: integer("activo", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now', 'utc'))`),
});

export const categorias = sqliteTable("categorias", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  nombre: text("nombre").notNull().unique(),
  activa: integer("activa", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now', 'utc'))`),
});

export const productos = sqliteTable("productos", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  codigo: text("codigo").notNull().unique(),
  descripcion: text("descripcion").notNull(),
  categoriaId: integer("categoria_id")
    .notNull()
    .references(() => categorias.id),
  precio: integer("precio").notNull(), // En centavos
  existencia: integer("existencia").notNull().default(0),
  stockMinimo: integer("stock_minimo").notNull().default(0),
  activo: integer("activo", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now', 'utc'))`),
});

export const movimientosStock = sqliteTable("movimientos_stock", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  productoId: integer("producto_id")
    .notNull()
    .references(() => productos.id),
  tipo: text("tipo", { enum: ["venta", "anulacion", "ingreso", "egreso"] }).notNull(),
  cantidad: integer("cantidad").notNull(), // Con signo
  existenciaResultante: integer("existencia_resultante").notNull(),
  motivo: text("motivo").notNull(),
  observacion: text("observacion"),
  facturaId: integer("factura_id").references(() => facturas.id),
  usuarioId: integer("usuario_id")
    .notNull()
    .references(() => usuarios.id),
  fecha: text("fecha")
    .notNull()
    .default(sql`(datetime('now', 'utc'))`),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now', 'utc'))`),
});

export const clientes = sqliteTable("clientes", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  tipoDoc: text("tipo_doc", { enum: ["DNI", "CUIT"] }).notNull(),
  nroDoc: text("nro_doc").notNull(),
  nombre: text("nombre").notNull(),
  domicilio: text("domicilio"),
  telefono: text("telefono"),
  email: text("email"),
  cuentaCorriente: integer("cuenta_corriente", { mode: "boolean" }).notNull().default(false),
  limiteCredito: integer("limite_credito"), // En centavos, nulo = sin límite
  activo: integer("activo", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now', 'utc'))`),
});

export const facturas = sqliteTable("facturas", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  puntoVenta: integer("punto_venta").notNull().default(1),
  numero: integer("numero").notNull(),
  fecha: text("fecha")
    .notNull()
    .default(sql`(datetime('now', 'utc'))`),
  total: integer("total").notNull(), // En centavos
  formaPago: text("forma_pago", { enum: ["contado", "tarjeta", "cuenta_corriente"] }).notNull(),
  montoRecibido: integer("monto_recibido"), // En centavos, solo contado
  tarjetaTipo: text("tarjeta_tipo", { enum: ["debito", "credito"] }),
  tarjetaMarca: text("tarjeta_marca"),
  tarjetaUltimos4: text("tarjeta_ultimos4"),
  estado: text("estado", { enum: ["emitida", "anulada"] }).notNull().default("emitida"),
  motivoAnulacion: text("motivo_anulacion"),
  usuarioAnulacionId: integer("usuario_anulacion_id").references(() => usuarios.id),
  fechaAnulacion: text("fecha_anulacion"),
  clienteId: integer("cliente_id").references(() => clientes.id), // Nulo = Consumidor Final
  usuarioId: integer("usuario_id")
    .notNull()
    .references(() => usuarios.id),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now', 'utc'))`),
});

export const facturaItems = sqliteTable("factura_items", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  facturaId: integer("factura_id")
    .notNull()
    .references(() => facturas.id),
  productoId: integer("producto_id")
    .notNull()
    .references(() => productos.id),
  cantidad: integer("cantidad").notNull(),
  precioUnitario: integer("precio_unitario").notNull(), // En centavos
  subtotal: integer("subtotal").notNull(), // En centavos
  descripcion: text("descripcion").notNull(),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now', 'utc'))`),
});

export const pagos = sqliteTable("pagos", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  numeroRecibo: text("numero_recibo").notNull().unique(), // Formato R 0001-00000001
  fecha: text("fecha")
    .notNull()
    .default(sql`(datetime('now', 'utc'))`),
  importe: integer("importe").notNull(), // En centavos
  medio: text("medio", { enum: ["efectivo", "transferencia", "tarjeta_debito"] }).notNull(),
  observacion: text("observacion"),
  clienteId: integer("cliente_id")
    .notNull()
    .references(() => clientes.id),
  usuarioId: integer("usuario_id")
    .notNull()
    .references(() => usuarios.id),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now', 'utc'))`),
});

export const movimientosCuenta = sqliteTable("movimientos_cuenta", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  clienteId: integer("cliente_id")
    .notNull()
    .references(() => clientes.id),
  tipo: text("tipo", { enum: ["debito", "credito"] }).notNull(),
  importe: integer("importe").notNull(), // En centavos
  fecha: text("fecha")
    .notNull()
    .default(sql`(datetime('now', 'utc'))`),
  descripcion: text("descripcion").notNull(),
  facturaId: integer("factura_id").references(() => facturas.id),
  pagoId: integer("pago_id").references(() => pagos.id),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now', 'utc'))`),
});
