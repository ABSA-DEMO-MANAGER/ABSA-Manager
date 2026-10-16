import { useState } from 'react';
import { Link, NavLink, Outlet } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';

/**
 * Armazón compartido (barra lateral + usuario + logout) para cada app
 * dentro de ABSA Manager. `nav` define los items del menú de esa app;
 * el logo siempre regresa al Hub.
 */
export default function AppShell({ appLabel, appIcono, appSub, nav, rolLabel }) {
  const { perfil } = useAuth();
  const [menu, setMenu] = useState(false);

  // `nav` acepta una lista plana de links (como ya usan Flotas/Limpieza)
  // o una lista de grupos { titulo, items } (Mantenimiento, paso 9).
  const grupos = nav.length && nav[0].items ? nav : [{ items: nav }];

  const linkCls = ({ isActive }) =>
    `flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition ${isActive ? 'font-medium' : ''}`;
  const linkStyle = ({ isActive }) => ({
    background: isActive ? 'var(--plane)' : 'transparent',
    color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
    border: `1px solid ${isActive ? 'var(--border)' : 'transparent'}`,
  });

  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      {/* Barra superior (móvil) */}
      <header
        className="flex items-center justify-between border-b px-4 py-3 lg:hidden"
        style={{ background: 'var(--surface-1)', borderColor: 'var(--border)' }}
      >
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg text-sm"
                style={{ background: 'var(--series-1)', color: '#fff' }} aria-hidden="true">{appIcono}</span>
          <span className="text-sm font-semibold">{appLabel}</span>
        </div>
        <button onClick={() => setMenu(!menu)} className="rounded-lg border px-2.5 py-1.5 text-sm"
                style={{ borderColor: 'var(--border)' }} aria-expanded={menu} aria-label="Menú">
          ☰
        </button>
      </header>

      {/* Navegación lateral */}
      <nav
        className={`${menu ? 'block' : 'hidden'} shrink-0 border-b p-3 lg:block lg:w-56 lg:border-r lg:border-b-0`}
        style={{ background: 'var(--surface-1)', borderColor: 'var(--border)' }}
      >
        <Link to="/" className="mb-1 hidden items-center gap-2 rounded-lg px-2 py-1.5 lg:flex"
              style={{ color: 'var(--text-muted)' }}>
          <span aria-hidden="true">←</span>
          <span className="text-xs">ABSA Manager</span>
        </Link>

        <div className="mb-5 hidden items-center gap-2 px-2 pt-1 lg:flex">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg text-sm"
                style={{ background: 'var(--series-1)', color: '#fff' }} aria-hidden="true">{appIcono}</span>
          <div>
            <div className="text-sm font-semibold leading-tight">{appLabel}</div>
            <div className="text-xs" style={{ color: 'var(--text-muted)' }}>{appSub}</div>
          </div>
        </div>

        <div className="space-y-3">
          {grupos.map((g, gi) => (
            <div key={g.titulo ?? gi}>
              {g.titulo && (
                <div className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wide"
                     style={{ color: 'var(--text-muted)' }}>
                  {g.titulo}
                </div>
              )}
              <div className="space-y-0.5">
                {g.items.map((n) => (
                  <NavLink key={n.to} to={n.to} end={n.end} className={linkCls} style={linkStyle}
                           onClick={() => setMenu(false)}>
                    <span className="w-4 text-center text-xs" aria-hidden="true">{n.icono}</span>
                    <span className="flex-1">{n.label}</span>
                    {!!n.badge && (
                      <span className="rounded-full px-1.5 py-0.5 text-[10px] font-semibold"
                            style={{ background: 'var(--critical)', color: '#fff' }}>
                        {n.badge}
                      </span>
                    )}
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-5 border-t pt-3" style={{ borderColor: 'var(--border)' }}>
          <div className="px-3 text-xs font-medium">{perfil?.nombre}</div>
          <div className="px-3 text-xs" style={{ color: 'var(--text-muted)' }}>{rolLabel}</div>
          <button
            onClick={() => supabase.auth.signOut()}
            className="mt-2 w-full rounded-lg px-3 py-1.5 text-left text-xs underline"
            style={{ color: 'var(--text-secondary)' }}
          >
            Cerrar sesión
          </button>
        </div>
      </nav>

      <main className="min-w-0 flex-1 p-4 sm:p-6">
        <Outlet />
      </main>
    </div>
  );
}
