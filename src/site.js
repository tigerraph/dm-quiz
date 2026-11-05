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
   registry, lang, AUTH, adminStatus(), acctHtml()/bindAcct() (src/account.js), stars helpers.
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
  modHintNo:"Das Moderator-Kit sehen nur Moderations-Accounts.",
  loginSub:"Ein Account für alle: deine Sterne auf jedem Gerät. Wer moderiert, sieht nach dem Anmelden das Material.",
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
const SITE_PHASES = ["site-home","site-session","login","reset"];
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
function siteBar(onLogin){
  const who = siteRole === "guest"
    ? (onLogin ? "" : `<a class="btn small" href="${esc(loginHref())}">${esc(t().login)}</a>`)
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
  stopPoster();
  // nobody signed in: the poster (concept C, Rafa 05.11.2026); signed in: unchanged
  if(siteRole === "guest") return renderPoster();
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

/* ---------- start for visitors who are not signed in: concept C «Poster» ----------
   Rafa, 05.11.2026, picked from «DM signed-out mocks» (like the Apple Events page):
   a slogan from the TV set in big type, «THIS IS DEMOCRACY.», the next date on a blue
   band with one «Save the date» (a real .ics), what happens, coming up, past topics.
   Moderator kit and stars stay behind the quiet footer. Signed-in people see My DM above.
   Next and coming-up dates: packs/sessions.json (sessions with a topic; time, room, cases)
   plus packs/dates.json (planned dates without a topic yet). Nothing about a date is written here. */
const POSTER_T = {
 en:{ join:"Join the conversation", thisDay:wd=>"this " + wd, today:"today", topicTbc:"Topic to follow",
  timeTbc:"Time and room to follow", room:"room", rhythm:"First Friday of every month",
  open:"Open to all Impact Hub members and guests", save:"Save the date",
  what:"What happens", one:"Democracy is more than voting day. Let’s talk about it.",
  where:"First Friday of every month at Impact Hub Zürich.",
  quiz:"Quiz", quizWhat:"On the day: scan the QR code on the slides.",
  cases:"Real cases", disc:"Discussion", discWhat:"Together, in the room.",
  soon:"Coming up", past:"Past topics", stars:"Your stars", mods:"For moderators · Sign in", signin:"Sign in",
  pause:"Pause", play:"Play", slogans:"Slogans", slogan:(i,n)=>`Slogan ${i} of ${n}`,
  saved:"Calendar file downloaded: open it to add the date." },
 de:{ join:"Diskutier mit", thisDay:wd=>"diesen " + wd, today:"heute", topicTbc:"Thema folgt",
  timeTbc:"Zeit und Raum folgen", room:"Raum", rhythm:"Jeden ersten Freitag im Monat",
  open:"Offen für alle Mitglieder und Gäste des Impact Hub", save:"Termin speichern",
  what:"Was passiert", one:"Demokratie ist mehr als der Abstimmungssonntag. Reden wir darüber.",
  where:"Jeden ersten Freitag im Monat im Impact Hub Zürich.",
  quiz:"Quiz", quizWhat:"Am Tag selbst: QR-Code auf den Folien scannen.",
  cases:"Echte Fälle", disc:"Diskussion", discWhat:"Gemeinsam, im Raum.",
  soon:"Demnächst", past:"Frühere Themen", stars:"Deine Sterne", mods:"Für Moderierende · Anmelden", signin:"Anmelden",
  pause:"Pause", play:"Abspielen", slogans:"Slogans", slogan:(i,n)=>`Slogan ${i} von ${n}`,
  saved:"Kalenderdatei geladen: öffnen, um den Termin einzutragen." },
 fr:{ join:"Rejoins la discussion", thisDay:wd=>"ce " + wd, today:"aujourd’hui", topicTbc:"Thème à venir",
  timeTbc:"Heure et salle à venir", room:"salle", rhythm:"Le premier vendredi de chaque mois",
  open:"Ouvert à tous les membres et invités de l’Impact Hub", save:"Noter la date",
  what:"Au programme", one:"La démocratie, c’est plus que le jour du vote. Parlons-en.",
  where:"Le premier vendredi de chaque mois à l’Impact Hub Zürich.",
  quiz:"Quiz", quizWhat:"Le jour même : scanne le code QR sur les diapositives.",
  cases:"Cas réels", disc:"Discussion", discWhat:"Ensemble, dans la salle.",
  soon:"Prochainement", past:"Thèmes passés", stars:"Tes étoiles", mods:"Pour la modération · Connexion", signin:"Connexion",
  pause:"Pause", play:"Lecture", slogans:"Slogans", slogan:(i,n)=>`Slogan ${i} sur ${n}`,
  saved:"Fichier calendrier téléchargé : ouvre-le pour ajouter la date." },
 it:{ join:"Unisciti alla discussione", thisDay:wd=>"questo " + wd, today:"oggi", topicTbc:"Tema in arrivo",
  timeTbc:"Orario e sala in arrivo", room:"sala", rhythm:"Il primo venerdì di ogni mese",
  open:"Aperto a tutti i soci e agli ospiti dell’Impact Hub", save:"Segna la data",
  what:"Cosa succede", one:"La democrazia è più del giorno del voto. Parliamone.",
  where:"Il primo venerdì di ogni mese all’Impact Hub Zürich.",
  quiz:"Quiz", quizWhat:"Il giorno stesso: scansiona il codice QR sulle slide.",
  cases:"Casi reali", disc:"Discussione", discWhat:"Insieme, in sala.",
  soon:"Prossimamente", past:"Temi passati", stars:"Le tue stelle", mods:"Per la moderazione · Accedi", signin:"Accedi",
  pause:"Pausa", play:"Riproduci", slogans:"Slogan", slogan:(i,n)=>`Slogan ${i} di ${n}`,
  saved:"File del calendario scaricato: aprilo per aggiungere la data." }
};
function pt(){ return POSTER_T[lang] || POSTER_T.en; }
/* word for word from the TV set (English only there, so on every language) */
const SLOGANS = [
  ["You disagreed with your neighbour about the vote.","You’re still neighbours."],
  ["Your vote was secret. Nobody can check it.","Nobody can punish it."],
  ["Collect 100,000 signatures and the whole country","votes on your idea."],
  ["You searched for anything you wanted today.","Nothing was blocked."],
  ["You walked past a protest this morning.","Nobody was arrested."],
  ["You could quit your job today.","Nobody has to approve it."],
  ["Nobody entered your home last night.","Not without a warrant."]
];
const HUB = "Impact Hub Zürich";
const ZRH = { tz:"Europe/Zurich", lines:["BEGIN:VTIMEZONE","TZID:Europe/Zurich",
  "BEGIN:DAYLIGHT","TZOFFSETFROM:+0100","TZOFFSETTO:+0200","TZNAME:CEST","DTSTART:19700329T020000","RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU","END:DAYLIGHT",
  "BEGIN:STANDARD","TZOFFSETFROM:+0200","TZOFFSETTO:+0100","TZNAME:CET","DTSTART:19701025T030000","RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU","END:STANDARD",
  "END:VTIMEZONE"] };
const poster = { say:0, paused:null, timer:0, planned:null };
function stopPoster(){ clearInterval(poster.timer); poster.timer = 0; }
let datesCache = null;
function plannedDates(){
  if(!datesCache) datesCache = loadJSON("packs/dates.json").then(d=>Array.isArray(d && d.planned) ? d.planned : []).catch(()=>[]);
  return datesCache;
}
/* upcoming = sessions with a topic and a date today or later, plus planned dates not taken by one */
function posterDates(planned){
  const ids = siteSessions().filter(id=>!registry[id].draft);
  const withTopic = ids.filter(isUpcoming).map(id=>{
    const s = registry[id];
    return { id, date:s.date, time:s.time || "", room:s.room || "", minutes:s.minutes || 0, title:L(s.title) || id, cases:L(s.cases), note:"" };
  });
  const taken = new Set(withTopic.map(x=>x.date)), today = todayISO();
  const free = planned.filter(p=>p && /^\d{4}-\d{2}-\d{2}$/.test(p.date) && p.date >= today && !taken.has(p.date))
    .map(p=>({ id:"", date:p.date, time:p.time || "", room:p.room || "", minutes:p.minutes || 0, title:"", cases:"", note:L(p.note) }));
  const up = withTopic.concat(free).sort((a,b)=>a.date.localeCompare(b.date));
  const byDateDesc = (a,b)=>String(registry[b].date||"").localeCompare(String(registry[a].date||""));
  const past = ids.filter(id=>!isUpcoming(id)).sort(byDateDesc);
  return { next:up[0] || null, later:up.slice(1), past };
}
const isoDay = iso => new Date(iso + "T12:00:00");
function shortDay(iso){
  const d = isoDay(iso);
  return isNaN(d) ? iso : d.toLocaleDateString(LOCALES[lang] || "en-GB", { weekday:"short", day:"numeric", month:"short" });
}
function relDay(iso){
  const days = Math.round((isoDay(iso) - isoDay(todayISO())) / 864e5);
  if(days === 0) return pt().today;
  if(days > 0 && days < 7) return pt().thisDay(isoDay(iso).toLocaleDateString(LOCALES[lang] || "en-GB", { weekday:"long" }));
  return "";
}
function clock(hm){
  const m = /^(\d{1,2}):(\d{2})$/.exec(hm || "");
  if(!m) return "";
  if(lang !== "en") return `${m[1].padStart(2,"0")}:${m[2]}`;
  const h = +m[1], h12 = h % 12 || 12;
  return `${h12}${m[2] === "00" ? "" : ":" + m[2]} ${h < 12 ? "AM" : "PM"}`;
}
function timeRoom(n){
  const parts = [clock(n.time), n.room ? pt().room + " " + n.room : ""].filter(Boolean);
  return parts.length ? parts.join(", ") : pt().timeTbc;
}

function posterBar(){
  return `<header class="sbar">
    <a class="wordmark" href="./">${esc(t().brand)}</a>
    <span class="sright">
      <button class="langcycle" id="lc" type="button" aria-label="Language: ${lang.toUpperCase()}" title="${LANGS.map(l=>l.toUpperCase()).join(" / ")}">${lang.toUpperCase()}</button>
      <a class="psignin" href="${esc(loginHref())}">${esc(pt().signin)}</a>
    </span></header>`;
}
function sloganHtml(i){ const s = SLOGANS[i]; return `${esc(s[0])} <span class="c2">${esc(s[1])}</span>`; }

async function renderPoster(){
  const planned = await plannedDates();
  if(phase !== "site-home" || siteRole !== "guest") return;
  let reduce = false; try{ reduce = matchMedia("(prefers-reduced-motion: reduce)").matches; }catch(e){}
  if(poster.paused === null) poster.paused = reduce;      // less motion: still until the visitor presses Play
  const P = pt(), { next:n, later, past } = posterDates(planned);
  const title = n ? (n.title ? [n.title, relDay(n.date)].filter(Boolean).join(" ") : st().nextSession) : "";
  const band = n ? `<section class="c-band" aria-label="${esc(st().nextSession)}">
      <div class="c-hd"><div class="jc">${esc(P.join)}</div><h2 class="t">${esc(title)}</h2></div>
      <div class="c-q"><p class="q" id="ctag">${n.id ? "" : esc(P.topicTbc) + "."}</p></div>
      <div class="c-dt">
        <div class="c-date"><div class="d">${esc(shortDay(n.date))}</div><div class="tr">${esc(timeRoom(n))}</div>
          <div class="og">${esc(P.rhythm)} · ${esc(P.open)}</div></div>
        <div class="acts"><button class="btn white" id="csave" type="button">${esc(P.save)}</button>
          <span class="sr" role="status" aria-live="polite" id="csavelive"></span></div>
      </div></section>` : `<p class="sub" style="margin-top:16px">${esc(st().noneYet)}</p>`;
  const how = `<section class="c-sec"><h3>${esc(P.what)}</h3>
      <p class="c-one">${esc(P.one)}</p><p class="c-where">${esc(P.where)}</p>
      <div class="c-how">
        <div class="why rot1"><b>${esc(P.quiz)}</b>${esc(P.quizWhat)}</div>
        <div class="why rot2"><b>${esc(P.cases)}</b><span id="ccases">${n && n.cases ? esc(n.cases) + "." : n && n.id ? "" : esc(P.topicTbc) + "."}</span></div>
        <div class="why rot1"><b>${esc(P.disc)}</b>${esc(P.discWhat)}</div>
      </div></section>`;
  const soon = later.length ? `<section class="c-sec"><h3>${esc(P.soon)}</h3><div class="c-soon">${later.map(x=>
      x.id ? `<a href="?view=session&amp;id=${encodeURIComponent(x.id)}"><b>${esc(shortDay(x.date))}</b><span>${esc(x.title)}</span></a>`
           : `<div><b>${esc(shortDay(x.date))}</b><span>${x.note ? esc(x.note) + ". " : ""}${esc(P.topicTbc)}</span></div>`).join("")}</div></section>` : "";
  const pastHtml = past.length ? `<section class="c-sec"><h3>${esc(P.past)}</h3><div class="c-past">${past.map(id=>{
      const s = registry[id], pl = PILLAR_EMOJI[s.pillar] || "";
      return `<a class="c-pcard" href="?view=session&amp;id=${encodeURIComponent(id)}">
        <img src="assets/thumbs/${encodeURIComponent(id)}-2.jpg" alt="" loading="lazy" onerror="this.remove()">
        <span class="bd"><b>${esc(L(s.title) || id)}</b><span class="meta">${pl ? pl + "&nbsp; " : ""}${esc(longDate(s.date))}</span>
        <span class="why" data-bl="${esc(id)}" hidden><b>${esc(st().bottomLine)}</b><span></span></span></span></a>`;
    }).join("")}</div></section>` : "";
  app.innerHTML = `${posterBar()}
    ${errKey ? `<p class="err site-err">${esc(t()[errKey] || "")}</p>` : ""}
    <main class="poster">
      <h1 class="kicker">${esc(t().brand)}</h1>
      <p class="c-say" id="csay" aria-live="${poster.paused ? "polite" : "off"}" aria-atomic="true">${sloganHtml(poster.say)}</p>
      <p class="c-this">THIS IS DEMOCRACY.</p>
      <div class="c-dots" role="group" aria-label="${esc(P.slogans)}">
        ${SLOGANS.map((_, i)=>`<button type="button" data-dot="${i}" aria-label="${esc(P.slogan(i + 1, SLOGANS.length))}" aria-pressed="${i === poster.say}"></button>`).join("")}
        <button type="button" class="c-pause" id="cpause" aria-pressed="${!!poster.paused}">${poster.paused ? "▶ " + esc(P.play) : "❚❚ " + esc(P.pause)}</button>
      </div>
      ${band}${how}${soon}${pastHtml}
    </main>
    <footer class="qfoot"><span>${esc(t().brand)} · ${HUB}</span><span class="sep"></span>
      <a href="?view=mydm">★ ${esc(P.stars)}</a><a href="${esc(loginHref())}">${esc(P.mods)}</a></footer>`;
  bindSiteBar();
  bindPoster(n);
  if(n && n.id) takeHome(n.id).then(x=>{
    if(phase !== "site-home") return;
    const tag = document.getElementById("ctag"), cs = document.getElementById("ccases");
    if(tag && x && x.tag) tag.textContent = x.tag;
    if(cs && !cs.textContent) cs.textContent = x && x.tag ? x.tag : "";
  });
  past.forEach(id=>takeHome(id).then(x=>{
    const el = phase === "site-home" && app.querySelector(`[data-bl="${CSS.escape(id)}"]`);
    if(el && x && x.bottom){ el.lastElementChild.innerHTML = x.bottom; el.hidden = false; }
  }));
}
function setSlogan(i, fade){
  poster.say = (i + SLOGANS.length) % SLOGANS.length;
  const el = document.getElementById("csay");
  if(!el) return stopPoster();
  app.querySelectorAll("[data-dot]").forEach(d=>d.setAttribute("aria-pressed", String(+d.dataset.dot === poster.say)));
  if(!fade){ el.innerHTML = sloganHtml(poster.say); return; }
  el.classList.add("fade");
  setTimeout(()=>{ el.innerHTML = sloganHtml(poster.say); el.classList.remove("fade"); }, 350);
}
function setPaused(v){
  poster.paused = v;
  const b = document.getElementById("cpause"), el = document.getElementById("csay");
  if(b){ b.textContent = v ? "▶ " + pt().play : "❚❚ " + pt().pause; b.setAttribute("aria-pressed", String(v)); }
  if(el) el.setAttribute("aria-live", v ? "polite" : "off");   // a moving slogan is not read out every few seconds
  stopPoster();
  if(!v) poster.timer = setInterval(()=>{
    if(phase !== "site-home" || document.hidden) return;
    setSlogan(poster.say + 1, true);
  }, 4500);
}
function bindPoster(n){
  setPaused(!!poster.paused);
  const say = document.getElementById("csay");
  if(say) say.onclick = ()=>setPaused(!poster.paused);
  const pb = document.getElementById("cpause");
  if(pb) pb.onclick = ()=>setPaused(!poster.paused);
  app.querySelectorAll("[data-dot]").forEach(d=>d.onclick = ()=>{ setPaused(true); setSlogan(+d.dataset.dot, false); });
  const sv = document.getElementById("csave");
  if(sv && n) sv.onclick = async ()=>{
    const take = n.id ? await takeHome(n.id) : null;
    const blob = new Blob([icsFor(n, take && take.tag)], { type:"text/calendar;charset=utf-8" });
    const url = URL.createObjectURL(blob), a = document.createElement("a");
    a.href = url; a.download = `democracy-matters-${n.date}.ics`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(()=>URL.revokeObjectURL(url), 30000);
    const live = document.getElementById("csavelive"); if(live) live.textContent = pt().saved;
  };
}

/* one event as iCalendar (RFC 5545): Zurich time with its VTIMEZONE, or an all-day entry
   while time is to follow; 60 minutes unless the session says otherwise («minutes») */
function icsFor(n, tag){
  const P = pt(), ymd = n.date.replace(/-/g, "");
  const tx = s => String(s).replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
  const enc = new TextEncoder();
  const fold = line => {                      // lines of at most 75 octets, never inside a character
    const out = []; let cur = "", len = 0;
    for(const ch of line){
      const b = enc.encode(ch).length;
      if(len + b > (out.length ? 74 : 75)){ out.push(cur); cur = ""; len = 0; }
      cur += ch; len += b;
    }
    out.push(cur);
    return out.join("\r\n ");
  };
  const stampNow = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
  const link = SITE_BASE + (n.id ? "?view=session&id=" + encodeURIComponent(n.id) : "");
  const m = /^(\d{1,2}):(\d{2})$/.exec(n.time || "");
  let when;
  if(m){
    const start = new Date(Date.UTC(+n.date.slice(0,4), +n.date.slice(5,7) - 1, +n.date.slice(8,10), +m[1], +m[2]));
    const end = new Date(start.getTime() + (n.minutes || 60) * 6e4);
    const local = d => d.toISOString().slice(0, 19).replace(/[-:]/g, "");
    when = [`DTSTART;TZID=${ZRH.tz}:${local(start)}`, `DTEND;TZID=${ZRH.tz}:${local(end)}`];
  } else {
    const nd = new Date(Date.UTC(+n.date.slice(0,4), +n.date.slice(5,7) - 1, +n.date.slice(8,10) + 1));
    when = [`DTSTART;VALUE=DATE:${ymd}`, `DTEND;VALUE=DATE:${nd.toISOString().slice(0,10).replace(/-/g, "")}`];
  }
  const room = n.room ? P.room.charAt(0).toUpperCase() + P.room.slice(1) + " " + n.room + ", " : "";
  const about = [tag || (n.id ? "" : P.topicTbc + "."), m ? "" : P.timeTbc + ".", P.open + ".", link].filter(Boolean).join("\n");
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Democracy Matters//dmatters.org//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
    ...(m ? ZRH.lines : []),
    "BEGIN:VEVENT", `UID:dm-${n.id || "session"}-${ymd}@dmatters.org`, `DTSTAMP:${stampNow}`, ...when,
    `SUMMARY:${tx(t().brand + (n.title ? " · " + n.title : ""))}`,
    `LOCATION:${tx(room + HUB)}`, `DESCRIPTION:${tx(about)}`, `URL:${link}`,
    "END:VEVENT", "END:VCALENDAR"];
  return lines.map(fold).join("\r\n") + "\r\n";
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
  if(!acctAuth){ const m = params.get("mode"); acctAuth = ["signup","forgot"].includes(m) ? m : "login"; }
  const intro = acctAuth === "login" || acctAuth === "signup";
  app.innerHTML = `${siteBar(true)}
    <div class="screen" style="padding-top:10px">
      ${wordmarkHtml("", t().curriculum)}
      <h1>${esc(acctTitle())}</h1>
      ${intro ? `<p class="sub">${esc(st().loginSub)}</p>` : ""}
      ${acctHtml()}
      <a class="lnk" href="${esc(loginNext())}">${esc(t().cancel)}</a>
    </div>`;
  bindSiteBar(); bindAcct();
}

function siteRerender(){
  if(phase === "site-home") renderHome();
  else if(phase === "site-session") renderSessionPage(siteId);
  else if(phase === "login") renderLogin();
  else if(phase === "reset") renderReset();
}
