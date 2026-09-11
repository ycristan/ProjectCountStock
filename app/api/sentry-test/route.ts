import * as Sentry from '@sentry/nextjs'
import { NextResponse } from 'next/server'

export async function GET() {
  if (process.env.VERCEL_ENV !== 'preview') {
    return new NextResponse('Not found', { status: 404 })
  }

  const error = new Error(
    '[Sentry test] Erro controlado no servidor do Preview',
  )

  Sentry.captureException(error)
  const sent = await Sentry.flush(3000)

  return NextResponse.json(
    { sent },
    { status: sent ? 500 : 503 },
  )
}
