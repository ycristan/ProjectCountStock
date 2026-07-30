import { Resend } from 'resend'

type SoloEntryRow = {
  brand_code: string
  brand_name: string | null
  final_cases: number
  final_units: number
}

function buildHtmlTable(rows: SoloEntryRow[]): string {
  const body = rows
    .map(
      (r) =>
        `<tr><td>${r.brand_name ?? ''}</td><td>${r.brand_code}</td><td>${r.final_cases}</td><td>${r.final_units}</td><td>Avl</td></tr>`
    )
    .join('')

  return `
    <table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse;font-family:sans-serif;font-size:13px">
      <thead>
        <tr style="background:#f1f5f9">
          <th>Brand Name</th><th>Brand Code</th><th>Count Qty (Outers)</th><th>Count Qty (Units)</th><th>Status</th>
        </tr>
      </thead>
      <tbody>${body}</tbody>
    </table>
  `
}

// ponytail: failure here is logged, never thrown — the caller has already
// closed the session and must not roll that back just because the e-mail failed
export async function sendSoloResultsEmail(
  to: string,
  sessionTitle: string,
  counterName: string | null,
  entries: SoloEntryRow[],
): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    console.error('sendSoloResultsEmail: RESEND_API_KEY not configured, skipping.')
    return
  }
  try {
    const resend = new Resend(apiKey)
    await resend.emails.send({
      from: 'Count Stock <onboarding@resend.dev>',
      to,
      subject: `Solo Count finalised: ${sessionTitle}`,
      html: `<p>Solo count <strong>${sessionTitle}</strong> was finalised by ${counterName ?? 'a counter'}.</p>${buildHtmlTable(entries)}`,
    })
  } catch (err) {
    console.error('sendSoloResultsEmail: failed to send', err)
  }
}
