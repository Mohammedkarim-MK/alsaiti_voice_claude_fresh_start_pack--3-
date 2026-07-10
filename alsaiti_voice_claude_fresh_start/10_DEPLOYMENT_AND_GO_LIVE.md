# Deployment and Go-Live

Keep the app hosting-provider neutral.

Production components:

1. Next.js web application
2. Supabase
3. Separate long-running voice worker
4. Queue/background jobs
5. Monitoring and error tracking
6. HTTPS domains

Before go-live:

- Type-check, lint, tests, and production build pass
- No production demo fallback
- No tracked secrets
- RLS and cross-tenant access tested
- Migrations versioned
- Rate limiting and security headers configured
- Webhook signatures verified
- Logs avoid full PII and secrets
- Backups and rollback documented
- Staging smoke test completed
- Pilot business completed

Suggested domain: `voice.alsaitigrowth.com`.
