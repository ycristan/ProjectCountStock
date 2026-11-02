'use client'

import { Button, Notice } from '@/components/ui'

export default function ErrorPage({ reset }: { reset: () => void }) {
  return <div className="flex flex-col items-start gap-3">
    <Notice>Não foi possível carregar a conferência. Nenhum dado foi alterado.</Notice>
    <Button type="button" variant="outline" size="sm" onClick={reset}>Tentar novamente</Button>
  </div>
}
