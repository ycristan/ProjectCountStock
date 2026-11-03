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
        background: '#F1F3F3',
      }}
    >
      <section
        style={{
          width: 'min(100%, 480px)',
          border: '1px solid #D9D9D9',
          borderRadius: '12px',
          padding: '32px',
          background: '#ffffff',
          textAlign: 'center',
        }}
      >
        <h1 style={{ margin: 0, color: '#353535', fontSize: '24px' }}>
          Não foi possível carregar esta página
        </h1>
        <p style={{ color: '#4D4D4D', lineHeight: 1.5 }}>
          O problema foi registrado para análise. Você pode tentar novamente.
        </p>
        <button
          type="button"
          onClick={reset}
          style={{
            border: 0,
            borderRadius: '8px',
            padding: '10px 16px',
            background: '#353535',
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
