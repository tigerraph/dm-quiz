/*
 * Elections session (06.11.2026): the ONE file to fill in once results exist.
 *
 * Today (30.10.2026) every value is null, and the deck and the take-home page show a marked box
 * «⏳ Resultat folgt». Nothing else needs editing: enter the values here, then run
 *   npm run render-topic -- elections
 * Full list, with what to do about uncalled races: docs/runbook-elections.md
 *
 * Rules: official figures or race calls only. Never a poll, never a forecast.
 * A race nobody has called stays in `open`. `majority` stays null until a majority is called.
 * Write percentages as text, the way they should appear: "53,0 %".
 */
window.DM_RESULTS = {
  us: {
    asOf: "04.11.2026, 09:10",   // read 04.11.2026 09:10 CET; newest update in the files 09:07 CET
    source: "AP via NPR",        // apps.npr.org/2026-election-results/data/{house,senate,gov}.json; NPR: «Election results are tabulated by The Associated Press»
    house:     { d: 219, r: 135, other: 0, open: 81, majority: "D" },   // 354 called; 80 «Too Early to Call» + LA-5 runoff; 219 called seats reach the 218 needed
    senate:    { d: 54, r: 43, other: 0, open: 3, majority: "D" },      // whole chamber: called 20 D + 12 R; not up 32 D + 31 R + 2 independents who caucus with D (NPR); open AK, MS, NE
    governors: { d: 19, r: 12, other: 0, open: 5 },                     // of the 36 races; open AK, AZ, KS, NV, OR
    turnout: null,     // estimate as text, e.g. "≈ 47 %"; stays null if none is published
    note: {            // one line per language
      de: "Senat inkl. 2 Unabhängige, die mit den Demokraten stimmen · LA-5: Stichwahl",
      en: "Senate incl. 2 independents who caucus with the Democrats · LA-5: runoff",
      fr: "Sénat : y compris 2 indépendants qui siègent avec les démocrates · LA-5 : second tour",
      it: "Senato: inclusi 2 indipendenti che votano con i democratici · LA-5: ballottaggio"
    }
  },
  rs: {
    asOf: null,        // date of the electoral commission's final report, e.g. "05.11.2026"
    student: { pct: null, seats: null },   // final figures of the Republic Electoral Commission (RIK), e.g. "53,0 %", 141
    united:  { pct: null, seats: null },
    turnout: null      // e.g. "69,0 %". Serbia shows as final only when both lists and the turnout are all filled in
  }
};

/* Below: display only, no need to touch it. */
(function(){
  var W = {
    de:{tagPre:'VORLÄUFIG', tagFinal:'ENDRESULTAT', tagNone:'NOCH KEIN RESULTAT', tagInterim:'NICHT AMTLICH', slot:'⏳ Resultat folgt', none:'Wird eingetragen, sobald es vorliegt.', house:'Repräsentantenhaus', senate:'Senat', gov:'Gouverneure',
        d:'Demokraten', r:'Republikaner', other:'andere', open:'noch offen', maj:'Mehrheit', undecided:'noch nicht entschieden', asOf:'Stand', turnout:'Beteiligung', noTurnout:'nicht publiziert',
        rsTitle:'Endresultat der Wahlkommission', rsNone:'Erst nach der Wiederholung am 1. November.', student:'Studentenliste', united:'Vereintes Serbien', seats:'Sitze',
        rsLine:'Vorläufig: Studentenliste rund 53 %, Vereintes Serbien (SNS) rund 39 %, Beteiligung rund 69 %.', rsLineFinal:'Das Endresultat steht unten.', rsCell:'rund 69 %', rsCellNote:'vorläufig', rsCellFinal:'Endresultat'},
    en:{tagPre:'PRELIMINARY', tagFinal:'FINAL RESULT', tagNone:'NO RESULT YET', tagInterim:'NOT OFFICIAL', slot:'⏳ Result to follow', none:'To be entered once it exists.', house:'House', senate:'Senate', gov:'Governors',
        d:'Democrats', r:'Republicans', other:'others', open:'still open', maj:'Majority', undecided:'not decided yet', asOf:'As of', turnout:'Turnout', noTurnout:'not published',
        rsTitle:'Final result of the electoral commission', rsNone:'Only after the repeat vote on 1 November.', student:'Student List', united:'United Serbia', seats:'seats',
        rsLine:'Preliminary: Student List about 53%, United Serbia (SNS) about 39%, turnout about 69%.', rsLineFinal:'The final result is below.', rsCell:'about 69%', rsCellNote:'preliminary', rsCellFinal:'final result'},
    fr:{tagPre:'PROVISOIRE', tagFinal:'RÉSULTAT FINAL', tagNone:'PAS ENCORE DE RÉSULTAT', tagInterim:'NON OFFICIEL', slot:'⏳ Résultat à venir', none:'À inscrire dès qu’il existe.', house:'Chambre', senate:'Sénat', gov:'Gouverneurs',
        d:'Démocrates', r:'Républicains', other:'autres', open:'encore ouverts', maj:'Majorité', undecided:'pas encore décidée', asOf:'État au', turnout:'Participation', noTurnout:'non publiée',
        rsTitle:'Résultat final de la commission électorale', rsNone:'Seulement après le nouveau vote du 1er novembre.', student:'Liste étudiante', united:'Serbie unie', seats:'sièges',
        rsLine:'Provisoire : Liste étudiante env. 53 %, Serbie unie (SNS) env. 39 %, participation env. 69 %.', rsLineFinal:'Le résultat final figure ci-dessous.', rsCell:'env. 69 %', rsCellNote:'provisoire', rsCellFinal:'résultat final'},
    it:{tagPre:'PROVVISORIO', tagFinal:'RISULTATO FINALE', tagNone:'ANCORA NESSUN RISULTATO', tagInterim:'NON UFFICIALE', slot:'⏳ Risultato in arrivo', none:'Da inserire appena esiste.', house:'Camera', senate:'Senato', gov:'Governatori',
        d:'Democratici', r:'Repubblicani', other:'altri', open:'ancora aperti', maj:'Maggioranza', undecided:'non ancora decisa', asOf:'Stato al', turnout:'Affluenza', noTurnout:'non pubblicata',
        rsTitle:'Risultato finale della commissione elettorale', rsNone:'Solo dopo la ripetizione del voto del 1° novembre.', student:'Lista studentesca', united:'Serbia unita', seats:'seggi',
        rsLine:'Provvisorio: Lista studentesca circa 53 %, Serbia unita (SNS) circa 39 %, affluenza circa 69 %.', rsLineFinal:'Il risultato finale è qui sotto.', rsCell:'circa 69 %', rsCellNote:'provvisorio', rsCellFinal:'risultato finale'}
  };
  var esc = function(s){ return String(s).replace(/[&<>"]/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]; }); };
  var has = function(v){ return v !== null && v !== undefined && v !== ''; };
  function empty(w, title){ return '<b>' + esc(w.slot) + (title ? ' · ' + esc(title) : '') + '</b> ' + esc(w.none); }
  function race(w, name, x, withMajority){
    if (!has(x.d) || !has(x.r)) return { on:false, html:empty(w, name) };
    var line = '<b>' + esc(name) + ':</b> ' + esc(w.d) + ' ' + esc(x.d) + ' · ' + esc(w.r) + ' ' + esc(x.r);
    if (x.other > 0) line += ' · ' + esc(w.other) + ' ' + esc(x.other);
    if (has(x.open) && x.open > 0) line += ' · ' + esc(w.open) + ' ' + esc(x.open);
    if (withMajority) line += ' · ' + esc(w.maj) + ': ' + (x.majority ? esc(x.majority === 'D' ? w.d : x.majority === 'R' ? w.r : x.majority) : esc(w.undecided));
    return { on:true, html:line };
  }
  window.DM_renderResults = function(lang){
    var w = W[lang] || W.de, R = window.DM_RESULTS, u = R.us, s = R.rs;
    var rsFinal = has(s.student.pct) && has(s.student.seats) && has(s.united.pct) && has(s.united.seats) && has(s.turnout);   // all or nothing
    var called = has(u.house.d) || has(u.senate.d) || has(u.governors.d);
    var parts = [];
    if (u.asOf) parts.push(esc(w.asOf) + ' ' + esc(u.asOf));
    if (u.source) parts.push(esc(u.source));
    var note = (u.note && typeof u.note === 'object') ? (u.note[lang] || u.note.de) : u.note;
    if (note) parts.push(esc(note));
    var stamp = parts.join(' · ');
    var map = {
      'us.house': race(w, w.house, u.house, true),
      'us.senate': race(w, w.senate, u.senate, true),
      'us.governors': race(w, w.gov, u.governors, false),
      'us.stamp': { on:!!stamp, html:stamp, hide:!stamp },
      'us.turnout': has(u.turnout) ? { on:true, html:esc(u.turnout) } : { on:false, html:esc(called ? w.noTurnout : w.slot) },
      'us.tag': { on:false, html:esc(called ? w.tagInterim : w.tagNone) },
      'rs.tag': { on:false, html:esc(rsFinal ? w.tagFinal : w.tagPre) },
      'rs.line': { on:false, html:esc(rsFinal ? w.rsLineFinal : w.rsLine) },
      'rs.turnoutCell': { on:false, html:esc(rsFinal ? s.turnout : w.rsCell) },
      'rs.turnoutNote': { on:false, html:esc(rsFinal ? w.rsCellFinal : w.rsCellNote) },
      'rs.final': rsFinal
        ? { on:true, html:'<b>' + esc(w.rsTitle) + ':</b> ' + esc(w.student) + ' ' + esc(s.student.pct) + ' · ' + esc(s.student.seats) + ' ' + esc(w.seats) +
            ' · ' + esc(w.united) + ' ' + esc(s.united.pct) + ' · ' + esc(s.united.seats) + ' ' + esc(w.seats) +
            ' · ' + esc(w.turnout) + ' ' + esc(s.turnout) + (s.asOf ? ' · ' + esc(w.asOf) + ' ' + esc(s.asOf) : '') }
        : { on:false, html:'<b>' + esc(w.slot) + ' · ' + esc(w.rsTitle) + '</b> ' + esc(w.rsNone) }
    };
    document.querySelectorAll('[data-slot]').forEach(function(el){
      var v = map[el.getAttribute('data-slot')]; if (!v) return;
      el.innerHTML = v.html;
      el.classList.toggle('filled', !!v.on);
      if (v.hide) el.style.display = 'none';
    });
  };
})();
