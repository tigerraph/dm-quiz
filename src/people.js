/* ==================================================================
   People (?view=people) — Rafa's pick A «Tap a person», 05.11.2026, from
   mocks/user-management/index.html. Replaces pasting SQL into dm_admins and
   inviting from the Supabase dashboard.

     list      every My DM account, the admin first, then moderators, open invites,
               everyone else; search by name or email
     tap       a sheet slides up: Moderator switch (on/off, asks before removing),
               Player always on; the admin's own switch is locked
     invite    by email: an existing account becomes moderator at once; a new
               address gets a Supabase sign-in mail, opens it, chooses their own
               password (?view=reset&invite=1 in src/account.js) and is moderator

   Every rule is checked on the server (docs/supabase-migration-007-people.sql): the
   page only calls the dm_* functions as the logged-in user, and they refuse anyone
   but the admin. The page shows only what the server sent; when it refuses, is
   missing (before 007) or does not answer, there is no list and nothing to switch.
   Labels stay English, like the Moderator kit and the admin page (one admin).
   Injected by build.mjs after site.js; shares the app's state (AUTH, asUser, siteBar).
   ================================================================== */
let ppRows = null;        // the last list the server sent, never edited locally
let ppState = "";         // loading | ok | missing | refused | error
let ppQuery = "";
let ppOpen = null;        // key of the person whose sheet is open
let ppBusy = false;
const ppKey = r => r.user_id || "invite:" + r.email;

async function ppCall(fn, args){
  const r = await asUser("rpc/" + fn, { method:"POST",
    headers:{ "Content-Type":"application/json" }, body: JSON.stringify(args || {}) });
  if(!r) return { ok:false, status:0, j:null };
  let j = null;
  try{ j = await r.json(); }catch(e){}
  return { ok:r.ok, status:r.status, j };
}
const ppRefused = r => r.status === 401 || r.status === 403 || (r.j && r.j.code === "42501");

/* ---------- the people, from the server's rows ---------- */
function ppPerson(r){
  const local = String(r.email || "").split("@")[0];
  return { key: ppKey(r), id: r.user_id, email: r.email || "", name: r.name || local || r.email,
    admin: r.role === "admin", mod: !!r.role, pend: !r.role && !!r.invited_at, me: !!r.is_me,
    account: !!r.user_id, since: r.moderator_since, created: r.account_since, seen: r.last_seen, invited: r.invited_at };
}
function ppPeople(){
  const rank = p => p.admin ? 0 : p.mod ? 1 : p.pend ? 2 : 3;
  return (ppRows || []).map(ppPerson)
    .sort((a, b)=>rank(a) - rank(b) || a.name.localeCompare(b.name) || a.email.localeCompare(b.email));
}
const ppFind = key => ppPeople().find(p=>p.key === key) || null;
const ppInitials = p => p.pend && !p.account ? "✉"
  : (p.name.match(/[\p{L}\p{N}]+/gu) || ["?"]).slice(0, 2).map(w=>w[0]).join("").toUpperCase();
const ppDay = iso => { const d = new Date(iso); return isNaN(d) ? "" : d.toLocaleDateString("en-GB", { day:"numeric", month:"short", year:"numeric" }); };
function ppTags(p){
  return (p.admin ? `<span class="pp-tag adm">Admin</span>` : "")
    + (p.pend ? `<span class="pp-tag pend">Invite sent</span>` : p.mod && !p.admin ? `<span class="pp-tag mod">Moderator</span>` : "");
}
function ppSinceLine(p){
  if(p.admin) return "Admin" + (p.since ? " since " + ppDay(p.since) : "") + " · only the admin changes moderators";
  if(p.pend) return "Invite sent " + ppDay(p.invited) + ", not accepted yet";
  if(p.mod) return "Moderator" + (p.since ? " since " + ppDay(p.since) : "");
  return [p.created ? "Account since " + ppDay(p.created) : "", p.seen ? "last seen " + ppDay(p.seen) : ""].filter(Boolean).join(" · ");
}

/* ---------- page ---------- */
async function renderPeople(){
  phase = "people"; document.body.classList.add("site");
  await resolveRole();
  if(phase !== "people") return;
  let body;
  if(!AUTH) body = `<p class="sub">Log in with the admin account to manage who moderates.</p>
      <a class="btn small" href="${esc(loginHref())}">${esc(t().login)}</a>`;
  else if(siteRole !== "moderator") body = `<p class="sub">This page is only for the DM admin.</p>
      <a class="lnk" href="./">‹ ${esc(st().backHome)}</a>`;
  else body = `<section class="postkit pp-card" aria-label="People"><div class="lbl">People · My DM accounts</div>
      <div class="kit" id="ppkit">${ppKitHtml()}</div></section>`;
  app.innerHTML = `${siteBar()}
    <div class="kicker">Democracy Matters · Admin</div>
    <h1>People</h1>
    ${body}
    <div class="pp-bg" id="ppsheet" hidden></div>
    <div class="pp-toast" id="pptoast" role="status" aria-live="polite"></div>`;
  bindSiteBar();
  if(AUTH && siteRole === "moderator"){ bindPeople(); if(!ppRows && ppState !== "loading") ppLoad(); }
}

function ppKitHtml(){
  if(ppState === "missing") return `<h2>People</h2>
    <p class="meta pp-note">Waiting for the database update (docs/supabase-migration-007-people.sql). Until it has run, nothing here can be seen or changed.</p>`;
  if(ppState === "refused") return `<h2>People</h2>
    <p class="meta pp-note">Only the admin can make or remove moderators. You are a moderator: the Moderator kit is on every session page.</p>`;
  if(ppState === "error") return `<h2>People</h2>
    <p class="meta pp-note">The list could not be loaded, so nothing can be changed right now.</p>
    <button type="button" class="btn small ghost" id="ppretry">Try again</button>`;
  if(ppState !== "ok") return `<h2>People</h2><p class="meta pp-note">Loading …</p>`;
  return `<h2>Moderators and players</h2><div class="meta">Tap a person to see and change what they can do.</div>
    <form class="pp-invite" id="ppinv" novalidate>
      <input type="email" id="ppmail" autocomplete="off" autocapitalize="none" spellcheck="false" inputmode="email"
        placeholder="Invite by email: name@example.org" aria-label="Email to invite" maxlength="254">
      <button class="btn small" type="submit" id="ppinvbtn">Invite as moderator</button>
    </form>
    <input type="search" class="pp-search" id="ppq" placeholder="Search by name or email" aria-label="Search people" value="${esc(ppQuery)}">
    <ul class="pp-list" id="pplist">${ppListHtml()}</ul>`;
}
function ppListHtml(){
  const q = ppQuery.trim().toLowerCase();
  const list = ppPeople().filter(p=>!q || (p.name + " " + p.email).toLowerCase().includes(q));
  if(!list.length) return `<li class="meta pp-none">${q ? "Nobody matches." : "No My DM accounts yet."}</li>`;
  return list.map(p=>`<li><button type="button" class="pp-row" data-pp="${esc(p.key)}">
      <span class="pp-av" aria-hidden="true">${esc(ppInitials(p))}</span>
      <span class="pp-who"><span class="pp-n">${esc(p.name)}${p.me ? " (you)" : ""}</span><span class="pp-e">${esc(p.email)}</span></span>
      ${ppTags(p)}<span class="pp-chev" aria-hidden="true">›</span></button></li>`).join("");
}

async function ppLoad(){
  ppState = ppRows ? ppState : "loading";
  const r = await ppCall("dm_people");
  if(r.ok && Array.isArray(r.j)){ ppRows = r.j; ppState = "ok"; }
  else{
    ppRows = null;
    ppState = r.status === 404 ? "missing" : ppRefused(r) ? "refused" : "error";
  }
  if(phase !== "people") return;
  const kit = document.getElementById("ppkit");
  if(kit){
    const typed = document.getElementById("ppmail"), keep = typed ? typed.value : "";
    kit.innerHTML = ppKitHtml(); bindPeopleKit();
    const again = document.getElementById("ppmail"); if(again) again.value = keep;   // a failed invite keeps the address
  }
  if(ppOpen) ppSheet(ppFind(ppOpen));
}

function bindPeople(){
  bindPeopleKit();
  const bg = document.getElementById("ppsheet");
  bg.onclick = e=>{ if(e.target === bg) ppClose(); };
  if(!bindPeople.esc){ bindPeople.esc = true; document.addEventListener("keydown", e=>{ if(e.key === "Escape" && ppOpen && phase === "people") ppClose(); }); }
}
function bindPeopleKit(){
  const el = id => document.getElementById(id);
  if(el("ppretry")) el("ppretry").onclick = ()=>{ ppState = "loading"; el("ppkit").innerHTML = ppKitHtml(); ppLoad(); };
  if(el("ppq")) el("ppq").oninput = e=>{ ppQuery = e.target.value; el("pplist").innerHTML = ppListHtml(); bindRows(); };
  if(el("ppinv")) el("ppinv").onsubmit = e=>{ e.preventDefault(); ppInvite(el("ppmail")); };
  bindRows();
}
function bindRows(){
  app.querySelectorAll("[data-pp]").forEach(b=>b.onclick = ()=>ppSheet(ppFind(b.dataset.pp), b));
}

/* ---------- the sheet ---------- */
let ppReturn = null;    // the row to give focus back to
function ppSheet(p, from){
  const bg = document.getElementById("ppsheet");
  if(!bg) return;
  if(!p){ ppClose(); return; }
  if(from) ppReturn = from;
  const wasOpen = ppOpen === p.key && !bg.hidden;
  ppOpen = p.key;
  const locked = p.admin || p.me;
  bg.innerHTML = `<div class="pp-sheet" role="dialog" aria-modal="true" aria-labelledby="ppname">
    <div class="pp-top"><span class="pp-av" aria-hidden="true">${esc(ppInitials(p))}</span>
      <span class="pp-who"><span class="pp-n" id="ppname">${esc(p.name)}</span><span class="pp-e">${esc(p.email)}</span></span>${ppTags(p)}</div>
    <div class="pp-right"><span class="pp-t"><b>Moderator</b><small>Sees the Moderator kit, the run sheet and the slide links</small></span>
      <button type="button" class="pp-sw" role="switch" id="ppmod" aria-checked="${p.mod || p.pend}" aria-label="Moderator"
        ${locked || ppBusy ? "disabled" : ""} ${locked ? `title="${p.me ? "You can’t remove yourself" : "The admin can’t be switched off here"}"` : ""}></button></div>
    <div class="pp-right"><span class="pp-t"><b>Player</b><small>${p.account ? "Plays quizzes and collects stars. Everyone with an account." : "Once they accept the invite: plays quizzes and collects stars."}</small></span>
      <button type="button" class="pp-sw" role="switch" aria-checked="true" disabled aria-label="Player (always on)"></button></div>
    ${locked ? `<p class="meta pp-lock">${p.me ? "This is you. Your own switch is locked, so you can’t lock yourself out." : "An admin can’t be switched off here."}</p>` : ""}
    <div class="pp-foot"><span class="meta">${esc(ppSinceLine(p))}</span>
      <span class="pp-acts">${p.pend ? `<button type="button" class="btn small ghost" id="ppresend" ${ppBusy ? "disabled" : ""}>Send the invite again</button>` : ""}
      <button type="button" class="btn small" id="ppdone">Done</button></span></div>
  </div>`;
  bg.hidden = false;
  document.getElementById("ppdone").onclick = ppClose;
  const sw = document.getElementById("ppmod");
  sw.onclick = ()=>ppToggle(p);
  const rs = document.getElementById("ppresend");
  if(rs) rs.onclick = ()=>ppResend(p);
  if(!wasOpen) (locked ? document.getElementById("ppdone") : sw).focus();
}
function ppClose(){
  const bg = document.getElementById("ppsheet");
  if(bg){ bg.hidden = true; bg.innerHTML = ""; }
  ppOpen = null;
  if(ppReturn && document.body.contains(ppReturn)) ppReturn.focus();
  else if(ppReturn){ const b = app.querySelector(`[data-pp="${CSS.escape(ppReturn.dataset.pp)}"]`); if(b) b.focus(); }
  ppReturn = null;
}
function ppToast(text){
  const el = document.getElementById("pptoast");
  if(!el) return;
  el.textContent = text; el.classList.add("on");
  clearTimeout(el._t); el._t = setTimeout(()=>el.classList.remove("on"), 4200);
}
function ppFail(r, what){
  if(r.status === 404) return "The database update has not run yet (migration 007): nothing was changed.";
  if(ppRefused(r)) return "Only the admin can " + what + ". Nothing was changed.";
  if(!r.status) return "No connection. Nothing was changed.";
  return "That did not work: " + ((r.j && r.j.message) || "error " + r.status) + ". Nothing was changed.";
}
async function ppBusyRun(fn){
  if(ppBusy) return;
  ppBusy = true;
  const sw = document.getElementById("ppmod"); if(sw) sw.disabled = true;
  try{ await fn(); } finally { ppBusy = false; await ppLoad(); }
}

/* switch: on asks nothing, off asks once; an open invite switched off is cancelled */
function ppToggle(p){
  if(p.admin || p.me || ppBusy) return;
  const on = !(p.mod || p.pend);
  if(!on){
    const q = p.pend ? `Cancel the invite to ${p.email}? They will not become a moderator.`
                     : `${p.name} will no longer see the Moderator kit. Remove?`;
    if(!confirm(q)){ ppSheet(p); return; }
  }
  ppBusyRun(async ()=>{
    const r = p.pend && !p.account ? await ppCall("dm_cancel_invite", { p_email:p.email })
                                   : await ppCall("dm_set_moderator", { p_user:p.id, p_on:on });
    if(!r.ok) return ppToast(ppFail(r, "change moderators"));
    ppToast(p.pend ? `Invite to ${p.email} cancelled.` : on ? `${p.name} is now a moderator.` : `${p.name} is no longer a moderator.`);
  });
}

/* the mail: Supabase's own sign-in mail, which also creates the account; the link brings
   the person to ?view=reset&invite=1 to choose a password (src/account.js) */
async function ppSendMail(email){
  const r = await authReq("otp?redirect_to=" + encodeURIComponent(AUTH_BASE + "?view=reset&invite=1"),
                          { email, create_user:true });
  if(r && r.ok) return "";
  if(r && (r.status === 429 || /rate_limit/.test((r.j && (r.j.error_code || r.j.code)) || "")))
    return "Supabase is sending too many mails right now. Open the person in a few minutes and press «Send the invite again».";
  return "The mail could not be sent" + (r ? " (error " + r.status + ")" : ": no connection") + ". Open the person and press «Send the invite again».";
}
function ppInvite(input){
  const email = (input.value || "").trim().toLowerCase();
  if(!EMAIL_RE.test(email)){ ppToast("Please enter a valid email address."); input.focus(); return; }
  ppBusyRun(async ()=>{
    const btn = document.getElementById("ppinvbtn"); if(btn) btn.disabled = true;
    const r = await ppCall("dm_invite_moderator", { p_email:email });
    if(!r.ok) return ppToast(r.j && r.j.code === "22023" ? "That is not an email address." : ppFail(r, "invite moderators"));
    input.value = ""; const again = document.getElementById("ppmail"); if(again) again.value = "";
    if(r.j === "already") return ppToast(`${email} is already a moderator.`);
    if(r.j === "moderator") return ppToast(`${email} already has a My DM account and is now a moderator. No mail needed.`);
    const err = await ppSendMail(email);
    ppToast(err ? `Invite saved for ${email}. ${err}` : `Invite sent to ${email}. They choose their own password.`);
  });
}
function ppResend(p){
  ppBusyRun(async ()=>{
    const r = await ppCall("dm_invite_moderator", { p_email:p.email });
    if(!r.ok) return ppToast(ppFail(r, "invite moderators"));
    if(r.j !== "invite") return ppToast(`${p.email} is already a moderator.`);
    const err = await ppSendMail(p.email);
    ppToast(err || `Invite sent again to ${p.email}.`);
  });
}
