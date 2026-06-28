import { listarEquipes } from '@/actions/sessao'
import { headers } from 'next/headers'
import qrcode from 'qrcode'
import Link from 'next/link'
import { PrintButton } from './_components/PrintButton'

const ROLE_ORDER = ['contador_1', 'contador_2', 'independente']
const ROLE_LABEL: Record<string, string> = {
  contador_1: 'Contador 1',
  contador_2: 'Contador 2',
  independente: 'Independente',
}

export default async function ImprimirPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const contadores = await listarEquipes(id)

  const h = await headers()
  const host = h.get('host') ?? 'localhost:3000'
  const isLocal = host.startsWith('localhost') || host.startsWith('127.')
  const appUrl = `${isLocal ? 'http' : 'https'}://${host}`

  const qrRaw = await qrcode.toString(appUrl, { type: 'svg', margin: 1, width: 128 })
  // strip XML declaration so SVG embeds cleanly inline
  const qrSvg = qrRaw.replace(/^<\?xml[^>]*\?>\s*/, '')

  const teamMap = new Map<string, typeof contadores>()
  for (const c of contadores) {
    if (!teamMap.has(c.team_id)) teamMap.set(c.team_id, [])
    teamMap.get(c.team_id)!.push(c)
  }
  const teams = [...teamMap.values()].sort((a, b) =>
    a[0].team_name.localeCompare(b[0].team_name)
  )

  return (
    <>
      <style>{`
        @media print {
          .no-print { display: none !important; }
          .page-break { break-after: page; }
        }
        @page { size: A4 portrait; margin: 1.5cm; }
      `}</style>

      <div className="no-print flex items-center gap-3 px-6 py-3 border-b border-slate-200 bg-white sticky top-0 z-10">
        <Link
          href={`/admin/sessao/${id}/equipes`}
          className="text-sm text-slate-500 hover:text-slate-700"
        >
          ← Equipes
        </Link>
        <PrintButton />
        <span className="text-xs text-slate-400 ml-1">
          {teams.length} equipe{teams.length !== 1 ? 's' : ''} · {contadores.length} cartões
        </span>
      </div>

      <div className="px-6 py-8 space-y-12 bg-white min-h-screen">
        {teams.map((grupo, ti) => {
          const first = grupo[0]
          const sorted = [...grupo].sort(
            (a, b) => ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role)
          )
          return (
            <div key={first.team_id} className={ti < teams.length - 1 ? 'page-break' : ''}>
              <h1
                className="text-center mb-5 font-black uppercase tracking-widest"
                style={{ fontSize: '2.4rem', letterSpacing: '0.12em' }}
              >
                {first.team_name}
              </h1>

              <div className="border-[3px] border-black">
                {sorted.map((c, ci) => (
                  <div
                    key={c.auth_user_id}
                    className={`flex${ci < sorted.length - 1 ? ' border-b-[3px] border-black' : ''}`}
                  >
                    {/* Credenciais */}
                    <div className="flex-1 p-5 border-r-[3px] border-black">
                      <div className="font-black uppercase tracking-wide" style={{ fontSize: '1.1rem' }}>
                        {ROLE_LABEL[c.role] ?? c.role}
                      </div>
                      <div className="font-bold mt-1" style={{ fontSize: '1.2rem' }}>
                        {c.full_name || '—'}
                      </div>
                      <div className="flex gap-4 mt-4">
                        <div className="border-2 border-slate-400 rounded-lg px-4 py-2 bg-slate-50">
                          <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">
                            PIN Equipe
                          </div>
                          <div className="font-black font-mono tracking-[0.25em]" style={{ fontSize: '1.6rem' }}>
                            {c.team_pin}
                          </div>
                        </div>
                        <div className="border-2 border-slate-400 rounded-lg px-4 py-2 bg-slate-50">
                          <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">
                            PIN Pessoal
                          </div>
                          <div className="font-black font-mono tracking-[0.25em]" style={{ fontSize: '1.6rem' }}>
                            {c.user_pin}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* QR code */}
                    <div className="flex items-center justify-center gap-2 px-5 bg-black" style={{ minWidth: '168px' }}>
                      <div
                        className="bg-white rounded p-1"
                        dangerouslySetInnerHTML={{ __html: qrSvg }}
                      />
                      <div
                        className="text-white font-black uppercase text-xs tracking-[0.35em]"
                        style={{
                          writingMode: 'vertical-rl',
                          textOrientation: 'mixed',
                          transform: 'rotate(180deg)',
                        }}
                      >
                        Scan Me
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )
        })}

        {teams.length === 0 && (
          <p className="text-center text-slate-400 py-20">Nenhuma equipe encontrada.</p>
        )}
      </div>
    </>
  )
}
