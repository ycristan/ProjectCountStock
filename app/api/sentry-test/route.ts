import { NextResponse } from 'next/server'

export async function GET() {
  if (process.env.VERCEL_ENV !== 'preview') {
    return new NextResponse('Not found', { status: 404 })
  }

  throw new Error('[Sentry test] Erro controlado no servidor do Preview')
}
