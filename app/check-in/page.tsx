'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { LogIn, CheckCircle } from 'lucide-react'

const PROPERTY_ID = '00000000-0000-0000-0000-000000000001'

export default function CheckInPage() {
  const router = useRouter()
  const [rooms, setRooms] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [success, setSuccess] = useState(false)
  const [staffId, setStaffId] = useState('')

  const [form, setForm] = useState({
    room_id: '',
    occupancy: 'individual',
    full_name: '',
    surname: '',
    nationality: '',
    document_type: 'bi',
    document_number: '',
    birth_date: '',
    phone: '',
    email: '',
    vehicle_plate: '',
    vehicle_make: '',
    vehicle_color: '',
    check_out_planned_at: '',
    amount_paid_reservation: '0',
  })

  useEffect(() => {
    const supabase = createClient()
    async function load() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push('/auth/login'); return }
      setStaffId(session.user.id)

      const { data } = await supabase
        .from('rooms')
        .select('*, room_types(name, individual_price, duplo_price)')
        .eq('property_id', PROPERTY_ID)
        .eq('status', 'vago')
        .order('number')

      setRooms(data ?? [])
      setLoading(false)
    }
    load()
  }, [router])

  const selectedRoom = rooms.find(r => r.id === form.room_id)
  const roomValue = selectedRoom
    ? (form.occupancy === 'individual'
        ? selectedRoom.room_types?.individual_price
        : selectedRoom.room_types?.duplo_price) ?? 0
    : 0
  const amountDue = roomValue - Number(form.amount_paid_reservation)

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    const supabase = createClient()

    // 1. Criar hóspede
    const { data: guest, error: guestError } = await supabase
      .from('guests')
      .insert({
        full_name: form.full_name,
        surname: form.surname,
        nationality: form.nationality,
        document_type: form.document_type,
        document_number: form.document_number,
        birth_date: form.birth_date || null,
        phone: form.phone,
        email: form.email,
      })
      .select()
      .single()

    if (guestError) { alert('Erro ao criar hóspede: ' + guestError.message); setSaving(false); return }

    // 2. Criar estadia
    const { error: stayError } = await supabase
      .from('stays')
      .insert({
        property_id: PROPERTY_ID,
        room_id: form.room_id,
        primary_guest_id: guest.id,
        occupancy: form.occupancy,
        vehicle_plate: form.vehicle_plate || null,
        vehicle_make: form.vehicle_make || null,
        vehicle_color: form.vehicle_color || null,
        check_out_planned_at: form.check_out_planned_at || null,
        room_value: roomValue,
        amount_paid_reservation: Number(form.amount_paid_reservation),
        amount_due: amountDue,
        checked_in_by: staffId,
      })

    if (stayError) { alert('Erro ao criar estadia: ' + stayError.message); setSaving(false); return }

    setSuccess(true)
    setSaving(false)

    setTimeout(() => {
      setSuccess(false)
      setForm({
        room_id: '', occupancy: 'individual', full_name: '', surname: '',
        nationality: '', document_type: 'bi', document_number: '', birth_date: '',
        phone: '', email: '', vehicle_plate: '', vehicle_make: '', vehicle_color: '',
        check_out_planned_at: '', amount_paid_reservation: '0',
      })
      window.location.reload()
    }, 2000)
  }

  if (loading) return <div className="flex items-center justify-center h-64"><p className="text-ink-muted text-sm">A carregar...</p></div>

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-ink flex items-center gap-2">
          <LogIn size={20} className="text-brand-500" /> Check-in
        </h1>
        <p className="text-sm text-ink-muted mt-0.5">Registo de entrada de novo hóspede</p>
      </div>

      {success && (
        <div className="card border-green-300 bg-green-50 flex items-center gap-3 text-green-700">
          <CheckCircle size={18}/>
          <span className="font-medium">Check-in registado com sucesso!</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Quarto e ocupação */}
        <div className="card space-y-4">
          <h2 className="text-xs font-bold text-ink-muted uppercase tracking-wide">Quarto</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Quarto</label>
              <select name="room_id" required className="input" value={form.room_id} onChange={handleChange}>
                <option value="">Seleccionar quarto</option>
                {rooms.map(r => (
                  <option key={r.id} value={r.id}>
                    Nº {r.number} — {r.room_types?.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Ocupação</label>
              <select name="occupancy" className="input" value={form.occupancy} onChange={handleChange}>
                <option value="individual">Individual</option>
                <option value="duplo">Duplo</option>
              </select>
            </div>
          </div>
          {selectedRoom && (
            <div className="grid grid-cols-3 gap-3 text-sm bg-surface-muted rounded-lg p-3">
              <div><p className="text-ink-light text-xs">Preço/noite</p><p className="font-semibold">{roomValue.toLocaleString('pt-AO')} Kz</p></div>
              <div><p className="text-ink-light text-xs">Pago na reserva</p><p className="font-semibold">{Number(form.amount_paid_reservation).toLocaleString('pt-AO')} Kz</p></div>
              <div><p className="text-ink-light text-xs">Valor a pagar</p><p className="font-bold text-brand-500">{amountDue.toLocaleString('pt-AO')} Kz</p></div>
            </div>
          )}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Check-out previsto</label>
              <input type="datetime-local" name="check_out_planned_at" className="input" value={form.check_out_planned_at} onChange={handleChange}/>
            </div>
            <div>
              <label className="label">Pago na reserva (Kz)</label>
              <input type="number" name="amount_paid_reservation" className="input" value={form.amount_paid_reservation} onChange={handleChange} min="0"/>
            </div>
          </div>
        </div>

        {/* Dados do hóspede */}
        <div className="card space-y-4">
          <h2 className="text-xs font-bold text-ink-muted uppercase tracking-wide">Dados do Hóspede</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Nome(s)</label>
              <input type="text" name="full_name" required className="input" placeholder="Nome" value={form.full_name} onChange={handleChange}/>
            </div>
            <div>
              <label className="label">Apelido</label>
              <input type="text" name="surname" className="input" placeholder="Apelido" value={form.surname} onChange={handleChange}/>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Nacionalidade</label>
              <input type="text" name="nationality" className="input" placeholder="Ex: Angolana" value={form.nationality} onChange={handleChange}/>
            </div>
            <div>
              <label className="label">Data de Nascimento</label>
              <input type="date" name="birth_date" className="input" value={form.birth_date} onChange={handleChange}/>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Tipo de Documento</label>
              <select name="document_type" className="input" value={form.document_type} onChange={handleChange}>
                <option value="bi">BI</option>
                <option value="passaporte">Passaporte</option>
              </select>
            </div>
            <div>
              <label className="label">Nº do Documento</label>
              <input type="text" name="document_number" className="input" placeholder="Nº BI / Passaporte" value={form.document_number} onChange={handleChange}/>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Telemóvel</label>
              <input type="tel" name="phone" className="input" placeholder="+244 9XX XXX XXX" value={form.phone} onChange={handleChange}/>
            </div>
            <div>
              <label className="label">E-mail</label>
              <input type="email" name="email" className="input" placeholder="opcional" value={form.email} onChange={handleChange}/>
            </div>
          </div>
        </div>

        {/* Viatura */}
        <div className="card space-y-4">
          <h2 className="text-xs font-bold text-ink-muted uppercase tracking-wide">Viatura (opcional)</h2>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="label">Matrícula</label>
              <input type="text" name="vehicle_plate" className="input" placeholder="LD-00-00-AA" value={form.vehicle_plate} onChange={handleChange}/>
            </div>
            <div>
              <label className="label">Marca</label>
              <input type="text" name="vehicle_make" className="input" placeholder="Ex: Toyota" value={form.vehicle_make} onChange={handleChange}/>
            </div>
            <div>
              <label className="label">Cor</label>
              <input type="text" name="vehicle_color" className="input" placeholder="Ex: Branco" value={form.vehicle_color} onChange={handleChange}/>
            </div>
          </div>
        </div>

        <button type="submit" disabled={saving || !form.room_id || !form.full_name} className="btn-primary w-full py-3">
          {saving ? 'A registar...' : 'Confirmar Check-in'}
        </button>
      </form>
    </div>
  )
}
