import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useFlotaPerfil } from '../../lib/useFlotaPerfil';
import { money, fechaCorta } from '../../lib/format';
import { Card, Tabla, Cargando, Aviso, Badge, Boton, Modal, Campo, Input } from '../../components/ui';

const mesActual = () => new Date().toISOString().slice(0, 7);
const fMes = (m) => {
  if (!m) return '—';
  const [a, mm] = m.split('-');
  return new Date(+a, +mm - 1, 1).toLocaleDateString('es-MX', { month: 'long', year: 'numeric' });
};
const normPlacas = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const fuelCat = (p) => /caset|peaje|tag|autopist/i.test(p || '') ? 'Tag' : 'Gasolina';
const parseNum = (v) => { const n = parseFloat(String(v ?? '').replace(/[$,\s]/g, '')); return isNaN(n) ? 0 : n; };
const fuelRef = (o) => String(o.folio || '').trim() || `${o.fecha || ''}|${normPlacas(o.placas)}|${parseNum(o.importe)}`;

const FUEL_COLS = ['fecha', 'placas', 'producto', 'litros', 'importe', 'estacion', 'folio'];
const FUEL_EJEMPLO = ['2026-08-03', 'JAB-12-34', 'Gasolina Magna', '38.5', '1120.50', 'Pemex Av. Vallarta', 'A123456'];

function parseCSV(texto) {
  const filas = []; let fila = [], cur = '', comillas = false;
  const t = texto.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (comillas) {
      if (c === '"') { if (t[i + 1] === '"') { cur += '"'; i++; } else comillas = false; }
      else cur += c;
    } else if (c === '"') comillas = true;
    else if (c === ',') { fila.push(cur); cur = ''; }
    else if (c === '\n') { fila.push(cur); filas.push(fila); fila = []; cur = ''; }
    else cur += c;
  }
  if (cur !== '' || fila.length) { fila.push(cur); filas.push(fila); }
  return filas.filter((f) => f.some((v) => String(v).trim() !== ''));
}

function descargarPlantillaFuel() {
  const csv = [FUEL_COLS, FUEL_EJEMPLO].map((f) => f.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'plantilla_combustible.csv';
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export default function Combustible() {
  const { flotaPerfil, esFlotaAdmin } = useFlotaPerfil();
  const [d, setD] = useState(null);
  const [error, setError] = useState(null);
  const [mes, setMes] = useState(mesActual());

  const [cajonModal, setCajonModal] = useState(null); // vehiculo
  const [cajonForm, setCajonForm] = useState({ cajon_pesos: '', cajon_litros: '' });

  const [extraModal, setExtraModal] = useState(null); // vehiculo
  const [extraForm, setExtraForm] = useState({ litros: '', monto: '', fecha: new Date().toISOString().slice(0, 10), ref: '', pendiente: false });

  const [tagModal, setTagModal] = useState(null); // vehiculo
  const [tagForm, setTagForm] = useState({ monto: '', fecha: new Date().toISOString().slice(0, 10), ref: '' });

  const [filas, setFilas] = useState(null); // preview CSV
  const [importando, setImportando] = useState(false);

  async function cargar() {
    const [v, g] = await Promise.all([
      supabase.from('flota_vehiculos').select('id, codigo, marca, modelo, placas, cajon_pesos, cajon_litros').order('codigo'),
      supabase.from('flota_gastos')
        .select('id, vehiculo_id, categoria, monto, litros, fecha, mes, descripcion, estatus, origen, referencia')
        .in('categoria', ['Gasolina', 'Tag']),
    ]);
    const err = v.error || g.error;
    if (err) { setError(err.message); return; }
    setD({ vehiculos: v.data, gastos: g.data });
  }
  useEffect(() => { cargar(); }, []);

  const consumo = useMemo(() => {
    const by = {};
    const get = (id) => by[id] || (by[id] = { gasP: 0, gasL: 0, exP: 0, tagP: 0 });
    (d?.gastos ?? []).forEach((g) => {
      if (g.estatus !== 'aprobado' || g.mes !== mes) return;
      if (g.categoria === 'Gasolina') {
        const o = get(g.vehiculo_id);
        o.gasP += Number(g.monto); o.gasL += Number(g.litros || 0);
        if (g.origen === 'extra') o.exP += Number(g.monto);
      } else if (g.categoria === 'Tag') {
        get(g.vehiculo_id).tagP += Number(g.monto);
      }
    });
    return by;
  }, [d, mes]);

  const pendientes = useMemo(
    () => (d?.gastos ?? []).filter((g) => g.categoria === 'Gasolina' && g.origen === 'extra' && g.estatus === 'por_aprobar'),
    [d],
  );

  const vehById = useMemo(() => Object.fromEntries((d?.vehiculos ?? []).map((v) => [v.id, v])), [d]);
  const nombreVeh = (v) => v ? [v.codigo, [v.marca, v.modelo].filter(Boolean).join(' ')].filter(Boolean).join(' — ') : '—';

  const tCajon = (d?.vehiculos ?? []).reduce((a, v) => a + Number(v.cajon_pesos || 0), 0);
  const tGas = Object.values(consumo).reduce((a, o) => a + o.gasP, 0);
  const tEx = Object.values(consumo).reduce((a, o) => a + o.exP, 0);
  const tTag = Object.values(consumo).reduce((a, o) => a + o.tagP, 0);

  async function resolver(id, ok) {
    const { error: err } = await supabase.from('flota_gastos').update({ estatus: ok ? 'aprobado' : 'rechazado' }).eq('id', id);
    if (err) { alert(err.message); return; }
    cargar();
  }

  function abrirCajon(v) { setCajonForm({ cajon_pesos: String(v.cajon_pesos ?? ''), cajon_litros: String(v.cajon_litros ?? '') }); setCajonModal(v); }
  async function guardarCajon(e) {
    e.preventDefault();
    const { error: err } = await supabase.from('flota_vehiculos').update({
      cajon_pesos: Number(cajonForm.cajon_pesos) || 0, cajon_litros: Number(cajonForm.cajon_litros) || 0,
    }).eq('id', cajonModal.id);
    if (err) { alert(err.message); return; }
    setCajonModal(null); cargar();
  }

  function abrirExtra(v) { setExtraForm({ litros: '', monto: '', fecha: new Date().toISOString().slice(0, 10), ref: '', pendiente: false }); setExtraModal(v); }
  async function guardarExtra(e) {
    e.preventDefault();
    const monto = Number(extraForm.monto);
    if (!monto || monto <= 0) { alert('Escribe el monto'); return; }
    const { error: err } = await supabase.from('flota_gastos').insert({
      vehiculo_id: extraModal.id, categoria: 'Gasolina', monto, litros: Number(extraForm.litros) || null,
      fecha: extraForm.fecha, mes: extraForm.fecha.slice(0, 7),
      descripcion: ['Carga extra', extraForm.ref].filter(Boolean).join(' · '),
      estatus: extraForm.pendiente ? 'por_aprobar' : 'aprobado', origen: 'extra', registrado_por: flotaPerfil.perfil_id,
    });
    if (err) { alert(err.message); return; }
    setExtraModal(null); cargar();
  }

  function abrirTag(v) { setTagForm({ monto: '', fecha: new Date().toISOString().slice(0, 10), ref: '' }); setTagModal(v); }
  async function guardarTag(e) {
    e.preventDefault();
    const monto = Number(tagForm.monto);
    if (!monto || monto <= 0) { alert('Escribe el monto'); return; }
    const { error: err } = await supabase.from('flota_gastos').insert({
      vehiculo_id: tagModal.id, categoria: 'Tag', monto, fecha: tagForm.fecha, mes: tagForm.fecha.slice(0, 7),
      descripcion: ['Tags', tagForm.ref].filter(Boolean).join(' · '), estatus: 'aprobado', origen: 'tag',
      registrado_por: flotaPerfil.perfil_id,
    });
    if (err) { alert(err.message); return; }
    setTagModal(null); cargar();
  }

  function onArchivo(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const grid = parseCSV(String(reader.result));
      if (grid.length < 2) { alert('El archivo no tiene datos'); return; }
      const encabezado = grid[0].map((h) => h.trim().toLowerCase());
      const yaImport = new Set((d?.gastos ?? []).filter((g) => g.origen === 'combustible').map((g) => g.referencia));
      const filasParse = grid.slice(1).map((fila) => {
        const o = {};
        encabezado.forEach((col, i) => { o[col] = fila[i]; });
        const v = (d?.vehiculos ?? []).find((x) => normPlacas(x.placas) === normPlacas(o.placas));
        const ref = fuelRef(o);
        return {
          o, v, ref, dup: yaImport.has(ref),
          fecha: (o.fecha || '').trim(), cat: fuelCat(o.producto),
          importe: parseNum(o.importe), litros: parseNum(o.litros),
        };
      });
      setFilas(filasParse);
    };
    reader.readAsText(file, 'utf-8');
    e.target.value = '';
  }

  async function confirmarImportacion() {
    const listas = filas.filter((r) => r.v && !r.dup && r.importe > 0);
    if (!listas.length) return;
    setImportando(true);
    let okN = 0;
    for (const r of listas) {
      const fecha = r.fecha || new Date().toISOString().slice(0, 10);
      const { error: err } = await supabase.from('flota_gastos').insert({
        vehiculo_id: r.v.id, categoria: r.cat, monto: Math.round(r.importe), litros: r.litros || null,
        fecha, mes: fecha.slice(0, 7),
        descripcion: [r.o.producto, r.o.estacion, r.litros ? `${r.litros} L` : ''].filter(Boolean).join(' · '),
        estatus: 'aprobado', origen: 'combustible', referencia: r.ref, registrado_por: flotaPerfil.perfil_id,
      });
      if (!err) okN++;
    }
    setImportando(false);
    setFilas(null);
    alert(`${okN} carga(s) importadas.`);
    cargar();
  }

  if (!esFlotaAdmin) return <Aviso tono="critical">Solo un administrador de Flotas puede ver Combustible.</Aviso>;
  if (error) return <Aviso tono="critical">No se pudo cargar Combustible: {error}</Aviso>;
  if (!d) return <Cargando />;

  const sinUnidad = filas ? filas.filter((r) => !r.v).length : 0;
  const dups = filas ? filas.filter((r) => r.dup).length : 0;
  const listas = filas ? filas.filter((r) => r.v && !r.dup && r.importe > 0) : [];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Combustible</h1>
          <p className="mt-0.5 max-w-2xl text-sm" style={{ color: 'var(--text-secondary)' }}>
            Define el <strong>cajón</strong> (carga semanal fija) por unidad. Las cargas extra y los tags se registran aparte.
            Todo es operación — no descuenta del presupuesto.
          </p>
        </div>
        <Input type="month" value={mes} onChange={(e) => setMes(e.target.value)} className="!w-auto" />
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Tarjeta label="Cajón semanal (total)" valor={money(Math.round(tCajon))} sub={`× 4 ≈ ${money(Math.round(tCajon * 4))} /mes`} />
        <Tarjeta label="Gasolina consumida · mes" valor={money(Math.round(tGas))} />
        <Tarjeta label="Cargas extra · mes" valor={money(Math.round(tEx))} tono={tEx ? 'warning' : undefined} />
        <Tarjeta label="Tags · mes" valor={money(Math.round(tTag))} />
      </div>

      <Card title="Importar cargas de combustible"
            subtitle="Exporta el consumo de tu proveedor (Sodexo u otro) a CSV con estas columnas. Cada renglón se enlaza a la unidad por placas y se registra como gasto aprobado. No se duplican cargas ya importadas (por folio).">
        <div className="flex flex-wrap gap-2">
          <Boton variant="ghost" onClick={descargarPlantillaFuel}>Descargar plantilla CSV</Boton>
          <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-white" style={{ background: 'var(--series-1)' }}>
            Elegir archivo CSV
            <input type="file" accept=".csv,text/csv" className="hidden" onChange={onArchivo} />
          </label>
        </div>

        {filas && (
          <div className="mt-4 space-y-2">
            <div className="flex flex-wrap items-center gap-2 text-xs" style={{ color: 'var(--text-secondary)' }}>
              <span>{listas.length} listas · {sinUnidad} sin unidad · {dups} ya importadas · Total {money(Math.round(listas.reduce((a, r) => a + r.importe, 0)))}</span>
              <div className="flex-1" />
              <Boton disabled={!listas.length || importando} onClick={confirmarImportacion}>
                {importando ? 'Importando…' : `Importar ${listas.length} carga${listas.length !== 1 ? 's' : ''}`}
              </Boton>
            </div>
            {sinUnidad > 0 && (
              <Aviso>Las cargas "sin unidad" no coincidieron por placas. Revisa que las placas del CSV estén igual que en las unidades (se ignoran guiones y espacios).</Aviso>
            )}
            <Tabla
              columnas={[
                { key: 'fecha', header: 'Fecha', nowrap: true, render: (r) => r.fecha || '—' },
                { key: 'placas', header: 'Placas', nowrap: true, render: (r) => r.o.placas || '—' },
                { key: 'unidad', header: 'Unidad', render: (r) => r.v ? nombreVeh(r.v) : <span style={{ color: 'var(--critical)' }}>— sin unidad —</span> },
                { key: 'cat', header: 'Categoría', nowrap: true },
                { key: 'importe', header: 'Importe', align: 'right', render: (r) => money(Math.round(r.importe)) },
                { key: 'estado', header: '', nowrap: true, render: (r) =>
                    r.dup ? <Badge>Ya importada</Badge>
                    : !r.v ? <Badge color="var(--critical)">Sin match</Badge>
                    : r.importe > 0 ? <Badge color="var(--good)">Lista</Badge> : <Badge color="var(--serious)">Sin importe</Badge> },
              ]}
              filas={filas.slice(0, 30)}
            />
            {filas.length > 30 && <p className="text-xs" style={{ color: 'var(--text-muted)' }}>…y {filas.length - 30} más</p>}
          </div>
        )}
      </Card>

      {pendientes.length > 0 && (
        <Card title={`Solicitudes de carga extra por aprobar · ${pendientes.length}`}>
          <Tabla
            columnas={[
              { key: 'veh', header: 'Unidad', render: (g) => nombreVeh(vehById[g.vehiculo_id]) },
              { key: 'descripcion', header: 'Descripción', render: (g) => g.descripcion || 'Carga extra' },
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

      <Card title="Por unidad" subtitle={fMes(mes)}>
        <Tabla
          vacio="No hay unidades todavía."
          columnas={[
            { key: 'veh', header: 'Unidad', render: (v) => (
                <div>
                  <div className="font-medium">{nombreVeh(v)}</div>
                  <div className="tnum text-xs" style={{ color: 'var(--text-muted)' }}>{v.placas || v.codigo}</div>
                </div>
              ) },
            { key: 'cajon', header: 'Cajón semanal', render: (v) => (
                <span className="tnum text-sm">{money(v.cajon_pesos)}{v.cajon_litros ? ` · ${v.cajon_litros} L` : ''}</span>
              ) },
            { key: 'consumo', header: 'Consumo mes', render: (v) => {
                const c = consumo[v.id] || { gasP: 0, gasL: 0 };
                return <span className="tnum text-sm">{money(Math.round(c.gasP))}{c.gasL ? ` · ${Math.round(c.gasL)} L` : ''}</span>;
              } },
            { key: 'extra', header: 'Extras mes', render: (v) => {
                const c = consumo[v.id] || { exP: 0 };
                return c.exP ? <span className="tnum text-sm" style={{ color: 'var(--serious)' }}>{money(Math.round(c.exP))}</span> : <span style={{ color: 'var(--text-muted)' }}>—</span>;
              } },
            { key: 'tag', header: 'Tags mes', render: (v) => {
                const c = consumo[v.id] || { tagP: 0 };
                return c.tagP ? <span className="tnum text-sm">{money(Math.round(c.tagP))}</span> : <span style={{ color: 'var(--text-muted)' }}>—</span>;
              } },
            { key: 'acciones', header: '', nowrap: true, render: (v) => (
                <div className="flex justify-end gap-1.5">
                  <Boton variant="ghost" className="!py-1 !px-2 !text-xs" onClick={() => abrirCajon(v)}>Cajón</Boton>
                  <Boton variant="ghost" className="!py-1 !px-2 !text-xs" onClick={() => abrirExtra(v)}>Carga extra</Boton>
                  <Boton variant="ghost" className="!py-1 !px-2 !text-xs" onClick={() => abrirTag(v)}>Tags</Boton>
                </div>
              ) },
          ]}
          filas={d.vehiculos}
        />
      </Card>

      {/* ---------------- Cajon ---------------- */}
      <Modal abierto={!!cajonModal} onClose={() => setCajonModal(null)} titulo="Cajón · carga semanal">
        {cajonModal && (
          <form onSubmit={guardarCajon} className="space-y-3">
            <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
              Carga fija semanal de gasolina para <strong>{nombreVeh(cajonModal)}</strong>. Es el costo base; las cargas extra van aparte.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Campo label="Pesos por semana">
                <Input type="number" min="0" step="0.01" value={cajonForm.cajon_pesos} onChange={(e) => setCajonForm({ ...cajonForm, cajon_pesos: e.target.value })} />
              </Campo>
              <Campo label="Litros por semana">
                <Input type="number" min="0" step="0.1" value={cajonForm.cajon_litros} onChange={(e) => setCajonForm({ ...cajonForm, cajon_litros: e.target.value })} />
              </Campo>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Boton type="button" variant="ghost" onClick={() => setCajonModal(null)}>Cancelar</Boton>
              <Boton type="submit">Guardar cajón</Boton>
            </div>
          </form>
        )}
      </Modal>

      {/* ---------------- Carga extra ---------------- */}
      <Modal abierto={!!extraModal} onClose={() => setExtraModal(null)} titulo="Carga extra de gasolina">
        {extraModal && (
          <form onSubmit={guardarExtra} className="space-y-3">
            <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>Unidad: <strong>{nombreVeh(extraModal)}</strong></p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Campo label="Litros">
                <Input type="number" min="0" step="0.1" value={extraForm.litros} onChange={(e) => setExtraForm({ ...extraForm, litros: e.target.value })} />
              </Campo>
              <Campo label="Monto (MXN)" required>
                <Input type="number" min="0" step="0.01" value={extraForm.monto} required onChange={(e) => setExtraForm({ ...extraForm, monto: e.target.value })} />
              </Campo>
              <Campo label="Fecha">
                <Input type="date" value={extraForm.fecha} onChange={(e) => setExtraForm({ ...extraForm, fecha: e.target.value })} />
              </Campo>
              <Campo label="Motivo / referencia">
                <Input value={extraForm.ref} onChange={(e) => setExtraForm({ ...extraForm, ref: e.target.value })} />
              </Campo>
            </div>
            <label className="flex items-center gap-2 text-xs" style={{ color: 'var(--text-secondary)' }}>
              <input type="checkbox" checked={extraForm.pendiente} onChange={(e) => setExtraForm({ ...extraForm, pendiente: e.target.checked })} />
              Dejar como solicitud por aprobar (no suma hasta aprobarse)
            </label>
            <div className="flex justify-end gap-2 pt-1">
              <Boton type="button" variant="ghost" onClick={() => setExtraModal(null)}>Cancelar</Boton>
              <Boton type="submit">Registrar</Boton>
            </div>
          </form>
        )}
      </Modal>

      {/* ---------------- Tags ---------------- */}
      <Modal abierto={!!tagModal} onClose={() => setTagModal(null)} titulo="Consumo de tags">
        {tagModal && (
          <form onSubmit={guardarTag} className="space-y-3">
            <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>Unidad: <strong>{nombreVeh(tagModal)}</strong>. Registra cuánto consumió en tags / casetas.</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Campo label="Monto (MXN)" required>
                <Input type="number" min="0" step="0.01" value={tagForm.monto} required onChange={(e) => setTagForm({ ...tagForm, monto: e.target.value })} />
              </Campo>
              <Campo label="Fecha">
                <Input type="date" value={tagForm.fecha} onChange={(e) => setTagForm({ ...tagForm, fecha: e.target.value })} />
              </Campo>
              <div className="col-span-2">
                <Campo label="Referencia / tramo">
                  <Input value={tagForm.ref} onChange={(e) => setTagForm({ ...tagForm, ref: e.target.value })} />
                </Campo>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Boton type="button" variant="ghost" onClick={() => setTagModal(null)}>Cancelar</Boton>
              <Boton type="submit">Registrar</Boton>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}

function Tarjeta({ label, valor, sub, tono }) {
  const color = tono === 'warning' ? 'var(--serious)' : 'var(--text-primary)';
  return (
    <div className="rounded-xl border p-3" style={{ background: 'var(--surface-1)', borderColor: 'var(--border)' }}>
      <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>{label}</div>
      <div className="mt-1 text-lg font-semibold tracking-tight tnum" style={{ color }}>{valor}</div>
      {sub && <div className="mt-0.5 text-xs" style={{ color: 'var(--text-muted)' }}>{sub}</div>}
    </div>
  );
}
