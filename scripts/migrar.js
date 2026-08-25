/**
 * Lee los Exceles de _fuentes-excel, normaliza y genera supabase/02-datos.sql
 * Uso:  node scripts/migrar.js
 */
const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, '_fuentes-excel');
const OUT = path.join(ROOT, 'supabase', '02-datos.sql');

// ---------------------------------------------------------------- helpers
const q = (v) => (v === null || v === undefined || String(v).trim() === '')
  ? 'null'
  : `'${String(v).trim().replace(/'/g, "''")}'`;

const n = (v) => {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return v;
  const s = String(v).trim();
  const neg = /^\(.*\)$/.test(s);
  const x = parseFloat(s.replace(/[$,()\s]/g, ''));
  return isNaN(x) ? null : (neg ? -x : x);
};
const nSql = (v) => { const x = n(v); return x === null ? 'null' : x; };

// Fechas: Excel serial, Date, o "M/D/YY"
const fecha = (v) => {
  if (!v) return null;
  if (v instanceof Date && !isNaN(v)) return v.toISOString().slice(0, 10);
  if (typeof v === 'number') {
    const d = XLSX.SSF.parse_date_code(v);
    if (d) return `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`;
    return null;
  }
  const s = String(v).trim();
  let m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (m) {
    let [, mes, dia, anio] = m;
    anio = anio.length === 2 ? 2000 + +anio : +anio;
    return `${anio}-${String(+mes).padStart(2, '0')}-${String(+dia).padStart(2, '0')}`;
  }
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? m[0] : null;
};
const fSql = (v) => { const d = fecha(v); return d ? `'${d}'` : 'null'; };

const rd = (f) => XLSX.readFile(path.join(SRC, f), { cellDates: true });
const grid = (ws) => XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '' });
const txt = (v) => String(v ?? '').replace(/\s+/g, ' ').trim();

// ------------------------------------------------- normalizacion sucursal
const SUCURSALES = [
  { codigo: 'GDL', nombre: 'Guadalajara — CEDIS Amapola', ciudad: 'Guadalajara', activa: true,
    alias: ['cedis', 'amapola', 'gdl', 'p1c', 'corporativo'] },
  { codigo: 'HMO', nombre: 'Hermosillo', ciudad: 'Hermosillo', activa: true, alias: ['hermosillo', 'hmo'] },
  { codigo: 'CUU', nombre: 'Chihuahua', ciudad: 'Chihuahua', activa: true, alias: ['chihuahua', 'cuu'] },
  { codigo: 'CDJ', nombre: 'Ciudad Juárez', ciudad: 'Ciudad Juárez', activa: true,
    alias: ['ciudad juarez', 'cd juarez', 'juarez', 'cd j', 'cdju', 'cd. juarez'] },
  { codigo: 'LEO', nombre: 'León', ciudad: 'León', activa: true, alias: ['leon', 'león'] },
  { codigo: 'AGS', nombre: 'Aguascalientes', ciudad: 'Aguascalientes', activa: true, alias: ['aguascalientes', 'ags'] },
  { codigo: 'MTY', nombre: 'Monterrey (cerrada jul-2026)', ciudad: 'Monterrey', activa: false, alias: ['monterrey', 'mty'] },
];

const sinAcentos = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');
function codigoSucursal(raw) {
  const s = sinAcentos(txt(raw).toLowerCase());
  if (!s) return null;
  for (const suc of SUCURSALES) {
    for (const a of suc.alias) if (s === sinAcentos(a)) return suc.codigo;
  }
  for (const suc of SUCURSALES) {
    for (const a of suc.alias) if (s.includes(sinAcentos(a))) return suc.codigo;
  }
  return null;
}

const TIPO = (raw) => {
  const s = sinAcentos(txt(raw).toLowerCase());
  if (!s) return 'otro';
  if (s.startsWith('correctivo')) return 'correctivo';
  if (s.startsWith('preventivo')) return 'preventivo';
  if (s.startsWith('remodelacion')) return 'remodelacion';
  if (s.startsWith('insumo')) return 'insumo';
  if (s.startsWith('viatico')) return 'viaticos';
  return 'otro';
};
const UNIDAD = (raw) => {
  const s = sinAcentos(txt(raw).toLowerCase());
  if (s.startsWith('compania') || s.startsWith('compa')) return 'compania';
  if (s.startsWith('caja')) return 'caja_chica';
  if (s.startsWith('empleado')) return 'empleado';
  return 'compania';
};
const ESTATUS = (raw) => {
  const s = sinAcentos(txt(raw).toLowerCase());
  if (s === 'pagado') return 'pagado';
  if (s === 'aprobado') return 'aprobado';
  if (s.startsWith('a enviar')) return 'a_enviar';
  return 'borrador';
};
const FREQ = (raw) => {
  const s = sinAcentos(txt(raw).toLowerCase());
  if (s.includes('mensual')) return 'mensual';
  if (s.includes('bimestral')) return 'bimestral';
  if (s.includes('trimestral')) return 'trimestral';
  if (s.includes('cuatrimestral')) return 'cuatrimestral';
  if (s.includes('semestral')) return 'semestral';
  if (s.includes('anual')) return 'anual';
  return 'por_definir';
};

// ================================================================== EXTRAER
const L = [];                                   // lineas de SQL
const push = (s) => L.push(s);
const seccion = (t) => push(`\n-- ${'='.repeat(66)}\n-- ${t}\n-- ${'='.repeat(66)}`);
const aviso = [];

push('-- Datos generados por scripts/migrar.js — no editar a mano.');
push('-- Ejecutar DESPUES de 01-schema.sql\n');
push('begin;');

// ---------- Sucursales ----------
seccion('SUCURSALES');
push('insert into sucursales (codigo, nombre, ciudad, activa, alias) values');
push(SUCURSALES.map(s =>
  `  (${q(s.codigo)}, ${q(s.nombre)}, ${q(s.ciudad)}, ${s.activa}, array[${s.alias.map(q).join(',')}])`
).join(',\n') + ';');

// ---------- Presupuestos 2026 ----------
seccion('PRESUPUESTO 2026');
const PRESU = [
  ['GDL', 1401230, 1100000, null],
  ['HMO', 800000, 600000, null],
  ['CUU', 800000, 600000, null],
  ['MTY', 400000, null, 'Sucursal cerrada en julio 2026. Sin presupuesto aprobado.'],
  ['CDJ', 300000, 350000, null],
  ['LEO', 200000, 220000, null],
  ['AGS', 270000, null, 'SIN PRESUPUESTO APROBADO pese a tener gasto ejercido. Revisar con direccion.'],
];
push('insert into presupuestos (sucursal_id, anio, monto_solicitado, monto_aprobado, notas)');
push('select s.id, v.anio, v.solicitado, v.aprobado, v.notas from (values');
push(PRESU.map(([c, sol, apr, nt]) =>
  `  (${q(c)}, 2026, ${sol ?? 'null'}::numeric, ${apr ?? 'null'}::numeric, ${q(nt)})`
).join(',\n'));
push(') as v(codigo, anio, solicitado, aprobado, notas)');
push('join sucursales s on s.codigo = v.codigo;');

// ---------- Categorias ----------
seccion('CATEGORIAS');
const CATS = ['Electrico', 'Iluminacion', 'Estructural', 'Equipos Electricos', 'Climatización',
  'Mobiliario', 'Hidraulico', 'Neumatico', 'Desagues', 'Seguridad', 'Limpieza', 'Fumigacion', 'Vehiculos'];
push('insert into categorias (nombre, orden) values');
push(CATS.map((c, i) => `  (${q(c)}, ${i + 1})`).join(',\n') + ';');

// ---------- Gastos ----------
seccion('GASTOS (detalle enero–junio 2026)');
const wbG = rd('Control de Gastos Mantenimiento  2026.xlsx');
const gG = grid(wbG.Sheets['Detalles de gasto']);
const hiG = gG.findIndex(r => r.some(c => /^Sucursal$/i.test(txt(c))));
const hdrG = gG[hiG].map(txt);
const ix = (name) => hdrG.findIndex(h => h.toLowerCase() === name.toLowerCase());
const [cS, cF, cC, cT, cU, cP, cE, cQ, cG] =
  ['Sucursal', 'Fecha', 'Concepto', 'Tipo de mantenimiento', 'Unidad de pago',
   'Proveedor', 'Pago realizado', 'Cotizaciones', 'Gasto'].map(ix);

const filasG = gG.slice(hiG + 1).filter(r => txt(r[cS]) !== '');
const proveedores = new Map();   // nombre -> {servicio, fijo}
const gastos = [];
let sinFecha = 0, sinMonto = 0, sinSucursal = 0;

for (const r of filasG) {
  const cod = codigoSucursal(r[cS]);
  if (!cod) { sinSucursal++; aviso.push(`Sucursal no reconocida: "${txt(r[cS])}"`); continue; }
  const f = fecha(r[cF]);
  if (!f) sinFecha++;
  const monto = n(r[cG]);
  if (monto === null) { sinMonto++; continue; }
  const prov = txt(r[cP]);
  if (prov) proveedores.set(prov, { servicio: null, fijo: false });
  const negativo = monto < 0;
  gastos.push({
    fecha: f || '2026-01-01',
    codigo: cod,
    concepto: txt(r[cC]) || 'Sin concepto',
    tipo: TIPO(r[cT]),
    unidad: UNIDAD(r[cU]),
    estatus: ESTATUS(r[cE]),
    cot: n(r[cQ]) ?? 0,
    monto,
    proveedor: prov || null,
    revision: negativo || !f,
    nota: negativo
      ? 'Monto capturado en negativo en el Excel original. Confirmar si es nota de credito o error de captura.'
      : (!f ? 'Fecha ilegible en el Excel original; se asigno 2026-01-01.' : null),
  });
}

// ---------- Proveedores fijos ----------
const wbF = rd('Pagos proveedores fijos.xlsx');
const gF = grid(wbF.Sheets['Gastos Fijos']);
// fila 2 (idx 1) = tipo de servicio, fila 3 (idx 2) = sucursal, fila 4 (idx 3) = proveedor
const rowServ = gF[1] || [], rowSuc = gF[2] || [], rowProv = gF[3] || [];
let servActual = '';
for (let c = 0; c < Math.max(rowProv.length, rowSuc.length); c++) {
  if (txt(rowServ[c])) servActual = txt(rowServ[c]);
  const p = txt(rowProv[c]);
  if (!p || /^corporativo$/i.test(p)) continue;
  const prev = proveedores.get(p) || {};
  proveedores.set(p, { servicio: prev.servicio || servActual || null, fijo: true });
}

seccion('PROVEEDORES');
const provArr = [...proveedores.entries()];
push('insert into proveedores (nombre, servicio, es_fijo) values');
push(provArr.map(([nom, m]) => `  (${q(nom)}, ${q(m.servicio)}, ${m.fijo})`).join(',\n'));
push('on conflict (nombre) do nothing;');

push('');
push('-- gastos');
push('insert into gastos (fecha, sucursal_id, proveedor_id, concepto, tipo, unidad_pago, estatus_pago, cotizaciones, monto, requiere_revision, nota_revision)');
push('select v.fecha::date, s.id, p.id, v.concepto, v.tipo::tipo_mantenimiento, v.unidad::unidad_pago,');
push('       v.estatus::estatus_pago, v.cot, v.monto, v.revision, v.nota');
push('from (values');
push(gastos.map(g =>
  `  (${q(g.fecha)}, ${q(g.codigo)}, ${q(g.proveedor)}, ${q(g.concepto)}, ${q(g.tipo)}, ${q(g.unidad)}, ${q(g.estatus)}, ${g.cot}, ${g.monto}::numeric, ${g.revision}, ${q(g.nota)})`
).join(',\n'));
push(') as v(fecha, codigo, proveedor, concepto, tipo, unidad, estatus, cot, monto, revision, nota)');
push('join sucursales s on s.codigo = v.codigo');
push('left join proveedores p on p.nombre = v.proveedor;');

// ---------- Activos ----------
seccion('ACTIVOS');
const wbP = rd('Plan de Mantenimiento1 .xlsx');
const activos = [];

// -- 4.1 Aires acondicionados (CEDIS/GDL)
{
  const g = grid(wbP.Sheets['4.1']).filter(r => r.some(c => txt(c)));
  const hi = g.findIndex(r => r.some(c => /Ubicaci/i.test(txt(c))));
  const H = g[hi].map(txt);
  const col = (re) => H.findIndex(h => re.test(h));
  const cUb = col(/Ubicaci/i), cNo = col(/Numero de equipo/i), cMa = col(/Marca/i), cTi = col(/^Tipo$/i),
        cMo = col(/Modelo/i), cBt = col(/BTU/i), cCo = col(/Corriente/i), cVo = col(/VOLTAJE/i),
        cRe = col(/Refrigerante/i), cTa = col(/Tablero/i), cIn = col(/interruptor/i), cSe = col(/Servicios/i);
  for (const r of g.slice(hi + 1)) {
    const ub = txt(r[cUb]); if (!ub) continue;
    const serv = txt(r[cSe]);
    activos.push({
      codigo: txt(r[cNo]) ? `AA-${txt(r[cNo]).replace(/\.0+$/, '')}` : null,
      sucursal: 'GDL', categoria: 'Climatización',
      nombre: `${txt(r[cTi]) || 'Equipo A/A'} — ${ub}`,
      ubicacion: ub, tipo: txt(r[cTi]), marca: txt(r[cMa]), modelo: txt(r[cMo]),
      capacidad: txt(r[cBt]) ? `${n(r[cBt]) ?? txt(r[cBt])} BTU` : null,
      criticidad: 'B',
      ultimo: serv.match(/(\d{1,2}\/\d{1,2}\/\d{4})/) ? fecha(serv.match(/(\d{1,2}\/\d{1,2}\/\d{4})/)[1]) : null,
      attrs: { corriente: txt(r[cCo]), voltaje: txt(r[cVo]), refrigerante: txt(r[cRe]), tablero: txt(r[cTa]), interruptor: txt(r[cIn]) },
      notas: serv || null,
    });
  }
}

// -- 5.1 Equipos electricos CEDIS  y  5.1 (2) Chihuahua
for (const [sh, cod] of [['5.1', 'GDL'], ['5.1 (2)', 'CUU']]) {
  const g = grid(wbP.Sheets[sh]).filter(r => r.some(c => txt(c)));
  const hi = g.findIndex(r => r.some(c => /^EQUIPOS$/i.test(txt(c))));
  if (hi < 0) continue;
  const H = g[hi].map(txt);
  const col = (re) => H.findIndex(h => re.test(h));
  const cEq = col(/^EQUIPOS$/i), cNo = col(/NUMERO DE EQUIPO/i), cMa = col(/MARCA/i), cMo = col(/MODELO/i),
        cSr = col(/NUMERO DE SERIE/i), cCa = col(/CAPACIDAD/i), cEl = col(/ELECTRICA/i), cAc = col(/ACEITE/i);
  for (const r of g.slice(hi + 1)) {
    const eq = txt(r[cEq]); if (!eq) continue;
    activos.push({
      codigo: txt(r[cNo]) ? `EE-${txt(r[cNo]).replace(/\.0+$/, '')}` : null,
      sucursal: cod, categoria: 'Equipos Electricos', nombre: eq, ubicacion: null,
      tipo: null, marca: txt(r[cMa]), modelo: txt(r[cMo]), serie: txt(r[cSr]),
      capacidad: txt(r[cCa]), criticidad: 'A', ultimo: null,
      attrs: { electrica: txt(r[cEl]), aceite: txt(r[cAc]) }, notas: null,
    });
  }
}

// -- 1.1 Subestaciones / transformadores (varias sucursales)
{
  const g = grid(wbP.Sheets['1.1']).filter(r => r.some(c => txt(c)));
  const hi = g.findIndex(r => r.some(c => /Ubicaci/i.test(txt(c))));
  const H = g[hi].map(txt);
  const col = (re) => H.findIndex(h => re.test(h));
  const cUb = col(/Ubicaci/i), cCa = col(/Capacidad/i), cTi = col(/^Tipo$/i), cUs = col(/Ultimo servicio/i),
        cPo = col(/Potencia/i), cVo = col(/Voltajes/i), cCx = col(/Conexi/i), cFs = col(/Fabricante/i),
        cFf = col(/Fecha de Fabricaci/i), cNr = col(/Normas/i), cKw = col(/Consumo/i);
  let i = 0;
  for (const r of g.slice(hi + 1)) {
    const ub = txt(r[cUb]); if (!ub) continue;
    const cod = codigoSucursal(ub);
    if (!cod) { aviso.push(`Subestacion con ubicacion no reconocida: "${ub}"`); continue; }
    i++;
    activos.push({
      codigo: `SUB-${String(i).padStart(3, '0')}`,
      sucursal: cod, categoria: 'Electrico',
      nombre: `Transformador ${txt(r[cCa])} — ${txt(r[cTi])}`,
      ubicacion: 'Subestacion', tipo: txt(r[cTi]), marca: null, modelo: null,
      serie: /pendiente/i.test(txt(r[cFs])) ? null : txt(r[cFs]),
      capacidad: txt(r[cCa]), criticidad: 'A',
      fechaInst: /pendiente/i.test(txt(r[cFf])) ? null : fecha(r[cFf]),
      ultimo: fecha(r[cUs]),
      attrs: { potencia_kva: txt(r[cPo]), voltajes: txt(r[cVo]), conexion: txt(r[cCx]), norma: txt(r[cNr]), consumo: txt(r[cKw]) },
      notas: null,
    });
  }
}

push('insert into activos (sucursal_id, categoria_id, codigo, nombre, ubicacion, tipo, marca, modelo, serie, capacidad, criticidad, fecha_instalacion, ultimo_servicio, atributos, notas)');
push('select s.id, c.id, v.codigo, v.nombre, v.ubicacion, v.tipo, v.marca, v.modelo, v.serie, v.capacidad,');
push('       v.criticidad::criticidad_activo, v.finst::date, v.ultimo::date, v.attrs::jsonb, v.notas');
push('from (values');
push(activos.map(a => {
  const attrs = Object.fromEntries(Object.entries(a.attrs || {}).filter(([, v]) => v));
  return `  (${q(a.sucursal)}, ${q(a.categoria)}, ${q(a.codigo)}, ${q(a.nombre)}, ${q(a.ubicacion)}, ${q(a.tipo)}, ${q(a.marca)}, ${q(a.modelo)}, ${q(a.serie)}, ${q(a.capacidad)}, ${q(a.criticidad)}, ${a.fechaInst ? q(a.fechaInst) : 'null'}, ${a.ultimo ? q(a.ultimo) : 'null'}, ${q(JSON.stringify(attrs))}, ${q(a.notas)})`;
}).join(',\n'));
push(') as v(sucursal, categoria, codigo, nombre, ubicacion, tipo, marca, modelo, serie, capacidad, criticidad, finst, ultimo, attrs, notas)');
push('join sucursales s on s.codigo = v.sucursal');
push('left join categorias c on c.nombre = v.categoria;');

// ---------- Planes ----------
seccion('PLANES DE MANTENIMIENTO');
const planes = [];
const planSuc = [];

// Plan general (hoja "PLAN DE MANTENIMIENTO"), seccion electrica
{
  const g = grid(wbP.Sheets['PLAN DE MANTENIMIENTO']).filter(r => r.some(c => txt(c)));
  const hi = g.findIndex(r => r.some(c => /^Frecuencia$/i.test(txt(c))));
  if (hi >= 0) {
    const H = g[hi].map(txt);
    const cFr = H.findIndex(h => /^Frecuencia$/i.test(h));
    const cNom = cFr - 1, cSrv = cFr + 1, cEq = cFr + 2;
    for (const r of g.slice(hi + 1)) {
      const nom = txt(r[cNom]);
      if (!nom || /^Estructural$/i.test(nom)) break;
      planes.push({
        nombre: nom, categoria: 'Electrico', frecuencia: FREQ(r[cFr]),
        servicio: txt(r[cSrv]) || null, equipos: n(r[cEq]),
        descripcion: null, formato: true,
      });
    }
  }
}

// Secciones CEDIS (hojas "seccion 1".."seccion 7")
for (let s = 1; s <= 7; s++) {
  const ws = wbP.Sheets[`seccion ${s}`];
  if (!ws) continue;
  const g = grid(ws).filter(r => r.some(c => txt(c)));
  const hi = g.findIndex(r => r.some(c => /^Area$/i.test(txt(c))));
  if (hi < 0) continue;
  const H = g[hi].map(txt);
  const cAr = H.findIndex(h => /^Area$/i.test(h));
  const cEs = H.findIndex(h => /^Estructura$/i.test(h));
  const cCa = H.findIndex(h => /^Cantidad$/i.test(h));
  const cTm = H.findIndex(h => /Tipo de mantenimiento/i.test(h));
  const zona = txt(g[2]?.find(c => txt(c))) || `Seccion ${s}`;
  for (const r of g.slice(hi + 1)) {
    const area = txt(r[cAr]), est = txt(r[cEs]), desc = txt(r[cTm]);
    if (!area || !desc || desc === 'N/A') continue;
    planes.push({
      nombre: `${area} — ${est}`, categoria: 'Estructural', frecuencia: 'anual',
      servicio: 'Equipo ABSA', equipos: n(r[cCa]),
      descripcion: `${desc} (${zona}. Cantidad: ${txt(r[cCa]) || 'n/d'})`, formato: false,
    });
  }
}

// dedup por nombre
const vistos = new Set();
const planesU = planes.filter(p => {
  const k = p.nombre.toLowerCase();
  if (vistos.has(k)) return false;
  vistos.add(k); return true;
});

push('insert into planes (categoria_id, nombre, descripcion, frecuencia, servicio, requiere_formato)');
push('select c.id, v.nombre, v.descripcion, v.frecuencia::frecuencia_plan, v.servicio, v.formato');
push('from (values');
push(planesU.map(p =>
  `  (${q(p.categoria)}, ${q(p.nombre)}, ${q(p.descripcion)}, ${q(p.frecuencia)}, ${q(p.servicio)}, ${p.formato})`
).join(',\n'));
push(') as v(categoria, nombre, descripcion, frecuencia, servicio, formato)');
push('left join categorias c on c.nombre = v.categoria;');

// ---------- Pendientes ----------
seccion('PENDIENTES / REQUERIMIENTOS DETECTADOS');
const pend = [];
{
  const g = grid(wbP.Sheets['Hoja2']).filter(r => r.some(c => txt(c)));
  let sucActual = null;
  for (const r of g) {
    const c0 = txt(r[0]) || txt(r[1]);
    const posible = codigoSucursal(c0);
    if (posible && !txt(r[2])) { sucActual = posible; continue; }
    if (posible) sucActual = posible;
    const concepto = txt(r[2]);
    if (!concepto || /^Pendientes/i.test(concepto)) continue;
    const desc = txt(r[3]);
    const costoRaw = txt(r[4]);
    let min = null, max = null;
    const rango = costoRaw.match(/([\d,]+)\s*(?:a|-)\s*([\d,]+)/);
    if (rango) { min = n(rango[1]); max = n(rango[2]); }
    else {
      const mult = costoRaw.match(/([\d,.]+)\s*x\s*(\d+)/i);
      if (mult) { min = max = (n(mult[1]) || 0) * (+mult[2]); }
      else { const v = n(costoRaw.replace(/\$/g, '')); if (v !== null) { min = max = v; } }
    }
    pend.push({ sucursal: sucActual, concepto, desc: desc || null, min, max,
                estatus: /cotizacion/i.test(costoRaw) ? 'cotizando' : 'abierto' });
  }
}
if (pend.length) {
  push('insert into pendientes (sucursal_id, concepto, descripcion, costo_min, costo_max, estatus)');
  push('select s.id, v.concepto, v.descripcion, v.cmin, v.cmax, v.estatus');
  push('from (values');
  push(pend.map(p =>
    `  (${q(p.sucursal)}, ${q(p.concepto)}, ${q(p.desc)}, ${p.min ?? 'null'}::numeric, ${p.max ?? 'null'}::numeric, ${q(p.estatus)})`
  ).join(',\n'));
  push(') as v(codigo, concepto, descripcion, cmin, cmax, estatus)');
  push('left join sucursales s on s.codigo = v.codigo;');
}

push('\ncommit;');

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, L.join('\n'), 'utf8');

// ------------------------------------------------------------- resumen
const suma = gastos.reduce((a, g) => a + g.monto, 0);
const porTipo = {};
gastos.forEach(g => { porTipo[g.tipo] = (porTipo[g.tipo] || 0) + g.monto; });

console.log('\n=========== MIGRACION COMPLETADA ===========');
console.log('Archivo generado:', path.relative(ROOT, OUT));
console.log(`\n  Sucursales .......... ${SUCURSALES.length} (${SUCURSALES.filter(s => s.activa).length} activas)`);
console.log(`  Presupuestos ........ ${PRESU.length}`);
console.log(`  Categorias .......... ${CATS.length}`);
console.log(`  Proveedores ......... ${provArr.length} (${provArr.filter(([, m]) => m.fijo).length} fijos)`);
console.log(`  Gastos .............. ${gastos.length}   total $${suma.toLocaleString('en-US', { minimumFractionDigits: 2 })}`);
console.log(`  Activos ............. ${activos.length}`);
console.log(`  Planes .............. ${planesU.length}`);
console.log(`  Pendientes .......... ${pend.length}`);
console.log('\n  Gasto por tipo:');
Object.entries(porTipo).sort((a, b) => b[1] - a[1])
  .forEach(([t, v]) => console.log(`    ${t.padEnd(14)} $${v.toLocaleString('en-US', { minimumFractionDigits: 2 }).padStart(14)}`));
console.log(`\n  Marcados para revision: ${gastos.filter(g => g.revision).length}`);
if (sinMonto)   console.log(`  ! Descartados sin monto: ${sinMonto}`);
if (sinSucursal) console.log(`  ! Descartados sin sucursal: ${sinSucursal}`);
if (sinFecha)   console.log(`  ! Sin fecha legible: ${sinFecha}`);
if (aviso.length) {
  console.log('\n  Avisos:');
  [...new Set(aviso)].forEach(a => console.log('    - ' + a));
}
