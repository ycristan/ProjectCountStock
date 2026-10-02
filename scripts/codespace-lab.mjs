// Remote-only laboratory. Never accepts a hosted Supabase URL or production secrets.
import assert from 'node:assert/strict'
import { execFileSync, spawn } from 'node:child_process'
import { chmodSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve, dirname } from 'node:path'
import { createRequire } from 'node:module'
import { randomUUID } from 'node:crypto'
import { createServer, request } from 'node:http'
import { setTimeout as delay } from 'node:timers/promises'
import { pathToFileURL } from 'node:url'

// Only local startup stderr is reported; redact secrets/URLs and never print stdout keys.
export function labFailure(stage,error) {
  const detail=stage==='local Supabase startup' ? String(error?.stderr || '')
    .replace(/\x1b\[[0-?]*[ -/]*[@-~]/g,'')
    .replace(/-----BEGIN[\s\S]*?-----END[^-]*-----/g,'[redacted]')
    .replace(/\b(?:postgres(?:ql)?|https?|wss?):\/\/[^\s"'<>]+/gi,'[url]')
    .replace(/\b([\w-]*(?:password|secret|token|authorization|api[_ -]?key|service[_ -]?role|anon[_ -]?key|pin)[\w-]*)["']?\s*[:=]\s*(?:"[^"]*"|'[^']*'|[^\s,;]+)/gi,'$1=[redacted]')
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,'[email]')
    .replace(/[A-Za-z0-9_+/=-]{20,}/g,'[redacted]')
    .trim().slice(-12000).split('\n').slice(-60).join('\n') : ''
  return 'Laboratory setup failed at: '+stage+' (exit '+(Number.isInteger(error?.status)?error.status:'unavailable')+'). No production operation was attempted.'+(detail ? '\nSupabase startup diagnostic:\n'+detail : '')
}

export async function startLab({check=false,diagnose=false}={}) {
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
    assert.equal(dirname(resolve(work)),resolve(tmpdir()))
    assert.ok(work.startsWith(join(tmpdir(),'count-stock-lab-')))
    rmSync(work,{recursive:true,force:true}) // Only this launcher-created remote snapshot; DB volumes are retained.
  }
  try {
    if(diagnose){
      stage='diagnostic preflight'
      console.log('DIAG: Node '+process.versions.node+'; platform '+process.platform)
      console.log(run('docker',['version','--format','Docker client={{.Client.Version}} server={{.Server.Version}}']))
      console.log(run('free',['-h']))
      console.log(run('df',['-h',tmpdir()]))
    }else{
      console.log('LAB: preparing isolated dependencies (first start can take several minutes)')
      run('npm',['ci','--ignore-scripts'])
    }
    try {assert.equal(run('supabase',['--version']).trim(),'2.117.0');cli={bin:'supabase',prefix:[]}}
    catch {cli={bin:'npm',prefix:['exec','--yes','--package=supabase@2.117.0','--','supabase']};run(cli.bin,[...cli.prefix,'--version'])}
    const supa=args=>run(cli.bin,[...cli.prefix,...args])
    stage='local database configuration'
    console.log('LAB: initializing local database configuration')
    supa(['init','--help']);supa(['init'])
    const config=join(work,'supabase/config.toml')
    writeFileSync(config,readFileSync(config,'utf8').replace(/^project_id = .*$/m,'project_id = "count-stock-lab"'))
    stage='Docker connection'
    run('docker',['info'])
    stage='loopback Docker network'
    try {run('docker',['network','inspect','count-stock-lab-loopback'])}
    catch {run('docker',['network','create','-o','com.docker.network.bridge.host_binding_ipv4=127.0.0.1','count-stock-lab-loopback'])}
    stage='Supabase startup help'
    supa(['start','--help'])
    stage='local Supabase startup'
    console.log('LAB: starting local Supabase (first start downloads container images)')
    stopDatabase=true
    supa(['start','--network-id','count-stock-lab-loopback','--debug'])
    // Explicit local commands only; no link, db push, remote URL or db reset.
    stage='local migrations'
    console.log('LAB: applying local migrations')
    supa(['migration','up','--help']);supa(['migration','up','--local'])
    stage='local Supabase status'
    supa(['status','--help'])
    const status=JSON.parse(supa(['status','-o','json']))
    assert.equal(new URL(status.API_URL).origin,'http://127.0.0.1:54321')
    if(diagnose){
      stage='local API health'
      for(const route of ['/auth/v1/health','/rest/v1/']){
        const response=await fetch(status.API_URL+route,{headers:{apikey:status.ANON_KEY},signal:AbortSignal.timeout(15000)})
        assert.ok(response.ok,'Local API unavailable: '+route)
      }
      console.log('DIAG: Docker, local startup, versioned migrations and Auth/REST health passed')
      return {close}
    }
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
    delete env.GITHUB_TOKEN;delete env.GH_TOKEN
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
        const headers={...response.headers}
        if(headers.location?.startsWith('http://127.0.0.1:3000/'))headers.location=(req.headers['x-forwarded-proto']==='https'?'https':'http')+'://'+req.headers.host+headers.location.slice('http://127.0.0.1:3000'.length)
        res.writeHead(response.statusCode,headers);response.pipe(res)
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
  } catch(error) {
    await close()
    throw new Error(labFailure(stage,error))
  }
}
if(process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  try{
    const diagnose=process.argv.includes('--diagnose')
    const lab=await startLab({diagnose})
    if(diagnose){
      await lab.close()
      console.log('DIAGNOSIS COMPLETE: no app accounts or counts created; test data preserved')
    }else{
    let closing=false
    const stop=async()=>{if(closing)return;closing=true;await lab.close();process.exit(0)}
    process.on('SIGINT',stop);process.on('SIGTERM',stop)
    }
  }catch(e){console.error(e.message);process.exitCode=1}
}
