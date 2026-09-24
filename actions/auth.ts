'use server'

import { pinPassword } from '@/lib/pin-credentials'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'

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
  _prevState: { error: string } | null,
  formData: FormData
): Promise<{ error: string } | null> {
  const field = (key: string) => { const value = formData.get(key); return typeof value === 'string' ? value : '' }
  const teamPin = field('team_pin').trim()
  const userPin = field('user_pin').trim()
  const email = field('email').trim().toLowerCase()
  const password = field('password')

  let signInEmail: string
  let signInPassword: string

  if (teamPin || userPin) {
    if (!/^\d{4}$/.test(teamPin) || !/^\d{4}$/.test(userPin)) return { error: 'Invalid code or PIN.' }
    signInEmail = `${teamPin}${userPin}@count.local`
    signInPassword = pinPassword(teamPin, userPin)
  } else if (email && password) {
    signInEmail = email
    signInPassword = password
  } else {
    return { error: 'Please fill in all fields.' }
  }

  const supabase = await makeSupabase()
  let { error } = await supabase.auth.signInWithPassword({
    email: signInEmail,
    password: signInPassword,
  })

  // Existing team/solo accounts keep their original PIN password. No resets,
  // migration of live credentials or retry on rate limits/network failures.
  if (error?.code === 'invalid_credentials' && teamPin && userPin) {
    const legacy = await supabase.auth.signInWithPassword({ email: signInEmail, password: userPin })
    error = legacy.error
  }
  if (error) return { error: 'Invalid code or PIN.' }
  redirect('/')
}

export async function logout() {
  const supabase = await makeSupabase()
  await supabase.auth.signOut()
  redirect('/login')
}
