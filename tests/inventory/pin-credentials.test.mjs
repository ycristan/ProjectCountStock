import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash, randomInt } from 'node:crypto'
import { loadSource } from './source-fixture.mjs'
const helper = await loadSource('lib/pin-credentials.ts', {'node:crypto':{createHash,randomInt}})
test('PIN encoding preserves leading zeros and depends on both PINs',()=>{
 const encoded=helper.pinPassword('0123','0456')
 assert.equal(encoded.length,64)
 assert.match(encoded,/[a-z]/); assert.match(encoded,/[A-Z]/)
 assert.match(encoded,/[0-9]/); assert.match(encoded,/[^a-zA-Z0-9]/)
 assert.notEqual(encoded,helper.pinPassword('1123','0456'))
 assert.notEqual(encoded,helper.pinPassword('0123','1456'))
 assert.equal(encoded,helper.pinPassword('0123','0456'))
 for(const value of ['123','12345','abcd',' 1234']) assert.throws(()=>helper.pinPassword(value,'0456'))
})
test('generated PINs are four digits and unique within the exclusion set',()=>{
 const excluded=new Set()
 for(let i=0;i<100;i++) assert.match(helper.generatePin(excluded),/^\d{4}$/)
 assert.equal(excluded.size,100)
})
async function fixture(responses){
 const calls=[]
 const auth=await loadSource('actions/auth.ts',{
 '@/lib/pin-credentials':helper,
 '@supabase/ssr':{createServerClient:()=>({auth:{signInWithPassword:async args=>{calls.push(args);return responses.shift()}}})},
 'next/headers':{cookies:async()=>({getAll:()=>[],set:()=>{}})},
 'next/navigation':{redirect:()=>{throw new Error('REDIRECT')}}
 },{process:{env:{}}})
 return {calls,auth}
}
test('legacy fallback occurs only on invalid credentials',async()=>{
 const {calls,auth}=await fixture([{error:{code:'invalid_credentials'}},{error:null}])
 await assert.rejects(auth.login(null,new Map([['team_pin','0123'],['user_pin','0456']])),/REDIRECT/)
 assert.equal(calls.length,2); assert.equal(calls[1].password,'0456')
})
for(const code of ['over_request_rate_limit','unexpected_failure']) test('no fallback on '+code,async()=>{
 const {calls,auth}=await fixture([{error:{code}}])
 assert.ok((await auth.login(null,new Map([['team_pin','0123'],['user_pin','0456']]))).error)
 assert.equal(calls.length,1)
})
test('administrator email/password login unchanged',async()=>{
 const {calls,auth}=await fixture([{error:null}])
 await assert.rejects(auth.login(null,new Map([['email',' Admin@example.invalid '],['password','synthetic-only']])) ,/REDIRECT/)
 assert.equal(calls.length,1); assert.equal(calls[0].email,'admin@example.invalid'); assert.equal(calls[0].password,'synthetic-only')
})
