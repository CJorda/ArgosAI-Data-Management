# ArgosAI Piscifactoria MVP

Monorepo local para operar una version funcional de ArgosAI con:

- Frontend React (Vite + Tailwind CSS 4.2 + ECharts)
- Backend Express (JWT + Socket.IO)
- PostgreSQL local (sin Docker obligatorio)

## Estructura

- `apps/frontend`: interfaz web de operaciones
- `apps/backend`: API, auth, realtime y simulador de sensores

## Requisitos

- Node.js 20+
- PostgreSQL local disponible

## Configuracion de entorno

Genera tus archivos `.env` a partir de los ejemplos incluidos:

```bash
copy apps\\backend\\.env.example apps\\backend\\.env
copy apps\\frontend\\.env.example apps\\frontend\\.env
```

Si tu PostgreSQL local no usa usuario/password `postgres/postgres` o escucha en otro puerto (por ejemplo `5433`), actualiza `DATABASE_URL` en `apps/backend/.env`.

Ejemplo:

```env
DATABASE_URL=postgres://TU_USUARIO:TU_PASSWORD@localhost:TU_PUERTO/argosai
```

## Arranque local

1. Instalar dependencias:

```bash
pnpm install
```

2. Inicializar base de datos (crear DB, migrar y sembrar):

```bash
pnpm run setup
```

3. Levantar frontend + backend:

```bash
pnpm run dev
```

## Credenciales demo

- Tenant: `demo`
- Email: `admin@argosai.local`
- Password: `Admin123!`

## Scripts utiles

- `pnpm run dev`: levanta frontend y backend en paralelo
- `pnpm run dev:frontend`: levanta solo frontend
- `pnpm run dev:backend`: levanta solo backend
- `pnpm run setup`: bootstrap DB + migraciones + seed
- `pnpm --filter argosai-backend run db:provision-app-role`: crea/actualiza un rol de aplicacion sin BYPASSRLS
- `pnpm run build`: build frontend y verificacion backend

## Modulos incluidos en MVP

- Login y sesion JWT con refresh token
- Dashboard con KPI y lectura en tiempo real
- Historicos por sensor (bucket hora/dia)
- Alertas abiertas/resueltas
- Operaciones de campo
- Biomasa y FCR
- Camara FLIR/Jetson (session mock con fallback)

## API principal

- `GET /health`
- `POST /api/auth/login`
- `POST /api/auth/refresh`
- `GET /api/stats/summary`
- `GET /api/data/ponds`
- `GET /api/data/sensors`
- `GET /api/data/readings/latest`
- `GET /api/data/readings/history`
- `GET /api/alerts`
- `PATCH /api/alerts/:alertId/resolve`
- `GET/POST /api/operations`
- `GET/POST /api/biomass`
- `GET/POST /api/cameras/session`

## Gestion de views por tenant

- `GET /api/auth/tenant/features`: obtiene views activas del tenant autenticado
- `PUT /api/auth/tenant/features`: reemplaza views del tenant autenticado (rol `admin` o `superadmin`)
- `GET /api/auth/tenants/:tenantCode/features`: obtiene views de un tenant por codigo
- `PUT /api/auth/tenants/:tenantCode/features`: reemplaza views de un tenant por codigo

Payload de actualizacion:

```json
{
	"views": ["buoys.view", "dashboard.view"]
}
```

Variables de entorno relevantes:

- `TENANT_FEATURES_STRICT_MODE=true`: si un tenant no tiene configuracion en `tenant_features`, se queda sin acceso a views.
- `TENANT_FEATURES_STRICT_MODE=false` (default): comportamiento retrocompatible (permite todas las views cuando no hay filas para el tenant).

## Aislamiento de datos por tenant (RLS)

El backend ahora aplica contexto de tenant en cada query SQL (`app.tenant_id`) y activa politicas de Row Level Security sobre tablas con `tenant_id`.

- Las peticiones HTTP autenticadas se ejecutan con `app.rls_bypass=off` y `app.tenant_id=<tenant del token>`.
- Procesos internos fuera de request (migraciones/seed/tareas del sistema) usan `app.rls_bypass=on` para no romper flujos operativos.
- El esquema crea/actualiza politicas `tenant_isolation` de forma idempotente en migracion.

Importante en produccion:

- Si `DATABASE_URL` usa un rol superusuario o con `BYPASSRLS`, PostgreSQL ignora RLS para ese rol.
- Para aislamiento real entre tenants, usa un rol de aplicacion dedicado sin privilegios de superusuario ni `BYPASSRLS`.

Provision recomendada de rol seguro:

1. Configura en `apps/backend/.env`:

```env
DB_ADMIN_URL=postgres://postgres:postgres@localhost:5432/argosai
DB_APP_ROLE=argosai_app
DB_APP_PASSWORD=CAMBIA_ESTA_PASSWORD
```

2. Ejecuta:

```bash
pnpm --filter argosai-backend run db:provision-app-role
```

3. Cambia `DATABASE_URL` para usar el rol creado (`DB_APP_ROLE`) y activa:

```env
ENFORCE_RLS_SAFE_ROLE=true
```

Con `ENFORCE_RLS_SAFE_ROLE=true`, el backend no arranca si el usuario de `DATABASE_URL` bypassa RLS.
