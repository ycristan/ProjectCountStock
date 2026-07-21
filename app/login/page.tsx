'use client'

import { useActionState, useState } from 'react'
import { login } from '@/actions/auth'
import { NextChainMark } from '@/components/NextChainMark'

type LoginState = { error: string } | null

export default function LoginPage() {
  const [state, formAction, pending] = useActionState<LoginState, FormData>(login, null)
  const [adminMode, setAdminMode] = useState(false)

  return (
    <main className="dark relative flex min-h-screen items-center justify-center overflow-hidden bg-[#070c18] px-5 py-10 text-slate-100">
      {/* ambient background */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(760px_520px_at_78%_8%,rgba(59,130,246,0.26),transparent_70%),radial-gradient(620px_460px_at_12%_96%,rgba(34,211,238,0.16),transparent_72%)]" />

      <div className="relative w-full max-w-sm">
        {/* lockup */}
        <div className="mb-6 flex flex-col items-center text-center">
          <NextChainMark size={52} tone="onDark" animated className="mb-4" />
          <div className="text-[22px] font-bold tracking-[0.14em]">
            NEXT <span className="font-light text-slate-400">CHAIN</span>
          </div>
          <div className="mt-2 font-mono text-[10px] uppercase tracking-[0.2em] text-slate-500">
            Stock Count &amp; Auditory
          </div>
        </div>

        {/* glass card */}
        <div className="rounded-[22px] border border-white/10 bg-white/[0.04] p-7 shadow-[0_40px_90px_-50px_#000] backdrop-blur-md">
          {/* mode toggle */}
          <div className="mb-6 flex gap-1 rounded-xl border border-white/10 bg-white/5 p-1">
            <button
              type="button"
              onClick={() => setAdminMode(false)}
              className={`flex-1 rounded-[10px] py-2.5 text-sm font-semibold transition ${
                !adminMode ? 'bg-gradient-to-br from-blue-500 to-cyan-400 text-slate-950' : 'text-slate-400'
              }`}
            >
              Team
            </button>
            <button
              type="button"
              onClick={() => setAdminMode(true)}
              className={`flex-1 rounded-[10px] py-2.5 text-sm font-semibold transition ${
                adminMode ? 'bg-gradient-to-br from-blue-500 to-cyan-400 text-slate-950' : 'text-slate-400'
              }`}
            >
              Admin
            </button>
          </div>

          <form action={formAction} className="space-y-4">
            {adminMode ? (
              <>
                <div>
                  <label className="mb-2 block text-xs font-semibold text-slate-300">Email</label>
                  <input
                    name="email"
                    type="email"
                    required
                    autoCapitalize="none"
                    autoComplete="email"
                    className="w-full rounded-xl border border-white/12 bg-white/[0.04] px-4 py-3.5 text-base text-slate-100 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30"
                  />
                </div>
                <div>
                  <label className="mb-2 block text-xs font-semibold text-slate-300">Password</label>
                  <input
                    name="password"
                    type="password"
                    required
                    autoComplete="current-password"
                    className="w-full rounded-xl border border-white/12 bg-white/[0.04] px-4 py-3.5 text-base text-slate-100 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30"
                  />
                </div>
              </>
            ) : (
              <>
                <div>
                  <label className="mb-2 block text-xs font-semibold text-slate-300">
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
                    className="w-full rounded-xl border border-white/12 bg-white/[0.04] px-4 py-4 text-center font-mono text-3xl tracking-[0.5em] text-slate-100 outline-none placeholder:text-slate-600 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30"
                  />
                </div>
                <div>
                  <label className="mb-2 block text-xs font-semibold text-slate-300">
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
                    className="w-full rounded-xl border border-white/12 bg-white/[0.04] px-4 py-4 text-center font-mono text-3xl tracking-[0.5em] text-slate-100 outline-none placeholder:text-slate-600 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30"
                  />
                </div>
              </>
            )}

            {state?.error && <p className="text-center text-sm text-red-400">{state.error}</p>}

            <button
              type="submit"
              disabled={pending}
              className="w-full rounded-xl bg-gradient-to-br from-blue-500 to-cyan-400 py-4 text-base font-semibold text-slate-950 transition hover:brightness-105 disabled:opacity-50"
            >
              {pending ? 'Logging in…' : 'Log In'}
            </button>
          </form>
        </div>

        <button
          type="button"
          onClick={() => setAdminMode(!adminMode)}
          className="mt-5 w-full text-center font-mono text-[10px] uppercase tracking-[0.16em] text-slate-600 hover:text-slate-400"
        >
          {adminMode ? '← Team Login' : 'Log In as Admin'}
        </button>
      </div>
    </main>
  )
}
