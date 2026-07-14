import { createClient } from "@supabase/supabase-js";

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

export const supabase = createClient(
  supabaseUrl || "https://placeholder.supabase.co",
  supabaseAnonKey || "placeholder"
);
