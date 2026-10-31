# Actualiza Pensión: presentación para el hackathon Claude × Lawgic

**Equipo:** Lic. Enrique Silva (abogado litigante, Guadalajara, Jalisco) y su agente legal «Paco», construido con Claude.
**Demo en línea:** https://enriquesilva02-oss.github.io/hackathon-Claude-Lawgic-Enrique/
**Videos:** `docs/video/pitch-1-minuto.mp4` (pitch de 1 min) · `docs/video/tutorial-actualiza-pension.mp4` (tutorial de 4 min)

---

## Pitch de 3 minutos

### 1. El problema (30 s)
En un juicio de alimentos, el abogado tiene que demostrar cuánto debe hoy un deudor que dejó de pagar o que pagó sin actualizar una pensión fijada hace años. El cálculo se hace a mano o en Excel, año por año, con tablas del salario mínimo copiadas de cualquier lado. **Un solo dato mal tomado se arrastra a todos los años siguientes.** La planilla casi nunca dice de dónde salió cada número, así que es fácil de objetar.

### 2. Lo que descubrimos (30 s)
Al construir la herramienta verificamos cada dato contra el Diario Oficial de la Federación y encontramos errores reales de práctica:
- un MIR de 2021 tomado de la zona fronteriza ($25.45) en lugar del resto del país ($10.46);
- un incremento de 6.97% en 2016, cuando el oficial fue 4.19%.

En una pensión de varios años, errores así pueden mover el adeudo **miles o decenas de miles de pesos**.

### 3. La solución: demo (90 s)
1. **Paso 1:** capturo la pensión ($3,500), el mes en que se fijó (marzo 2012) y el método pactado.
2. **Paso 2:** periodo a cobrar, saldo previo, pagos que hizo sin actualizar y billetes de depósito.
3. **Paso 3:** colegiaturas y gastos médicos, con el porcentaje a cargo del deudor y actualización por INPC.
4. **Calcular:** en un segundo aparecen la mensualidad actualizada, el saldo y el total a liquidar.
5. **Fundamentos:** cada año con su fuente oficial enlazada al DOF o al INEGI, y la jurisprudencia 1a./J. 152/2024 sobre el MIR.
6. **Descargar Word:** el anexo listo para el escrito.

### 4. Por qué importa (20 s)
- **Exactitud:** datos oficiales verificados y pruebas automáticas al centavo.
- **Defendibilidad:** cada número trae su fundamento y su fuente.
- **Privacidad:** nada sale del navegador; ideal para información de menores y familias.
- **Ahorro:** lo que tomaba una tarde en Excel se resuelve en minutos.

### 5. Cómo lo construimos con Claude (10 s)
Todo se construyó en una sola sesión, conversando con el agente:
- Claude verificó la ley y la jurisprudencia en fuentes oficiales: Semanario Judicial, DOF, INEGI y Congreso de Jalisco.
- Programó el motor de cálculo con pruebas.
- Diseñó la interfaz.
- Grabó y narró el video tutorial.

El abogado definió el método, revisó y decidió en cada paso.

---

## Ficha técnica

| | |
|---|---|
| Tipo | Aplicación web estática (HTML, CSS, JavaScript), sin servidor |
| Datos | CONASAMI/DOF 2010-2026 · INEGI INPC 1969-2026 |
| Fundamento | Jurisprudencia 1a./J. 152/2024 (11a.), registro 2029528 · CC Jalisco art. 442 · CFF art. 17-A (analogía) |
| Exportación | Word (.docx) · CSV para Excel · impresión |
| Pruebas | 10 pruebas automáticas (`npm test`) |
| Privacidad | Cálculo local; no se envían ni guardan datos |

## Próximos pasos
- Tablas de salario mínimo para otras zonas del país, no solo Guadalajara.
- Plantillas de escrito completas (promoción de liquidación) con el formato de cada despacho.
- Actualización automática de las tablas cuando el DOF publique el nuevo salario mínimo o el INEGI el nuevo INPC.
