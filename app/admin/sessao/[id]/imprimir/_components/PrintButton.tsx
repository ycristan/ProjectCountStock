'use client'

export function PrintButton() {
  return (
    <button
      onClick={() => window.print()}
      className="px-4 py-2 bg-slate-900 text-white rounded-xl text-sm font-semibold hover:bg-slate-800"
    >
      Imprimir / Salvar PDF
    </button>
  )
}
