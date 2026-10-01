'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { ArrowLeft, CheckCircle } from 'lucide-react'
import Link from 'next/link'

const PROPERTY_ID = '00000000-0000-0000-0000-000000000001'

export default function NovaReservaPage() {
  const router = useRouter()
  const [rooms, setRooms] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [success, setSuccess] = useState(false)
  const [staffId, setStaffId] = useState('')

  const [form, setForm] = useState({
    // Hóspede
    full_name: '', surname: '', phone: '', email: '',
    nationality: '', document_type: 'bi', document_number: '',
    // Reserva
    room_id: '', check_in_planned: '', check_out_planned: '',
    source: 'telefone', notes: '',
  })

  useEffect(() => {
    const supabase = createClient()
    async function load() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push('/auth/login'); return }
      setStaffId(session.user.id)

      const { data } = await supabase
        .from('rooms')
        .select('id, number, room_types(name, individual_price, duplo_price)')
        .eq('property_id', PROPERTY_ID)
        .eq('status', 'vago')
        .order('number')
      setRooms(data ?? [])
      setLoading(false)
    }
    load()
  }, [router])

  function handle(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) {
    setForm(p => ({ ...p, [e.target.name]: e.target.value }))
  }

  const nights = form.check_in_planned && form.check_out_planned
    ? Math.ceil((new Date(form.check_out_planned).getTime() - new Date(form.check_in_planned).getTime()) / (1000 * 60 * 60 * 24))
    : 0

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    const supabase = createClient()

    // 1. Criar ou encontrar hóspede
    let guestId: string | null = null
    if (form.full_name) {
      const { data: guest } = await supabase
        .from('guests')
        .insert({
          full_name: form.full_name,
          surname: form.surname || null,
          phone: form.phone || null,
          email: form.email || null,
          nationality: form.nationality || null,
          document_type: form.document_type as any,
          document_number: form.document_number || null,
        })
        .select()
        .single()
      guestId = guest?.id ?? null
    }

    // 2. Criar reserva
    const { data: reservation, error } = await supabase
      .from('reservations')
      .insert({
        property_id: PROPERTY_ID,
        guest_id: guestId,
        room_id: form.room_id || null,
        check_in_planned: form.check_in_planned,
        check_out_planned: form.check_out_planned,
        source: form.source as any,
        status: 'pendente',
        notes: form.notes || null,
        created_by: staffId,
      })
      .select()
      .single()

    if (error) { alert('Erro: ' + error.message); setSaving(false); return }

    setSuccess(true)
    setSaving(false)
    setTimeout(() => router.push(`/recepcao/reservas/${reservation.id}`), 1500)
  }

  if (loading) return <div className="flex items-center justify-center h-64"><p className="text-ink-muted text-sm">A carregar...</p></div>

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/recepcao/reservas" className="btn-ghost p-2"><ArrowLeft size={16}/></Link>
        <div>
          <h1 className="text-xl font-semibold text-ink">Nova Reserva</h1>
          <p className="text-sm text-ink-muted">Registo de reserva de quarto</p>
        </div>
      </div>

      {success && (
        <div className="card border-green-300 bg-green-50 flex items-center gap-3 text-green-700">
          <CheckCircle size={16}/><span className="font-medium text-sm">Reserva criada! A redirecionar...</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Detalhes da reserva */}
        <div className="card space-y-4">
          <h2 className="text-xs font-bold text-ink-muted uppercase tracking-wide">Detalhes da Reserva</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Quarto</label>
              <select name="room_id" className="input" value={form.room_id} onChange={handle}>
                <option value="">A definir</option>
                {rooms.map(r => (
                  <option key={r.id} value={r.id}>
                    Nº {r.number} — {r.room_types?.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Origem</label>
              <select name="source" className="input" value={form.source} onChange={handle}>
                <option value="telefone">Telefone</option>
                <option value="whatsapp">WhatsApp</option>
                <option value="email">E-mail</option>
                <option value="booking_com">Booking.com</option>
                <option value="presencial">Presencial</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Check-in previsto</label>
              <input type="date" name="check_in_planned" required className="input"
                value={form.check_in_planned} onChange={handle}
                min={new Date().toISOString().split('T')[0]}/>
            </div>
            <div>
              <label className="label">Check-out previsto</label>
              <input type="date" name="check_out_planned" required className="input"
                value={form.check_out_planned} onChange={handle}
                min={form.check_in_planned || new Date().toISOString().split('T')[0]}/>
            </div>
          </div>
          {nights > 0 && (
            <div className="bg-brand-50 border border-brand-200 rounded-lg px-4 py-2.5 text-sm">
              <span className="font-semibold text-brand-600">{nights} noite{nights > 1 ? 's' : ''}</span>
              <span className="text-ink-muted ml-2">
                {form.room_id && rooms.find(r => r.id === form.room_id)?.room_types?.individual_price
                  ? `· Aprox. ${(Number(rooms.find(r => r.id === form.room_id)?.room_types?.individual_price) * nights).toLocaleString('pt-AO')} Kz (individual)`
                  : ''}
              </span>
            </div>
          )}
          <div>
            <label className="label">Observações</label>
            <textarea name="notes" className="input min-h-[70px] resize-none" placeholder="Pedidos especiais, informações adicionais..."
              value={form.notes} onChange={handle}/>
          </div>
        </div>

        {/* Dados do hóspede */}
        <div className="card space-y-4">
          <h2 className="text-xs font-bold text-ink-muted uppercase tracking-wide">Dados do Hóspede</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Nome(s) *</label>
              <input type="text" name="full_name" required className="input" placeholder="Nome" value={form.full_name} onChange={handle}/>
            </div>
            <div>
              <label className="label">Apelido</label>
              <input type="text" name="surname" className="input" placeholder="Apelido" value={form.surname} onChange={handle}/>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Telemóvel</label>
              <input type="tel" name="phone" className="input" placeholder="+244 9XX XXX XXX" value={form.phone} onChange={handle}/>
            </div>
            <div>
              <label className="label">E-mail</label>
              <input type="email" name="email" className="input" placeholder="opcional" value={form.email} onChange={handle}/>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Tipo de Documento</label>
              <select name="document_type" className="input" value={form.document_type} onChange={handle}>
                <option value="bi">BI</option>
                <option value="passaporte">Passaporte</option>
              </select>
            </div>
            <div>
              <label className="label">Nº do Documento</label>
              <input type="text" name="document_number" className="input" placeholder="Nº BI / Passaporte" value={form.document_number} onChange={handle}/>
            </div>
          </div>
          <div>
            <label className="label">Nacionalidade</label>
            <input type="text" name="nationality" className="input" placeholder="Ex: Angolana" value={form.nationality} onChange={handle}/>
          </div>
        </div>

        <button type="submit" disabled={saving || !form.full_name || !form.check_in_planned || !form.check_out_planned}
          className="btn-primary w-full py-3">
          {saving ? 'A criar reserva...' : 'Confirmar Reserva'}
        </button>
      </form>
    </div>
  )
}
