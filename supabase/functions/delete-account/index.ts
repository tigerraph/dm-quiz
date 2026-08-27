// dm-quiz — delete-account edge function
//
// The database is insert-only for anon, so account deletion needs the
// service role. This function deletes the CALLING user only: it validates
// the caller's JWT, removes their dm_identities links, and deletes the
// auth user. Star rows stay — they are keyed to pseudonymous device
// tokens, and without identity links they no longer point at anyone.
//
// Deploy (needs the Supabase CLI, logged in as the project owner):
//   supabase functions deploy delete-account --project-ref bvglvdcndhqrvpnghrkp
//
// SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY are injected
// automatically on deployed functions; nothing to configure.

import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const authHeader = req.headers.get("Authorization") ?? "";
  const asCaller = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: { user } } = await asCaller.auth.getUser();
  if (!user) return new Response("unauthorized", { status: 401, headers: cors });

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const { error: linkErr } = await admin.from("dm_identities")
    .delete().eq("user_id", user.id);
  if (linkErr) return new Response(linkErr.message, { status: 500, headers: cors });

  const { error: userErr } = await admin.auth.admin.deleteUser(user.id);
  if (userErr) return new Response(userErr.message, { status: 500, headers: cors });

  return new Response("ok", { headers: cors });
});
