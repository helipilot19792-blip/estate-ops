import type { serializePublicListing } from "@/lib/website-publishing";
export type PublicListingDTO = ReturnType<typeof serializePublicListing>;
/** Content-aware rendering shared by admin preview and future website consumers. */
export default function ListingContent({listing: p}:{listing:PublicListingDTO}) {
  const details = [p.location,p.maxGuests?`${p.maxGuests} guests`:null,p.bedrooms===0?"Studio":p.bedrooms?`${p.bedrooms} bedrooms`:null,p.bathrooms?`${p.bathrooms} bathrooms`:null,p.beds?`${p.beds} beds`:null].filter(Boolean);
  if(!p.name&&!p.description&&!p.hero&&!details.length&&!p.bookingChannels?.length) return null;
  return <article className="overflow-hidden rounded-[24px] border border-[#d9ccbb] bg-white shadow-sm">
    {/* eslint-disable-next-line @next/next/no-img-element */}
    {p.hero&&<img className="aspect-[16/10] max-h-[520px] w-full object-cover" src={p.hero.url} srcSet={p.hero.variants?.map(v=>`${v.url} ${v.width}w`).join(", ")} alt={p.hero.caption||p.name||"Property"}/>}
    <div className="space-y-6 p-5 md:p-8">
    {p.name&&<h4 className="text-3xl font-semibold tracking-tight text-[#241c15] md:text-4xl">{p.name}</h4>}{p.tagline&&<p className="text-lg text-[#7f7263]">{p.tagline}</p>}
    {details.length>0&&<p className="rounded-xl bg-[#fcfaf7] px-4 py-3 text-sm text-[#6f6255]">{details.join(" · ")}</p>}
    {p.description&&<p className="whitespace-pre-wrap">{p.description}</p>}
    {p.highlights&&<section><h5 className="font-semibold">Highlights</h5><ul>{p.highlights.map(v=><li key={v}>{v}</li>)}</ul></section>}
    {p.amenities&&<section><h5 className="font-semibold">Amenities</h5><p>{p.amenities.join(" · ")}</p></section>}
    {(p.parking||p.parkingSpaces!==undefined)&&<section><h5 className="font-semibold">Parking</h5>{p.parking&&<p>{p.parking}</p>}{p.parkingSpaces!==undefined&&<p>{p.parkingSpaces===0?"No on-site parking":`Parking for ${p.parkingSpaces} vehicles`}</p>}</section>}
    {p.accessibility&&<section><h5 className="font-semibold">Accessibility</h5><p>{p.accessibility}</p></section>}
    {p.features&&<p>{Object.entries(p.features).map(([k,v])=>k==="petFriendly"?(v?"Pet friendly":"No pets"):k.replace(/([A-Z])/g," $1")).join(" · ")}</p>}
    {p.bookingChannels&&<div className="flex flex-wrap gap-3">{p.bookingChannels.map((c,i)=><a key={i} className="rounded-xl border p-2 text-sm" href={c.url} target="_blank" rel="noreferrer">{c.label||`Book via ${{AIRBNB:"Airbnb",VRBO:"Vrbo",DIRECT:"direct booking",BOOKING_COM:"Booking.com",OTHER:"booking partner"}[c.provider]}`}</a>)}</div>}
    {p.gallery&&<div className="grid gap-3 sm:grid-cols-2">{p.gallery.map((photo,i)=>
      // eslint-disable-next-line @next/next/no-img-element
      <img key={i} className="rounded-xl" src={photo.url} alt={photo.caption||p.name||"Property"}/>)}</div>}
    {p.licence&&<p className="text-sm">Public licence: {p.licence}</p>}
    {p.collections&&<p className="text-sm">Collections: {p.collections.join(", ")}</p>}
    </div>
  </article>;
}
