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
          <h3 className="font-semibold text-slate-900 mb-1">Upload Inventory</h3>
          <p className="text-sm text-slate-500">Import .xlsx with Brand Codes and BIN Locations</p>
        </Link>
        <Link
          href="/admin/inventario"
          className="block p-6 bg-white border border-slate-200 rounded-xl hover:border-blue-500 hover:shadow-sm transition-all"
        >
          <h3 className="font-semibold text-slate-900 mb-1">View Inventory</h3>
          <p className="text-sm text-slate-500">View and edit inventory items</p>
        </Link>
        <Link
          href="/admin/sessao"
          className="block p-6 bg-white border border-slate-200 rounded-xl hover:border-blue-500 hover:shadow-sm transition-all"
        >
          <h3 className="font-semibold text-slate-900 mb-1">New Session</h3>
          <p className="text-sm text-slate-500">Create a count session and configure teams</p>
        </Link>
        <Link
          href="/admin/sessoes"
          className="block p-6 bg-white border border-slate-200 rounded-xl hover:border-blue-500 hover:shadow-sm transition-all"
        >
          <h3 className="font-semibold text-slate-900 mb-1">Monitor Count</h3>
          <p className="text-sm text-slate-500">Track team progress in real time</p>
        </Link>
      </div>
    </div>
  )
}
