/*
 * Elections session (06.11.2026): the ONE file to fill in once results exist.
 *
 * Today (30.10.2026) every value is null, and the deck and the take-home page show a marked
 * «⏳ SLOT» box. Nothing else needs editing: enter the numbers here, then run
 *   npm run render-topic -- elections
 * Full list, with what to do about uncalled races: docs/runbook-elections.md
 *
 * Rules: official figures or race calls only. Never a poll, never a forecast.
 * A race nobody has called stays in `open`. `majority` stays null until a majority is called.
 */
window.DM_RESULTS = {
  us: {
    asOf: null,        // when you read the numbers, e.g. "05.11.2026, 08:00"
    source: null,      // e.g. "AP"
    house:     { d: null, r: null, open: null, majority: null },   // d/r = seats called; majority "D" or "R" once called
    senate:    { d: null, r: null, open: null, majority: null },   // count independents with the party they sit with, and say so in `note`
    governors: { d: null, r: null, open: null },
    turnout: null,     // estimate as text, e.g. "≈ 47 %"; leave null if none is published
    note: null         // optional, one language-neutral line, e.g. "GA: runoff 01.12."
  },
  rs: {
    asOf: null,        // when the electoral commission published its final report
    student: { pct: null, seats: null },   // final figures of the Republic Electoral Commission (RIK)
    united:  { pct: null, seats: null },
    turnout: null      // e.g. "69,0 %"
  }
};

/* Below: display only, no need to touch it. */
(function(){
  var W = {
    de:{tagPre:'VORLÄUFIG', tagFinal:'ENDRESULTAT', tagNone:'NOCH KEIN RESULTAT', tagInterim:'NICHT AMTLICH', slot:'⏳ SLOT', none:'Noch kein Resultat. Wird eingetragen, sobald es vorliegt.', house:'Repräsentantenhaus', senate:'Senat', gov:'Gouverneure',
        d:'Demokraten', r:'Republikaner', open:'noch offen', maj:'Mehrheit', undecided:'noch nicht entschieden', asOf:'Stand', turnout:'Beteiligung',
        rsTitle:'Endresultat der Wahlkommission', rsNone:'Noch offen: erst nach der Wiederholung am 1.11.', student:'Studentenliste', united:'Vereintes Serbien', seats:'Sitze'},
    en:{tagPre:'PRELIMINARY', tagFinal:'FINAL RESULT', tagNone:'NO RESULT YET', tagInterim:'NOT OFFICIAL', slot:'⏳ SLOT', none:'No result yet. To be entered once it exists.', house:'House', senate:'Senate', gov:'Governors',
        d:'Democrats', r:'Republicans', open:'still open', maj:'Majority', undecided:'not decided yet', asOf:'As of', turnout:'Turnout',
        rsTitle:'Final result of the electoral commission', rsNone:'Still open: only after the repeat vote on 1 Nov.', student:'Student List', united:'United Serbia', seats:'seats'},
    fr:{tagPre:'PROVISOIRE', tagFinal:'RÉSULTAT FINAL', tagNone:'PAS ENCORE DE RÉSULTAT', tagInterim:'NON OFFICIEL', slot:'⏳ SLOT', none:'Pas encore de résultat. À inscrire dès qu’il existe.', house:'Chambre', senate:'Sénat', gov:'Gouverneurs',
        d:'Démocrates', r:'Républicains', open:'encore ouverts', maj:'Majorité', undecided:'pas encore décidée', asOf:'État au', turnout:'Participation',
        rsTitle:'Résultat final de la commission électorale', rsNone:'Encore ouvert : seulement après le nouveau vote du 1er nov.', student:'Liste étudiante', united:'Serbie unie', seats:'sièges'},
    it:{tagPre:'PROVVISORIO', tagFinal:'RISULTATO FINALE', tagNone:'ANCORA NESSUN RISULTATO', tagInterim:'NON UFFICIALE', slot:'⏳ SLOT', none:'Ancora nessun risultato. Da inserire appena esiste.', house:'Camera', senate:'Senato', gov:'Governatori',
        d:'Democratici', r:'Repubblicani', open:'ancora aperti', maj:'Maggioranza', undecided:'non ancora decisa', asOf:'Stato al', turnout:'Affluenza',
        rsTitle:'Risultato finale della commissione elettorale', rsNone:'Ancora aperto: solo dopo la ripetizione del voto del 1° nov.', student:'Lista studentesca', united:'Serbia unita', seats:'seggi'}
  };
  var esc = function(s){ return String(s).replace(/[&<>"]/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]; }); };
  var has = function(v){ return v !== null && v !== undefined && v !== ''; };
  function empty(w, title){ return '<b>' + w.slot + (title ? ' · ' + esc(title) : '') + '</b> ' + esc(w.none); }
  function race(w, name, x, withMajority){
    if (!has(x.d) || !has(x.r)) return { on:false, html:empty(w, name) };
    var line = '<b>' + esc(name) + ':</b> ' + esc(w.d) + ' ' + esc(x.d) + ' · ' + esc(w.r) + ' ' + esc(x.r);
    if (has(x.open) && x.open > 0) line += ' · ' + esc(w.open) + ' ' + esc(x.open);
    if (withMajority) line += ' · ' + esc(w.maj) + ': ' + (x.majority ? esc(x.majority === 'D' ? w.d : x.majority === 'R' ? w.r : x.majority) : esc(w.undecided));
    return { on:true, html:line };
  }
  window.DM_renderResults = function(lang){
    var w = W[lang] || W.de, R = window.DM_RESULTS, u = R.us, s = R.rs;
    var stamp = u.asOf ? esc(w.asOf) + ' ' + esc(u.asOf) + (u.source ? ' · ' + esc(u.source) : '') + (u.note ? ' · ' + esc(u.note) : '') : '';
    var map = {
      'us.house': race(w, w.house, u.house, true),
      'us.senate': race(w, w.senate, u.senate, true),
      'us.governors': race(w, w.gov, u.governors, false),
      'us.stamp': { on:!!stamp, html:stamp, hide:!stamp },
      'us.tag': { on:false, html:esc(has(u.house.d) ? w.tagInterim : w.tagNone) },
      'rs.tag': { on:false, html:esc(has(s.student.seats) ? w.tagFinal : w.tagPre) },
      'us.turnout': has(u.turnout) ? { on:true, html:esc(u.turnout) } : { on:false, html:w.slot },
      'rs.final': has(s.student.seats) && has(s.united.seats)
        ? { on:true, html:'<b>' + esc(w.rsTitle) + ':</b> ' + esc(w.student) + ' ' + esc(s.student.pct) + ' · ' + esc(s.student.seats) + ' ' + esc(w.seats) +
            ' · ' + esc(w.united) + ' ' + esc(s.united.pct) + ' · ' + esc(s.united.seats) + ' ' + esc(w.seats) +
            (has(s.turnout) ? ' · ' + esc(w.turnout) + ' ' + esc(s.turnout) : '') + (s.asOf ? ' · ' + esc(w.asOf) + ' ' + esc(s.asOf) : '') }
        : { on:false, html:'<b>' + w.slot + ' · ' + esc(w.rsTitle) + '</b> ' + esc(w.rsNone) }
    };
    document.querySelectorAll('[data-slot]').forEach(function(el){
      var v = map[el.getAttribute('data-slot')]; if (!v) return;
      el.innerHTML = v.html;
      el.classList.toggle('filled', !!v.on);
      if (v.hide) el.style.display = 'none';
    });
  };
})();
