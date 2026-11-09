"use strict";
/*
 * paypal-capture-order.js — Netlify Function.
 *
 * Captures a PayPal order created by paypal-create-order.js.
 * The page posts { orderId }. This function calls the PayPal Orders API
 * capture endpoint and returns PayPal's response unchanged, so the page
 * can handle the three capture outcomes (declined instrument, other
 * failure, success) exactly as PayPal documents them.
 *
 * Environment variables: PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET,
 * PAYPAL_MODE ("sandbox" default, "live"). No dependencies.
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

function json(statusCode, obj) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    body: JSON.stringify(obj),
  };
}

exports.handler = async (event) => {
  try {
    if (event.httpMethod !== "POST") {
      return json(405, { error: "Method not allowed." });
    }
    let body = {};
    try {
      body = JSON.parse(event.body || "{}");
    } catch (e) {
      return json(400, { error: "The order details could not be read." });
    }
    const orderId = body.orderId;
    if (typeof orderId !== "string" || !/^[A-Za-z0-9_-]{8,64}$/.test(orderId)) {
      return json(400, { error: "The order number is missing or invalid." });
    }
    if (!process.env.PAYPAL_CLIENT_ID || !process.env.PAYPAL_CLIENT_SECRET) {
      return json(500, { error: "PayPal is not connected yet." });
    }
    const token = await accessToken();
    const res = await fetch(
      apiBase() + "/v2/checkout/orders/" + encodeURIComponent(orderId) + "/capture",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + token,
          "PayPal-Request-Id": "capture-" + orderId,
        },
        body: "{}",
      }
    );
    const data = await res.json().catch(() => ({}));
    return json(res.status, data && typeof data === "object" ? data : { error: "PayPal did not answer." });
  } catch (e) {
    return json(500, { error: "The payment could not be completed. Please try again." });
  }
};
