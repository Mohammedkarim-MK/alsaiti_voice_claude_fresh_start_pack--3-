# Alsaiti Voice — Real OAuth, CRM Authorisation and Telnyx Go-Live Specification

## Complete developer handoff for converting the static demo into a functional production SaaS

**Product:** Alsaiti Voice by Alsaiti Growth  
**Current demo:** GitHub Pages static SPA  
**Primary objective:** Make every CRM connection perform real third-party authorisation and make Telnyx phone-number provisioning, routing and real calls functional  
**Audience:** Senior full-stack developer, integration engineer, voice/telephony engineer and DevOps engineer

---

# 1. Executive instruction

The current GitHub Pages application is a polished and correctly labelled demonstration. It cannot become the production application merely by adding more front-end buttons.

The reason the Connect buttons do not take the user to HubSpot, Salesforce, Zoho, Dynamics, HighLevel, Google or Telnyx for genuine authorisation is that the demo is currently a static front-end and the connection behaviour is simulated.

A real connection requires all of the following:

```text
Provider application registration
+ client ID
+ client secret
+ authorised redirect URI
+ backend authorisation-start endpoint
+ OAuth state and PKCE protection
+ public callback endpoint
+ server-side code-to-token exchange
+ encrypted token storage
+ access-token refresh
+ provider metadata loading
+ a real test API operation
+ truthful connection status
```

The production goal is therefore:

```text
Move the application from static-demo architecture
↓
Deploy a real server-side application and API
↓
Register Alsaiti Voice with every third-party provider
↓
Implement real OAuth and secure token storage
↓
Replace simulated CRM statuses with real connection states
↓
Build Telnyx account, number and call integration
↓
Connect Telnyx to the real-time voice worker
↓
Complete a real public phone call
↓
Create exactly one lead
↓
Synchronise that lead to a genuinely authorised CRM
```

---

# 2. Direct answer: why the integration button does not open the CRM

The visible site is hosted on a `github.io` GitHub Pages URL and uses a hash route such as:

```text
#/integrations
```

That architecture can display screens and run browser JavaScript, but it has no trusted server runtime for:

- Holding provider client secrets
- Creating secure OAuth state records
- Exchanging authorisation codes for access and refresh tokens
- Encrypting tokens
- Refreshing tokens
- Receiving provider webhooks reliably
- Receiving Telnyx live call events
- Running background retry jobs
- Running a persistent voice worker
- Safely calling CRM APIs with customer credentials

The Connect button is therefore currently changing demo state or opening an internal wizard rather than starting a real OAuth flow.

## Required correction

The production application must have a public backend.

Recommended production URLs:

```text
https://voice.alsaitigrowth.com          Main web application
https://api.voice.alsaitigrowth.com      API, OAuth callbacks and webhooks
https://worker.voice.alsaitigrowth.com   Internal worker/health endpoint if needed
```

The GitHub Pages URL may remain online as a clearly labelled public demonstration, but it should not be used for production accounts, real OAuth tokens, real telephone events, passwords, billing or customer data.

---

# 3. Production hosting solution

## 3.1 Recommended architecture

Deploy the full application as a server-capable Next.js or Node application.

```text
Browser / Expo app
↓
Next.js production application
↓
Server-side API and OAuth callback routes
↓
Supabase
↓
Encrypted credential vault
↓
Self-hosted n8n
↓
CRM providers

Telnyx public carrier
↓
Telnyx SIP or Voice API
↓
Self-hosted LiveKit SIP / LiveKit
↓
Long-running voice-agent worker
↓
Alsaiti application services
```

## 3.2 Deployment choices

A senior developer may choose one of these production models.

### Recommended local-control model

Use an Alsaiti-controlled VPS or cloud VM with Docker Compose.

Suggested containers/services:

```text
reverse-proxy       Caddy, Traefik or Nginx
web                  Next.js Node server
integration-worker   background/outbox worker
voice-worker         LiveKit Agents worker
n8n                  self-hosted integration engine
redis                queues, locks and rate limits
vault                Infisical, OpenBao or managed equivalent
monitoring           Sentry/OpenTelemetry/Prometheus as selected
```

Continue using hosted Supabase initially, or self-host it later only if the operational team can manage backups, upgrades, security and availability properly.

### Managed-hosting model

The web/API application may be deployed to a suitable Node/Next.js platform, while the voice worker, LiveKit SIP and n8n run on long-lived compute.

The key requirement is not the brand of host. It is that the chosen environment supports:

- Server-side secrets
- Stable public callback URLs
- Long-running background workers where required
- Webhooks
- Queues
- HTTPS
- Custom domains
- Production logging
- Rollbacks

## 3.3 Environment separation

Create separate provider applications and credentials for:

```text
development
staging
production
```

Do not share production CRM clients, Telnyx keys or webhook secrets with development.

---

# 4. Source-of-truth rule

Supabase remains the main source of truth.

Supabase must store:

- Businesses
- Users and memberships
- Leads
- Calls
- Conversations
- Assistant configuration
- Phone-number assignments
- CRM connection status
- Provider account identity
- Credential references
- Synchronisation records
- OAuth audit events
- Webhook events
- Usage
- Billing entitlements

The secret vault stores:

- OAuth access tokens
- OAuth refresh tokens
- Client secrets where necessary
- Telnyx customer API keys
- SIP passwords
- HMAC secrets
- Encryption keys

n8n executes integrations and automations, but it is not the only database and must not hold the only copy of the integration state.

---

# 5. Real integration connection flow

Every CRM card must use the following flow.

```text
User clicks Connect
↓
Front end calls Alsaiti authorisation-start endpoint
↓
Backend validates user, business and permission
↓
Backend creates short-lived OAuth authorisation session
↓
Backend generates state and PKCE values where required
↓
Backend returns provider authorisation URL
↓
Browser navigates to the provider
↓
Provider displays login and consent screen
↓
User grants or refuses access
↓
Provider redirects to Alsaiti callback URL
↓
Backend validates state and callback
↓
Backend exchanges code for provider tokens
↓
Tokens are encrypted and stored server-side
↓
Backend verifies the external account
↓
Backend loads pipelines, fields, owners and metadata
↓
User completes mapping and destination settings
↓
Backend performs a real test read/write
↓
Connection becomes Connected
```

## 5.1 Truthful connection states

Use these values:

```text
not_connected
authorisation_required
authorising
callback_received
token_exchange_in_progress
account_selection_required
configuration_required
metadata_loading
test_required
connected
degraded
attention_required
authorisation_expired
paused
disconnecting
disconnected
error
demo
```

## 5.2 Meaning of Connected

A card may display `Connected` only when:

1. The third party granted access
2. The credential exists in the secure vault
3. The external account was identified
4. Required scopes are present
5. Metadata was loaded
6. Mapping is valid
7. A real provider API test succeeded
8. No critical unresolved error remains

## 5.3 Demo state

The existing HubSpot example must remain labelled `Demo` until genuine authorisation exists.

Demo values such as synced lead counts and health must not be mixed with production values.

Display:

```text
Demo account
Demo data
No third-party account has been authorised
```

---

# 6. Provider application registration

The developer cannot complete production OAuth until Alsaiti Growth registers an application with each provider.

For every provider, configure:

- Application name: Alsaiti Voice
- Company: Alsaiti Growth
- Logo
- Product website
- Privacy policy
- Terms of service
- Support email
- Allowed redirect URI
- Requested scopes
- Test users/accounts
- Production review where required

Recommended production callback paths:

```text
https://api.voice.alsaitigrowth.com/oauth/hubspot/callback
https://api.voice.alsaitigrowth.com/oauth/pipedrive/callback
https://api.voice.alsaitigrowth.com/oauth/highlevel/callback
https://api.voice.alsaitigrowth.com/oauth/google/callback
https://api.voice.alsaitigrowth.com/oauth/salesforce/callback
https://api.voice.alsaitigrowth.com/oauth/zoho/callback
https://api.voice.alsaitigrowth.com/oauth/microsoft/callback
https://api.voice.alsaitigrowth.com/oauth/telnyx/callback
```

The exact URI registered with each provider must exactly match the URI used by the application.

---

# 7. OAuth security design

## 7.1 Authorisation sessions

Create a table such as:

```sql
create table oauth_authorisation_sessions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null,
  state_hash text not null unique,
  pkce_verifier_ciphertext text,
  requested_scopes text[] not null default '{}',
  redirect_uri text not null,
  return_path text,
  status text not null default 'created',
  expires_at timestamptz not null,
  completed_at timestamptz,
  error_code text,
  created_at timestamptz not null default now()
);
```

Do not encode sensitive user data directly into an unsigned `state` string.

Generate a random opaque value, hash it for storage and require an exact match on callback.

## 7.2 PKCE

Use PKCE whenever the provider requires or recommends it.

Store the verifier encrypted and send only the challenge to the provider.

## 7.3 Token vault

Preferred production layout:

```text
crm_connections table
- credential_reference: vault://...
- account identity
- status
- expiry metadata
- scopes

Secret vault
- encrypted access token
- encrypted refresh token
- client-specific secret if required
```

Never return CRM access or refresh tokens to the browser or native app.

## 7.4 Token refresh service

Implement a central service:

```ts
interface ProviderTokenService {
  getValidAccessToken(connectionId: string): Promise<string>;
  refreshAccessToken(connectionId: string): Promise<void>;
  revoke(connectionId: string): Promise<void>;
}
```

Requirements:

- Refresh shortly before expiry
- Use a distributed lock to prevent simultaneous refreshes
- Persist tokens atomically
- Retain the old token until the new token is safely written where appropriate
- Mark the integration `attention_required` when refresh is permanently rejected
- Audit every refresh without recording the token value

---

# 8. Generic backend route design

## 8.1 Start authorisation

```text
POST /api/integrations/:provider/authorise
```

Input:

```json
{
  "businessId": "uuid",
  "returnPath": "/integrations"
}
```

Output:

```json
{
  "authorizationUrl": "https://provider.example/oauth/..."
}
```

Server responsibilities:

- Authenticate user
- Verify business membership
- Verify integration-management permission
- Verify provider is enabled
- Generate state
- Generate PKCE if needed
- Save authorisation session
- Build provider URL from server-side configuration

## 8.2 Callback

```text
GET /api/oauth/:provider/callback
```

Responsibilities:

- Validate `state`
- Reject missing, expired or replayed state
- Handle denial/error response
- Exchange code server-side
- Store credential securely
- Query provider identity
- Create or update `crm_connections`
- Redirect to provider configuration wizard

## 8.3 Test connection

```text
POST /api/integrations/:connectionId/test
```

The test must perform a real provider operation.

Examples:

- Read current account identity
- Load pipelines and owners
- Create a clearly marked test contact and remove it where safe
- Update an existing designated test contact

## 8.4 Disconnect

```text
POST /api/integrations/:connectionId/disconnect
```

Responsibilities:

- Pause future jobs
- Revoke provider access where supported
- Delete/destroy token material
- Preserve non-secret audit and sync history
- Mark disconnected
- Preserve leads already captured

---

# 9. Database design for real integrations

## 9.1 crm_connections

```sql
create table crm_connections (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  provider text not null,
  status text not null default 'not_connected',
  external_account_id text,
  external_account_name text,
  external_user_id text,
  external_user_name text,
  credential_reference text,
  token_expires_at timestamptz,
  granted_scopes text[] not null default '{}',
  missing_scopes text[] not null default '{}',
  provider_region text,
  provider_environment text,
  instance_url text,
  api_domain text,
  configuration jsonb not null default '{}'::jsonb,
  field_mapping jsonb not null default '{}'::jsonb,
  sync_settings jsonb not null default '{}'::jsonb,
  last_authorised_at timestamptz,
  last_refreshed_at timestamptz,
  last_tested_at timestamptz,
  last_success_at timestamptz,
  last_failure_at timestamptz,
  last_error_code text,
  last_error_message text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

## 9.2 integration_connection_tests

```sql
create table integration_connection_tests (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  connection_id uuid not null references crm_connections(id) on delete cascade,
  provider text not null,
  status text not null,
  operation text not null,
  external_test_record_id text,
  safe_result jsonb,
  error_code text,
  error_message text,
  started_at timestamptz not null default now(),
  completed_at timestamptz
);
```

## 9.3 provider_oauth_events

Store non-secret audit events:

```text
authorisation_started
consent_granted
consent_denied
code_received
token_exchange_succeeded
token_exchange_failed
token_refreshed
refresh_failed
access_revoked
disconnected
```

Enable RLS and tenant isolation on all tables.

---

# 10. CRM-specific production requirements

# 10.1 HubSpot

Build a HubSpot public/distributed OAuth app.

Real flow:

```text
Connect HubSpot
↓
HubSpot account-selection and permission screen
↓
HubSpot callback
↓
Token exchange
↓
Load account identity
↓
Load owners, pipelines, stages and properties
↓
Select contact/deal behaviour
↓
Send test contact/deal
↓
Connected
```

Do not request every possible scope. Request the minimum scopes necessary for the selected features.

Handle:

- Access-token expiry
- Refresh-token rotation or update rules
- Removed application access
- Missing scopes
- Multiple HubSpot accounts
- API rate limits

# 10.2 Pipedrive

Use OAuth for multi-customer distribution.

A secure API-token connection may be offered for a controlled private integration, but it must be submitted server-side and stored encrypted.

After access:

- Verify company/account
- Load users
- Load pipelines and stages
- Load person, organisation and deal custom fields
- Test person/contact operation

# 10.3 HighLevel

Use the current HighLevel OAuth authorisation-code flow for a multi-customer app.

After authorisation:

- Identify agency/company context where applicable
- Let the user select location/sub-account
- Load pipelines
- Load stages
- Load users/owners
- Load workflows and tags if authorised
- Test contact and opportunity operation

Private Integration Tokens are an alternative only for customer-specific controlled connections.

# 10.4 Google Sheets

Use Google OAuth web-server flow.

After authorisation:

- Load permitted Google account
- Allow spreadsheet selection
- Allow worksheet selection
- Load headers
- Map lead fields
- Append a clearly marked test row
- Report whether the row will remain or can be removed

# 10.5 Salesforce

Use a Salesforce External Client App or Connected App with OAuth.

Support:

- Production login
- Sandbox login
- PKCE according to current Salesforce requirements
- Instance URL
- Organisation identity
- Lead, Contact, Account, Opportunity, Task and Note objects
- Custom fields
- Record types
- Owners
- Permission errors
- Dedicated integration-user/client-credentials mode for enterprise customers where appropriate

A Salesforce card is not Connected merely because credentials were entered. It must load the organisation and complete a real API test.

# 10.6 Zoho CRM

Use Zoho OAuth 2.0 authorisation-code flow.

Zoho is multi-data-centre and organisation/environment specific.

Persist:

- Accounts domain
- API domain
- Data centre
- Organisation ID
- Production/sandbox/developer environment
- Granted scopes
- Token expiry

Do not hard-code one Zoho URL for all customers.

After authorisation:

- Load organisation
- Load modules
- Load fields/layouts where needed
- Load owners
- Load pipelines/stages
- Complete a test Lead or Contact operation

# 10.7 Microsoft Dynamics 365 / Dataverse

Use Microsoft Entra ID OAuth and the Dataverse Web API.

After Microsoft sign-in/consent:

- Identify tenant
- Discover accessible Dataverse environments where permitted
- Let the user select the environment
- Store environment URL
- Load table/entity metadata
- Load contacts, accounts, leads, opportunities and activities
- Load option-set/status values
- Complete a real test operation

Support delegated access for normal self-service connections and a documented application-user/service-principal model for enterprise server-to-server deployments.

# 10.8 Custom API

The Custom API card requires a real server-side connector builder.

Support:

```text
No authentication
API key header
API key query parameter
Bearer token
Basic authentication
OAuth authorisation code
OAuth client credentials
HMAC signatures
Custom headers
```

The test console must run from the server, redact secrets and protect against SSRF.

# 10.9 Generic Webhook

Require endpoint verification.

Suggested flow:

```text
User enters HTTPS endpoint
↓
System creates signing secret
↓
System sends challenge/test event
↓
Endpoint returns successful expected response
↓
Connection becomes Verified
```

Every delivery must be HMAC signed.

---

# 11. Telnyx-first telephony strategy

Telnyx becomes the first production telephony provider.

Keep provider independence:

```ts
interface TelephonyProvider {
  verifyConnection(connectionId: string): Promise<ProviderIdentity>;
  searchNumbers(input: SearchNumberInput): Promise<AvailableNumber[]>;
  orderNumber(input: OrderNumberInput): Promise<NumberOrder>;
  getNumberOrder(orderId: string): Promise<NumberOrder>;
  configureNumber(input: ConfigureNumberInput): Promise<void>;
  initiateCall(input: InitiateCallInput): Promise<ProviderCall>;
  transferCall(input: TransferInput): Promise<void>;
  hangupCall(input: HangupInput): Promise<void>;
  verifyWebhook(input: RawWebhookInput): Promise<VerifiedTelephonyEvent>;
  getUsage(input: UsageInput): Promise<UsageResult>;
}
```

Implement first:

```text
TelnyxTelephonyProvider
```

Prepare later:

```text
SipTelephonyProvider
TwilioTelephonyProvider
OtherCarrierProvider
```

---

# 12. Telnyx account models

## 12.1 Alsaiti-managed Telnyx

This is the recommended first commercial path.

Where Telnyx enables Managed Accounts for the Alsaiti account:

```text
Alsaiti Telnyx platform account
├── Client A managed account
├── Client B managed account
└── Client C managed account
```

Each client-level account can be mapped to:

- Phone numbers
- Voice applications/connections
- SIP connections
- Usage
- Regulatory information

The team must confirm Managed Account availability and permissions with Telnyx before making it a hard dependency.

If it is not enabled initially, use one Alsaiti Telnyx account with strict application-level tenant mapping as a controlled MVP, then migrate to managed accounts when approved.

## 12.2 Customer-owned Telnyx

Offer a Connect Your Telnyx Account option.

Preferred:

```text
Telnyx OAuth authorisation-code flow
```

Use this only after creating/configuring the appropriate Telnyx OAuth client and confirming that the required resources/scopes are available for the account.

Fallback:

```text
Restricted Telnyx API key
```

The API key must:

- Be entered into a secure server-side form
- Be immediately verified
- Be stored in the vault
- Never be returned to the browser
- Support rotation
- Be deleted on disconnect

## 12.3 Call forwarding

The customer retains their existing public number and forwards calls to a Telnyx number assigned to their Alsaiti assistant.

Support:

- All calls
- No answer
- Busy
- After hours
- Overflow

This is likely the fastest onboarding option for early customers.

## 12.4 Telnyx SIP/BYOC

For local-first deployments:

```text
Telnyx number or customer number
↓
Telnyx Elastic SIP Trunk
↓
Self-hosted LiveKit SIP
↓
Self-hosted LiveKit
↓
Voice-agent worker
```

Support credential, FQDN and approved IP-based configurations as appropriate.

## 12.5 Number porting

Create a real port-request workflow.

Do not make Port Number behave like an instant button.

Statuses:

```text
draft
documents_required
submitted
carrier_review
scheduled
completed
rejected
cancelled
```

---

# 13. Telnyx number provisioning

## 13.1 UI flow

```text
Phone
↓
Add number
↓
Get a new Telnyx number
↓
Choose country
↓
Choose locality/area code/type/capabilities
↓
Search inventory
↓
Select number
↓
Review recurring and initial cost
↓
Complete regulatory requirements
↓
Confirm purchase
↓
Create number order server-side
↓
Track order
↓
Assign number to voice application/SIP connection
↓
Assign assistant
↓
Complete real test call
```

## 13.2 Server routes

```text
GET  /api/telephony/telnyx/numbers/search
POST /api/telephony/telnyx/numbers/order
GET  /api/telephony/telnyx/orders/:orderId
POST /api/telephony/telnyx/numbers/:numberId/configure
POST /api/telephony/telnyx/numbers/:numberId/test-call
POST /api/telephony/telnyx/connections/verify
```

## 13.3 Number-purchase protections

- Server-side only
- Permission check
- Plan entitlement check
- Explicit customer confirmation
- Idempotency key
- Country and number-type allowlist
- Cost confirmation
- Regulatory readiness check
- Audit event
- Duplicate-click protection
- No immediate automatic release on subscription cancellation

---

# 14. Telnyx database model

## 14.1 telephony_connections

```sql
create table telephony_connections (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  provider text not null default 'telnyx',
  connection_mode text not null,
  status text not null default 'authorisation_required',
  credential_reference text,
  provider_account_id text,
  provider_managed_account_id text,
  external_account_name text,
  oauth_grant_id text,
  granted_scopes text[] not null default '{}',
  last_authorised_at timestamptz,
  last_verified_at timestamptz,
  last_error_code text,
  last_error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

Connection modes:

```text
alsaiti_managed
customer_oauth
customer_api_key
sip_byoc
call_forwarding
```

## 14.2 phone_numbers

```sql
create table phone_numbers (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  telephony_connection_id uuid references telephony_connections(id) on delete set null,
  provider text not null default 'telnyx',
  provider_number_id text,
  provider_number_order_id text,
  e164_number text not null,
  friendly_name text,
  country text,
  number_type text,
  capabilities jsonb not null default '{}'::jsonb,
  regulatory_status text,
  status text not null default 'draft',
  voice_application_id text,
  sip_connection_id text,
  assigned_assistant_id uuid,
  monthly_cost numeric,
  currency text,
  last_tested_at timestamptz,
  last_successful_call_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

## 14.3 call_sessions

```sql
create table call_sessions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  phone_number_id uuid references phone_numbers(id) on delete set null,
  assistant_id uuid,
  provider text not null default 'telnyx',
  provider_call_id text not null,
  provider_call_control_id text,
  direction text not null,
  from_number text,
  to_number text,
  status text not null,
  started_at timestamptz,
  answered_at timestamptz,
  ended_at timestamptz,
  duration_seconds integer,
  transfer_status text,
  lead_id uuid references leads(id) on delete set null,
  conversation_id uuid,
  recording_status text,
  transcript_status text,
  summary text,
  outcome text,
  provider_cost numeric,
  currency text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(provider, provider_call_id)
);
```

## 14.4 telephony_webhook_events

Store provider event ID and processing state for replay protection.

Do not store secrets.

---

# 15. Telnyx call path

The recommended local-control route is:

```text
Caller
↓
Telnyx public number
↓
Telnyx SIP trunk
↓
Self-hosted LiveKit SIP
↓
Self-hosted LiveKit room
↓
Long-running voice-agent worker
↓
Approved Alsaiti agent tools
↓
Lead service
↓
Supabase
↓
Notifications and CRM event
```

An alternative Telnyx Voice API path may be used when its call-control/media architecture is a better fit.

The developer should implement one real path fully before creating two partially functional paths.

Recommended first path for the current product direction:

```text
Telnyx SIP + self-hosted LiveKit SIP + LiveKit Agents
```

---

# 16. Telnyx webhook security

Create:

```text
POST /api/webhooks/telnyx/voice
```

Requirements:

- Read raw body before JSON mutation
- Verify current Telnyx webhook signature using the official SDK or documented verification method
- Validate timestamp/freshness
- Store provider event ID
- Reject replay
- Return a fast response
- Queue long-running processing
- Handle duplicates
- Handle out-of-order events
- Use a primary and failover webhook URL where configured
- Never process an unverified event

Possible event classes include call initiation, answer, hang-up, recording and other voice events according to the selected Telnyx call architecture.

---

# 17. Real-time voice worker

The real-time agent must not run inside a static front end or short-lived GitHub Pages environment.

Deploy a long-running worker.

## 17.1 Worker responsibilities

- Join or receive the audio session
- Load the correct business and assistant
- Play the correct greeting
- Handle barge-in/interruption
- Handle silence
- Stream STT
- Generate constrained LLM responses
- Stream TTS
- Use controlled tools
- Transfer to a human
- Handle transfer failure
- Create exactly one structured lead
- Store transcript and summary
- End the call safely
- Record usage

## 17.2 Allowed agent tools

```text
get_business_profile
get_business_hours
get_services
capture_contact_details
set_service_interest
set_urgency
set_callback_preference
create_or_update_lead
request_callback
transfer_call
end_call
```

The model must not have arbitrary database or HTTP access.

---

# 18. Exactly-once lead creation

A call may emit duplicate events and the agent may retry a tool.

Use a stable idempotency key such as:

```text
telnyx:{provider_call_id}:lead
```

The lead service must:

1. Look up existing call session
2. Look up existing lead linked to that call
3. Create only if absent
4. Use a unique constraint or transactional lock
5. Return the existing lead if retried

CRM sync must happen after local lead persistence.

A CRM failure must never cause the lead to disappear.

---

# 19. Phone-screen functional requirements

The existing Phone page should support:

## Overview

- Active numbers
- Provider status
- Calls today
- AI minutes
- Failed calls
- Number health
- Voice-worker health
- Plan usage

## Add number

```text
Get a new Telnyx number
Connect your Telnyx account
Forward an existing number
Connect Telnyx SIP/BYOC
Port an existing number
```

## Number card

- Number
- Provider
- Ownership model
- Telnyx account/managed account
- Voice mode
- Assistant
- Routing
- Regulatory state
- Last test
- Last call
- Health
- Cost
- Usage

## Routing

- AI answers all calls
- AI answers no-answer calls
- AI answers after hours
- AI answers overflow
- Human first
- Urgent transfer
- Department transfer
- Language route
- Callback fallback
- Transfer timeout
- Maximum call duration

## Call log

- Caller
- Destination
- Start/end
- Duration
- Outcome
- Transfer result
- Lead
- CRM status
- Transcript status
- Recording status
- Provider ID
- Cost
- Error

---

# 20. Required environment variables

Separate development, staging and production values.

```env
# Application
APP_URL="https://voice.alsaitigrowth.com"
API_URL="https://api.voice.alsaitigrowth.com"

# Credential encryption/vault
CREDENTIAL_VAULT_URL=""
CREDENTIAL_VAULT_TOKEN=""
OAUTH_STATE_SIGNING_SECRET=""
OAUTH_CREDENTIAL_ENCRYPTION_KEY=""

# HubSpot
HUBSPOT_CLIENT_ID=""
HUBSPOT_CLIENT_SECRET=""
HUBSPOT_REDIRECT_URI="https://api.voice.alsaitigrowth.com/oauth/hubspot/callback"

# Pipedrive
PIPEDRIVE_CLIENT_ID=""
PIPEDRIVE_CLIENT_SECRET=""
PIPEDRIVE_REDIRECT_URI="https://api.voice.alsaitigrowth.com/oauth/pipedrive/callback"

# HighLevel
HIGHLEVEL_CLIENT_ID=""
HIGHLEVEL_CLIENT_SECRET=""
HIGHLEVEL_REDIRECT_URI="https://api.voice.alsaitigrowth.com/oauth/highlevel/callback"

# Google
GOOGLE_CLIENT_ID=""
GOOGLE_CLIENT_SECRET=""
GOOGLE_REDIRECT_URI="https://api.voice.alsaitigrowth.com/oauth/google/callback"

# Salesforce
SALESFORCE_CLIENT_ID=""
SALESFORCE_CLIENT_SECRET=""
SALESFORCE_REDIRECT_URI="https://api.voice.alsaitigrowth.com/oauth/salesforce/callback"

# Zoho
ZOHO_CLIENT_ID=""
ZOHO_CLIENT_SECRET=""
ZOHO_REDIRECT_URI="https://api.voice.alsaitigrowth.com/oauth/zoho/callback"

# Microsoft
MICROSOFT_CLIENT_ID=""
MICROSOFT_CLIENT_SECRET=""
MICROSOFT_REDIRECT_URI="https://api.voice.alsaitigrowth.com/oauth/microsoft/callback"
MICROSOFT_TENANT_MODE="common"

# Telnyx platform account
TELNYX_API_KEY=""
TELNYX_PUBLIC_KEY=""
TELNYX_VOICE_WEBHOOK_URL="https://api.voice.alsaitigrowth.com/api/webhooks/telnyx/voice"
TELNYX_FAILOVER_WEBHOOK_URL=""

# Telnyx OAuth, if enabled for customer account connection
TELNYX_OAUTH_CLIENT_ID=""
TELNYX_OAUTH_CLIENT_SECRET=""
TELNYX_OAUTH_REDIRECT_URI="https://api.voice.alsaitigrowth.com/oauth/telnyx/callback"

# LiveKit
LIVEKIT_URL=""
LIVEKIT_API_KEY=""
LIVEKIT_API_SECRET=""
VOICE_WORKER_INTERNAL_SECRET=""

# Queue/locks
REDIS_URL=""
INTEGRATION_QUEUE_NAME="integrations"
TELEPHONY_QUEUE_NAME="telephony"
```

None of these secrets may have a `NEXT_PUBLIC_` prefix.

---

# 21. Implementation roadmap

## Phase 0 — Preserve the demo

- Keep current GitHub Pages link as a labelled demo
- Add a visible Demo Mode banner
- Prevent real credential entry on the static site
- Link production sign-in to the production domain when available

## Phase 1 — Production backend

- Deploy server-capable application
- Configure production domains and HTTPS
- Add secret vault
- Add Redis/queue
- Add OAuth tables
- Add connection-state model
- Add server-side authorisation routes

## Phase 2 — First real CRM

Implement HubSpot end-to-end first.

Acceptance:

- Real redirect to HubSpot
- Real consent screen
- Real callback
- Tokens secured
- Account loaded
- Test contact/deal succeeds
- Card shows Connected
- Lead sync succeeds

This creates the reusable OAuth framework for other CRMs.

## Phase 3 — Remaining CRM providers

Recommended order:

1. HighLevel
2. Pipedrive
3. Google Sheets
4. Salesforce
5. Zoho
6. Microsoft Dynamics
7. Custom API
8. Generic Webhook verification

## Phase 4 — Telnyx account connection

- Create Telnyx platform account/configuration
- Confirm Managed Accounts eligibility
- Create Telnyx provider adapter
- Implement customer Telnyx OAuth if available for required resources
- Implement secure restricted-API-key fallback
- Add webhook verification

## Phase 5 — Telnyx numbers

- Search inventory
- Order number
- Track number order
- Configure number
- Assign assistant
- Call-forwarding wizard
- Port-request workflow

## Phase 6 — Real voice

- Deploy LiveKit SIP/server
- Deploy voice worker
- Connect Telnyx SIP
- Implement tools
- Receive real call
- Transfer
- Exactly-once lead
- Transcript/summary
- Notification
- CRM sync

## Phase 7 — Production hardening

- Security audit
- RLS tests
- OAuth replay tests
- Token refresh tests
- Telnyx webhook tests
- Call load tests
- Failure simulations
- Monitoring
- Billing/usage
- Backup and rollback
- Pilot customer

---

# 22. Functional acceptance criteria

## CRM authorisation

A provider is complete when:

- Connect opens the real third-party website
- Customer sees provider permission screen
- Customer can approve or deny
- State validation works
- PKCE works where applicable
- Code exchange occurs server-side
- Tokens are encrypted
- Token refresh works
- Account identity loads
- Metadata loads
- Test API operation succeeds
- Disconnect revokes/deletes credentials
- UI displays truthful state

## Telnyx account

- Alsaiti platform account connects
- Managed-account path is tested if enabled
- Customer-owned path is tested
- Restricted key path stores no browser secret
- Webhook signature validation works

## Number provisioning

- Search returns live Telnyx inventory
- Order creates one real order
- Duplicate click creates no duplicate order
- Number status is tracked
- Number is assigned to routing
- Cost and regulatory state are shown

## Real call

- Real public number receives a call
- Verified event reaches backend
- Correct assistant answers
- Barge-in works
- Silence fallback works
- Transfer works
- Transfer failure fallback works
- Exactly one lead is created
- Transcript and summary are stored
- Notification is sent
- CRM sync runs
- Call appears in web and mobile applications
- Usage and cost are recorded

## Security

- No provider secret in browser bundle
- No provider secret in Expo bundle
- Cross-business access denied
- RLS tests pass
- OAuth state replay rejected
- Webhook replay rejected
- Invalid Telnyx signature rejected
- Credential references are tenant scoped
- Logs are PII and secret safe

---

# 23. Immediate developer execution prompt

Copy this section into the developer agent after adding this file to the repository.

```text
Convert the existing Alsaiti Voice static demo into a real production integration and telephony system.

The current github.io application is a demo only. Preserve it as a labelled demo, but build a real server-side production application on stable custom domains.

The primary problem to solve is that Connect buttons currently do not redirect to third-party consent screens. Implement real OAuth authorisation from end to end.

Required architecture:
- Supabase remains the source of truth
- Secure vault stores access/refresh tokens and telecom credentials
- n8n remains the integration execution engine
- Redis/queue handles background jobs and locks
- Telnyx is the primary carrier/telephony provider
- LiveKit SIP and the voice worker run on long-lived infrastructure

Implement:

1. Production application and API deployment
2. OAuth authorisation-session table
3. Secure state and PKCE handling
4. Provider callback routes
5. Server-side code-to-token exchange
6. Encrypted token storage or vault references
7. Central token-refresh service
8. Real provider account and metadata loading
9. Real test operations
10. Truthful connection states

Implement real authorisation for:
- HubSpot
- Pipedrive
- HighLevel
- Google Sheets
- Salesforce
- Zoho CRM
- Microsoft Dynamics 365/Dataverse
- Telnyx customer account connection where enabled

Implement secure Custom API authentication and verified Generic Webhooks.

A CRM card may show Connected only after:
- consent completed
- token secured
- account verified
- required scopes verified
- metadata loaded
- mapping completed
- real API test succeeded

Replace the Twilio-first telephony logic with Telnyx-first logic behind a TelephonyProvider interface.

Implement:
- Alsaiti-managed Telnyx
- Telnyx Managed Accounts when enabled
- customer-owned Telnyx OAuth where suitable
- secure restricted Telnyx API-key fallback
- live phone-number search
- live number ordering
- number-order tracking
- number configuration
- call forwarding
- SIP/BYOC
- port requests
- Telnyx webhook signature verification
- Telnyx SIP to self-hosted LiveKit
- real-time voice worker
- real call logs
- transfers
- exactly-once lead creation
- CRM sync
- notifications
- usage and cost tracking

Do not label a number Active until a real inbound test call succeeds.

Start with one complete production vertical slice:

Real HubSpot OAuth
+
real Telnyx number/call
+
real LiveKit voice agent
+
exactly one lead
+
real HubSpot sync

Only after that vertical slice passes should the remaining providers be completed.

At the end of every phase:
1. Run type-check
2. Run lint
3. Run tests
4. Run production build
5. Update implementation status
6. List migrations and endpoints
7. List provider-console setup still required
8. State exactly what is real, demo, blocked and untested
9. Commit the phase

Do not claim go-live until a real public call creates exactly one lead and sends it to a genuinely authorised CRM.
```

---

# 24. Information/actions required from Alsaiti Growth

The developer cannot create provider production credentials alone without access to the provider developer consoles and company details.

Alsaiti Growth must provide or create:

## Domains

- Production app domain
- Production API domain
- HTTPS and DNS access

## Legal/product pages

- Privacy policy
- Terms of service
- Support/contact page
- Data deletion/revocation information

## Provider developer accounts

- HubSpot developer account/app
- Pipedrive app
- HighLevel marketplace/private app
- Google Cloud project/OAuth consent screen
- Salesforce app
- Zoho API Console client
- Microsoft Entra app registration
- Telnyx account, API access and billing

## Telnyx commercial setup

- Identity/business verification
- Account funding/billing
- Desired countries and number types
- Managed Accounts eligibility confirmation
- Regulatory documents for number orders where required
- Voice/SIP configuration permissions

## Infrastructure

- Production server or hosting platform
- Secret vault
- n8n production instance
- Monitoring account
- Backup policy

---

# 25. Official references

Use current official documentation during implementation.

## GitHub Pages

- https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages
- https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits

## HubSpot

- https://developers.hubspot.com/docs/apps/developer-platform/build-apps/authentication/overview
- https://developers.hubspot.com/docs/apps/developer-platform/build-apps/authentication/oauth/oauth-quickstart-guide

## Pipedrive

- https://developers.pipedrive.com/docs/api/v1

## HighLevel

- https://marketplace.gohighlevel.com/docs/Authorization/OAuth2.0/
- https://marketplace.gohighlevel.com/docs/Authorization/authorization_doc/

## Google

- https://developers.google.com/identity/protocols/oauth2/web-server

## Salesforce

- https://developer.salesforce.com/docs/atlas.en-us.api_rest.meta/api_rest/intro_oauth_and_connected_apps.htm

## Zoho CRM

- https://www.zoho.com/crm/developer/docs/api/v8/oauth-overview.html
- https://www.zoho.com/crm/developer/docs/api/v8/auth-request.html
- https://www.zoho.com/crm/developer/docs/api/v8/access-refresh.html

## Microsoft Dataverse

- https://learn.microsoft.com/en-us/power-apps/developer/data-platform/authenticate-oauth
- https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/authenticate-web-api

## Telnyx

- https://developers.telnyx.com/api-reference/overview
- https://developers.telnyx.com/api-reference/oauth-protocol/oauth-authorization-endpoint
- https://developers.telnyx.com/api-reference/managed-accounts/retrieve-a-managed-account
- https://developers.telnyx.com/docs/numbers/phone-numbers/getting-started
- https://developers.telnyx.com/api-reference/phone-number-search/list-available-phone-numbers
- https://developers.telnyx.com/api-reference/phone-number-orders/create-a-number-order
- https://developers.telnyx.com/docs/voice/programmable-voice/voice-api-fundamentals
- https://developers.telnyx.com/docs/voice/programmable-voice/voice-api-webhooks
- https://developers.telnyx.com/development/api-fundamentals/webhooks/receiving-webhooks
- https://developers.telnyx.com/docs/voice/sip-trunking/livekit-configuration-guide
- https://developers.telnyx.com/docs/voice/sip-trunking/get-started

---

# 26. Final outcome

The final product must work like this:

```text
Business clicks Connect HubSpot
↓
HubSpot opens
↓
Business signs in and grants permission
↓
Alsaiti validates and stores access securely
↓
HubSpot account, fields and pipelines load
↓
Test operation succeeds
↓
HubSpot card becomes Connected

Business opens Phone
↓
Connects Telnyx or uses Alsaiti-managed Telnyx
↓
Searches and orders a real number or forwards an existing number
↓
Assigns number to an AI assistant
↓
Completes a real test call
↓
AI answers through LiveKit
↓
Exactly one lead is created
↓
Transcript and summary are stored
↓
Lead is sent to the authorised HubSpot account
↓
Web and native apps show the call, lead and sync result
```

That production vertical slice is the proof that the system has moved from a truthful demo to a functional SaaS.
