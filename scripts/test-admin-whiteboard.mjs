import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
const org = '11111111-1111-1111-1111-111111111111';
const other = '22222222-2222-2222-2222-222222222222';
let member = true;
let signedIn = true;
const rows = [{ id: 'other-task', organization_id: other, title: 'Private', completed_at: null }];
const service = { from(table) {
  let filters = [], patch, inserted, single = false;
  const q = {
    select() { return q; }, order() { return q; },
    eq(k,v) { filters.push(r => r[k] === v); return q; },
    update(v) { patch=v; return q; }, insert(v) { inserted=v; return q; },
    single() { single=true; return q; }, maybeSingle() { single=true; return q; },
    then(resolve,reject) { return Promise.resolve().then(() => {
      if (table === 'organization_members') return { data: member ? { role:'admin' } : null, error:null };
      assert.equal(table, 'admin_whiteboard_tasks');
      if (inserted) rows.push({ id:'new-task', ...inserted });
      const found = inserted ? [rows.at(-1)] : rows.filter(r => filters.every(f => f(r)));
      if(patch) found.forEach(r => Object.assign(r,patch));
      return { data: single ? found[0] || null : found.map(r => ({...r})), error:null };
    }).then(resolve,reject); }
  }; return q;
}};
const modules = {
  '@/lib/server/request-auth': { authenticateBearerRequest: async () => signedIn ? {ok:true,user:{id:'admin'}} : {ok:false,status:401,error:'Sign in'}, createServiceRoleClient:()=>service },
  '@/lib/server/organization-access': { requireOrganizationAdmin:async()=>{}, getOrganizationAccessErrorStatus:()=>500 }
};
const code = ts.transpileModule(readFileSync(new URL('../app/api/admin/whiteboard/route.ts', import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const routes={};
new Function('exports','require',code)(routes,n=>{assert.ok(modules[n]);return modules[n];});
const call=(method,body)=>routes[method](new Request(`https://test.invalid/api/admin/whiteboard?organizationId=${org}`,{method,...(body?{body:JSON.stringify(body)}:{})}));
assert.deepEqual((await (await call('GET')).json()).tasks, []);
assert.equal((await call('PATCH',{id:'other-task',completed:true})).status,404);
assert.equal(rows[0].completed_at,null);
member=false;
assert.equal((await call('GET')).status,403);
assert.equal((await call('POST',{title:'Blocked'})).status,403);
member=true;
assert.equal((await call('POST',{title:'  '})).status,400);
assert.equal((await call('POST',{title:'Task',organization_id:other,completed_at:'forged'})).status,201);
assert.equal(rows.at(-1).organization_id,org);
assert.equal(rows.at(-1).completed_at,undefined);
assert.equal((await call('PATCH',{id:'new-task',completed:true})).status,200);
assert.equal(rows.at(-1).completed_by,'admin');
assert.ok(rows.at(-1).completed_at);
await call('PATCH',{id:'new-task',completed:false});
assert.equal(rows.at(-1).completed_at,null);
assert.equal(rows.at(-1).completed_by,null);
signedIn=false;
assert.equal((await call('GET')).status,401);
console.log('Whiteboard isolation, validation, completion and reopening checks passed.');
