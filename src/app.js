import { actualizarPorSalarioMinimo, actualizarPorINPC, generarPlanilla, calcularOtrosConceptos, liquidacionFinal, aCentavos, formatoMoneda } from "./engine.js";
import { crearSelector, montarSelectores, fijarFecha, mesActual, fechaLegible, fechaCorta } from "./fechas.js";
import { exportarWord } from "./word.js";

let ultimoResultado = null;

const $ = (sel) => document.querySelector(sel);
const fm = formatoMoneda;
let datos = null;
let ultimaPlanilla = null;
let ultimoTexto = "";

async function cargarDatos() {
  const [sm, inpc, fundamentos] = await Promise.all([
    fetch("data/salario_minimo.json").then((r) => r.json()),
    fetch("data/inpc.json").then((r) => r.json()),
    fetch("data/fundamentos.json").then((r) => r.json()),
  ]);
  datos = { sm: sm.anios, inpc: inpc.valores, fundamentos };
}

function filaLista(clase, html, contenedor) {
  const fila = document.createElement("div");
  fila.className = `fila-lista ${clase}`;
  fila.innerHTML = html + '<button type="button" class="quitar" aria-label="Quitar">×</button>';
  fila.querySelector(".quitar").addEventListener("click", () => { fila.remove(); recalcularSiAplica(); });
  $(contenedor).appendChild(fila);
  return fila;
}

function agregarAbono(valores = {}) {
  const fila = filaLista("fila-abono", `
    <div class="mini fecha">Fecha<span class="hueco"></span></div>
    <label class="mini">Monto<input type="number" step="0.01" min="0" inputmode="decimal" name="abonoMonto" value="${valores.monto ?? ""}" placeholder="0.00"></label>
    <label class="mini">Concepto<input type="text" name="abonoConcepto" value="${valores.concepto || ""}" placeholder="Billetes de depósito, pago, etc."></label>`, "#abonos");
  fila.querySelector(".hueco").replaceWith(crearSelector("abonoFecha", "dia", valores.fecha || "", "Abono:"));
}

function agregarConcepto(v = {}) {
  const fila = filaLista("fila-concepto", `
    <div class="mini fecha">Fecha del gasto<span class="hueco"></span></div>
    <label class="mini">Categoría<input type="text" name="cCategoria" list="categorias" value="${v.categoria || ""}" placeholder="Colegiaturas…"></label>
    <label class="mini">Descripción<input type="text" name="cDescripcion" value="${v.descripcion || ""}" placeholder="p. ej., Inscripción"></label>
    <label class="mini">Monto total<input type="number" step="0.01" min="0" inputmode="decimal" name="cMonto" value="${v.monto ?? ""}" placeholder="0.00"></label>
    <label class="mini">% a cargo del deudor<input type="number" step="1" min="0" max="100" name="cPorcentaje" value="${v.porcentaje ?? 100}"></label>
    <label class="mini">Ya pagó el deudor<input type="number" step="0.01" min="0" inputmode="decimal" name="cPagado" value="${v.pagado ?? ""}" placeholder="0.00"></label>`, "#conceptos");
  fila.querySelector(".hueco").replaceWith(crearSelector("cFecha", "dia", v.fecha || "", "Gasto:"));
}

function leerConceptos() {
  return [...document.querySelectorAll(".fila-concepto")].map((fila) => {
    const val = (n) => fila.querySelector(`[name="${n}"]`).value;
    return {
      fecha: val("cFecha"),
      categoria: val("cCategoria").trim() || "Otros",
      descripcion: val("cDescripcion").trim(),
      monto: aCentavos(val("cMonto") || 0),
      porcentaje: val("cPorcentaje") === "" ? 100 : Number(val("cPorcentaje")),
      pagado: aCentavos(val("cPagado") || 0),
    };
  }).filter((c) => c.monto > 0);
}

function pintarLiquidacion({ planilla, otros, d }) {
  const final = liquidacionFinal({ saldoPensiones: planilla ? planilla.saldo : 0, otros });
  const fila = (cols, clase = "") => `<tr class="${clase}">${cols.map(([v, num]) => `<td class="${num ? "num" : ""}">${v}</td>`).join("")}</tr>`;
  const act = otros.actualizado;
  const cols = act ? 8 : 6;
  const vacias = (n) => Array.from({ length: n }, () => [""]);
  let html = `<thead><tr><th>Fecha</th><th>Concepto</th><th class="num">Monto</th><th class="num">% deudor</th><th class="num">Pagado</th>
    ${act ? '<th class="num">Adeudo histórico</th><th class="num">Factor INPC</th>' : ""}<th class="num">Adeudo${act ? " actualizado" : ""}</th></tr></thead><tbody>`;
  html += `<tr class="subtotal"><td colspan="${cols}"><strong>I. PENSIONES ALIMENTICIAS</strong></td></tr>`;
  if (planilla) {
    html += fila([[fechaCorta(d.hasta)], [`Saldo de pensiones adeudadas (de ${fechaLegible(d.desde)} a ${fechaLegible(d.hasta)})`], [""], [""],
      [planilla.totalPagado ? fm(planilla.totalPagado) : "", true], ...(act ? vacias(2) : []), [fm(planilla.saldo), true]]);
  } else {
    html += fila([[""], ["Sin planilla de pensiones (capture «Desde» y «Hasta»)"], ...vacias(cols - 3), [fm(0), true]]);
  }
  html += `<tr class="subtotal"><td colspan="${cols}"><strong>II. OTROS CONCEPTOS</strong></td></tr>`;
  if (otros.filas.length) {
    const categorias = [...new Set(otros.filas.map((f) => f.categoria))];
    for (const cat of categorias) {
      for (const f of otros.filas.filter((x) => x.categoria === cat)) {
        html += fila([[fechaCorta(f.fecha)], [`${cat}${f.descripcion ? " — " + f.descripcion : ""}`], [fm(f.monto), true],
          [`${f.porcentaje}%`, true], [fm(f.pagado), true],
          ...(act ? [[fm(f.historico), true], [f.factor !== undefined ? `${f.factor.toFixed(4)}<br><small>${f.inpcReciente} / ${f.inpcAntiguo}</small>` : "—", true]] : []),
          [fm(f.adeudo), true]]);
      }
      html += fila([[""], [`Subtotal ${cat}`], ...vacias(cols - 3), [fm(otros.porCategoria[cat]), true]], "subtotal");
    }
  } else {
    html += fila([[""], ["Sin otros conceptos capturados"], ...vacias(cols - 3), [fm(0), true]]);
  }
  html += `</tbody><tfoot>
    ${fila([[""], ["Total I. Pensiones"], ...vacias(cols - 3), [fm(final.saldoPensiones), true]])}
    ${fila([[""], [`Total II. Otros conceptos${act ? ` (actualizados por INPC a ${fechaLegible(d.corte)}; histórico ${fm(otros.totalHistorico)})` : ""}`], ...vacias(cols - 3), [fm(final.totalOtros), true]])}
    ${fila([[""], ["<strong>TOTAL A LIQUIDAR</strong>"], ...vacias(cols - 3), [`<strong>${fm(final.total)}</strong>`, true]], "total-general")}
  </tfoot>`;
  $("#tablaLiquidacion").innerHTML = html;
  return final;
}

let ultimoFundamentos = "";

function pintarFundamentos({ d, sm, inpc, otros }) {
  const F = datos.fundamentos;
  const html = [];
  const texto = [];
  const parrafo = (t) => { html.push(`<p>${t}</p>`); texto.push(t.replace(/<[^>]+>/g, "")); };
  const titulo = (t) => { html.push(`<h3>${t}</h3>`); texto.push("", t.toUpperCase()); };
  const cita = (t) => { html.push(`<blockquote>${t}</blockquote>`); texto.push(`«${t}»`); };

  if (d.metodo === "sm") {
    const J = F.salario_minimo.jurisprudencia;
    titulo(`I. ${F.salario_minimo.titulo}`);
    if (sm.some((a) => a.metodo === "porcentaje")) parrafo(F.salario_minimo.metodo_porcentaje);
    if (sm.some((a) => a.metodo === "mir")) {
      parrafo(F.salario_minimo.metodo_mir);
      parrafo(`Sirve de sustento la jurisprudencia ${J.clave}, registro digital <a href="${J.url}" target="_blank" rel="noopener">${J.registro}</a>, ${J.instancia}, ${J.epoca}, materia ${J.materia.toLowerCase()}, ${J.fuente}, de rubro:`);
      cita(J.rubro);
      parrafo(`De aplicación obligatoria a partir del ${J.obligatoria_desde}.`);
    }
    parrafo(F.salario_minimo.datos);
    const filas = sm.map((a) => {
      const dato = datos.sm[String(a.anio)];
      const fuente = dato.fuente
        ? `<a href="${dato.fuente}" target="_blank" rel="noopener">${dato.dof ? "DOF " + dato.dof : "CONASAMI"}</a>`
        : '<span class="sin-verificar">por verificar en el DOF</span>';
      const datoTxt = a.metodo === "mir" ? `MIR ${fm(a.mir)} + ${pct(a.fijacion)} por fijación` : `${pct(a.pct)} de incremento`;
      texto.push(`- ${a.anio}: ${datoTxt}${dato.sm ? `; salario mínimo ${fm(aCentavos(dato.sm))}` : ""}. Fuente: ${dato.fuente ? (dato.dof ? "DOF " + dato.dof + " " : "") + dato.fuente : "por verificar en el DOF"}.`);
      return `<tr><td>${a.anio}</td><td class="num">${dato.sm ? fm(aCentavos(dato.sm)) : "—"}</td><td>${datoTxt}</td><td>${fuente}</td></tr>`;
    });
    html.push(`<div class="tabla-envoltura"><table><thead><tr><th>Año</th><th class="num">Salario mínimo</th><th>Dato aplicado</th><th>Fuente</th></tr></thead><tbody>${filas.join("")}</tbody></table></div>`);
  } else {
    titulo(`I. ${F.inpc.titulo}`);
    parrafo(`Con fundamento en el ${F.inpc.norma}, que dispone:`);
    cita(F.inpc.texto);
    parrafo(F.inpc.metodo);
    parrafo(`Fuente de los índices: ${F.inpc.fuente_datos} (<a href="${F.inpc.url}" target="_blank" rel="noopener">inegi.org.mx</a>).`);
    const filas = inpc.map((a) => {
      texto.push(`- ${a.anio}: INPC ${a.mesFinal} ${a.inpcFinal} / INPC ${a.mesInicial} ${a.inpcInicial} = ${a.factor.toFixed(4)}.`);
      return `<tr><td>${a.anio}</td><td>${a.mesFinal}: ${a.inpcFinal}</td><td>${a.mesInicial}: ${a.inpcInicial}</td><td class="num">${a.factor.toFixed(4)}</td></tr>`;
    });
    html.push(`<div class="tabla-envoltura"><table><thead><tr><th>Año</th><th>INPC reciente</th><th>INPC anterior</th><th class="num">Factor</th></tr></thead><tbody>${filas.join("")}</tbody></table></div>`);
  }

  if (otros && otros.filas.length) {
    titulo(`II. ${F.otros_conceptos.titulo}`);
    if (otros.actualizado) {
      parrafo(F.otros_conceptos.metodo);
      parrafo(F.otros_conceptos.analogia);
      parrafo(`Fuente de los índices: ${F.inpc.fuente_datos}`);
      for (const f of otros.filas) {
        if (f.factor !== undefined) texto.push(`- ${f.fecha} ${f.categoria}: INPC ${f.mesReciente} ${f.inpcReciente} / INPC ${f.mesAntiguo} ${f.inpcAntiguo} = ${f.factor.toFixed(4)}.`);
      }
    } else {
      parrafo("Los otros conceptos se liquidan a su valor histórico: monto del gasto, por el porcentaje a cargo del deudor, menos lo que éste haya pagado.");
    }
  }

  titulo("Criterio de cálculo");
  parrafo(F.redondeo);
  parrafo(`Datos verificados en fuentes oficiales al ${F.verificado}.`);
  $("#fundamentos").innerHTML = html.join("");
  ultimoFundamentos = texto.join("\n").trim();
}

function leerFormulario() {
  const f = new FormData($("#formulario"));
  const abonos = [...document.querySelectorAll(".fila-abono")]
    .map((fila) => ({
      fecha: fila.querySelector('[name="abonoFecha"]').value,
      monto: aCentavos(fila.querySelector('[name="abonoMonto"]').value || 0),
      concepto: fila.querySelector('[name="abonoConcepto"]').value.trim().toUpperCase() || "ABONO",
    }))
    .filter((a) => a.monto > 0);
  const saldoMonto = f.get("saldoMonto");
  const pagoSinActualizar = f.get("pagoActivo") && f.get("pagoMonto") ? {
    monto: aCentavos(f.get("pagoMonto")),
    desde: f.get("pagoDesde") || "",
    hasta: f.get("pagoHasta") || "",
  } : null;
  return {
    otrosInpc: !!f.get("otrosInpc"),
    corte: f.get("corte") || f.get("hasta") || "",
    pagoSinActualizar,
    pension: aCentavos(f.get("pension")),
    fijacion: f.get("fijacion"),
    metodo: f.get("metodo"),
    primerAnio: Number(f.get("primerAnio")),
    ultimoAnio: Number(f.get("ultimoAnio")),
    desde: f.get("desde"),
    hasta: f.get("hasta"),
    dia: Number(f.get("dia") || 5),
    saldoInicial: saldoMonto ? {
      monto: aCentavos(saldoMonto),
      fecha: f.get("saldoFecha") || "",
      concepto: (f.get("saldoConcepto") || "SALDO INICIAL").toUpperCase(),
    } : null,
    abonos,
  };
}

const pct = (n) => `${Number(n).toLocaleString("es-MX", { maximumFractionDigits: 2 })}%`;

function textoSalarioMinimo(serie) {
  return serie.map((a) => {
    const lineas = [`Año ${a.anio}`];
    if (a.metodo === "porcentaje") {
      lineas.push(`Pensión diciembre ${a.anio - 1}, ${fm(a.anterior)}.`);
      lineas.push(`El incremento del salario mínimo fue de ${pct(a.pct)}, lo que representa la cantidad de ${fm(a.incremento)}.`);
    } else {
      const dato = datos.sm[String(a.anio)];
      if (dato.sm) lineas.push(`Salario mínimo: ${fm(aCentavos(dato.sm))}.`);
      lineas.push(`Monto Independiente de Recuperación (MIR) ${fm(a.mir)} e incremento por fijación de ${pct(a.fijacion)}.`);
      lineas.push(`Pensión ${fm(a.anterior)}.`);
      lineas.push(`${fm(a.anterior)} / 30 = ${fm(a.diario)}`);
      lineas.push(`Diario ${fm(a.diario)} + Valor MIR ${fm(a.mir)} = ${fm(a.conMir)}`);
      lineas.push(`${pct(a.fijacion)} de ${fm(a.conMir)} = ${fm(a.montoFijacion)}`);
      lineas.push(`${fm(a.conMir)} + ${fm(a.montoFijacion)} = ${fm(a.diarioActualizado)}`);
      lineas.push(`${fm(a.diarioActualizado)} X 30 = ${fm(a.pension)}`);
    }
    lineas.push(`La cantidad de pensión actualizada para el año ${a.anio} es de ${fm(a.pension)} mensualmente.`);
    return { anio: a.anio, lineas, verificado: a.verificado };
  });
}

function textoINPC(serie) {
  return serie.map((a) => ({
    anio: a.anio,
    verificado: true,
    lineas: [
      `Año ${a.anio}`,
      `Pensión anterior ${fm(a.anterior)}.`,
      `INPC ${a.mesFinal}: ${a.inpcFinal} / INPC ${a.mesInicial}: ${a.inpcInicial} = factor ${a.factor.toFixed(4)}.`,
      `${fm(a.anterior)} × ${a.factor.toFixed(4)} = ${fm(a.pension)}`,
      `La cantidad de pensión actualizada para el año ${a.anio} es de ${fm(a.pension)} mensualmente.`,
    ],
  }));
}

function pintarDesarrollo(bloques) {
  $("#desarrollo").innerHTML = bloques.map((b) => `
    <div class="anio">
      <h3>${b.lineas[0]} ${b.verificado ? "" : '<span class="sin-verificar">(dato por verificar en el DOF)</span>'}</h3>
      ${b.lineas.slice(1, -1).map((l) => `<p>${l}</p>`).join("")}
      <p class="total">${b.lineas[b.lineas.length - 1]}</p>
    </div>`).join("");
  ultimoTexto = bloques.map((b) => b.lineas.join("\n")).join("\n\n");
}

function pintarComparativo(sm, inpc) {
  const porSm = Object.fromEntries(sm.map((a) => [a.anio, a.pension]));
  const porInpc = Object.fromEntries(inpc.map((a) => [a.anio, a.pension]));
  const anios = [...new Set([...Object.keys(porSm), ...Object.keys(porInpc)])].map(Number).sort((a, b) => a - b);
  $("#tablaComparativo").innerHTML = `
    <thead><tr><th>Año</th><th class="num">Salario mínimo</th><th class="num">INPC</th><th class="num">Diferencia</th></tr></thead>
    <tbody>${anios.map((y) => {
      const a = porSm[y], b = porInpc[y];
      return `<tr><td>${y}</td><td class="num">${a !== undefined ? fm(a) : "—"}</td><td class="num">${b !== undefined ? fm(b) : "—"}</td>
        <td class="num">${a !== undefined && b !== undefined ? fm(a - b) : "—"}</td></tr>`;
    }).join("")}</tbody>`;
}

function pintarPlanilla(planilla) {
  ultimaPlanilla = planilla;
  const conPagos = planilla.totalPagado > 0;
  const celda = (v) => `<td class="num">${v === undefined ? "" : fm(v)}</td>`;
  $("#tablaPlanilla").innerHTML = `
    <thead><tr><th>Fecha</th><th>Concepto</th>
      ${conPagos ? '<th class="num">Pensión actualizada</th><th class="num">Pagado</th><th class="num">Diferencia</th>' : '<th class="num">Monto</th>'}
      <th class="num">Saldo</th></tr></thead>
    <tbody>${planilla.filas.map((f) => `<tr class="${f.monto < 0 ? "negativo" : ""}"><td>${fechaCorta(f.fecha)}</td><td>${f.concepto}</td>
      ${conPagos ? celda(f.actualizada) + celda(f.actualizada === undefined ? undefined : f.pagado) : ""}
      ${celda(f.monto)}${celda(f.saldo)}</tr>`).join("")}</tbody>
    <tfoot>
      ${conPagos ? `<tr><th colspan="2">TOTALES</th>${celda(planilla.totalActualizado)}${celda(planilla.totalPagado)}<td></td><td></td></tr>` : ""}
      <tr><th colspan="${conPagos ? 5 : 3}">SALDO ADEUDADO</th><th class="num">${fm(planilla.saldo)}</th></tr>
    </tfoot>`;
}

function calcular(e) {
  e?.preventDefault();
  const d = leerFormulario();
  const avisos = [];
  let sm = [], inpc = [];
  try {
    sm = actualizarPorSalarioMinimo({ pensionCentavos: d.pension, primerAnio: d.primerAnio, ultimoAnio: d.ultimoAnio, tabla: datos.sm });
  } catch (err) { avisos.push(err.message); }
  try {
    inpc = actualizarPorINPC({ pensionCentavos: d.pension, fechaFijacion: d.fijacion, ultimoAnio: d.ultimoAnio, inpc: datos.inpc });
  } catch (err) { avisos.push(`INPC: ${err.message}`); }
  if (sm.some((a) => !a.verificado)) avisos.push("Hay datos de salario mínimo sin verificar. Revíselos antes de presentar el cálculo.");
  if (!d.fijacion) avisos.push("Elija el mes en que se fijó la pensión (paso 1).");
  const primerConDatos = Math.min(...Object.keys(datos.sm).map(Number));
  if (d.fijacion && Number(d.fijacion.slice(0, 4)) + 1 < primerConDatos) {
    avisos.push(`La tabla de salario mínimo inicia en ${primerConDatos}; los incrementos se calculan a partir de ese año.`);
  }
  const serie = d.metodo === "sm" ? sm : inpc;
  const desarrollo = d.metodo === "sm" ? textoSalarioMinimo(sm) : textoINPC(inpc);
  pintarDesarrollo(desarrollo);
  pintarComparativo(sm, inpc);

  const final = serie.length ? serie[serie.length - 1] : null;
  const kpis = [
    [fm(d.pension), "mensualidad de partida"],
    [final ? fm(final.pension) : "—", `mensualidad ${final ? final.anio : ""} (${d.metodo === "sm" ? "salario mínimo" : "INPC"})`],
  ];
  let planilla = null;
  if (d.desde && d.hasta) {
    planilla = generarPlanilla({
      pensionBase: d.pension, serie, desde: d.desde, hasta: d.hasta, dia: d.dia,
      saldoInicial: d.saldoInicial, abonos: d.abonos, pagoSinActualizar: d.pagoSinActualizar,
    });
    pintarPlanilla(planilla);
    if (planilla.totalPagado > 0) kpis.push([fm(planilla.totalPagado), "pagado sin actualizar (se descuenta)"]);
    kpis.push([fm(planilla.saldo), `saldo adeudado a ${fechaLegible(d.hasta)}`]);
  } else {
    $("#tablaPlanilla").innerHTML = "<tbody><tr><td>Elija el periodo «Desde» y «Hasta» en el paso 2 para generar la planilla.</td></tr></tbody>";
    ultimaPlanilla = null;
  }
  let otros;
  try {
    otros = calcularOtrosConceptos(leerConceptos(), d.otrosInpc && d.corte ? { inpc: datos.inpc, corte: d.corte } : null);
  } catch (err) {
    avisos.push(`Otros conceptos: ${err.message}`);
    otros = calcularOtrosConceptos(leerConceptos());
  }
  if (d.otrosInpc && !d.corte) avisos.push("Indique la fecha de corte para actualizar los otros conceptos por INPC.");
  const liquidacion = pintarLiquidacion({ planilla, otros, d });
  pintarFundamentos({ d, sm, inpc, otros });
  ultimoResultado = { d, desarrollo, planilla, otros, liquidacion, fundamentosTexto: ultimoFundamentos };
  if (otros.filas.length) {
    kpis.push([fm(otros.total), "otros conceptos adeudados"]);
    kpis.push([fm(liquidacion.total), "total a liquidar"]);
  }
  $("#resumen").innerHTML = kpis.map(([v, t], i) => `<div class="kpi${i === kpis.length - 1 ? " destacado" : ""}"><b>${v}</b><small>${t}</small></div>`).join("");
  $("#avisos").innerHTML = avisos.map((a) => `<div class="aviso">${a}</div>`).join("");
  const primeraVez = $("#resultados").hidden;
  $("#resultados").hidden = false;
  if (e && primeraVez) $("#resultados").scrollIntoView({ behavior: "smooth", block: "start" });
  $("#estado").textContent = "✓ Actualizado";
  clearTimeout(calcular.t);
  calcular.t = setTimeout(() => { $("#estado").textContent = ""; }, 1600);
}

let espera;
function recalcularSiAplica() {
  if ($("#resultados").hidden) return;
  clearTimeout(espera);
  espera = setTimeout(() => calcular(), 350);
}

function mostrarPestana(nombre) {
  document.querySelectorAll(".pestanas button").forEach((b) => b.classList.toggle("activa", b.dataset.tab === nombre));
  document.querySelectorAll(".panel").forEach((p) => { p.hidden = p.id !== `panel-${nombre}`; });
}

function descargarCSV() {
  if (!ultimaPlanilla) return;
  const p = (c) => (c === undefined ? "" : (c / 100).toFixed(2));
  const filas = [["Fecha", "Concepto", "Pensión actualizada", "Pagado", "Adeudo del mes", "Saldo"],
    ...ultimaPlanilla.filas.map((f) => [f.fecha, f.concepto, p(f.actualizada), f.actualizada === undefined ? "" : p(f.pagado), p(f.monto), p(f.saldo)])];
  const csv = "﻿" + filas.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\r\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const a = Object.assign(document.createElement("a"), { href: url, download: "planilla-pension.csv" });
  a.click();
  URL.revokeObjectURL(url);
}

function cargarEjemplo() {
  const f = $("#formulario");
  // Caso ficticio de demostración.
  f.pension.value = "3500";
  fijarFecha("fijacion", "2012-03");
  f.querySelector('[name="metodo"][value="sm"]').checked = true;
  f.primerAnio.value = "2013";
  f.primerAnio.dataset.tocado = "1";
  f.ultimoAnio.value = "2026";
  fijarFecha("desde", "2024-01");
  fijarFecha("hasta", "2026-10");
  f.dia.value = "1";
  f.saldoMonto.value = "180000";
  fijarFecha("saldoFecha", "2023-12-15");
  f.saldoConcepto.value = "SALDO DE LIQUIDACIÓN PREVIA";
  $("#abonos").innerHTML = "";
  agregarAbono({ fecha: "2025-06-10", monto: "15000", concepto: "BILLETE DE DEPÓSITO" });
  $("#conceptos").innerHTML = "";
  agregarConcepto({ fecha: "2025-08-20", categoria: "Colegiaturas", descripcion: "Inscripción", monto: "12000", porcentaje: 50, pagado: "" });
  agregarConcepto({ fecha: "2025-03-10", categoria: "Gastos médicos", descripcion: "Consulta y estudios", monto: "6000", porcentaje: 100, pagado: "1500" });
  calcular(new Event("submit"));
}

function limpiar() {
  const f = $("#formulario");
  f.reset();
  ["fijacion", "desde", "hasta", "saldoFecha", "pagoDesde", "pagoHasta", "corte"].forEach((n) => fijarFecha(n, ""));
  delete f.primerAnio.dataset.tocado;
  f.pension.value = "";
  f.ultimoAnio.value = String(new Date().getFullYear());
  $("#abonos").innerHTML = "";
  $("#conceptos").innerHTML = "";
  $("#pagoCampos").hidden = true;
  $("#otrosInpcCampos").hidden = true;
  $("#resultados").hidden = true;
  window.scrollTo({ top: 0, behavior: "smooth" });
}

document.addEventListener("DOMContentLoaded", async () => {
  montarSelectores();
  const f = $("#formulario");
  const anioActual = new Date().getFullYear();
  for (let a = anioActual + 1; a >= 2009; a--) f.ultimoAnio.insertAdjacentHTML("beforeend", `<option value="${a}">${a}</option>`);
  f.ultimoAnio.value = String(Math.min(anioActual, 2026));
  const sugerirPrimerAnio = () => {
    const fij = f.fijacion.value;
    const primerConDatos = datos ? Math.min(...Object.keys(datos.sm).map(Number)) : 2010;
    if (fij && !f.primerAnio.dataset.tocado) f.primerAnio.value = String(Math.max(Number(fij.slice(0, 4)) + 1, primerConDatos));
  };
  f.primerAnio.addEventListener("input", () => { f.primerAnio.dataset.tocado = "1"; });
  f.addEventListener("change", (ev) => { if (ev.target.closest?.('[data-nombre="fijacion"]')) sugerirPrimerAnio(); recalcularSiAplica(); });
  f.addEventListener("input", recalcularSiAplica);
  $("#hastaHoy").addEventListener("click", () => { fijarFecha("hasta", mesActual()); recalcularSiAplica(); });
  $("#limpiar").addEventListener("click", limpiar);
  $("#descargarWord").addEventListener("click", async () => {
    if (!ultimoResultado) return;
    const boton = $("#descargarWord");
    boton.disabled = true;
    boton.textContent = "Generando…";
    try {
      await exportarWord(ultimoResultado, {
        expediente: f.docExpediente.value.trim(),
        juicio: f.docJuicio.value.trim(),
        juzgado: f.docJuzgado.value.trim(),
      });
    } finally {
      boton.disabled = false;
      boton.textContent = "⬇ Descargar Word";
    }
  });
  await cargarDatos();
  sugerirPrimerAnio();
  $("#formulario").addEventListener("submit", calcular);
  $("#agregarAbono").addEventListener("click", () => agregarAbono());
  $("#agregarConcepto").addEventListener("click", () => agregarConcepto());
  $("#copiarFundamentos").addEventListener("click", async () => {
    await navigator.clipboard.writeText(ultimoFundamentos);
    $("#copiarFundamentos").textContent = "Copiado ✓";
    setTimeout(() => { $("#copiarFundamentos").textContent = "Copiar fundamentos para el escrito"; }, 1800);
  });
  const casillaInpc = document.querySelector('[name="otrosInpc"]');
  casillaInpc.addEventListener("change", () => {
    $("#otrosInpcCampos").hidden = !casillaInpc.checked;
    if (casillaInpc.checked && !f.corte.value) fijarFecha("corte", f.hasta.value || mesActual());
  });
  const casilla = document.querySelector('[name="pagoActivo"]');
  casilla.addEventListener("change", () => {
    $("#pagoCampos").hidden = !casilla.checked;
    if (casilla.checked && !f.pagoMonto.value) f.pagoMonto.value = f.pension.value;
  });
  $("#cargarEjemplo").addEventListener("click", cargarEjemplo);
  $("#descargarCSV").addEventListener("click", descargarCSV);
  $("#copiarDesarrollo").addEventListener("click", async () => {
    await navigator.clipboard.writeText(ultimoTexto);
    $("#copiarDesarrollo").textContent = "Copiado ✓";
    setTimeout(() => { $("#copiarDesarrollo").textContent = "Copiar texto para el escrito"; }, 1800);
  });
  document.querySelectorAll(".pestanas button").forEach((b) => b.addEventListener("click", () => mostrarPestana(b.dataset.tab)));
});
