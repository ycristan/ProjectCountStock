import { redirect } from 'next/navigation'

export default async function ProgressoPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  redirect(`/admin/sessao/${id}/combinacao`)
}
