export const ANNOUNCEMENT_KINDS = ["ANNOUNCEMENT", "SURVEY", "TESTIMONIAL"] as const;
export type AnnouncementKind = typeof ANNOUNCEMENT_KINDS[number];
export const ANNOUNCEMENT_AUDIENCES = ["ALL", "OWNERS", "CLEANERS", "GROUNDS", "ADMINS"] as const;
export type AnnouncementAudience = typeof ANNOUNCEMENT_AUDIENCES[number];
export type AnnouncementContact = {recipient_key:string;email:string;full_name:string;audience:Exclude<AnnouncementAudience,"ALL">};
export type AnnouncementDraft = {kind:AnnouncementKind;subject:string;message:string;linkUrl:string;linkLabel:string};
export const ANNOUNCEMENT_TEMPLATES:Record<AnnouncementKind,AnnouncementDraft> = {
  ANNOUNCEMENT:{kind:"ANNOUNCEMENT",subject:"An update from our team",message:"We have an update to share with you.\n\n",linkUrl:"",linkLabel:""},
  SURVEY:{kind:"SURVEY",subject:"We’d love your feedback",message:"Your feedback helps us improve our service. Please take a few minutes to complete our survey.\n\nThank you for sharing your thoughts.",linkUrl:"",linkLabel:"Complete the survey"},
  TESTIMONIAL:{kind:"TESTIMONIAL",subject:"Would you share your experience?",message:"We appreciate the opportunity to work with you. If you’d like to share your experience working with us, we would love to hear from you.\n\nThank you for your support.",linkUrl:"",linkLabel:"Share your experience"},
};
export function singleEmail(value:unknown):string {
  if(typeof value!=="string") return "";
  const email=value.trim().toLowerCase();
  return email.length<=254&&/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/i.test(email)?email:"";
}
export function announcementLink(value:unknown):string {
  if(typeof value!=="string"||!value.trim()) return "";
  try {const u=new URL(value.trim());if(u.protocol!=="https:"||u.username||u.password||u.href.length>2048||u.hostname==="localhost"||u.hostname.endsWith(".local")||!u.hostname.includes(".")||/^[\d.]+$/.test(u.hostname)||u.hostname.includes(":"))throw new Error();return u.href;}
  catch {throw new Error("Use a public HTTPS link without a username or password.");}
}
export const PERSONALIZATION_KEYS=["first_name","full_name","company_name","role"] as const;
export const TEMPLATE_CATEGORIES=["GENERAL","OWNER_UPDATE","CLEANER_UPDATE","GROUNDS_UPDATE","POLICY","SEASONAL","SURVEY","TESTIMONIAL","CUSTOM"] as const;
export function validatePersonalization(value:string) {
  const remaining=value.replace(/(?<!{){{\s*(first_name|full_name|company_name|role)\s*}}(?!})/g,"");
  if(remaining.includes("{{")||remaining.includes("}}"))throw new Error("Use only the listed personalization variables, with matching {{ and }}.");
}
export function personalize(value:string,person:{name?:string;role?:string},company:string) {
  validatePersonalization(value);
  const name=(person.name||"").replace(/[\r\n\x00-\x1f]/g," ").trim(),values:Record<string,string>={first_name:name.split(/\s+/)[0]||"there",full_name:name||"there",company_name:company.replace(/[\r\n\x00-\x1f]/g," ").trim()||"our team",role:person.role?.replace(/[\r\n\x00-\x1f]/g," ").trim()||"team member"};
  return value.replace(/{{\s*(first_name|full_name|company_name|role)\s*}}/g,(_,key:string)=>values[key]);
}
export function normalizeAnnouncement(input:unknown,incomplete=false):AnnouncementDraft {
  if(!input||typeof input!=="object")throw new Error("Message details are required.");
  const p=input as Record<string,unknown>;
  if(!ANNOUNCEMENT_KINDS.includes(p.kind as AnnouncementKind))throw new Error("Choose a supported message type.");
  const subject=typeof p.subject==="string"?p.subject.trim():"",message=typeof p.message==="string"?p.message.trim():"",linkLabel=typeof p.linkLabel==="string"?p.linkLabel.trim():"";
  if((!incomplete&&!subject)||subject.length>200||/[\r\n\x00-\x1f]/.test(subject))throw new Error("Enter a subject up to 200 characters on one line.");
  if((!incomplete&&!message)||message.length>20000||message.includes("\0"))throw new Error("Enter a message up to 20,000 characters.");
  for(const value of [subject,message,linkLabel])validatePersonalization(value);
  if(typeof p.linkUrl==="string"&&/[{}]/.test(p.linkUrl))throw new Error("Personalization is supported in text, not link URLs.");
  const linkUrl=announcementLink(p.linkUrl);
  if(!incomplete&&p.kind!=="ANNOUNCEMENT"&&!linkUrl)throw new Error("Add the survey or testimonial form link.");
  if(linkLabel.length>100||linkLabel.includes("\0")||(linkUrl&&!linkLabel))throw new Error("Add a button label up to 100 characters.");
  return {kind:p.kind as AnnouncementKind,subject,message,linkUrl,linkLabel:linkUrl||incomplete?linkLabel:""};
}
export function escapeAnnouncementHtml(value:string) {return value.replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]!));}
/** Only one recipient is ever accepted here. CC/BCC and raw HTML are deliberately absent. */
export function individualAnnouncementEmail(draft:AnnouncementDraft,recipient:{email:string;name:string;role?:string},sender:{email:string;name:string;replyTo:string},unsubscribeUrl:string) {
  const to=singleEmail(recipient.email),from=singleEmail(sender.email),reply=singleEmail(sender.replyTo);
  if(!to||!from||!reply)throw new Error("A valid individual recipient and company sender are required.");
  const original=draft;
  draft={...draft,subject:personalize(draft.subject,recipient,sender.name),message:personalize(draft.message,recipient,sender.name),linkLabel:personalize(draft.linkLabel,recipient,sender.name)};
  const e=escapeAnnouncementHtml,greeting=/{{\s*(first_name|full_name)\s*}}/.test(original.message)?"":recipient.name.trim()?`Hello ${recipient.name.trim()},`:"Hello,";
  const company=sender.name.replace(/[\r\n<>"\\]/g," ").trim().slice(0,150);
  const text=[greeting,draft.message,...(draft.linkUrl?[`${draft.linkLabel}: ${draft.linkUrl}`]:[]),company,`Stop company announcement emails: ${unsubscribeUrl}`].filter(Boolean).join("\n\n");
  const html=`<div style="font-family:Arial,sans-serif;color:#241c15;line-height:1.6;max-width:640px;margin:auto;padding:24px">${greeting?`<p>${e(greeting)}</p>`:""}${draft.message.split(/\n\s*\n/).map(p=>`<p>${e(p).replace(/\n/g,"<br />")}</p>`).join("")}${draft.linkUrl?`<p><a href="${e(draft.linkUrl)}" style="display:inline-block;padding:12px 20px;background:#241c15;color:white;border-radius:8px;text-decoration:none">${e(draft.linkLabel)}</a></p>`:""}${company?`<p>${e(company)}</p>`:""}<p style="font-size:12px;color:#7f7263"><a href="${e(unsubscribeUrl)}">Stop company announcement emails</a></p></div>`;
  return {from:company?`${company} <${from}>`:from,to:[to],reply_to:reply,subject:draft.subject,text,html};
}
/** Explicit wall time + IANA zone; reject DST gaps and ambiguous repeated times. */
export function scheduleInstant(local:string,zone:string) {
  const match=/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(local);
  if(!match)throw new Error("Choose a date and time.");
  const formatter=new Intl.DateTimeFormat("en-CA",{timeZone:zone,year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23"});
  const base=Date.UTC(...([Number(match[1]),Number(match[2])-1,...match.slice(3).map(Number)] as [number,number,number,number,number]));
  const matches:number[]=[];
  for(let offset=-840;offset<=840;offset+=15){const time=base-offset*60000,parts=Object.fromEntries(formatter.formatToParts(time).map(p=>[p.type,p.value]));if(`${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`===local)matches.push(time);}
  if(matches.length!==1)throw new Error("That time is missing or repeated during a daylight-saving change. Choose an unambiguous time.");
  return new Date(matches[0]).toISOString();
}
