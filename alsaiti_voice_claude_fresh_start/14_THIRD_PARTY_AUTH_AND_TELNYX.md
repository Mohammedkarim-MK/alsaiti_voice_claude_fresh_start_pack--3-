# Alsaiti Voice — Third-Party Authorisation and Telnyx Telephony Specification

## Developer Handoff: Real CRM Authorisation, Truthful Connection States and Telnyx-First Phone Architecture

**Product:** Alsaiti Voice  
**Company:** Alsaiti Growth  
**Primary objective:** Replace simulated integration states with real third-party authorisation, and replace the Twilio-first telephony design with a Telnyx-first, provider-independent implementation.

---

# 1. Main instruction

The current integration page is a strong product demonstration, but an integration must never display **Connected** simply because a user clicked a button or completed an internal form.

For every external CRM or service, the customer must authorise Alsaiti Voice to access the third-party account.

The correct flow is:

```text
User clicks Connect
↓
Alsaiti Voice creates a secure authorisation session
↓
User is redirected to the third-party provider
↓
Provider displays requested permissions
↓
User signs in and approves or rejects access
↓
Provider redirects to the Alsaiti Voice callback
↓
Server validates state and PKCE where applicable
↓
Server exchanges the authorisation code for tokens
↓
Tokens are encrypted or stored in a secure vault
↓
Alsaiti Voice verifies the authorised account
↓
Provider metadata, pipelines, stages and fields are loaded
↓
User saves configuration and field mappings
↓
A real test operation succeeds
↓
Only then is the integration marked Connected
```

The same truth rule applies to telephony. Telnyx is not connected until the backend verifies a real Telnyx account or managed account. A phone number is not active until it exists at the provider, has valid routing and completes a real test call.

Demo-only integrations must be labelled:

```text
Demo
Simulated
Preview
Not authorised
Test mode
```

They must not be labelled:

```text
Connected
Healthy
Live
Production
```

unless real backend checks have passed.

---

# 2. What third-party authorisation means

Third-party authorisation means the customer grants Alsaiti Voice limited permission to access another platform on the customer’s behalf.

Examples:

- HubSpot grants access to contacts and deals
- Pipedrive grants access to persons, organisations and deals
- HighLevel grants access to a location or sub-account
- Salesforce grants access to leads, accounts and opportunities
- Zoho grants access to authorised CRM modules
- Microsoft grants access to an approved Dataverse environment
- Google grants access to selected Sheets resources
- Telnyx grants access to phone numbers and voice resources

The customer should not normally provide their ordinary username and password.

Use:

- OAuth 2.0 authorisation-code flow
- PKCE where required or recommended
- Provider-issued access tokens
- Provider-issued refresh tokens
- API keys only where OAuth is unavailable or a private integration is intentionally used
- Service principals or service accounts only for legitimate server-to-server cases
- HMAC or provider signatures for inbound webhooks

---

# 3. Integration card behaviour

## 3.1 Truthful connection states

Use these states consistently:

```text
not_connected
authorisation_required
authorising
callback_received
token_exchange
account_selection_required
configuration_required
test_required
connected
degraded
attention_required
expired
paused
disconnected
error
demo
```

## 3.2 Meaning of Connected

An integration may display **Connected** only when all of the following are true:

1. The customer authorised the provider
2. A valid credential or secure credential reference exists
3. Alsaiti Voice verified the account identity
4. Required scopes or permissions are present
5. Provider metadata was loaded successfully
6. The target account, location or environment was selected
7. Required field mappings were saved
8. A real read or write test succeeded
9. There is no unresolved critical error

## 3.3 Connected-card information

Display:

- Provider name
- Connected organisation or account
- Connected user when relevant
- Granted permissions/scopes
- Connected date
- Last token refresh
- Last connection test
- Last successful sync
- Last failed sync
- Health
- Number of real synced leads
- Reauthorise
- Configure
- Pause
- Disconnect
- View logs

## 3.4 No invented health information

Values such as:

```text
Last success: just now
Last failure: 2h ago
Health: Healthy
Synced leads: 3
```

must come from persisted real events.

In a demo, show a visible **Demo data** label.

---

# 4. Standard OAuth architecture

## 4.1 Start endpoint

Suggested endpoint:

```text
POST /api/integrations/:provider/authorise
```

The server must:

1. Authenticate the user
2. Verify business membership
3. Verify integration-management permission
4. Generate a cryptographically secure `state`
5. Generate PKCE verifier/challenge where supported
6. Store a short-lived authorisation session
7. Build the provider authorisation URL
8. Return the URL or redirect the user

## 4.2 Authorisation-session record

Do not place sensitive business information inside an unsigned state value.

Use an opaque random state reference.

Suggested table:

```text
oauth_authorisation_sessions

id
business_id
user_id
provider
state_hash
pkce_verifier_encrypted
redirect_uri
requested_scopes
status
expires_at
created_at
completed_at
error_code
error_message
```

## 4.3 Callback endpoint

Suggested endpoint:

```text
GET /api/integrations/:provider/callback
```

The callback must:

1. Validate provider
2. Validate `state`
3. Confirm the session is unexpired and unused
4. Handle declined access
5. Exchange the code server-side
6. Verify returned scopes
7. Store tokens securely
8. Load account identity
9. Mark configuration required
10. Redirect to the connection wizard

## 4.4 Token storage

Never store access or refresh tokens in:

- Browser local storage
- Client-readable cookies
- Expo public configuration
- Client-readable Supabase rows
- Logs
- Git
- Exported n8n workflow JSON

Preferred choices:

### Secret vault

Store credentials in a managed vault and save only a reference in Supabase.

### Envelope encryption

Encrypt tokens using a key stored outside the database.

Store:

```text
encrypted_access_token
encrypted_refresh_token
encryption_key_version
token_expires_at
```

### Private n8n credentials

For early controlled deployments, provider credentials may be stored inside private self-hosted n8n, while Supabase stores the credential reference and authoritative status.

## 4.5 Refresh service

Create a central service:

```ts
interface OAuthTokenService {
  getValidAccessToken(connectionId: string): Promise<string>;
  refreshAccessToken(connectionId: string): Promise<void>;
  revokeConnection(connectionId: string): Promise<void>;
}
```

It must:

- Reuse valid tokens
- Refresh before expiry
- Lock concurrent refreshes
- Update tokens atomically
- Mark `attention_required` when refresh fails
- Never return tokens to the client UI

---

# 5. Provider-specific authorisation requirements

## 5.1 HubSpot

For a multi-customer SaaS integration, use HubSpot OAuth.

```text
Connect HubSpot
↓
HubSpot consent
↓
Customer approves scopes
↓
Code exchanged server-side
↓
Load account identity
↓
Load pipelines, stages, owners and properties
↓
Map fields
↓
Create/update a clearly marked test contact
↓
Connected
```

Request only scopes needed by enabled features.

## 5.2 Pipedrive

Support:

- OAuth for multi-customer/public integration
- Secure provider API-token mode for intentional private connections

After authorisation:

- Verify account
- Load users
- Load pipelines and stages
- Load custom fields
- Run a real test operation
- Mark Connected only after success

## 5.3 HighLevel / GoHighLevel

For multi-customer SaaS use HighLevel OAuth authorisation-code flow.

The customer must select:

- Agency where relevant
- Location/sub-account
- Pipeline
- Stage
- Owner
- Workflow
- Tags

Private Integration Tokens may be supported only for controlled single-account connections.

Never ask for the customer’s HighLevel password.

## 5.4 Google Sheets

Use Google OAuth with the narrowest practical scope.

The user then selects:

- Google account
- Spreadsheet
- Worksheet
- Column mapping

Connection test:

1. Read spreadsheet metadata
2. Optionally append a clearly labelled test row
3. Remove it where safe, or tell the user it remains
4. Store spreadsheet and worksheet IDs

## 5.5 Salesforce

Use Salesforce OAuth through an External Client App or Connected App.

Use authorisation-code flow and PKCE according to provider requirements.

After callback:

- Store instance URL
- Verify organisation identity
- Load objects and metadata
- Load Lead, Contact, Account and Opportunity fields
- Load users/owners
- Load record types if needed
- Support sandbox and production
- Create/update a test record
- Store external record ID
- Mark Connected only after success

Handle:

- Token expiry
- Refresh failure
- Revocation
- Sandbox domains
- Customer-specific instance URLs
- Permission-set restrictions
- Session/IP restrictions

## 5.6 Zoho CRM

Use Zoho CRM OAuth 2.0 authorisation-code flow.

Zoho is region-aware. Do not hard-code one accounts or API domain.

Persist:

- Accounts domain
- API domain
- Data centre
- Organisation ID
- Environment
- Token expiry
- Credential reference

After authorisation:

- Verify organisation
- Load modules
- Load layouts where relevant
- Load fields
- Load users/owners
- Load pipelines/stages
- Create/update a test Lead or Contact
- Mark Connected only after success

## 5.7 Microsoft Dynamics 365 / Dataverse

Use Microsoft Entra ID OAuth and a supported Microsoft authentication library such as MSAL.

The customer consents and selects the correct Dataverse environment.

After authorisation:

- Identify tenant
- List accessible environments where permitted
- Select environment
- Store Dataverse environment URL
- Verify organisation
- Load table/entity metadata
- Load Lead, Contact, Account, Opportunity and Activity fields
- Load owners/users
- Load status and option-set values
- Run a real test operation
- Mark Connected only after success

Support:

- Delegated user authorisation
- Enterprise service-principal mode when configured by the customer administrator
- MFA
- Conditional Access
- Token refresh
- Consent and environment-access errors

## 5.8 Custom API

Custom APIs also require real authentication.

Support:

```text
No auth
API key in header
API key in query
Bearer token
Basic authentication
OAuth 2.0 authorisation code
OAuth 2.0 client credentials
HMAC signing
Custom signed headers
mTLS later
```

A Custom API is not Connected until:

1. Base URL passes validation
2. Authentication succeeds
3. Test endpoint succeeds
4. Required mappings are valid
5. Response identifiers can be extracted
6. SSRF/network protections pass

## 5.9 Generic Webhook

The customer must verify the endpoint.

```text
User enters HTTPS endpoint
↓
Alsaiti generates a signing secret
↓
Alsaiti sends a challenge/test event
↓
Endpoint returns expected response
↓
Endpoint becomes Verified
```

Every delivery includes:

- Event ID
- Event type
- Timestamp
- Business ID
- Payload
- HMAC signature

---

# 6. Database changes for real authorisation

Recommended `crm_connections` fields:

```text
id
business_id
provider
status
connection_mode
external_account_id
external_account_name
external_user_id
external_user_name
credential_reference
access_token_expires_at
granted_scopes
missing_scopes
provider_region
provider_environment
instance_url
api_domain
configuration
field_mapping
sync_settings
last_authorised_at
last_refreshed_at
last_tested_at
last_success_at
last_failure_at
last_error_code
last_error_message
created_by
created_at
updated_at
```

Add:

```text
oauth_authorisation_sessions
oauth_connection_events
integration_connection_tests
```

Enable Row Level Security on every business-owned table.

---

# 7. Disconnect and revocation

Disconnect must not simply hide the integration card.

The server should:

1. Verify permission
2. Pause new syncs
3. Revoke the provider grant where supported
4. Destroy stored access and refresh tokens
5. Retain non-secret audit history
6. Mark the connection disconnected
7. Preserve existing lead records
8. Stop retry jobs
9. Explain what data remains in the external CRM

---

# 8. Telnyx-first telephony decision

Replace the Twilio-first implementation with a Telnyx-first implementation while retaining a provider abstraction.

```text
TelephonyProvider interface
├── TelnyxTelephonyProvider — first production provider
├── SipTelephonyProvider — local-first/BYOC
├── CallForwardingProvider
└── TwilioTelephonyProvider — optional future adapter
```

Do not spread Telnyx-specific code throughout the application. Keep it behind provider services.

---

# 9. Telnyx account models

## 9.1 Alsaiti-managed Telnyx

Alsaiti operates the primary Telnyx platform account.

Where Telnyx enables managed-account capabilities, create a managed account for each client or required tenant boundary.

```text
Alsaiti Telnyx platform account
├── Managed account — Client A
│   ├── Numbers
│   ├── Voice applications
│   ├── SIP connections
│   └── Usage
├── Managed account — Client B
└── Managed account — Client C
```

Requirements:

- Confirm managed-account/API eligibility with Telnyx
- Store managed-account ID
- Never expose the parent API key
- Track usage per client
- Set outbound-channel limits where required
- Disable rather than immediately destroy during suspension
- Preserve number-retention/porting obligations

If managed accounts are not enabled initially, one Telnyx account with strict application-level tenant mapping can be used temporarily, but it must not be described as provider-level tenant isolation.

## 9.2 Customer-owned Telnyx

Preferred path:

- Telnyx OAuth authorisation where enabled
- Provider-issued OAuth client
- Authorisation-code flow
- Scoped access
- Secure token storage
- Revocation on disconnect

Fallback path:

- Customer creates a restricted Telnyx API key
- Key is submitted through a secure server-side form
- Server verifies it
- Key is encrypted or placed in a vault
- Key is never returned to the browser
- Rotation instructions are shown

## 9.3 Telnyx SIP/BYOC

The customer connects a Telnyx SIP trunk or another carrier to the voice stack.

Support:

- FQDN authentication
- Credential authentication
- IP authentication where appropriate
- Inbound trunk
- Outbound trunk
- Codec settings
- Transport
- E.164 number mapping
- Caller ID policy
- Failover
- Real test call

## 9.4 Call forwarding

The customer keeps their existing number and forwards calls to an Alsaiti-managed Telnyx number.

Support:

- All calls
- No answer
- Busy
- After hours
- Overflow

This is the fastest launch path for many customers.

## 9.5 Number porting

Number porting is not an instant API switch.

Build a tracked port request.

Collect:

- Current carrier
- Phone number
- Account information
- Authorisation documents
- Billing details where required
- Preferred port date

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

# 10. Telnyx number provisioning flow

```text
User chooses Get a new number
↓
Server checks plan and permission
↓
Server searches Telnyx available-number inventory
↓
User filters by country, locality, area code and capabilities
↓
Server checks regulatory requirements
↓
User confirms price and recurring cost
↓
Server creates a Telnyx number order
↓
System tracks order/sub-order status
↓
Activated number is stored in Supabase
↓
Number is assigned to a Voice API application or SIP connection
↓
Number is assigned to an Alsaiti assistant
↓
A real test call is required
```

Never purchase a number from browser code.

Use idempotency so repeated clicks cannot create duplicate orders.

Store:

- Telnyx number ID
- Number-order ID
- Sub-order IDs where returned
- E.164 number
- Status
- Country
- Capabilities
- Regulatory state
- Monthly recurring cost where available
- Voice application or SIP connection ID
- Managed account ID where used

---

# 11. Telnyx voice architecture

## Path A — Telnyx Voice API

```text
Public call
↓
Telnyx number
↓
Telnyx Voice API application
↓
Verified Telnyx webhooks
↓
Alsaiti call-control service
↓
Media/voice-agent integration
↓
Lead and CRM services
```

Use Voice API webhooks/commands for:

- Answer
- Bridge
- Transfer
- Playback
- Recording
- Hangup
- Conference where required
- Call-state tracking

## Path B — Telnyx SIP to self-hosted LiveKit

Recommended local-first AI path:

```text
Public call
↓
Telnyx number
↓
Telnyx SIP trunk
↓
Self-hosted LiveKit SIP
↓
Self-hosted LiveKit
↓
Self-hosted voice-agent worker
↓
STT / LLM / TTS adapters
↓
Alsaiti tools
↓
Supabase, notifications and CRM
```

This leaves the public carrier edge with Telnyx while allowing Alsaiti to self-host the live AI voice-processing infrastructure.

Asterisk or FreeSWITCH should be introduced only when advanced PBX or dial-plan needs justify the additional operational complexity.

---

# 12. Telnyx webhook security

Use Telnyx’s current official webhook-verification method and SDK guidance.

For current v2-style events, verify the Telnyx signature using the configured public key and the raw request body.

Suggested endpoint:

```text
POST /api/webhooks/telnyx/voice
```

The handler must:

1. Read raw request body
2. Validate Telnyx signature
3. Validate timestamp/freshness
4. Store provider event ID
5. Reject replay
6. Respond quickly
7. Move long work to a queue
8. Handle duplicate and out-of-order events
9. Support primary and failover webhook URLs

No unverified voice event may update a call or lead.

---

# 13. Telnyx services to implement

```ts
interface TelephonyProvider {
  verifyConnection(input: VerifyConnectionInput): Promise<ProviderAccount>;
  searchNumbers(input: SearchNumbersInput): Promise<AvailablePhoneNumber[]>;
  orderNumber(input: OrderNumberInput): Promise<NumberOrder>;
  getNumberOrder(orderId: string): Promise<NumberOrder>;
  assignNumber(input: AssignNumberInput): Promise<void>;
  configureInboundRouting(input: InboundRouteInput): Promise<void>;
  initiateCall(input: OutboundCallInput): Promise<ProviderCall>;
  transferCall(input: TransferCallInput): Promise<void>;
  hangupCall(input: HangupCallInput): Promise<void>;
  verifyWebhook(input: VerifyWebhookInput): Promise<VerifiedProviderEvent>;
  getUsage(input: UsageInput): Promise<UsageResult>;
}
```

Telnyx services:

```text
TelnyxAccountService
TelnyxManagedAccountService
TelnyxOAuthService
TelnyxNumberSearchService
TelnyxNumberOrderService
TelnyxVoiceApplicationService
TelnyxSipService
TelnyxCallService
TelnyxWebhookVerifier
TelnyxUsageService
```

---

# 14. Phone-number UI

Offer:

```text
Get a new Telnyx number
Connect your Telnyx account
Forward your existing number
Connect a SIP carrier
Port your number
```

## Number card

Display:

- Phone number
- Provider: Telnyx
- Ownership: Alsaiti-managed or customer-owned
- Managed-account reference
- Voice mode: Voice API or SIP
- Assigned assistant
- Routing
- Country
- Capabilities
- Regulatory status
- Last connection test
- Last call
- Health
- Usage
- Monthly number cost

Actions:

- Test call
- Assign assistant
- Configure routing
- View calls
- Pause AI handling
- Edit fallback
- Start port request
- Release number with safeguards

---

# 15. Telnyx data model

## telephony_connections

```text
id
business_id
provider = telnyx
connection_mode
status
credential_reference
telnyx_account_id
telnyx_managed_account_id
external_account_name
oauth_grant_id
last_authorised_at
last_verified_at
last_error
created_at
updated_at
```

Connection modes:

```text
alsaiti_managed
customer_oauth
customer_api_key
sip_byoc
call_forwarding
```

## phone_numbers

```text
id
business_id
telephony_connection_id
provider
provider_number_id
number_order_id
e164_number
country
number_type
capabilities
regulatory_status
status
voice_application_id
sip_connection_id
assigned_assistant_id
monthly_cost
currency
last_tested_at
created_at
updated_at
```

## provider_webhook_events

```text
id
provider
provider_event_id
business_id
signature_valid
event_type
payload_reference
received_at
processed_at
status
error
```

Never store secrets in these tables.

---

# 16. Telephony truth states

```text
draft
authorisation_required
verifying
configuration_required
number_order_pending
regulatory_review
routing_required
test_required
active
degraded
attention_required
suspended
disconnected
porting
error
demo
```

A number may show **Active** only when:

1. Provider connection is authorised
2. Number exists in the expected account
3. Routing is configured
4. Webhook or SIP route is healthy
5. Assistant is assigned
6. Real test call succeeds
7. Call session appears in the database

---

# 17. Real Telnyx acceptance test

The Telnyx implementation is complete only when:

```text
1. A real Telnyx account or managed account is authorised
2. A real number is ordered, imported, forwarded or connected
3. The number is assigned to the correct business
4. The number routes to the correct Voice API app or SIP trunk
5. A real public telephone call is received
6. Telnyx webhook or SIP event is verified
7. The AI assistant answers
8. Caller interruption works
9. Qualification completes
10. Transfer or callback works
11. Exactly one lead is created
12. Transcript and summary are stored
13. Notification is sent
14. CRM sync is attempted
15. Usage and provider IDs are recorded
16. Web and mobile applications display the outcome
```

---

# 18. Implementation order

## Phase 1 — Real authorisation foundation

- OAuth-session tables
- Truthful connection states
- Secure credential references
- Callback endpoints
- Token-refresh service
- Connection-test framework
- Remove fake Connected states

## Phase 2 — CRM OAuth

Implement:

1. HubSpot
2. HighLevel
3. Google Sheets
4. Salesforce
5. Zoho
6. Microsoft Dynamics
7. Pipedrive OAuth/private-token modes

## Phase 3 — Telnyx foundation

- Telnyx provider adapter
- Telnyx account connection
- Confirm managed-account eligibility
- Managed-account support
- Customer-owned account support
- Secure API-key fallback
- Telnyx webhook verification

## Phase 4 — Numbers

- Search inventory
- Display pricing where available
- Order number
- Track order status
- Assign number
- Regulatory state
- Call forwarding
- Port-request workflow

## Phase 5 — Real calls

- Voice API and/or SIP route
- LiveKit voice worker
- Call sessions
- Transfers
- Lead creation
- CRM sync
- Usage

## Phase 6 — Production hardening

- Security audit
- Cross-tenant tests
- Replay tests
- OAuth revocation tests
- Webhook tests
- Load tests
- Monitoring
- Billing
- Pilot customer

---

# 19. Immediate developer execution prompt

```text
Continue the existing Alsaiti Voice repository.

The Integrations screen must move from simulated connections to real third-party authorisation.

For every CRM card:

- Connect must start the provider's real authorisation process
- The user must sign in at the third party and approve permissions
- The callback must validate state and PKCE where applicable
- Tokens must be encrypted or stored in a secure vault
- Account identity and metadata must be loaded
- The user must configure account, pipeline, stage, owner and field mappings
- A real test operation must succeed
- Only then may the UI display Connected and Healthy

Use truthful states:
not_connected, authorisation_required, authorising, configuration_required, test_required, connected, degraded, attention_required, expired, paused, disconnected, error and demo.

Implement real authorisation for:
HubSpot, Pipedrive, HighLevel, Google Sheets, Salesforce, Zoho CRM and Microsoft Dynamics 365/Dataverse.

Custom API must support secure API keys, Bearer, Basic, OAuth authorisation code, OAuth client credentials, HMAC and custom headers.

Generic Webhook must be verified using a challenge/test delivery and all events must be HMAC signed.

Replace the Twilio-first telephony plan with a Telnyx-first plan.

Use a provider-independent TelephonyProvider interface, with TelnyxTelephonyProvider as the first production implementation.

Support:
- Alsaiti-managed Telnyx
- Telnyx managed accounts per customer when enabled
- Customer-owned Telnyx OAuth where available
- Secure Telnyx API-key fallback
- Telnyx number search and ordering
- Existing-number call forwarding
- Telnyx SIP/BYOC
- Number port requests
- Voice API webhooks
- Telnyx SIP to self-hosted LiveKit
- Number routing
- Call logs
- Real test calls
- Usage and cost tracking

Do not expose Telnyx keys.

Verify Telnyx webhook signatures using the official current method and raw request body.

Supabase remains the source of truth.
n8n remains the integration execution engine.
Telnyx provides the public carrier/telephony edge.
LiveKit and voice workers may be self-hosted.

Do not label a CRM Connected until authorisation, metadata loading and a test operation succeed.

Do not label a number Active until a real inbound test call succeeds.

At the end:
1. List migrations
2. List endpoints
3. List OAuth/provider setup required
4. List Telnyx setup required
5. List environment variables
6. Show test evidence
7. State what remains simulated
8. Update implementation status
```

---

# 20. Required environment variables

Use different credentials for development, staging and production.

```env
# OAuth security
OAUTH_CREDENTIAL_ENCRYPTION_KEY=""
OAUTH_STATE_SIGNING_SECRET=""
OAUTH_CALLBACK_BASE_URL=""

# HubSpot
HUBSPOT_CLIENT_ID=""
HUBSPOT_CLIENT_SECRET=""
HUBSPOT_REDIRECT_URI=""

# Pipedrive
PIPEDRIVE_CLIENT_ID=""
PIPEDRIVE_CLIENT_SECRET=""
PIPEDRIVE_REDIRECT_URI=""

# HighLevel
HIGHLEVEL_CLIENT_ID=""
HIGHLEVEL_CLIENT_SECRET=""
HIGHLEVEL_REDIRECT_URI=""

# Google
GOOGLE_CLIENT_ID=""
GOOGLE_CLIENT_SECRET=""
GOOGLE_REDIRECT_URI=""

# Salesforce
SALESFORCE_CLIENT_ID=""
SALESFORCE_CLIENT_SECRET=""
SALESFORCE_REDIRECT_URI=""

# Zoho
ZOHO_CLIENT_ID=""
ZOHO_CLIENT_SECRET=""
ZOHO_REDIRECT_URI=""

# Microsoft
MICROSOFT_CLIENT_ID=""
MICROSOFT_CLIENT_SECRET=""
MICROSOFT_REDIRECT_URI=""
MICROSOFT_TENANT_MODE="common"

# Telnyx platform account
TELNYX_API_KEY=""
TELNYX_PUBLIC_KEY=""
TELNYX_WEBHOOK_BASE_URL=""
TELNYX_FAILOVER_WEBHOOK_URL=""

# Telnyx OAuth where enabled
TELNYX_OAUTH_CLIENT_ID=""
TELNYX_OAUTH_CLIENT_SECRET=""
TELNYX_OAUTH_REDIRECT_URI=""

# Voice/SIP
LIVEKIT_URL=""
LIVEKIT_API_KEY=""
LIVEKIT_API_SECRET=""
VOICE_WORKER_INTERNAL_SECRET=""
```

No server secret may use a `NEXT_PUBLIC_` prefix.

---

# 21. Official implementation references

## Telnyx

- API overview: https://developers.telnyx.com/api-reference/overview
- Managed accounts: https://developers.telnyx.com/api-reference/managed-accounts/retrieve-a-managed-account
- Number search: https://developers.telnyx.com/docs/numbers/phone-numbers/number-search
- Number ordering: https://developers.telnyx.com/docs/numbers/phone-numbers/number-orders
- Voice API fundamentals: https://developers.telnyx.com/docs/voice/programmable-voice/voice-api-fundamentals
- Voice API webhooks: https://developers.telnyx.com/docs/voice/programmable-voice/voice-api-webhooks
- Receiving voice webhooks: https://developers.telnyx.com/docs/voice/programmable-voice/receiving-webhooks
- Webhook security: https://developers.telnyx.com/development/api-fundamentals/webhooks/receiving-webhooks
- Telnyx and LiveKit SIP: https://developers.telnyx.com/docs/voice/sip-trunking/livekit-configuration-guide
- OAuth authorisation endpoint: https://developers.telnyx.com/api-reference/oauth-protocol/oauth-authorization-endpoint
- API key security: https://developers.telnyx.com/development/api-fundamentals/create-api-keys

## CRM authorisation

- HubSpot: https://developers.hubspot.com/docs/apps/developer-platform/build-apps/authentication/overview
- Pipedrive: https://developers.pipedrive.com/docs/api/v1
- HighLevel: https://marketplace.gohighlevel.com/docs/Authorization/OAuth2.0/
- Google: https://developers.google.com/identity/protocols/oauth2/web-server
- Salesforce: https://developer.salesforce.com/docs/atlas.en-us.api_rest.meta/api_rest/intro_oauth_and_connected_apps.htm
- Zoho: https://www.zoho.com/crm/developer/docs/api/v8/oauth-overview.html
- Microsoft Dataverse: https://learn.microsoft.com/en-us/power-apps/developer/data-platform/authenticate-oauth
- Dataverse Web API: https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/authenticate-web-api

---

# 22. Final target

CRM connection:

```text
User clicks a CRM integration
↓
The real provider asks for permission
↓
User approves
↓
Alsaiti verifies the authorised account
↓
User configures mappings
↓
A real test succeeds
↓
Integration becomes Connected
```

Telnyx connection:

```text
User chooses Telnyx
↓
Uses an Alsaiti-managed account or authorises their own account
↓
Searches, orders, forwards or connects a real number
↓
Assigns the number to an assistant
↓
Completes a real public test call
↓
AI answers
↓
Exactly one lead is created
↓
Call and CRM result appear in Alsaiti Voice
```

This is the required difference between a polished demo and a production integration system.
