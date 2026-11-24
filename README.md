# Mostrador · Sistema de Gestión Comercial

Aplicación Next.js 15 (App Router) para facturación, control de stock y cuenta corriente.
Especificaciones funcionales y técnicas: [`../../docs/`](../../docs/README.md).

## Integrantes

- Jose Villagra ([@HerrDoc132](https://github.com/HerrDoc132))

## URL pública

> Pendiente: completar con la URL de Vercel una vez ejecutado el deploy manual (TP5-44).
> Formato esperado: `https://<nombre-del-proyecto>.vercel.app`.

> **Importante:** todos los comandos se ejecutan dentro de esta carpeta (`repos/mostrador/`), no en la raíz del repositorio.

## Requisitos

- **Node.js 20 o superior** (probado con Node 24).
- **pnpm** (probado con pnpm 11). Si no lo tenés: `npm install -g pnpm`.

Verificar:

```bash
node -v
pnpm -v
```

## Levantar el proyecto desde cero

### 1. Entrar a la carpeta de la app

```bash
cd repos/mostrador
```

### 2. Instalar dependencias

```bash
pnpm install
```

### 3. Crear el archivo de entorno

```bash
cp .env.example .env
```

En Windows PowerShell:

```powershell
Copy-Item .env.example .env
```

Abrí `.env` y revisá estas dos variables:

```env
DATABASE_URL="file:local.db"
SESSION_SECRET="un_secreto_largo_de_al_menos_32_caracteres"
```

- `DATABASE_URL` **debe empezar con `file:`**. Si ponés solo `local.db`, libSQL falla con
  `URL_INVALID: The URL 'local.db' is not in a valid format`.
- Para generar un `SESSION_SECRET` nuevo:

  ```bash
  node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
  ```

  (o `openssl rand -base64 32` si tenés OpenSSL).

> El archivo `.env` no se versiona. Si falta `SESSION_SECRET`, la app usa un secreto de
> desarrollo por defecto: sirve para probar, pero no para producción.

### 4. Generar las migraciones

Solo hace falta la primera vez, o después de modificar `src/db/schema.ts`:

```bash
pnpm db:generate
```

Esto crea/actualiza los archivos SQL en `repos/mostrador/drizzle/`.

### 5. Aplicar las migraciones a la base

```bash
pnpm db:migrate
```

Crea `local.db` con las 9 tablas del sistema.

### 6. Cargar los datos iniciales

```bash
pnpm db:seed
```

Crea los datos de prueba completos: 2 usuarios, 5 categorías, 30 productos con stock
inicial, 10 clientes (algunos con cuenta corriente), 50 facturas distribuidas en los
últimos 30 días y pagos de prueba. Todas las entidades se generan con los servicios de
dominio, por lo que stock, numeración y saldos quedan consistentes. El seed es
**idempotente**: se puede ejecutar varias veces sin duplicar datos.

### 7. Levantar el servidor

```bash
pnpm dev
```

Abrir <http://localhost:3000>.

### Credenciales de desarrollo

| Rol | Email | Contraseña |
| --- | --- | --- |
| admin | `admin@comercio.test` | `admin123` |
| vendedor | `vendedor@comercio.test` | `vendedor123` |

## Uso diario (ya instalado y migrado)

```bash
cd repos/mostrador
pnpm dev
```

No hace falta repetir `install`, `db:generate`, `db:migrate` ni `db:seed` salvo que cambie
el esquema o quieras reiniciar los datos.

## Reiniciar la base de datos

Si querés empezar de cero (por ejemplo, después de romper datos de prueba):

```bash
cd repos/mostrador
pnpm db:reset
pnpm dev
```

`pnpm db:reset` borra la base local, aplica las migraciones y ejecuta el seed completo.
Si solo querés borrarla, usá `pnpm db:drop`. Ambos comandos rechazan URLs que no sean
`file:` para no afectar una base remota.

En Windows PowerShell los comandos son idénticos (no hace falta `Remove-Item`).

## Scripts

| Comando | Descripción |
| --- | --- |
| `pnpm dev` | Servidor de desarrollo en <http://localhost:3000> |
| `pnpm dev --port 3001` | Igual, pero en otro puerto si el 3000 está ocupado |
| `pnpm build` / `pnpm start` | Build y servidor de producción |
| `pnpm test` | Todos los tests unitarios (Vitest) |
| `pnpm exec vitest run <archivo>` | Un solo archivo de tests |
| `pnpm exec tsc --noEmit` | Chequeo de tipos (no hay script `typecheck`) |
| `pnpm db:generate` | Genera migraciones desde `src/db/schema.ts` |
| `pnpm db:migrate` | Aplica migraciones a la base configurada |
| `pnpm db:seed` | Carga los datos de prueba completos (idempotente) |
| `pnpm db:drop` | Borra solo la base SQLite local (`file:`) |
| `pnpm db:reset` | Borra, migra y vuelve a cargar los datos de prueba |

## Verificar que todo está sano

```bash
pnpm test
pnpm exec tsc --noEmit
pnpm build
```

Los tres deben terminar sin errores.

## Problemas comunes

| Síntoma | Causa y solución |
| --- | --- |
| `URL_INVALID: The URL 'local.db' is not in a valid format` | `DATABASE_URL` debe ser `file:local.db`. |
| `no such table: usuarios` | Faltan migraciones: `pnpm db:migrate` y después `pnpm db:seed`. |
| `EADDRINUSE: address already in use :::3000` | Otro proceso usa el puerto: `pnpm dev --port 3001`. |
| El login devuelve `401 CREDENCIALES_INVALIDAS` | Usuario inexistente, contraseña incorrecta o usuario desactivado. Verificá con `pnpm db:seed`. |
| Después de cambiar `src/db/schema.ts` no aparecen las tablas nuevas | Corré `pnpm db:generate` y luego `pnpm db:migrate`. |
| `pnpm lint` falla | ESLint todavía no está instalado/configurado en el proyecto. |

## Publicación en Vercel con base Turso

El deploy es manual: Vercel no se dispara desde este repositorio. Pasos:

1. **Crear la base en Turso** (plan gratuito):

   ```bash
   turso db create gestion-almacen
   turso db show gestion-almacen --url
   turso db tokens create gestion-almacen
   ```

2. **Migrar y cargar datos contra Turso** desde la máquina local. `drizzle.config.ts`
   todavía lee `DATABASE_URL` para las migraciones (la unificación con
   `TURSO_DATABASE_URL` está en TP5-46), por eso se pasa la URL de Turso en esa variable:

   ```bash
   DATABASE_URL="libsql://<db>.turso.io" \
   TURSO_AUTH_TOKEN="<token>" \
   pnpm db:migrate

   DATABASE_URL="libsql://<db>.turso.io" \
   TURSO_AUTH_TOKEN="<token>" \
   pnpm db:seed
   ```

3. **Importar el proyecto en Vercel**: repositorio de GitHub, *Root Directory*
   `repos/mostrador`, framework Next.js (detectado por `vercel.json`).

4. **Configurar las variables de entorno** en Vercel:

   | Variable | Valor |
   | --- | --- |
   | `TURSO_DATABASE_URL` | `libsql://<db>.turso.io` |
   | `TURSO_AUTH_TOKEN` | Token de la base |
   | `SESSION_SECRET` | Secreto largo generado con `openssl rand -base64 32` |

   No hace falta definir `DATABASE_URL` en Vercel: `src/db/index.ts` prioriza
   `TURSO_DATABASE_URL` cuando está presente.

5. **Hacer push a `main`** para disparar el deploy automático de Vercel.

6. **Verificar la publicación**: abrir `/login`, ingresar con los usuarios de prueba,
   consultar `GET /api/tablero` y confirmar que hay 5 categorías, 30 productos,
   10 clientes y 50 facturas.

7. **Completar la URL pública** en la sección "URL pública" de este README y cerrar
   el ticket TP5-44 en Jira.

## Arquitectura

Las reglas de negocio viven únicamente en `src/services/`. Los Route Handlers
(`src/app/api/**/route.ts`) y las Server Actions son adaptadores finos: leen la sesión,
llaman al servicio y traducen errores con `ApiError`.

```text
src/
├── app/            Páginas y Route Handlers (Next.js App Router)
├── components/     Componentes compartidos de UI
├── db/             Esquema Drizzle, conexión y seed
├── lib/            Sesión, errores, formato, helpers HTTP
├── services/       Reglas de negocio, validación Zod y permisos
└── test/           Utilidades de testing (SQLite en memoria)
```

Convenciones completas en [`../../AGENTS.md`](../../AGENTS.md).
