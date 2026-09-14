# Inventory rule contracts

Run with Node 24:
`node --experimental-vm-modules --test --test-reporter=tap tests/inventory/*.test.mjs`

No npm install, Supabase credentials, network client, real database or email.
The loader strips TypeScript types and executes the actual repository functions in a VM with allowlisted dependency doubles. Unknown imports and unmodelled tables/RPCs fail instead of loading real clients.

Eight baseline tests and three strict desired-contract tests. Contract failures are deliberately NOT skipped, marked TODO, inverted into passing tests, or hidden with continue-on-error. This is a diagnostic draft PR, not permission to merge a failing suite.

Scope: application-action boundaries only. The fake database records write attempts and does not implement RLS, triggers, transactions or persistence. Failures show missing guards at the action boundary, not proof that production database protections are absent. The positive write test guards against a fake that rejects everything.

The 400→480 test checks the real arithmetic helper only; it does NOT prove dual approval, automatic recalculation of stored counts, closed-report immutability, concurrent updates, weight counting or team reconciliation. Those require subsequent integration tests against the disposable database and the corresponding implementation.

Rules approved by Yuri are documented in PR #68. This separate branch starts from main, does not merge #68, and changes no application or migration files.
