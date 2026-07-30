// jsPDF, jspdf-autotable y SheetJS (xlsx) son librerías pesadas (~500 kB).
// Se importan dinámicamente (lazy-load) dentro de cada función para que
// NO entren al bundle principal: sólo se descargan cuando el usuario
// exporta por primera vez. Mejora el arranque en zonas rurales 3G.
import { fmtCOP, fmtDate, fmtDateTime } from '@/utils/format'

interface ReportColumn {
  /** clave del dato en cada fila */
  key: string
  /** título visible */
  label: string
  /** formato: 'cop' | 'date' | 'datetime' | 'number' | 'text' */
  format?: 'cop' | 'date' | 'datetime' | 'number' | 'text'
}

interface ExportOptions {
  title: string
  subtitle?: string
  farmName?: string
  columns: ReportColumn[]
  rows: Array<Record<string, unknown>>
  /** nombre del archivo sin extensión */
  fileName: string
}

function formatCell(value: unknown, format?: ReportColumn['format']): string {
  if (value === null || value === undefined || value === '') return ''
  switch (format) {
    case 'cop':
      return fmtCOP(Number(value) || 0)
    case 'date':
      return fmtDate(String(value))
    case 'datetime':
      return fmtDateTime(String(value))
    case 'number':
      return String(value)
    default:
      return String(value)
  }
}

/**
 * Exporta un reporte a PDF con encabezado, título, fecha y tabla.
 * Pensado para que el dueño pueda imprimir o compartir por WhatsApp.
 */
export async function exportToPDF(opts: ExportOptions) {
  // Lazy-load de jsPDF y jspdf-autotable (solo al exportar).
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
  ])
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })

  // Encabezado
  doc.setFontSize(18)
  doc.setTextColor(22, 163, 74) // verde marca
  doc.text('🐔 Mi Gallinero', 14, 16)

  doc.setFontSize(14)
  doc.setTextColor(31, 41, 55)
  doc.text(opts.title, 14, 26)

  doc.setFontSize(10)
  doc.setTextColor(100, 116, 139)
  let y = 32
  if (opts.farmName) {
    doc.text(`Granja: ${opts.farmName}`, 14, y)
    y += 5
  }
  if (opts.subtitle) {
    doc.text(opts.subtitle, 14, y)
    y += 5
  }
  doc.text(`Generado: ${fmtDateTime(new Date().toISOString())}`, 14, y)

  // Tabla
  const head = [opts.columns.map((c) => c.label)]
  const body = opts.rows.map((row) =>
    opts.columns.map((c) => formatCell(row[c.key], c.format)),
  )

  autoTable(doc, {
    head,
    body,
    startY: y + 4,
    styles: { fontSize: 9, cellPadding: 2 },
    headStyles: { fillColor: [22, 163, 74], textColor: 255 },
    alternateRowStyles: { fillColor: [240, 253, 244] },
  })

  doc.save(`${opts.fileName}.pdf`)
}

/**
 * Exporta un reporte a Excel (.xlsx) con una hoja por tabla.
 */
export async function exportToExcel(opts: ExportOptions) {
  // Lazy-load de SheetJS (xlsx).
  const XLSX = await import('xlsx')
  // Construimos un array de objetos usando los labels como cabecera.
  const data = opts.rows.map((row) => {
    const obj: Record<string, string | number> = {}
    for (const col of opts.columns) {
      const raw = row[col.key]
      // Para Excel, los números y monedas se dejan como número (sin formatear).
      if (col.format === 'cop' || col.format === 'number') {
        obj[col.label] = Number(raw) || 0
      } else {
        obj[col.label] = formatCell(raw, col.format)
      }
    }
    return obj
  })

  const ws = XLSX.utils.json_to_sheet(data)
  // Anchos de columna automáticos según el label más largo.
  ws['!cols'] = opts.columns.map((c) => ({ wch: Math.max(c.label.length + 4, 14) }))

  const wb = XLSX.utils.book_new()
  const sheetName = opts.title.slice(0, 30) || 'Reporte'
  XLSX.utils.book_append_sheet(wb, ws, sheetName)

  XLSX.writeFile(wb, `${opts.fileName}.xlsx`)
}
