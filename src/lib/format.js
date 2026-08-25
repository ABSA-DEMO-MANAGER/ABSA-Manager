export const money = (v, decimales = 0) =>
  v === null || v === undefined || isNaN(v)
    ? '—'
    : new Intl.NumberFormat('es-MX', {
        style: 'currency', currency: 'MXN',
        minimumFractionDigits: decimales, maximumFractionDigits: decimales,
      }).format(v);

export const moneyCorto = (v) => {
  if (v === null || v === undefined || isNaN(v)) return '—';
  const abs = Math.abs(v);
  if (abs >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `$${Math.round(v / 1_000)}k`;
  return `$${Math.round(v)}`;
};

export const pct = (v, d = 1) =>
  v === null || v === undefined || isNaN(v) ? '—' : `${v.toFixed(d)}%`;

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun',
               'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

export const mesCorto = (iso) => {
  if (!iso) return '—';
  const [a, m] = iso.split('-');
  return `${MESES[+m - 1]} ${a.slice(2)}`;
};

export const fechaCorta = (iso) => {
  if (!iso) return '—';
  const [a, m, d] = iso.split('-');
  return `${+d} ${MESES[+m - 1]} ${a.slice(2)}`;
};

export const hoyISO = () => new Date().toISOString().slice(0, 10);

export const TIPOS = {
  preventivo:   { label: 'Preventivo',    color: 'var(--series-1)' },
  correctivo:   { label: 'Correctivo',    color: 'var(--series-6)' },
  remodelacion: { label: 'Remodelación',  color: 'var(--series-3)' },
  insumo:       { label: 'Insumo',        color: 'var(--series-2)' },
  viaticos:     { label: 'Viáticos',      color: 'var(--series-5)' },
  otro:         { label: 'Otro',          color: 'var(--series-4)' },
};

export const UNIDADES = {
  compania:   'Compañía',
  caja_chica: 'Caja chica',
  empleado:   'Empleado (reembolso)',
};

export const ESTATUS_PAGO = {
  borrador: 'Borrador',
  a_enviar: 'A enviar',
  aprobado: 'Aprobado',
  pagado:   'Pagado',
};

export const ESTATUS_ORDEN = {
  programada: 'Programada',
  en_proceso: 'En proceso',
  realizada:  'Realizada',
  pospuesta:  'Pospuesta',
  cancelada:  'Cancelada',
};

export const FRECUENCIAS = {
  mensual: 'Mensual', bimestral: 'Bimestral', trimestral: 'Trimestral',
  cuatrimestral: 'Cuatrimestral', semestral: 'Semestral', anual: 'Anual',
  por_definir: 'Por definir',
};

export const CRITICIDAD = {
  A: { label: 'A — crítico', color: 'var(--critical)' },
  B: { label: 'B — importante', color: 'var(--series-3)' },
  C: { label: 'C — menor', color: 'var(--text-muted)' },
};
