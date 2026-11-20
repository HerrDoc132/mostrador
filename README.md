# Mostrador · Sistema de Gestión Comercial

Aplicación Next.js 15 (App Router) para facturación, control de stock y cuenta corriente.
Especificaciones funcionales y técnicas: [`../../docs/`](../../docs/README.md).

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

Crea el administrador y el vendedor de prueba. El seed es **idempotente**: se puede
ejecutar varias veces sin duplicar usuarios.

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
rm local.db local.db-wal local.db-shm
pnpm db:migrate
pnpm db:seed
pnpm dev
```

En Windows PowerShell:

```powershell
Remove-Item local.db, local.db-wal, local.db-shm -ErrorAction SilentlyContinue
pnpm db:migrate
pnpm db:seed
pnpm dev
```

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
| `pnpm db:seed` | Carga usuarios iniciales |

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
