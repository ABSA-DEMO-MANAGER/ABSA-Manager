# Portal de Mantenimiento

Plan de mantenimiento, catálogo de activos y control de gasto por sucursal.

React + Vite + Tailwind, con Supabase (Postgres + Auth) como backend. Se despliega
como sitio estático en Netlify.

---

## Puesta en marcha

### 1. Crear el esquema en Supabase

En **Supabase → SQL Editor → New query**, pega y ejecuta **en este orden**:

| Archivo | Qué hace |
|---|---|
| `supabase/01-schema.sql` | Crea tablas, vistas y permisos (RLS). Se corre una sola vez. |
| `supabase/02-datos.sql` | Carga los datos migrados de los Exceles. |
| `supabase/03-hazme-admin.sql` | Te convierte en administrador. **Después** de crear tu cuenta. |

### 2. Configurar las llaves

```bash
cp .env.example .env
```

Llena `.env` con los valores de **Supabase → Project Settings → API**:

```
VITE_SUPABASE_URL=https://xxxxx.supabase.co
VITE_SUPABASE_KEY=sb_publishable_...
```

> Usa la llave **publishable / anon**, nunca la `service_role`. La publishable es
> pública por diseño; lo que protege los datos es el RLS del esquema.

### 3. Correr en local

```bash
npm install
npm run dev
```

Abre <http://localhost:5173>, crea tu cuenta y luego corre `03-hazme-admin.sql`.

---

## Desplegar en Netlify

1. Sube el repo a GitHub.
2. En Netlify: **Add new site → Import an existing project**.
3. Build command `npm run build`, publish directory `dist` (ya viene en `netlify.toml`).
4. En **Site settings → Environment variables**, agrega `VITE_SUPABASE_URL` y
   `VITE_SUPABASE_KEY`.

---

## Estructura

```
supabase/          esquema y carga de datos
scripts/migrar.js  convierte los Exceles a SQL
src/pages/         Dashboard, Gastos, Plan, Activos, Pendientes, Sucursales
src/lib/           cliente de Supabase, sesión, formateo
src/components/    Layout y componentes de interfaz
_fuentes-excel/    Exceles originales (no se publican)
```

## Volver a migrar los Exceles

Si actualizas los archivos en `_fuentes-excel/`:

```bash
npm run migrar
```

Regenera `supabase/02-datos.sql`. Ojo: ese script **inserta**, no actualiza — si ya
cargaste los datos, vacía las tablas antes o vas a duplicar.

---

## Roles

| Rol | Puede |
|---|---|
| `admin` | Todo |
| `coordinador` | Capturar gastos, órdenes, activos y presupuesto |
| `tecnico` | Cerrar órdenes de trabajo |
| `consulta` | Solo lectura |

Todo usuario nuevo entra como `consulta`. Se promueve con SQL (ver `03-hazme-admin.sql`).

---

## Decisiones de diseño

- **El costo cuelga de la orden de trabajo**, no flota suelto. Así el gasto siempre
  tiene un responsable, una sucursal y, cuando aplica, un activo.
- **El portal controla el compromiso; el ERP tiene la cifra oficial.** Se concilian
  por centro de costo y número de factura, no al peso.
- **Preventivo y correctivo están separados desde el origen**, porque su proporción
  es la métrica que justifica el presupuesto del área.
- Los movimientos con dato dudoso llegan marcados con `requiere_revision` en vez de
  corregirse en silencio.
