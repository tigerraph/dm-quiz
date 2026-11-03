/* ==================================================================
   Site pages — concept B «Session first» (Rafa, 03.11.2026, picked from
   the mock «DM overhaul», 19:1x): My DM opens with the next session, big;
   every session has one page with everything; a logged-in moderator
   (dm_admins) sees the «Moderator kit» on it; past topics below.

     ./                      start (My DM): next session, your stars, earlier sessions
     ?view=session&id=<id>   one session: bottom line, links for everyone, kit for moderators
     ?view=login&next=…      the My DM account form on its own page
     ?view=mydm              the star passport, unchanged (the QR on the slides lands there)

   Injected by build.mjs into the app's script, so it shares the app's state:
   registry, lang, AUTH, adminStatus(), acctHtml()/bindAcct(), stars helpers.
   The kit itself is the session setup approved on 07.10.2026 (content/admin.html):
   Present ▶ + copy link, the first slides, before / during / after, run-sheet QR.
   Its labels stay English like that page; its language switch picks the material.
   ================================================================== */
const SITE_T = {
 en:{ passport:"Passport", moderator:"Moderator", participant:"Participant",
  nextSession:"Next session", latestSession:"Latest session", openSession:"Open the session", modKit:"Moderator kit",
  yourStars:"Your stars", openPassport:"Open my passport", earlier:"Earlier sessions", more:"More sessions",
  noDate:"Date not on record", noneYet:"No sessions yet.", backHome:"My DM",
  bottomLine:"The bottom line", forEveryone:"For everyone",
  joinQuiz:"Join the quiz", joinWhat:"On the day: scan the QR code on the slides",
  takeHome:"Read the session page", takeHomeWhat:"Everything from the session, to revisit and pass on",
  replay:"Replay the quiz", replayWhat:"On your own, at your own pace",
  slides:"Slides", slidesWhat:"The deck as PDF", topicCard:"Topic card", topicCardWhat:"The session on one page",
  modHintGuest:"Moderating this session?", modHintLogin:"Log in to see the kit.",
  modHintNo:"The Moderator kit is only for moderator accounts.",
  loginSub:"One account for everyone: your stars on every device. Moderators see their material after logging in.",
  notFound:"This session is not on the list." },
 de:{ passport:"Pass", moderator:"Moderator:in", participant:"Teilnehmer:in",
  nextSession:"Nächste Session", latestSession:"Letzte Session", openSession:"Zur Session", modKit:"Moderator-Kit",
  yourStars:"Deine Sterne", openPassport:"Meinen Pass öffnen", earlier:"Frühere Sessions", more:"Weitere Sessions",
  noDate:"Datum nicht erfasst", noneYet:"Noch keine Sessions.", backHome:"My DM",
  bottomLine:"Der Merksatz", forEveryone:"Für alle",
  joinQuiz:"Beim Quiz mitmachen", joinWhat:"Am Tag selbst: QR-Code auf den Folien scannen",
  takeHome:"Die Seite zur Session lesen", takeHomeWhat:"Alles aus der Session zum Nachschauen und Weitergeben",
  replay:"Quiz nochmals spielen", replayWhat:"Allein, im eigenen Tempo",
  slides:"Folien", slidesWhat:"Die Präsentation als PDF", topicCard:"Themenkarte", topicCardWhat:"Die Session auf einer Seite",
  modHintGuest:"Du moderierst diese Session?", modHintLogin:"Melde dich an, dann siehst du das Kit.",
  modHintNo:"Das Moderator-Kit sehen nur Moderations-Konten.",
  loginSub:"Ein Konto für alle: deine Sterne auf jedem Gerät. Wer moderiert, sieht nach dem Anmelden das Material.",
  notFound:"Diese Session ist nicht auf der Liste." },
 fr:{ passport:"Passeport", moderator:"Modération", participant:"Participant·e",
  nextSession:"Prochaine session", latestSession:"Dernière session", openSession:"Ouvrir la session", modKit:"Kit de modération",
  yourStars:"Tes étoiles", openPassport:"Ouvrir mon passeport", earlier:"Sessions précédentes", more:"Autres sessions",
  noDate:"Date non enregistrée", noneYet:"Pas encore de session.", backHome:"My DM",
  bottomLine:"La phrase à retenir", forEveryone:"Pour tout le monde",
  joinQuiz:"Participer au quiz", joinWhat:"Le jour même : scanne le code QR sur les diapositives",
  takeHome:"Lire la page de la session", takeHomeWhat:"Tout de la session, à revoir et à transmettre",
  replay:"Rejouer le quiz", replayWhat:"Seul·e, à ton rythme",
  slides:"Diapositives", slidesWhat:"La présentation en PDF", topicCard:"Fiche thème", topicCardWhat:"La session sur une page",
  modHintGuest:"Tu animes cette session ?", modHintLogin:"Connecte-toi pour voir le kit.",
  modHintNo:"Le kit de modération est réservé aux comptes de modération.",
  loginSub:"Un seul compte pour tout le monde : tes étoiles sur chaque appareil. Les modérateurs voient leur matériel après connexion.",
  notFound:"Cette session n’est pas dans la liste." },
 it:{ passport:"Passaporto", moderator:"Moderazione", participant:"Partecipante",
  nextSession:"Prossima sessione", latestSession:"Ultima sessione", openSession:"Apri la sessione", modKit:"Kit di moderazione",
  yourStars:"Le tue stelle", openPassport:"Apri il mio passaporto", earlier:"Sessioni precedenti", more:"Altre sessioni",
  noDate:"Data non registrata", noneYet:"Ancora nessuna sessione.", backHome:"My DM",
  bottomLine:"La frase da ricordare", forEveryone:"Per tutti",
  joinQuiz:"Partecipa al quiz", joinWhat:"Il giorno stesso: scansiona il codice QR sulle slide",
  takeHome:"Leggi la pagina della sessione", takeHomeWhat:"Tutto della sessione, da rivedere e condividere",
  replay:"Rigioca il quiz", replayWhat:"Da solo, al tuo ritmo",
  slides:"Slide", slidesWhat:"La presentazione in PDF", topicCard:"Scheda tema", topicCardWhat:"La sessione in una pagina",
  modHintGuest:"Moderi questa sessione?", modHintLogin:"Accedi per vedere il kit.",
  modHintNo:"Il kit di moderazione è solo per gli account di moderazione.",
  loginSub:"Un solo account per tutti: le tue stelle su ogni dispositivo. Chi modera vede il materiale dopo l’accesso.",
  notFound:"Questa sessione non è nell’elenco." }
};
function st(){ return SITE_T[lang] || SITE_T.en; }
const SITE_PHASES = ["site-home","site-session","login"];
const LOCALES = { en:"en-GB", de:"de-CH", fr:"fr-CH", it:"it-CH" };
/* QR codes and «copy link» must point at the public site, also from a local preview */
const SITE_BASE = (location.protocol === "file:" || /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname))
  ? "https://dmatters.org/" : new URL("./", location.href).href;

let siteRole = "guest";          // guest | participant | moderator
let siteId = "";                 // the session on a session page
let kitLang = "";                // the kit's material language ("" = follow the page)
async function resolveRole(){
  if(!AUTH) return siteRole = "guest";
  return siteRole = (await adminStatus()) === "admin" ? "moderator" : "participant";
}

/* ---------- registry helpers ---------- */
function siteSessions(){
  const reg = registry || {}, ids = Object.keys(reg);
  return ids.filter(id=>{
    const s = reg[id];
    if(!s || !s.pack) return false;
    if(s.draft && siteRole !== "moderator") return false;
    // a rehearsal alias (e.g. «probe»): same pack as a session that has its own page
    return s.materials || !ids.some(k=>k!==id && reg[k] && reg[k].pack===s.pack && reg[k].materials);
  });
}
function aliasesOf(id){
  const p = registry[id].pack;
  return Object.keys(registry).filter(k=>k!==id && registry[k].pack===p && !registry[k].materials);
}
function isUpcoming(id){ const d = registry[id].date; return !!d && d >= todayISO(); }
function splitSessions(){
  const ids = siteSessions();
  const up = ids.filter(isUpcoming).sort((a,b)=>registry[a].date.localeCompare(registry[b].date));
  const byDateDesc = (a,b)=>String(registry[b].date||"").localeCompare(String(registry[a].date||""));
  let hero = up[0] || null, heroNext = !!hero;
  if(!hero) hero = ids.slice().sort(byDateDesc)[0] || null;   // nothing planned: show the latest
  const rest = ids.filter(id=>id!==hero).sort((a,b)=>{
    const ua = isUpcoming(a), ub = isUpcoming(b);
    return (ub - ua) || byDateDesc(a,b);
  });
  return { hero, heroNext, rest };
}
function longDate(iso){
  if(!iso) return st().noDate;
  const d = new Date(iso + "T12:00:00");
  return isNaN(d) ? iso : d.toLocaleDateString(LOCALES[lang] || "en-GB", { weekday:"short", day:"numeric", month:"long", year:"numeric" });
}
function thumb(id, n, cls){
  // no thumbnail yet (npm run thumbs not run): the hero drops to one column, a list keeps its slot
  return `<img${cls ? ` class="${cls}"` : ""} src="assets/thumbs/${encodeURIComponent(id)}-${n}.jpg" alt="" loading="lazy" onerror="var h=this.closest('.hero');if(h){h.classList.add('noimg');this.remove();}else this.style.visibility='hidden'">`;
}
function pillarLine(id){
  const p = registry[id].pillar;
  return p && PILLARS[p] ? `${PILLAR_EMOJI[p] || ""} ${L(PILLARS[p])}` : "";
}
const PILLAR_EMOJI = { civics:"🏛️", comm:"📣", action:"✊" };
const qsLang = l => l === "de" ? "" : "?lang=" + l;          // DE is each page's own default
const pdfPath = (base, l) => "slides/" + base + (l === "de" ? "" : "." + l) + ".pdf";

/* the tagline and the bottom line come from the session's own take-home page,
   so nothing is written twice (content/<id>.html: .sub and the first .postit) */
const takeCache = {};
async function takeHome(id){
  if(!registry[id] || !registry[id].materials) return null;
  if(!takeCache[id]) takeCache[id] = fetch("content/" + encodeURIComponent(id) + ".html", { cache:"no-cache" })
    .then(r=>r.ok ? r.text() : "").then(h=>h ? new DOMParser().parseFromString(h, "text/html") : null).catch(()=>null);
  const doc = await takeCache[id];
  if(!doc) return null;
  const pick = sel => doc.querySelector(`${sel}[lang-${lang}]`) || doc.querySelector(`${sel}[lang-de]`) || doc.querySelector(sel);
  const sub = pick(".sub"), post = pick(".postit");
  let tag = sub ? sub.textContent.replace(/\s+/g, " ").trim() : "";
  const cut = tag.search(/[.!?](\s|$)/);
  if(cut > 0) tag = tag.slice(0, cut + 1);
  return { tag, bottom: post ? safeInline(post).trim() : "" };
}
function safeInline(node){
  let out = "";
  node.childNodes.forEach(n=>{
    if(n.nodeType === 3) out += esc(n.textContent.replace(/\s+/g, " "));
    else if(n.nodeType === 1){
      const tg = n.tagName.toLowerCase();
      if(tg === "br") out += "<br>";
      else if(tg === "b" || tg === "strong") out += `<strong>${safeInline(n)}</strong>`;
      else if(tg === "i" || tg === "em") out += `<em>${safeInline(n)}</em>`;
      else out += safeInline(n);
    }
  });
  return out;
}

/* ---------- top bar ---------- */
function loginHref(){
  const here = location.search.replace(/^\?/, "");
  const back = /(^|&)view=login(&|$)/.test(here) ? "" : here + (location.hash || "");
  return "?view=login" + (back ? "&next=" + encodeURIComponent("?" + back) : "");
}
function siteBar(){
  const who = siteRole === "guest"
    ? `<a class="btn small" href="${esc(loginHref())}">${esc(t().login)}</a>`
    : `<span class="who ${siteRole}">${esc(siteRole === "moderator" ? st().moderator : st().participant)}</span>
       <button class="btn ghost small" id="slogout" type="button">${esc(t().logout)}</button>`;
  return `<header class="sbar">
    <a class="wordmark" href="./">${esc(t().brand)}</a>
    <span class="sright">
      <button class="langcycle" id="lc" type="button" aria-label="Language: ${lang.toUpperCase()}" title="${LANGS.map(l=>l.toUpperCase()).join(" / ")}">${lang.toUpperCase()}</button>
      <a class="btn ghost small" href="?view=mydm" aria-label="${esc(st().passport)}">★<span class="ptxt"> ${esc(st().passport)}</span></a>
      ${who}
    </span></header>`;
}
function bindSiteBar(){
  bindTop();
  const lo = document.getElementById("slogout");
  if(lo) lo.onclick = async ()=>{
    try{ await authReq("logout", {}, AUTH && AUTH.at); }catch(e){}
    clearAuth(); adminState = null; siteRole = "guest"; rerender();
  };
}

/* ---------- start: My DM with the next session ---------- */
async function renderHome(){
  phase = "site-home"; document.body.classList.add("site");
  await resolveRole();
  if(phase !== "site-home") return;
  const { hero, heroNext, rest } = splitSessions();
  const mod = siteRole === "moderator";
  const stars = mergeStars(localStars(), null);
  const heroHtml = hero ? `<div class="hero">
      <div>
        <div class="when">${esc(heroNext ? st().nextSession : st().latestSession)} · ${esc(longDate(registry[hero].date))}</div>
        <h2>${esc(L(registry[hero].title) || hero)}</h2>
        <p class="sub" id="herotag"></p>
        <div class="acts">
          <a class="btn" href="?view=session&amp;id=${encodeURIComponent(hero)}">${esc(st().openSession)}</a>
          ${mod ? `<a class="btn ghost" href="?view=session&amp;id=${encodeURIComponent(hero)}#kit">${esc(st().modKit)}</a>` : ""}
        </div>
      </div>
      ${thumb(hero, 2)}
    </div>` : `<p class="sub" style="margin-top:16px">${esc(st().noneYet)}</p>`;
  const allPast = rest.every(id=>!isUpcoming(id));
  app.innerHTML = `${siteBar()}
    ${errKey ? `<p class="err site-err">${esc(t()[errKey] || "")}</p>` : ""}
    ${wordmarkHtml("", t().curriculum)}
    <h1>${esc(t().myDM)}</h1>
    ${heroHtml}
    <div class="two">
      <div>
        <h2>${esc(st().yourStars)}</h2>
        <div class="ministars" id="ministars">${miniStars(stars)}</div>
        <p class="rules">${esc(t().champRule)}</p>
        <div class="stack"><a class="btn ghost small" href="?view=mydm">★ ${esc(st().openPassport)}</a></div>
        ${dailyEntryHtml()}
      </div>
      ${rest.length ? `<div>
        <h2>${esc(allPast ? st().earlier : st().more)}</h2>
        <div class="rowlist">${rest.map(rowItem).join("")}</div>
      </div>` : ""}
    </div>`;
  bindSiteBar();
  bindDailyEntry(()=>{ location.href = "./"; });
  if(hero) takeHome(hero).then(x=>{ const el = document.getElementById("herotag"); if(el && x && phase==="site-home") el.textContent = x.tag; });
  if(SUPA_URL) fetchMyStars().then(remote=>{
    const el = document.getElementById("ministars");
    if(el && remote && phase==="site-home") el.innerHTML = miniStars(mergeStars(localStars(), remote));
  }).catch(()=>{});
}
function miniStars(stars){
  return PILLAR_IDS.map(p=>`<span title="${esc(L(PILLARS[p]))}">${PILLAR_EMOJI[p]} ${stars.filter(s=>s.pillar===p).length}</span>`).join("");
}
function rowItem(id){
  const s = registry[id];
  const tags = (s.draft ? `<span class="tag draft">Draft</span>` : "") + (isUpcoming(id) ? `<span class="tag next">${esc(st().nextSession)}</span>` : "");
  return `<a class="rowitem" href="?view=session&amp;id=${encodeURIComponent(id)}">${thumb(id, 2)}
    <span><b>${esc(L(s.title) || id)}</b><span class="meta">${esc(pillarLine(id))} · ${esc(longDate(s.date))}</span>
    ${tags ? `<span class="chipline">${tags}</span>` : ""}</span><span class="go" aria-hidden="true">›</span></a>`;
}

/* ---------- one page per session ---------- */
async function renderSessionPage(id){
  phase = "site-session"; siteId = id; document.body.classList.add("site");
  await resolveRole();
  if(phase !== "site-session") return;
  const s = registry[id];
  if(!s || !siteSessions().includes(id)){
    app.innerHTML = `${siteBar()}<a class="lnk" href="./">‹ ${esc(st().backHome)}</a><h1>${esc(st().notFound)}</h1>`;
    return bindSiteBar();
  }
  const mod = siteRole === "moderator";
  const [take, info] = await Promise.all([takeHome(id), mod ? kitInfo(id) : null]);
  if(phase !== "site-session" || siteId !== id) return;
  const up = isUpcoming(id);
  const everyone = up
    ? `<li><span class="plain">${esc(st().joinQuiz)}</span><span class="what">${esc(st().joinWhat)}</span></li>`
    : `${s.materials ? `<li><a href="content/${encodeURIComponent(id)}.html${qsLang(lang)}">${esc(st().takeHome)}</a><span class="what">${esc(st().takeHomeWhat)}</span></li>` : ""}
       <li><a href="?session=${encodeURIComponent(id)}&amp;solo=1">${esc(st().replay)}</a><span class="what">${esc(st().replayWhat)}</span></li>
       ${s.materials ? `<li><a href="${esc(pdfPath(id, lang))}" target="_blank" rel="noopener">${esc(st().slides)}</a><span class="fmt">PDF</span><span class="what">${esc(st().slidesWhat)}</span></li>
       <li><a href="${esc(pdfPath("topic-card-" + id, lang))}" target="_blank" rel="noopener">${esc(st().topicCard)}</a><span class="fmt">PDF</span><span class="what">${esc(st().topicCardWhat)}</span></li>` : ""}`;
  app.innerHTML = `${siteBar()}
    <a class="lnk" href="./">‹ ${esc(st().backHome)}</a>
    <div class="hero plain">
      <div>
        <div class="when">${up ? esc(st().nextSession) + " · " : ""}${esc(longDate(s.date))}</div>
        <h2>${esc(L(s.title) || id)}</h2>
        ${take && take.tag ? `<p class="sub">${esc(take.tag)}</p>` : ""}
        ${pillarLine(id) ? `<p class="rules" style="margin-top:8px">${esc(pillarLine(id))} ★</p>` : ""}
      </div>
      ${thumb(id, 2)}
    </div>
    <div class="two">
      ${take && take.bottom ? `<div class="why"><b>${esc(st().bottomLine)}</b>${take.bottom}</div>` : "<div></div>"}
      <div><h2 style="font-size:1rem">${esc(st().forEveryone)}</h2><ul class="slinks">${everyone}</ul></div>
    </div>
    ${mod ? `<section class="postkit" id="kit" aria-label="Moderator kit"><div class="lbl">Moderator kit · only you see this</div>${kitHtml(id, info)}</section>`
      : `<p class="modhint">${siteRole === "guest"
          ? `${esc(st().modHintGuest)} <a class="lnk" href="${esc(loginHref())}">${esc(st().modHintLogin)}</a>`
          : esc(st().modHintNo)}</p>`}`;
  bindSiteBar();
  if(mod) bindKit(id, info);
  if(location.hash === "#kit"){ const k = document.getElementById("kit"); if(k) k.scrollIntoView({ block:"start" }); }
}

/* what the kit needs beyond the registry: languages and question count from the pack,
   the slide count from the deck, and whether a step-by-step guide exists */
const kitCache = {};
function kitInfo(id){
  if(kitCache[id]) return kitCache[id];
  const s = registry[id];
  const head = path => fetch(path, { method:"HEAD", cache:"no-cache" }).then(r=>r.ok).catch(()=>false);
  return kitCache[id] = Promise.all([
    loadJSON("packs/" + s.pack).catch(()=>null),
    fetch("slides/" + encodeURIComponent(id) + ".html", { cache:"no-cache" }).then(r=>r.ok ? r.text() : "").catch(()=>""),
    head("content/guide-" + encodeURIComponent(id) + ".html")
  ]).then(([pack, deck, guide])=>{
    const q0 = pack && pack.questions && pack.questions[0];
    const langs = LANGS.filter(l=>q0 && q0.q && q0.q[l]);
    return { nq: pack && pack.questions ? pack.questions.length : 0, langs: langs.length ? langs : LANGS,
             nSlides: (deck.match(/<section\b[^>]*class="slide[\s"]/g) || []).length, guide };
  });
}
const COPY_SVG = '<svg class="cp" viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1"/></svg>' +
                 '<svg class="ok" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12l5 5L20 7"/></svg>';
function kitHtml(id, info){
  const s = registry[id];
  const kl = info.langs.includes(kitLang || lang) ? (kitLang || lang) : info.langs[0];
  const pres = n => "slides/" + encodeURIComponent(id) + ".html?" + (kl === "de" ? "" : "lang=" + kl + "&") + "present=1" + (n ? "&slide=" + n : "");
  const slidesUrl = SITE_BASE + "slides/" + encodeURIComponent(id) + ".html" + qsLang(kl);
  const regie = SITE_BASE + "content/regie-" + encodeURIComponent(id) + ".html" + qsLang(kl);
  const host = "?session=" + encodeURIComponent(id) + "&host=1";
  const a = (href, text, what, fmt, isNew) => `<li><a href="${esc(href)}" target="_blank" rel="noopener">${text}</a>${fmt ? `<span class="fmt">${fmt}</span>` : ""}${isNew ? `<span class="tag new">new here</span>` : ""}${what ? `<span class="what">${what}</span>` : ""}</li>`;
  const practice = s.practice || [];
  const game = x => a("content/" + x.file + qsLang(kl), esc(L(x.title)),
    (x.what ? esc(L(x.what)) : "") + (x.pdf ? ` · <a href="${esc(pdfPath(x.pdf, kl))}" target="_blank" rel="noopener">PDF</a>` : ""));
  const today = todayISO();
  const ddmm = iso => { const p = String(iso).split("-"); return p.length === 3 ? p[2] + "." + p[1] + "." : iso; };
  const chip = s.draft ? `<span class="tag draft">Draft</span>`
    : s.date ? (s.date < today ? `<span class="tag">Last run ${esc(ddmm(s.date))}</span>` : `<span class="tag next">Next run ${esc(ddmm(s.date))}</span>`) : "";
  const before = practice.filter(x=>x.pdf).map(game).join("") +
    a(pdfPath("topic-card-" + id, kl), "Topic card", `One-page overview, also the no-slides fallback · <a href="slides/topic-card-${esc(encodeURIComponent(id))}.html${qsLang(kl)}" target="_blank" rel="noopener">HTML</a>`, "PDF") +
    a(pdfPath(id, kl), "Slides as PDF", "Offline backup of the deck", "PDF") +
    (info.guide ? a("content/guide-" + encodeURIComponent(id) + ".html", "Step-by-step guide", "How to run this topic, minute by minute (German)", "Page", true) : "");
  const during = practice.filter(x=>!x.pdf).map(game).join("") +
    a(host, "Big-screen quiz", "Lobby with the join QR, drives the game") +
    a(host + "&award=1", "Award the star ★", "Opens the claim window on every phone") +
    a("?session=" + encodeURIComponent(id), "Quiz as player", "The link behind the QR on the slides") +
    aliasesOf(id).map(k=>a("?session=" + encodeURIComponent(k), "Rehearsal quiz", `Scratch run «${esc(k)}», keeps test names off the real session`)).join("");
  const after = a("content/" + encodeURIComponent(id) + ".html" + qsLang(kl), "Take-home page", "For participants: bottom line, material, replay") +
    a("content/admin.html#people", "Stars &amp; people", "Who collected which star, all sessions");
  return `<div class="kit">
    <h2>${esc(L(s.title) || id)} ${chip}</h2>
    <div class="meta">${[pillarLine(id), s.date ? ddmm(s.date) + s.date.slice(0, 4) : "no date set",
      info.nq ? info.nq + " questions" : "", info.langs.map(l=>l.toUpperCase()).join(" / ")].filter(Boolean).map(esc).join(" · ")}</div>
    <div class="prim">
      <a class="btn big" href="${esc(pres(0))}" target="_blank" rel="noopener">Present ▶</a>
      <button type="button" class="copy" id="kcopy" data-url="${esc(slidesUrl)}" aria-label="Copy slides link for the moderator">${COPY_SVG}<span class="tip" aria-hidden="true">Copy link for the moderator</span></button>
      <span class="sr" role="status" aria-live="polite" id="kcopylive"></span>
      <div class="pills" role="group" aria-label="Language of the material">
        ${info.langs.map(l=>`<button type="button" class="pill ${l===kl?"on":""}" data-kl="${l}" aria-pressed="${l===kl}">${l.toUpperCase()}</button>`).join("")}
      </div>
    </div>
    <div class="strip">${[1,2,3,4].map(n=>`<a href="${esc(pres(n))}" target="_blank" rel="noopener" aria-label="Present from slide ${n}">${thumb(id, n)}</a>`).join("")}
      <a class="more" href="${esc(pres(0))}" target="_blank" rel="noopener">${info.nSlides ? "All " + info.nSlides + " slides ›" : "All slides ›"}</a></div>
    <div class="moments">
      <div><h3>Before</h3><ul>${before}</ul></div>
      <div><h3>During</h3><ul>${during}</ul></div>
      <div><h3>After</h3><ul>${after}</ul>
        <h3>Run sheet</h3><div class="qrline"><div class="qr" id="kqr" data-qr="${esc(regie)}"></div>
          <ul>${a(regie, "Run sheet", "Scan for the moderator’s phone")}</ul></div></div>
    </div>
  </div>`;
}
function bindKit(id, info){
  const box = document.getElementById("kqr");
  if(box) box.innerHTML = qrSvg(box.getAttribute("data-qr"));
  app.querySelectorAll("[data-kl]").forEach(b=>b.onclick = ()=>{
    kitLang = b.dataset.kl;
    const k = document.getElementById("kit");
    if(k){ k.innerHTML = `<div class="lbl">Moderator kit · only you see this</div>${kitHtml(id, info)}`; bindKit(id, info); }
  });
  const c = document.getElementById("kcopy"), live = document.getElementById("kcopylive");
  if(c) c.onclick = ()=>{
    const text = c.getAttribute("data-url"), tip = c.querySelector(".tip");
    const done = ok=>{
      const msg = ok ? "Copied" : "Copy failed: long-press Present";
      c.classList.add(ok ? "done" : "fail"); tip.textContent = msg; live.textContent = msg;
      clearTimeout(c._t);
      c._t = setTimeout(()=>{ c.classList.remove("done","fail"); tip.textContent = "Copy link for the moderator"; live.textContent = ""; }, 1600);
    };
    const legacy = ()=>{
      const ta = document.createElement("textarea"); ta.value = text; ta.setAttribute("readonly",""); ta.style.position = "fixed"; ta.style.opacity = "0";
      document.body.appendChild(ta); ta.select(); let ok = false; try{ ok = document.execCommand("copy"); }catch(e){}
      ta.remove(); return ok;
    };
    if(navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(text).then(()=>done(true), ()=>done(legacy()));
    else done(legacy());
  };
}

/* ---------- login on its own page ---------- */
function loginNext(){
  const n = params.get("next") || "";
  return /^\?(view|session)=[^\s\\]*$/.test(n) ? "./" + n : "./";   // only our own pages
}
function renderLogin(){
  phase = "login"; document.body.classList.add("site"); acctRender = renderLogin;
  if(AUTH){
    // logged in: go back where the person came from, once this device is linked to the account
    app.innerHTML = `${siteBar()}<p class="rules">…</p>`;
    Promise.race([linkDeviceToUser(), new Promise(r=>setTimeout(r, 1500))]).then(()=>location.replace(loginNext()));
    return;
  }
  if(!acctAuth) acctAuth = "login";
  app.innerHTML = `${siteBar()}
    <div class="screen" style="padding-top:10px">
      ${wordmarkHtml("", t().curriculum)}
      <h1>${esc(t().login)}</h1>
      <p class="sub">${esc(st().loginSub)}</p>
      ${acctHtml()}
      <a class="lnk" href="${esc(loginNext())}">${esc(t().cancel)}</a>
    </div>`;
  bindSiteBar(); bindAcct();
}

function siteRerender(){
  if(phase === "site-home") renderHome();
  else if(phase === "site-session") renderSessionPage(siteId);
  else if(phase === "login") renderLogin();
}
