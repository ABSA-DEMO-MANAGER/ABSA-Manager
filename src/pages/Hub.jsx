import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';

const APPS = [
  {
    to: '/mantenimiento', externo: false,
    nombre: 'Mantenimiento', desc: 'Sucursales, activos, plan y gasto',
    icono: '⚙',
  },
  {
    to: '/flotas', externo: false,
    nombre: 'Flotas', desc: 'Inventario y control de vehículos',
    icono: '🚚',
  },
  {
    to: '/demos/index.html', externo: true,
    nombre: 'Demos', desc: 'Gestión de equipo demo',
    icono: '📦',
  },
];

export default function Hub() {
  const { perfil } = useAuth();

  return (
    <div className="flex min-h-screen flex-col" style={{ background: 'var(--plane)' }}>
      <header className="flex items-center justify-between px-5 py-4 sm:px-8">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl text-base font-bold"
                style={{ background: 'var(--series-1)', color: '#fff' }} aria-hidden="true">A</span>
          <div>
            <div className="text-sm font-semibold leading-tight">ABSA Manager</div>
            <div className="text-xs" style={{ color: 'var(--text-muted)' }}>Portal corporativo</div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="hidden text-sm sm:inline" style={{ color: 'var(--text-secondary)' }}>{perfil?.nombre}</span>
          <button onClick={() => supabase.auth.signOut()} className="text-xs underline"
                  style={{ color: 'var(--text-secondary)' }}>
            Cerrar sesión
          </button>
        </div>
      </header>

      <main className="flex flex-1 items-center justify-center px-5 pb-16">
        <div className="w-full max-w-3xl">
          <div className="mb-8 text-center">
            <h1 className="text-2xl font-semibold tracking-tight">¿Qué necesitas hoy?</h1>
            <p className="mt-1 text-sm" style={{ color: 'var(--text-secondary)' }}>
              Elige un portal para continuar
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {APPS.map((app) => {
              const contenido = (
                <>
                  <span
                    className="flex h-14 w-14 items-center justify-center rounded-2xl text-2xl"
                    style={{ background: 'var(--series-1)', color: '#fff' }}
                    aria-hidden="true"
                  >
                    {app.icono}
                  </span>
                  <div>
                    <div className="font-semibold">{app.nombre}</div>
                    <div className="mt-0.5 text-xs" style={{ color: 'var(--text-secondary)' }}>{app.desc}</div>
                  </div>
                </>
              );
              const cls = 'flex flex-col items-center gap-3 rounded-2xl border p-8 text-center transition hover:shadow-md hover:-translate-y-0.5';
              const style = { background: 'var(--surface-1)', borderColor: 'var(--border)' };
              return app.externo ? (
                <a key={app.to} href={app.to} className={cls} style={style}>{contenido}</a>
              ) : (
                <Link key={app.to} to={app.to} className={cls} style={style}>{contenido}</Link>
              );
            })}
          </div>
        </div>
      </main>
    </div>
  );
}
