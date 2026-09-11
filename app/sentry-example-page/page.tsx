import { notFound } from 'next/navigation'
import SentryTestControls from './SentryTestControls'

export default function SentryExamplePage() {
  if (process.env.VERCEL_ENV !== 'preview') {
    notFound()
  }

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
          width: 'min(100%, 520px)',
          border: '1px solid #cbd5e1',
          borderRadius: '12px',
          padding: '32px',
          background: '#ffffff',
        }}
      >
        <h1 style={{ marginTop: 0, color: '#0f172a' }}>Teste do Sentry</h1>
        <p style={{ color: '#475569', lineHeight: 1.5 }}>
          Esta página existe somente no Preview da PR de observabilidade. Ela
          permite confirmar o registro de um erro do navegador e de um erro do
          servidor sem afetar inventário, contagens ou produção.
        </p>
        <SentryTestControls />
      </section>
    </main>
  )
}
