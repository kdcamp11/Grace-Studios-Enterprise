-- ============================================================
-- Migration 013: Fix orders RLS to support user_id-based lookup
--
-- The original orders_select_own policy matched ONLY by
-- auth.jwt() ->> 'email'. Newer Supabase versions may not
-- include email in the JWT, causing orders to be invisible
-- to logged-in clients.
--
-- This migration replaces the policy with one that matches
-- via email OR via clients.user_id = auth.uid(), so both
-- legacy email-based and user_id-linked clients can see
-- their orders.
--
-- Safe to run multiple times (uses DROP IF EXISTS).
-- Paste into the Supabase SQL editor and run.
-- ============================================================

-- orders: client can read their own orders
DROP POLICY IF EXISTS "orders_select_own" ON public.orders;

CREATE POLICY "orders_select_own"
  ON public.orders FOR SELECT
  USING (
    client_id IN (
      SELECT id FROM public.clients
      WHERE (
        email    = auth.jwt() ->> 'email'
        OR user_id = auth.uid()
      )
      AND tenant_id = orders.tenant_id
    )
  );

-- orders: client can insert their own orders
DROP POLICY IF EXISTS "orders_insert_own" ON public.orders;

CREATE POLICY "orders_insert_own"
  ON public.orders FOR INSERT
  WITH CHECK (
    client_id IN (
      SELECT id FROM public.clients
      WHERE (
        email    = auth.jwt() ->> 'email'
        OR user_id = auth.uid()
      )
      AND tenant_id = orders.tenant_id
    )
  );

-- orders: client can update their own orders
DROP POLICY IF EXISTS "orders_update_own" ON public.orders;

CREATE POLICY "orders_update_own"
  ON public.orders FOR UPDATE
  USING (
    client_id IN (
      SELECT id FROM public.clients
      WHERE (
        email    = auth.jwt() ->> 'email'
        OR user_id = auth.uid()
      )
      AND tenant_id = orders.tenant_id
    )
  );
