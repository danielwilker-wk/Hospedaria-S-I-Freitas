'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Search, User, BedDouble, Phone, Mail, Car } from 'lucide-react'
import type { Guest, Stay, Room, RoomType } from '@/types'

type GuestWithStay = Guest & {
  activeStay?: (Stay & { rooms?: Room & { room_types?: RoomType } }) | null
}

export default function HospedesPage() {
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState<GuestWithStay[]>([])
  const [selected, setSelected] = useState<GuestWithStay | null>(null)
  const [searched, setSearched] = useState(false)

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    if (!query.trim()) return
    setLoading(true)
    setSearched(true)
    setSelected(null)
    const supabase = createClient()

    const { data: guests } = await supabase
      .from('guests')
      .select('*')
      .or(`full_name.ilike.%${query}%,surname.ilike.%${query}%,document_number.ilike.%${query}%`)
      .order('full_name')
      .limit(20)

    if (!guests || guests.length === 0) {
      setResults([])
      setLoading(false)
      return
    }

    // Para cada hóspede, procurar se tem uma estadia activa (onde está agora)
    const guestIds = guests.map(g => g.id)
    const { data: activeStays } = await supabase
      .from('stays')
      .select('*, rooms(*, room_types(*))')
      .in('primary_guest_id', guestIds)
      .eq('status', 'ativo')

    const withStay: GuestWithStay[] = guests.map(g => ({
      ...g,
      activeStay: activeStays?.find(s => s.primary_guest_id === g.id) ?? null,
    }))

    setResults(withStay)
    setLoading(false)
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-ink flex items-center gap-2">
          <User size={20} className="text-brand-500" /> Registo de Hóspedes
        </h1>
        <p className="text-sm text-ink-muted mt-0.5">
          Pesquisar por nome ou nº de BI/Passaporte — histórico e localização actual
        </p>
      </div>

      <form onSubmit={handleSearch} className="card">
        <div className="flex gap-3">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-light" />
            <input
              type="text"
              className="input pl-9"
              placeholder="Nome ou nº de BI..."
              value={query}
              onChange={e => setQuery(e.target.value)}
              autoFocus
            />
          </div>
          <button type="submit" className="btn-primary px-6" disabled={loading}>
            {loading ? 'A procurar...' : 'Procurar'}
          </button>
        </div>
      </form>

      {searched && !loading && results.length === 0 && (
        <div className="card text-center text-sm text-ink-muted py-8">
          Nenhum hóspede encontrado com "{query}".
        </div>
      )}

      {results.length > 0 && !selected && (
        <div className="card divide-y divide-border">
          {results.map(g => (
            <button
              key={g.id}
              onClick={() => setSelected(g)}
              className="w-full text-left py-3 first:pt-0 last:pb-0 flex items-center justify-between hover:opacity-70 transition"
            >
              <div>
                <p className="font-medium text-ink">{g.full_name} {g.surname}</p>
                <p className="text-xs text-ink-muted">
                  {g.document_type === 'bi' ? 'BI' : 'Passaporte'}: {g.document_number || '—'}
                </p>
              </div>
              {g.activeStay ? (
                <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-green-50 text-green-700 flex items-center gap-1">
                  <BedDouble size={12} /> Quarto {g.activeStay.rooms?.number}
                </span>
              ) : (
                <span className="text-xs px-2.5 py-1 rounded-full bg-surface-muted text-ink-light">
                  Sem estadia activa
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      {selected && (
        <div className="card space-y-4">
          <button onClick={() => setSelected(null)} className="text-xs text-brand-500 font-medium">
            ← Voltar aos resultados
          </button>

          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-lg font-semibold text-ink">{selected.full_name} {selected.surname}</h2>
              <p className="text-sm text-ink-muted">{selected.nationality || 'Nacionalidade não registada'}</p>
            </div>
            {selected.activeStay && (
              <span className="text-sm font-semibold px-3 py-1.5 rounded-full bg-green-50 text-green-700 flex items-center gap-1.5">
                <BedDouble size={14} /> Actualmente no Quarto {selected.activeStay.rooms?.number}
              </span>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4 text-sm bg-surface-muted rounded-lg p-4">
            <div>
              <p className="text-ink-light text-xs">Documento</p>
              <p className="font-medium">{selected.document_type === 'bi' ? 'BI' : 'Passaporte'} — {selected.document_number || '—'}</p>
            </div>
            <div>
              <p className="text-ink-light text-xs">Data de nascimento</p>
              <p className="font-medium">{selected.birth_date || '—'}</p>
            </div>
            <div className="flex items-center gap-1.5">
              <Phone size={13} className="text-ink-light" />
              <p className="font-medium">{selected.phone || '—'}</p>
            </div>
            <div className="flex items-center gap-1.5">
              <Mail size={13} className="text-ink-light" />
              <p className="font-medium">{selected.email || '—'}</p>
            </div>
            {selected.company && (
              <div className="col-span-2">
                <p className="text-ink-light text-xs">Empresa</p>
                <p className="font-medium">{selected.company}</p>
              </div>
            )}
          </div>

          {selected.activeStay && (
            <div className="border border-border rounded-lg p-4 space-y-2">
              <h3 className="text-xs font-bold text-ink-muted uppercase tracking-wide">Estadia Actual</h3>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-ink-light text-xs">Quarto</p>
                  <p className="font-medium">Nº {selected.activeStay.rooms?.number} — {selected.activeStay.rooms?.room_types?.name}</p>
                </div>
                <div>
                  <p className="text-ink-light text-xs">Check-in</p>
                  <p className="font-medium">{new Date(selected.activeStay.check_in_at).toLocaleString('pt-PT')}</p>
                </div>
                {selected.activeStay.vehicle_plate && (
                  <div className="col-span-2 flex items-center gap-1.5">
                    <Car size={13} className="text-ink-light" />
                    <p className="font-medium">{selected.activeStay.vehicle_plate} — {selected.activeStay.vehicle_make} {selected.activeStay.vehicle_color}</p>
                  </div>
                )}
              </div>
            </div>
          )}

          <a
            href={`/recepcao/checkin?guest_id=${selected.id}`}
            className="btn-primary w-full py-3 flex items-center justify-center"
          >
            Novo Check-in para este hóspede
          </a>
        </div>
      )}
    </div>
  )
}
