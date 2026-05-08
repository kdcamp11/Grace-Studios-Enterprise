-- order_files: final production files uploaded by admin, downloadable by client
create table if not exists order_files (
  id               uuid        default gen_random_uuid() primary key,
  created_at       timestamptz default now(),
  order_id         uuid        not null references orders(id) on delete cascade,
  uploaded_by      uuid        references auth.users(id),
  file_url         text        not null,
  file_name        text        not null,
  file_size        bigint,                           -- bytes
  file_type        text,                             -- mime type
  label            text,                             -- e.g. "Print-Ready Files", "Vector Source"
  client_visible   boolean     default true          -- admin can hide if needed
);

alter table order_files enable row level security;

-- Admins can do everything
create policy "order_files: admins all" on order_files
  for all using (
    exists (select 1 from profiles where id = auth.uid() and role = 'admin')
  );

-- Clients can read visible files for their orders
create policy "order_files: clients read" on order_files
  for select using (client_visible = true);

-- Storage bucket: order-files
-- Run in Dashboard → Storage → New bucket: "order-files", private
-- Then add policies:
--   INSERT: authenticated, bucket_id = 'order-files'
--   SELECT: authenticated, bucket_id = 'order-files'
