import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
const org = '11111111-1111-1111-1111-111111111111';
const other = '22222222-2222-2222-2222-222222222222';
let signedIn = true;
let savedSequence = 0;
const db = {
  organization_members: [{organization_id:org,profile_id:'admin',role:'admin'}, {organization_id:org,profile_id:'second',role:'admin'}, {organization_id:other,profile_id:'foreign',role:'admin'}, {organization_id:org,profile_id:'cleaner',role:'cleaner'}],
  profiles: [{id:'admin',role:'admin',full_name:'Admin'}, {id:'second',role:'admin',full_name:'Second'}, {id:'foreign',role:'admin'}, {id:'cleaner',role:'cleaner'}],
  admin_whiteboard_tasks: [{ id: 'other-task', organization_id: other, title: 'Private', completed_at: null }],
  admin_whiteboard_saved_drawings: [],
  admin_whiteboard_drawings: [{organization_id:other,revision:5,strokes:[],updated_at:null}],
};
const service = { from(table) {
  assert.ok(db[table],table);
  let filters = [], patch, inserted, upserted, removing = false, single = false;
  const q = {
    select() { return q; }, order() { return q; },
    eq(k,v) { filters.push(r => r[k] === v); return q; },
    in(k,v) { filters.push(r => v.includes(r[k])); return q; },
    not(k,op,v) { assert.equal(op,"is"); assert.equal(v,null); filters.push(r => r[k] != null); return q; },
    delete() { removing=true; return q; },
    update(v) { patch=v; return q; }, insert(v) { inserted=v; return q; },
    upsert(v,options) { assert.equal(options.ignoreDuplicates,true); upserted=v; return q; },
    single() { single=true; return q; }, maybeSingle() { single=true; return q; },
    then(resolve,reject) { return Promise.resolve().then(() => {
      const rows=db[table];
      if(upserted && !rows.some(r=>r.organization_id===upserted.organization_id)) rows.push({...upserted,revision:0,strokes:[]});
      if(inserted) rows.push({id:table === 'admin_whiteboard_saved_drawings' ? `saved-${++savedSequence}` : 'new-task', ...(table === 'admin_whiteboard_saved_drawings' ? {revision:1,updated_at:null} : {}),...inserted});
      const found=inserted?[rows.at(-1)]:rows.filter(r=>filters.every(f=>f(r)));
      if(patch) found.forEach(r=>Object.assign(r,patch));
      if(removing) db[table] = rows.filter(r=>!found.includes(r));
      return {data:single?found[0]||null:found.map(r=>({...r})),error:null};
    }).then(resolve,reject); }
  };return q;
}};
function load(path, modules={}) {
  const code=ts.transpileModule(readFileSync(new URL(path,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const exports={};new Function('exports','require',code)(exports,n=>{assert.ok(modules[n],n);return modules[n];});return exports;
}
const drawing=load('../lib/whiteboard-drawing.ts');
const routes=load('../app/api/admin/whiteboard/route.ts', {
  '@/lib/whiteboard-drawing':drawing,
  '@/lib/server/request-auth':{authenticateBearerRequest:async()=>signedIn?{ok:true,user:{id:'admin'}}:{ok:false,status:401,error:'Sign in'},createServiceRoleClient:()=>service},
  '@/lib/server/organization-access':{requireOrganizationAdmin:async()=>{},getOrganizationAccessErrorStatus:()=>500}
});
const call=(method,body,resource='',organization=org)=>routes[method](new Request(`https://test.invalid/api/admin/whiteboard?organizationId=${organization}&resource=${resource}`,{method,...(body?{body:JSON.stringify(body)}:{})}));
assert.deepEqual((await(await call('GET')).json()).tasks,[]);
assert.equal((await call('GET',undefined,'',other)).status,403);
assert.equal((await call('PATCH',{id:'other-task',completed:true})).status,404);
assert.equal(db.admin_whiteboard_tasks[0].completed_at,null);
assert.equal((await call('POST',{title:'  '})).status,400);
assert.equal((await call('POST',{title:'Task',organization_id:other,completed_at:'forged',assignedTo:'second'})).status,201);
const task=db.admin_whiteboard_tasks.at(-1);
assert.equal(task.organization_id,org);assert.equal(task.assigned_to,'second');assert.equal(task.completed_at,undefined);
for(const assignedTo of ['foreign','cleaner','missing']) {
  assert.equal((await call('PATCH',{id:'new-task',assignedTo})).status,400);
  assert.equal((await call('POST',{title:'Invalid',assignedTo})).status,400);
}
assert.equal(task.assigned_to,'second');
await call('PATCH',{id:'new-task',completed:true});
assert.equal(task.completed_by,'admin');assert.ok(task.completed_at);
const completedAt=task.completed_at;
await call('PATCH',{id:'new-task',assignedTo:null});
assert.equal(task.assigned_to,null);assert.equal(task.completed_at,completedAt);
await call('PATCH',{id:'new-task',completed:false});
assert.equal(task.completed_at,null);assert.equal(task.completed_by,null);
assert.deepEqual((await(await call('GET',undefined,'admins')).json()).admins.map(a=>a.id),['admin','second']);
const strokes=[{color:'#123456',width:4,points:[[0,0],[1000,500]]}];
assert.ok(drawing.isValidDrawing(strokes));
assert.ok(drawing.isValidDrawing([]));
for(const bad of [null,[{...strokes[0],width:100}],[{...strokes[0],color:'javascript:bad'}],[{...strokes[0],points:[[1001,0]]}],[{...strokes[0],points:[[NaN,0]]}],[{...strokes[0],points:Array(20001).fill([0,0])}]]) assert.equal(drawing.isValidDrawing(bad),false);
assert.equal((await(await call('GET',undefined,'drawing')).json()).drawing.revision,0);
assert.equal((await call('PUT',{strokes,revision:0},'drawing',other)).status,403);
assert.equal((await call('PUT',{strokes,revision:-1},'drawing')).status,400);
assert.equal((await call('PUT',{strokes,revision:0},'drawing')).status,200);
assert.equal((await call('PUT',{strokes:[],revision:0},'drawing')).status,409,'stale saves cannot overwrite a newer drawing');
assert.deepEqual((await(await call('GET',undefined,'drawing')).json()).drawing.strokes,strokes);
assert.equal(db.admin_whiteboard_drawings[0].revision,5);
assert.equal((await call('PUT',{strokes:[],revision:1},'drawing')).status,200);
assert.deepEqual((await(await call('GET',undefined,'drawing')).json()).drawing.strokes,[]);
// Named drawings remain independent, can be reopened and copied, and use
// version checks for edits and deletion just like the shared board.
assert.equal((await call('POST',{title:' ',strokes},'gallery')).status,400);
const first=(await(await call('POST',{title:'Garden plan',strokes},'gallery')).json()).drawing;
assert.ok(first.id);
const second=(await(await call('POST',{title:'New idea',strokes:[]},'gallery')).json()).drawing;
assert.notEqual(first.id,second.id);
assert.deepEqual((await(await call('GET',undefined,`gallery/${first.id}`)).json()).drawing.strokes,strokes);
assert.equal((await call('GET',undefined,`gallery/${first.id}`,other)).status,403);
assert.equal((await call('PUT',{id:first.id,revision:1,title:'Changed',strokes:[]},'gallery',other)).status,403);
assert.equal((await call('PUT',{id:first.id,revision:1,title:'Garden plan updated',strokes:[]},'gallery')).status,200);
assert.equal((await call('PUT',{id:first.id,revision:1,title:'Stale',strokes},'gallery')).status,409);
assert.equal((await call('DELETE',{id:first.id,revision:1},'gallery')).status,409);
assert.equal((await(await call('GET',undefined,'gallery')).json()).drawings.length,2);
assert.equal((await call('DELETE',{id:first.id,revision:2},'gallery')).status,200);
assert.equal((await call('GET',undefined,`gallery/${first.id}`)).status,404);
assert.equal((await call('GET',undefined,`gallery/${second.id}`)).status,200);

// History actions cannot touch another tenant or a task reopened meanwhile.
assert.equal((await call('PATCH',{action:'archive',ids:['new-task']})).status,200);
assert.equal(task.archived_at,null);
assert.deepEqual((await(await call('DELETE',{ids:['new-task','other-task']})).json()).deletedIds,[]);
await call('PATCH',{id:'new-task',completed:true});
await call('PATCH',{action:'archive',ids:['new-task','other-task']});
assert.ok(task.archived_at);
assert.equal(db.admin_whiteboard_tasks[0].archived_at,undefined);
await call('PATCH',{action:'restore',ids:['new-task']});
assert.equal(task.archived_at,null);assert.ok(task.completed_at);
await call('PATCH',{action:'archive',ids:['new-task']});
await call('PATCH',{id:'new-task',completed:false});
assert.equal(task.archived_at,null);assert.equal(task.completed_at,null);
await call('PATCH',{id:'new-task',completed:true});
assert.equal((await call('DELETE',{ids:[]})).status,400);
assert.equal((await call('DELETE',{ids:['new-task']},'',other)).status,403);
assert.deepEqual((await(await call('DELETE',{ids:['new-task','other-task']})).json()).deletedIds,['new-task']);
assert.equal(db.admin_whiteboard_tasks.length,1);
assert.equal(db.admin_whiteboard_tasks[0].id,'other-task');
signedIn=false;
for(const resource of ['','drawing','admins']) assert.equal((await call('GET',undefined,resource)).status,401);
console.log('Whiteboard isolation, assignment, validation, completion, drawing persistence, save-conflict and archive/delete checks passed.');

// Exercise the real canvas handlers with a small hook/event harness, including
// interrupted pointers. No browser, network, or production drawing is modified.
const hookSlots = [];
let hookIndex = 0;
let effects = [];
const listeners = new Map();
const eventTarget = {
  visibilityState: 'visible',
  addEventListener(name, fn) { if (!listeners.has(name)) listeners.set(name, new Set()); listeners.get(name).add(fn); },
  removeEventListener(name, fn) { listeners.get(name)?.delete(fn); },
};
const react = {
  useState(initial) { const index=hookIndex++; if (!(index in hookSlots)) hookSlots[index]=initial; return [hookSlots[index], value=>{hookSlots[index]=typeof value==='function'?value(hookSlots[index]):value;}]; },
  useRef(initial) { const index=hookIndex++; return hookSlots[index] ??= {current:initial}; },
  useCallback(fn) { return fn; },
  useEffect(fn,deps) { const index=hookIndex++; const old=hookSlots[index]; if(!old || deps.some((dep,i)=>dep!==old.deps[i])) {effects.push(()=>{old?.cleanup?.(); hookSlots[index]={deps,cleanup:fn()};});} },
};
const element=(type,props)=>({type,props});
const componentModules={react,'react/jsx-runtime':{jsx:element,jsxs:element},'./whiteboard.module.css':{default:{}},'@/lib/whiteboard-drawing':drawing};
const canvasCode=ts.transpileModule(readFileSync(new URL('../components/admin/whiteboard-canvas.tsx',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
const canvasModule={};
new Function('exports','require','window','document',canvasCode)(canvasModule,name=>{assert.ok(componentModules[name],name);return componentModules[name];},eventTarget,eventTarget);
signedIn = true;
const props={request:async(method='GET',body,resource='drawing')=>{
  const response=await call(method,body,resource);
  const result=await response.json();
  if(!response.ok)throw new Error(result.error);
  return result;
},onDirtyChange:()=>{}};
function findElement(node,type) { if(!node || typeof node!=='object')return null; if(node.type===type)return node; for(const child of [node.props?.children].flat(Infinity)){const found=findElement(child,type);if(found)return found;} return null; }
function renderCanvas(){hookIndex=0;effects=[];const tree=canvasModule.default(props);for(const effect of effects)effect();return findElement(tree,'svg');}
renderCanvas();await new Promise(resolve=>setImmediate(resolve));
let surface=renderCanvas();
let prevented=0;
const pointer=(id=1,buttons=1)=>({pointerId:id,buttons,button:0,clientX:30,clientY:30,preventDefault(){prevented++;},currentTarget:{getBoundingClientRect:()=>({left:0,top:0,width:1000,height:500}),setPointerCapture(){}}});
surface.props.onDragStart({preventDefault(){prevented++;}});
assert.equal(prevented,1,'native drag must be cancelled');
surface.props.onPointerDown(pointer());surface=renderCanvas();
assert.equal(prevented,2,'drawing must prevent native selection');
surface.props.onPointerMove(pointer(1,0));surface=renderCanvas();
assert.ok(findElement(surface,'circle'),'a lost mouse release commits the existing stroke');
surface.props.onPointerDown(pointer(2));surface=renderCanvas();
for(const fn of [...listeners.get('blur')])fn();
surface=renderCanvas();
const marks=()=>[surface.props.children].flat(Infinity).filter(node=>node?.type==='circle');
assert.equal(marks().length,2,'blur finishes the active stroke');
surface.props.onPointerDown(pointer(3));surface=renderCanvas();
surface.props.onPointerUp(pointer(3));surface.props.onLostPointerCapture(pointer(3));surface=renderCanvas();
assert.equal(marks().length,3,'release and capture loss commit once and allow another stroke');
console.log('Canvas drag prevention and interrupted-pointer recovery checks passed.');

function elements(node,type) {
  if(!node || typeof node!=='object')return [];
  return [...(node.type===type?[node]:[]), ...[node.props?.children].flat(Infinity).flatMap(child=>elements(child,type))];
}
function renderBoard(){hookIndex=0;effects=[];const tree=canvasModule.default(props);for(const effect of effects)effect();return tree;}
let board=renderBoard();
elements(board,'input').find(input=>input.props.placeholder==='e.g. Cabin garden plan').props.onChange({target:{value:'Original sketch'}});
board=renderBoard();
elements(board,'button').find(button=>button.props.children==='Save as new').props.onClick();
await new Promise(resolve=>setImmediate(resolve));
board=renderBoard();
const original=db.admin_whiteboard_saved_drawings.find(item=>item.title==='Original sketch');
assert.equal(original.strokes.length,3);
elements(board,'button').find(button=>button.props.children==='New drawing').props.onClick();
board=renderBoard();
assert.equal(elements(findElement(board,'svg'),'circle').length,0,'New drawing starts blank');
assert.equal(original.strokes.length,3,'New drawing preserves the saved sketch');
const originalCard=elements(board,'li').find(card=>elements(card,'div').some(div=>Array.isArray(div.props.children)&&div.props.children[0]==='Original sketch'));
assert.ok(originalCard);
elements(originalCard,'button').find(button=>button.props.children==='Open').props.onClick();
await new Promise(resolve=>setImmediate(resolve));
board=renderBoard();
assert.equal(elements(findElement(board,'svg'),'circle').length,3,'Opening the saved drawing restores its marks');
console.log('Named drawing save, new canvas, and reopen workflow checks passed.');
