# Security, Testing, and Continuation

## Security

- Revoke exposed Stripe and Resend keys
- Use Stripe test mode during development
- Never commit `.env.local`
- Never expose server-only keys
- Keep RLS enabled
- Test cross-business isolation
- Validate public input
- Add rate limiting and idempotency
- Verify all provider webhooks
- Avoid full PII in logs
- Add retention/deletion controls
- Never store hidden model reasoning

## Acceptance checks

Check auth, workspace provisioning, RLS, leads, status, notes, activity, duplicate capture, email failure handling, signed webhook retry, chat installation, billing lifecycle, test voice call, responsive layouts, and production smoke tests.

## Continuation prompt

```text
Continue the existing Alsaiti Voice repository.

Before editing:
1. Read CLAUDE.md.
2. Read docs/IMPLEMENTATION_STATUS.md.
3. Read docs/DECISIONS.md.
4. Read docs/NEXT_ACTIONS.md.
5. Inspect git status and git diff.
6. Run the quickest relevant baseline checks.
7. Identify the last completed milestone.
8. Continue from the next unfinished acceptance criterion.

Do not restart the project, duplicate completed work, or overwrite working migrations.

At the end, run checks, update documentation, list changed files, and state what is complete, mocked, blocked, and next.
```
