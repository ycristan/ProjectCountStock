'use client'

import { useEffect } from 'react'
import * as Sentry from '@sentry/nextjs'

type ErrorPageProps = {
  error: Error & { digest?: string }
  reset: () => void
}

export default function ErrorPage({ error, reset }: ErrorPageProps) {
  useEffect(() => {
    Sentry.captureException(error)
  }, [error])

  return (
    <main
      style={{
        display: 'grid',
        minHeight: '100vh',
        placeItems: 'center',
        padding: '24px',
        background: '#f1f5f9',
      }}
    >
      <section
        style={{
          width: 'min(100%, 480px)',
          border: '1px solid #cbd5e1',
          borderRadius: '12px',
          padding: '32px',
          background: '#ffffff',
          textAlign: 'center',
        }}
      >
        <h1 style={{ margin: 0, color: '#0f172a', fontSize: '24px' }}>
          Não foi possível carregar esta página
        </h1>
        <p style={{ color: '#475569', lineHeight: 1.5 }}>
          O problema foi registrado para análise. Você pode tentar novamente.
        </p>
        <button
          type="button"
          onClick={reset}
          style={{
            border: 0,
            borderRadius: '8px',
            padding: '10px 16px',
            background: '#0f172a',
            color: '#ffffff',
            cursor: 'pointer',
            fontWeight: 600,
          }}
        >
          Tentar novamente
        </button>
      </section>
    </main>
  )
}
