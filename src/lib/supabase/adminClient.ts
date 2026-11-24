import { createClient } from "@supabase/supabase-js";

// Separate client for the admin /history page. It keeps its login under its
// own storage key, so signing in there never changes how the everyday pages
// (which use the shared `supabase` client) talk to the database.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const adminSupabase = createClient(
  supabaseUrl || "https://placeholder.supabase.co",
  supabaseAnonKey || "placeholder",
  { auth: { storageKey: "jhdn-admin-auth", persistSession: true, autoRefreshToken: true } }
);
