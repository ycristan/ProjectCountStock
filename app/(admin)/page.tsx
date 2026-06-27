import Link from 'next/link'

export default function AdminPage() {
  return (
    <div>
      <h2 className="text-xl font-semibold text-slate-900 mb-6">Dashboard</h2>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Link
          href="/admin/upload"
          className="block p-6 bg-white border border-slate-200 rounded-xl hover:border-blue-500 hover:shadow-sm transition-all"
        >
          <h3 className="font-semibold text-slate-900 mb-1">Upload Inventário</h3>
          <p className="text-sm text-slate-500">Importar .xlsx com Brand Codes e BIN Locations</p>
        </Link>
        <Link
          href="/admin/sessao"
          className="block p-6 bg-white border border-slate-200 rounded-xl hover:border-blue-500 hover:shadow-sm transition-all"
        >
          <h3 className="font-semibold text-slate-900 mb-1">Nova Sessão</h3>
          <p className="text-sm text-slate-500">Criar sessão de contagem e configurar equipes</p>
        </Link>
      </div>
    </div>
  )
}
