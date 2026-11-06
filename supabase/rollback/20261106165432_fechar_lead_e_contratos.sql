-- ATENCAO: use somente em emergencia.
-- Desfaz 20261106165432_fechar_lead_e_contratos.sql e, para isso, APAGA as colunas
-- eventos.lead_id e eventos.plano_fechado: os eventos continuam existindo, mas
-- perdem a ligacao com o lead e o plano fechado. Os contratos voltam a abrir so
-- para a conta que os enviou.

begin;

drop policy "Aprovados leem contratos" on storage.objects;
drop policy "Aprovados enviam contratos" on storage.objects;
drop policy "Aprovados apagam contratos" on storage.objects;

create policy "Users can read own contratos" on storage.objects
  for select to authenticated
  using (bucket_id = 'contratos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "Users can upload contratos" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'contratos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "Users can delete own contratos" on storage.objects
  for delete to authenticated
  using (bucket_id = 'contratos' and (storage.foldername(name))[1] = auth.uid()::text);

drop function public.fechar_lead(uuid, numeric, text, text, numeric, uuid, text);
drop index public.eventos_lead_id_unico;
alter table public.eventos drop column lead_id, drop column plano_fechado;

commit;
