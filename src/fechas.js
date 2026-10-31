// Selectores de fecha sencillos: listas desplegables de día, mes y año en lugar del calendario del navegador.
// Cada selector guarda su valor en un <input type="hidden"> con el nombre del campo, en formato AAAA-MM o AAAA-MM-DD.

export const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const ANIO_MIN = 1990;
const ANIO_MAX = new Date().getFullYear() + 2;

const opcion = (valor, texto) => `<option value="${valor}">${texto}</option>`;
const opcionesMes = () => opcion("", "Mes") + MESES.map((m, i) => opcion(String(i + 1).padStart(2, "0"), m[0].toUpperCase() + m.slice(1))).join("");
const opcionesAnio = () => {
  let html = opcion("", "Año");
  for (let a = ANIO_MAX; a >= ANIO_MIN; a--) html += opcion(String(a), String(a));
  return html;
};
const opcionesDia = () => opcion("", "Día") + Array.from({ length: 31 }, (_, i) => opcion(String(i + 1).padStart(2, "0"), String(i + 1))).join("");

/** Crea un selector. tipo: "mes" (AAAA-MM) o "dia" (AAAA-MM-DD). */
export function crearSelector(nombre, tipo = "mes", valor = "", etiqueta = "") {
  const caja = document.createElement("div");
  caja.className = `selector-fecha selector-${tipo}`;
  caja.dataset.nombre = nombre;
  caja.innerHTML = `
    ${tipo === "dia" ? `<select data-parte="dia" aria-label="${etiqueta} día">${opcionesDia()}</select>` : ""}
    <select data-parte="mes" aria-label="${etiqueta} mes">${opcionesMes()}</select>
    <select data-parte="anio" aria-label="${etiqueta} año">${opcionesAnio()}</select>
    <input type="hidden" name="${nombre}">`;
  const oculto = caja.querySelector('input[type="hidden"]');
  const parte = (p) => caja.querySelector(`[data-parte="${p}"]`);
  const sincronizar = () => {
    const a = parte("anio").value, m = parte("mes").value;
    const d = tipo === "dia" ? parte("dia").value : "01";
    oculto.value = a && m && d ? (tipo === "dia" ? `${a}-${m}-${d}` : `${a}-${m}`) : "";
    caja.classList.toggle("incompleto", !oculto.value && [...caja.querySelectorAll("select")].some((s) => s.value));
    caja.dispatchEvent(new Event("change", { bubbles: true }));
  };
  caja.querySelectorAll("select").forEach((s) => s.addEventListener("change", sincronizar));
  caja.fijar = (v) => {
    const [a = "", m = "", d = ""] = (v || "").split("-");
    parte("anio").value = a;
    parte("mes").value = m;
    if (tipo === "dia") parte("dia").value = d;
    oculto.value = v || "";
    caja.classList.remove("incompleto");
  };
  caja.fijar(valor);
  return caja;
}

/** Reemplaza cada <span data-fecha="nombre" data-tipo="mes|dia"> por su selector. */
export function montarSelectores(raiz = document) {
  raiz.querySelectorAll("[data-fecha]").forEach((marca) => {
    const sel = crearSelector(marca.dataset.fecha, marca.dataset.tipo || "mes", marca.dataset.valor || "", marca.dataset.etiqueta || "");
    marca.replaceWith(sel);
  });
}

export function fijarFecha(nombre, valor) {
  const caja = document.querySelector(`.selector-fecha[data-nombre="${nombre}"]`);
  if (caja) caja.fijar(valor);
}

export function mesActual() {
  const hoy = new Date();
  return `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, "0")}`;
}

/** "2026-10" -> "octubre de 2026"; "2026-05-14" -> "14 de mayo de 2026". */
export function fechaLegible(valor) {
  if (!valor) return "";
  const [a, m, d] = valor.split("-");
  const mes = MESES[Number(m) - 1];
  if (!mes) return valor;
  return d ? `${Number(d)} de ${mes} de ${a}` : `${mes} de ${a}`;
}

/** "2026-05-14" -> "14/05/2026"; "2026-10" -> "10/2026". */
export function fechaCorta(valor) {
  if (!valor) return "";
  const [a, m, d] = valor.split("-");
  return d ? `${d}/${m}/${a}` : `${m}/${a}`;
}
