type SoloEntryRow = {
  brand_code: string
  brand_name: string | null
  final_cases: number
  final_units: number
}

// ponytail: failure here is logged, never thrown — the caller has already
// closed the session and must not roll that back just because the e-mail failed
export async function sendSoloResultsEmail(
  to: string,
  sessionTitle: string,
  counterName: string | null,
  entries: SoloEntryRow[],
): Promise<void> {
  const serviceId = process.env.EMAILJS_SERVICE_ID
  const templateId = process.env.EMAILJS_TEMPLATE_ID
  const publicKey = process.env.EMAILJS_PUBLIC_KEY
  const privateKey = process.env.EMAILJS_PRIVATE_KEY
  if (!serviceId || !templateId || !publicKey || !privateKey) {
    console.error('sendSoloResultsEmail: EmailJS env vars not fully configured, skipping.')
    return
  }

  try {
    const res = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        service_id: serviceId,
        template_id: templateId,
        user_id: publicKey,
        accessToken: privateKey,
        template_params: {
          to_email: to,
          session_title: sessionTitle,
          counter_name: counterName ?? 'a counter',
          date: new Date().toLocaleString('en-GB'),
          items: entries.map((r) => ({
            brand_name: r.brand_name ?? '',
            brand_code: r.brand_code,
            cases: r.final_cases,
            units: r.final_units,
            status: 'Avl',
          })),
        },
      }),
    })
    if (!res.ok) {
      console.error('sendSoloResultsEmail: EmailJS returned an error', res.status, await res.text())
    }
  } catch (err) {
    console.error('sendSoloResultsEmail: failed to send', err)
  }
}
