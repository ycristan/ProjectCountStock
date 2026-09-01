import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export async function proxy(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        setAll(cookiesToSet: { name: string; value: string; options?: any }[]) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) => supabaseResponse.cookies.set(name, value, options))
        },
      },
    },
  )

  const { data: { user } } = await supabase.auth.getUser()
  const { pathname } = request.nextUrl

  if (!user && pathname !== '/login') {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  if (!user) return supabaseResponse

  const [{ data: adminValue }, { data: soloValue }] = await Promise.all([
    supabase.rpc('is_admin'),
    supabase.rpc('is_solo_counter'),
  ])
  const isAdmin = adminValue === true
  const isSoloCounter = soloValue === true
  const home = isAdmin ? '/admin' : isSoloCounter ? '/solo' : '/busca'

  if (pathname === '/' || pathname === '/login') {
    return NextResponse.redirect(new URL(home, request.url))
  }
  if (pathname.startsWith('/admin') && !isAdmin) {
    return NextResponse.redirect(new URL(home, request.url))
  }
  if (pathname.startsWith('/busca') && (isAdmin || isSoloCounter)) {
    return NextResponse.redirect(new URL(home, request.url))
  }
  if (pathname.startsWith('/solo') && !isAdmin && !isSoloCounter) {
    return NextResponse.redirect(new URL('/busca', request.url))
  }

  return supabaseResponse
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
