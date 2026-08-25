import { useEffect } from 'react';

export function Card({ title, subtitle, right, children, className = '' }) {
  return (
    <section
      className={`rounded-xl border p-4 sm:p-5 ${className}`}
      style={{ background: 'var(--surface-1)', borderColor: 'var(--border)' }}
    >
      {(title || right) && (
        <header className="mb-4 flex items-start justify-between gap-3">
          <div>
            {title && <h2 className="text-sm font-semibold tracking-tight">{title}</h2>}
            {subtitle && (
              <p className="mt-0.5 text-xs" style={{ color: 'var(--text-secondary)' }}>{subtitle}</p>
            )}
          </div>
          {right}
        </header>
      )}
      {children}
    </section>
  );
}

export function Stat({ label, value, hint, tone, icon }) {
  const color =
    tone === 'good' ? 'var(--good-text)' :
    tone === 'critical' ? 'var(--critical)' :
    tone === 'warning' ? 'var(--serious)' : 'var(--text-primary)';
  return (
    <div
      className="rounded-xl border p-4"
      style={{ background: 'var(--surface-1)', borderColor: 'var(--border)' }}
    >
      <div className="flex items-center gap-1.5 text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
        {icon && <span aria-hidden="true">{icon}</span>}
        {label}
      </div>
      <div className="mt-1.5 text-2xl font-semibold tracking-tight" style={{ color }}>{value}</div>
      {hint && <div className="mt-1 text-xs" style={{ color: 'var(--text-muted)' }}>{hint}</div>}
    </div>
  );
}

export function Badge({ children, color = 'var(--text-secondary)', dot = true }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs whitespace-nowrap"
      style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
    >
      {dot && <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: color }} aria-hidden="true" />}
      {children}
    </span>
  );
}

export function Boton({ children, variant = 'primary', className = '', ...props }) {
  const base =
    'inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium ' +
    'transition disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2';
  const styles = variant === 'primary'
    ? { background: 'var(--series-1)', color: '#fff', borderColor: 'transparent' }
    : variant === 'danger'
    ? { background: 'transparent', color: 'var(--critical)', borderColor: 'var(--border)' }
    : { background: 'transparent', color: 'var(--text-primary)', borderColor: 'var(--border)' };
  return (
    <button className={`${base} border ${className}`} style={styles} {...props}>
      {children}
    </button>
  );
}

export function Campo({ label, children, hint, required }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
        {label} {required && <span style={{ color: 'var(--critical)' }}>*</span>}
      </span>
      {children}
      {hint && <span className="mt-1 block text-xs" style={{ color: 'var(--text-muted)' }}>{hint}</span>}
    </label>
  );
}

const inputCls =
  'w-full rounded-lg border px-3 py-2 text-sm outline-none ' +
  'focus:ring-2 focus:ring-offset-0';

const campoStyle = {
  background: 'var(--plane)', borderColor: 'var(--border)', color: 'var(--text-primary)',
};

export const Input = ({ className = '', ...props }) => (
  <input className={`${inputCls} ${className}`} style={campoStyle} {...props} />
);

export const Select = ({ children, className = '', ...props }) => (
  <select className={`${inputCls} ${className}`} style={campoStyle} {...props}>
    {children}
  </select>
);

export const Textarea = ({ className = '', ...props }) => (
  <textarea rows={3} className={`${inputCls} ${className}`} style={campoStyle} {...props} />
);

export function Tabla({ columnas, filas, vacio = 'Sin registros', onRowClick }) {
  return (
    <div className="-mx-4 overflow-x-auto sm:mx-0">
      <table className="w-full min-w-[640px] text-sm">
        <thead>
          <tr style={{ color: 'var(--text-secondary)' }}>
            {columnas.map((c) => (
              <th
                key={c.key}
                className={`border-b px-3 py-2 text-left text-xs font-medium whitespace-nowrap ${c.align === 'right' ? 'text-right' : ''}`}
                style={{ borderColor: 'var(--border)' }}
              >
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {filas.length === 0 && (
            <tr>
              <td colSpan={columnas.length} className="px-3 py-8 text-center text-sm" style={{ color: 'var(--text-muted)' }}>
                {vacio}
              </td>
            </tr>
          )}
          {filas.map((f, i) => (
            <tr
              key={f.id ?? i}
              onClick={onRowClick ? () => onRowClick(f) : undefined}
              className={onRowClick ? 'cursor-pointer' : ''}
              style={{ borderColor: 'var(--border)' }}
            >
              {columnas.map((c) => (
                <td
                  key={c.key}
                  className={`border-b px-3 py-2 align-top ${c.align === 'right' ? 'text-right tnum' : ''} ${c.nowrap ? 'whitespace-nowrap' : ''}`}
                  style={{ borderColor: 'var(--border)' }}
                >
                  {c.render ? c.render(f) : f[c.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Modal({ abierto, onClose, titulo, children, ancho = 'max-w-lg' }) {
  useEffect(() => {
    if (!abierto) return;
    const onKey = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [abierto, onClose]);

  if (!abierto) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4"
      style={{ background: 'rgba(0,0,0,0.5)' }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={titulo}
    >
      <div
        className={`w-full ${ancho} max-h-[92vh] overflow-y-auto rounded-t-2xl border p-5 sm:rounded-2xl`}
        style={{ background: 'var(--surface-1)', borderColor: 'var(--border)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-base font-semibold">{titulo}</h3>
          <button onClick={onClose} aria-label="Cerrar" className="rounded p-1 text-xl leading-none"
                  style={{ color: 'var(--text-secondary)' }}>×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

export const Cargando = ({ texto = 'Cargando…' }) => (
  <div className="flex items-center justify-center gap-2 py-16 text-sm" style={{ color: 'var(--text-muted)' }}>
    <span className="h-3 w-3 animate-pulse rounded-full" style={{ background: 'var(--series-1)' }} />
    {texto}
  </div>
);

export const Aviso = ({ tono = 'warning', children }) => {
  const c = tono === 'critical' ? 'var(--critical)' : tono === 'good' ? 'var(--good)' : 'var(--serious)';
  return (
    <div className="flex gap-2.5 rounded-lg border p-3 text-sm"
         style={{ borderColor: 'var(--border)', background: 'var(--surface-1)' }}>
      <span className="mt-0.5 h-2 w-2 shrink-0 rounded-full" style={{ background: c }} aria-hidden="true" />
      <div style={{ color: 'var(--text-secondary)' }}>{children}</div>
    </div>
  );
};

export function Progreso({ valor, tono }) {
  const w = valor === null || valor === undefined || isNaN(valor) ? 0 : Math.min(100, Math.max(0, valor));
  const color = tono === 'critical' ? 'var(--critical)' : tono === 'warning' ? 'var(--serious)' : 'var(--series-1)';
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full" style={{ background: 'var(--grid)' }} aria-hidden="true">
      <div className="h-full rounded-full" style={{ width: `${w}%`, background: color }} />
    </div>
  );
}

export function FiltroChips({ opciones, valor, onChange, todasLabel = 'Todas' }) {
  const total = opciones.reduce((a, o) => a + o.count, 0);
  const visibles = opciones.filter((o) => o.count > 0);
  return (
    <div className="-mx-1 flex flex-wrap gap-1.5 px-1">
      <Chip active={valor === ''} onClick={() => onChange('')} label={todasLabel} count={total} />
      {visibles.map((o) => (
        <Chip key={o.value} active={valor === o.value} onClick={() => onChange(o.value)}
              label={o.label} count={o.count} />
      ))}
    </div>
  );
}

function Chip({ active, onClick, label, count }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className="flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition"
      style={active
        ? { background: 'var(--series-1)', borderColor: 'var(--series-1)', color: '#fff' }
        : { background: 'var(--plane)', borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
    >
      {label}
      <span className="tnum" style={{ opacity: active ? 0.85 : 0.65 }}>{count}</span>
    </button>
  );
}

export const ArchivoInput = ({ onChange, className = '', ...props }) => (
  <input
    type="file"
    onChange={(e) => onChange(e.target.files?.[0] ?? null)}
    className={`block w-full text-sm file:mr-3 file:cursor-pointer file:rounded-lg file:border-0 file:bg-[var(--series-1)] file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-white ${className}`}
    style={{ color: 'var(--text-secondary)' }}
    {...props}
  />
);
