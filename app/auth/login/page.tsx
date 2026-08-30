'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const supabase = createClient()
    const { error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      setError('Email ou senha incorretos. Tente novamente.')
      setLoading(false)
      return
    }

    // Redirect directo sem usar o router do Next.js
    window.location.href = '/dashboard'
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface-muted px-4">
      <div className="w-full max-w-sm">

        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex flex-col items-center">
            <div className="w-14 h-14 rounded-xl bg-brand-500 flex items-center justify-center mb-3">
              <span className="text-white text-lg font-bold">S&I</span>
            </div>
            <h1 className="text-lg font-bold text-ink tracking-tight">
              S&I – Freitas, Lda.
            </h1>
            <p className="text-xs text-ink-muted mt-0.5">Hotelaria, Comércio e Serviços</p>
          </div>
        </div>

        {/* Card de login */}
        <div className="bg-surface rounded-xl border border-surface-border shadow-sm p-6">
          <h2 className="text-sm font-semibold text-ink mb-4">Acesso ao sistema interno</h2>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label htmlFor="email" className="label">Email</label>
              <input
                id="email"
                type="email"
                required
                autoComplete="email"
                className="input"
                placeholder="nome@sifreitas.ao"
                value={email}
                onChange={e => setEmail(e.target.value)}
              />
            </div>

            <div>
              <label htmlFor="password" className="label">Senha</label>
              <input
                id="password"
                type="password"
                required
                autoComplete="current-password"
                className="input"
                placeholder="••••••••"
                value={password}
                onChange={e => setPassword(e.target.value)}
              />
            </div>

            {error && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full"
            >
              {loading ? 'A entrar…' : 'Entrar'}
            </button>
          </form>
        </div>

        <p className="text-center text-xs text-ink-light mt-5">
          Problemas de acesso? Contacte a gerência.
        </p>
      </div>
    </div>
  )
}
