import Link from 'next/link'

export default function SessaoTypePickerPage() {
  return (
    <div>
      <Link href="/admin" className="inline-flex items-center text-sm text-slate-500 hover:text-slate-700 mb-4">
        ← Dashboard
      </Link>
      <h2 className="text-xl font-semibold text-slate-900 mb-6">New Session</h2>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Link
          href="/admin/sessao/team"
          className="block p-6 bg-white border border-slate-200 rounded-xl hover:border-blue-500 hover:shadow-sm transition-all"
        >
          <h3 className="font-semibold text-slate-900 mb-1">Team Count Session</h3>
          <p className="text-sm text-slate-500">Blind triple count with reconciliation across teams</p>
        </Link>
        <Link
          href="/admin/sessao/solo"
          className="block p-6 bg-white border border-slate-200 rounded-xl hover:border-blue-500 hover:shadow-sm transition-all"
        >
          <h3 className="font-semibold text-slate-900 mb-1">Solo Count Session</h3>
          <p className="text-sm text-slate-500">Count yourself or assign to the solo counter — no reconciliation</p>
        </Link>
      </div>
    </div>
  )
}
