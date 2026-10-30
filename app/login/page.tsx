'use client'

import { useActionState, useState } from 'react'
import { login } from '@/actions/auth'
import { Button, Label } from '@/components/ui'

type LoginState = { error: string } | null

const pinInput = 'w-full rounded-lg border-2 border-ink bg-surface py-3 text-center font-mono text-[32px] font-semibold tracking-[0.5em] outline-none focus:outline-3 focus:outline-info placeholder:text-ink-3'
const textInput = 'w-full rounded-lg border-2 border-ink bg-surface px-4 py-3 text-lg outline-none focus:outline-3 focus:outline-info'

export default function LoginPage() {
  const [state, formAction, pending] = useActionState<LoginState, FormData>(login, null)
  const [adminMode, setAdminMode] = useState(false)

  return (
    <main className="flex min-h-screen flex-col bg-ground">
      <div className="bg-ink px-4 py-8 text-ground">
        <div className="mx-auto flex max-w-sm items-center gap-3">
          <span aria-hidden="true" className="flex size-12 items-center justify-center bg-safety font-display text-2xl font-bold text-ink">CS</span>
          <div className="flex flex-col">
            <h1 className="m-0 font-display text-3xl font-bold uppercase tracking-[0.04em]">Count Stock</h1>
            <span className="text-sm text-[#C9C6BE]">{adminMode ? 'Admin access' : 'Use the PINs on your login card'}</span>
          </div>
        </div>
      </div>
      <div className="mx-auto w-full max-w-sm px-4 py-6">
        <form action={formAction} className="flex flex-col gap-4">
          {adminMode ? (
            <>
              <label className="flex flex-col gap-1.5">
                <Label>Email</Label>
                <input name="email" type="email" required autoCapitalize="none" autoComplete="email" className={textInput} />
              </label>
              <label className="flex flex-col gap-1.5">
                <Label>Password</Label>
                <input name="password" type="password" required autoComplete="current-password" className={textInput} />
              </label>
            </>
          ) : (
            <>
              <label className="flex flex-col gap-1.5">
                <Label>Team Code</Label>
                <input name="team_pin" type="text" inputMode="numeric" pattern="[0-9]{4}" maxLength={4} required
                  placeholder="0000" autoComplete="off" className={pinInput} />
              </label>
              <label className="flex flex-col gap-1.5">
                <Label>Your PIN</Label>
                <input name="user_pin" type="password" inputMode="numeric" pattern="[0-9]{4}" maxLength={4} required
                  placeholder="••••" autoComplete="off" className={pinInput} />
              </label>
            </>
          )}
          {state?.error && (
            <p role="alert" className="m-0 rounded-md bg-alert px-3 py-2 text-center text-sm font-medium text-white">{state.error}</p>
          )}
          <Button type="submit" variant="primary" size="lg" full disabled={pending}>
            {pending ? 'Logging in...' : 'Log In'}
          </Button>
        </form>
        <button
          type="button"
          onClick={() => setAdminMode(!adminMode)}
          className="mt-6 min-h-11 w-full text-center text-sm font-medium text-ink-2 underline underline-offset-4"
        >
          {adminMode ? 'Counter login' : 'Log In as Admin'}
        </button>
      </div>
    </main>
  )
}
