-- No public demo accounts or default passwords are provisioned.
insert into public.jpspg_records(kind,id,payload) values
 ('settings','health','{"id":"health","version":1}') on conflict do nothing;
