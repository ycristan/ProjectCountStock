-- Dados sintéticos para o autoteste do backup (banco descartável do CI).
insert into public.warehouses(id, name) values ('00000000-0000-0000-0000-00000000b001', 'Backup probe');
insert into public.inventory_items(brand_code, brand_name, bpu, pallet_size, weight_avg, category, category1, warehouse_id)
values ('backup-probe-a', 'Probe product', 20, 80, 330, 'Drinks', 'Cans', '00000000-0000-0000-0000-00000000b001'),
       ('backup-probe-b', E'Probe "quoted"\nsecond line \\ tab', 1, 40, 0, 'Food', 'Snacks', '00000000-0000-0000-0000-00000000b001');
insert into public.item_bin_locations(brand_code, bin_location) values ('backup-probe-a', '40B');
insert into auth.users(id, instance_id, aud, role, email)
values ('00000000-0000-0000-0000-00000000b003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'probe@example.invalid');
