// New variable-team flow, synthetic users/data in the existing disposable runner.
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { setTimeout as delay } from 'node:timers/promises'
import { createClient } from '@supabase/supabase-js'
import { pinPassword } from '../../lib/pin-credentials.ts'

export async function verifyTeamCountBrowser({base,db,status,sql,login,browser,page,plan,session,wh}) {
  assert.equal(process.env.GITHUB_ACTIONS,'true')
  assert.equal(base,'http://127.0.0.1:3100')
  assert.equal(new URL(status.API_URL).origin,'http://127.0.0.1:54321')
  const checked=r=>{if(r.error)throw new Error('Team count browser verification failed at stage: fixture ('+r.error.code+')');return r.data}
  const suffix=randomUUID().slice(0,8)
  const codes=['act-','off-','unit-','other-'].map(s=>s+suffix)
  const other=checked(await db.from('warehouses').insert({name:'Other count '+suffix}).select('id').single())
  checked(await db.from('inventory_items').insert([
    {brand_code:codes[0],brand_name:'Count Active '+suffix,bpu:10,pallet_size:5,weight_avg:100,warehouse_id:wh.id,brand_active:true},
    {brand_code:codes[1],brand_name:'Count Inactive '+suffix,bpu:10,pallet_size:0,weight_avg:0,warehouse_id:wh.id,brand_active:false},
    {brand_code:codes[2],brand_name:'Count Unit '+suffix,bpu:1,pallet_size:5,weight_avg:100,warehouse_id:wh.id,brand_active:true},
    {brand_code:codes[3],brand_name:'Count Other '+suffix,bpu:10,pallet_size:5,weight_avg:100,warehouse_id:other.id,brand_active:true},
  ]))
  let stage='setup', contexts=[]
  const person=async(team,member)=>{
    const context=await browser.newContext();contexts.push(context)
    const p=await context.newPage();p.setDefaultTimeout(30000)
    await p.goto(base+'/login')
    await p.locator('[name="team_pin"]').fill(team.pin)
    await p.locator('[name="user_pin"]').fill(member.pin)
    await p.getByRole('button',{name:'Log In',exact:true}).click()
    await p.waitForURL(base+'/team')
    const client=createClient(status.API_URL,status.ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false}})
    checked(await client.auth.signInWithPassword({email:team.pin+member.pin+'@count.local',password:pinPassword(team.pin,member.pin)}))
    return {p,client,context}
  }
  const saveArgs=(team,brand=codes[0],units=7,revision=null)=>({
    p_team:team,p_command:randomUUID(),p_brand:brand,p_revision:revision,
    p_pallets:0,p_cases:0,p_units:units,p_weight:false,p_bpu:10,p_pallet_size:5,p_weight_avg:100,p_tare:300,
  })
  const weighing=grams=>({rounds:[{boxes:0,grams}],visualCases:0})
  const search=async(p,name)=>p.getByPlaceholder('Brand Code (e.g. 6323), Name or BIN (e.g. 40A02)').fill(name)
  try {
    for(const [index,team] of plan.entries()){
      stage='start and monitor '+index
      const stored=checked(await db.from('teams').select('id').eq('session_id',session.id).eq('team_name',team.name).single())
      await page.goto(base+'/team/'+stored.id)
      await page.getByRole('button',{name:'Start team counting',exact:true}).click()
      await page.getByText('Phase: counting',{exact:true}).waitFor()
      assert.equal((await login.rpc('read_team_count',{p_team:stored.id})).data.role,'admin')
      const first=await person(team,team.members[0])
      const second=await person(team,team.members[1])
      const independent=await person(team,team.members.find(m=>m.role==='independent'))
      for(const user of [first,second,independent]){
        await user.p.goto(base+'/team/'+stored.id)
        await user.p.getByText('Phase: counting',{exact:true}).waitFor()
      }
      assert.ok((await first.client.rpc('start_team_count',{p_team:stored.id,p_revision:0})).error)
      assert.ok((await independent.client.rpc('save_team_count',saveArgs(stored.id))).error)
      assert.ok((await login.rpc('save_team_count',saveArgs(stored.id))).error)
      assert.ok((await first.client.rpc('save_team_count',saveArgs(stored.id,codes[3]))).error)
      assert.ok((await first.client.rpc('read_team_count',{p_team:randomUUID()})).error)
      stage='Active/Inactive and warehouse search '+index
      await search(first.p,'Count')
      assert.equal(await first.p.getByRole('heading',{name:'Active',exact:true}).count(),1)
      assert.equal(await first.p.getByRole('heading',{name:'Inactive',exact:true}).count(),1)
      assert.equal(await first.p.getByRole('button').filter({hasText:codes[3]}).count(),0)
      await first.p.getByRole('button').filter({hasText:codes[0]}).click()
      const inputs=first.p.locator('input[type="number"]')
      await inputs.nth(0).fill('1');await inputs.nth(1).fill('2');await inputs.nth(2).fill('3')
      await first.p.getByRole('button',{name:'Confirm Count',exact:true}).click()
      await first.p.getByText('7 cases · 3 units',{exact:true}).waitFor()
      const row=independent.p.locator('tr[data-brand="'+codes[0]+'"]')
      await row.getByText('7+3',{exact:true}).waitFor()
      assert.equal(await row.locator('td').count(),index+4)
      assert.equal(await row.getByText('Not counted',{exact:true}).count(),index+1)
      const c1state=checked(await first.client.rpc('read_team_count',{p_team:stored.id}))
      const c2state=checked(await second.client.rpc('read_team_count',{p_team:stored.id}))
      assert.equal(c1state.records.length,1);assert.equal(c2state.records.length,0)
      assert.equal(checked(await second.client.from('team_count_records').select('*').eq('team_id',stored.id)).length,0)
      assert.equal(checked(await independent.client.from('team_count_records').select('*').eq('team_id',stored.id)).length,1)
      assert.ok((await first.client.from('team_count_records').update({units:99}).eq('team_id',stored.id)).error)
      stage='zero, stale revisions, retry and physical restrictions '+index
      const args=saveArgs(stored.id,codes[0],7,'0')
      const [a,b]=await Promise.all([first.client.rpc('save_team_count',args),first.client.rpc('save_team_count',args)])
      assert.ok(!a.error&&!b.error);assert.deepEqual(a.data,b.data)
      assert.equal(a.data.revision,'1')
      assert.ok((await first.client.rpc('save_team_count',{...args,p_command:randomUUID()})).error)
      assert.ok((await first.client.rpc('save_team_count',{...args,p_units:8})).error)
      const history=checked(await first.client.from('team_count_record_history').select('revision').eq('record_id',
        checked(await first.client.from('team_count_records').select('id').eq('team_id',stored.id).single()).id))
      assert.equal(history.length,1)
      const inactive={...saveArgs(stored.id,codes[1],0),p_pallet_size:0,p_weight_avg:0}
      checked(await first.client.rpc('save_team_count',inactive))
      assert.ok((await first.client.rpc('save_team_count',{...inactive,p_command:randomUUID(),p_revision:'0',p_pallets:1})).error)
      assert.ok((await first.client.rpc('save_team_count',{...inactive,p_command:randomUUID(),p_revision:'0',p_weight:true})).error)
      assert.ok((await first.client.rpc('save_team_count',{...saveArgs(stored.id),p_bpu:11,p_revision:'1'})).error)
      assert.ok((await first.client.rpc('save_team_count',{...saveArgs(stored.id),p_units:-1,p_revision:'1'})).error)
      const unit={...saveArgs(stored.id,codes[2]),p_bpu:1}
      assert.ok((await first.client.rpc('save_team_count',{...unit,p_cases:1})).error)
      assert.ok((await first.client.rpc('save_team_count',{...unit,p_pallets:1})).error)
      assert.ok((await first.client.rpc('save_team_count',{...unit,p_weight:true,p_units:12})).error,'weight needs the weighing')
      assert.ok((await first.client.rpc('save_team_count',{...unit,p_weight:true,p_units:13,p_weighing:weighing(1200)})).error,'weighing must match')
      checked(await first.client.rpc('save_team_count',{...unit,p_weight:true,p_units:12,p_weighing:weighing(1200)}))
      assert.equal(checked(await first.client.rpc('read_team_count',{p_team:stored.id})).records.find(r=>r.brandCode===codes[2]).method,'weight')
      stage='weight form and zero in monitor '+index
      await search(second.p,'Count Unit')
      await second.p.getByRole('button').filter({hasText:codes[2]}).click()
      assert.equal(await second.p.locator('input[type="number"]:disabled').count(),2)
      await second.p.getByRole('button',{name:'Count by Weight'}).click()
      assert.equal(await second.p.getByText('Full Cases (visually confirmed)').count(),0)
      await second.p.locator('input[type="number"]').fill('1')
      await second.p.locator('input[type="text"]').fill('1300')
      await second.p.getByRole('button',{name:'Confirm Count',exact:true}).click()
      await second.p.getByText('10 cases · 0 units',{exact:true}).waitFor()
      await independent.p.locator('tr[data-brand="'+codes[1]+'"]').getByText('0+0',{exact:true}).waitFor()
      assert.equal(await independent.p.getByRole('button',{name:/Confirm Count|Save Edit/}).count(),0)
      stage='lost successful response '+index
      await first.p.reload()
      await first.p.getByText('Phase: counting',{exact:true}).waitFor()
      await search(first.p,'Count Active')
      await first.p.getByRole('button').filter({hasText:codes[0]}).click()
      await first.p.getByRole('button',{name:/Edit Count/}).click()
      await first.p.locator('input[type="number"]').nth(2).fill('9')
      let lost=false
      await first.p.route('**/team/*',async route=>{
        if(!lost && route.request().method()==='POST'&&route.request().headers()['next-action']&&route.request().postData()?.includes(codes[0])){
          lost=true;await route.fetch();await route.abort('failed')
        }else await route.continue()
      })
      await first.p.getByRole('button',{name:'Save Edit',exact:true}).click()
      await first.p.getByText('Response unavailable. Retry the same count to confirm it safely.').waitFor()
      await first.p.unroute('**/team/*')
      await first.p.getByRole('button',{name:'Save Edit',exact:true}).click()
      await first.p.getByText('0 cases · 9 units',{exact:true}).waitFor()
      assert.equal(checked(await first.client.rpc('read_team_count',{p_team:stored.id})).records.find(r=>r.brandCode===codes[0]).revision,'2')
      if(index===0){
        stage='reconnection and failed read'
        stage='reconnection: offline'
        await independent.context.setOffline(true)
        stage='reconnection: count while monitor offline'
        checked(await first.client.rpc('save_team_count',{...saveArgs(stored.id),p_revision:'2',p_units:14}))
        stage='reconnection: online'
        await independent.context.setOffline(false)
        stage='reconnection: dispatch online'
        await independent.p.evaluate(()=>window.dispatchEvent(new Event('online')))
        stage='reconnection: authoritative recovered row'
        await row.getByText('1+4',{exact:true}).waitFor()
        stage='reconnection: failed refresh'
        let blocked=false
        await independent.p.route('**/team/*',async route=>{
          if(route.request().method()==='POST'){blocked=true;await route.abort('failed')}
          else await route.continue()
        })
        await independent.p.getByRole('button',{name:'Refresh team',exact:true}).click()
        for(let i=0;i<50&&!blocked;i++)await delay(100)
        assert.ok(blocked)
        await independent.p.getByRole('alert').filter({hasText:'Connection or access unavailable'}).waitFor()
        await independent.p.locator('tr[data-brand]').first().waitFor({state:'hidden'})
        assert.equal(await independent.p.locator('tr[data-brand]').count(),0)
        stage='reconnection: restore refresh'
        await independent.p.unroute('**/team/*')
        await independent.p.getByRole('button',{name:'Refresh team',exact:true}).click()
        await row.getByText('1+4',{exact:true}).waitFor()
        stage='weight counts inside tolerance (block 6 fixture through authorized RPC)'
        checked(await first.client.rpc('save_team_count',{...unit,p_command:randomUUID(),p_weight:true,p_units:50,p_revision:'0',p_weighing:weighing(5000)}))
        checked(await second.client.rpc('save_team_count',{...unit,p_command:randomUUID(),p_weight:true,p_units:49,p_revision:'0',p_weighing:weighing(4900)}))
        stage='finish request through the screen (block 5)'
        const current=checked(await first.client.rpc('read_team_count',{p_team:stored.id}))
        const requestFinish=async()=>{
          first.p.once('dialog',dialog=>dialog.accept())
          await first.p.getByRole('button',{name:'Finish my count',exact:true}).click()
          await first.p.getByText('Your count status: Waiting for the Independent',{exact:true}).waitFor()
        }
        const counterRow=independent.p.locator('[data-member="'+current.members.find(m=>m.id===current.membershipId).order+'"]')
        await requestFinish()
        assert.ok((await first.client.rpc('save_team_count',{...saveArgs(stored.id),p_revision:'3'})).error)
        assert.equal(await first.p.getByRole('button',{name:'Finish my count',exact:true}).count(),0)
        stage='independent rejects, counter counts again'
        await counterRow.getByRole('button',{name:'Reject',exact:true}).click()
        await first.p.getByText('Your count status: Counting',{exact:true}).waitFor()
        stage='second request and acceptance'
        await requestFinish()
        assert.equal(await page.getByRole('button',{name:/^(Accept|Reject)$/}).count(),0)
        await counterRow.getByRole('button',{name:'Accept',exact:true}).click()
        await first.p.getByText('Your count status: Accepted',{exact:true}).waitFor()
        await counterRow.getByText(/Accepted$/).waitFor()
        assert.equal(checked(await first.client.rpc('read_team_count',{p_team:stored.id})).phase,'counting')
        assert.ok((await first.client.rpc('save_team_count',{...saveArgs(stored.id),p_revision:'3'})).error)
        stage='finish lock and retained blind history'
        await search(first.p,'Count Active')
        await first.p.getByRole('button').filter({hasText:codes[0]}).click()
        assert.equal(await first.p.getByRole('button',{name:/Confirm Count|Save Edit/}).count(),0)
        stage='comparison after every finish is accepted (block 6)'
        const secondState=checked(await second.client.rpc('read_team_count',{p_team:stored.id}))
        checked(await second.client.rpc('request_team_finish',{p_team:stored.id,p_membership:secondState.membershipId,
          p_expected_revision:secondState.revision,p_command:randomUUID()}))
        const monitorState=checked(await independent.client.rpc('read_team_count',{p_team:stored.id}))
        checked(await independent.client.rpc('decide_team_finish',{p_team:stored.id,p_membership:secondState.membershipId,
          p_accept:true,p_expected_revision:monitorState.revision,p_command:randomUUID()}))
        await independent.p.getByText('Phase: reconciling',{exact:true}).waitFor()
        const weightRow=independent.p.locator('tr[data-brand="'+codes[2]+'"]')
        await weightRow.getByText('Within weight tolerance').waitFor()
        await independent.p.locator('tr[data-brand="'+codes[0]+'"][data-result="Needs reconciliation"]').waitFor()
        assert.ok((await second.client.rpc('read_team_comparison',{p_team:stored.id})).error,'counters stay blind after finishing')
        assert.equal(await page.getByRole('button',{name:/^Use /}).count(),0,'admin never chooses a value')
        await weightRow.getByRole('button',{name:'Use 49+0',exact:true}).click()
        await independent.p.locator('tr[data-brand="'+codes[2]+'"][data-result="Using 49+0"]').waitFor()
        assert.equal(await weightRow.getByRole('button').count(),0)
        assert.equal(checked(await db.from('team_count_records').select('weighing').eq('team_id',stored.id).eq('brand_code',codes[2])
          .eq('units',49).single()).weighing.grossG,4900,'raw weighing stored')
        stage='reconciliation through the screen (block 7)'
        const submitButton=independent.p.getByRole('button',{name:'Submit to admin',exact:true})
        assert.ok(await submitButton.isDisabled(),'submission blocked while items are pending')
        assert.equal(await page.getByRole('button',{name:/Enter reconciled count|Submit to admin/}).count(),0,'admin never reconciles')
        await independent.p.locator('tr[data-brand="'+codes[0]+'"]').getByRole('button',{name:'Enter reconciled count',exact:true}).click()
        await independent.p.getByText('Original counts',{exact:true}).waitFor()
        await independent.p.getByText('1+4',{exact:true}).waitFor()
        const reconcileInputs=independent.p.locator('input[type="number"]')
        await reconcileInputs.nth(1).fill('1');await reconcileInputs.nth(2).fill('5')
        await independent.p.getByRole('button',{name:'Confirm Count',exact:true}).click()
        await independent.p.locator('tr[data-brand="'+codes[0]+'"][data-result="Reconciled 1+5"]').waitFor()
        assert.ok(await submitButton.isDisabled(),'one item still pending')
        const reviewState=checked(await independent.client.rpc('read_team_count',{p_team:stored.id}))
        assert.ok((await second.client.rpc('save_team_reconciliation',{p_team:stored.id,p_command:randomUUID(),p_brand:codes[1],
          p_expected_revision:reviewState.revision,p_pallets:0,p_cases:0,p_units:0,p_weight:false,p_bpu:10,p_pallet_size:0,
          p_weight_avg:0,p_tare:300})).error,'counter cannot reconcile')
        checked(await independent.client.rpc('save_team_reconciliation',{p_team:stored.id,p_command:randomUUID(),p_brand:codes[1],
          p_expected_revision:reviewState.revision,p_pallets:0,p_cases:0,p_units:0,p_weight:false,p_bpu:10,p_pallet_size:0,
          p_weight_avg:0,p_tare:300}))
        await independent.p.locator('tr[data-brand="'+codes[1]+'"][data-result="Reconciled 0+0"]').waitFor()
        stage='submission to the admin (block 7)'
        independent.p.once('dialog',dialog=>dialog.accept())
        await submitButton.click()
        await independent.p.getByText('Phase: admin_review',{exact:true}).waitFor()
        await page.getByText('Phase: admin_review',{exact:true}).waitFor()
        const result=checked(await db.from('team_result_items').select('brand_code,quantity_units,resolution').eq('team_id',stored.id))
        assert.deepEqual(Object.fromEntries(result.map(r=>[r.brand_code,r.quantity_units+':'+r.resolution])),
          {[codes[0]]:'15:reconciled',[codes[1]]:'0:reconciled',[codes[2]]:'49:weight_tolerance'})
        assert.equal(await independent.p.getByRole('button',{name:/Enter reconciled count|Edit reconciled count|Submit to admin/}).count(),0)
        stage='admin review: selective recount round (block 8)'
        assert.equal(await independent.p.getByRole('button',{name:/Accept result|selected for recount/}).count(),0,'only the admin reviews')
        const returnButton=page.getByRole('button',{name:/selected for recount$/})
        assert.ok(await returnButton.isDisabled(),'return needs a selection')
        await page.getByRole('checkbox',{name:'Recount '+codes[1],exact:true}).check()
        page.once('dialog',dialog=>dialog.accept())
        await returnButton.click()
        await independent.p.getByText('Phase: reconciling',{exact:true}).waitFor()
        await independent.p.locator('tr[data-brand="'+codes[1]+'"][data-result="Recount requested"]').waitFor()
        await independent.p.locator('tr[data-brand="'+codes[0]+'"][data-result="Reconciled 1+5"]').waitFor()
        assert.equal(await independent.p.locator('tr[data-brand="'+codes[0]+'"]').getByRole('button').count(),0,'products not returned stay closed')
        assert.ok(await submitButton.isDisabled(),'recount pending')
        await independent.p.locator('tr[data-brand="'+codes[1]+'"]').getByRole('button',{name:'Enter reconciled count',exact:true}).click()
        await independent.p.getByText('Original counts',{exact:true}).waitFor()
        await reconcileInputs.nth(2).fill('3')
        await independent.p.getByRole('button',{name:'Confirm Count',exact:true}).click()
        await independent.p.locator('tr[data-brand="'+codes[1]+'"][data-result="Recounted 0+3"]').waitFor()
        independent.p.once('dialog',dialog=>dialog.accept())
        await submitButton.click()
        await page.getByText('Phase: admin_review',{exact:true}).waitFor()
        await page.getByText(/Round 1: returned /).waitFor()
        stage='admin acceptance (block 8)'
        page.once('dialog',dialog=>dialog.accept())
        await page.getByRole('button',{name:'Accept result',exact:true}).click()
        await independent.p.getByText('Phase: signing',{exact:true}).waitFor()
        const accepted=checked(await db.from('team_flows').select('result_version_id').eq('team_id',stored.id).single())
        const sealed=checked(await db.from('team_result_items').select('brand_code,quantity_units,resolution').eq('version_id',accepted.result_version_id))
        assert.deepEqual(Object.fromEntries(sealed.map(r=>[r.brand_code,r.quantity_units+':'+r.resolution])),
          {[codes[0]]:'15:reconciled',[codes[1]]:'3:reconciled',[codes[2]]:'49:weight_tolerance'})
        // Privileged fixture only for selective revocation, not a completed close.
        sql("update public.team_memberships set access_revoked_at=clock_timestamp() where id='"+current.membershipId+"'")
        assert.ok((await first.client.rpc('read_team_count',{p_team:stored.id})).error)
        assert.ok((await first.client.rpc('save_team_count',{...args})).error)
        assert.equal(checked(await first.client.from('team_count_records').select('*').eq('team_id',stored.id)).length,0)
      }
      console.log('PASS: new '+(index+3)+'-person team UI/Auth, blind counts, WHS, inactive/zero, weight, receipts/history, dynamic Realtime monitor')
      for(const context of contexts)await context.close()
      contexts=[]
    }
  }catch(error){
    const numeric = typeof error?.actual === 'number' || typeof error?.actual === 'boolean'
      ? ' (actual='+error.actual+', expected='+error.expected+')' : ''
    const detail = error?.message?.startsWith('Team count browser verification failed at stage: fixture') ? ' '+error.message : ''
    throw new Error('Team count browser verification failed at stage: '+stage+numeric+' ['+error?.name+']'+detail)
  }finally{for(const context of contexts)await context.close()}
}
