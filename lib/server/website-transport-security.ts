import "server-only";
import {lookup} from "node:dns/promises";
import {isIP} from "node:net";
import {request as httpsRequest} from "node:https";
export function allowedAddress(address:string):boolean {
  if(isIP(address)===4) {
    const [a,b]=address.split(".").map(Number);
    return !(a===0||a===10||a===127||a===169&&b===254||a===172&&b>=16&&b<=31||a===192&&b===168||a===100&&b>=64&&b<=127||a===198&&(b===18||b===19)||a===192&&(b===0||b===2)||a===198&&b===51||a===203&&b===0||a>=224);
  }
  // Conservatively reject IPv6 literals/mapped IPv4; allow only public global-unicast DNS results.
  return isIP(address)===6&&/^[23][0-9a-f]{3}:/i.test(address)&&!address.toLowerCase().startsWith("2001:db8:");
}
export async function validateConnectorEndpoint(raw:string,resolve:typeof lookup=lookup) {
  const u=new URL(raw);
  if(u.protocol!=="https:"||u.port&&u.port!=="443"||u.username||u.password||u.search||u.hash) throw new Error("UNSAFE_ENDPOINT");
  const host=u.hostname.toLowerCase().replace(/\.$/,"");
  if(!host.includes(".")||host==="localhost"||host.endsWith(".localhost")||host.endsWith(".local")||isIP(host)) throw new Error("UNSAFE_ENDPOINT");
  const addresses=await resolve(host,{all:true,verbatim:true});
  if(!addresses.length||addresses.some(a=>!allowedAddress(a.address))) throw new Error("UNSAFE_ENDPOINT");
  return {url:u,address:addresses[0]};
}
/** Prepared only: production connectors do not call this until their transport is explicitly enabled.
 * Pin DNS to a validated address, preserve TLS hostname verification, and reject all redirects.
 */
export async function requestPropertyResource(endpoint:string,path:string,method:"GET"|"PUT"|"DELETE",body?:unknown,token?:string) {
  if(!/^\/(health|properties\/[0-9a-f-]{36})$/.test(path)) throw new Error("INVALID_RESOURCE_SCOPE");
  const safe=await validateConnectorEndpoint(endpoint);
  const target=new URL(`${safe.url.pathname.replace(/\/$/,"")}${path}`,safe.url.origin);
  return new Promise<{status:number;body:string}>((resolve,reject)=>{
    const req=httpsRequest(target,{method,servername:safe.url.hostname,timeout:8000,
      lookup:(_host,_opts,callback)=>callback(null,safe.address.address,safe.address.family),
      headers:{Accept:"application/json",...(body?{"Content-Type":"application/json"}:{}),...(token?{Authorization:`Bearer ${token}`}:{})}},response=>{
      let size=0;const chunks:Buffer[]=[];
      if((response.statusCode||0)>=300&&(response.statusCode||0)<400) {response.destroy();reject(new Error("REDIRECT_REJECTED"));return;}
      response.on("data",(chunk:Buffer)=>{size+=chunk.length;if(size>64000){response.destroy();reject(new Error("RESPONSE_TOO_LARGE"));}else chunks.push(chunk);});
      response.on("end",()=>resolve({status:response.statusCode||500,body:Buffer.concat(chunks).toString("utf8")}));
      response.on("error",()=>reject(new Error("REMOTE_UNAVAILABLE")));
    });
    req.on("timeout",()=>req.destroy(new Error("REMOTE_TIMEOUT")));
    req.on("error",()=>reject(new Error("REMOTE_UNAVAILABLE")));
    if(body) req.write(JSON.stringify(body));req.end();
  });
}
