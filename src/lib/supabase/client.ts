import { createClient } from "@supabase/supabase-js";
import { encodeDeviceHeader, getDeviceName } from "@/lib/device";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// Only throw in the browser. This module also gets evaluated in Node during
// `next build`'s static prerender of the page shell, which doesn't need a
// working Supabase connection — failing there would fail the whole build
// even for environments (e.g. a Preview deploy) that just haven't had the
// env vars set yet.
if (typeof window !== "undefined" && (!supabaseUrl || !supabaseAnonKey)) {
  throw new Error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY env vars. " +
      "Copy .env.local.example to .env.local and fill in your Supabase project values."
  );
}

// Adds this computer's name to every request, read fresh each time so a
// rename takes effect immediately. Database triggers record it on each
// change (JHDN_orders.updated_by and JHDN_order_history.device).
const fetchWithDevice: typeof fetch = (input, init) => {
  const name = getDeviceName();
  if (!name) return fetch(input, init);
  const headers = new Headers(init?.headers);
  headers.set("x-jhdn-device", encodeDeviceHeader(name));
  return fetch(input, { ...init, headers });
};

export const supabase = createClient(
  supabaseUrl || "https://placeholder.supabase.co",
  supabaseAnonKey || "placeholder",
  { global: { fetch: fetchWithDevice } }
);
