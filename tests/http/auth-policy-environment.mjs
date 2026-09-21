// Disposable GitHub runner only. CLI currently bundles Auth v2.196.0,
// which predates the password-policy fix in upstream Auth commit a1511d2.
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import http from 'node:http'
assert.equal(process.env.GITHUB_ACTIONS,'true')
const ids=execFileSync('docker',['ps','--filter','name=supabase_auth_','--format','{{.ID}}'],{encoding:'utf8'}).trim().split(/\s+/)
assert.equal(ids.length,1)
const original=JSON.parse(execFileSync('docker',['inspect',ids[0]],{encoding:'utf8'}))[0]
assert.match(original.Name,/^\/supabase_auth_/)
assert.match(original.HostConfig.NetworkMode,/^supabase_network_/)
const image='ghcr.io/supabase/gotrue:v2.197.0'
execFileSync('docker',['pull',image],{stdio:'pipe'})
async function docker(path,body){
 return await new Promise((resolve,reject)=>{
  const request=http.request({socketPath:'/var/run/docker.sock',path,method:'POST',headers:{'Content-Type':'application/json'}},response=>{
   let data='';response.on('data',part=>data+=part)
   response.on('end',()=>response.statusCode<300?resolve(data):reject(new Error('Disposable Auth replacement failed: HTTP '+response.statusCode)))
  })
  request.on('error',reject);request.end(JSON.stringify(body))
 })
}
execFileSync('docker',['stop',ids[0]],{stdio:'pipe'})
execFileSync('docker',['rm',ids[0]],{stdio:'pipe'})
const body={
 Image:image,Env:original.Config.Env,Labels:original.Config.Labels,
 ExposedPorts:original.Config.ExposedPorts,Healthcheck:original.Config.Healthcheck,
 HostConfig:original.HostConfig,
 NetworkingConfig:{EndpointsConfig:{[original.HostConfig.NetworkMode]:{
  Aliases:[original.Name.slice(1)]
 }}}
}
const created=JSON.parse(await docker('/containers/create?name='+encodeURIComponent(original.Name.slice(1)),body))
await docker('/containers/'+created.Id+'/start')
let ready=false
for(let attempt=0;attempt<60;attempt++){
 const current=JSON.parse(execFileSync('docker',['inspect',created.Id],{encoding:'utf8'}))[0]
 if(current.State.Health?.Status==='healthy'){ready=true;break}
 if(current.State.Status==='exited')throw new Error('Disposable Auth exited')
 await new Promise(resolve=>setTimeout(resolve,1000))
}
assert.ok(ready,'Disposable Auth must become healthy')
console.log('PASS: disposable Auth v2.197.0 started with upstream admin password policy enforcement')
