import assert from "node:assert/strict";
import {
  detectBookingGapSuggestions,
  detectPortfolioSeasonality,
} from "../lib/booking-gap-watch.ts";

const property = { id: "property-1", name: "Lake House", address: null };

function detect(bookings, connectedPropertyIds = [property.id]) {
  return detectBookingGapSuggestions({
    properties: [property],
    bookings: bookings.map((booking) => ({ property_id: property.id, ...booking })),
    connectedPropertyIds,
    todayYmd: "2026-09-01",
    horizonDays: 45,
  });
}

{
  const suggestions = detect([
    { checkin_date: "2026-09-01", checkout_date: "2026-09-05" },
    { checkin_date: "2026-09-07", checkout_date: "2026-09-12" },
  ]);
  assert.equal(suggestions[0]?.kind, "orphan_gap");
  assert.equal(suggestions[0]?.startDate, "2026-09-05");
  assert.equal(suggestions[0]?.endDate, "2026-09-07");
  assert.equal(suggestions[0]?.nights, 2);
  assert.equal(suggestions[0]?.suggestedDiscountPercent, 15);
}

{
  const suggestions = detect([
    { checkin_date: "2026-09-01", checkout_date: "2026-09-04" },
    { checkin_date: "2026-09-07", checkout_date: "2026-09-20" },
  ]);
  assert.equal(suggestions[0]?.kind, "open_weekend");
  assert.equal(suggestions[0]?.startDate, "2026-09-04");
  assert.equal(suggestions[0]?.endDate, "2026-09-06");
}

{
  const suggestions = detect([]);
  assert.equal(suggestions.length, 1);
  assert.equal(suggestions[0]?.kind, "open_stretch");
  assert.equal(suggestions[0]?.startDate, "2026-09-01");
  assert.equal(suggestions[0]?.endDate, "2026-09-15");
}

{
  const suggestions = detect(
    [
      { checkin_date: "2026-09-01", checkout_date: "2026-09-08" },
      { checkin_date: "2026-09-05", checkout_date: "2026-09-12" },
    ],
    []
  );
  assert.deepEqual(suggestions, []);
}

{
  const suggestions = detect([
    { checkin_date: "2026-09-01", checkout_date: "2026-09-08" },
    { checkin_date: "2026-09-05", checkout_date: "2026-09-12" },
    { checkin_date: "2026-09-13", checkout_date: "2026-10-20" },
  ]);
  assert.equal(suggestions[0]?.kind, "orphan_gap");
  assert.equal(suggestions[0]?.nights, 1);
}

{
  const properties = [
    { id: "property-1", name: "Lake House" },
    { id: "property-2", name: "Hill House" },
    { id: "property-3", name: "River House" },
  ];
  const bookings = properties.flatMap((item) => [
    {
      property_id: item.id,
      checkin_date: "2026-07-03",
      checkout_date: "2026-08-22",
    },
    {
      property_id: item.id,
      checkin_date: "2026-09-05",
      checkout_date: "2026-09-11",
    },
  ]);
  const seasonality = detectPortfolioSeasonality({
    properties,
    bookings,
    connectedPropertyIds: properties.map((item) => item.id),
    todayYmd: "2026-09-01",
  });
  assert.equal(seasonality.isSlowSeason, true);
  assert.equal(seasonality.slowingPropertyCount, 3);
  assert.equal(seasonality.confidence, "high");
  assert.ok(seasonality.recentOccupancyPercent > seasonality.upcomingOccupancyPercent);
}

{
  const seasonality = detectPortfolioSeasonality({
    properties: [property],
    bookings: [
      {
        property_id: property.id,
        checkin_date: "2026-07-03",
        checkout_date: "2026-08-22",
      },
    ],
    connectedPropertyIds: [property.id],
    todayYmd: "2026-09-01",
  });
  assert.equal(seasonality.isSlowSeason, false, "one property is not enough for a portfolio pattern");
}

console.log("booking gap watch tests passed");
