import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useLimpiezaPerfil } from '../../lib/useLimpiezaPerfil';
import { Card, Tabla, Boton, Aviso, Badge, Cargando } from '../../components/ui';

const COLUMNAS = [
  'nombre', 'marca', 'descripcion', 'uso', 'categoria', 'unidad_medida',
  'piezas_por_unidad', 'costo_referencia', 'proveedor', 'stock_minimo_default',
];

const FILA_EJEMPLO = [
  'Papel higiénico jumbo', 'Pétalo', 'Rollo jumbo 300m, 2 hojas', 'Baños de clientes y personal',
  'Papel', 'paquete', '12', '185.00', 'Distribuidora Higiene del Bajío', '2',
];

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

function descargarPlantilla() {
  const csv = [COLUMNAS, FILA_EJEMPLO].map((f) => f.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'plantilla_insumos_limpieza.csv';
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

const UNIDADES_VALIDAS = ['pieza', 'litro', 'kg', 'rollo', 'paquete', 'caja', 'garrafón'];

export default function CargaMasiva() {
  const { esLimpiezaAdmin } = useLimpiezaPerfil();
  const [proveedores, setProveedores] = useState(null);
  const [nombresExistentes, setNombresExistentes] = useState(new Set());
  const [error, setError] = useState(null);

  const [filas, setFilas] = useState(null);
  const [importando, setImportando] = useState(false);
  const [resultado, setResultado] = useState(null);

  useEffect(() => {
    (async () => {
      const [p, i] = await Promise.all([
        supabase.from('proveedores').select('id, nombre').order('nombre'),
        supabase.from('limpieza_insumos').select('nombre'),
      ]);
      if (p.error || i.error) { setError((p.error || i.error).message); return; }
      setProveedores(p.data);
      setNombresExistentes(new Set(i.data.map((x) => (x.nombre || '').trim().toLowerCase()).filter(Boolean)));
    })();
  }, []);

  const provPorNombre = useMemo(
    () => Object.fromEntries((proveedores ?? []).map((p) => [p.nombre.trim().toLowerCase(), p.id])),
    [proveedores],
  );

  function num(v) { const n = parseFloat(String(v ?? '').replace(/[$,\s]/g, '')); return isNaN(n) ? null : n; }
  function txt(v) { return String(v ?? '').trim() || null; }

  function onArchivo(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setResultado(null);
    const reader = new FileReader();
    reader.onload = () => {
      const grid = parseCSV(String(reader.result));
      const encabezado = grid[0].map((h) => h.trim().toLowerCase());
      const datos = grid.slice(1).map((fila) => {
        const o = {};
        encabezado.forEach((col, i) => { o[col] = fila[i]; });
        const nombre = txt(o.nombre);
        const provTexto = txt(o.proveedor);
        const unidad = (o.unidad_medida || '').trim().toLowerCase();
        return {
          _duplicado: nombre && nombresExistentes.has(nombre.toLowerCase()),
          _proveedorId: provTexto ? provPorNombre[provTexto.toLowerCase()] ?? null : null,
          _proveedorTexto: provTexto,
          nombre, marca: txt(o.marca), descripcion: txt(o.descripcion), uso: txt(o.uso),
          categoria: txt(o.categoria), unidad_medida: UNIDADES_VALIDAS.includes(unidad) ? unidad : 'pieza',
          piezas_por_unidad: num(o.piezas_por_unidad), costo_referencia: num(o.costo_referencia),
          stock_minimo_default: num(o.stock_minimo_default) ?? 0,
        };
      });
      setFilas(datos);
    };
    reader.readAsText(file, 'utf-8');
  }

  async function importar() {
    setImportando(true);
    let creadas = 0, omitidas = 0, errores = 0;
    for (const f of filas) {
      if (!f.nombre || f._duplicado) { omitidas++; continue; }
      const { error: err } = await supabase.from('limpieza_insumos').insert({
        nombre: f.nombre, marca: f.marca, descripcion: f.descripcion, uso: f.uso,
        categoria: f.categoria, unidad_medida: f.unidad_medida, piezas_por_unidad: f.piezas_por_unidad,
        costo_referencia: f.costo_referencia, proveedor_id: f._proveedorId,
        stock_minimo_default: f.stock_minimo_default ?? 0,
      });
      if (err) errores++; else creadas++;
    }
    setImportando(false);
    setResultado({ creadas, omitidas, errores });
    setFilas(null);
  }

  if (!esLimpiezaAdmin) return <Aviso tono="critical">Solo un administrador de Limpieza puede hacer carga masiva.</Aviso>;
  if (error) return <Aviso tono="critical">No se pudo preparar la carga masiva: {error}</Aviso>;
  if (!proveedores) return <Cargando />;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Carga masiva de insumos</h1>
        <p className="mt-0.5 text-sm" style={{ color: 'var(--text-secondary)' }}>
          Sube tu catálogo de productos de limpieza de un jalón, en vez de capturarlo uno por uno.
        </p>
      </div>

      <Card title="1. Descarga la plantilla" subtitle="Llénala en Excel o Google Sheets y guárdala como CSV.">
        <ul className="mb-4 list-disc space-y-1 pl-5 text-sm" style={{ color: 'var(--text-secondary)' }}>
          <li>La columna <strong>proveedor</strong> debe escribirse igual que en Proveedores; si no coincide, el insumo se crea sin proveedor.</li>
          <li><strong>unidad_medida</strong>: pieza, litro, kg, rollo, paquete, caja o garrafón. Si no reconozco el valor, uso "pieza".</li>
          <li>Si el <strong>nombre</strong> ya existe en el catálogo, esa fila se omite al importar (no se duplica).</li>
        </ul>
        <Boton variant="ghost" onClick={descargarPlantilla}>Descargar plantilla CSV</Boton>
      </Card>

      <Card title="2. Sube tu archivo">
        <input type="file" accept=".csv" onChange={onArchivo}
               className="block w-full text-sm file:mr-3 file:cursor-pointer file:rounded-lg file:border-0 file:bg-[var(--series-1)] file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-white"
               style={{ color: 'var(--text-secondary)' }} />
      </Card>

      {resultado && (
        <Aviso tono={resultado.errores ? 'warning' : 'good'}>
          Se importaron <strong>{resultado.creadas}</strong> insumos.
          {resultado.omitidas > 0 && <> {resultado.omitidas} se omitieron por nombre duplicado o vacío.</>}
          {resultado.errores > 0 && <> {resultado.errores} tuvieron un error al guardarse.</>}
        </Aviso>
      )}

      {filas && (
        <Card title={`3. Revisa antes de importar (${filas.length} filas)`}
              right={<Boton onClick={importar} disabled={importando}>{importando ? 'Importando…' : `Importar ${filas.filter((f) => f.nombre && !f._duplicado).length} insumos`}</Boton>}>
          {filas.some((f) => f._proveedorTexto && !f._proveedorId) && (
            <Aviso tono="warning">
              Algunas filas tienen un proveedor que no reconozco — esos insumos se crearán sin proveedor asignado.
            </Aviso>
          )}
          <div className="mt-3">
            <Tabla
              columnas={[
                { key: 'nombre', header: 'Nombre', render: (f) => f.nombre ?? '—' },
                { key: 'marca', header: 'Marca', render: (f) => f.marca ?? '—' },
                { key: 'categoria', header: 'Categoría', nowrap: true, render: (f) => f.categoria ?? '—' },
                { key: 'unidad', header: 'Unidad', nowrap: true, render: (f) => f.unidad_medida },
                { key: 'proveedor', header: 'Proveedor', render: (f) =>
                    f._proveedorTexto ? (f._proveedorId ? f._proveedorTexto : <span style={{ color: 'var(--critical)' }}>{f._proveedorTexto} (no encontrado)</span>) : '—' },
                { key: 'estatus', header: '', nowrap: true, render: (f) =>
                    !f.nombre ? <Badge color="var(--critical)">sin nombre</Badge>
                    : f._duplicado ? <Badge color="var(--critical)">ya existe — se omite</Badge> : <Badge color="var(--good)">nuevo</Badge> },
              ]}
              filas={filas}
            />
          </div>
        </Card>
      )}
    </div>
  );
}
