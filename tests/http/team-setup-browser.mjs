// Real UI/Server Actions/Auth in disposable runner only; never emit login cards.
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { setTimeout as delay } from 'node:timers/promises'
import { createClient } from '@supabase/supabase-js'
import { pinPassword } from '../../lib/pin-credentials.ts'

export async function verifyTeamSetupBrowser({base,db,status,sql,login,envelopes,cookies}) {
  assert.equal(process.env.GITHUB_ACTIONS,'true')
  assert.equal(base,'http://127.0.0.1:3100')
  assert.equal(new URL(status.API_URL).origin,'http://127.0.0.1:54321')
  const checked=r=>{if(r.error)throw new Error('Isolated fixture failed');return r.data}
  const {chromium}=await import('/tmp/count-stock-browser/node_modules/playwright/index.mjs')
  const browser=await chromium.launch()
  let stage='fixture', authTrigger=false, memberTrigger=false
  const ctx=await browser.newContext()
  await ctx.addCookies(cookies.map(c=>({...c,url:base})))
  const page=await ctx.newPage()
  page.setDefaultTimeout(30000)
  const wh=checked(await db.from('warehouses').insert({name:'Setup '+randomUUID()}).select('id,name').single())
  const session=checked(await db.from('count_sessions').insert({warehouse_id:wh.id}).select('id').single())
  const read=async()=>checked(await login.rpc('read_team_setup',{p_session:session.id}))
  const countTeams=async()=>checked(await db.from('teams').select('id').eq('session_id',session.id)).length
  const submit=()=>page.getByRole('button',{name:/^(Create Teams and Generate Logins|Resume Team Setup)$/})
  try {
    stage='dynamic 3/4/5 form'
    await page.goto(base+'/admin/sessao/'+session.id+'/equipes?flow=2&n=3')
    await page.getByRole('heading',{name:'Configure Variable Teams'}).waitFor()
    for(let i=0;i<3;i++){
      const fieldset=page.locator('fieldset').nth(i)
      for(let j=0;j<i;j++)await fieldset.getByRole('button',{name:'Add counter',exact:true}).click()
      await page.locator('[name="team_'+i+'_name"]').fill('Synthetic setup team '+i)
      for(let j=0;j<i+3;j++)await page.locator('[name="team_'+i+'_member_'+j+'"]').fill('Synthetic setup '+i+' '+j)
    }
    stage='Auth fails after partial provisioning'
    sql("create function public.test_setup_auth_failure() returns trigger language plpgsql as $$ begin if new.raw_user_meta_data->>'full_name'='Synthetic setup 2 4' then raise exception 'Synthetic Auth interruption'; end if; return new; end; $$; create trigger test_setup_auth_failure before insert on auth.users for each row execute function public.test_setup_auth_failure()")
    authTrigger=true
    await submit().click()
    await page.getByRole('alert').filter({hasText:'Setup was not completed'}).waitFor()
    const pending=await read()
    assert.ok(!pending.complete)
    assert.equal(pending.plan.flatMap(t=>t.members).filter(m=>m.userId).length,11)
    assert.equal(await countTeams(),0)
    assert.equal(await page.locator('tbody tr').count(),0)
    const firstPlan=JSON.stringify(pending.plan.map(t=>[t.pin,t.members.map(m=>m.pin)]))
    const changed=structuredClone(pending.draft);changed[0].name='Changed request'
    assert.ok((await login.rpc('reserve_team_setup',{p_session:session.id,p_draft:changed,p_plan:pending.plan})).error)
    // Reservation blocks legacy creation of the same PIN, even through service role.
    assert.ok((await db.from('teams').insert({session_id:session.id,team_name:'Collision',team_pin:pending.plan[0].pin})).error)
    assert.ok((await login.rpc('complete_team_setup',{p_session:session.id})).error)
    await page.reload()
    await page.getByRole('status').filter({hasText:'Saved setup recovered'}).waitFor()
    assert.ok(await page.locator('[name="team_0_name"]').isDisabled())
    assert.equal(await page.locator('[name="team_2_member_4"]').inputValue(),'Synthetic setup 2 4')
    console.log('PASS: 3/4/5 UI reserves one immutable draft; partial Auth failure issues no cards or memberships; reload recovers names')

    sql('drop trigger test_setup_auth_failure on auth.users; drop function public.test_setup_auth_failure()')
    authTrigger=false
    stage='late database rollback after all Auth users'
    sql("create function public.test_setup_member_failure() returns trigger language plpgsql as $$ begin if new.display_name='Synthetic setup 2 4' then raise exception 'Synthetic membership interruption'; end if; return new; end; $$; create trigger test_setup_member_failure before insert on public.team_memberships for each row execute function public.test_setup_member_failure()")
    memberTrigger=true
    await submit().click()
    await page.getByRole('alert').filter({hasText:'Setup was not completed'}).waitFor()
    const ready=await read()
    assert.equal(ready.plan.flatMap(t=>t.members).filter(m=>m.userId).length,12)
    assert.equal(await countTeams(),0,'Whole batch rolls back, not just the last team')
    assert.ok(JSON.stringify(ready.plan.map(t=>[t.pin,t.members.map(m=>m.pin)]))===firstPlan)
    assert.equal(await page.locator('tbody tr').count(),0)
    sql('drop trigger test_setup_member_failure on public.team_memberships; drop function public.test_setup_member_failure()')
    memberTrigger=false
    console.log('PASS: late Postgres failure leaves zero partial teams; twelve Auth identities and original PINs remain recoverable')

    stage='lost response after committed setup'
    let request
    await page.route('**/admin/sessao/**/equipes*',async route=>{
      const req=route.request()
      if(req.method()==='POST' && req.headers()['next-action']){
        request={id:req.headers()['next-action'],body:req.postData()}
        await route.fetch()
        await route.abort('failed')
      } else await route.continue()
    })
    await submit().click()
    for(let i=0;i<60 && !(await read()).complete;i++)await delay(250)
    assert.ok((await read()).complete)
    await page.unroute('**/admin/sessao/**/equipes*')
    await page.reload()
    await page.getByRole('heading',{name:'Logins Generated',exact:true}).waitFor()
    const rows=await page.locator('tbody tr').evaluateAll(rows=>rows.map(r=>[...r.querySelectorAll('td')].map(c=>c.textContent.trim())))
    assert.equal(rows.length,12)
    assert.ok(rows.every(r=>/^\d{4}$/.test(r[1])&&/^\d{4}$/.test(r[4])))
    assert.equal(await countTeams(),3)
    const final=await read()
    assert.ok(JSON.stringify(final.plan.map(t=>[t.pin,t.members.map(m=>m.pin)]))===firstPlan)
    for(const [index,team] of final.plan.entries()){
      const stored=checked(await db.from('teams').select('id,session_id').eq('session_id',session.id).eq('team_name',team.name).single())
      const members=checked(await db.from('team_memberships').select('role,display_order,user_id').eq('team_id',stored.id))
      assert.equal(members.length,index+3)
      assert.equal(members.filter(m=>m.role==='independent').length,1)
      assert.equal(members.find(m=>m.role==='independent').display_order,0)
      assert.equal(checked(await db.from('team_count_slots').select('id').eq('team_id',stored.id)).length,index+2)
      assert.equal(checked(await db.from('team_flows').select('phase').eq('team_id',stored.id).single()).phase,'setup')
      assert.equal(checked(await db.from('counter_accounts').select('auth_user_id').eq('team_id',stored.id)).length,0)
    }
    assert.ok(request)
    await Promise.all([1,2].map(()=>page.request.post(base+'/admin/sessao/'+session.id+'/equipes?flow=2&n=3',{
      headers:{'Next-Action':request.id,Origin:base,'Content-Type':'text/plain;charset=UTF-8'},data:request.body
    })))
    assert.equal(await countTeams(),3)
    const replay=await Promise.all([login.rpc('complete_team_setup',{p_session:session.id}),login.rpc('complete_team_setup',{p_session:session.id})])
    assert.ok(replay.every(r=>!r.error&&r.data.complete))
    assert.ok(JSON.stringify((await read()).plan)===JSON.stringify(final.plan))
    console.log('PASS: lost successful response, reload and concurrent real action/RPC retries preserve one batch and the same cards')

    stage='new PIN login and protected role routing'
    for(const team of final.plan){
      for(const person of [team.members[0],team.members.find(m=>m.role==='independent')]){
        const participant=await browser.newContext()
        const p=await participant.newPage()
        await p.goto(base+'/login')
        await p.locator('[name="team_pin"]').fill(team.pin)
        await p.locator('[name="user_pin"]').fill(person.pin)
        await p.getByRole('button',{name:'Log In',exact:true}).click()
        await p.waitForURL(base+'/team')
        await p.getByText(team.name+' — '+wh.name,{exact:true}).waitFor()
        await p.getByText(person.name+' — '+(person.role==='independent'?'Independent':'Counter 1'),{exact:true}).waitFor()
        assert.equal(await p.getByRole('button',{name:/Confirm Count|Add to Count/}).count(),0)
        await p.goto(base+'/busca')
        await p.waitForURL(base+'/team')
        const client=createClient(status.API_URL,status.ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false}})
        checked(await client.auth.signInWithPassword({email:team.pin+person.pin+'@count.local',password:pinPassword(team.pin,person.pin)}))
        assert.ok((await client.rpc('read_team_setup',{p_session:session.id})).error)
        assert.ok((await client.rpc('complete_team_setup',{p_session:session.id})).error)
        checked(await client.auth.updateUser({data:{role:'admin',team_setup_job:final.id}}))
        assert.ok((await client.rpc('read_team_setup',{p_session:session.id})).error)
        await participant.close()
      }
    }
    console.log('PASS: real four-digit PIN logins for each team reach protected setup context; Independent never receives legacy counting; metadata cannot grant admin')

    stage='safe error telemetry'
    let envelope
    for(let i=0;i<30;i++){envelope=envelopes.find(e=>e.includes('"team.setup"'));if(envelope)break;await delay(200)}
    assert.ok(envelope)
    assert.ok(!envelope.includes('Synthetic setup'))
    assert.ok(!envelope.includes(status.SERVICE_ROLE_KEY))
    for(const team of final.plan)for(const m of team.members)assert.ok(!envelope.includes(team.pin+m.pin+'@count.local'))
    console.log('PASS: setup failure reaches isolated Sentry SDK collector without names or login emails')
  } catch {
    // Playwright assertions/requests may contain credentials; stage is sufficient.
    throw new Error('Team setup browser verification failed at stage: '+stage)
  } finally {
    if(authTrigger)sql('drop trigger test_setup_auth_failure on auth.users; drop function public.test_setup_auth_failure()')
    if(memberTrigger)sql('drop trigger test_setup_member_failure on public.team_memberships; drop function public.test_setup_member_failure()')
    await browser.close()
  }
}
