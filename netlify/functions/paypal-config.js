"use strict";
/*
 * paypal-config.js — Netlify Function.
 *
 * Returns the PUBLIC PayPal configuration the page needs to load the
 * JavaScript SDK and render hosted card fields: the client ID, a client
 * token, and the mode (sandbox or live).
 *
 * The secret is NEVER returned and NEVER appears in the page. If the
 * PayPal app is not configured, this endpoint answers 500 and the page
 * falls back to its PayPal-site checkout buttons.
 *
 * Environment variables (set in Netlify: Site settings > Environment
 * variables, scope Functions):
 *   PAYPAL_CLIENT_ID     - client ID of the PayPal REST API app
 *   PAYPAL_CLIENT_SECRET - secret of the same app (never in the page)
 *   PAYPAL_MODE          - "sandbox" (default) or "live"
 *
 * No dependencies. Uses the global fetch available in Node 18+.
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

exports.handler = async () => {
  try {
    if (!process.env.PAYPAL_CLIENT_ID || !process.env.PAYPAL_CLIENT_SECRET) {
      return json(500, { error: "PayPal is not connected yet." });
    }
    const token = await accessToken();
    const res = await fetch(apiBase() + "/v1/identity/generate-token", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + token,
        "Accept-Language": "en_US",
        "Content-Type": "application/json",
      },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.client_token) {
      return json(500, { error: "PayPal is not connected yet." });
    }
    return json(200, {
      clientId: process.env.PAYPAL_CLIENT_ID,
      clientToken: data.client_token,
      mode: process.env.PAYPAL_MODE === "live" ? "live" : "sandbox",
    });
  } catch (e) {
    return json(500, { error: "PayPal is not connected yet." });
  }
};
