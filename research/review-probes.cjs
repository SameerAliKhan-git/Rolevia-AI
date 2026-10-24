// Isolated review probes: no network, no real store writes, no submitted applications.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {EventEmitter} = require('node:events');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
let handler, persisted, served;
const seed = {user:{name:'Synthetic QA', email:'qa@example.invalid', skills:[], credits:0},metrics:{applied:0},autoPilot:{active:false},subscription:{appsUsed:1,appsLimit:1,invoices:[]},applications:[],inboxMessages:[],jobs:[{id:'qa-job',company:'QA',title:'Test',ats:'test',atsName:'Test',url:'https://example.invalid/job',requirements:[]}]};
const fakeFS = {readFileSync(p){return JSON.stringify(p.endsWith('store.json')?seed:[]);},writeFileSync(p,v){persisted=JSON.parse(v);},existsSync(){return false;},statSync(){throw Error('Unexpected stat');},stat(p,cb){served=p;cb(null,{isFile:()=>true});},createReadStream(){return {pipe(res){res.end('synthetic file');}};}};
const timers=[];
const context = vm.createContext({require(n){if(n==='node:http')return {createServer(fn){handler=fn;return {listen(){}};}};if(n==='node:fs')return fakeFS;return require(n);},__dirname:path.join(root,'backend'),process:{env:{}},console:{log(){},warn(){}},fetch(){throw Error('External requests disabled');},AbortSignal,setTimeout(fn){timers.push(fn);},setInterval(){}});
vm.runInContext(fs.readFileSync(path.join(root,'backend/server.js'),'utf8'),context);
async function request(url,method='GET',body){const req=new EventEmitter();Object.assign(req,{url,method,headers:{}});let text='';const res={headers:{},setHeader(k,v){this.headers[k]=v;},writeHead(code,headers){this.status=code;Object.assign(this.headers,headers);},write(s){text+=s;},end(s=''){text+=s;}};const pending=handler(req,res);if(body!==undefined)req.emit('data',typeof body==='string'?body:JSON.stringify(body));req.emit('end');await pending;let data;try{data=JSON.parse(text);}catch{}return {...res,text,data};}
(async()=>{
 const results=[];
 let r=await request('/api/v1/users/me');assert.equal(r.status,200);assert.equal(r.data.user.name,'Synthetic QA');results.push('Unauthenticated profile read returns 200.');
 r=await request('/api/v1/subscription/razorpay/verify-payment','POST',{});assert.equal(r.status,200);assert.equal(r.data.invoice.status,'Paid');assert.equal(r.data.user.credits,1500);results.push('Empty unsigned payment body creates Paid invoice and 1500 credits.');
 r=await request('/api/v1/subscription/razorpay/verify-payment','POST',{});assert.equal(r.data.user.credits,3000);results.push('Replaying unsigned verification grants another 1500 credits.');
 await request('/api/v1/users/profile','PUT',{credits:0,name:'<img src=x onerror="void(0)">'});assert.equal(persisted.user.credits,0);assert.ok(persisted.user.name.startsWith('<img'));results.push('Profile mass assignment accepts credits and unsanitized HTML.');
 vm.runInContext('db.subscription.appsLimit=db.subscription.appsUsed',context);
 const used=persisted.subscription.appsUsed;
 r=await request('/api/v1/cloud-executions/running','POST',{jobId:'does-not-exist'});assert.equal(r.status,201);assert.equal(r.data.application.status,'Submitted');assert.equal(r.data.application.company,'QA');assert.equal(persisted.user.credits,0);assert.equal(persisted.subscription.appsUsed,used+1);assert.ok(persisted.subscription.appsUsed>persisted.subscription.appsLimit);results.push('Invalid job ID selects first job and creates Submitted receipt at zero credits and exhausted quota, with no external call.');
 await request('/api/v1/auth/logout','POST',{});r=await request('/api/v1/users/me');assert.equal(r.status,200);results.push('Profile remains accessible after logout.');
 r=await request('/backend/database/store.json');assert.equal(r.status,200);assert.equal(served,path.join(root,'backend/database/store.json'));results.push('Static handler serves database file without authentication.');
 r=await request('/api/v1/resume/parse');assert.equal(r.data.success,true);assert.equal(r.data.atsReadinessScore,98);results.push('Resume parsing returns success and score 98 when resume file does not exist.');
 r=await request('/api/v1/candidate/skills','POST',{skill:123}).then(()=>null,e=>e);assert.ok(r instanceof Error || r?.message);results.push('Numeric skill produces uncaught request-handler TypeError.');
 console.log(JSON.stringify({scope:'in-process isolated handler; mocked filesystem/network/listen/timers',passed:results.length,results},null,2));
})().catch(e=>{console.error(e);process.exitCode=1;});
