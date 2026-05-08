-- ─────────────────────────────────────────────────────────────────────────────
-- Grace Studios Platform — Roles & First Piece Media
-- Run this in the Supabase SQL editor (Dashboard → SQL Editor → New query)
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. profiles ─────────────────────────────────────────────────────────────────
--    One row per auth user. Created at signup, stores role + display info.
create table if not exists profiles (
  id          uuid        references auth.users(id) on delete cascade primary key,
  email       text        not null,
  full_name   text,
  role        text        not null
              check (role in ('client', 'supplier', 'admin'))
              default 'client',
  company     text,                         -- team name (client) or factory name (supplier)
  created_at  timestamptz default now()
);

alter table profiles enable row level security;

-- Users can read and update their own profile
create policy "profiles: own row"
  on profiles for all
  using  (auth.uid() = id)
  with check (auth.uid() = id);

-- Admins can read every profile
create policy "profiles: admins read all"
  on profiles for select
  using (
    exists (
      select 1 from profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );


-- 2. first_piece_media ────────────────────────────────────────────────────────
--    Supplier uploads photos/videos of the first piece.
--    Admin reviews → if approved, client_visible flips to true.
--    Client then reviews and approves or requests changes.
create table if not exists first_piece_media (
  id                  uuid        default gen_random_uuid() primary key,
  created_at          timestamptz default now(),

  order_id            text        not null references orders(id) on delete cascade,
  uploaded_by         uuid        references auth.users(id),
  media_url           text        not null,
  media_type          text        not null check (media_type in ('photo', 'video')),
  caption             text,

  -- ── Admin review ──────────────────────────────────────────────────────────
  admin_approved      boolean,
  admin_note          text,
  admin_reviewed_at   timestamptz,
  admin_reviewed_by   uuid        references auth.users(id),

  -- ── Client review (unlocked only after admin_approved = true) ─────────────
  client_visible      boolean     default false,
  client_approved     boolean,
  client_note         text,
  client_reviewed_at  timestamptz
);

alter table first_piece_media enable row level security;

-- Suppliers can insert and view their own uploads
create policy "media: supplier own"
  on first_piece_media for all
  using  (auth.uid() = uploaded_by)
  with check (auth.uid() = uploaded_by);

-- Admins can do everything
create policy "media: admins all"
  on first_piece_media for all
  using (
    exists (
      select 1 from profiles where id = auth.uid() and role = 'admin'
    )
  );

-- Clients can SELECT rows that have been approved and made visible
create policy "media: clients view approved"
  on first_piece_media for select
  using (client_visible = true);


-- 3. Link orders → supplier user ──────────────────────────────────────────────
alter table orders
  add column if not exists supplier_user_id uuid references auth.users(id);


-- 4. Storage bucket (run separately or in dashboard) ──────────────────────────
-- insert into storage.buckets (id, name, public)
--   values ('first-piece-media', 'first-piece-media', false)
--   on conflict do nothing;
--
-- create policy "Suppliers upload"
--   on storage.objects for insert
--   with check (bucket_id = 'first-piece-media' and auth.role() = 'authenticated');
--
-- create policy "Authenticated read"
--   on storage.objects for select
--   using (bucket_id = 'first-piece-media' and auth.role() = 'authenticated');
