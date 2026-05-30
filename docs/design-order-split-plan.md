# Design vs Order Architectural Split — Implementation Plan

## Objective

Stop creating an empty `orders` row the moment a client fills out Team Info.
Instead, follow the NikeID model: a **Saved Design** holds all pre-payment work
(brief, builder canvas, uploaded file, AI concepts). A real **Order** is born only
when the client completes the $149 Creative Activation payment. Clients can
save, return, and iterate freely with no database footprint until they commit.

---

## Current Problem

`POST /api/brief/start` (called from Team Info) immediately inserts an `orders`
row. Clients who abandon the flow leave ghost orders. Ghost orders cause:

- "Brief not found" errors when revisited  
- Concepts page triggering a fresh AI generation for an empty order  
- Portal cluttered with `Design Started` rows that have no work attached  
- Impossible to distinguish "never did anything" from "partially built"

---

## Proposed Architecture

```
Pre-payment                        At payment
───────────                        ──────────
designs table  ──── Stripe ──────► orders table
    │                                   │
    ├── briefs (design_id FK)            ├── briefs (order_id FK)
    ├── concepts (design_id FK)          ├── concepts (order_id FK)
    └── storage paths keyed by          └── stage_log, invoices, etc.
        design.id
```

- `designs` is the pre-payment home. It mirrors the minimal fields an order
  needs before payment: `tenant_id`, `client_id`, `kind` (ai | builder | upload),
  `status` (draft | submitted | converted).
- `briefs.order_id` becomes **nullable**. A brief created before payment
  carries a `design_id` instead. After payment, the webhook stamps `order_id`
  on it (and nulls `design_id` for cleanliness, or leaves both for history).
- `concepts.order_id` becomes **nullable** in the same way.
- Storage paths switch from `{bucket}/{tenantId}/{orderId}/` to
  `{bucket}/{tenantId}/{designId}/` while the design is pre-payment. The
  webhook can optionally copy/rename storage objects; in practice, since
  storage URLs are stored as text in `briefs`, it is simplest to leave them
  as-is and keep the original path for the lifetime of the file.
- The Stripe webhook for `design_deposit` now:
  1. Reads `design_id` from session metadata  
  2. Inserts the `orders` row (previously done by `/api/brief/start`)  
  3. Stamps `order_id` on the linked brief + concepts rows  
  4. Sets `design_fee_paid = true`, `stage = 'creative_in_review'`

---

## Phases

| Phase | Title | Risk | Rollback |
|-------|-------|------|---------|
| 1 | Schema migration | Low — additive only | Drop new columns/table |
| 2 | New `/api/design/start` endpoint | Low — new code path | Delete endpoint |
| 3 | Wire UI to new endpoint | Medium — changes entry flow | Revert page changes |
| 4 | First-save endpoints accept `design_id` | Medium — dual FK logic | Revert to order_id-only |
| 5 | Checkout/payment keyed by `design_id` | High — touches money flow | Feature flag |
| 6 | Webhook mints the order | High — critical path | Feature flag |
| 7 | Portal UI: Saved Designs section | Low — UI only | Hide section |
| 8 | Retire `/api/brief/start` order creation | Low — cleanup | Restore insert |

Phases 1–4 can be deployed and tested independently. Phases 5–6 should ship
together and behind a feature flag until verified. Phase 8 is cleanup only.

---

## Phase 1 — Schema Migration

**File:** `supabase/migrations/021_designs_table.sql`

```sql
-- ── designs table ────────────────────────────────────────────────────────────
create table if not exists designs (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references tenants(id) on delete cascade,
  client_id   uuid not null references clients(id) on delete cascade,
  kind        text not null check (kind in ('ai', 'builder', 'upload')),
  status      text not null default 'draft'
              check (status in ('draft', 'submitted', 'converted')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- RLS: clients see their own designs only
alter table designs enable row level security;

create policy "designs_select_own" on designs for select
  using (
    client_id in (
      select id from clients
      where user_id = auth.uid()
         or email = (select email from auth.users where id = auth.uid())
    )
  );

-- ── briefs: add nullable design_id ──────────────────────────────────────────
alter table briefs
  add column if not exists design_id uuid references designs(id) on delete set null;

-- ── concepts: add nullable design_id ─────────────────────────────────────────
alter table concepts
  add column if not exists design_id uuid references designs(id) on delete set null;

-- Index for lookup in the portal
create index if not exists designs_client_id_idx    on designs(client_id);
create index if not exists designs_tenant_id_idx    on designs(tenant_id);
create index if not exists briefs_design_id_idx     on briefs(design_id);
create index if not exists concepts_design_id_idx   on concepts(design_id);
```

**What stays unchanged:** `briefs.order_id` remains NOT NULL for now. We make
it nullable in a follow-up migration only after Phase 4 is shipped and
all new saves go through `design_id`. This gives a clean two-step rollout
without breaking existing rows.

---

## Phase 2 — New `POST /api/design/start` Endpoint

**New file:** `app/api/design/start/route.ts`

This replaces the order-creation logic in `/api/brief/start` while keeping
the client upsert. It returns `{ designId, clientId }` instead of
`{ orderId, clientId }`.

```typescript
// POST /api/design/start
// Creates or upserts the clients row, then creates a designs row.
// Does NOT touch the orders table.
export async function POST(req: NextRequest) {
  const { teamName, contactName, email, city, sport, kind } = await req.json();
  // kind: 'ai' | 'builder' | 'upload' — sent by the UI based on chosen path

  const tenant = await getRequestTenant();
  const admin  = createAdminClient();

  // Resolve user from Bearer token (same pattern as /api/brief/start)
  const user = await resolveUserFromBearer(req, admin);

  // Upsert client (identical to existing logic)
  const { data: client } = await admin.from("clients").upsert(
    { tenant_id: tenant.id, name: teamName, contact_name: contactName,
      email: email.trim().toLowerCase(), sport, city,
      ...(user ? { user_id: user.id } : {}) },
    { onConflict: "tenant_id,email", ignoreDuplicates: false }
  ).select("id").single();

  // Create the design (no order)
  const { data: design } = await admin.from("designs")
    .insert({ tenant_id: tenant.id, client_id: client.id, kind })
    .select("id").single();

  return NextResponse.json({ designId: design.id, clientId: client.id });
}
```

**Helper to extract:** `lib/api/resolve-user-from-bearer.ts` — pulls the
Bearer token pattern that currently lives inline in `/api/brief/start` so both
endpoints share it.

---

## Phase 3 — Wire Team Info UI to New Endpoint

**File:** `app/brief/new/page.tsx`

Change the `startOrder` function to call `/api/design/start` instead of
`/api/brief/start`. Pass `kind` based on `designPath`:

```typescript
const kind = designPath === "builder" ? "builder"
           : designPath === "upload"  ? "upload"
           : "ai";

const res = await fetch("/api/design/start", {
  method: "POST",
  headers: { "Content-Type": "application/json",
             ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  body: JSON.stringify({ ...payload, kind }),
});
const data = await res.json();
// data.designId — replaces orderId in localStorage and routing
```

**`lib/brief-state.ts`** — add `designId` field alongside (or replacing)
`orderId`. Keep backward-compat read for existing localStorage entries that
have `orderId` only.

**Routing after start:** instead of going to `/brief/choose` or
`/orders/{orderId}/concepts`, route to:
- AI: `/brief/${designId}/choose`  
- Builder: `/jersey-builder?designId=${designId}`  
- Upload: `/orders/upload?designId=${designId}` (or a design-keyed path)

This means URL segments switch from `order_id` to `design_id` in the pre-payment
flow. Pages that currently use `[order_id]` in their path need a parallel
`[design_id]` variant or a shared param name (see Phase 4 notes).

---

## Phase 4 — First-Save Endpoints Accept `design_id`

Three endpoints currently write the first real data for a design. All require
an existing `orders` row via `assertClientOrder`. Each needs a parallel
`design_id` code path.

### 4a. `POST /api/orders/[order_id]/save-builder-preview` → also accept `design_id`

**Option A (preferred):** Create `POST /api/designs/[design_id]/save-builder-preview`
that mirrors the existing route but:
- Calls `assertClientDesign(design_id)` instead of `assertClientOrder`
- Storage path: `builder-previews/{tenantId}/{designId}/...`
- Upserts `briefs` row with `design_id` instead of `order_id`
  (requires `briefs.order_id` to accept NULL — see Phase 1 note above)

**New helper:** `lib/api/assert-client-design.ts` — mirrors `assert-client-order.ts`
but queries the `designs` table and returns `{ userId, email, designId, clientId, tenantId }`.

```typescript
export async function assertClientDesign(designId: string): Promise<ClientDesignContext | NextResponse> {
  const serverClient = createServerClient();
  const { data: { user } } = await serverClient.auth.getUser();
  if (!user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const { data: design } = await admin
    .from("designs")
    .select("id, client_id, tenant_id, clients(email, user_id)")
    .eq("id", designId)
    .single();

  if (!design) return NextResponse.json({ error: "Design not found" }, { status: 404 });

  // same email/user_id ownership check as assertClientOrder
  const emailMatch  = clientEmail.toLowerCase() === user.email.toLowerCase();
  const userIdMatch = clientUserId !== null && clientUserId === user.id;
  if (!emailMatch && !userIdMatch)
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  return { userId: user.id, email: user.email, designId: design.id,
           clientId: design.client_id, tenantId: design.tenant_id };
}
```

### 4b. `POST /api/orders/[order_id]/upload-concept` → also accept `design_id`

Create `POST /api/designs/[design_id]/upload-concept`. Same logic:
- Uses `assertClientDesign`
- Storage path: `client-concepts/{tenantId}/{designId}/`
- Upserts `briefs` row with `design_id` (nullable `order_id`)

### 4c. `POST /api/brief/submit` → accept `design_id`

Currently takes `order_id` in the JSON body. Add optional `design_id`:

```typescript
const { order_id, design_id, concept_source, ...briefFields } = body;
// If design_id provided: upsert briefs with design_id, do NOT touch orders table
// If order_id provided: existing logic unchanged (backward compat)
```

### 4d. `POST /api/brief/generate` (AI concept generation)

Currently requires an `order_id` to queue generation. Add parallel support for
`design_id`. Generation jobs keyed by design until converted to order.

**Backward compatibility:** All existing `order_id`-based paths continue to work
unchanged. New `design_id` paths are purely additive.

---

## Phase 5 — Checkout Keyed by `design_id`

**Current flow:**  
`/orders/${orderId}/checkout` → `POST /api/orders/${orderId}/design-deposit` → Stripe session  
Stripe metadata: `{ order_id, tenant_id, payment_type: "design_deposit" }`

**New flow:**  
`/designs/${designId}/checkout` → `POST /api/designs/${designId}/design-deposit` → Stripe session  
Stripe metadata: `{ design_id, tenant_id, payment_type: "design_deposit" }`

**New file:** `app/designs/[design_id]/checkout/page.tsx`  
Mirror of `app/orders/[order_id]/checkout/page.tsx` but:
- Loads data from `/api/designs/${designId}/info` (new endpoint)
- Calls `/api/designs/${designId}/design-deposit`

**New file:** `app/api/designs/[design_id]/design-deposit/route.ts`  
Mirrors existing design-deposit route but:
- Uses `assertClientDesign`
- Passes `design_id` (not `order_id`) in Stripe metadata
- Does not require an `orders` row

**Feature flag:** Add `ENABLE_DESIGN_CHECKOUT=true` env var. When false, Team
Info still calls `/api/brief/start` and routes to `/orders/${orderId}/checkout`.
When true, routes through the new design-keyed checkout.

---

## Phase 6 — Webhook Mints the Order

**File:** `app/api/webhooks/stripe/route.ts`

In the `design_deposit` handler (currently at line ~312), when metadata contains
`design_id` instead of `order_id`:

```typescript
const designId = session.metadata?.design_id;
const orderId  = session.metadata?.order_id;

if (designId) {
  // New path: mint the order from the design
  const { data: design } = await admin
    .from("designs")
    .select("tenant_id, client_id, kind")
    .eq("id", designId)
    .single();

  // Create the order
  const { data: order } = await admin
    .from("orders")
    .insert({
      tenant_id:      design.tenant_id,
      client_id:      design.client_id,
      stage:          "creative_in_review",
      design_fee_paid: true,
      concept_source: design.kind === "upload" ? "client_provided"
                    : design.kind === "builder" ? "client_provided"
                    : null,
    })
    .select("id")
    .single();

  // Stamp the order_id on briefs and concepts that belong to this design
  await admin.from("briefs").update({ order_id: order.id })
    .eq("design_id", designId);
  await admin.from("concepts").update({ order_id: order.id })
    .eq("design_id", designId);

  // Mark design as converted
  await admin.from("designs").update({ status: "converted" }).eq("id", designId);

  // Record the deposit session
  await admin.from("design_deposit_sessions").insert({
    order_id:   order.id,
    tenant_id:  design.tenant_id,
    stripe_session_id: session.id,
    amount_cents: DESIGN_DEPOSIT_CENTS,
  });

  // Stage log
  await admin.from("stage_log").insert({
    order_id:   order.id,
    tenant_id:  design.tenant_id,
    from_stage: "onboarding",
    to_stage:   "creative_in_review",
  });

  // Send confirmation email (existing helper)
  await sendActivationEmail(order.id, design.tenant_id, admin);

} else if (orderId) {
  // Legacy path: existing logic unchanged
  await handleLegacyDesignDeposit(session, admin);
}
```

**Stripe success redirect:** Update `/api/designs/[design_id]/design-deposit`
to set `success_url` to `/orders/${order.id}/concepts` — but the order doesn't
exist yet at session creation. Two options:
1. Redirect to `/designs/${designId}/activated` which polls until
   `design.status === 'converted'`, then redirects to the minted order.
2. Store a `pending_order` redirect token. Simpler: use option 1.

**New page:** `app/designs/[design_id]/activated/page.tsx`  
Polls `GET /api/designs/${designId}/status`. When `status === 'converted'`,
reads `order_id` from the response and redirects to `/orders/${orderId}/concepts`.

---

## Phase 7 — Portal UI: Saved Designs Section

**File:** `app/portal/page.tsx`

Add a new section above the existing Orders list. Pulls from a new endpoint.

**New endpoint:** `GET /api/portal/designs`

```typescript
// Returns all designs for the authenticated client that are status='draft'|'submitted'
// (i.e., not yet converted to an order)
// Shape: { designs: Array<{ id, kind, status, teamName, sport, createdAt, previewUrl }> }
```

**Portal design card:** Shows team name, sport, design kind badge (AI / Builder / Upload),
last-updated date, and a "Continue" button that routes to the right pre-payment page:
- `kind === 'ai'`: → `/brief/${designId}/choose` (if no brief) or `/orders/{designId}/concepts` (has concepts)
- `kind === 'builder'`: → `/jersey-builder?designId=${designId}`
- `kind === 'upload'`: → `/orders/upload?designId=${designId}`

**Saved Designs section only appears** when there are unconverted designs. The
existing Orders section remains unchanged — it shows all fully-activated orders.

---

## Phase 8 — Retire Order Creation from `/api/brief/start`

Once Phases 1–7 are live and verified:

**File:** `app/api/brief/start/route.ts`

Remove the `orders` insert. The route becomes client-upsert only (or is deleted
entirely if all callers have migrated to `/api/design/start`).

```typescript
// BEFORE:
const { data: order } = await admin.from("orders")
  .insert({ tenant_id: tenant.id, client_id: client.id, stage: "onboarding" })
  .select("id").single();
return NextResponse.json({ orderId: order.id, clientId: client.id });

// AFTER: route deleted or redirects to /api/design/start
```

---

## File Change Summary

### New Files

| File | Purpose |
|------|---------|
| `supabase/migrations/021_designs_table.sql` | Schema: designs table, nullable FKs |
| `app/api/design/start/route.ts` | Create design (no order) at Team Info |
| `lib/api/assert-client-design.ts` | Auth + ownership check for design routes |
| `app/api/designs/[design_id]/save-builder-preview/route.ts` | Builder autosave keyed by design |
| `app/api/designs/[design_id]/upload-concept/route.ts` | File upload keyed by design |
| `app/api/designs/[design_id]/design-deposit/route.ts` | Stripe session for design checkout |
| `app/api/designs/[design_id]/info/route.ts` | Info endpoint for design checkout page |
| `app/api/designs/[design_id]/status/route.ts` | Polling endpoint post-payment |
| `app/api/portal/designs/route.ts` | Saved Designs list for portal |
| `app/designs/[design_id]/checkout/page.tsx` | Checkout page keyed by design |
| `app/designs/[design_id]/activated/page.tsx` | Post-payment redirect bridge |

### Modified Files

| File | Change |
|------|--------|
| `app/brief/new/page.tsx` | Call `/api/design/start`, route by `designId` |
| `lib/brief-state.ts` | Add `designId` field |
| `app/api/brief/submit/route.ts` | Accept `design_id` alongside `order_id` |
| `app/api/brief/generate/route.ts` | Accept `design_id` for pre-payment generation |
| `app/api/webhooks/stripe/route.ts` | Mint order from design on payment |
| `app/portal/page.tsx` | Add Saved Designs section |
| `app/jersey-builder/page.tsx` | Pass/read `designId` instead of `orderId` |

### Retired Files (Phase 8)

| File | Action |
|------|--------|
| `app/api/brief/start/route.ts` | Remove order insert; possibly delete |

---

## Database Migration: `briefs.order_id` NOT NULL → nullable

This is the riskiest schema change. Do it in two steps:

**Step A** (in `021_designs_table.sql`): Add `design_id` column. Leave
`order_id NOT NULL` unchanged. All existing rows are unaffected.

**Step B** (in a separate `022_briefs_order_nullable.sql`, deployed after
Phase 4 is live): 

```sql
-- Only run after /api/designs/*/save-builder-preview and upload-concept
-- are shipping and all new briefs carry design_id.
alter table briefs alter column order_id drop not null;
alter table concepts alter column order_id drop not null;
```

Keeping these as two separate migrations ensures rollback is clean: if Phase 4
has a bug, drop migration 022 and `order_id` goes back to NOT NULL with zero
data loss.

---

## Test Plan

### Pre-payment (Phases 1–4)
1. Fill out Team Info → confirm no `orders` row created, `designs` row created
2. Build a jersey → confirm `builder-previews/{tenantId}/{designId}/` path
3. Upload a file → confirm `client-concepts/{tenantId}/{designId}/` path
4. Generate AI concepts → confirm concepts linked by `design_id`
5. Navigate away and return → Saved Designs section shows the design; "Continue" routes correctly
6. Existing orders (pre-migration) still display correctly in Orders section

### At payment (Phases 5–6)
7. Click "Creative Activation" → lands on `/designs/${designId}/checkout`
8. Complete Stripe Checkout → webhook creates `orders` row
9. `/designs/${designId}/activated` polls → redirects to `/orders/${orderId}/concepts`
10. `designs.status` = `'converted'`; `briefs.order_id` stamped

### Regression
11. Existing order-keyed URLs (`/orders/${orderId}/checkout`) still work (legacy path)
12. Stripe webhook legacy `order_id` metadata still handled correctly

---

## What We Are NOT Changing

- **Existing orders:** Rows already in `orders` are untouched. The portal's
  Orders section continues to show them as before.
- **RLS policies on orders:** Unchanged.
- **Supplier / Admin views:** They work against `orders` — unaffected until
  Phase 7+ is complete.
- **Stripe price ID / amounts:** $149 stays the same; only the metadata payload
  gains `design_id`.
- **Email templates:** Sent from the webhook after order creation; logic moves
  but content is unchanged.

---

## Rollback Plan

Each phase is independently reversible:

- **Phase 1:** `drop table designs cascade;` + `alter table briefs drop column design_id;`
- **Phases 2–4:** Delete new API endpoints; revert page changes; old paths untouched
- **Phase 5–6:** Toggle `ENABLE_DESIGN_CHECKOUT=false`; Stripe legacy path handles all payments
- **Phase 7:** Hide the Saved Designs section with a feature flag
- **Phase 8 (cleanup):** Restore the `orders` insert in `/api/brief/start`

---

## Open Questions (Decide Before Phase 5)

1. **Storage paths post-conversion:** Should the webhook copy
   `client-concepts/{tenantId}/{designId}/` → `client-concepts/{tenantId}/{orderId}/`
   so URLs stay consistent with the order? Or keep design-keyed paths forever?
   **Recommendation:** Keep design-keyed. The URL is opaque to clients; renaming
   adds S3-copy latency in the webhook critical path for zero UX benefit.

2. **AI generation before payment:** Should clients be allowed to generate all 4
   AI concepts before paying? Currently: yes (no payment gate on `/api/brief/generate`).
   **Recommendation:** Keep it free as decided — AI cost is currently unlimited.

3. **Design expiry:** Should `designs` in `status='draft'` older than N days be
   purged? **Recommendation:** Leave as-is for now; implement a cron job later
   when volume warrants it.
