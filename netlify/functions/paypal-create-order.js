"use strict";
/*
 * paypal-create-order.js — Netlify Function.
 *
 * Creates a PayPal order for the Sana Handicrafts cart.
 *
 * The page posts { items, address, paymentMethod }. NOTHING about money
 * is trusted from the page: names, prices and packed weights come from
 * the catalog below, the shipping zone from the ZIP code, and the rate
 * from the embedded USPS Ground Advantage retail table (Notice 123,
 * effective October 4, 2026). The totals are recomputed here, so a
 * changed number in the browser cannot change what the buyer is charged.
 *
 * Catalog, rates and zone chart are copies of the same data the shop
 * page uses. Refresh them here whenever the page data changes (next
 * known USPS price change point: January 17, 2027).
 *
 * Environment variables: PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET,
 * PAYPAL_MODE ("sandbox" default, "live"). No dependencies. Uses the
 * global fetch available in Node 18+.
 *
 * First-party integration: no PayPal-Auth-Assertion header is sent. That
 * header belongs to partner/platform flows; this app acts for its own
 * PayPal account with a plain OAuth bearer token.
 *
 * 3D Secure: for card payments the create-order payload carries
 * payment_source.card.contingencies ["SCA_WHEN_REQUIRED"], the value
 * PayPal documents for triggering authentication only when required.
 * The field name follows PayPal's Orders v2 3D Secure guidance; sandbox
 * testing will confirm it, and PayPal returns a clear error if the
 * field is ever rejected.
 */

function apiBase() {
  return process.env.PAYPAL_MODE === "live"
    ? "https://api-m.paypal.com"
    : "https://api-m.sandbox.paypal.com";
}

let cachedToken = null;
let cachedUntil = 0;

async function accessToken() {
  if (cachedToken && Date.now() < cachedUntil) return cachedToken;
  const id = process.env.PAYPAL_CLIENT_ID;
  const secret = process.env.PAYPAL_CLIENT_SECRET;
  if (!id || !secret) throw new Error("MISSING_API_CREDENTIALS");
  const auth = Buffer.from(id + ":" + secret).toString("base64");
  const res = await fetch(apiBase() + "/v1/oauth2/token", {
    method: "POST",
    body: "grant_type=client_credentials",
    headers: { Authorization: "Basic " + auth },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.access_token) throw new Error("PAYPAL_AUTH_FAILED");
  cachedToken = data.access_token;
  cachedUntil = Date.now() + Math.max(0, (data.expires_in || 3600) - 300) * 1000;
  return cachedToken;
}

/* Shop data — copies of the page data, verified identical at build time. */
const CATALOG = {
    "terrazzo-tray": {
      "name": "Hand poured rectangle terrazzo tray",
      "price": 21.35
    },
    "black-tray": {
      "name": "Large black tray",
      "price": 45
    },
    "moon-star-tray": {
      "name": "Moon and star trinket tray",
      "price": 25
    },
    "tea-light": {
      "name": "Oval concrete tea light holder",
      "price": 22
    },
    "bud-vase": {
      "name": "Concrete bud vase",
      "price": 25
    },
    "wavy-tray": {
      "name": "Wavy vanity tray",
      "price": 19.88
    },
    "Star": {
      "name": "Starfish trinket dish",
      "price": 19
    },
    "starfish-trinket-dish": {
      "name": "Starfish trinket dish",
      "price": 19
    },
    "rectangle-tray": {
      "name": "Rectangle tray",
      "price": 28
    },
    "oval-tray": {
      "name": "Oval tray",
      "price": 21
    },
    "pearl-shore-pot": {
      "name": "Pearl Shore Terrazzo Pot",
      "price": 19.88
    }
  };
const WEIGHTS_LB = {"terrazzo-tray":1,"black-tray":2,"moon-star-tray":1,"tea-light":1,"bud-vase":1,"wavy-tray":1,"Star":1,"starfish-trinket-dish":1,"rectangle-tray":2,"oval-tray":1,"pearl-shore-pot":1};
const USPS_RATES = [[4,[8.4,8.55,8.65,8.8,9.35,9.5,9.7,10.2,10.2]],[8,[8.4,8.55,8.65,8.8,9.35,9.5,9.7,10.2,10.2]],[12,[10.05,10.45,10.7,11.1,11.7,12.1,12.7,13.65,13.65]],[15.999,[10.05,10.45,10.7,11.1,11.7,12.1,12.7,13.65,13.65]],[1,[10.05,10.45,10.7,11.1,11.7,12.1,12.7,13.65,13.65]],[2,[11.3,12,12.7,13.5,14.85,15.85,17.2,19.8,19.8]],[3,[11.8,12.5,13.15,14.2,15.7,17.2,19.7,23.15,23.15]],[4,[13.05,13.55,14.45,15.65,17.8,19.7,22.3,25.65,25.65]],[5,[13.75,14.35,15.35,16.6,18.85,21,23.8,27.45,27.45]],[6,[14.3,14.7,15.65,17.15,19.8,22.45,25.75,29.75,29.75]],[7,[14.8,15.2,16.2,17.9,20.85,23.95,27.65,32,32]],[8,[15.4,15.65,16.6,18.45,21.8,25.5,29.85,34.55,34.55]],[9,[15.9,16.2,17.05,19.1,22.8,26.95,32.15,37.1,37.1]],[10,[16.75,17.1,18.05,20.2,24.25,28.9,34.7,40.85,40.85]],[11,[18,18.55,19.4,21.65,26.95,32.2,38.7,46.05,46.05]],[12,[18.7,19.1,19.9,22.55,28.15,34,41.4,49.25,49.25]],[13,[19.45,19.75,20.4,23,29.15,35.85,44.45,53.75,53.75]],[14,[20.2,20.3,20.9,23.8,30.55,38,47.55,57.65,57.65]],[15,[20.9,21,21.65,24.45,31.7,39.5,49.4,60.1,60.1]],[16,[21.65,21.8,22.45,25.55,32.95,41,51.25,62.65,62.65]],[17,[22.4,22.65,23.15,26.65,34.2,42.7,53.55,65.6,65.6]],[18,[23.1,23.35,23.9,27.2,35.55,44.5,55.9,68.6,68.6]],[19,[23.55,23.8,24.85,27.65,36.55,45.55,56.85,70.75,70.75]],[20,[24,24.2,25.7,28.55,37.9,47,58.25,72.15,72.15]],[21,[27.5,28.75,31,36.3,46.1,56.25,67.7,81.25,81.25]],[22,[29.8,31.85,34.95,41.9,52.05,62.85,74.3,87.3,87.3]],[23,[31.35,33.65,37.1,44.95,55.6,66.85,78.6,91.8,91.8]],[24,[32.45,34.9,38.65,46.95,58.15,69.95,82,95.5,95.5]],[25,[33.65,36.2,40.15,49.05,60.65,72.85,85.3,99.1,99.1]],[26,[37.45,40.15,44.35,53.75,67.8,80.55,93.4,107.5,107.5]],[27,[38.55,41.45,45.85,55.95,70.4,83.65,96.65,111.15,111.15]],[28,[39.45,42.45,47.1,57.4,72.4,86,99.4,114.3,114.3]],[29,[40.35,43.45,48.2,59.05,74.4,88.3,102.1,117.35,117.35]],[30,[41.15,44.45,49.3,60.45,76.3,90.65,104.8,120.3,120.3]],[31,[42.15,45.35,50.4,61.9,78.2,92.95,107.35,123.3,123.3]],[32,[42.9,46.35,51.45,63.35,80.1,95.25,110,126.2,126.2]],[33,[43.75,47.25,52.55,64.8,81.95,97.4,112.4,129.05,129.05]],[34,[44.6,48.2,53.6,66.1,83.7,99.55,114.95,131.8,131.8]],[35,[45.5,49.1,54.6,67.55,85.6,101.8,117.55,134.65,134.65]],[36,[46.25,49.9,55.6,68.8,87.25,103.85,119.85,137.3,137.3]],[37,[47.1,50.75,56.6,70.2,89.05,105.95,122.25,140.1,140.1]],[38,[47.85,51.65,57.45,71.5,90.75,108.05,124.7,142.75,142.75]],[39,[48.65,52.5,58.5,72.8,92.55,110.1,127,145.3,145.3]],[40,[49.4,53.4,59.4,74.1,94.15,112.15,129.3,147.9,147.9]],[41,[50.25,54.25,60.4,75.4,95.95,114.2,131.6,150.5,150.5]],[42,[51.05,55,61.25,76.6,97.55,116.1,133.75,152.9,152.9]],[43,[51.7,55.85,62.15,77.75,99.25,118.05,136,155.4,155.4]],[44,[52.5,56.6,63,78.95,100.8,120.05,138.2,157.75,157.75]],[45,[53.2,57.35,63.9,80.2,102.45,121.8,140.35,160.1,160.1]],[46,[53.95,58.15,64.7,81.35,104,123.75,142.35,162.45,162.45]],[47,[54.6,59,65.55,82.45,105.5,125.5,144.45,164.7,164.7]],[48,[55.3,59.7,66.25,83.55,107.1,127.4,146.5,166.85,166.85]],[49,[56,60.35,67.15,84.65,108.6,129.05,148.45,169.1,169.1]],[50,[56.65,61.1,67.9,85.7,110.05,130.85,150.4,171.25,171.25]],[51,[57.35,61.8,68.6,86.75,111.5,132.6,152.35,173.25,173.25]],[52,[58.05,62.45,69.3,87.8,112.95,134.25,154.15,175.3,175.3]],[53,[58.7,63.1,69.95,88.85,114.3,135.85,156,177.3,177.3]],[54,[59.3,63.8,70.7,89.75,115.7,137.5,157.9,179.25,179.25]],[55,[59.9,64.4,71.4,90.8,117.05,139.05,159.55,181.15,181.15]],[56,[60.55,65.05,72,91.75,118.4,140.6,161.4,183,183]],[57,[61.15,65.7,72.65,92.5,119.75,142.2,162.95,184.85,184.85]],[58,[61.75,66.15,73.25,93.5,121.05,143.65,164.7,186.6,186.6]],[59,[62.35,66.85,73.9,94.3,122.3,145.15,166.3,188.25,188.25]],[60,[62.85,67.35,74.4,95.2,123.55,146.55,168,190,190]],[61,[63.4,67.95,74.95,96,124.8,148,169.45,191.6,191.6]],[62,[64,68.5,75.5,96.85,126,149.35,170.95,193.25,193.25]],[63,[64.6,69,76,97.7,127.05,150.7,172.4,194.7,194.7]],[64,[65.05,69.5,76.5,98.35,128.3,152,173.85,196.3,196.3]],[65,[65.55,70.05,77,99.1,129.45,153.3,175.2,197.7,197.7]],[66,[66.05,70.55,77.45,99.85,130.5,154.65,176.55,199.2,199.2]],[67,[66.55,70.95,77.9,100.5,131.6,155.85,177.9,200.5,200.5]],[68,[67.1,71.45,78.3,101.2,132.65,157.05,179.2,201.75,201.75]],[69,[67.5,71.9,78.75,101.8,133.7,158.15,180.4,203.05,203.05]],[70,[68,72.35,79.1,102.5,134.7,159.35,181.65,204.3,204.3]]];
const ZONE_RANGES = [[5,5,6],[6,9,8],[10,40,6],[41,49,7],[50,140,6],[141,143,5],[144,146,6],[147,147,5],[148,149,6],[150,168,5],[169,169,6],[170,170,5],[171,171,6],[172,173,5],[174,199,6],[200,209,5],[210,212,6],[214,214,6],[215,215,5],[216,216,6],[217,217,5],[218,219,6],[220,232,5],[233,233,6],[234,234,5],[235,237,6],[238,268,5],[270,278,5],[279,279,6],[280,288,5],[289,289,4],[290,299,5],[300,303,4],[304,304,5],[305,305,4],[306,306,5],[307,307,4],[308,310,5],[311,311,4],[312,317,5],[318,319,4],[320,323,5],[324,325,4],[326,329,5],[330,333,6],[334,339,5],[340,340,6],[341,342,5],[344,344,5],[346,347,5],[349,349,5],[350,352,4],[354,374,4],[375,375,3],[376,378,5],[379,379,4],[380,381,3],[382,385,4],[386,387,3],[388,388,4],[389,389,3],[390,390,4],[391,392,3],[393,397,4],[398,398,5],[399,407,4],[408,418,5],[420,427,4],[430,459,5],[460,464,4],[465,468,5],[469,472,4],[473,473,5],[474,479,4],[480,499,5],[500,516,4],[520,528,4],[530,532,5],[534,534,5],[535,535,4],[537,537,5],[538,538,4],[539,551,5],[553,567,5],[569,577,5],[580,587,5],[588,588,6],[590,592,6],[593,593,5],[594,599,6],[600,620,4],[622,629,4],[630,630,3],[631,631,4],[633,635,4],[636,641,3],[644,646,4],[647,647,3],[648,648,2],[649,651,3],[652,652,4],[653,655,3],[656,656,2],[657,658,3],[660,662,3],[664,665,4],[666,668,3],[669,669,4],[670,673,3],[674,681,4],[683,691,4],[692,693,5],[700,701,4],[703,708,4],[710,714,3],[716,716,3],[717,722,2],[723,725,3],[726,728,2],[729,729,1],[730,731,3],[733,733,4],[734,737,3],[738,739,4],[740,741,2],[743,745,2],[746,746,3],[747,748,2],[749,749,1],[750,753,3],[754,755,2],[756,763,3],[764,765,4],[766,767,3],[768,770,4],[772,784,4],[785,785,5],[786,797,4],[798,807,5],[808,808,4],[809,809,5],[810,810,4],[811,816,5],[820,820,5],[821,821,6],[822,823,5],[824,824,6],[825,829,5],[830,837,6],[838,838,7],[840,840,5],[841,844,6],[845,845,5],[846,847,6],[850,850,6],[851,852,5],[853,853,6],[855,857,5],[859,860,5],[863,864,6],[865,865,5],[870,871,5],[873,876,5],[877,877,4],[878,880,5],[881,882,4],[883,883,5],[884,884,4],[885,885,5],[888,888,5],[889,891,6],[893,894,6],[895,895,7],[897,897,7],[898,898,6],[900,908,6],[910,928,6],[930,931,7],[932,933,6],[934,934,7],[935,936,6],[937,966,7],[967,968,8],[969,969,9],[970,978,7],[979,979,6],[980,986,7],[988,994,7],[995,999,8]];
const STATE_CODES = ["AL","AK","AZ","AR","CA","CO","CT","DE","DC","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA","WV","WI","WY","PR","GU","VI","AS","MP"];

function slug(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
}

/* Name-slug index, so a posted product name also resolves (defense in
 * depth; the page always posts site ids). Maps name slug -> catalog key,
 * so the packed weight is found by the same key. */
const CATALOG_KEY_BY_NAME_SLUG = {};
for (const key of Object.keys(CATALOG)) {
  CATALOG_KEY_BY_NAME_SLUG[slug(CATALOG[key].name)] = key;
}

function cleanText(s, max) {
  return String(s == null ? "" : s)
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .trim()
    .slice(0, max);
}

function zoneFor(zip5) {
  const prefix = parseInt(zip5.slice(0, 3), 10);
  for (let i = 0; i < ZONE_RANGES.length; i++) {
    const r = ZONE_RANGES[i];
    if (prefix >= r[0] && prefix <= r[1]) return r[2];
  }
  return 0;
}

/* Identical to the page's rateFor: ounce tiers under 1 lb, whole pounds above. */
function rateFor(totalLb, zone) {
  if (!zone) return null;
  const oz = totalLb * 16;
  let row = null;
  if (oz <= 4) row = USPS_RATES[0];
  else if (oz <= 8) row = USPS_RATES[1];
  else if (oz <= 12) row = USPS_RATES[2];
  else if (oz < 16) row = USPS_RATES[3];
  else {
    let lb = Math.ceil(totalLb - 1e-9);
    if (lb < 1) lb = 1;
    if (lb > 70) return null;
    row = USPS_RATES[3 + lb];
  }
  return row[1][zone - 1];
}

function cents(n) {
  return Math.round(n * 100);
}
function fmt(c) {
  return (c / 100).toFixed(2);
}

function json(statusCode, obj) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    body: JSON.stringify(obj),
  };
}

function bad(message) {
  return json(400, { error: message });
}

exports.handler = async (event) => {
  try {
    if (event.httpMethod !== "POST") {
      return json(405, { error: "Method not allowed." });
    }
    if ((event.body || "").length > 8000) {
      return bad("The order details are too large.");
    }
    let body = {};
    try {
      body = JSON.parse(event.body || "{}");
    } catch (e) {
      return bad("The order details could not be read.");
    }

    /* --- items: resolve against the catalog, never trust client prices --- */
    if (!Array.isArray(body.items) || body.items.length === 0 || body.items.length > 20) {
      return bad("The cart is empty.");
    }
    const lines = [];
    for (const raw of body.items) {
      if (!raw || typeof raw !== "object") return bad("One cart item could not be read.");
      const id = typeof raw.id === "string" ? raw.id.slice(0, 60) : "";
      const qty = raw.qty;
      if (!id || !Number.isInteger(qty) || qty < 1 || qty > 99) {
        return bad("One cart item has an invalid quantity.");
      }
      let entry = CATALOG[id];
      let entryKey = id;
      if (!entry && typeof raw.name === "string") {
        entryKey = CATALOG_KEY_BY_NAME_SLUG[slug(raw.name)];
        entry = entryKey ? CATALOG[entryKey] : null;
      }
      if (!entry) return bad("One cart item is no longer sold here.");
      const color = raw.color == null ? "" : cleanText(raw.color, 60);
      lines.push({ id, name: entry.name, price: entry.price, qty, color, weightKey: entryKey });
    }

    /* --- address: same rules as the page --- */
    const a = body.address && typeof body.address === "object" ? body.address : {};
    const first = cleanText(a.first, 60);
    const last = cleanText(a.last, 60);
    const street = cleanText(a.street, 100);
    const apt = cleanText(a.apt, 80);
    const city = cleanText(a.city, 60);
    const state = typeof a.state === "string" ? a.state.trim().toUpperCase() : "";
    const zipRaw = typeof a.zip === "string" ? a.zip.trim() : "";
    const missing = [];
    if (!first) missing.push("first name");
    if (!last) missing.push("last name");
    if (!street) missing.push("street address");
    if (!city) missing.push("city");
    if (!state) missing.push("state");
    if (!/^\d{5}(-\d{4})?$/.test(zipRaw)) missing.push("a 5-digit ZIP code");
    if (missing.length) return bad("Please add " + missing.join(", ") + " before paying.");
    if (STATE_CODES.indexOf(state) === -1) return bad("Please choose a valid state.");
    const zip5 = zipRaw.slice(0, 5);
    const zone = zoneFor(zip5);
    if (!zone) return bad("We could not find a shipping zone for ZIP " + zip5 + ".");

    /* --- weight, rate, totals: recomputed here --- */
    let weightLb = 0;
    for (const l of lines) {
      const per = WEIGHTS_LB[l.weightKey];
      if (per == null) return bad("We could not calculate shipping for one of the items in this cart.");
      weightLb += per * l.qty;
    }
    const rate = rateFor(weightLb, zone);
    if (rate == null) {
      return bad("This order is over the 70 lb Ground Advantage limit. Please contact the shop for a shipping quote.");
    }
    const subtotalC = lines.reduce((s, l) => s + cents(l.price) * l.qty, 0);
    const shippingC = cents(rate);
    const totalC = subtotalC + shippingC;

    const paymentMethod = body.paymentMethod === "card" ? "card" : "paypal";

    if (!process.env.PAYPAL_CLIENT_ID || !process.env.PAYPAL_CLIENT_SECRET) {
      return json(500, { error: "PayPal is not connected yet." });
    }

    /* --- PayPal order --- */
    const payload = {
      intent: "CAPTURE",
      purchase_units: [
        {
          description: "Sana Handicrafts order",
          amount: {
            currency_code: "USD",
            value: fmt(totalC),
            breakdown: {
              item_total: { currency_code: "USD", value: fmt(subtotalC) },
              shipping: { currency_code: "USD", value: fmt(shippingC) },
            },
          },
          items: lines.map((l) => {
            const item = {
              name: l.name,
              unit_amount: { currency_code: "USD", value: fmt(cents(l.price)) },
              quantity: String(l.qty),
              sku: l.id,
            };
            if (l.color) item.description = "Color: " + l.color;
            return item;
          }),
          shipping: {
            name: { full_name: first + " " + last },
            address: {
              address_line_1: street,
              admin_area_2: city,
              admin_area_1: state,
              postal_code: zip5,
              country_code: "US",
            },
          },
        },
      ],
      application_context: { shipping_preference: "SET_PROVIDED_ADDRESS" },
    };
    if (apt) payload.purchase_units[0].shipping.address.address_line_2 = apt;
    if (paymentMethod === "card") {
      payload.payment_source = { card: { contingencies: ["SCA_WHEN_REQUIRED"] } };
    }

    const token = await accessToken();
    const requestId =
      "order-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
    const res = await fetch(apiBase() + "/v2/checkout/orders", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + token,
        "PayPal-Request-Id": requestId,
      },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.id) {
      const detail = data && Array.isArray(data.details) ? data.details[0] : null;
      return json(res.status || 500, {
        error: "PayPal could not create this order.",
        detail: detail ? detail.issue + ": " + (detail.description || "") : undefined,
        debug_id: data.debug_id,
      });
    }
    data.computed = {
      subtotal: fmt(subtotalC),
      shipping: fmt(shippingC),
      total: fmt(totalC),
      zone,
      weightLb,
    };
    return json(200, data);
  } catch (e) {
    return json(500, { error: "The payment could not be started. Please try again." });
  }
};
