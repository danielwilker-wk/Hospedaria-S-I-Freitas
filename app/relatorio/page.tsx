'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { FileText, RefreshCw, CheckCircle, Send } from 'lucide-react'

const PROPERTY_ID = '00000000-0000-0000-0000-000000000001'

export default function RelatorioPage() {
  const router = useRouter()
  const [summary, setSummary] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [staffId, setStaffId] = useState('')
  const yesterday = new Date(Date.now() - 864e5).toISOString().split('T')[0]

  useEffect(() => {
    const supabase = createClient()
    async function load() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push('/auth/login'); return }
      setStaffId(session.user.id)
      await loadSummary(supabase)
      setLoading(false)
    }
    load()
  }, [router])

  async function loadSummary(supabase: any) {
    const { data } = await supabase
      .from('daily_summaries')
      .select('*')
      .eq('property_id', PROPERTY_ID)
      .eq('summary_date', yesterday)
      .single()
    setSummary(data)
  }

  async function generateSummary() {
    setGenerating(true)
    const supabase = createClient()
    await supabase.rpc('generate_daily_summary', {
      p_property_id: PROPERTY_ID,
      p_date: yesterday,
    })
    await loadSummary(supabase)
    setGenerating(false)
  }

  async function markAsReviewed() {
    const supabase = createClient()
    const { data } = await supabase
      .from('daily_summaries')
      .update({ status: 'revisto', reviewed_by: staffId, reviewed_at: new Date().toISOString() })
      .eq('id', summary.id)
      .select()
      .single()
    setSummary(data)
  }

  async function markAsSent() {
    const supabase = createClient()
    const { data } = await supabase
      .from('daily_summaries')
      .update({ status: 'enviado', sent_at: new Date().toISOString() })
      .eq('id', summary.id)
      .select()
      .single()
    setSummary(data)
  }

  function copyToClipboard() {
    if (!summary) return
    const text = `📋 *Relatório Diário — S&I Freitas*
📅 Data: ${new Date(summary.summary_date).toLocaleDateString('pt-AO')}

🏨 Check-ins: ${summary.total_checkins}
🚪 Check-outs: ${summary.total_checkouts}

💰 *Receitas:*
• Alojamento: ${Number(summary.total_revenue_rooms).toLocaleString('pt-AO')} Kz
• Lavandaria: ${Number(summary.total_revenue_laundry).toLocaleString('pt-AO')} Kz
• Restaurante: ${Number(summary.total_revenue_restaurant).toLocaleString('pt-AO')} Kz

✅ *Total Geral: ${Number(summary.total_revenue_overall).toLocaleString('pt-AO')} Kz*`

    navigator.clipboard.writeText(text)
    alert('Resumo copiado! Cola no WhatsApp.')
  }

  if (loading) return <div className="flex items-center justify-center h-64"><p className="text-ink-muted text-sm">A carregar...</p></div>

  const statusColor: Record<string, string> = {
    rascunho: 'bg-yellow-100 text-yellow-700',
    revisto: 'bg-blue-100 text-blue-700',
    enviado: 'bg-green-100 text-green-700',
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-ink flex items-center gap-2">
          <FileText size={20} className="text-brand-500"/> Relatório Diário
        </h1>
        <p className="text-sm text-ink-muted mt-0.5">
          Referente a {new Date(yesterday).toLocaleDateString('pt-AO', { weekday: 'long', day: 'numeric', month: 'long' })}
        </p>
      </div>

      {!summary ? (
        <div className="card text-center py-12 space-y-4">
          <FileText size={32} className="mx-auto text-ink-light opacity-40"/>
          <p className="text-ink-muted">Relatório ainda não gerado para ontem.</p>
          <button onClick={generateSummary} disabled={generating} className="btn-primary mx-auto flex items-center gap-2">
            <RefreshCw size={15} className={generating ? 'animate-spin' : ''}/>
            {generating ? 'A gerar...' : 'Gerar relatório'}
          </button>
        </div>
      ) : (
        <>
          {/* Cabeçalho do resumo */}
          <div className="card space-y-5">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-ink">
                {new Date(summary.summary_date).toLocaleDateString('pt-AO')}
              </h2>
              <span className={`text-xs px-2 py-1 rounded font-semibold ${statusColor[summary.status]}`}>
                {summary.status.charAt(0).toUpperCase() + summary.status.slice(1)}
              </span>
            </div>

            {/* Movimento */}
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div className="bg-surface-muted rounded-lg p-3 text-center">
                <div className="text-2xl font-bold text-ink">{summary.total_checkins}</div>
                <div className="text-xs text-ink-muted">Check-ins</div>
              </div>
              <div className="bg-surface-muted rounded-lg p-3 text-center">
                <div className="text-2xl font-bold text-ink">{summary.total_checkouts}</div>
                <div className="text-xs text-ink-muted">Check-outs</div>
              </div>
            </div>

            {/* Receitas */}
            <div className="space-y-2 text-sm">
              <div className="flex justify-between py-2 border-b border-surface-border">
                <span className="text-ink-muted">Alojamento</span>
                <span className="font-medium">{Number(summary.total_revenue_rooms).toLocaleString('pt-AO')} Kz</span>
              </div>
              <div className="flex justify-between py-2 border-b border-surface-border">
                <span className="text-ink-muted">Lavandaria</span>
                <span className="font-medium">{Number(summary.total_revenue_laundry).toLocaleString('pt-AO')} Kz</span>
              </div>
              <div className="flex justify-between py-2 border-b border-surface-border">
                <span className="text-ink-muted">Restaurante</span>
                <span className="font-medium">{Number(summary.total_revenue_restaurant).toLocaleString('pt-AO')} Kz</span>
              </div>
              <div className="flex justify-between py-2 font-bold text-base">
                <span className="text-ink">Total Geral</span>
                <span className="text-brand-500">{Number(summary.total_revenue_overall).toLocaleString('pt-AO')} Kz</span>
              </div>
            </div>
          </div>

          {/* Acções */}
          <div className="space-y-2">
            <button onClick={generateSummary} disabled={generating || summary.status === 'enviado'} className="btn-secondary w-full flex items-center justify-center gap-2 text-sm">
              <RefreshCw size={14} className={generating ? 'animate-spin' : ''}/>
              Actualizar dados
            </button>

            {summary.status === 'rascunho' && (
              <button onClick={markAsReviewed} className="btn-secondary w-full flex items-center justify-center gap-2 text-sm border-blue-300 text-blue-600 hover:bg-blue-50">
                <CheckCircle size={14}/>
                Marcar como revisto
              </button>
            )}

            {summary.status === 'revisto' && (
              <>
                <button onClick={copyToClipboard} className="btn-primary w-full flex items-center justify-center gap-2">
                  <Send size={14}/>
                  Copiar resumo para WhatsApp
                </button>
                <button onClick={markAsSent} className="btn-secondary w-full text-sm text-green-600 border-green-300 hover:bg-green-50">
                  Confirmar envio ao patrão
                </button>
              </>
            )}

            {summary.status === 'enviado' && (
              <div className="card border-green-300 bg-green-50 flex items-center gap-3 text-green-700 text-sm">
                <CheckCircle size={16}/>
                Relatório enviado ao patrão.
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
