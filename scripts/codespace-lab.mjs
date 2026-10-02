// Remote-only laboratory. Never accepts a hosted Supabase URL or production secrets.
import assert from 'node:assert/strict'
import { execFileSync, spawn } from 'node:child_process'
import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { createRequire } from 'node:module'
import { randomUUID } from 'node:crypto'
import { createServer, request } from 'node:http'
import { setTimeout as delay } from 'node:timers/promises'
import { pathToFileURL } from 'node:url'

export async function startLab({check=false}={}) {
  assert.ok(process.env.CODESPACES === 'true' || (check && process.env.GITHUB_ACTIONS === 'true'), 'Use the Codespace terminal, not Windows')
  assert.ok(Number(process.versions.node.split('.')[0]) >= 20, 'Node 20 or newer required')
  const root=execFileSync('git',['rev-parse','--show-toplevel'],{encoding:'utf8'}).trim()
  const work=mkdtempSync(join(tmpdir(),'count-stock-lab-'))
  // A tracked snapshot preserves dirty Codespace files and excludes .env and credentials.
  const archive=execFileSync('git',['archive','HEAD'],{cwd:root,maxBuffer:32*1024*1024})
  execFileSync('tar',['-x','-C',work],{input:archive})
  const cleanEnv=Object.fromEntries(Object.entries(process.env).filter(([k])=>!(/SUPABASE|SENTRY|EMAILJS|VERCEL|^NEXT_PUBLIC_|^PG|^DATABASE_URL$/.test(k))))
  cleanEnv.NEXT_TELEMETRY_DISABLED='1'
  const run=(bin,args,cwd=work)=>execFileSync(bin,args,{cwd,env:cleanEnv,encoding:'utf8',stdio:['ignore','pipe','pipe'],maxBuffer:16*1024*1024,timeout:600000})
  let stage='dependencies', app, gateway, stopDatabase=false, cli
  const sockets=new Set()
  const close=async()=>{
    for(const socket of sockets)socket.destroy()
    if(gateway){gateway.closeAllConnections();await new Promise(r=>gateway.close(r))}
    if(app){app.kill('SIGTERM');app.stdout.destroy();app.stderr.destroy()}
    if(stopDatabase && cli)try{run(cli.bin,[...cli.prefix,'stop'])}catch{}
  }
  try {
    console.log('LAB: preparing isolated dependencies (first start can take several minutes)')
    run('npm',['ci','--ignore-scripts'])
    try {assert.equal(run('supabase',['--version']).trim(),'2.117.0');cli={bin:'supabase',prefix:[]}}
    catch {cli={bin:'npm',prefix:['exec','--yes','--package=supabase@2.117.0','--','supabase']};run(cli.bin,[...cli.prefix,'--version'])}
    const supa=args=>run(cli.bin,[...cli.prefix,...args])
    stage='local database'
    supa(['init','--help']);supa(['init'])
    const config=join(work,'supabase/config.toml')
    writeFileSync(config,check ? readFileSync(join(root,'supabase/config.toml'),'utf8') : readFileSync(config,'utf8').replace(/^project_id = .*$/m,'project_id = "count-stock-lab"'))
    if(check) {
      // CI already runs its disposable stack. Do not start or stop an unrelated stack.
      cli={bin:'supabase',prefix:[]}
    } else {
      run('docker',['info'])
      try {run('docker',['network','inspect','count-stock-lab-loopback'])}
      catch {run('docker',['network','create','-o','com.docker.network.bridge.host_binding_ipv4=127.0.0.1','count-stock-lab-loopback'])}
      supa(['start','--help'])
      stopDatabase=true
      supa(['start','--network-id','count-stock-lab-loopback'])
    }
    // Explicit local commands only; no link, db push, remote URL or db reset.
    supa(['migration','up','--help']);supa(['migration','up','--local'])
    supa(['status','--help'])
    const status=JSON.parse(supa(['status','-o','json']))
    assert.equal(new URL(status.API_URL).origin,'http://127.0.0.1:54321')
    const require=createRequire(join(work,'package.json'))
    const {createClient}=require('@supabase/supabase-js')
    const db=createClient(status.API_URL,status.SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}})
    const checked=r=>{if(r.error)throw new Error('Local fixture failed');return r.data}
    stage='synthetic fixtures'
    const admins=[]
    for(let i=0;i<2;i++){
      const email='lab-'+randomUUID()+'@example.invalid',password=randomUUID()+'aA!9'
      const user=checked(await db.auth.admin.createUser({email,password,email_confirm:true})).user
      checked(await db.from('app_user_access').insert({user_id:user.id,access_kind:'admin'}))
      admins.push({email,password})
    }
    const warehouses=[]
    for(const name of ['LAB Main Warehouse','LAB Service Warehouse']){
      let wh=checked(await db.from('warehouses').select('id,name').eq('name',name).maybeSingle())
      if(!wh)wh=checked(await db.from('warehouses').insert({name}).select('id,name').single())
      warehouses.push(wh)
    }
    const products=[
      {brand_code:'LAB-100',brand_name:'LAB Kinder Active',brand_active:true,bpu:24,pallet_size:40,weight_avg:50},
      {brand_code:'LAB-101',brand_name:'LAB Kinder Inactive',brand_active:false,bpu:24,pallet_size:0,weight_avg:0},
      {brand_code:'LAB-102',brand_name:'LAB Single Unit',brand_active:true,bpu:1,pallet_size:0,weight_avg:50},
      {brand_code:'LAB-200',brand_name:'LAB Service Only',brand_active:true,bpu:12,pallet_size:0,weight_avg:0}
    ]
    for(const p of products){
      if(checked(await db.from('inventory_items').select('brand_code').eq('brand_code',p.brand_code)).length)continue
      checked(await db.from('inventory_items').insert({...p,category:'LAB',category1:'LAB',warehouse_id:warehouses[p.brand_code==='LAB-200'?1:0].id}))
      checked(await db.from('item_bin_locations').insert({brand_code:p.brand_code,bin_location:'40B'}))
    }
    stage='temporary application connections'
    // ponytail: four guarded text edits in the snapshot, never a production mode/framework.
    for(const file of ['lib/supabase-server.ts','actions/auth.ts','proxy.ts']){
      const path=join(work,file),src=readFileSync(path,'utf8'),anchor='      cookies: {'
      assert.equal(src.split(anchor).length,2,'Server cookie anchor changed: '+file)
      writeFileSync(path,src.replace(anchor,"      cookieOptions: { name: 'sb-count-stock-lab-auth-token' },\n"+anchor))
    }
    const clientPath=join(work,'lib/supabase-client.ts'),client=readFileSync(clientPath,'utf8')
    assert.equal(client.split('process.env.NEXT_PUBLIC_SUPABASE_URL!').length,2)
    writeFileSync(clientPath,client.replace('process.env.NEXT_PUBLIC_SUPABASE_URL!',"typeof window === 'undefined' ? process.env.NEXT_PUBLIC_SUPABASE_URL! : window.location.origin + '/__supabase'").replace('process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,',"process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,\n    { cookieOptions: { name: 'sb-count-stock-lab-auth-token' } },"))
    const env={...cleanEnv,NEXT_PUBLIC_SUPABASE_URL:status.API_URL,NEXT_PUBLIC_SUPABASE_ANON_KEY:status.ANON_KEY,
      SUPABASE_SERVICE_ROLE_KEY:status.SERVICE_ROLE_KEY,TEAM_SETUP_ENABLED:'true',VERCEL_ENV:'development'}
    stage='application build'
    console.log('LAB: building tracked application; production configuration is untouched')
    execFileSync('npm',['run','build'],{cwd:work,env,stdio:['ignore','pipe','pipe'],maxBuffer:16*1024*1024,timeout:300000})
    app=spawn(process.execPath,['node_modules/next/dist/bin/next','start','-H','127.0.0.1','-p','3000'],{cwd:work,env,stdio:['ignore','pipe','pipe']})
    app.stdout.resume();app.stderr.resume()
    for(let i=0;i<90;i++){
      try {if((await fetch('http://127.0.0.1:3000/login')).ok)break}catch{}
      if(i===89)throw new Error('Application did not start')
      await delay(1000)
    }
    stage='private browser gateway'
    const target=req=>{
      assert.ok(req.url?.startsWith('/') && !req.url.startsWith('//'))
      const api=req.url.startsWith('/__supabase/')
      if(api)assert.match(req.url,/^\/__supabase\/(auth|rest|realtime|storage)\/v1\//)
      const headers={...req.headers}
      if(api){delete headers.cookie;headers.host='127.0.0.1:54321'}
      return {hostname:'127.0.0.1',port:api?54321:3000,path:api?req.url.slice('/__supabase'.length):req.url,method:req.method,headers}
    }
    gateway=createServer((req,res)=>{
      let opts
      try{opts=target(req)}catch{res.writeHead(400);res.end('Invalid laboratory route');return}
      const upstream=request(opts,response=>{
        res.writeHead(response.statusCode,response.headers);response.pipe(res)
      })
      upstream.on('error',()=>{if(!res.headersSent)res.writeHead(502);res.end('Laboratory upstream unavailable')})
      req.on('aborted',()=>upstream.destroy());req.pipe(upstream)
    })
    gateway.on('connection',socket=>{sockets.add(socket);socket.on('close',()=>sockets.delete(socket))})
    gateway.on('upgrade',(req,socket,head)=>{
      let opts
      try{opts=target(req)}catch{socket.destroy();return}
      const upstream=request(opts)
      upstream.on('upgrade',(response,peer,upstreamHead)=>{
        sockets.add(peer);peer.on('close',()=>sockets.delete(peer))
        socket.write('HTTP/1.1 '+response.statusCode+' Switching Protocols\r\n'+Object.entries(response.headers).map(([k,v])=>k+': '+v).join('\r\n')+'\r\n\r\n')
        if(head.length)peer.write(head)
        if(upstreamHead.length)socket.write(upstreamHead)
        socket.pipe(peer);peer.pipe(socket)
        socket.on('error',()=>peer.destroy());peer.on('error',()=>socket.destroy())
      })
      upstream.on('response',()=>{socket.destroy();upstream.destroy()})
      upstream.on('error',()=>socket.destroy());upstream.end()
    })
    await new Promise((done,fail)=>{gateway.once('error',fail);gateway.listen(3100,'127.0.0.1',done)})
    if(!check){
      stage='private port'
      assert.match(process.env.CODESPACE_NAME || '',/^[a-z0-9-]+$/)
      run('gh',['codespace','ports','visibility','--help'])
      run('gh',['codespace','ports','visibility','3100:private','-c',process.env.CODESPACE_NAME],root)
      const access=join(root,'.count-stock-lab-access.json')
      writeFileSync(access,JSON.stringify({warning:'SYNTHETIC LAB ONLY. Do not share this file.',admins},null,2),{mode:0o600})
      chmodSync(access,0o600)
      try{run('code',['--reuse-window',access],root)}catch{}
      console.log('LAB READY: http://localhost:3100/login')
      console.log('Open .count-stock-lab-access.json in this Codespace for the two synthetic admin accounts.')
      console.log('Only port 3100 is needed. Keep it Private. Ctrl+C stops the application and local services, preserving test data.')
    }
    return {close,db,status,admins,warehouses,work,base:'http://127.0.0.1:3100'}
  } catch {
    await close()
    throw new Error('Laboratory setup failed at: '+stage+'. No production operation was attempted.')
  }
}
if(process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  try{
    const lab=await startLab()
    let closing=false
    const stop=async()=>{if(closing)return;closing=true;await lab.close();process.exit(0)}
    process.on('SIGINT',stop);process.on('SIGTERM',stop)
  }catch(e){console.error(e.message);process.exitCode=1}
}
