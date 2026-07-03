// ponytail: PostgREST enforces its own "Max Rows" cap (default 1000) server-side —
// a single .range(0, N) request is silently clamped to that cap regardless of N.
// This loops in page-sized windows until a short page confirms the end.
const PAGE_SIZE = 1000

export async function fetchAllRows<T>(
  fetchPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>
): Promise<T[]> {
  const rows: T[] = []
  let from = 0
  for (;;) {
    const { data, error } = await fetchPage(from, from + PAGE_SIZE - 1)
    if (error) throw new Error(error.message)
    if (!data || data.length === 0) break
    rows.push(...data)
    if (data.length < PAGE_SIZE) break
    from += PAGE_SIZE
  }
  return rows
}
