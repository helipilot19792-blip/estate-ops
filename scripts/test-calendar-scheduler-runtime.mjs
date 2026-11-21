import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import vm from "node:vm";
import ts from "typescript";
const root = path.resolve(import.meta.dirname,".."), native = createRequire(import.meta.url);
const env = {}; let checks = 0, fetches = [], fetchResult = () => new Response("OK");
const check = (v,s) => { assert.ok(v,s); checks++; };
function load(file, overrides={}) {
 const testModule={exports:{}};
 const source=ts.transpileModule(readFileSync(path.join(root,file),"utf8"),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,esModuleInterop:true}}).outputText;
 const require=spec=> {
  if (Object.hasOwn(overrides,spec)) return overrides[spec];
  if (spec==='server-only') return {};
  if (spec.startsWith('.') || spec.startsWith('@/')) return load(path.relative(root,spec.startsWith('@/')?path.join(root,spec.slice(2))+'.ts':path.resolve(root,path.dirname(file),spec)+'.ts'),overrides);
  return native(spec);
 };
 vm.runInNewContext(source,{module:testModule,exports:testModule.exports,require,process:{env},Buffer,URL,Request,Response,AbortSignal,Date,console,fetch:async(...a)=>{fetches.push(a);return fetchResult(...a);}});
 return testModule.exports;
}
function builder(result) { return new Proxy({}, {get:(_,key)=>key==='then'?(yes,no)=>Promise.resolve(result).then(yes,no):()=>builder(result)}); }
try {
 const {parseCalendarSnapshot:parse,calendarDownloadIsFresh:fresh}=load('lib/calendar-snapshot.ts');
 const freshResponse={status:200,contentType:'text/calendar; charset=utf-8',responseDate:new Date().toUTCString(),responseAge:null};
 check(fresh(freshResponse),'fresh calendar response can supply an absence observation');
 for(const response of [{...freshResponse,responseDate:null},{...freshResponse,responseDate:new Date(Date.now()-600000).toUTCString()},
  {...freshResponse,responseDate:new Date(Date.now()+120000).toUTCString()},{...freshResponse,responseAge:'61'},
  {...freshResponse,responseAge:'bad'},{...freshResponse,status:304},{...freshResponse,contentType:'text/html'}]) {
  check(!fresh(response),'stale, cached, missing or invalid transport evidence cannot count toward cancellation');
 }
 const event = (uid='a',extra='')=>`BEGIN:VEVENT\nUID:${uid}\nDTSTART;VALUE=DATE:20990101\nDTEND;VALUE=DATE:20990103\nSUMMARY:Reserved\n${extra}END:VEVENT`;
 const ics=body=>`BEGIN:VCALENDAR\nVERSION:2.0\n${body}\nEND:VCALENDAR`;
 check(parse(ics(event())).length===1,'complete feed parses');
 check(parse(ics(event()),0)[0].eligible_at===null,'zero lead time preserves immediate-offer semantics');
 check(parse(ics(event()))[0].lead_days===90,'default calendar offer window remains 90 days');
 for (const body of ['<html>Error</html>',ics(event()).slice(0,-8),ics(event('a')+'\n'+event('a')),ics(event('a','RRULE:FREQ=DAILY\n')),ics(event('a').replace('20990103','20990230')),ics(event('a').replace('UID:a','SUMMARY:a')),ics(event('a').replace('20990103','20980101'))]) { assert.throws(()=>parse(body));checks++; }
 check(parse(ics('')).length===0,'empty valid snapshot yields review candidates, not deletions');
 check(parse(ics(event('a','STATUS:CANCELLED\n'))).length===0,'cancellation tombstone never manufactures reservation');
 check(parse(ics(event().replace('Reserved','Not available'))).length===0,'blocked dates excluded');
 // Exercise the real shared manual/scheduled coordinator with isolated transport.
 env.CALENDAR_SYNC_SAFETY_ENABLED='true';
 let download={...freshResponse,text:ics(event())};const calendarCalls=[];
 const calendarService={from:table=>builder({data:table==='properties'?[{id:'property-a',organization_id:'org-a',cleaner_offer_lead_days:90}]:table==='property_calendars'?[{id:'feed-a',property_id:'property-a',source:'airbnb',ical_url:'https://calendar.example.invalid/feed.ics'}]:[],error:null}),
  rpc:async(name,args)=>{calendarCalls.push({name,args});return {data:name==='acquire_calendar_sync'?'synthetic-fence':{created:1},error:null};}};
 const calendarSync=load('lib/server/calendar-sync-safe.ts',{'./safe-remote-fetch':{fetchPublicText:async()=>download}});
 await calendarSync.syncCalendarsSafely(calendarService,['org-a']);
 check(calendarCalls.some(c=>c.name==='apply_calendar_snapshot_observed'&&c.args.p_fresh===true),'shared coordinator uses observed RPC with fresh evidence');
 download={...download,responseDate:null};calendarCalls.length=0;
 await calendarSync.syncCalendarsSafely(calendarService,['org-a']);
 check(calendarCalls.some(c=>c.name==='apply_calendar_snapshot_observed'&&c.args.p_fresh===false),'unverifiable freshness permits ordinary imports without automatic cancellation');
 download={...download,text:'incomplete calendar'};calendarCalls.length=0;
 await calendarSync.syncCalendarsSafely(calendarService,['org-a']);
 check(!calendarCalls.some(c=>c.name==='apply_calendar_snapshot_observed')&&calendarCalls.some(c=>c.name==='fail_calendar_sync'),'malformed downloads never reach cancellation processing');
 const auth=load('lib/server/schedule-auth.ts');
 const req=token=>new Request('https://synthetic.invalid/api/schedule/cleaner-notifications',{headers:{Authorization:`Bearer ${token}`}});
 check(!auth.scheduleEnabled(),'scheduler disabled by default');
 check(!auth.authorizeSchedule(req('missing'),'notifications'),'missing config denied');
 env.CLEANER_DISPATCH_SCHEDULE_TOKEN='n'.repeat(48);env.CALENDAR_SYNC_SCHEDULE_TOKEN='c'.repeat(48);env.CRON_SECRET='original-unchanged';
 check(auth.authorizeSchedule(req(env.CLEANER_DISPATCH_SCHEDULE_TOKEN),'notifications'),'notification capability accepted');
 check(auth.authorizeSchedule(req(env.CALENDAR_SYNC_SCHEDULE_TOKEN),'calendars'),'calendar capability accepted');
 check(!auth.authorizeSchedule(req(env.CLEANER_DISPATCH_SCHEDULE_TOKEN),'calendars'),'notification token cannot sync calendars');
 check(!auth.authorizeSchedule(req(env.CALENDAR_SYNC_SCHEDULE_TOKEN),'notifications'),'calendar token cannot dispatch');
 check(!auth.authorizeSchedule(req(env.CRON_SECRET),'notifications'),'original cron key not broadened to new routes');
 env.CALENDAR_SYNC_SCHEDULE_TOKEN=env.CLEANER_DISPATCH_SCHEDULE_TOKEN;
 check(!auth.authorizeSchedule(req(env.CLEANER_DISPATCH_SCHEDULE_TOKEN),'notifications'),'reused capabilities rejected');
 env.CALENDAR_SYNC_SCHEDULE_TOKEN='c'.repeat(48);env.SCHEDULE_CANONICAL_ORIGIN='https://portal.example.invalid';
 check(auth.schedulerOrigin()==='https://portal.example.invalid','origin comes only from reviewed config');
 env.SCHEDULE_CANONICAL_ORIGIN='https://evil.example.invalid/path';assert.throws(()=>auth.schedulerOrigin());checks++;
 let dispatchCalls=0;
 const route=load('app/api/schedule/cleaner-notifications/route.ts',{
  '@/lib/server/cleaner-notification-queue':{createCleanerNotificationService:()=>({}),cleanerReliabilityEnabled:()=>true},
  '@/lib/server/cleaner-notification-worker':{runCleanerNotificationDispatch:async()=>{dispatchCalls++;return{failures:0};}},
  '@/lib/server/calendar-notification-outbox':{dispatchCalendarIntents:async()=>({failures:0})},
 });
 check((await route.GET(req(env.CALENDAR_SYNC_SCHEDULE_TOKEN))).status===401,'wrong route token fails before service access');
 check((await route.GET(req(env.CLEANER_DISPATCH_SCHEDULE_TOKEN))).status===503 && dispatchCalls===0,'disabled route cannot send');
 env.SUPABASE_SCHEDULING_ENABLED='true';env.CLEANER_NOTIFICATION_DISPATCH_ENABLED='true';env.SCHEDULE_CANONICAL_ORIGIN='https://portal.example.invalid';
 check((await route.GET(req(env.CLEANER_DISPATCH_SCHEDULE_TOKEN))).status===200 && dispatchCalls===1,'enabled route invokes existing worker');
 let health={active:true,healthy:true};let finished=new Date().toISOString();
 const service={from:table=>builder({data:table==='cleaner_notification_runs'?{finished_at:finished}:[],error:null})};
 const monitor=load('lib/server/notification-monitor.ts',{'./cleaner-notification-health':{cleanerNotificationHealth:async()=>health}});
 check((await monitor.signalNotificationMonitor(service)).disabled && fetches.length===0,'monitor disabled by default');
 env.NOTIFICATION_MONITOR_ENABLED='true';env.NOTIFICATION_HEALTHCHECKS_URL='https://hc-ping.com/11111111-1111-4111-8111-111111111111';
 await monitor.signalNotificationMonitor(service);
 check(!String(fetches.at(-1)[0]).endsWith('/fail'),'healthy committed completion signals success');
 check(fetches.at(-1)[1].body==='' && !fetches.at(-1)[1].headers,'no customer data or scheduler token sent to monitor');
 finished=new Date(Date.now()-180000).toISOString();await monitor.signalNotificationMonitor(service);
 check(String(fetches.at(-1)[0]).endsWith('/fail'),'HTTP availability without completed processing fails monitoring');
 finished=new Date().toISOString();health={active:true,healthy:false};await monitor.signalNotificationMonitor(service);
 check(String(fetches.at(-1)[0]).endsWith('/fail'),'unhealthy processing/backlog signals failure');
 env.NOTIFICATION_HEALTHCHECKS_URL='https://evil.invalid/11111111-1111-4111-8111-111111111111';await assert.rejects(()=>monitor.signalNotificationMonitor(service),/Invalid monitor/);checks++;
 env.NOTIFICATION_HEALTHCHECKS_URL='https://hc-ping.com/11111111-1111-4111-8111-111111111111';fetchResult=()=>{throw new Error('synthetic transport failure');};await assert.rejects(()=>monitor.signalNotificationMonitor(service),/^Error: Monitor signal unavailable\.$/);checks++;
 // Execute the actual calendar notification dispatcher with synthetic targets.
 let finishes=[], activationCalls=0, pushCalls=0, offeredCalls=0;
 let intent={id:'intent-1',organization_id:'org-a',change_id:'change-1',job_id:'job-1',action:'cancel',channel:'email',target:'cleaner@example.invalid',profile_id:'profile-a',subscription_id:null,lease_token:'fence',attempt_count:1,created_at:new Date().toISOString()};
 let fixtures={turnover_jobs:{id:'job-1',organization_id:'org-a',status:'cancelled'},turnover_job_slots:[{id:'slot-1',cleaner_account_id:'account-a',status:'cancelled'}],cleaner_accounts:[{id:'account-a',email:'cleaner@example.invalid'}],cleaner_account_members:[{profile_id:'profile-a'}],profiles:{email:'cleaner@example.invalid'},calendar_sync_changes:{reason:'booking_cancelled',proposal:{previous_date:'2099-01-03'}},staff_push_subscriptions:{subscription:{endpoint:'https://synthetic.invalid'}},cleaner_payment_records:[]};
 const outService={from:table=>builder({data:fixtures[table],error:null}),rpc:async(name,args)=>{if(name==='claim_calendar_outbox')return{data:[intent],error:null};finishes.push(args);return{data:true,error:null};}};
 const out=load('lib/server/calendar-notification-outbox.ts',{'./cleaner-job-activation':{activateCleanerJobOffer:async()=>{activationCalls++;return{notification:{errors:[]}};}},'./job-notifications':{sendJobOfferEmailsForSlots:async()=>{offeredCalls++;return{errors:[]};}},'./staff-push-notifications':{sendStaffPushToSubscription:async()=>{pushCalls++;}}});
 env.CALENDAR_SYNC_SAFETY_ENABLED='true';fetchResult=()=>new Response('OK');
 await out.dispatchCalendarIntents(outService,'https://portal.example.invalid');
 check(finishes.at(-1).p_state==='accepted','cancellation email persisted independently');
 const idempotency=fetches.at(-1)[1].headers['Idempotency-Key'];
 await out.dispatchCalendarIntents(outService,'https://portal.example.invalid');
 check(fetches.at(-1)[1].headers['Idempotency-Key']===idempotency,'retry preserves external email idempotency key');
 fetchResult=()=>new Response('unavailable',{status:503});await out.dispatchCalendarIntents(outService,'https://portal.example.invalid');
 check(finishes.at(-1).p_state==='pending' && finishes.at(-1).p_status===503,'provider failure schedules independent retry');
 let count=fetches.length;fixtures.profiles={email:'changed@example.invalid'};await out.dispatchCalendarIntents(outService,'https://portal.example.invalid');
 check(finishes.at(-1).p_reason==='recipient_scope_changed' && fetches.length===count,'changed recipient cannot receive saved email');
 fixtures.profiles={email:'cleaner@example.invalid'};intent={...intent,channel:'push',subscription_id:'device-a'};
 await out.dispatchCalendarIntents(outService,'https://portal.example.invalid');check(pushCalls===1 && finishes.at(-1).p_state==='accepted','cancellation push dispatched separately');
 fixtures.cleaner_account_members=[];await out.dispatchCalendarIntents(outService,'https://portal.example.invalid');check(pushCalls===1 && finishes.at(-1).p_state==='expired','removed membership prevents cross-scope push');
 fixtures.cleaner_account_members=[{profile_id:'profile-a'}];intent={...intent,created_at:new Date(Date.now()-24*3600000).toISOString()};await out.dispatchCalendarIntents(outService,'https://portal.example.invalid');check(finishes.at(-1).p_reason==='replay_window_elapsed','ambiguous old cancellation is not resent past replay window');
 intent={...intent,action:'activate',channel:'task',created_at:new Date().toISOString()};fixtures.turnover_jobs={id:'job-1',organization_id:'org-a',status:'pending',offer_eligible_at:null,offer_released_at:null};fixtures.turnover_job_slots=[{id:'slot-1',payment_status:'unpaid',paid_amount:null,status:'pending'}];fixtures.cleaner_payment_records=[{id:'payment-1'}];
 await out.dispatchCalendarIntents(outService,'https://portal.example.invalid');check(activationCalls===0 && finishes.at(-1).p_reason==='activation_payment_review_required','activation retry cannot reset recorded payment values');
 fixtures.turnover_job_slots=[{id:'slot-1',payment_status:'unpaid',status:'offered',offered_at:new Date().toISOString()}];await out.dispatchCalendarIntents(outService,'https://portal.example.invalid');check(activationCalls===0 && offeredCalls===1,'partially activated offers resume enqueue without reseeding payouts');
 env.CLEANER_NOTIFICATION_DISPATCH_ENABLED='false';count=finishes.length;await out.dispatchCalendarIntents(outService,'https://portal.example.invalid');check(finishes.length===count,'rollback pause sends no calendar notifications');
 const sql=readFileSync(path.join(root,'supabase/migrations/20261022020000_calendar_sync_safety.sql'),'utf8');
 check(!/delete\s+from\s+(?:public\.)?(turnover_jobs|turnover_job_slots|property_booking_events|job_offers|turnover_job_checklist_items|cleaner_payment_records)/i.test(sql),'new migration has no destructive operational deletes');
 const config=readFileSync(path.join(root,'supabase/operations/prepare_gulera_schedules.sql'),'utf8');
 check(config.includes("'*/5 * * * *'") && config.includes('active:=false'),'calendar replacement prepared inactive');
 check(readFileSync(path.join(root,'vercel.json'),'utf8').includes('"schedule": "0 5 * * *"'),'existing daily calendar schedule retained');
 check(!config.includes('Bearer synthetic') && config.includes('vault.decrypted_secrets'),'scheduler headers resolve secrets at execution');
 console.log(JSON.stringify({suite:'calendar-scheduler-runtime',checks,result:'PASS',providerRequests:'synthetic only'}));
} catch(e) {console.error(JSON.stringify({suite:'calendar-scheduler-runtime',checks,result:'FAIL',message:e.message}));process.exitCode=1;}
