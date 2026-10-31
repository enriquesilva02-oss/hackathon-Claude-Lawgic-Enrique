// Exportación a Word (.docx) con la biblioteca docx (vendor/docx.umd.js, licencia MIT), todo en el navegador.
import { formatoMoneda as fm } from "./engine.js";
import { fechaCorta, fechaLegible } from "./fechas.js";

const D = () => window.docx;
const FUENTE = "Arial";
const ANCHO = 9360; // carta con márgenes de 1.25": 12240 − 2 × 1440 (en DXA)

const texto = (t, opc = {}) => new (D().TextRun)({ text: t, font: FUENTE, size: opc.size ?? 22, bold: opc.bold, underline: opc.underline ? {} : undefined, italics: opc.italics });

function parrafo(t, opc = {}) {
  const { Paragraph, AlignmentType } = D();
  return new Paragraph({
    alignment: opc.centro ? AlignmentType.CENTER : opc.derecha ? AlignmentType.RIGHT : AlignmentType.JUSTIFIED,
    spacing: { after: opc.despues ?? 120, before: opc.antes ?? 0, line: 300 },
    indent: opc.sangria ? { left: 567 } : undefined,
    children: Array.isArray(t) ? t : [texto(t, opc)],
  });
}

const titulo = (t) => parrafo(t, { bold: true, size: 24, antes: 240, despues: 160 });

function tabla(encabezados, filas, anchos, opc = {}) {
  const { Table, TableRow, TableCell, WidthType, ShadingType, AlignmentType, Paragraph } = D();
  const total = anchos.reduce((a, b) => a + b, 0);
  const celda = (t, i, { cabeza = false, negrita = false, fondo } = {}) => new TableCell({
    width: { size: anchos[i], type: WidthType.DXA },
    shading: cabeza ? { type: ShadingType.CLEAR, fill: "E8DDD8", color: "auto" } : fondo ? { type: ShadingType.CLEAR, fill: fondo, color: "auto" } : undefined,
    margins: { top: 40, bottom: 40, left: 80, right: 80 },
    children: [new Paragraph({
      alignment: opc.numericas?.includes(i) && !cabeza ? AlignmentType.RIGHT : AlignmentType.LEFT,
      children: [texto(String(t ?? ""), { size: 17, bold: cabeza || negrita })],
    })],
  });
  return new Table({
    width: { size: total, type: WidthType.DXA },
    columnWidths: anchos,
    rows: [
      new TableRow({ tableHeader: true, children: encabezados.map((h, i) => celda(h, i, { cabeza: true })) }),
      ...filas.map((f) => new TableRow({ children: f.celdas.map((c, i) => celda(c, i, { negrita: f.negrita, fondo: f.fondo })) })),
    ],
  });
}

/**
 * r: resultado del último cálculo (lo arma app.js).
 * doc: {expediente, juzgado, juicio} opcionales, capturados por el usuario.
 */
export async function exportarWord(r, doc = {}) {
  const { Document, Packer, Footer, PageNumber, Paragraph, AlignmentType } = D();
  const c = [];

  if (doc.expediente || doc.juicio) {
    if (doc.expediente) c.push(parrafo(`EXPEDIENTE ${doc.expediente}`, { bold: true, derecha: true, despues: 40 }));
    if (doc.juicio) c.push(parrafo(doc.juicio.toUpperCase(), { bold: true, derecha: true, despues: 200 }));
  }
  if (doc.juzgado) c.push(parrafo(doc.juzgado.toUpperCase(), { bold: true, despues: 200 }));

  c.push(parrafo("ACTUALIZACIÓN DE LA PENSIÓN ALIMENTICIA Y PLANILLA DE LIQUIDACIÓN", { bold: true, centro: true, size: 26, despues: 240 }));
  c.push(parrafo(`Pensión mensual de partida: ${fm(r.d.pension)}, fijada en ${fechaLegible(r.d.fijacion)}. Método de actualización: ${r.d.metodo === "sm" ? "conforme al incremento del salario mínimo (incluido el Monto Independiente de Recuperación desde 2017)" : "conforme al Índice Nacional de Precios al Consumidor"}.`));

  c.push(titulo("I. DESARROLLO DE LA ACTUALIZACIÓN"));
  for (const b of r.desarrollo) {
    c.push(parrafo(b.lineas[0], { bold: true, underline: true, antes: 120, despues: 60 }));
    b.lineas.slice(1, -1).forEach((l) => c.push(parrafo(l, { sangria: true, despues: 40 })));
    c.push(parrafo(b.lineas[b.lineas.length - 1], { sangria: true, bold: true }));
  }

  if (r.planilla) {
    c.push(titulo(`II. PLANILLA DE PENSIONES ADEUDADAS (${fechaLegible(r.d.desde).toUpperCase()} A ${fechaLegible(r.d.hasta).toUpperCase()})`));
    const conPagos = r.planilla.totalPagado > 0;
    const enc = conPagos ? ["Fecha", "Concepto", "Pensión actualizada", "Pagado", "Diferencia", "Saldo"] : ["Fecha", "Concepto", "Monto", "Saldo"];
    const anchos = conPagos ? [1000, 3160, 1300, 1200, 1300, 1400] : [1100, 5060, 1500, 1700];
    const filas = r.planilla.filas.map((f) => ({
      celdas: conPagos
        ? [fechaCorta(f.fecha), f.concepto, f.actualizada !== undefined ? fm(f.actualizada) : "", f.actualizada !== undefined ? fm(f.pagado) : "", fm(f.monto), fm(f.saldo)]
        : [fechaCorta(f.fecha), f.concepto, fm(f.monto), fm(f.saldo)],
    }));
    filas.push({ negrita: true, fondo: "F5EBE6", celdas: conPagos ? ["", "SALDO ADEUDADO", "", "", "", fm(r.planilla.saldo)] : ["", "SALDO ADEUDADO", "", fm(r.planilla.saldo)] });
    c.push(tabla(enc, filas, anchos, { numericas: conPagos ? [2, 3, 4, 5] : [2, 3] }));
  }

  if (r.otros.filas.length) {
    const act = r.otros.actualizado;
    c.push(titulo(`III. OTROS CONCEPTOS${act ? ` (ACTUALIZADOS POR INPC A ${fechaLegible(r.d.corte).toUpperCase()})` : ""}`));
    const enc = act ? ["Fecha", "Concepto", "Monto", "% deudor", "Pagado", "Histórico", "Factor", "Adeudo"] : ["Fecha", "Concepto", "Monto", "% deudor", "Pagado", "Adeudo"];
    const anchos = act ? [950, 2510, 1050, 750, 1000, 1050, 800, 1250] : [1000, 3560, 1300, 900, 1200, 1400];
    const filas = r.otros.filas.map((f) => ({
      celdas: [fechaCorta(f.fecha), `${f.categoria}${f.descripcion ? " — " + f.descripcion : ""}`, fm(f.monto), `${f.porcentaje}%`, fm(f.pagado),
        ...(act ? [fm(f.historico), f.factor !== undefined ? f.factor.toFixed(4) : "—"] : []), fm(f.adeudo)],
    }));
    filas.push({ negrita: true, fondo: "F5EBE6", celdas: [...Array(enc.length - 1).fill(""), fm(r.otros.total)].map((v, i) => (i === 1 ? "TOTAL OTROS CONCEPTOS" : v)) });
    c.push(tabla(enc, filas, anchos, { numericas: act ? [2, 3, 4, 5, 6, 7] : [2, 3, 4, 5] }));
  }

  c.push(titulo(`${r.otros.filas.length ? "IV" : r.planilla ? "III" : "II"}. RESUMEN DE LA LIQUIDACIÓN`));
  const resumen = [
    { celdas: ["Pensiones alimenticias adeudadas", fm(r.liquidacion.saldoPensiones)] },
    { celdas: ["Otros conceptos", fm(r.liquidacion.totalOtros)] },
    { negrita: true, fondo: "F5EBE6", celdas: ["TOTAL A LIQUIDAR", fm(r.liquidacion.total)] },
  ];
  c.push(tabla(["Concepto", "Importe"], resumen, [6560, 2800], { numericas: [1] }));

  c.push(titulo("FUNDAMENTOS Y FUENTES"));
  for (const linea of r.fundamentosTexto.split("\n")) {
    if (!linea.trim()) continue;
    const esTitulo = linea === linea.toUpperCase() && /[A-ZÁÉÍÓÚ]/.test(linea);
    c.push(parrafo(linea, { bold: esTitulo, sangria: linea.startsWith("- "), despues: esTitulo ? 80 : 60, antes: esTitulo ? 120 : 0 }));
  }

  const documento = new Document({
    creator: "Actualiza Pensión",
    title: "Actualización de pensión alimenticia",
    styles: { default: { document: { run: { font: FUENTE, size: 22 } } } },
    sections: [{
      properties: { page: { size: { width: 12240, height: 15840 }, margin: { top: 1440, bottom: 1440, left: 1440, right: 1440 } } },
      footers: {
        default: new Footer({
          children: [new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [texto("Página ", { size: 16 }), new (D().TextRun)({ children: [PageNumber.CURRENT], font: FUENTE, size: 16 }), texto(" · Elaborado con Actualiza Pensión; revise el cálculo antes de presentarlo.", { size: 16, italics: true })],
          })],
        }),
      },
      children: c,
    }],
  });
  const blob = await Packer.toBlob(documento);
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement("a"), { href: url, download: `actualizacion-pension${doc.expediente ? "-" + doc.expediente.replace(/[^\w-]+/g, "-") : ""}.docx` });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export { ANCHO };
