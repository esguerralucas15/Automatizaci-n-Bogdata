// Fechas y horas en hora de Bogotá, sin importar la zona del servidor.
// Colombia está en UTC-5 todo el año (no tiene horario de verano), así que se
// usa un desfase fijo: el resultado es igual en Windows, Linux o un servidor en UTC.

// Se carga .env aquí también para que RELOJ_PRUEBA funcione sin importar el
// orden en que se importen los módulos.
import "dotenv/config";

export const ZONA = "America/Bogota";
const DESFASE = "-05:00";
const DESFASE_MS = -5 * 60 * 60 * 1000;

const MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];
const DIAS = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"];

// Fecha (AAAA-MM-DD), hora (HH:MM), minutos desde medianoche y día de la
// semana (1 = lunes ... 7 = domingo) de un instante, en hora de Bogotá.
export function partesBogota(instante) {
  const local = new Date(instante.getTime() + DESFASE_MS).toISOString();
  const hora = local.slice(11, 16);
  const diaUTC = new Date(instante.getTime() + DESFASE_MS).getUTCDay(); // 0 = domingo
  return {
    fecha: local.slice(0, 10),
    hora,
    minutos: minutosDe(hora),
    diaSemana: ((diaUTC + 6) % 7) + 1,
  };
}

// Instante correspondiente a una fecha y hora de Bogotá
export function aFechaHora(fecha, hora) {
  const d = new Date(`${fecha}T${hora}:00${DESFASE}`);
  if (Number.isNaN(d.getTime())) throw new Error(`Fecha u hora inválida: ${fecha} ${hora}`);
  return d;
}

export function sumarMinutos(instante, minutos) {
  return new Date(instante.getTime() + minutos * 60 * 1000);
}

// "16:30" -> 990
export function minutosDe(hora) {
  const [h, m] = hora.split(":").map(Number);
  return h * 60 + m;
}

// 990 -> "16:30"
export function horaDeMinutos(total) {
  const p = (n) => String(n).padStart(2, "0");
  return `${p(Math.floor(total / 60))}:${p(total % 60)}`;
}

// "16:30" -> "4:30 p.m."  |  "07:00" -> "7:00 a.m."  |  "12:00" -> "12:00 m."
export function horaLegible(hora) {
  const [h, m] = hora.split(":").map(Number);
  const mm = String(m).padStart(2, "0");
  if (h === 12 && m === 0) return "12:00 m.";
  if (h === 0) return `12:${mm} a.m.`;
  return h < 12 ? `${h}:${mm} a.m.` : `${h === 12 ? 12 : h - 12}:${mm} p.m.`;
}

// "2026-10-24" -> "sábado 24 de octubre"
export function fechaLegible(fecha) {
  const [y, m, d] = fecha.split("-").map(Number);
  const diaUTC = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return `${DIAS[(diaUTC + 6) % 7]} ${d} de ${MESES[m - 1]}`;
}

// Semanas (domingo a sábado) del mes de un instante, en hora de Bogotá,
// para el calendario del dashboard.
export function calendarioMes(instante) {
  const hoy = partesBogota(instante).fecha;
  const [y, m] = hoy.split("-").map(Number);
  const primero = new Date(Date.UTC(y, m - 1, 1));
  const d = new Date(Date.UTC(y, m - 1, 1 - primero.getUTCDay()));
  const semanas = [];
  do {
    const semana = [];
    for (let i = 0; i < 7; i++) {
      semana.push({
        dia: d.getUTCDate(),
        iso: d.toISOString().slice(0, 10),
        delMes: d.getUTCMonth() === m - 1,
      });
      d.setUTCDate(d.getUTCDate() + 1);
    }
    semanas.push(semana);
  } while (d.getUTCMonth() === m - 1);
  const mes = MESES[m - 1];
  return { mes: mes[0].toUpperCase() + mes.slice(1), anio: y, semanas, hoy };
}

// ---------------------------------------------------------------------------
// Reloj de la aplicación. En pruebas se puede simular la fecha y hora con la
// variable RELOJ_PRUEBA="2026-10-13T16:35" (hora de Bogotá): el reloj arranca
// en ese momento y avanza normalmente desde ahí.
// ---------------------------------------------------------------------------
const ARRANQUE = Date.now();
let base = null;
if (process.env.RELOJ_PRUEBA && process.env.NODE_ENV === "production") {
  console.warn("RELOJ_PRUEBA se ignora en producción: se usa la hora real.");
} else if (process.env.RELOJ_PRUEBA) {
  const [fecha, hora] = process.env.RELOJ_PRUEBA.split("T");
  base = aFechaHora(fecha, hora.slice(0, 5));
  console.warn(`RELOJ_PRUEBA activo: la aplicación cree que son las ${hora} del ${fecha} (Bogotá)`);
}

export function ahora() {
  return base ? new Date(base.getTime() + (Date.now() - ARRANQUE)) : new Date();
}
