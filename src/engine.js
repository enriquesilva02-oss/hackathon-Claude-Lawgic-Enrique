// Motor de cálculo para actualizar pensiones alimenticias.
// Todas las cantidades se manejan en centavos (enteros) y cada paso se trunca a 2 decimales,
// conforme a la práctica forense en materia de liquidación de alimentos.

const DIAS = 30;

export const aCentavos = (pesos) => Math.round(Number(pesos) * 100);
export const aPesos = (centavos) => centavos / 100;

export function formatoMoneda(centavos) {
  const signo = centavos < 0 ? "-" : "";
  const abs = Math.abs(centavos);
  const enteros = Math.floor(abs / 100).toLocaleString("es-MX");
  const dec = String(abs % 100).padStart(2, "0");
  return `${signo}$${enteros}.${dec}`;
}

// Porcentaje expresado en centésimas de punto (6.5% -> 650) para operar sin decimales.
const aCentesimas = (porcentaje) => Math.round(Number(porcentaje) * 100);
const truncarPorcentaje = (centavos, pctCentesimas) => Math.floor((centavos * pctCentesimas) / 10000);

/**
 * Actualización por salario mínimo.
 * Hasta 2016: pensión + (pensión × % de incremento).
 * Desde 2017: (pensión ÷ 30 + MIR) más el % de fijación sobre ese resultado, × 30
 * (jurisprudencia 1a./J. 152/2024, registro 2029528).
 */
export function actualizarPorSalarioMinimo({ pensionCentavos, primerAnio, ultimoAnio, tabla }) {
  const anios = [];
  let pension = pensionCentavos;
  for (let anio = primerAnio; anio <= ultimoAnio; anio++) {
    const dato = tabla[String(anio)];
    if (!dato) throw new Error(`No hay datos de salario mínimo para ${anio}`);
    const anterior = pension;
    if (dato.metodo === "porcentaje") {
      const incremento = truncarPorcentaje(anterior, aCentesimas(dato.pct));
      pension = anterior + incremento;
      anios.push({ anio, metodo: "porcentaje", anterior, pct: dato.pct, incremento, pension, verificado: !!dato.verificado });
    } else {
      const diario = Math.floor(anterior / DIAS);
      const mir = aCentavos(dato.mir);
      const conMir = diario + mir;
      const montoFijacion = truncarPorcentaje(conMir, aCentesimas(dato.fijacion));
      const diarioActualizado = conMir + montoFijacion;
      pension = diarioActualizado * DIAS;
      anios.push({
        anio, metodo: "mir", anterior, diario, mir, conMir, fijacion: dato.fijacion,
        montoFijacion, diarioActualizado, pension, verificado: !!dato.verificado,
      });
    }
  }
  return anios;
}

// Índices con 3 decimales -> enteros en milésimas, para dividir sin errores de punto flotante.
const indiceEntero = (valor) => Math.round(Number(valor) * 1000);
const mesAnterior = (aaaamm) => {
  let [a, m] = aaaamm.split("-").map(Number);
  m -= 1;
  if (m === 0) { m = 12; a -= 1; }
  return `${a}-${String(m).padStart(2, "0")}`;
};

/**
 * Actualización por INPC (CC Jalisco, art. 442): incremento anual cada enero.
 * Factor del año N = INPC dic(N-1) ÷ INPC dic(N-2), truncado a 4 decimales y nunca menor a 1.
 * Primer ajuste: INPC dic del año de fijación ÷ INPC del mes anterior a la fijación.
 */
export function actualizarPorINPC({ pensionCentavos, fechaFijacion, ultimoAnio, inpc }) {
  const [anioFijacion] = fechaFijacion.split("-").map(Number);
  const anios = [];
  let pension = pensionCentavos;
  for (let anio = anioFijacion + 1; anio <= ultimoAnio; anio++) {
    const mesInicial = anio === anioFijacion + 1 ? mesAnterior(fechaFijacion) : `${anio - 2}-12`;
    const mesFinal = `${anio - 1}-12`;
    const a = inpc[mesInicial];
    const b = inpc[mesFinal];
    if (a === undefined || b === undefined) throw new Error(`Falta el INPC de ${a === undefined ? mesInicial : mesFinal}`);
    const factorDiezmilesimos = Math.max(10000, Math.floor((indiceEntero(b) * 10000) / indiceEntero(a)));
    const anterior = pension;
    pension = Math.floor((anterior * factorDiezmilesimos) / 10000);
    anios.push({ anio, anterior, mesInicial, mesFinal, inpcInicial: a, inpcFinal: b, factor: factorDiezmilesimos / 10000, pension });
  }
  return anios;
}

const enRango = (aaaamm, desde, hasta) => (!desde || aaaamm >= desde) && (!hasta || aaaamm <= hasta);

/**
 * Planilla de liquidación mes por mes.
 * pensionBase: mensualidad vigente antes del primer año actualizado.
 * serie: [{anio, pension}] resultado de cualquiera de los dos métodos.
 * pagoSinActualizar: {monto, desde, hasta} cuando el deudor sí cubrió la pensión,
 *   pero sin las actualizaciones; en esos meses solo se adeuda la diferencia.
 */
export function generarPlanilla({ pensionBase, serie, desde, hasta, dia = 5, saldoInicial = null, abonos = [], pagoSinActualizar = null }) {
  const porAnio = Object.fromEntries(serie.map((s) => [s.anio, s.pension]));
  const movimientos = [];
  if (saldoInicial) {
    movimientos.push({ fecha: saldoInicial.fecha, concepto: saldoInicial.concepto, monto: saldoInicial.monto });
  }
  let [a, m] = desde.split("-").map(Number);
  const [aFin, mFin] = hasta.split("-").map(Number);
  while (a < aFin || (a === aFin && m <= mFin)) {
    const anteriores = serie.filter((s) => s.anio <= a).map((s) => s.anio);
    const actualizada = porAnio[a] ?? (anteriores.length ? porAnio[Math.max(...anteriores)] : pensionBase);
    const mes = `${a}-${String(m).padStart(2, "0")}`;
    const pagado = pagoSinActualizar && enRango(mes, pagoSinActualizar.desde, pagoSinActualizar.hasta)
      ? Math.min(pagoSinActualizar.monto, actualizada) : 0;
    movimientos.push({
      fecha: `${mes}-${String(dia).padStart(2, "0")}`,
      concepto: pagado ? `DIFERENCIA DE ALIMENTOS ACTUALIZADOS ${a}` : `ALIMENTOS ACTUALIZADOS ${a}`,
      actualizada,
      pagado,
      monto: actualizada - pagado,
    });
    m += 1;
    if (m === 13) { m = 1; a += 1; }
  }
  for (const abono of abonos) {
    movimientos.push({ fecha: abono.fecha, concepto: abono.concepto || "ABONO", monto: -Math.abs(abono.monto) });
  }
  let saldo = 0;
  const filas = movimientos.map((mov) => {
    saldo += mov.monto;
    return { ...mov, saldo };
  });
  const suma = (campo) => filas.reduce((t, f) => t + (f[campo] || 0), 0);
  return { filas, saldo, totalActualizado: suma("actualizada"), totalPagado: suma("pagado") };
}

/**
 * Otros conceptos (colegiaturas, gastos médicos, uniformes, etc.), independientes de la pensión.
 * Cada concepto: {fecha, categoria, descripcion, monto, porcentaje (parte a cargo del deudor), pagado}.
 * Adeudo = monto × porcentaje (truncado) − lo que el deudor ya pagó de ese concepto; nunca negativo.
 *
 * Actualización opcional por INPC hasta la fecha de corte (actualizacion = {inpc, corte: "AAAA-MM"}).
 * Mismo criterio que el CFF art. 17-A, aplicado por analogía:
 * factor = INPC del mes anterior al corte ÷ INPC del mes anterior al del gasto,
 * truncado a 4 decimales y nunca menor a 1. Si el INPC del mes anterior al corte aún no se publica,
 * se usa el último publicado.
 */
export function calcularOtrosConceptos(conceptos, actualizacion = null) {
  const filas = [...conceptos]
    .sort((a, b) => (a.fecha || "").localeCompare(b.fecha || ""))
    .map((c) => {
      const porcentaje = c.porcentaje === undefined || c.porcentaje === "" ? 100 : Number(c.porcentaje);
      const aCargo = truncarPorcentaje(c.monto, aCentesimas(porcentaje));
      const pagado = c.pagado || 0;
      const historico = Math.max(0, aCargo - pagado);
      const fila = { ...c, porcentaje, aCargo, pagado, historico, adeudo: historico };
      if (actualizacion && c.fecha) {
        const mesAntiguo = mesAnterior(c.fecha.slice(0, 7));
        const mesReciente = ultimoPublicado(actualizacion.inpc, mesAnterior(actualizacion.corte));
        const a = actualizacion.inpc[mesAntiguo];
        const b = actualizacion.inpc[mesReciente];
        if (a === undefined || b === undefined) throw new Error(`Falta el INPC de ${a === undefined ? mesAntiguo : mesReciente}`);
        const factorDiezmilesimos = Math.max(10000, Math.floor((indiceEntero(b) * 10000) / indiceEntero(a)));
        Object.assign(fila, {
          mesAntiguo, mesReciente, inpcAntiguo: a, inpcReciente: b,
          factor: factorDiezmilesimos / 10000,
          adeudo: Math.floor((historico * factorDiezmilesimos) / 10000),
        });
      }
      return fila;
    });
  const porCategoria = {};
  for (const f of filas) porCategoria[f.categoria] = (porCategoria[f.categoria] || 0) + f.adeudo;
  return {
    filas, porCategoria,
    totalHistorico: filas.reduce((t, f) => t + f.historico, 0),
    total: filas.reduce((t, f) => t + f.adeudo, 0),
    actualizado: !!actualizacion,
  };
}

function ultimoPublicado(inpc, mes) {
  if (inpc[mes] !== undefined) return mes;
  const anteriores = Object.keys(inpc).filter((k) => k <= mes).sort();
  return anteriores.length ? anteriores[anteriores.length - 1] : mes;
}

/** Planilla de liquidación de sentencia: suma el saldo de pensiones y el de otros conceptos. */
export function liquidacionFinal({ saldoPensiones = 0, otros = null }) {
  const totalOtros = otros ? otros.total : 0;
  return { saldoPensiones, totalOtros, total: saldoPensiones + totalOtros };
}
