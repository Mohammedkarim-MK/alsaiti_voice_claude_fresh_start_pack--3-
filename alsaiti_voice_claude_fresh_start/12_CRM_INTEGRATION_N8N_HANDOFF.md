# Alsaiti Voice — Universal CRM Integration System

## Complete Developer Handoff Specification

**Product:** Alsaiti Voice  
**Company:** Alsaiti Growth  
**Purpose:** Build the CRM connection layer using n8n so Alsaiti Voice can synchronise leads, conversations, calls and appointments with leading CRMs and any compatible API/webhook system.

---

# 1. Executive Summary

Alsaiti Voice is an AI voice and chat lead-generation SaaS for service businesses. It captures enquiries from phone calls, website chat, forms and APIs, converts them into structured leads, stores them in Supabase and helps a business manage those leads through a pipeline.

The CRM integration layer must allow a business to connect systems such as:

- HubSpot
- Pipedrive
- GoHighLevel / HighLevel
- Google Sheets
- Generic webhooks
- Salesforce later
- Zoho later
- Microsoft Dynamics later
- Other API-enabled CRMs

The recommended architecture is:

```text
Customer enquiry
    ↓
Alsaiti Voice creates the lead
    ↓
Supabase stores the lead permanently
    ↓
Alsaiti Voice creates a signed integration event
    ↓
n8n receives and validates the event
    ↓
n8n routes the event to the correct CRM workflow
    ↓
The CRM contact/deal/opportunity is created or updated
    ↓
n8n sends the result back to Alsaiti Voice
    ↓
The dashboard shows CRM sync status
```

**Supabase remains the source of truth.**  
**n8n acts as the integration and automation engine.**

n8n must not become the only place where lead data exists. If n8n or a CRM fails, the lead must remain safe inside Alsaiti Voice.

---

# 2. Product Objective

A business user should be able to:

- Connect a supported CRM
- Confirm which CRM account/workspace was connected
- Test the connection
- Select when data should sync
- Choose what CRM records should be created
- Map Alsaiti Voice fields to CRM fields
- Select pipeline, stage, owner and tags
- View last successful sync
- View last failure
- View sync history
- Retry failed syncs
- Pause or resume syncing
- Disconnect and reconnect
- Connect a custom API or webhook when no native CRM connector exists

The correct product promise is:

> Connect Alsaiti Voice to leading CRMs, or to any compatible system that supports APIs or webhooks.

Do not promise that every CRM can connect instantly. Some systems have no API, no OAuth, no webhook support or no permission to create records remotely.

---

# 3. Scope

## 3.1 MVP

The first release should support:

1. Generic outbound webhook
2. HubSpot
3. Pipedrive
4. GoHighLevel / HighLevel
5. Google Sheets
6. Lead-created events
7. Lead-updated events
8. Lead-status-changed events
9. CRM sync history
10. Manual retry
11. Connection health
12. Basic field mapping
13. HMAC signing
14. Idempotency
15. Retry logic
16. Tenant isolation
17. Clear error states

## 3.2 Later

Add later:

- Salesforce
- Zoho
- Microsoft Dynamics 365
- Airtable
- Close
- Freshsales
- Keap
- Monday.com
- Two-way sync
- Self-service OAuth for every provider
- Historical backfill
- Bulk sync
- Agency white-label connection management
- Embedded/OEM workflow features

---

# 4. Core Architecture

## 4.1 Source of truth

Supabase owns:

- Businesses
- Users
- Business memberships
- Leads
- Calls
- Conversations
- Notes
- Lead status
- CRM connections
- CRM sync records
- CRM sync attempts
- Activity logs
- Billing and usage

n8n owns execution logic:

- Receiving events
- Verifying signatures
- Transforming payloads
- Routing by provider
- Calling CRM APIs
- Handling provider-specific rules
- Retrying transient failures
- Returning results

## 4.2 System diagram

```text
Voice / Chat / Form / API
        ↓
Alsaiti Voice backend
        ↓
Supabase lead transaction
        ↓
Integration event/outbox row
        ↓
Background dispatcher
        ↓
Signed request to n8n
        ↓
CRM Event Router
        ├── HubSpot workflow
        ├── Pipedrive workflow
        ├── HighLevel workflow
        ├── Google Sheets workflow
        └── Generic Webhook workflow
        ↓
External CRM
        ↓
Signed callback to Alsaiti Voice
        ↓
Sync records updated in Supabase
        ↓
User sees status in dashboard
```

## 4.3 Control plane vs execution plane

### Alsaiti Voice control plane

- Connection settings
- User permissions
- Field mappings
- Trigger settings
- Pipeline/stage selection
- Sync history
- Retry controls
- Audit logs
- UI

### n8n execution plane

- CRM authentication
- Data transformation
- Record matching
- Contact creation/update
- Deal/opportunity creation
- Notes/tasks/activities
- Retry execution
- Result reporting

---

# 5. Event-Driven Design

Lead creation must not directly depend on the CRM being online.

Correct order:

```text
1. Lead is saved
2. Integration event is created
3. Background process dispatches it
4. n8n processes it
5. Result is stored
```

## 5.1 Initial events

```text
lead.created
lead.updated
lead.status_changed
lead.assigned
appointment.booked
conversation.completed
call.completed
```

The first critical event is:

```text
lead.created
```

## 5.2 Event envelope

```json
{
  "event_id": "evt_01JABC123456789",
  "event_type": "lead.created",
  "event_version": "1.0",
  "occurred_at": "2026-07-13T18:30:00.000Z",
  "business_id": "business_uuid",
  "connection_id": "connection_uuid",
  "entity_type": "lead",
  "entity_id": "lead_uuid",
  "payload": {
    "lead": {
      "id": "lead_uuid",
      "name": "Sarah Ahmed",
      "phone": "+447700900000",
      "email": "sarah@example.com",
      "service_needed": "Invisalign consultation",
      "urgency": "high",
      "source": "voice_call",
      "status": "new",
      "lead_score": 87,
      "preferred_callback_time": "2026-07-13T20:00:00.000Z",
      "summary": "New patient seeking an Invisalign consultation.",
      "created_at": "2026-07-13T18:29:55.000Z"
    }
  },
  "metadata": {
    "environment": "production",
    "schema_version": "1"
  }
}
```

## 5.3 Required headers

```text
Content-Type: application/json
X-Alsaiti-Event-ID: evt_...
X-Alsaiti-Timestamp: 1720895400
X-Alsaiti-Signature: sha256=...
X-Alsaiti-Event-Type: lead.created
```

---

# 6. Security

## 6.1 HMAC signing

Use:

```text
signature_payload = timestamp + "." + raw_body
signature = HMAC_SHA256(secret, signature_payload)
```

n8n must:

1. Read the raw body
2. Read timestamp
3. Reject expired requests
4. Recalculate signature
5. Compare safely
6. Reject invalid signature
7. Reject replayed event ID

Recommended maximum age:

```text
300 seconds
```

## 6.2 Idempotency

Use `event_id` as the event idempotency key.

Use this local uniqueness rule for lead sync:

```text
connection_id + lead_id
```

A retried event must not create another CRM contact or deal.

## 6.3 Tenant isolation

Every connection belongs to one business.

Every API route must verify:

- User authentication
- Business membership
- Required role
- Connection belongs to that business

## 6.4 Credentials

Do not store plain CRM passwords or access tokens in normal Supabase fields.

For MVP:

- Store credentials inside private n8n credential storage
- Store only the n8n credential reference in Supabase
- Use a custom n8n encryption key
- Restrict n8n admin access
- Back up the encryption key securely

Customers must not receive access to the n8n editor.

## 6.5 Logging

Do not log:

- Access tokens
- Refresh tokens
- API secrets
- HMAC secrets
- Full transcripts
- Full PII unnecessarily

Mask PII in operational logs.

---

# 7. Database Design

## 7.1 crm_connections

```sql
create table crm_connections (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  provider text not null,
  connection_name text not null,
  status text not null default 'disconnected',
  external_account_id text,
  external_account_name text,
  n8n_credential_reference text,
  n8n_workflow_reference text,
  sync_enabled boolean not null default true,
  field_mapping jsonb not null default '{}'::jsonb,
  sync_settings jsonb not null default '{}'::jsonb,
  provider_settings jsonb not null default '{}'::jsonb,
  last_tested_at timestamptz,
  last_success_at timestamptz,
  last_failure_at timestamptz,
  last_error_code text,
  last_error_message text,
  connected_at timestamptz,
  disconnected_at timestamptz,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

Providers:

```text
generic_webhook
hubspot
pipedrive
highlevel
google_sheets
salesforce
zoho
dynamics
custom_api
```

Statuses:

```text
disconnected
connecting
connected
attention_required
expired
disabled
error
```

## 7.2 integration_events

```sql
create table integration_events (
  id uuid primary key default gen_random_uuid(),
  event_id text not null unique,
  business_id uuid not null references businesses(id) on delete cascade,
  connection_id uuid references crm_connections(id) on delete set null,
  event_type text not null,
  event_version text not null default '1.0',
  entity_type text not null,
  entity_id uuid,
  payload jsonb not null,
  status text not null default 'pending',
  attempt_count integer not null default 0,
  next_attempt_at timestamptz,
  sent_at timestamptz,
  processed_at timestamptz,
  last_error_code text,
  last_error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

## 7.3 crm_sync_records

```sql
create table crm_sync_records (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  connection_id uuid not null references crm_connections(id) on delete cascade,
  lead_id uuid not null references leads(id) on delete cascade,
  provider text not null,
  external_contact_id text,
  external_company_id text,
  external_deal_id text,
  external_opportunity_id text,
  external_activity_id text,
  sync_status text not null default 'pending',
  last_event_id text,
  last_synced_at timestamptz,
  last_error_code text,
  last_error_message text,
  remote_record_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(connection_id, lead_id)
);
```

## 7.4 crm_sync_attempts

```sql
create table crm_sync_attempts (
  id uuid primary key default gen_random_uuid(),
  sync_record_id uuid references crm_sync_records(id) on delete cascade,
  business_id uuid not null references businesses(id) on delete cascade,
  connection_id uuid not null references crm_connections(id) on delete cascade,
  event_id text not null,
  attempt_number integer not null,
  status text not null,
  request_summary jsonb,
  response_code integer,
  response_summary jsonb,
  error_code text,
  error_message text,
  started_at timestamptz not null default now(),
  completed_at timestamptz
);
```

## 7.5 webhook_endpoints

```sql
create table webhook_endpoints (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  name text not null,
  url text not null,
  enabled boolean not null default true,
  signing_secret_reference text,
  subscribed_events text[] not null default array['lead.created'],
  last_tested_at timestamptz,
  last_success_at timestamptz,
  last_failure_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

## 7.6 Indexes

Create indexes for:

```text
crm_connections(business_id, provider)
crm_connections(business_id, status)
integration_events(business_id, created_at desc)
integration_events(status, next_attempt_at)
crm_sync_records(business_id, lead_id)
crm_sync_records(connection_id, sync_status)
crm_sync_attempts(business_id, started_at desc)
crm_sync_attempts(event_id)
```

Enable RLS on every table.

---

# 8. n8n Workflow Architecture

## 8.1 Main router

Workflow name:

```text
Alsaiti Voice — CRM Event Router
```

Flow:

```text
Webhook Trigger
↓
Capture raw body
↓
Verify HMAC signature
↓
Validate timestamp
↓
Validate schema
↓
Check event idempotency
↓
Load connection configuration
↓
Check connection is enabled
↓
Switch by provider
├── HubSpot sub-workflow
├── Pipedrive sub-workflow
├── HighLevel sub-workflow
├── Google Sheets sub-workflow
└── Generic Webhook sub-workflow
↓
Normalise provider result
↓
Send signed callback to Alsaiti Voice
↓
Mark event complete
```

## 8.2 Sub-workflows

Create separate workflows:

```text
Alsaiti Voice — Sync Lead to HubSpot
Alsaiti Voice — Sync Lead to Pipedrive
Alsaiti Voice — Sync Lead to HighLevel
Alsaiti Voice — Sync Lead to Google Sheets
Alsaiti Voice — Sync Lead to Generic Webhook
```

Do not create one enormous workflow containing all provider logic.

## 8.3 Shared input

```json
{
  "event": {},
  "connection": {},
  "mapping": {},
  "settings": {},
  "existing_sync_record": {}
}
```

## 8.4 Shared output

Success:

```json
{
  "success": true,
  "provider": "hubspot",
  "external_contact_id": "12345",
  "external_company_id": null,
  "external_deal_id": "67890",
  "external_activity_id": null,
  "remote_record_url": "https://...",
  "actions": [
    "contact.updated",
    "deal.created",
    "note.created"
  ],
  "warnings": []
}
```

Failure:

```json
{
  "success": false,
  "provider": "hubspot",
  "error_code": "AUTH_EXPIRED",
  "error_message": "Authentication has expired.",
  "retryable": false
}
```

---

# 9. Record Matching and Duplicate Prevention

Before creating a contact:

1. Use stored external CRM ID if available
2. Search by exact normalised email
3. Search by exact normalised phone
4. Apply any business-specific matching rule
5. Create only if no record exists

Do not match by name alone.

Normalise email:

- Lowercase
- Trim whitespace

Normalise phone:

- Convert to E.164 where possible
- Remove spaces and punctuation
- Preserve country context

If a provider reports a duplicate:

- Search again
- Link the existing record
- Do not create another record blindly

---

# 10. Provider Requirements

## 10.1 HubSpot

Operations:

- Search contact
- Create/update contact
- Create/update company if enabled
- Create deal
- Select pipeline/stage
- Add note
- Create follow-up task
- Add custom properties

Configuration:

- Account
- Pipeline
- Stage
- Owner
- Create-deal toggle
- Note toggle
- Task toggle
- Field mapping
- Status-to-stage mapping

## 10.2 Pipedrive

Operations:

- Search/create/update person
- Create/update organisation
- Create deal
- Add note
- Create activity
- Choose pipeline/stage
- Assign owner

## 10.3 GoHighLevel / HighLevel

Operations:

- Search/create/update contact
- Add tags
- Create opportunity
- Choose pipeline/stage
- Add note
- Assign owner
- Trigger workflow if enabled

Suggested tags:

```text
alsaiti-voice
voice-call
website-chat
urgent
qualified
booked
```

## 10.4 Google Sheets

Operations:

- Select spreadsheet
- Select worksheet
- Append row
- Optionally update existing row
- Store row reference

Suggested columns:

```text
Created At
Lead ID
Name
Phone
Email
Service
Urgency
Source
Status
Score
Summary
Preferred Callback
```

## 10.5 Generic Webhook

Operations:

- Send JSON
- Sign payload
- Support test event
- Store response status
- Retry transient failures
- Allow subscribed event types

Full webhook secret should only be shown once.

---

# 11. Integration UI

Update `/integrations`.

## 11.1 Cards

Show:

- HubSpot
- Pipedrive
- GoHighLevel
- Google Sheets
- Generic Webhook
- Salesforce
- Zoho
- Microsoft Dynamics
- Custom API

Statuses:

```text
Not connected
Connecting
Connected
Attention required
Authentication expired
Disabled
Error
Coming soon
```

## 11.2 Connected state

Show:

- Account name
- Provider
- Last success
- Last failure
- Synced lead count
- Health status
- Test connection
- Configure
- View logs
- Pause
- Disconnect

## 11.3 Connection wizard

```text
Step 1 — Choose CRM
Step 2 — Authenticate
Step 3 — Choose account/workspace
Step 4 — Choose sync triggers
Step 5 — Choose CRM actions
Step 6 — Map fields
Step 7 — Choose pipeline/stage
Step 8 — Send test lead
Step 9 — Activate
```

## 11.4 Trigger options

```text
When lead is created
When lead is qualified
When lead is booked
When lead is won
When status changes
When call completes
When chat completes
```

## 11.5 Action options

```text
Create/update contact
Create company/organisation
Create deal/opportunity
Add note
Create task/activity
Apply tags
Assign owner
Trigger workflow
```

## 11.6 Field mapping

Example:

```text
Lead name → Contact name
Phone → Mobile phone
Email → Email
Service needed → Deal title
Lead score → Lead score
Urgency → Priority
Source → Lead source
Summary → Note
Preferred callback → Activity due time
```

Support defaults, custom mapping, required fields, transformation preview and test payload preview.

---

# 12. Result Callback

Suggested endpoint:

```text
POST /api/internal/integrations/result
```

Success payload:

```json
{
  "event_id": "evt_01JABC123456789",
  "connection_id": "connection_uuid",
  "lead_id": "lead_uuid",
  "provider": "hubspot",
  "success": true,
  "external_contact_id": "12345",
  "external_deal_id": "67890",
  "remote_record_url": "https://...",
  "actions": ["contact.updated", "deal.created"],
  "completed_at": "2026-07-13T18:30:04.000Z"
}
```

Failure payload:

```json
{
  "event_id": "evt_01JABC123456789",
  "connection_id": "connection_uuid",
  "lead_id": "lead_uuid",
  "provider": "hubspot",
  "success": false,
  "error_code": "RATE_LIMITED",
  "error_message": "Provider rate limit exceeded.",
  "retryable": true,
  "completed_at": "2026-07-13T18:30:04.000Z"
}
```

Protect with HMAC, timestamp validation, idempotency and an internal service token.

---

# 13. Retry Strategy

Recommended schedule:

```text
Attempt 1 — immediately
Attempt 2 — after 1 minute
Attempt 3 — after 5 minutes
Attempt 4 — after 30 minutes
Attempt 5 — after 2 hours
```

After final failure:

- Mark failed
- Keep lead safe
- Show error in dashboard
- Allow manual retry
- Notify administrator if required
- Mark authentication problems as attention required

Retryable:

- Timeout
- Network failure
- 429
- 500
- 502
- 503
- Temporary provider outage

Usually non-retryable:

- Invalid credentials
- Revoked access
- Invalid mapping
- Missing required CRM field
- Permission denied
- Invalid pipeline/stage

---

# 14. Background Processing and Outbox

Recommended pattern:

1. Lead transaction creates the lead
2. Same transaction creates integration event
3. Worker reads pending event
4. Worker sends signed request to n8n
5. n8n processes independently
6. Callback updates sync record

Do not rely only on an in-memory queue.

Possible implementations:

- Dedicated Node worker
- Queue service
- Supabase scheduled worker
- Database outbox processor

For production, a reliable queue or outbox worker is preferred.

---

# 15. OAuth and Credential Strategy

## MVP

For pilot customers:

- Admin creates CRM credential in n8n
- Supabase stores n8n credential reference
- Customer never accesses n8n
- Customer configures through Alsaiti Voice UI

## Scalable version

Later:

- User clicks Connect
- OAuth starts
- Provider authorisation completes
- Tokens stored securely
- Credential reference linked
- Refresh automated
- Expiry triggers reconnect state

---

# 16. Two-Way Sync

Do not build two-way sync in the first release unless required.

Initial direction:

```text
Alsaiti Voice → CRM
```

Later:

```text
CRM → Alsaiti Voice
```

Possible inbound updates:

- Deal stage changed
- Appointment booked
- Owner changed
- Won/lost
- Unsubscribed

Two-way sync requires conflict rules, loop prevention, field ownership and idempotency.

---

# 17. Permissions

Recommended roles:

```text
owner
admin
manager
staff
viewer
```

Only owner/admin should connect or disconnect CRMs and change credentials.

Managers may view logs and retry.

Staff may view CRM status and remote record links.

Viewers are read-only.

---

# 18. Dashboard Requirements

Add CRM status to:

- Lead table
- Lead profile
- Integrations page
- System health area

Statuses:

```text
Not synced
Pending
Syncing
Synced
Failed
Attention required
```

Lead profile should show:

- Provider
- External IDs
- Last sync
- Remote record link
- Last error
- Retry button
- Sync history

---

# 19. Error Handling

Use specific errors:

```text
AUTH_EXPIRED
RATE_LIMITED
INVALID_MAPPING
PIPELINE_NOT_FOUND
STAGE_NOT_FOUND
PERMISSION_DENIED
PROVIDER_UNAVAILABLE
TIMEOUT
DUPLICATE_RECORD
INVALID_PAYLOAD
UNKNOWN_PROVIDER
```

Store:

- Internal code
- Safe user message
- Detailed internal message
- Retryable flag
- Recommended action

Never expose raw secret-bearing provider responses.

---

# 20. Monitoring

Track:

- Events created
- Events sent
- Events processed
- Average sync duration
- Success rate
- Failure rate by provider
- Retry count
- Authentication failures
- Rate limits
- Duplicate events
- Dead-letter events
- Callback failures

Alerts:

- n8n unavailable
- Queue growing
- Callback failing
- Provider auth expired
- High failure rate
- Excessive invalid signatures
- No successful syncs for a connected provider

---

# 21. n8n Deployment

MVP requirements:

- Private n8n instance
- HTTPS
- Strong admin authentication
- Custom encryption key
- Database-backed configuration
- Backups
- Restricted network access
- Separate staging and production
- Execution pruning
- Log retention

For scale:

- Queue mode
- Worker processes
- Redis or supported queue
- Dedicated database
- Horizontal workers
- Monitoring
- Workflow exports/version control

Do not expose n8n to customers.

---

# 22. Environment Variables

Alsaiti Voice:

```env
N8N_CRM_ROUTER_URL=""
ALSAITI_TO_N8N_SIGNING_SECRET=""
N8N_CALLBACK_SIGNING_SECRET=""
INTEGRATION_EVENT_MAX_AGE_SECONDS="300"
INTEGRATION_MAX_RETRIES="5"
INTEGRATION_REQUEST_TIMEOUT_MS="10000"
```

n8n:

```env
ALSAITI_EVENT_SIGNING_SECRET=""
ALSAITI_CALLBACK_URL=""
ALSAITI_CALLBACK_SIGNING_SECRET=""
N8N_ENCRYPTION_KEY=""
N8N_HOST=""
N8N_PROTOCOL="https"
WEBHOOK_URL=""
```

Never commit real values.

---

# 23. Development Phases

## Phase 1 — Integration foundation

Build:

- Database migrations
- RLS
- Event generation
- Outbox dispatcher
- HMAC signing
- n8n router
- Callback endpoint
- Generic webhook
- Sync status UI
- Manual retry

## Phase 2 — Native CRM connectors

Build:

- HubSpot
- Pipedrive
- HighLevel
- Google Sheets
- Mapping UI
- Test connection
- Test lead

## Phase 3 — Self-service connection

Build:

- OAuth
- Token refresh
- Reconnect
- Account selection
- Pipeline/stage/owner selection

## Phase 4 — Scale

Build:

- Queue workers
- Dead-letter handling
- Bulk sync
- Backfill
- Advanced monitoring

## Phase 5 — Two-way sync

Add provider webhooks and conflict-resolution rules.

---

# 24. API Endpoints

```text
GET    /api/integrations
POST   /api/integrations
GET    /api/integrations/:id
PATCH  /api/integrations/:id
DELETE /api/integrations/:id

POST   /api/integrations/:id/test
POST   /api/integrations/:id/pause
POST   /api/integrations/:id/resume
POST   /api/integrations/:id/reconnect

GET    /api/integrations/:id/logs
POST   /api/integrations/:id/retry/:syncRecordId

POST   /api/internal/integrations/result
POST   /api/internal/integrations/dispatch
```

All user routes must verify authentication, membership, role and ownership.

---

# 25. Testing

## Unit

- Signature generation
- Signature validation
- Timestamp expiry
- Event schema
- Field mapping
- Phone/email normalisation
- Retry classification
- Error mapping

## Integration

- Lead creates event
- Event dispatches once
- Duplicate dispatch harmless
- Invalid signature rejected
- Expired request rejected
- Cross-business request rejected
- Callback updates sync record
- Disabled connection skipped

## Provider

For each provider:

- Existing contact found
- New contact created
- Contact updated
- Deal created
- Invalid pipeline
- Auth expired
- Permission denied
- Rate limit
- Timeout
- Duplicate event
- External ID stored

## UI

- Connect card
- Wizard
- Field mapping
- Test connection
- Test lead
- Pause/resume
- Disconnect
- Logs
- Retry
- Mobile layouts
- Empty/error states

## Security

- Cross-tenant denial
- HMAC tampering
- Replay rejection
- Secret never returned
- Staff cannot change credentials
- Service-role absent from browser bundle
- Callback endpoint protected

---

# 26. Acceptance Criteria

The MVP is complete when:

1. A business can connect a supported CRM
2. Connection status appears in the app
3. Test connection succeeds
4. Test lead can be sent
5. A real lead creates one integration event
6. n8n validates the event
7. n8n routes to the correct provider
8. CRM contact is created or updated
9. Deal/opportunity is created when enabled
10. External IDs return to Alsaiti Voice
11. Lead profile shows synced state
12. Duplicate events create no duplicates
13. Failed syncs retry safely
14. Final failures show in dashboard
15. Manual retry works
16. Lead remains safe when CRM fails
17. Tenant isolation works
18. No CRM secret reaches the browser
19. Type-check, lint, tests and build pass
20. Documentation is complete

---

# 27. Recommended Implementation Order

```text
1. Database migrations
2. RLS policies
3. Integration event service
4. HMAC signing
5. Outbox dispatcher
6. n8n router
7. Callback endpoint
8. Generic webhook connector
9. Sync status UI
10. HubSpot
11. Pipedrive
12. HighLevel
13. Google Sheets
14. Mapping UI
15. Test connection
16. Manual retry
17. Monitoring
18. Production hardening
```

Do not start with every CRM at once.

First make the event system and generic webhook reliable.

---

# 28. Final Product Statement

> Alsaiti Voice uses a secure automation and integration layer powered by n8n to synchronise leads, calls, conversations and appointments with leading CRM platforms and compatible API or webhook-based systems.

Final architecture:

```text
Alsaiti Voice
│
├── Supabase
│   └── Main source of truth
│
├── n8n
│   └── Integration and automation engine
│
├── HubSpot
├── Pipedrive
├── GoHighLevel
├── Google Sheets
├── Generic Webhooks
├── Salesforce later
├── Zoho later
├── Dynamics later
└── Custom API-enabled systems
```

---

# 29. Developer Execution Prompt

```text
Build the Alsaiti Voice universal CRM integration layer using this specification.

Core rule:
Supabase remains the source of truth. n8n is the integration and automation engine.

Start by inspecting the existing Alsaiti Voice repository and Supabase schema.
Do not rebuild unrelated parts of the product.

Phase 1:
- Create migrations for crm_connections, integration_events, crm_sync_records, crm_sync_attempts and webhook_endpoints
- Add RLS and indexes
- Build integration-event service
- Add outbox-style dispatch
- Add HMAC signing
- Add internal result callback endpoint
- Build n8n CRM Event Router
- Build Generic Webhook sub-workflow
- Display CRM status on leads
- Add logs and manual retry

Phase 2:
- Add HubSpot
- Add Pipedrive
- Add GoHighLevel
- Add Google Sheets
- Add default field mappings
- Add pipeline/stage settings
- Add test connection and test lead

Security:
- Never expose secrets
- Keep CRM credentials inside n8n or encrypted secret storage
- Verify signatures
- Add timestamp checks
- Add replay protection
- Add idempotency
- Enforce tenant isolation
- Never block lead creation because CRM is unavailable
- Never silently discard failed events

Quality:
- Use TypeScript
- Keep provider logic in adapters/services
- Keep UI separate from integration logic
- Add unit, integration and security tests
- Run type-check, lint, tests and production build
- Update project documentation

At the end provide:
1. Files changed
2. Migrations
3. n8n workflows
4. Environment variables
5. Setup steps
6. Test evidence
7. Remaining limitations
8. Recommended next phase
```

---

# 30. Final Warning

Do not treat n8n as a shortcut that removes the need for proper engineering.

A real integration platform requires:

- Secure event creation
- Reliable delivery
- Signature verification
- Idempotency
- Duplicate prevention
- Provider routing
- Error recovery
- Monitoring
- Audit history
- Tenant isolation
- Clear customer configuration

The required standard is not merely:

```text
Webhook → CRM
```

It is:

```text
Reliable event creation
+ secure delivery
+ provider-specific execution
+ duplicate prevention
+ error recovery
+ status reporting
+ audit history
+ customer configuration
```
