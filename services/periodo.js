// Periodo de consulta (fechas en hora de Bogotá, AAAA-MM-DD). Por defecto, los últimos 30 días.
import { ahora, partesBogota, aFechaHora } from "./tiempo.js";

const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const sumarDias = (fecha, dias) => {
  const d = new Date(`${fecha}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
};

export function periodoDe(query = {}, instante = ahora()) {
  const hoy = partesBogota(instante).fecha;
  let hasta = FECHA.test(query.hasta ?? "") ? query.hasta : hoy;
  let desde = FECHA.test(query.desde ?? "") ? query.desde : sumarDias(hasta, -29);
  if (desde > hasta) [desde, hasta] = [hasta, desde];
  return {
    desde,
    hasta,
    inicio: aFechaHora(desde, "00:00"),
    fin: aFechaHora(sumarDias(hasta, 1), "00:00"), // exclusivo: incluye todo el día "hasta"
  };
}
