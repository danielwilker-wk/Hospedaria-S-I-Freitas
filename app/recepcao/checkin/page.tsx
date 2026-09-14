'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { LogIn, CheckCircle, Search, UserPlus } from 'lucide-react'
import type { Guest } from '@/types'

const PROPERTY_ID = '00000000-0000-0000-0000-000000000001'

export default function CheckInPage() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const [step, setStep] = useState<'search' | 'form'>('search')
  const [query, setQuery] = useState('')
  const [searching, setSearching] = useState(false)
  const [searchResults, setSearchResults] = useState<Guest[]>([])
  const [existingGuestId, setExistingGuestId] = useState<string | null>(null)

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
    billed_to: 'proprio',
    company_name: '',
  })

  // Carrega quartos vagos + sessão do rececionista
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

  // Se veio de /recepcao/hospedes com ?guest_id=, carregar esse hóspede directamente
  useEffect(() => {
    const guestId = searchParams.get('guest_id')
    if (!guestId) return
    const supabase = createClient()
    async function loadGuest() {
      const { data } = await supabase.from('guests').select('*').eq('id', guestId).single()
      if (data) selectGuest(data)
    }
    loadGuest()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams])

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    if (!query.trim()) return
    setSearching(true)
    const supabase = createClient()
    const { data } = await supabase
      .from('guests')
      .select('*')
      .or(`full_name.ilike.%${query}%,surname.ilike.%${query}%,document_number.ilike.%${query}%`)
      .order('full_name')
      .limit(10)
    setSearchResults(data ?? [])
    setSearching(false)
  }

  function selectGuest(g: Guest) {
    setExistingGuestId(g.id)
    setForm(prev => ({
      ...prev,
      full_name: g.full_name ?? '',
      surname: g.surname ?? '',
      nationality: g.nationality ?? '',
      document_type: g.document_type ?? 'bi',
      document_number: g.document_number ?? '',
      birth_date: g.birth_date ?? '',
      phone: g.phone ?? '',
      email: g.email ?? '',
      company_name: g.company ?? '',
    }))
    setStep('form')
  }

  function startNewGuest() {
    setExistingGuestId(null)
    setStep('form')
  }

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

    let guestId = existingGuestId

    if (!guestId) {
      // Hóspede novo — criar registo
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
          company: form.billed_to === 'empresa' ? form.company_name : null,
        })
        .select()
        .single()

      if (guestError) { alert('Erro ao criar hóspede: ' + guestError.message); setSaving(false); return }
      guestId = guest.id
    } else {
      // Hóspede existente — actualizar dados que possam ter mudado
      await supabase
        .from('guests')
        .update({
          phone: form.phone,
          email: form.email,
          company: form.billed_to === 'empresa' ? form.company_name : null,
        })
        .eq('id', guestId)
    }

    const { error: stayError } = await supabase
      .from('stays')
      .insert({
        property_id: PROPERTY_ID,
        room_id: form.room_id,
        primary_guest_id: guestId,
        occupancy: form.occupancy,
        vehicle_plate: form.vehicle_plate || null,
        vehicle_make: form.vehicle_make || null,
        vehicle_color: form.vehicle_color || null,
        check_out_planned_at: form.check_out_planned_at || null,
        room_value: roomValue,
        amount_paid_reservation: Number(form.amount_paid_reservation),
        amount_due: amountDue,
        checked_in_by: staffId,
        billed_to: form.billed_to,
        company_name: form.billed_to === 'empresa' ? form.company_name : null,
      })

    if (stayError) { alert('Erro ao criar estadia: ' + stayError.message); setSaving(false); return }

    setSuccess(true)
    setSaving(false)

    setTimeout(() => {
      router.push('/mapa-quartos')
    }, 1500)
  }

  if (loading) return <div className="flex items-center justify-center h-64"><p className="text-ink-muted text-sm">A carregar...</p></div>

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-ink flex items-center gap-2">
          <LogIn size={20} className="text-brand-500" /> Check-in
        </h1>
        <p className="text-sm text-ink-muted mt-0.5">Registo de entrada de hóspede</p>
      </div>

      {success && (
        <div className="card border-green-300 bg-green-50 flex items-center gap-3 text-green-700">
          <CheckCircle size={18}/>
          <span className="font-medium">Check-in registado com sucesso!</span>
        </div>
      )}

      {step === 'search' && !success && (
        <div className="card space-y-4">
          <h2 className="text-xs font-bold text-ink-muted uppercase tracking-wide">
            Passo 1 — Procurar hóspede (nome ou nº de BI)
          </h2>
          <form onSubmit={handleSearch} className="flex gap-3">
            <div className="relative flex-1">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-light" />
              <input
                type="text"
                className="input pl-9"
                placeholder="Ex: Manuel Mendes ou 004587521LA..."
                value={query}
                onChange={e => setQuery(e.target.value)}
                autoFocus
              />
            </div>
            <button type="submit" className="btn-primary px-6" disabled={searching}>
              {searching ? 'A procurar...' : 'Procurar'}
            </button>
          </form>

          {searchResults.length > 0 && (
            <div className="divide-y divide-border border border-border rounded-lg">
              {searchResults.map(g => (
                <button
                  key={g.id}
                  onClick={() => selectGuest(g)}
                  className="w-full text-left px-4 py-3 hover:bg-surface-muted transition"
                >
                  <p className="font-medium text-ink">{g.full_name} {g.surname}</p>
                  <p className="text-xs text-ink-muted">
                    {g.document_type === 'bi' ? 'BI' : 'Passaporte'}: {g.document_number || '—'}
                  </p>
                </button>
              ))}
            </div>
          )}

          <div className="pt-2 border-t border-border">
            <button
              onClick={startNewGuest}
              className="w-full flex items-center justify-center gap-2 text-sm font-medium text-brand-500 py-2"
            >
              <UserPlus size={16} /> Este é um hóspede novo — criar registo
            </button>
          </div>
        </div>
      )}

      {step === 'form' && !success && (
        <form onSubmit={handleSubmit} className="space-y-5">
          {existingGuestId && (
            <div className="card border-brand-200 bg-brand-50 text-sm text-brand-700 flex items-center justify-between">
              <span>Hóspede já registado — dados preenchidos automaticamente.</span>
              <button type="button" onClick={() => setStep('search')} className="font-semibold underline">
                Trocar
              </button>
            </div>
          )}

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
                <input type="text" name="full_name" required className="input" placeholder="Nome" value={form.full_name} onChange={handleChange} disabled={!!existingGuestId}/>
              </div>
              <div>
                <label className="label">Apelido</label>
                <input type="text" name="surname" className="input" placeholder="Apelido" value={form.surname} onChange={handleChange} disabled={!!existingGuestId}/>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label">Nacionalidade</label>
                <input type="text" name="nationality" className="input" placeholder="Ex: Angolana" value={form.nationality} onChange={handleChange} disabled={!!existingGuestId}/>
              </div>
              <div>
                <label className="label">Data de Nascimento</label>
                <input type="date" name="birth_date" className="input" value={form.birth_date} onChange={handleChange} disabled={!!existingGuestId}/>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label">Tipo de Documento</label>
                <select name="document_type" className="input" value={form.document_type} onChange={handleChange} disabled={!!existingGuestId}>
                  <option value="bi">BI</option>
                  <option value="passaporte">Passaporte</option>
                </select>
              </div>
              <div>
                <label className="label">Nº do Documento</label>
                <input type="text" name="document_number" className="input" placeholder="Nº BI / Passaporte" value={form.document_number} onChange={handleChange} disabled={!!existingGuestId}/>
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

          {/* Facturação */}
          <div className="card space-y-4">
            <h2 className="text-xs font-bold text-ink-muted uppercase tracking-wide">Facturação</h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label">Pagamento</label>
                <select name="billed_to" className="input" value={form.billed_to} onChange={handleChange}>
                  <option value="proprio">Conta própria</option>
                  <option value="empresa">A crédito — em nome de empresa</option>
                </select>
              </div>
              {form.billed_to === 'empresa' && (
                <div>
                  <label className="label">Nome da empresa</label>
                  <input type="text" name="company_name" className="input" placeholder="Ex: Empresa, Lda" value={form.company_name} onChange={handleChange}/>
                </div>
              )}
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
      )}
    </div>
  )
}
