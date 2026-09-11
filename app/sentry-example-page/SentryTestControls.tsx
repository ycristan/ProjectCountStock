'use client'

import { useState } from 'react'
import * as Sentry from '@sentry/nextjs'

const buttonStyle = {
  border: 0,
  borderRadius: '8px',
  padding: '10px 16px',
  background: '#0f172a',
  color: '#ffffff',
  cursor: 'pointer',
  fontWeight: 600,
} as const

export default function SentryTestControls() {
  const [message, setMessage] = useState('')

  function testBrowserError() {
    Sentry.captureException(
      new Error('[Sentry test] Erro controlado no navegador do Preview'),
    )
    setMessage('Erro do navegador enviado. Confira o painel do Sentry em alguns segundos.')
  }

  async function testServerError() {
    await fetch('/api/sentry-test')
    setMessage('Erro do servidor enviado. Confira o painel do Sentry em alguns segundos.')
  }

  return (
    <>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px' }}>
        <button type="button" onClick={testBrowserError} style={buttonStyle}>
          Testar erro do navegador
        </button>
        <button type="button" onClick={testServerError} style={buttonStyle}>
          Testar erro do servidor
        </button>
      </div>
      {message && <p style={{ color: '#475569' }}>{message}</p>}
    </>
  )
}
