// Executes project UI functions against inert DOM sinks; no browser or network.
const fs=require('node:fs'), vm=require('node:vm'), assert=require('node:assert/strict'), path=require('node:path');
const elements=new Map();let calls=[];const alerts=[];
const element=id=>{if(!elements.has(id))elements.set(id,{style:{},classList:{add(){},remove(){}},value:'',innerHTML:'',innerText:''});return elements.get(id);};
const context=vm.createContext({document:{getElementById:element,querySelectorAll:()=>[]},window:{addEventListener(){}},console,alert:s=>alerts.push(s),confirm:()=>false,location:{reload(){}},fetch:async url=>{calls.push(url);return {ok:true,json:async()=>url.includes('users/me')?{}:url.includes('jobs')?{jobs:[]}:{applications:[]}}}});
vm.runInContext(fs.readFileSync(path.join(__dirname,'../app.js'),'utf8'),context);
(async()=>{const results=[];
 vm.runInContext('state.user.name = `<img src=x onerror="void(0)">`; renderProfile();',context);assert.ok(element('profile-content').innerHTML.includes('<img src=x onerror="void(0)">'));results.push('Profile name is inserted as raw HTML into innerHTML (no browser payload executed).');
 const original=vm.runInContext('({jobs:state.jobs.length,apps:state.applications.length})',context);await vm.runInContext('syncFromBackend()',context);assert.equal(vm.runInContext('state.jobs.length',context),original.jobs);assert.equal(vm.runInContext('state.applications.length',context),original.apps);results.push('Empty successful API responses retain seeded jobs and applications.');
 assert.ok(!calls.includes('/api/v1/subscriptions/current'));results.push('Startup hydration never requests current subscription.');
 calls=[];vm.runInContext('toggleAutoPilot()',context);assert.equal(calls.length,0);results.push('Auto-pilot toggle issues no backend request.');
 calls=[];vm.runInContext('approveDiff(state.applications[0].id)',context);assert.equal(calls.length,0);results.push('Approve & Dispatch only changes in-memory resume status; no backend request.');
 context.fetch=async()=>{throw Error('Simulated offline');};await vm.runInContext('saveCandidateProfile()',context);assert.ok(alerts.at(-1).includes('synchronized successfully'));results.push('Profile save displays success after network failure.');
 console.log(JSON.stringify({scope:'UI functions with inert DOM sinks and stubbed fetch',passed:results.length,results},null,2));
})().catch(e=>{console.error(e);process.exitCode=1;});
