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
