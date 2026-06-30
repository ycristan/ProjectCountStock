'use client'

import { useActionState, useState } from 'react'
import { login } from '@/actions/auth'

type LoginState = { error: string } | null

export default function LoginPage() {
  const [state, formAction, pending] = useActionState<LoginState, FormData>(login, null)
  const [adminMode, setAdminMode] = useState(false)

  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-bold text-center mb-8 text-gray-900">Count Stock</h1>
        <form action={formAction} className="space-y-4">
          {adminMode ? (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                <input
                  name="email"
                  type="email"
                  required
                  autoCapitalize="none"
                  autoComplete="email"
                  className="w-full px-4 py-3 text-lg border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
                <input
                  name="password"
                  type="password"
                  required
                  autoComplete="current-password"
                  className="w-full px-4 py-3 text-lg border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </>
          ) : (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Team Code
                </label>
                <input
                  name="team_pin"
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]{4}"
                  maxLength={4}
                  required
                  placeholder="0000"
                  className="w-full px-4 py-4 text-3xl text-center tracking-[0.5em] border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Your PIN
                </label>
                <input
                  name="user_pin"
                  type="password"
                  inputMode="numeric"
                  pattern="[0-9]{4}"
                  maxLength={4}
                  required
                  placeholder="••••"
                  className="w-full px-4 py-4 text-3xl text-center tracking-[0.5em] border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </>
          )}
          {state?.error && (
            <p className="text-sm text-red-600 text-center">{state.error}</p>
          )}
          <button
            type="submit"
            disabled={pending}
            className="w-full py-4 px-4 bg-blue-600 text-white text-xl font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {pending ? 'Logging in...' : 'Log In'}
          </button>
        </form>
        <button
          type="button"
          onClick={() => setAdminMode(!adminMode)}
          className="mt-6 w-full text-sm text-gray-400 hover:text-gray-600 text-center transition-colors"
        >
          {adminMode ? '← Counter Login' : 'Log In as Admin'}
        </button>
      </div>
    </main>
  )
}
