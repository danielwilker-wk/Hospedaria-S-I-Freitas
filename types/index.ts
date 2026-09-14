// =====================================================
// Tipos alinhados com o schema Postgres do hotel S&I
// =====================================================

export type StaffRole = 'rececionista' | 'gerencia' | 'limpeza' | 'admin'
export type RoomStatus = 'vago' | 'ocupado' | 'limpeza' | 'manutencao'
export type OccupancyType = 'individual' | 'duplo'
export type PaymentMethod = 'numerario' | 'tpa' | 'transferencia'
export type StayStatus = 'ativo' | 'finalizado' | 'cancelado'
export type ReservationStatus = 'pendente' | 'confirmada' | 'cancelada' | 'concluida'
export type ReservationSource = 'telefone' | 'whatsapp' | 'email' | 'booking_com' | 'presencial'
export type SummaryStatus = 'rascunho' | 'revisto' | 'enviado'
export type DocumentoTipo = 'bi' | 'passaporte'
export type ShiftPeriod = 'manha' | 'noite'
export type MaintenanceStatus = 'pendente' | 'em_progresso' | 'resolvido'
export type BillingType = 'proprio' | 'empresa'

export interface Property {
  id: string
  name: string
  nif?: string
  address?: string
  created_at: string
}

export interface RoomType {
  id: string
  property_id: string
  name: string
  individual_price: number | null
  duplo_price: number | null
  max_guests: number
}

export interface Room {
  id: string
  property_id: string
  room_type_id: string
  number: string
  status: RoomStatus
  notes?: string
  room_types?: RoomType
}

export interface Staff {
  id: string
  property_id: string
  full_name: string
  role: StaffRole
  phone?: string
  active: boolean
  created_at: string
}

export interface Guest {
  id: string
  full_name: string
  surname?: string
  nif?: string
  nationality?: string
  birth_date?: string
  document_type?: DocumentoTipo
  document_number?: string
  phone?: string
  email?: string
  company?: string
  document_scan_url?: string
  created_at: string
}

export interface Stay {
  id: string
  reservation_id?: string
  property_id: string
  room_id: string
  primary_guest_id: string
  occupancy: OccupancyType
  vehicle_make?: string
  vehicle_color?: string
  vehicle_plate?: string
  check_in_at: string
  check_out_planned_at?: string
  check_out_at?: string
  room_value: number
  amount_paid_reservation: number
  amount_due: number
  billed_to: BillingType
  company_name?: string
  status: StayStatus
  checked_in_by: string
  checked_out_verified_by?: string
  created_at: string
  // joins
  rooms?: Room
  guests?: Guest
}

export interface Payment {
  id: string
  property_id: string
  source_type: 'stay' | 'laundry' | 'restaurant'
  source_id: string
  amount: number
  method: PaymentMethod
  bank_name?: string
  invoice_number?: string
  paid_at: string
  recorded_by: string
}

export interface BreakfastRecord {
  id: string
  property_id: string
  stay_id?: string
  room_id: string
  guest_name: string
  record_date: string
  confirmed: boolean
  recorded_by: string
  created_at: string
}

export interface LaundryRecord {
  id: string
  property_id: string
  stay_id?: string
  room_id?: string
  record_date: string
  description?: string
  value: number
  recorded_by: string
  created_at: string
}

export interface DailySummary {
  id: string
  property_id: string
  summary_date: string
  total_checkins: number
  total_checkouts: number
  total_revenue_rooms: number
  total_revenue_breakfast: number
  total_revenue_laundry: number
  total_revenue_restaurant: number
  total_revenue_overall: number
  generated_at: string
  reviewed_by?: string
  reviewed_at?: string
  sent_at?: string
  status: SummaryStatus
  notes?: string
}

// Vista v_room_occupancy
export interface RoomOccupancy {
  room_number: string
  room_type: string
  room_status: RoomStatus
  stay_id?: string
  guest_name?: string
  occupancy?: OccupancyType
  check_in_at?: string
  check_out_planned_at?: string
  room_value?: number
  amount_due?: number
}
