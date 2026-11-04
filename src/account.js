/* ==================================================================
   Account: log in, create account, forgotten password, sign-in link
   (Rafa, 04.11.2026: «the sign-up/sign-in process is crap. there's no pw reset etc.»)

   The same form sits on the login page (?view=login) and on the passport (?view=mydm).
     log in        email + password (show/hide), «stay signed in», «Forgot password?»,
                   or «Email me a sign-in link» (Supabase magic link, existing accounts only; an unknown
                   address gets the same «if there is an account…» screen, nothing is revealed)
     create        email + new password (show/hide, 6 characters minimum)
     forgot        email -> Supabase sends the reset mail -> ?view=reset sets a new password
   Links in the mails come back with the session in the URL hash (GoTrue implicit flow);
   authCallback() picks it up before any page renders.

   Supabase settings this needs (dashboard, Authentication -> URL Configuration):
     Site URL  https://dmatters.org      Redirect URLs  https://dmatters.org/**
   Without the redirect entry Supabase sends the person to the Site URL instead.
   Injected by build.mjs next to site.js; shares the app's state (AUTH, store, t(), st()).
   ================================================================== */
const ACC_T = {
 en:{ show:"Show", hide:"Hide", stay:"Stay signed in on this device", forgot:"Forgot password?", or:"or",
  magic:"Email me a sign-in link", newHere:"New here?", haveAcct:"Already have an account?", pwHint:"At least 6 characters.",
  forgotTitle:"Reset your password", forgotSub:"Enter your email. We send you a link to set a new password.",
  sendReset:"Send the link", backLogin:"Back to log in", sentTitle:"Check your inbox",
  sentReset:e=>`If there is an account for ${e}, a link to set a new password is on its way. It can take a few minutes; check your spam folder too.`,
  sentMagic:e=>`If there is an account for ${e}, a sign-in link is on its way. Open it on this device. It can take a few minutes; check your spam folder too.`,
  resend:"Send it again", wrongCreds:"Email or password is wrong.", rate:"Too many tries. Please wait a few minutes, then try again.",
  offline:"No connection. Check your internet and try again.",
  emailInvalid:"Please enter a valid email address.", linkExpired:"This link has expired or was already used. Ask for a new one.", expiredTitle:"Link expired", doneTitle:"All set",
  resetTitle:"Set a new password", resetSub:e=>`Choose a new password for ${e}.`, savePw:"Save new password",
  resetDone:"Password saved. You are logged in.", toMyDM:"Go to My DM", resetNoLink:"Open the link from the email again, or ask for a new one.",
  confirmFirst:"Please confirm your email first: the link is in your inbox.", busy:"One moment …" },
 de:{ show:"Zeigen", hide:"Verbergen", stay:"Auf diesem Gerät angemeldet bleiben", forgot:"Passwort vergessen?", or:"oder",
  magic:"Anmelde-Link per E-Mail schicken", newHere:"Neu hier?", haveAcct:"Schon einen Account?", pwHint:"Mindestens 6 Zeichen.",
  forgotTitle:"Passwort zurücksetzen", forgotSub:"Gib deine E-Mail ein. Wir schicken dir einen Link, mit dem du ein neues Passwort setzt.",
  sendReset:"Link schicken", backLogin:"Zurück zur Anmeldung", sentTitle:"Schau in dein Postfach",
  sentReset:e=>`Falls es für ${e} einen Account gibt, ist ein Link für ein neues Passwort unterwegs. Das kann ein paar Minuten dauern; schau auch im Spam-Ordner nach.`,
  sentMagic:e=>`Falls es für ${e} einen Account gibt, ist ein Anmelde-Link unterwegs. Öffne ihn auf diesem Gerät. Das kann ein paar Minuten dauern; schau auch im Spam-Ordner nach.`,
  resend:"Nochmals schicken", wrongCreds:"E-Mail oder Passwort stimmt nicht.", rate:"Zu viele Versuche. Warte bitte ein paar Minuten und versuche es dann nochmals.",
  offline:"Keine Verbindung. Prüfe dein Internet und versuche es nochmals.",
  emailInvalid:"Bitte gib eine gültige E-Mail-Adresse ein.", linkExpired:"Dieser Link ist abgelaufen oder wurde schon benutzt. Fordere einen neuen an.", expiredTitle:"Link abgelaufen", doneTitle:"Fertig",
  resetTitle:"Neues Passwort setzen", resetSub:e=>`Wähle ein neues Passwort für ${e}.`, savePw:"Neues Passwort speichern",
  resetDone:"Passwort gespeichert. Du bist angemeldet.", toMyDM:"Zu My DM", resetNoLink:"Öffne den Link aus der E-Mail nochmals oder fordere einen neuen an.",
  confirmFirst:"Bestätige zuerst deine E-Mail: Der Link ist in deinem Postfach.", busy:"Einen Moment …" },
 fr:{ show:"Afficher", hide:"Masquer", stay:"Garder la session ouverte sur cet appareil", forgot:"Mot de passe oublié ?", or:"ou",
  magic:"Recevoir un lien de connexion par e-mail", newHere:"Nouveau ici ?", haveAcct:"Déjà un compte ?", pwHint:"Au moins 6 caractères.",
  forgotTitle:"Réinitialiser le mot de passe", forgotSub:"Indique ton e-mail. Nous t’envoyons un lien pour choisir un nouveau mot de passe.",
  sendReset:"Envoyer le lien", backLogin:"Retour à la connexion", sentTitle:"Regarde ta boîte mail",
  sentReset:e=>`Si un compte existe pour ${e}, un lien pour un nouveau mot de passe est en route. Cela peut prendre quelques minutes ; regarde aussi dans les spams.`,
  sentMagic:e=>`Si un compte existe pour ${e}, un lien de connexion est en route. Ouvre-le sur cet appareil. Cela peut prendre quelques minutes ; regarde aussi dans les spams.`,
  resend:"Renvoyer", wrongCreds:"L’e-mail ou le mot de passe est incorrect.", rate:"Trop d’essais. Attends quelques minutes, puis réessaie.",
  offline:"Pas de connexion. Vérifie ton internet et réessaie.",
  emailInvalid:"Indique une adresse e-mail valide.", linkExpired:"Ce lien a expiré ou a déjà été utilisé. Demandes-en un nouveau.", expiredTitle:"Lien expiré", doneTitle:"C’est fait",
  resetTitle:"Choisir un nouveau mot de passe", resetSub:e=>`Choisis un nouveau mot de passe pour ${e}.`, savePw:"Enregistrer le mot de passe",
  resetDone:"Mot de passe enregistré. Ta session est ouverte.", toMyDM:"Aller à My DM", resetNoLink:"Ouvre à nouveau le lien de l’e-mail, ou demandes-en un nouveau.",
  confirmFirst:"Confirme d’abord ton e-mail : le lien est dans ta boîte mail.", busy:"Un instant …" },
 it:{ show:"Mostra", hide:"Nascondi", stay:"Resta connesso su questo dispositivo", forgot:"Password dimenticata?", or:"oppure",
  magic:"Inviami un link di accesso via e-mail", newHere:"Nuovo qui?", haveAcct:"Hai già un account?", pwHint:"Almeno 6 caratteri.",
  forgotTitle:"Reimposta la password", forgotSub:"Inserisci la tua e-mail. Ti inviamo un link per scegliere una nuova password.",
  sendReset:"Invia il link", backLogin:"Torna all’accesso", sentTitle:"Controlla la tua casella",
  sentReset:e=>`Se esiste un account per ${e}, un link per una nuova password è in arrivo. Può richiedere qualche minuto; controlla anche lo spam.`,
  sentMagic:e=>`Se esiste un account per ${e}, un link di accesso è in arrivo. Aprilo su questo dispositivo. Può richiedere qualche minuto; controlla anche lo spam.`,
  resend:"Invia di nuovo", wrongCreds:"E-mail o password non corrette.", rate:"Troppi tentativi. Aspetta qualche minuto e riprova.",
  offline:"Nessuna connessione. Controlla internet e riprova.",
  emailInvalid:"Inserisci un indirizzo e-mail valido.", linkExpired:"Questo link è scaduto o è già stato usato. Richiedine uno nuovo.", expiredTitle:"Link scaduto", doneTitle:"Fatto",
  resetTitle:"Imposta una nuova password", resetSub:e=>`Scegli una nuova password per ${e}.`, savePw:"Salva la nuova password",
  resetDone:"Password salvata. Hai effettuato l’accesso.", toMyDM:"Vai a My DM", resetNoLink:"Apri di nuovo il link dell’e-mail o richiedine uno nuovo.",
  confirmFirst:"Conferma prima la tua e-mail: il link è nella tua casella.", busy:"Un momento …" }
};
function at_(){ return ACC_T[lang] || ACC_T.en; }

let acctMode = "";    // logged in: "" | "pw" (change password)
let acctMsg = null;   // {text, err}
let acctAuth = "";    // "login" | "signup" | "forgot" | "sent-reset" | "sent-magic"
let acctEmail = "";   // survives re-renders, so an error never wipes the field
let acctBusy = false;
let acctRender = ()=>renderPassport();   // the page the form sits on (passport, ?view=login, ?view=reset)
/* where links in the mails come back to: this site's own address (localhost in a preview) */
const AUTH_BASE = /^https?:$/.test(location.protocol) ? new URL("./", location.href).href.split("#")[0] : "https://dmatters.org/";

/* ---------- the link from a mail comes back here ---------- */
async function authCallback(){
  const h = location.hash.replace(/^#/, "");
  if(!/(^|&)(access_token|error_code|error)=/.test(h)) return false;
  const H = new URLSearchParams(h);
  try{ history.replaceState(null, "", location.pathname + location.search); }catch(e){}
  if(H.get("error_code") || H.get("error")){ acctMsg = { text: at_().linkExpired, err:true }; return false; }
  const tok = H.get("access_token"), rt = H.get("refresh_token");
  const u = await authReq("user", undefined, tok);
  if(!u || !u.ok || !u.j || !u.j.id){ acctMsg = { text: at_().linkExpired, err:true }; return false; }
  store.set("had_auth", true);
  setAuth({ access_token: tok, refresh_token: rt, user: u.j });
  return false;   // routing goes on: ?view=reset asks for the new password, ?view=login returns to «next»
}

/* ---------- pieces ---------- */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
function pwField(id, auto, ph){
  return `<div class="pwwrap">
    <input id="${id}" name="password" type="password" required minlength="6" autocomplete="${auto}" placeholder="${esc(ph)}" aria-describedby="amsg">
    <button type="button" class="pweye" data-eye="${id}" aria-controls="${id}" aria-pressed="false">${esc(at_().show)}</button>
  </div>`;
}
function emailField(){
  return `<label for="aemail">${esc(t().email)}</label>
    <input id="aemail" name="email" type="email" autocomplete="username" inputmode="email" autocapitalize="none"
      spellcheck="false" required value="${esc(acctEmail)}" placeholder="name@example.org" aria-describedby="amsg">`;
}
function stayBox(){
  return `<label class="stay"><input type="checkbox" id="astay" ${store.get("keep", true) ? "checked" : ""}> ${esc(at_().stay)}</label>`;
}
function msgHtml(){
  return `<p class="msg ${acctMsg && acctMsg.err ? "err" : ""}" id="amsg" role="${acctMsg && acctMsg.err ? "alert" : "status"}" aria-live="polite">${esc(acctMsg ? acctMsg.text : "")}</p>`;
}
function acctTitle(){
  if(AUTH) return t().account;
  const m = acctAuth || "login";
  return m === "signup" ? t().signup : m === "forgot" ? at_().forgotTitle : m.startsWith("sent") ? at_().sentTitle : t().login;
}

function acctHtml(){
  if(AUTH){
    return `<div class="acct">
      <p class="rules">${esc(t().loggedInAs(AUTH.email || ""))}</p>
      ${acctMode==="pw" ? `
        <form id="apwform" class="acct" style="width:100%" novalidate>
          <input type="email" name="email" autocomplete="username" value="${esc(AUTH.email||"")}" hidden>
          <label for="anewpw">${esc(t().newPw)}</label>
          ${pwField("anewpw", "new-password", t().newPw)}
          <p class="hint">${esc(at_().pwHint)}</p>
          <div class="row">
            <button type="submit" class="btn small">${esc(t().save)}</button>
            <button type="button" class="btn ghost small" id="acancel">${esc(t().cancel)}</button>
          </div>
        </form>` : `
        <div class="row">
          <button class="btn ghost small" id="achangepw" type="button">${esc(t().changePw)}</button>
          <button class="btn ghost small" id="alogout" type="button">${esc(t().logout)}</button>
          <button class="btn small danger" id="adelete" type="button">${esc(t().deleteAccount)}</button>
        </div>`}
      ${msgHtml()}
    </div>`;
  }
  if(!acctAuth) acctAuth = store.get("had_auth", false) ? "login" : "signup";
  const m = acctAuth;
  if(m === "sent-reset" || m === "sent-magic"){
    return `<div class="acct">
      <p class="sent">${esc(m === "sent-reset" ? at_().sentReset(acctEmail) : at_().sentMagic(acctEmail))}</p>
      <div class="row">
        <button type="button" class="btn ghost small" id="aresend">${esc(at_().resend)}</button>
        <button type="button" class="lnk" data-mode="login">${esc(at_().backLogin)}</button>
      </div>
      ${msgHtml()}
    </div>`;
  }
  if(m === "forgot"){
    return `<form class="acct" id="aform" novalidate>
      <p class="rules">${esc(at_().forgotSub)}</p>
      ${emailField()}
      <button type="submit" class="btn small wide" ${acctBusy ? "disabled" : ""}>${esc(acctBusy ? at_().busy : at_().sendReset)}</button>
      ${msgHtml()}
      <button type="button" class="lnk" data-mode="login">‹ ${esc(at_().backLogin)}</button>
    </form>`;
  }
  const su = m === "signup";
  return `<form class="acct" id="aform" novalidate>
    ${phase === "passport" ? `<p class="rules">${esc(t().accountHint)}</p>` : ""}
    ${emailField()}
    <div class="pwhead"><label for="apw">${esc(t().pw)}</label>
      ${su ? "" : `<button type="button" class="lnk small" data-mode="forgot">${esc(at_().forgot)}</button>`}</div>
    ${pwField("apw", su ? "new-password" : "current-password", t().pw)}
    ${su ? `<p class="hint">${esc(at_().pwHint)}</p>` : ""}
    ${stayBox()}
    <button type="submit" class="btn small wide" ${acctBusy ? "disabled" : ""}>${esc(acctBusy ? at_().busy : (su ? t().signup : t().login))}</button>
    ${msgHtml()}
    ${su ? "" : `<div class="ordiv"><span>${esc(at_().or)}</span></div>
      <button type="button" class="btn ghost small wide" id="amagic">✉️ ${esc(at_().magic)}</button>`}
    <p class="switch">${esc(su ? at_().haveAcct : at_().newHere)}
      <button type="button" class="lnk" data-mode="${su ? "login" : "signup"}">${esc(su ? t().login : t().signup)}</button></p>
  </form>`;
}

/* an error updates only the message line, so the typed email and password stay in their fields */
function setAcctMsg(text, err, repaint){
  acctMsg = text ? { text, err } : null;
  const m = document.getElementById("amsg");
  if(m && !repaint){
    m.textContent = text || ""; m.className = "msg" + (err ? " err" : "");
    m.setAttribute("role", err ? "alert" : "status");
    return;
  }
  acctRender();
}
function setBusy(on){
  acctBusy = on;
  const b = document.querySelector("#aform [type=submit], #rform [type=submit]");
  if(!b) return;
  if(on){ b.dataset.label = b.textContent; b.textContent = at_().busy; b.disabled = true; }
  else if(b.dataset.label){ b.textContent = b.dataset.label; b.disabled = false; }
}
function authOk(j){ store.set("had_auth", true); acctEmail = ""; acctBusy = false; setAuth(j); setAcctMsg("", false, true); }
/* what the person reads when something goes wrong, from GoTrue's status and code */
function authError(r, ctx){
  if(!r) return at_().offline;
  const j = r.j || {}, code = j.error_code || j.code || j.error || "", txt = j.msg || j.message || j.error_description || "";
  if(r.status === 429 || /rate_limit/.test(code)) return at_().rate;
  if(code === "user_already_exists" || /already registered|exists/i.test(txt)) { acctAuth = "login"; return t().emailTaken; }
  if(code === "weak_password" || /password should be/i.test(txt)) return t().pwShort;
  if(code === "email_not_confirmed") return at_().confirmFirst;
  if(code === "email_address_invalid" || code === "validation_failed") return at_().emailInvalid;
  if(ctx === "login" && (r.status === 400 || code === "invalid_credentials" || code === "invalid_grant")) return at_().wrongCreds;
  return t().authFailed;
}
async function sendMail(kind){
  const em = acctEmail;
  setBusy(true); setAcctMsg("");
  const r = kind === "reset"
    ? await authReq("recover?redirect_to=" + encodeURIComponent(AUTH_BASE + "?view=reset"), { email: em })
    : await authReq("otp?redirect_to=" + encodeURIComponent(AUTH_BASE + "?view=login" + (params.get("next") ? "&next=" + encodeURIComponent(params.get("next")) : "")),
                    { email: em, create_user: false });
  setBusy(false);
  // never say whether an address has an account: an unknown email gets the same «check your inbox» screen
  // (any 4xx except «too many», so nothing hangs on Supabase's exact error wording)
  const unknown = kind === "magic" && r && !r.ok && r.status >= 400 && r.status < 500 && r.status !== 429;
  if(r && (r.ok || unknown)){ acctAuth = kind === "reset" ? "sent-reset" : "sent-magic"; return setAcctMsg("", false, true); }
  setAcctMsg(authError(r, kind === "reset" ? "reset" : "magic"), true);
}

function bindAcct(){
  const el = id => document.getElementById(id);
  app.querySelectorAll("[data-eye]").forEach(b=>b.onclick = ()=>{
    const i = el(b.dataset.eye), show = i.type === "password";
    i.type = show ? "text" : "password";
    b.textContent = show ? at_().hide : at_().show; b.setAttribute("aria-pressed", String(show));
    i.focus();
  });
  app.querySelectorAll("[data-mode]").forEach(b=>b.onclick = ()=>{
    if(el("aemail")) acctEmail = (el("aemail").value || "").trim();
    acctAuth = b.dataset.mode; acctMsg = null; acctRender();
    const f = el("aemail"); if(f) f.focus();
  });
  if(el("astay")) el("astay").onchange = e=>store.set("keep", e.target.checked);
  const readEmail = ()=>{ acctEmail = (el("aemail").value || "").trim(); return EMAIL_RE.test(acctEmail); };
  if(el("aform")) el("aform").onsubmit = async e=>{
    e.preventDefault();
    if(acctBusy) return;
    if(!readEmail()) return setAcctMsg(at_().emailInvalid, true);
    if(acctAuth === "forgot") return sendMail("reset");
    const p = el("apw").value || "";
    if(p.length < 6) return setAcctMsg(t().pwShort, true);
    if(el("astay")) store.set("keep", el("astay").checked);
    setBusy(true); setAcctMsg("");
    if(acctAuth === "signup"){
      const r = await authReq("signup", { email:acctEmail, password:p });
      setBusy(false);
      if(r && r.ok && r.j && r.j.access_token) return authOk(r.j);
      // «Confirm email» on: signup returns a user but no session yet
      if(r && r.ok && r.j && (r.j.confirmation_sent_at || (r.j.user && r.j.user.confirmation_sent_at))) return setAcctMsg(t().confirmSent);
      const msg = authError(r, "signup");
      return setAcctMsg(msg, true, acctAuth === "login");   // «already has an account» switches to log in
    }
    const r = await authReq("token?grant_type=password", { email:acctEmail, password:p });
    setBusy(false);
    if(r && r.ok && r.j && r.j.access_token) return authOk(r.j);
    setAcctMsg(authError(r, "login"), true);
  };
  if(el("amagic")) el("amagic").onclick = ()=>{
    if(!readEmail()) return setAcctMsg(at_().emailInvalid, true);
    sendMail("magic");
  };
  if(el("aresend")) el("aresend").onclick = ()=>sendMail(acctAuth === "sent-reset" ? "reset" : "magic");
  if(el("achangepw")) el("achangepw").onclick = ()=>{ acctMode="pw"; acctMsg=null; acctRender(); const f = el("anewpw"); if(f) f.focus(); };
  if(el("acancel"))   el("acancel").onclick   = ()=>{ acctMode="";   acctMsg=null; acctRender(); };
  if(el("apwform"))   el("apwform").onsubmit  = async e=>{
    e.preventDefault();
    const p = el("anewpw").value || "";
    if(p.length < 6) return setAcctMsg(t().pwShort, true);
    let r = await authReq("user", { password:p }, AUTH.at);
    if(r && r.status === 401){ await authRefresh(); if(AUTH) r = await authReq("user", { password:p }, AUTH.at); }
    if(r && r.ok){ acctMode=""; setAcctMsg(t().pwChanged, false, true); }
    else setAcctMsg(authError(r, "pw"), true);
  };
  if(el("alogout")) el("alogout").onclick = async ()=>{
    try{ await authReq("logout", {}, AUTH.at); }catch(e){}
    clearAuth(); acctMode=""; acctAuth="login"; setAcctMsg("", false, true);
  };
  if(el("adelete")) el("adelete").onclick = async ()=>{
    if(!confirm(t().deleteConfirm)) return;
    // The database is insert-only for anon, so deletion runs behind the
    // delete-account edge function (service role). Not deployed -> soft fail.
    let ok = false;
    try{
      const r = await fetch(SUPA_URL+"/functions/v1/delete-account", {
        method:"POST", headers:{ apikey:SUPA_KEY, Authorization:"Bearer "+AUTH.at } });
      ok = r.ok;
    }catch(e){}
    if(ok){ clearAuth(); acctMode=""; setAcctMsg(t().deleted, false, true); }
    else setAcctMsg(t().deleteFailed, true);
  };
}

/* ---------- ?view=reset: the link from the reset mail lands here ---------- */
let resetDone = false;
async function renderReset(){
  phase = "reset"; document.body.classList.add("site"); acctRender = renderReset;
  await resolveRole();
  if(phase !== "reset") return;
  const A = at_();
  let body;
  if(resetDone) body = `<p class="sub">${esc(A.resetDone)}</p><a class="btn" href="./">${esc(A.toMyDM)}</a>`;
  else if(!AUTH) body = `<div class="acct">
      ${acctMsg && acctMsg.err ? msgHtml() : `<p class="sub">${esc(A.resetNoLink)}</p>`}
      <a class="btn small wide" href="?view=login&amp;mode=forgot">${esc(A.forgotTitle)}</a></div>`;
  else body = `<form class="acct" id="rform" novalidate>
      <p class="rules">${esc(A.resetSub(AUTH.email || ""))}</p>
      <input type="email" name="email" autocomplete="username" value="${esc(AUTH.email||"")}" hidden>
      <label for="anewpw">${esc(t().newPw)}</label>
      ${pwField("anewpw", "new-password", t().newPw)}
      <p class="hint">${esc(A.pwHint)}</p>
      <button type="submit" class="btn small wide">${esc(A.savePw)}</button>
      ${msgHtml()}
    </form>`;
  app.innerHTML = `${siteBar()}
    <div class="screen" style="padding-top:10px">
      ${wordmarkHtml("", t().curriculum)}
      <h1>${esc(resetDone ? A.doneTitle : !AUTH ? A.expiredTitle : A.resetTitle)}</h1>
      ${body}
    </div>`;
  bindSiteBar(); bindAcct();
  const f = document.getElementById("rform");
  if(f) f.onsubmit = async e=>{
    e.preventDefault();
    const p = document.getElementById("anewpw").value || "";
    if(p.length < 6) return setAcctMsg(t().pwShort, true);
    setBusy(true);
    const r = await authReq("user", { password:p }, AUTH.at);
    setBusy(false);
    if(r && r.ok){ resetDone = true; acctMsg = null; return renderReset(); }
    setAcctMsg(r && r.status === 401 ? A.linkExpired : authError(r, "pw"), true);
  };
}
