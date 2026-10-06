export type PortalAccess={cleaner:boolean;grounds:boolean;owner:boolean};
export const PORTAL_CHOICES=[
  {key:"owner",path:"/owner",label:"Owner Portal",description:"Your properties, statements, invoices, and updates from property management."},
  {key:"cleaner",path:"/cleaner",label:"Cleaner Portal",description:"Turnover jobs, assigned property instructions, and your cleaning job queue."},
  {key:"grounds",path:"/grounds",label:"Grounds Portal",description:"Lawn, bins, snow, exterior work, and your grounds job queue."},
] as const;
export function availablePortals(access:PortalAccess){return PORTAL_CHOICES.filter(p=>access[p.key]);}
export function portalDestination(role:string,access:PortalAccess) {
  if(role==="admin"||role==="platform_admin")return "/admin";
  const choices=availablePortals(access);
  return choices.length>1?"/choose-portal":choices[0]?.path||"/login";
}
