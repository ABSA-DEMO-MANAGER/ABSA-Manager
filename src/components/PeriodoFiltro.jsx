import { useEffect, useState } from 'react';
import { Input, Select } from './ui';
import { hoyISO } from '../lib/format';

const MESES_LARGO = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

function ultimoDiaDelMes(anio, mes) {
  return new Date(anio, mes, 0).getDate();
}

/** Calcula {desde, hasta} para un mes calendario dado. Se exporta para
 *  reutilizarla donde solo se necesita "el mes seleccionado", sin el
 *  control visual completo (ej. edición de presupuesto por mes). */
export function rangoMensual(anio, mes) {
  const mm = String(mes).padStart(2, '0');
  const ultimo = ultimoDiaDelMes(anio, mes);
  return { desde: `${anio}-${mm}-01`, hasta: `${anio}-${mm}-${String(ultimo).padStart(2, '0')}` };
}

/**
 * Selector de periodo: día exacto, mes, año o rango personalizado.
 * Llama a onChange({ modo, desde, hasta, anio, mes }) cada vez que cambia,
 * incluyendo al montarse.
 */
export default function PeriodoFiltro({ onChange, inicial }) {
  const hoy = hoyISO();
  const anioActual = +hoy.slice(0, 4);
  const mesActual = +hoy.slice(5, 7);

  const [modo, setModo] = useState(inicial?.modo ?? 'mes');
  const [dia, setDia] = useState(inicial?.dia ?? hoy);
  const [anio, setAnio] = useState(inicial?.anio ?? anioActual);
  const [mes, setMes] = useState(inicial?.mes ?? mesActual);
  const [desde, setDesde] = useState(inicial?.desde ?? hoy);
  const [hasta, setHasta] = useState(inicial?.hasta ?? hoy);

  useEffect(() => {
    let rango;
    if (modo === 'dia') rango = { desde: dia, hasta: dia };
    else if (modo === 'mes') rango = rangoMensual(anio, mes);
    else if (modo === 'anio') rango = { desde: `${anio}-01-01`, hasta: `${anio}-12-31` };
    else rango = { desde, hasta };
    onChange({ modo, anio, mes, ...rango });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modo, dia, anio, mes, desde, hasta]);

  const anios = Array.from({ length: 6 }, (_, i) => anioActual - 4 + i);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex gap-1 rounded-lg border p-1" style={{ borderColor: 'var(--border)', background: 'var(--plane)' }}>
        {[['dia', 'Día'], ['mes', 'Mes'], ['anio', 'Año'], ['rango', 'Rango']].map(([k, l]) => (
          <button key={k} type="button" onClick={() => setModo(k)}
                  className="rounded-md px-3 py-1.5 text-xs"
                  style={{
                    background: modo === k ? 'var(--surface-1)' : 'transparent',
                    color: modo === k ? 'var(--text-primary)' : 'var(--text-secondary)',
                    fontWeight: modo === k ? 500 : 400,
                  }}>
            {l}
          </button>
        ))}
      </div>

      {modo === 'dia' && (
        <Input type="date" value={dia} onChange={(e) => setDia(e.target.value)} className="!w-auto" />
      )}
      {modo === 'mes' && (
        <>
          <Select value={mes} onChange={(e) => setMes(Number(e.target.value))} className="!w-auto">
            {MESES_LARGO.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
          </Select>
          <Select value={anio} onChange={(e) => setAnio(Number(e.target.value))} className="!w-auto">
            {anios.map((a) => <option key={a} value={a}>{a}</option>)}
          </Select>
        </>
      )}
      {modo === 'anio' && (
        <Select value={anio} onChange={(e) => setAnio(Number(e.target.value))} className="!w-auto">
          {anios.map((a) => <option key={a} value={a}>{a}</option>)}
        </Select>
      )}
      {modo === 'rango' && (
        <>
          <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>Del</span>
          <Input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className="!w-auto" />
          <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>al</span>
          <Input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} className="!w-auto" />
        </>
      )}
    </div>
  );
}
