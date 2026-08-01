// jsPDF, jspdf-autotable y SheetJS (xlsx) son librerías pesadas (~500 kB).
// Se importan dinámicamente (lazy-load) dentro de cada función para que NO
// entren al bundle principal: sólo se descargan cuando el usuario exporta por
// primera vez. Mejora el arranque en zonas rurales con 3G.
import { fmtDate, fmtDateTime, fmtMoney, fmtNumber } from '@/utils/format'

interface ReportColumn {
  /** clave del dato en cada fila */
  key: string
  /** título visible */
  label: string
  /** formato de la celda */
  format?: 'money' | 'cop' | 'date' | 'datetime' | 'number' | 'text'
  /**
   * Traducción del valor antes de escribirlo. Necesario para los estados y
   * tipos: en el archivo exportado aparecían en inglés ("void", "partial").
   */
  translate?: (value: unknown) => string
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

/** Los formatos numéricos van como número en Excel, no como texto. */
function isNumeric(format?: ReportColumn['format']): boolean {
  return format === 'money' || format === 'cop' || format === 'number'
}

function formatCell(value: unknown, column: ReportColumn): string {
  if (value === null || value === undefined || value === '') return ''

  if (column.translate) return sanitize(column.translate(value))

  switch (column.format) {
    case 'money':
    case 'cop':
      return fmtMoney(Number(value) || 0)
    case 'date':
      return fmtDate(String(value))
    case 'datetime':
      return fmtDateTime(String(value))
    case 'number':
      return fmtNumber(Number(value) || 0)
    default:
      return sanitize(String(value))
  }
}

/**
 * Neutraliza el texto que una hoja de cálculo podría interpretar como fórmula.
 *
 * Un cliente llamado `=1+1` o `+57...` se evaluaría al abrir el archivo. Los
 * datos los escribe el propio usuario, así que el riesgo es bajo, pero un
 * apóstrofo delante lo elimina por completo y no cuesta nada.
 */
function sanitize(value: string): string {
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value
}

/**
 * Exporta un reporte a PDF con encabezado, título, fecha y tabla.
 * Pensado para imprimir o compartir por WhatsApp.
 */
export async function exportToPDF(opts: ExportOptions): Promise<void> {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
  ])

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })

  doc.setFontSize(18)
  doc.setTextColor(22, 163, 74)
  doc.text('Mi Gallinero', 14, 16)

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

  autoTable(doc, {
    head: [opts.columns.map((c) => c.label)],
    body: opts.rows.map((row) => opts.columns.map((c) => formatCell(row[c.key], c))),
    startY: y + 4,
    styles: { fontSize: 9, cellPadding: 2 },
    headStyles: { fillColor: [22, 163, 74], textColor: 255 },
    alternateRowStyles: { fillColor: [240, 253, 244] },
  })

  doc.save(`${opts.fileName}.pdf`)
}

/**
 * Exporta un reporte a Excel (.xlsx).
 */
export async function exportToExcel(opts: ExportOptions): Promise<void> {
  const XLSX = await import('xlsx')

  const data = opts.rows.map((row) => {
    const out: Record<string, string | number> = {}

    for (const col of opts.columns) {
      const raw = row[col.key]

      // Los importes y cantidades van como número para poder sumarlos en Excel.
      out[col.label] = isNumeric(col.format) && !col.translate
        ? Number(raw) || 0
        : formatCell(raw, col)
    }

    return out
  })

  const sheet = XLSX.utils.json_to_sheet(data)

  sheet['!cols'] = opts.columns.map((c) => ({ wch: Math.max(c.label.length + 4, 14) }))

  const book = XLSX.utils.book_new()

  // Excel limita el nombre de hoja a 31 caracteres y prohíbe : \ / ? * [ ]
  const sheetName = (opts.title.replace(/[:\\/?*[\]]/g, '-').slice(0, 30) || 'Reporte').trim()

  XLSX.utils.book_append_sheet(book, sheet, sheetName)
  XLSX.writeFile(book, `${opts.fileName}.xlsx`)
}
