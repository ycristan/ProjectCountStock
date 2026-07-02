'use server'

import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase-admin'

async function makeSupabase() {
  const cookieStore = await cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        setAll(cookiesToSet: { name: string; value: string; options?: any }[]) {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          )
        },
      },
    }
  )
}

export async function login(
  _prevState: { error?: string; redirect?: string } | null,
  formData: FormData
): Promise<{ error?: string; redirect?: string } | null> {
  const teamPin = (formData.get('team_pin') as string | null)?.trim()
  const userPin = (formData.get('user_pin') as string | null)?.trim()
  const email = (formData.get('email') as string | null)?.trim().toLowerCase()
  const password = formData.get('password') as string | null

  let signInEmail: string
  let signInPassword: string

  if (teamPin && userPin) {
    if (/^\d{4}$/.test(teamPin)) {
      signInEmail = `${teamPin}${userPin}@count.local`
      signInPassword = userPin
    } else {
      // ponytail: primeiro campo não-numérico = codinome de contador solo; entra pela mesma
      // tela de login (sem toggle, sem URL). Restrição: codinome não pode ser 4 dígitos puros.
      const admin = createAdminClient()
      const { data: session } = await admin
        .from('solo_sessions')
        .select('id')
        .ilike('counter_name', teamPin)
        .eq('access_pin', userPin)
        .eq('status', 'open')
        .limit(1)
        .maybeSingle()
      if (!session) return { error: 'Invalid code or PIN.' }
      const cookieStore = await cookies()
      cookieStore.set(`solo_pin_${session.id}`, userPin, {
        httpOnly: true,
        path: '/',
        maxAge: 60 * 60 * 24,
      })
      // ponytail: set cookie + client-side nav (mesmo fluxo do PinForm). Um redirect() no
      // servidor aqui perderia o cookie httpOnly na requisição seguinte → /contar rejeitava.
      return { redirect: `/solo/${session.id}/contar` }
    }
  } else if (email && password) {
    signInEmail = email
    signInPassword = password
  } else {
    return { error: 'Please fill in all fields.' }
  }

  const supabase = await makeSupabase()
  const { error } = await supabase.auth.signInWithPassword({
    email: signInEmail,
    password: signInPassword,
  })

  if (error) return { error: 'Invalid code or PIN.' }
  redirect('/')
}

export async function logout() {
  const supabase = await makeSupabase()
  await supabase.auth.signOut()
  redirect('/login')
}
