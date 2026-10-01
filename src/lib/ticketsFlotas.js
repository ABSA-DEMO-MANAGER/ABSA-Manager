export const CATEGORIAS_TICKET = {
  mantenimiento: 'Mantenimiento', cambio_pieza: 'Cambio de pieza', compra_pieza: 'Compra de pieza',
  reparacion: 'Reparación', siniestro: 'Siniestro / multa', otro: 'Otro',
  gasolina_viaje: 'Gasolina — viaje', gasolina_extra: 'Gasolina — carga extra', tag: 'Tag / caseta',
};
export const ESTATUS_TICKET = { abierto: 'Abierto', en_proceso: 'En proceso', rechazado: 'Rechazado', completado: 'Completado' };
export const COLOR_TICKET = { abierto: 'var(--series-1)', en_proceso: 'var(--serious)', rechazado: 'var(--critical)', completado: 'var(--good)' };
export const ESTATUS_SOLICITUD = { pendiente: 'Pendiente', aprobada: 'Aprobada', rechazada: 'Rechazada' };
export const COLOR_SOLICITUD = { pendiente: 'var(--serious)', aprobada: 'var(--good)', rechazada: 'var(--critical)' };

/** Un ticket normal o una solicitud de gasolina/tag, ambos traen _origen para distinguirse. */
export function categoriaTicketDe(row) {
  if (row._origen === 'ticket') return CATEGORIAS_TICKET[row.categoria] ?? row.categoria;
  return CATEGORIAS_TICKET[row.motivo === 'viaje' ? 'gasolina_viaje' : row.motivo === 'extra' ? 'gasolina_extra' : 'tag'];
}

/** Junta tickets normales y solicitudes de gasolina/tag en una sola lista, de mas reciente a mas viejo. */
export function combinarTicketsYSolicitudes(tickets, solicitudes) {
  const tix = (tickets ?? []).map((t) => ({ ...t, _origen: 'ticket' }));
  const sol = (solicitudes ?? []).map((s) => ({ ...s, _origen: 'solicitud' }));
  return [...tix, ...sol].sort((a, b) => new Date(b.creado_en) - new Date(a.creado_en));
}
