'use client'

import { useActionState } from 'react'
import { login } from '@/actions/auth'

type LoginState = { error: string } | null

export default function LoginPage() {
  const [state, formAction, pending] = useActionState<LoginState, FormData>(login, null)

  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-bold text-center mb-8 text-gray-900">
          Count Stock
        </h1>
        <form action={formAction} className="space-y-4">
          <div>
            <label
              htmlFor="username"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Usuário
            </label>
            <input
              id="username"
              name="username"
              type="text"
              required
              autoCapitalize="none"
              autoCorrect="off"
              autoComplete="username"
              className="w-full px-4 py-3 text-lg border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label
              htmlFor="password"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              PIN / Senha
            </label>
            <input
              id="password"
              name="password"
              type="password"
              required
              inputMode="numeric"
              autoComplete="current-password"
              className="w-full px-4 py-3 text-lg border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          {state?.error && (
            <p className="text-sm text-red-600 text-center">{state.error}</p>
          )}
          <button
            type="submit"
            disabled={pending}
            className="w-full py-3 px-4 bg-blue-600 text-white text-lg font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {pending ? 'Entrando...' : 'Entrar'}
          </button>
        </form>
      </div>
    </main>
  )
}
