-- MVP ALTERNATIVE to an external secret vault (lighter go-live path).
-- Store OAuth tokens as envelope-encrypted blobs (AES-256-GCM) in Postgres, with the
-- encryption key held OUTSIDE the database (server env: OAUTH_CREDENTIAL_ENCRYPTION_KEY).
-- This lets you go live on hosted Supabase alone (no VPS/vault to operate).
-- Upgrade to a dedicated vault (Infisical / OpenBao / cloud KMS) before scale.

create table if not exists crm_credentials (
  id uuid primary key default gen_random_uuid(),
  ciphertext text not null,          -- "iv.tag.ct" (base64), AES-256-GCM of the TokenSet JSON
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table crm_credentials enable row level security;
-- No client policies: ONLY the server (service role) may read/write. Never expose to anon/authenticated.
revoke all on crm_credentials from anon, authenticated;
