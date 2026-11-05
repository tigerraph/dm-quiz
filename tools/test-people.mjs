#!/usr/bin/env node
/*
 * The People page (?view=people, Rafa's pick A «Tap a person», 05.11.2026) in
 * headless Chrome against tools/mock-supabase.mjs, which answers the functions of
 * docs/supabase-migration-007-people.sql with the same refusals (the SQL itself is
 * proven on Postgres by tools/test-people-schema.mjs). tools/test-people.html taps
 * through the built app in an iframe.
 *
 *   guest, player, moderator   no list; a moderator is refused by the server
 *   before 007                 «waiting for the database update», nothing to switch
 *   the admin, 1440 px         list, sheet, switch on, cancel the confirm, remove, own
 *                              switch locked, invite a new address (mail in the mock
 *                              outbox only), invite an existing account, a bad address
 *   the admin, 380 px          no sideways scroll, the sheet fits the phone
 *   the invited person         mail link → choose a password → other devices signed
 *                              out → moderator; the Moderator kit links to the page
 *
 * No real Supabase, no real mail: everything stays in the mock's memory.
 *
 *   npm run build && node tools/test-people.mjs
 */
import { spawn, execFile } from "node:child_process";
import { join, dirname } from "node:path";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { chromePath } from "./topic-lib.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const chrome = chromePath();
if (!chrome) { console.error("✗ no Chrome found (set CHROME)"); process.exit(1); }

let bad = 0;
const ok = (cond, what) => { console.log(`${cond ? "✓" : "✗"} ${what}`); if (!cond) bad++; };
const TMP = process.env.RUNNER_TEMP || process.env.TMPDIR || "/tmp";

async function mock(port, args = []) {
  const p = spawn(process.execPath, [join(ROOT, "tools/mock-supabase.mjs"), String(port), "--self", ...args],
    { stdio: ["ignore", "pipe", "inherit"] });
  await new Promise((res, rej) => {
    p.stdout.on("data", d => { if (String(d).includes("mock supabase")) res(); });
    p.on("exit", c => rej(new Error("mock exited " + c)));
  });
  return p;
}
let n = 0;
// as root (a container) Chrome refuses to start without --no-sandbox; CI runs as a normal user
const ROOTFLAGS = process.getuid && process.getuid() === 0 ? ["--no-sandbox"] : [];
const dump = (url, w, h) => new Promise(r => execFile(chrome, [...ROOTFLAGS, "--headless", "--disable-gpu", `--window-size=${w + 40},${h + 200}`,
  `--user-data-dir=${join(TMP, `dmq-people-${process.pid}-${n++}`)}`, "--virtual-time-budget=60000", "--dump-dom", url],
  { maxBuffer: 64 << 20, timeout: 120000 }, (e, out) => r(out || "")));
function api(base) {
  const call = async (path, body, headers = {}) => {
    const r = await fetch(base + path, { method: body === undefined ? "GET" : "POST", redirect: "manual",
      headers: { apikey: "mock", "Content-Type": "application/json", ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
    const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch {}
    return { status: r.status, j, location: r.headers.get("location") };
  };
  const as = s => ({ Authorization: "Bearer " + s.access_token, "Content-Profile": "dm" });
  return {
    call, as,
    async signup(email, name) {
      const s = (await call("/auth/v1/signup", { email, password: "secret-" + name })).j;
      // a My DM login links the device (src/template.html linkDeviceToUser); a name comes from a quiz
      await call("/rest/v1/dm_identities", { user_id: s.user.id, token: "dev-" + name }, as(s));
      await call("/rest/v1/dm_players", { session: "s1", token: "dev-" + name, name, round: 0 }, { Authorization: "Bearer mock", "Content-Profile": "dm" });
      return s;
    },
    flag: (email, role = "") => fetch(`${base}/__admin?email=${encodeURIComponent(email)}${role ? "&role=" + role : ""}`),
    users: async () => (await call("/__users")).j,
    invites: async () => (await call("/__invites")).j,
    mail: async () => (await call("/__mail")).j,
    log: async () => (await call("/__log")).j,
  };
}
const authOf = s => JSON.stringify({ at: s.access_token, rt: s.refresh_token, uid: s.user.id, email: s.user.email });
async function page(base, { u = "/?view=people", auth = null, steps = [], w = 1440, h = 900 }) {
  const q = new URLSearchParams({ u: u.startsWith("http") ? u : base + u, auth: auth ? authOf(auth) : "", steps: JSON.stringify(steps), w, h });
  const dom = await dump(`${base}/tools/test-people.html?${q}`, w, h);
  const m = dom.match(/<pre id="out">([\s\S]*?)<\/pre>/);
  try { return JSON.parse(m[1].replaceAll("&quot;", '"').replaceAll("&lt;", "<").replaceAll("&gt;", ">").replaceAll("&amp;", "&")); }
  catch { return { error: "no harness output" }; }
}
const row = (snap, email) => (snap && snap.rows || []).find(r => r.email === email);
const roleOf = async (A, email) => ((await A.users()).find(u => u.email === email) || {}).role || null;

// ------------------------------------------------------------ before 007
{
  const PORT = 4194, base = `http://localhost:${PORT}`, srv = await mock(PORT, ["--no-007"]);
  try {
    const A = api(base);
    const rafa = await A.signup("rafa@example.org", "Rafa"); await A.flag("rafa@example.org", "admin");
    const r = await page(base, { auth: rafa, steps: [{ wait: "#ppkit" }, { sleep: 800 }, { snap: "s" }] });
    ok(/Waiting for the database update/.test(r.s && r.s.kit), "before 007: the admin is told the database update has not run");
    ok(r.s && r.s.rows.length === 0 && !r.s.kit.includes("Invite"), "before 007: no list, no invite field");
  } finally { srv.kill(); }
}

// ------------------------------------------------------------ after 007
const PORT = 4195, base = `http://localhost:${PORT}`, srv = await mock(PORT);
try {
  const A = api(base);
  const rafa  = await A.signup("rafa@example.org", "Rafa");    await A.flag("rafa@example.org", "admin");
  const lea   = await A.signup("lea@example.org", "Lea");      await A.flag("lea@example.org");
  const marco = await A.signup("marco@example.ch", "Marco");
  await A.signup("sina@example.com", "Sina");

  // who may see it
  const guest = await page(base, { steps: [{ snap: "s" }] });
  ok(guest.s && guest.s.phase === "people" && !guest.s.kit && /Log in with the admin account/.test(guest.s.body), "guest: asked to log in, no list");
  const player = await page(base, { auth: marco, steps: [{ snap: "s" }] });
  ok(player.s && !player.s.kit && player.s.rows.length === 0 && /only for the DM admin/.test(player.s.body), "player: «only for the DM admin», no list");
  const mod = await page(base, { auth: lea, steps: [{ wait: "#ppkit" }, { sleep: 800 }, { snap: "s" }] });
  ok(/Only the admin can make or remove moderators/.test(mod.s && mod.s.kit), "moderator: the server refuses, the page says only the admin");
  ok(mod.s && mod.s.rows.length === 0 && !mod.s.emailsInPage.some(e => e !== "lea@example.org"), "moderator: no other account's email in the page");
  ok((await A.log()).some(e => e.path === "rpc/dm_people" && e.status === 403), "moderator: dm_people answered 403");

  // the server refuses anyone but the admin, whatever the page does
  const direct = [
    [await A.call("/rest/v1/rpc/dm_set_moderator", { p_user: marco.user.id, p_on: true }, A.as(lea)), 403, "a moderator switching someone on"],
    [await A.call("/rest/v1/rpc/dm_invite_moderator", { p_email: "x@example.org" }, A.as(marco)), 403, "a player inviting"],
    [await A.call("/rest/v1/rpc/dm_people", {}, { Authorization: "Bearer mock", "Content-Profile": "dm" }), 401, "anon listing"],
    [await A.call("/rest/v1/rpc/dm_set_moderator", { p_user: rafa.user.id, p_on: false }, A.as(rafa)), 403, "the admin switching themselves off"],
  ];
  for (const [r, want, what] of direct) ok(r.status === want, `server refuses ${what} (${r.status})`);
  ok(await roleOf(A, "marco@example.ch") === null && await roleOf(A, "rafa@example.org") === "admin", "…and nothing changed");

  // the admin, desktop
  const MARCO = `[data-pp="${marco.user.id}"]`, RAFA = `[data-pp="${rafa.user.id}"]`;
  const d = await page(base, { auth: rafa, steps: [
    { wait: "#pplist .pp-row" }, { snap: "list" },
    { click: MARCO }, { snap: "sheet" },
    { click: "#ppmod" }, { sleep: 600 }, { snap: "on" },
    { confirm: false }, { click: "#ppmod" }, { sleep: 600 }, { snap: "kept" },
    { confirm: true }, { click: "#ppmod" }, { sleep: 600 }, { snap: "off" },
    { click: "#ppdone" }, { click: RAFA }, { snap: "self" }, { click: "#ppdone" },
    { fill: ["#ppmail", "not-an-email"] }, { submit: "#ppinv" }, { snap: "badmail" },
    { fill: ["#ppmail", "Karime.New@Example.org"] }, { submit: "#ppinv" }, { sleep: 600 }, { snap: "invited" },
    { fill: ["#ppmail", "sina@example.com"] }, { submit: "#ppinv" }, { sleep: 600 }, { snap: "existing" },
    { fill: ["#ppq", "sina"] }, { snap: "search" },
  ] });
  ok(!d.error, "admin 1440: every step ran" + (d.error ? ` (${d.error})` : ""));
  const L = d.list || { rows: [] };
  ok(L.rows.length === 4, `admin: lists the 4 My DM accounts (${L.rows.length})`);
  ok(L.rows[0] && L.rows[0].email === "rafa@example.org" && L.rows[0].tags.includes("Admin") && /you/.test(L.rows[0].name), "admin: first row is the admin, marked (you)");
  ok(row(L, "lea@example.org") && row(L, "lea@example.org").tags.includes("Moderator") && L.rows[1].email === "lea@example.org", "admin: moderators next, tagged Moderator");
  ok(row(L, "marco@example.ch") && row(L, "marco@example.ch").name === "Marco" && !row(L, "marco@example.ch").tags.length, "admin: a player shows the quiz name, no tag");
  ok(d.sheet && d.sheet.sheetOpen && d.sheet.sheetName === "Marco" && d.sheet.sw.checked === "false" && !d.sheet.sw.disabled, "tap a person: the sheet opens, Moderator off");
  ok(d.on && d.on.sw.checked === "true" && /Marco is now a moderator/.test(d.on.toast) && row(d.on, "marco@example.ch").tags.includes("Moderator"),
    "switch on: moderator, said in a toast, tagged in the list");
  ok(d.confirms.length >= 1 && /Marco will no longer see the Moderator kit/.test(d.confirms[0]), "switch off asks first");
  ok(d.kept && d.kept.sw.checked === "true", "…answering no keeps the moderator");
  ok(d.off && d.off.sw.checked === "false" && /no longer a moderator/.test(d.off.toast), "…answering yes removes them");
  ok(await roleOf(A, "marco@example.ch") === null, "server: Marco is a player again");
  ok(d.self && d.self.sheetName === "Rafa" && d.self.sw.disabled === true && d.self.sw.checked === "true", "the admin's own switch is on and locked");
  ok(d.badmail && /valid email/.test(d.badmail.toast), "a bad address is refused in the page");
  const inv = (await A.invites()).map(i => i.email), mails = await A.mail();
  ok(inv.includes("karime.new@example.org"), "invite: the server holds an open invite (lower case)");
  const m = mails.find(x => x.to === "Karime.New@Example.org" || x.to === "karime.new@example.org");
  ok(m && /redirect_to=[^&]*%3Fview%3Dreset%26invite%3D1/.test(m.link), "invite: one sign-in mail, in the mock's outbox, back to ?view=reset&invite=1");
  ok(d.invited && /Invite sent to karime\.new@example\.org/.test(d.invited.toast) && row(d.invited, "karime.new@example.org")
     && row(d.invited, "karime.new@example.org").tags.includes("Invite sent"), "invite: toast, and the list shows «Invite sent»");
  ok(d.existing && /already has a My DM account and is now a moderator/.test(d.existing.toast) && await roleOf(A, "sina@example.com") === "moderator",
    "inviting an existing account makes it moderator at once");
  ok(!mails.some(x => x.to === "sina@example.com"), "…and sends no mail");
  ok(d.search && d.search.rows.length === 1 && d.search.rows[0].email === "sina@example.com", "search narrows the list");

  // the admin, phone
  const p = await page(base, { auth: rafa, w: 380, h: 800, steps: [{ wait: "#pplist .pp-row" }, { snap: "list" }, { click: MARCO }, { snap: "sheet" }] });
  ok(p.list && p.list.scrollW <= p.list.vw, `380 px: no sideways scroll (${p.list && p.list.scrollW} ≤ ${p.list && p.list.vw})`);
  const b = p.sheet && p.sheet.sheetBox;
  ok(b && b.left >= 0 && b.right <= p.sheet.vw && b.bottom <= p.sheet.vh && b.top >= 0, `380 px: the sheet fits the phone (${JSON.stringify(b)} in ${p.sheet && p.sheet.vw}×${p.sheet && p.sheet.vh})`);

  // the invited person: a second device is signed in too (a second link opened elsewhere)
  await A.call("/auth/v1/otp", { email: "karime.new@example.org", create_user: false });
  const second = (await A.mail()).filter(x => /karime\.new/i.test(x.to)).pop();
  const v = await A.call(second.link.replace(/^http:\/\/localhost:\d+/, ""));
  ok(v.status === 303 && /access_token=/.test(v.location || ""), "a second device signs in to the invited account");
  ok(((await A.users()).find(u => u.email === "karime.new@example.org") || {}).sessions === 1, "…one session open before the first link is used");
  const welcome = await page(base, { u: m.link, w: 380, h: 800, steps: [
    { wait: "#rform" }, { snap: "form" }, { fill: ["#anewpw", "karime-pw-1"] }, { submit: "#rform" }, { sleep: 1500 }, { snap: "done" }] });
  ok(welcome.form && /Welcome to Democracy Matters/.test(welcome.form.h1) && /invited to moderate/.test(welcome.form.screen), "the link opens «Welcome»: choose a password");
  ok(welcome.done && /You are a moderator now/.test(welcome.done.screen), "after the password: «You are a moderator now»");
  const k = (await A.users()).find(u => u.email === "karime.new@example.org") || {};
  ok(k.role === "moderator" && k.hasPassword, "server: moderator, with the password they chose");
  ok(k.sessions === 1, "server: the other device was signed out before the invite was claimed");
  ok(!(await A.invites()).some(i => i.email === "karime.new@example.org"), "server: the invite is used up");

  // the way in: the Moderator kit links to the page
  const html = readFileSync(join(ROOT, "index.html"), "utf8");
  ok(html.includes(`a("?view=people", "People &amp; moderators"`), "the Moderator kit links to People");
} finally { srv.kill(); }

console.log(bad ? `\n${bad} check(s) failed.` : "\nThe People page works, and refuses everyone but the admin.");
process.exit(bad ? 1 : 0);
