/** In-memory fixture only. No URLs, credentials, filesystem writes or network. */
export function mockStayInNiagara() {
  const properties=new Map(),responses=new Map(),generations=new Map();
  const editorial={homepageHero:"Explore Niagara",about:"Independent brand story",guides:["Restaurants","Attractions"],navigation:["Stays","About","Guides"],blog:["Winter in Niagara"]};
  let available=true;
  const calls=[];
  async function apply(delivery,remove=false) {
    if(!available) throw new Error("Unavailable: secret-token-must-never-be-persisted");
    if(delivery.scope!=="PROPERTY")throw new Error("Scope rejected");
    const key=`${delivery.siteId}:${delivery.listingId}`;
    calls.push(structuredClone(delivery));
    if(responses.has(delivery.idempotencyKey))return responses.get(delivery.idempotencyKey);
    const last=generations.get(key)||{generation:0,configurationRevision:0};
    if(delivery.generation<last.generation||delivery.generation===last.generation&&delivery.configurationRevision<last.configurationRevision)throw new Error("STALE_GENERATION");
    generations.set(key,{generation:delivery.generation,configurationRevision:delivery.configurationRevision});
    if(remove)properties.delete(key);else properties.set(key,structuredClone(delivery));
    const result={remoteId:delivery.listingId,remoteUrl:`https://preview.example.test/properties/${delivery.listingId}`};
    responses.set(delivery.idempotencyKey,result);return result;
  }
  return {properties,editorial,calls,setAvailable(value){available=value;},transport:{
    upsertProperty:d=>apply(d),unpublishProperty:d=>apply(d,true),
    async testConnection(){return {ok:available,message:available?"Mock property receiver available":"Mock unavailable"};},
    async fetchRemoteState(listingId){const entry=[...properties.values()].find(v=>v.listingId===listingId);return entry?{revision:entry.publicationRevision}:null;},
  }};
}
