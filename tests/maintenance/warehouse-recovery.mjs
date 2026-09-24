import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
// Only synthetic data in the disposable GitHub runner.
assert.equal(process.env.GITHUB_ACTIONS, 'true')
assert.equal(process.env.PGHOST, '127.0.0.1')
assert.equal(process.env.PGPORT, '54322')
assert.equal(process.env.PGDATABASE, 'postgres')
const source='00000000-0000-0000-0000-00000000a101'
const target='00000000-0000-0000-0000-00000000a102'
const other='00000000-0000-0000-0000-00000000a103'
const openSolo='00000000-0000-0000-0000-00000000a104'
function sql(query) {
  query=query.replaceAll('SOURCE_ID',source).replaceAll('TARGET_ID',target).replaceAll('OTHER_ID',other).replaceAll('OPEN_SOLO',openSolo)
  return execFileSync('psql', ['-X','-A','-t','-v','ON_ERROR_STOP=1','-c',query], {encoding:'utf8'}).trim()
}
sql([
"insert into public.warehouses(id,name) values ('SOURCE_ID','Repair Main'),('TARGET_ID','Repair BDS Main Warehouse'),('OTHER_ID','Repair Service');",
"insert into public.inventory_items(brand_code,brand_name,bpu,pallet_size,weight_avg,category,category1,brand_active,warehouse_id)",
"select code,'Kinder synthetic '||code,24,0,30,'Test','Test',false,'SOURCE_ID'::uuid from unnest(array['9816','9767','6152','2746','1231','1213']) code;",
"insert into public.inventory_items(brand_code,brand_name,bpu,pallet_size,weight_avg,category,category1,brand_active,warehouse_id) values",
"('9888','Kinder synthetic active',24,0,30,'Test','Test',true,'TARGET_ID'),",
"('repair-old-active','Omitted old active',24,0,30,'Test','Test',true,'SOURCE_ID'),",
"('repair-other','Other warehouse',24,0,30,'Test','Test',true,'OTHER_ID');",
"insert into public.inventory_items(brand_code,brand_name,bpu,pallet_size,weight_avg,category,category1,brand_active,warehouse_id)",
"select '2'||lpad(n::text,5,'0'),'Legacy pagination filler',24,0,30,'Test','Test',false,'SOURCE_ID'::uuid from generate_series(1,1205) n;",
"insert into public.item_bin_locations(brand_code,bin_location) values('1213','40B'),('9888','40B'),('repair-other','40B');",
"insert into public.solo_sessions(id,title,warehouse_id,restrict_to_list) values ('OPEN_SOLO','Repair open guard','TARGET_ID',false),",
"('00000000-0000-0000-0000-00000000a105','Repair closed history','SOURCE_ID',true);",
"insert into public.solo_session_items(session_id,brand_code) values('00000000-0000-0000-0000-00000000a105','1213');",
"insert into public.solo_entries(session_id,brand_code,brand_name,cases,final_cases) values('00000000-0000-0000-0000-00000000a105','1213','Historic name',2,2);",
"update public.solo_sessions set status='closed' where id='00000000-0000-0000-0000-00000000a105';",
"insert into public.count_sessions(id,warehouse_id) values('00000000-0000-0000-0000-00000000a106','SOURCE_ID');",
"insert into public.teams(id,session_id,team_name,status) values('00000000-0000-0000-0000-00000000a107','00000000-0000-0000-0000-00000000a106','Repair historic team','reconciliada');",
"insert into public.count_entries(team_id,counter_role,brand_code,cases,final_cases) values('00000000-0000-0000-0000-00000000a107','contador_1','1213',2,2);",
"insert into public.combined_results(session_id,brand_code,total_cases,status) values('00000000-0000-0000-0000-00000000a106','1213',2,'Avl');",
"update public.count_sessions set status='fechada' where id='00000000-0000-0000-0000-00000000a106';"
].join('\n'))
const fingerprint = id => sql("select md5(coalesce(string_agg(to_jsonb(i)::text,E'\\n' order by brand_code),'')) from public.inventory_items i where warehouse_id='"+id+"'")
const beforeSource=fingerprint(source), beforeTarget=fingerprint(target), beforeOther=fingerprint(other)
function repair({apply=false, sourceHash=beforeSource, targetHash=beforeTarget}={}) {
  return spawnSync('psql', ['-X','-v','ON_ERROR_STOP=1','-v','source_id='+source,'-v','target_id='+target,
    '-v','source_hash='+sourceHash,'-v','target_hash='+targetHash,'-v','apply='+apply,
    '-f','supabase/maintenance/recover-split-inventory.sql'], {encoding:'utf8'})
}
function failure(result, reason) {
  assert.notEqual(result.status,0)
  assert.match(result.stderr,reason)
  assert.equal(fingerprint(source),beforeSource)
  assert.equal(fingerprint(target),beforeTarget)
}
failure(repair({apply:true}), /Close source and destination counts/)
sql("update public.solo_sessions set status='closed' where id='OPEN_SOLO'")
failure(repair({apply:true,sourceHash:'stale'}), /Source changed since review/)
failure(repair({apply:true,targetHash:'stale'}), /Destination changed since review/)
const dry=repair()
assert.equal(dry.status,0,dry.stderr)
assert.equal(fingerprint(source),beforeSource,'dry run must roll back source')
assert.equal(fingerprint(target),beforeTarget,'dry run must roll back destination')
const applied=repair({apply:true})
assert.equal(applied.status,0,applied.stderr)
assert.equal(sql("select count(*) from public.inventory_items where warehouse_id='SOURCE_ID'"),'0')
assert.equal(sql("select count(*) from public.inventory_items where warehouse_id='TARGET_ID' and brand_name ilike '%kinder%'"),'7')
assert.equal(sql("select count(*) from public.inventory_items where warehouse_id='TARGET_ID' and brand_name ilike '%kinder%' and not brand_active"),'6')
assert.equal(sql("select brand_active from public.inventory_items where brand_code='repair-old-active'"),'f')
assert.equal(fingerprint(other),beforeOther,'Service inventory must stay unchanged')
assert.equal(sql("select count(*) from public.inventory_items where warehouse_id='TARGET_ID' and brand_code='repair-other'"),'0')
assert.equal(sql("select warehouse_id from public.solo_sessions where id='00000000-0000-0000-0000-00000000a105'"),source)
assert.equal(sql("select final_cases from public.solo_entries where session_id='00000000-0000-0000-0000-00000000a105'"),'2')
assert.equal(sql("select total_cases from public.combined_results where session_id='00000000-0000-0000-0000-00000000a106'"),'2')
const replay=repair({apply:true})
assert.notEqual(replay.status,0)
assert.match(replay.stderr,/Source is empty/)
console.log('PASS: active-count guard; stale fingerprints; dry-run rollback; seven Kinder (1 active/6 inactive); omitted legacy active inactivated; Service isolation; exact 11-table history preservation; replay rejected.')
