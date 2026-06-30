'use server'

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
  const teamPin = (formData.get('team_pin') as string | null)?.trim()
  const userPin = (formData.get('user_pin') as string | null)?.trim()
  const email = (formData.get('email') as string | null)?.trim().toLowerCase()
  const password = formData.get('password') as string | null

  let signInEmail: string
  let signInPassword: string

  if (teamPin && userPin) {
    signInEmail = `${teamPin}${userPin}@count.local`
    signInPassword = userPin
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
