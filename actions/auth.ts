'use server'

import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import type { ReadonlyRequestCookies } from 'next/dist/server/web/spec-extension/adapters/request-cookies'

function makeSupabase(cookieStore: ReadonlyRequestCookies) {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
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
  const username = (formData.get('username') as string).trim().toLowerCase()
  const password = formData.get('password') as string

  const cookieStore = await cookies()
  const supabase = makeSupabase(cookieStore)

  // Admins use real email; counters use username@count.local
  const email = username.includes('@') ? username : `${username}@count.local`

  const { error } = await supabase.auth.signInWithPassword({ email, password })

  if (error) {
    return { error: 'Usuário ou PIN inválido.' }
  }

  redirect('/')
}

export async function logout() {
  const cookieStore = await cookies()
  const supabase = makeSupabase(cookieStore)
  await supabase.auth.signOut()
  redirect('/login')
}
