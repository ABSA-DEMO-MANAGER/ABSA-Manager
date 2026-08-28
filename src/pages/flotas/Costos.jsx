import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useFlotaPerfil } from '../../lib/useFlotaPerfil';
import { money, fechaCorta } from '../../lib/format';
import {
  Card, Tabla, Select, Cargando, Aviso, Badge, Boton, Modal, Campo, Input, Textarea,
} from '../../components/ui';

const GASTO_CATS = ['Mantenimiento', 'Reparación', 'Gasolina', 'Tag', 'Multa', 'Siniestro', 'Administrativo'];
const MANT_CATS = ['Mantenimiento', 'Reparación']; // afectan el presupuesto (si no son caja chica)
const DESG = [
  ['Mantenimiento', ['Mantenimiento']], ['Reparación', ['Reparación']], ['Gasolina', ['Gasolina']],
  ['Tag', ['Tag']], ['Multa', ['Multa']], ['Siniestro', ['Siniestro']], ['Administrativo', ['Administrativo']],
];

const mesActual = () => new Date().toISOString().slice(0, 7);
const fMes = (m) => {
  if (!m) return '—';
  const [a, mm] = m.split('-');
  return new Date(+a, +mm - 1, 1).toLocaleDateString('es-MX', { month: 'long', year: 'numeric' });
};

const FORM_VACIO = { vehiculo_id: '', categoria: 'Mantenimiento', monto: '', fecha: new Date().toISOString().slice(0, 10), descripcion: '', caja_chica: false };

export default function Costos() {
  const { flotaPerfil, esFlotaAdmin } = useFlotaPerfil();
  const [d, setD] = useState(null);
  const [error, setError] = useState(null);
  const [mes, setMes] = useState(mesActual());
  const [fVeh, setFVeh] = useState('');
  const [fCond, setFCond] = useState('');

  const [modal, setModal] = useState(false);
  const [form, setForm] = useState(FORM_VACIO);
  const [guardando, setGuardando] = useState(false);
  const [formError, setFormError] = useState(null);

  const [presuModal, setPresuModal] = useState(false);
  const [presuForm, setPresuForm] = useState({ presupuesto_mensual: '', caja_chica: '' });

  async function cargar() {
    const [g, v, p] = await Promise.all([
      supabase.from('flota_gastos')
        .select('id, vehiculo_id, categoria, monto, litros, fecha, mes, descripcion, caja_chica, estatus, origen, registrado_por, creado_en')
        .order('creado_en', { ascending: false }),
      supabase.from('flota_vehiculos').select('id, codigo, marca, modelo, placas, conductor_nombre').order('codigo'),
      supabase.from('flota_presupuesto').select('presupuesto_mensual, caja_chica').maybeSingle(),
    ]);
    const err = g.error || v.error || p.error;
    if (err) { setError(err.message); return; }
    setD({ gastos: g.data, vehiculos: v.data, presupuesto: p.data ?? { presupuesto_mensual: 0, caja_chica: 0 } });
  }
  useEffect(() => { cargar(); }, []);

  const vehById = useMemo(() => Object.fromEntries((d?.vehiculos ?? []).map((v) => [v.id, v])), [d]);
  const nombreVeh = (v) => v ? [v.codigo, [v.marca, v.modelo].filter(Boolean).join(' ')].filter(Boolean).join(' — ') : '—';
  const conductores = useMemo(
    () => [...new Set((d?.vehiculos ?? []).map((v) => v.conductor_nombre).filter(Boolean))].sort(),
    [d],
  );

  const gastosMes = useMemo(() => (d?.gastos ?? []).filter((g) => g.estatus === 'aprobado' && g.mes === mes), [d, mes]);
  const pendientes = useMemo(() => (d?.gastos ?? []).filter((g) => g.estatus === 'por_aprobar'), [d]);

  const presu = d?.presupuesto ?? { presupuesto_mensual: 0, caja_chica: 0 };
  const mantNoCaja = gastosMes.filter((g) => MANT_CATS.includes(g.categoria) && !g.caja_chica).reduce((a, g) => a + Number(g.monto), 0);
  const restP = Number(presu.presupuesto_mensual) - mantNoCaja;
  const cajaG = gastosMes.filter((g) => g.caja_chica);
  const cajaUsada = cajaG.reduce((a, g) => a + Number(g.monto), 0);
  const restC = Number(presu.caja_chica) - cajaUsada;

  let vehs = d?.vehiculos ?? [];
  if (fVeh) vehs = vehs.filter((v) => String(v.id) === fVeh);
  if (fCond) vehs = vehs.filter((v) => v.conductor_nombre === fCond);
  const filas = vehs.map((v) => {
    const gv = gastosMes.filter((g) => g.vehiculo_id === v.id);
    const cols = DESG.map(([, cats]) => gv.filter((g) => cats.includes(g.categoria)).reduce((a, g) => a + Number(g.monto), 0));
    const tot = cols.reduce((a, x) => a + x, 0);
    return { v, cols, tot };
  }).sort((a, b) => b.tot - a.tot);
  const totCols = DESG.map((_, i) => filas.reduce((a, f) => a + f.cols[i], 0));
  const granTot = totCols.reduce((a, x) => a + x, 0);
  const celda = (n) => n ? <span className="tnum">{money(n)}</span> : <span style={{ color: 'var(--text-muted)' }}>—</span>;

  function abrirNuevo() {
    const vehiculo_id = !esFlotaAdmin && flotaPerfil?.vehiculo_asignado_id ? String(flotaPerfil.vehiculo_asignado_id) : '';
    setForm({ ...FORM_VACIO, vehiculo_id });
    setFormError(null); setModal(true);
  }

  async function guardar(e) {
    e.preventDefault();
    setFormError(null);
    if (!form.vehiculo_id) return setFormError('Selecciona la unidad.');
    const monto = Number(form.monto);
    if (!monto || monto <= 0) return setFormError('Escribe el monto.');

    setGuardando(true);
    const { error: err } = await supabase.from('flota_gastos').insert({
      vehiculo_id: Number(form.vehiculo_id),
      categoria: form.categoria,
      monto,
      fecha: form.fecha,
      descripcion: form.descripcion.trim() || null,
      caja_chica: esFlotaAdmin ? form.caja_chica : false,
      estatus: esFlotaAdmin ? 'aprobado' : 'por_aprobar',
      registrado_por: flotaPerfil.perfil_id,
    });
    setGuardando(false);
    if (err) return setFormError(err.message);
    setModal(false); cargar();
  }

  async function resolver(id, ok) {
    const { error: err } = await supabase.from('flota_gastos').update({ estatus: ok ? 'aprobado' : 'rechazado' }).eq('id', id);
    if (err) { alert(err.message); return; }
    cargar();
  }

  function abrirPresupuesto() {
    setPresuForm({ presupuesto_mensual: String(presu.presupuesto_mensual ?? ''), caja_chica: String(presu.caja_chica ?? '') });
    setPresuModal(true);
  }
  async function guardarPresupuesto(e) {
    e.preventDefault();
    const { error: err } = await supabase.from('flota_presupuesto').update({
      presupuesto_mensual: Number(presuForm.presupuesto_mensual) || 0,
      caja_chica: Number(presuForm.caja_chica) || 0,
    }).eq('id', true);
    if (err) { alert(err.message); return; }
    setPresuModal(false); cargar();
  }

  if (error) return <Aviso tono="critical">No se pudieron cargar los costos: {error}</Aviso>;
  if (!d) return <Cargando />;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Costos</h1>
          <p className="mt-0.5 text-sm" style={{ color: 'var(--text-secondary)' }}>
            {esFlotaAdmin ? 'Costo de operación por unidad y categoría, con presupuesto y caja chica.' : 'Costos de las unidades de flota.'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Input type="month" value={mes} onChange={(e) => setMes(e.target.value)} className="!w-auto" />
          {esFlotaAdmin && <Boton variant="ghost" onClick={abrirPresupuesto}>Editar presupuesto</Boton>}
          <Boton onClick={abrirNuevo}>+ Registrar gasto</Boton>
        </div>
      </div>

      {esFlotaAdmin && (
        <div className="grid gap-3 sm:grid-cols-2">
          <Card title="Presupuesto mensual" subtitle={`Mantenimiento y reparaciones · ${fMes(mes)}`}>
            <div className="flex items-baseline justify-between">
              <span className="text-2xl font-semibold tracking-tight" style={restP < 0 ? { color: 'var(--critical)' } : undefined}>{money(Math.round(restP))}</span>
              <span className="text-xs" style={{ color: 'var(--text-muted)' }}>restante de {money(presu.presupuesto_mensual)}</span>
            </div>
            <div className="mt-1 text-xs" style={{ color: 'var(--text-muted)' }}>gastado {money(Math.round(mantNoCaja))}</div>
            <Barra val={mantNoCaja} tot={presu.presupuesto_mensual} critico={restP < 0} />
            {Number(presu.presupuesto_mensual) === 0 && (
              <p className="mt-2 text-xs" style={{ color: 'var(--serious)' }}>Aún no defines el presupuesto. Usa "Editar presupuesto".</p>
            )}
          </Card>
          <Card title="Caja chica" subtitle={`Gastos marcados como caja chica · ${fMes(mes)}`}>
            <div className="flex items-baseline justify-between">
              <span className="text-2xl font-semibold tracking-tight" style={restC < 0 ? { color: 'var(--critical)' } : undefined}>{money(Math.round(restC))}</span>
              <span className="text-xs" style={{ color: 'var(--text-muted)' }}>restante de {money(presu.caja_chica)}</span>
            </div>
            <div className="mt-1 text-xs" style={{ color: 'var(--text-muted)' }}>usado {money(Math.round(cajaUsada))}</div>
            <Barra val={cajaUsada} tot={presu.caja_chica} critico={restC < 0} color="var(--series-3)" />
            {cajaG.length > 0 && (
              <div className="mt-3 space-y-1 border-t pt-2" style={{ borderColor: 'var(--border)' }}>
                {cajaG.slice(0, 5).map((g) => (
                  <div key={g.id} className="flex items-center justify-between gap-2 text-xs">
                    <span style={{ color: 'var(--text-secondary)' }}>{g.categoria} · {vehById[g.vehiculo_id]?.codigo ?? '—'}</span>
                    <span className="tnum">{money(g.monto)}</span>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      )}

      {esFlotaAdmin && pendientes.length > 0 && (
        <Card title={`Gastos por aprobar · ${pendientes.length}`}>
          <Tabla
            columnas={[
              { key: 'veh', header: 'Unidad', render: (g) => nombreVeh(vehById[g.vehiculo_id]) },
              { key: 'categoria', header: 'Categoría', nowrap: true },
              { key: 'fecha', header: 'Fecha', nowrap: true, render: (g) => fechaCorta(g.fecha) },
              { key: 'descripcion', header: 'Descripción', render: (g) => g.descripcion || '—' },
              { key: 'monto', header: 'Monto', align: 'right', render: (g) => money(g.monto) },
              { key: 'acciones', header: '', nowrap: true, render: (g) => (
                  <div className="flex justify-end gap-1.5">
                    <Boton variant="ghost" className="!py-1 !px-2 !text-xs" onClick={() => resolver(g.id, true)}>Aprobar</Boton>
                    <Boton variant="danger" className="!py-1 !px-2 !text-xs" onClick={() => resolver(g.id, false)}>Rechazar</Boton>
                  </div>
                ) },
            ]}
            filas={pendientes}
          />
        </Card>
      )}

      <div className="flex flex-wrap gap-2">
        <Select value={fVeh} onChange={(e) => setFVeh(e.target.value)} className="!w-auto">
          <option value="">Todas las unidades</option>
          {(d.vehiculos ?? []).map((v) => <option key={v.id} value={v.id}>{nombreVeh(v)}</option>)}
        </Select>
        <Select value={fCond} onChange={(e) => setFCond(e.target.value)} className="!w-auto">
          <option value="">Todos los conductores</option>
          {conductores.map((c) => <option key={c} value={c}>{c}</option>)}
        </Select>
      </div>

      <Card title="Desglose por unidad" subtitle={fMes(mes)}>
        {granTot > 0 ? (
          <Tabla
            columnas={[
              { key: 'veh', header: 'Unidad', render: (f) => (
                  <div>
                    <div className="font-medium">{nombreVeh(f.v)}</div>
                    <div className="tnum text-xs" style={{ color: 'var(--text-muted)' }}>{f.v.placas || f.v.codigo}{f.v.conductor_nombre ? ` · ${f.v.conductor_nombre}` : ''}</div>
                  </div>
                ) },
              ...DESG.map(([label], i) => ({ key: label, header: label, align: 'right', render: (f) => celda(f.cols[i]) })),
              { key: 'tot', header: 'Total', align: 'right', render: (f) => <strong className="tnum">{money(f.tot)}</strong> },
            ]}
            filas={filas}
          />
        ) : (
          <p className="py-8 text-center text-sm" style={{ color: 'var(--text-muted)' }}>
            Sin gastos en este periodo. Registra o importa gastos (servicios, gasolina, tags, multas, siniestros…) y aquí verás el desglose por unidad.
          </p>
        )}
        {granTot > 0 && (
          <div className="mt-3 flex items-center justify-between border-t pt-2 text-sm font-semibold" style={{ borderColor: 'var(--border)' }}>
            <span>Total flota</span>
            <span className="tnum">{money(granTot)}</span>
          </div>
        )}
      </Card>

      {/* ---------------- Registrar gasto ---------------- */}
      <Modal abierto={modal} onClose={() => setModal(false)} titulo={esFlotaAdmin ? 'Registrar gasto' : 'Registrar gasto (por aprobar)'}>
        <form onSubmit={guardar} className="space-y-3">
          <Campo label="Unidad" required>
            {esFlotaAdmin ? (
              <Select value={form.vehiculo_id} required onChange={(e) => setForm({ ...form, vehiculo_id: e.target.value })}>
                <option value="">Selecciona…</option>
                {(d.vehiculos ?? []).map((v) => <option key={v.id} value={v.id}>{nombreVeh(v)}</option>)}
              </Select>
            ) : (
              <div className="rounded-lg border px-3 py-2 text-sm" style={{ borderColor: 'var(--border)', background: 'var(--plane)' }}>
                {vehById[form.vehiculo_id] ? nombreVeh(vehById[form.vehiculo_id]) : 'No tienes una unidad asignada — pide a un administrador que te asigne una.'}
              </div>
            )}
          </Campo>
          <div className="grid grid-cols-2 gap-3">
            <Campo label="Categoría">
              <Select value={form.categoria} onChange={(e) => setForm({ ...form, categoria: e.target.value })}>
                {GASTO_CATS.map((c) => <option key={c} value={c}>{c}</option>)}
              </Select>
            </Campo>
            <Campo label="Monto (MXN)" required>
              <Input type="number" min="0" step="0.01" value={form.monto} required onChange={(e) => setForm({ ...form, monto: e.target.value })} />
            </Campo>
          </div>
          <Campo label="Fecha">
            <Input type="date" value={form.fecha} onChange={(e) => setForm({ ...form, fecha: e.target.value })} />
          </Campo>
          <Campo label="Descripción">
            <Textarea rows={2} value={form.descripcion} onChange={(e) => setForm({ ...form, descripcion: e.target.value })} />
          </Campo>
          {esFlotaAdmin ? (
            <label className="flex items-center gap-2 text-xs" style={{ color: 'var(--text-secondary)' }}>
              <input type="checkbox" checked={form.caja_chica} onChange={(e) => setForm({ ...form, caja_chica: e.target.checked })} />
              Pagado con caja chica (fondo aparte)
            </label>
          ) : (
            <p className="text-xs" style={{ color: 'var(--serious)' }}>Quedará <strong>por aprobar</strong> hasta que un administrador lo revise.</p>
          )}
          {formError && <Aviso tono="critical">{formError}</Aviso>}
          <div className="flex justify-end gap-2 pt-1">
            <Boton type="button" variant="ghost" onClick={() => setModal(false)}>Cancelar</Boton>
            <Boton type="submit" disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar'}</Boton>
          </div>
        </form>
      </Modal>

      {/* ---------------- Editar presupuesto ---------------- */}
      <Modal abierto={presuModal} onClose={() => setPresuModal(false)} titulo="Presupuesto">
        <form onSubmit={guardarPresupuesto} className="space-y-3">
          <Campo label="Presupuesto mensual (MXN)" hint="Mantenimiento y reparaciones">
            <Input type="number" min="0" step="0.01" placeholder="35000" value={presuForm.presupuesto_mensual}
                   onChange={(e) => setPresuForm({ ...presuForm, presupuesto_mensual: e.target.value })} />
          </Campo>
          <Campo label="Caja chica (MXN)">
            <Input type="number" min="0" step="0.01" placeholder="5000" value={presuForm.caja_chica}
                   onChange={(e) => setPresuForm({ ...presuForm, caja_chica: e.target.value })} />
          </Campo>
          <div className="flex justify-end gap-2 pt-1">
            <Boton type="button" variant="ghost" onClick={() => setPresuModal(false)}>Cancelar</Boton>
            <Boton type="submit">Guardar</Boton>
          </div>
        </form>
      </Modal>
    </div>
  );
}

function Barra({ val, tot, critico, color = 'var(--series-1)' }) {
  const pct = tot > 0 ? Math.min(100, Math.round((val / tot) * 100)) : 0;
  return (
    <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full" style={{ background: 'var(--grid)' }} aria-hidden="true">
      <div className="h-full rounded-full" style={{ width: `${pct}%`, background: critico ? 'var(--critical)' : color }} />
    </div>
  );
}
