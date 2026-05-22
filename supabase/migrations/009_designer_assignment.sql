-- Migration 009: assigned_designer_id on orders

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS assigned_designer_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_orders_designer ON public.orders(assigned_designer_id);

-- Designers can see orders assigned to them
CREATE POLICY "orders_designer_assigned"
  ON public.orders FOR SELECT
  USING (assigned_designer_id = auth.uid());
