'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Wrench, Plus, CheckCircle, PlayCircle } from 'lucide-react'

const PROPERTY_ID = '00000000-0000-0000-0000-000000000001'

type MaintenanceRequest = {
  id: string
  room_id: string
  description: string
  status: 'pendente' | 'em_progresso' | 'resolvido'
  reported_at: string
  started_at: string | null
  resolved_at: string | null
  material_used: string | null
  supplier: string | null
  cost: number | null
  rooms: { number: string }
}

export default function ManutencaoPage() {
  const [staffId, setStaffId] = useState('')
  const [rooms, setRooms] = useState<{ id: string; number: string }[]>([])
  const [requests, setRequests] = useState<MaintenanceRequest[]>([])
  const [loading, setLoading] = useState(true)

  const [newRoomId, setNewRoomId] = useState('')
  const [newDescription, setNewDescription] = useState('')
  const [saving, setSaving] = useState(false)

  const [resolvingId, setResolvingId] = useState<string | null>(null)
  const [resolveForm, setResolveForm] = useState({ material_used: '', supplier: '', cost: '' })

  async function load() {
    const supabase = createClient()
    const [{ data: roomsData }, { data: reqData }] = await Promise.all([
      supabase.from('rooms').select('id, number').eq('property_id', PROPERTY_ID).order('number'),
      supabase.from('maintenance_requests').select('*, rooms(number)').eq('property_id', PROPERTY_ID).order('reported_at', { ascending: false }),
    ])
    setRooms(roomsData ?? [])
    setRequests((reqData as any) ?? [])
    setLoading(false)
  }

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) setStaffId(session.user.id)
    })
    load()
  }, [])

  async function reportarAvaria(e: React.FormEvent) {
    e.preventDefault()
    if (!newRoomId || !newDescription.trim()) return
    setSaving(true)
    const supabase = createClient()

    const { error } = await supabase.from('maintenance_requests').insert({
      property_id: PROPERTY_ID,
      room_id: newRoomId,
      description: newDescription,
      reported_by: staffId,
      status: 'pendente',
    })
    if (error) { alert('Erro: ' + error.message); setSaving(false); return }

    await supabase.from('rooms').update({ status: 'manutencao' }).eq('id', newRoomId)

    setNewRoomId('')
    setNewDescription('')
    setSaving(false)
    load()
  }

  async function iniciarTrabalho(req: MaintenanceRequest) {
    const supabase = createClient()
    await supabase.from('maintenance_requests').update({
      status: 'em_progresso',
      started_at: new Date().toISOString(),
    }).eq('id', req.id)
    load()
  }

  async function concluirTrabalho(req: MaintenanceRequest) {
    setSaving(true)
    const supabase = createClient()
    await supabase.from('maintenance_requests').update({
      status: 'resolvido',
      resolved_at: new Date().toISOString(),
      material_used: resolveForm.material_used || null,
      supplier: resolveForm.supplier || null,
      cost: resolveForm.cost ? Number(resolveForm.cost) : null,
    }).eq('id', req.id)

    await supabase.from('rooms').update({ status: 'vago' }).eq('id', req.room_id)

    setResolvingId(null)
    setResolveForm({ material_used: '', supplier: '', cost: '' })
    setSaving(false)
    load()
  }

  const abertas = requests.filter(r => r.status !== 'resolvido')
  const resolvidas = requests.filter(r => r.status === 'resolvido')

  const statusBadge = (status: string) => {
    if (status === 'pendente') return 'bg-red-50 text-red-600'
    if (status === 'em_progresso') return 'bg-amber-50 text-amber-700'
    return 'bg-green-50 text-green-700'
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-ink flex items-center gap-2">
          <Wrench size={20} className="text-brand-500" /> Manutenção
        </h1>
        <p className="text-sm text-ink-muted mt-0.5">Histórico de avarias e reparações por quarto</p>
      </div>

      <form onSubmit={reportarAvaria} className="card space-y-3">
        <h2 className="text-xs font-bold text-ink-muted uppercase tracking-wide">Reportar nova avaria</h2>
        <select className="input" value={newRoomId} onChange={e => setNewRoomId(e.target.value)}>
          <option value="">Seleccionar quarto</option>
          {rooms.map(r => (
            <option key={r.id} value={r.id}>Quarto {r.number}</option>
          ))}
        </select>
        <textarea
          className="input"
          rows={2}
          placeholder="Descreve a avaria (ex: cano de água a verter, pintura da parede...)"
          value={newDescription}
          onChange={e => setNewDescription(e.target.value)}
        />
        <button type="submit" disabled={saving || !newRoomId || !newDescription.trim()} className="btn-primary flex items-center gap-2 px-5 py-2">
          <Plus size={16} /> {saving ? 'A registar...' : 'Registar Avaria'}
        </button>
      </form>

      {loading ? (
        <p className="text-sm text-ink-muted text-center py-8">A carregar...</p>
      ) : (
        <>
          <div className="space-y-3">
            <h2 className="text-xs font-bold text-ink-muted uppercase tracking-wide px-1">Em aberto ({abertas.length})</h2>
            {abertas.length === 0 ? (
              <p className="text-sm text-ink-muted text-center py-6 card">Nenhuma avaria pendente.</p>
            ) : (
              abertas.map(req => (
                <div key={req.id} className="card space-y-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-semibold text-ink">Quarto {req.rooms?.number}</p>
                      <p className="text-sm text-ink-muted mt-0.5">{req.description}</p>
                      <p className="text-xs text-ink-light mt-1">
                        Reportado em {new Date(req.reported_at).toLocaleDateString('pt-PT')}
                        {req.started_at && ` · Iniciado em ${new Date(req.started_at).toLocaleDateString('pt-PT')}`}
                      </p>
                    </div>
                    <span className={`text-xs font-semibold px-2.5 py-1 rounded-full whitespace-nowrap ${statusBadge(req.status)}`}>
                      {req.status === 'pendente' ? 'Pendente' : 'Em progresso'}
                    </span>
                  </div>

                  {resolvingId === req.id ? (
                    <div className="space-y-2 pt-2 border-t border-border">
                      <input type="text" className="input" placeholder="Material usado" value={resolveForm.material_used} onChange={e => setResolveForm(p => ({ ...p, material_used: e.target.value }))} />
                      <div className="grid grid-cols-2 gap-2">
                        <input type="text" className="input" placeholder="Fornecedor (opcional)" value={resolveForm.supplier} onChange={e => setResolveForm(p => ({ ...p, supplier: e.target.value }))} />
                        <input type="number" className="input" placeholder="Custo (Kz)" min="0" value={resolveForm.cost} onChange={e => setResolveForm(p => ({ ...p, cost: e.target.value }))} />
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => concluirTrabalho(req)} disabled={saving} className="btn-primary flex-1 py-2 text-sm">
                          {saving ? 'A concluir...' : 'Confirmar Conclusão'}
                        </button>
                        <button onClick={() => setResolvingId(null)} className="btn-secondary px-4 py-2 text-sm">Cancelar</button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex gap-2 pt-1 border-t border-border pt-3">
                      {req.status === 'pendente' && (
                        <button onClick={() => iniciarTrabalho(req)} className="btn-secondary flex-1 py-2 text-sm flex items-center justify-center gap-1.5">
                          <PlayCircle size={15} /> Iniciar Trabalho
                        </button>
                      )}
                      <button onClick={() => setResolvingId(req.id)} className="btn-primary flex-1 py-2 text-sm flex items-center justify-center gap-1.5">
                        <CheckCircle size={15} /> Concluir
                      </button>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>

          {resolvidas.length > 0 && (
            <div className="space-y-2">
              <h2 className="text-xs font-bold text-ink-muted uppercase tracking-wide px-1">Histórico resolvido ({resolvidas.length})</h2>
              <div className="card divide-y divide-border">
                {resolvidas.map(req => (
                  <div key={req.id} className="py-3 text-sm">
                    <div className="flex items-center justify-between">
                      <p className="font-medium text-ink">Quarto {req.rooms?.number} — {req.description}</p>
                      <span className="text-xs text-green-700 font-semibold">Resolvido</span>
                    </div>
                    <p className="text-xs text-ink-muted mt-1">
                      {req.material_used && `Material: ${req.material_used} · `}
                      {req.supplier && `Fornecedor: ${req.supplier} · `}
                      {req.cost != null && `Custo: ${Number(req.cost).toLocaleString('pt-AO')} Kz · `}
                      Concluído em {req.resolved_at ? new Date(req.resolved_at).toLocaleDateString('pt-PT') : '—'}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
