// Pruebas del motor de cálculo. Todos los casos usan cifras ficticias; los resultados esperados
// se calcularon por separado con aritmética decimal y truncado a 2 decimales.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { actualizarPorSalarioMinimo, actualizarPorINPC, generarPlanilla, calcularOtrosConceptos, liquidacionFinal, aCentavos, formatoMoneda } from "../src/engine.js";

const sm = JSON.parse(readFileSync(new URL("../data/salario_minimo.json", import.meta.url))).anios;
const inpc = JSON.parse(readFileSync(new URL("../data/inpc.json", import.meta.url))).valores;
const porAnio = (serie) => Object.fromEntries(serie.map((s) => [s.anio, s.pension]));

test("método por porcentaje 2010-2016 con los salarios oficiales del DOF (zona de Guadalajara)", () => {
  const serie = actualizarPorSalarioMinimo({ pensionCentavos: aCentavos(5000), primerAnio: 2010, ultimoAnio: 2016, tabla: sm });
  // % oficiales truncados a 2 decimales: 4.84 · 4.10 · 4.19 · 3.89 · 3.90 · 4.17 · 4.19
  assert.deepEqual(porAnio(serie), {
    2010: 524200, 2011: 545692, 2012: 568556, 2013: 590672, 2014: 613708, 2015: 639299, 2016: 666085,
  });
  assert.ok(serie.every((a) => a.verificado));
});

test("todos los años 2010-2026 de la tabla tienen fuente oficial", () => {
  for (let anio = 2010; anio <= 2026; anio++) {
    const dato = sm[String(anio)];
    assert.ok(dato.verificado, `${anio} sin verificar`);
    assert.match(dato.fuente, /dof\.gob\.mx|gob\.mx\/conasami/);
  }
});

test("método MIR (2017-2020): desarrollo paso a paso", () => {
  const serie = actualizarPorSalarioMinimo({ pensionCentavos: aCentavos(6000), primerAnio: 2017, ultimoAnio: 2020, tabla: sm });
  const y2017 = serie[0];
  // 6,000 ÷ 30 = 200.00; + MIR 4.00 = 204.00; 3.9% = 7.95; 211.95 × 30 = 6,358.50
  assert.equal(y2017.diario, 20000);
  assert.equal(y2017.conMir, 20400);
  assert.equal(y2017.montoFijacion, 795);
  assert.equal(y2017.diarioActualizado, 21195);
  assert.deepEqual(porAnio(serie), { 2017: 635850, 2018: 676230, 2019: 739740, 2020: 822930 });
});

test("serie 2021-2026 con el MIR oficial del DOF", () => {
  const serie = actualizarPorSalarioMinimo({ pensionCentavos: aCentavos(9000), primerAnio: 2021, ultimoAnio: 2026, tabla: sm });
  assert.deepEqual(porAnio(serie), {
    2021: 987240, 2022: 1131330, 2023: 1296330, 2024: 1461240, 2025: 1597260, 2026: 1755420,
  });
});

test("planilla de liquidación con saldo inicial y abono", () => {
  const serie = actualizarPorSalarioMinimo({ pensionCentavos: aCentavos(9000), primerAnio: 2021, ultimoAnio: 2026, tabla: sm });
  const { saldo, filas } = generarPlanilla({
    pensionBase: aCentavos(9000),
    serie,
    desde: "2024-01",
    hasta: "2026-10",
    saldoInicial: { fecha: "2023-12-15", concepto: "SALDO DE LIQUIDACIÓN PREVIA", monto: aCentavos(180000) },
    abonos: [{ fecha: "2025-06-10", concepto: "BILLETE DE DEPÓSITO", monto: aCentavos(15000) }],
  });
  assert.equal(filas.length, 1 + 34 + 1);
  assert.equal(saldo, aCentavos(707562));
  assert.equal(formatoMoneda(saldo), "$707,562.00");
});

test("deudor que pagó la pensión sin actualizar: solo se adeuda la diferencia", () => {
  const serie = actualizarPorSalarioMinimo({ pensionCentavos: aCentavos(9000), primerAnio: 2021, ultimoAnio: 2022, tabla: sm });
  const r = generarPlanilla({
    pensionBase: aCentavos(9000),
    serie,
    desde: "2021-01",
    hasta: "2022-12",
    pagoSinActualizar: { monto: aCentavos(9000), desde: "2021-01", hasta: "2022-06" },
  });
  // 2021: 9,872.40 − 9,000 = 872.40 por mes; 2022 ene-jun: diferencia; 2022 jul-dic: pensión completa.
  assert.equal(r.filas[0].pagado, aCentavos(9000));
  assert.equal(r.filas[0].monto, aCentavos(872.40));
  assert.match(r.filas[0].concepto, /DIFERENCIA/);
  assert.equal(r.filas[18].pagado, 0);
  assert.equal(r.saldo, aCentavos(92228.40));
  assert.equal(r.totalPagado, aCentavos(9000) * 18);
});

test("método INPC: pensión de $5,000 fijada en marzo de 2012", () => {
  const serie = actualizarPorINPC({ pensionCentavos: aCentavos(5000), fechaFijacion: "2012-03", ultimoAnio: 2026, inpc });
  const r = porAnio(serie);
  assert.equal(serie[0].mesInicial, "2012-02");
  assert.equal(serie[0].factor, 1.0263);
  assert.equal(r[2013], 513150);
  assert.equal(r[2014], 533522);
  assert.equal(r[2025], 878323);
  assert.equal(r[2026], 910733);
});

test("INPC: un factor menor a 1 no reduce la pensión", () => {
  const serie = actualizarPorINPC({
    pensionCentavos: 100000, fechaFijacion: "2020-01", ultimoAnio: 2021,
    inpc: { "2019-12": 110, "2020-12": 100 },
  });
  assert.equal(serie[0].factor, 1);
  assert.equal(serie[0].pension, 100000);
});

test("otros conceptos: porcentaje a cargo del deudor, pagos parciales y totales por categoría", () => {
  const r = calcularOtrosConceptos([
    { fecha: "2025-08-15", categoria: "Colegiaturas", descripcion: "Inscripción", monto: aCentavos(15000), porcentaje: 50, pagado: 0 },
    { fecha: "2025-03-02", categoria: "Gastos médicos", descripcion: "Ortodoncia", monto: aCentavos(8333.33), porcentaje: 100, pagado: aCentavos(3000) },
    { fecha: "2025-09-01", categoria: "Colegiaturas", descripcion: "Septiembre", monto: aCentavos(4500), porcentaje: 50, pagado: aCentavos(2250) },
    { fecha: "2025-10-01", categoria: "Uniformes", descripcion: "Uniforme", monto: aCentavos(1200), pagado: aCentavos(5000) },
  ]);
  assert.equal(r.filas[0].descripcion, "Ortodoncia");
  assert.equal(r.filas[0].adeudo, aCentavos(5333.33));
  assert.equal(r.porCategoria["Colegiaturas"], aCentavos(7500));
  assert.equal(r.filas[3].adeudo, 0);
  assert.equal(r.total, aCentavos(12833.33));
  const final = liquidacionFinal({ saldoPensiones: aCentavos(250000), otros: r });
  assert.equal(final.total, aCentavos(262833.33));
});

test("otros conceptos actualizados por INPC hasta la fecha de corte", () => {
  const conceptos = [
    { fecha: "2025-03-02", categoria: "Gastos médicos", monto: aCentavos(8333.33), porcentaje: 100, pagado: aCentavos(3000) },
    { fecha: "2025-08-15", categoria: "Colegiaturas", monto: aCentavos(15000), porcentaje: 50, pagado: 0 },
  ];
  const r = calcularOtrosConceptos(conceptos, { inpc, corte: "2026-10" });
  // INPC sep-2026 146.075 / INPC feb-2025 138.726 = 1.0529 → 5,333.33 × 1.0529 = 5,615.46
  assert.equal(r.filas[0].mesAntiguo, "2025-02");
  assert.equal(r.filas[0].mesReciente, "2026-09");
  assert.equal(r.filas[0].factor, 1.0529);
  assert.equal(r.filas[0].historico, aCentavos(5333.33));
  assert.equal(r.filas[0].adeudo, aCentavos(5615.46));
  // 146.075 / 140.780 = 1.0376 → 7,500 × 1.0376 = 7,782.00
  assert.equal(r.filas[1].adeudo, aCentavos(7782));
  assert.equal(r.totalHistorico, aCentavos(12833.33));
  assert.equal(r.total, aCentavos(13397.46));
  const r2 = calcularOtrosConceptos(conceptos, { inpc, corte: "2026-12" });
  assert.equal(r2.filas[0].mesReciente, "2026-09");
});
