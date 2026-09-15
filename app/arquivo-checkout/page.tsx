'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Archive, Download, FileText } from 'lucide-react'

const PROPERTY_ID = '00000000-0000-0000-0000-000000000001'

type DocumentEntry = {
  id: string
  stay_id: string
  pdf_url: string
  generated_at: string
  stays: {
    check_in_at: string
    check_out_at: string
    rooms: { number: string }
    guests: { full_name: string; surname: string | null }
  }
}

export default function ArquivoCheckoutPage() {
  const [documents, setDocuments] = useState<DocumentEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [downloadingId, setDownloadingId] = useState<string | null>(null)

  useEffect(() => {
    const supabase = createClient()
    supabase
      .from('checkout_documents')
      .select('*, stays(check_in_at, check_out_at, rooms(number), guests(full_name, surname))')
      .eq('property_id', PROPERTY_ID)
      .order('generated_at', { ascending: false })
      .then(({ data }) => {
        setDocuments((data as any) ?? [])
        setLoading(false)
      })
  }, [])

  async function baixarPdf(doc: DocumentEntry) {
    setDownloadingId(doc.id)
    const supabase = createClient()
    const { data, error } = await supabase.storage
      .from('checkout-docs')
      .createSignedUrl(doc.pdf_url, 60)

    if (error || !data) {
      alert('Erro ao gerar link de download: ' + error?.message)
      setDownloadingId(null)
      return
    }
    window.open(data.signedUrl, '_blank')
    setDownloadingId(null)
  }

  const grouped = documents.reduce((acc: Record<string, DocumentEntry[]>, d) => {
    const date = new Date(d.generated_at)
    const key = date.toLocaleDateString('pt-PT', { month: 'long', year: 'numeric' })
    acc[key] = acc[key] || []
    acc[key].push(d)
    return acc
  }, {})

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-ink flex items-center gap-2">
          <Archive size={20} className="text-brand-500" /> Arquivo Check-out
        </h1>
        <p className="text-sm text-ink-muted mt-0.5">Documentos de check-in + check-out, organizados por mês</p>
      </div>

      {loading ? (
        <p className="text-sm text-ink-muted text-center py-8">A carregar...</p>
      ) : documents.length === 0 ? (
        <div className="card text-center py-10">
          <FileText size={28} className="text-ink-light mx-auto mb-2" />
          <p className="text-sm text-ink-muted">Ainda não há documentos no arquivo.</p>
        </div>
      ) : (
        Object.entries(grouped).map(([month, docs]) => (
          <div key={month} className="space-y-2">
            <h2 className="text-xs font-bold text-ink-muted uppercase tracking-wide px-1 capitalize">{month}</h2>
            <div className="card divide-y divide-border">
              {docs.map(d => (
                <div key={d.id} className="py-3 flex items-center justify-between">
                  <div>
                    <p className="font-medium text-ink text-sm">
                      {d.stays?.guests?.full_name} {d.stays?.guests?.surname} — Quarto {d.stays?.rooms?.number}
                    </p>
                    <p className="text-xs text-ink-muted">
                      {new Date(d.stays?.check_in_at).toLocaleDateString('pt-PT')} → {d.stays?.check_out_at ? new Date(d.stays.check_out_at).toLocaleDateString('pt-PT') : '—'}
                    </p>
                  </div>
                  <button
                    onClick={() => baixarPdf(d)}
                    disabled={downloadingId === d.id}
                    className="btn-secondary px-3 py-1.5 text-sm flex items-center gap-1.5"
                  >
                    <Download size={14} /> {downloadingId === d.id ? '...' : 'PDF'}
                  </button>
                </div>
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  )
}
