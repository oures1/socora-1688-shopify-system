create table if not exists public.admin_store (
  key text primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

create or replace function public.set_admin_store_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_admin_store_updated_at on public.admin_store;

create trigger set_admin_store_updated_at
before update on public.admin_store
for each row
execute function public.set_admin_store_updated_at();

alter table public.admin_store enable row level security;

grant usage on schema public to service_role;
grant select, insert, update, delete on table public.admin_store to service_role;
grant usage, select on all sequences in schema public to service_role;
