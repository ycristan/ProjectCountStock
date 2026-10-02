'use client'

export default function ErrorPage({ reset }: { reset: () => void }) {
  return <div role="alert" className="border rounded-xl p-4">
    <p>Não foi possível carregar a conferência. Nenhum dado foi alterado.</p>
    <button type="button" onClick={reset} className="border rounded-lg px-4 py-2 mt-3">Tentar novamente</button>
  </div>
}
