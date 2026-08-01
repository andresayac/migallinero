import type { ChickenMovementType, IncidentSeverity, IncidentStatus, Role, SaleStatus } from '@/types/domain'

/**
 * Etiquetas legibles de los valores de enumeración.
 *
 * Estaban duplicadas en cada vista, y algunas pantallas (la tabla de reportes y
 * los archivos exportados) mostraban el valor crudo en inglés: el granjero veía
 * "Void" o "partial" en su reporte.
 */

const SALE_STATUS: Record<SaleStatus, string> = {
  paid: 'Pagada',
  partial: 'Parcial',
  pending: 'Pendiente',
  void: 'Anulada',
}

const SALE_STATUS_STYLE: Record<SaleStatus, string> = {
  paid: 'bg-grass-100 text-grass-700',
  partial: 'bg-brand-100 text-brand-700',
  pending: 'bg-alert-100 text-alert-700',
  void: 'bg-slate-200 text-slate-500 line-through',
}

const MOVEMENT_TYPE: Record<ChickenMovementType, string> = {
  buy: 'Compra',
  birth: 'Nacimiento',
  death: 'Muerte',
  sale: 'Venta',
  revoke: 'Retiro',
  transfer: 'Traslado',
  adjust: 'Ajuste',
}

const SEVERITY: Record<IncidentSeverity, string> = {
  low: 'Baja',
  med: 'Media',
  high: 'Alta',
}

const INCIDENT_STATUS: Record<IncidentStatus, string> = {
  open: 'Abierta',
  reviewed: 'Revisada',
  solved: 'Resuelta',
}

const ROLE: Record<Role, string> = {
  admin: 'Administrador',
  vendedor: 'Vendedor',
  operario: 'Operario',
}

const SHIFT: Record<string, string> = {
  morning: 'Mañana',
  afternoon: 'Tarde',
}

export function saleStatusLabel(status: string): string {
  return SALE_STATUS[status as SaleStatus] ?? status
}

export function saleStatusClass(status: string): string {
  return SALE_STATUS_STYLE[status as SaleStatus] ?? 'bg-slate-100 text-slate-600'
}

export function movementTypeLabel(type: string): string {
  return MOVEMENT_TYPE[type as ChickenMovementType] ?? type
}

export function severityLabel(severity: string): string {
  return SEVERITY[severity as IncidentSeverity] ?? severity
}

export function incidentStatusLabel(status: string): string {
  return INCIDENT_STATUS[status as IncidentStatus] ?? status
}

export function roleLabel(role: string): string {
  return ROLE[role as Role] ?? role
}

export function shiftLabel(shift: string): string {
  return SHIFT[shift] ?? shift
}
