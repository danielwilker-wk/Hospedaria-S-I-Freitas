'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import Image from 'next/image'

export default function LoginPage() {
  const router = useRouter()
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

    router.push('/dashboard')
    router.refresh()
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface-muted px-4">
      <div className="w-full max-w-sm">

        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex flex-col items-center">
            {/* Seta laranja — ícone SVG baseado no logo */}
            <svg width="56" height="56" viewBox="0 0 56 56" fill="none" xmlns="http://www.w3.org/2000/svg" className="mb-3">
              <rect width="56" height="56" rx="14" fill="#F05A00"/>
              <path d="M28 10 L40 24 H33 V34 C33 38 30 40 27 40 C20 40 16 35 16 29 C16 22 21 18 27 18 V10 Z"
                fill="white" opacity="0.15"/>
              <text x="50%" y="54%" dominantBaseline="middle" textAnchor="middle"
                fill="white" fontSize="16" fontWeight="700" fontFamily="Inter, sans-serif">
                S&amp;I
              </text>
            </svg>
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
