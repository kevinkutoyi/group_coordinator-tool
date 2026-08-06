// currency.js — single source of truth for the USD→KES conversion rate.
//
// The rate is admin-configurable (Settings page → Currency card) since it
// fluctuates with the real market rate. This module fetches it once from
// GET /api/currency/rate, caches it, and lets components subscribe to
// updates so they re-render once the real rate replaces the 130 fallback.
import { useEffect, useState } from "react";
import { api } from "./api";

let rate = 130; // fallback shown until the real platform rate loads
let ratePromise = null;
const listeners = new Set();

export function getRate() {
  return rate;
}

// Money — always 2 decimal places, never rounded to a whole number.
export function kes(usdAmount) {
  return ((usdAmount || 0) * rate).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// For values the backend already converted to KES — just formats, no multiply.
export function kesRaw(kesAmount) {
  return (kesAmount || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function loadRate() {
  if (!ratePromise) {
    ratePromise = api.getCurrencyRate()
      .then(r => {
        if (r && r.KES_PER_USD > 0) rate = r.KES_PER_USD;
        listeners.forEach(fn => fn(rate));
        return rate;
      })
      .catch(() => rate);
  }
  return ratePromise;
}

// Forces a fresh fetch even if one already ran — call after the admin saves
// a new rate so every open tab's `kes()` calls reflect it immediately.
export function refreshRate() {
  ratePromise = null;
  return loadRate();
}

export function subscribeRate(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// Call once per page/component that displays money — triggers the fetch
// (deduped if other components already triggered it) and re-renders this
// component once the real rate comes in.
export function useKesRate() {
  const [, tick] = useState(0);
  useEffect(() => {
    loadRate();
    return subscribeRate(() => tick(v => v + 1));
  }, []);
  return rate;
}
