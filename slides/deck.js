/*
 * Deck behaviour for every slides/<topic>.html (session setup, Rafa 07.10.2026, mock PESjSgJLUXdJFtqBJeVu9H).
 *
 *  1. Screen: each 1280 × 720 slide keeps its 16:9 layout and is scaled to the window width,
 *     so a half-screen window or a phone sees the whole slide instead of a cut-off one.
 *  2. Present ▶ (top right, or ?present=1 in the URL, which the admin page opens): one slide at a
 *     time in the full window. Click the right two thirds or →/Space/PgDn for next, the left third or
 *     ←/PgUp for back, Home/End for first/last, F for full screen, Esc to leave.
 *     The run-sheet slide stays in the sequence as the last slide.
 *  3. Print / PDF (npm run render-topic) is untouched: every rule here is screen-only, and the
 *     slides stay in the document in their order.
 *
 * Slides are moved (not cloned) into the presentation stage and back, so the QR codes and the
 * exercise timer keep their elements and listeners.
 */
(function(){
  var W = 1280, H = 720;
  var slides = [].slice.call(document.querySelectorAll('body > .slide'));
  if (!slides.length) return;

  var css =
    '@media screen{' +
      'body.dk{padding:16px;min-height:100vh}' +
      '.dk-top{position:sticky;top:0;z-index:20;display:flex;justify-content:flex-end;padding:0 0 16px;pointer-events:none}' +
      '.dk-btn{pointer-events:auto;font:700 15px Poppins,system-ui,sans-serif;background:#5AD1A8;color:#0F1B2A;border:0;' +
        'border-radius:12px;padding:10px 18px;min-height:44px;cursor:pointer;box-shadow:0 4px 16px rgba(0,0,0,.35)}' +
      '.dk-btn:focus-visible,.dk-bar button:focus-visible{outline:2px solid #5AD1A8;outline-offset:2px}' +
      '.dk-fit{position:relative;width:100%;aspect-ratio:16/9;overflow:hidden;margin:0 0 16px;border-radius:4px;' +
        'box-shadow:0 6px 24px rgba(0,0,0,.45)}' +
      '.dk-fit>.slide,.dk-slot>.slide{position:absolute!important;left:0;top:0;margin:0!important;box-shadow:none!important;transform-origin:0 0}' +
      '.dk-stage{position:fixed;inset:0;z-index:1000;background:#000;overflow:hidden;user-select:none;-webkit-user-select:none;cursor:pointer;outline:none}' +
      '.dk-stage[hidden]{display:none}' +
      '.dk-slot{position:absolute;left:0;top:0;width:' + W + 'px;height:' + H + 'px;transform-origin:0 0}' +
      '.dk-slot>.slide{transform:none!important}' +
      '.dk-prog{position:absolute;left:0;top:0;height:3px;background:#5AD1A8;transition:width .2s}' +
      '.dk-hint{position:absolute;inset:0;display:grid;grid-template-columns:1fr 2fr;pointer-events:none}' +
      '.dk-hint span{display:flex;align-items:center;padding:0 18px;font:34px system-ui,sans-serif;color:#fff;opacity:0;transition:opacity .2s}' +
      '.dk-hint span:last-child{justify-content:flex-end}' +
      '@media (hover:hover){.dk-stage:hover .dk-hint span{opacity:.18}}' +
      '.dk-bar{position:absolute;left:0;right:0;bottom:0;display:flex;align-items:center;gap:8px;padding:10px 12px;' +
        'background:linear-gradient(transparent,rgba(0,0,0,.65));color:#fff;opacity:0;transition:opacity .2s;cursor:default}' +
      '@media (hover:hover){.dk-stage:hover .dk-bar{opacity:1}}' +
      '.dk-stage:focus-within .dk-bar,.dk-stage.show .dk-bar{opacity:1}' +
      '.dk-bar button{font:700 15px Poppins,system-ui,sans-serif;color:#fff;background:rgba(255,255,255,.14);border:0;' +
        'border-radius:10px;min-width:44px;min-height:40px;cursor:pointer;padding:0 12px}' +
      '.dk-count{font:700 15px Poppins,system-ui,sans-serif;font-variant-numeric:tabular-nums;min-width:64px;text-align:center}' +
      '.dk-sp{flex:1}' +
      '.dk-bar [data-k=prev],.dk-bar [data-k=next]{font-size:22px;line-height:1}' +
      'body.dk-on{overflow:hidden}' +
      '@media (prefers-reduced-motion:reduce){.dk-prog,.dk-bar,.dk-hint span{transition:none}}' +
    '}' +
    '@media print{.dk-top,.dk-stage{display:none!important}.dk-fit{display:contents}.dk-fit>.slide{transform:none!important}}';
  var st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
  document.body.classList.add('dk');

  /* 1. scaled view */
  var top = document.createElement('div'); top.className = 'dk-top';
  var pbtn = document.createElement('button'); pbtn.type = 'button'; pbtn.className = 'dk-btn'; pbtn.textContent = 'Present ▶';
  top.appendChild(pbtn);
  document.body.insertBefore(top, slides[0]);
  var fits = slides.map(function(s){
    var f = document.createElement('div'); f.className = 'dk-fit';
    s.parentNode.insertBefore(f, s); f.appendChild(s); return f;
  });
  function scaleAll(){
    fits.forEach(function(f){ var s = f.firstElementChild; if (s && f.clientWidth) s.style.transform = 'scale(' + (f.clientWidth / W) + ')'; });
    fitStage();
  }

  /* 2. presentation */
  var stage = document.createElement('div');
  stage.className = 'dk-stage'; stage.hidden = true; stage.tabIndex = 0;
  stage.setAttribute('role', 'region'); stage.setAttribute('aria-label', 'Presentation, use the arrow keys');
  stage.innerHTML =
    '<div class="dk-slot"></div><div class="dk-prog"></div>' +
    '<div class="dk-hint" aria-hidden="true"><span>‹</span><span>›</span></div>' +
    '<div class="dk-bar">' +
      '<button type="button" data-k="prev" aria-label="Previous slide">‹</button>' +
      '<span class="dk-count" aria-live="polite"></span>' +
      '<button type="button" data-k="next" aria-label="Next slide">›</button>' +
      '<span class="dk-sp"></span>' +
      '<button type="button" data-k="full">Full screen</button>' +
      '<button type="button" data-k="close" aria-label="Leave presentation">✕</button>' +
    '</div>';
  document.body.appendChild(stage);
  var slot = stage.querySelector('.dk-slot'), prog = stage.querySelector('.dk-prog'),
      count = stage.querySelector('.dk-count'), fullBtn = stage.querySelector('[data-k=full]');
  var cur = -1, on = false;

  function go(n){
    n = Math.max(0, Math.min(slides.length - 1, n));
    if (n === cur && slot.firstElementChild) return;
    if (cur >= 0 && slides[cur].parentNode === slot) fits[cur].appendChild(slides[cur]);
    cur = n;
    slot.appendChild(slides[cur]);
    count.textContent = (cur + 1) + ' / ' + slides.length;
    prog.style.width = ((cur + 1) / slides.length * 100) + '%';
    fitStage(); scaleAll();
  }
  function fitStage(){
    if (!on) return;
    var w = stage.clientWidth, h = stage.clientHeight; if (!w) return;
    var s = Math.min(w / W, h / H);
    slot.style.transform = 'translate(' + ((w - W * s) / 2) + 'px,' + ((h - H * s) / 2) + 'px) scale(' + s + ')';
  }
  function flash(){ stage.classList.add('show'); clearTimeout(stage._t); stage._t = setTimeout(function(){ stage.classList.remove('show'); }, 1800); }
  function open(n){
    on = true; stage.hidden = false; document.body.classList.add('dk-on');
    cur = -1; go(n || 0); stage.focus({ preventScroll:true }); flash();
  }
  function close(){
    if (document.fullscreenElement) document.exitFullscreen().catch(function(){});
    if (cur >= 0) fits[cur].appendChild(slides[cur]);
    on = false; stage.hidden = true; document.body.classList.remove('dk-on');
    scaleAll();
    if (cur >= 0) fits[cur].scrollIntoView({ block:'center' });
    pbtn.focus({ preventScroll:true });
  }
  function full(){
    if (document.fullscreenElement) { document.exitFullscreen().catch(function(){}); return; }
    var el = document.documentElement;
    if (el.requestFullscreen) el.requestFullscreen().catch(function(){});
  }
  // Present ▶ starts at the first slide whose middle is below the button row (the one being looked at).
  function inView(){
    var tb = top.getBoundingClientRect().bottom;
    for (var i = 0; i < fits.length; i++) { var r = fits[i].getBoundingClientRect(); if (r.top + r.height / 2 > tb) return i; }
    return fits.length - 1;
  }

  pbtn.addEventListener('click', function(){ open(inView()); });
  stage.addEventListener('click', function(e){
    var k = e.target.closest('[data-k]');
    if (k) { e.stopPropagation(); var a = k.getAttribute('data-k');
      if (a === 'prev') go(cur - 1); else if (a === 'next') go(cur + 1); else if (a === 'full') full(); else close();
      return; }
    if (e.target.closest('a,button,input,select,textarea,.dk-bar')) return;
    var r = stage.getBoundingClientRect();
    go(cur + ((e.clientX - r.left) < r.width / 3 ? -1 : 1)); flash();
  });
  document.addEventListener('keydown', function(e){
    if (!on || e.metaKey || e.ctrlKey || e.altKey) return;
    var k = e.key, t = e.target, ctl = t && t.closest && t.closest('a,button,input,select,textarea');
    if (k === 'ArrowRight' || k === 'PageDown' || ((k === ' ' || k === 'Enter') && !ctl)) { go(cur + 1); e.preventDefault(); }
    else if (k === 'ArrowLeft' || k === 'PageUp' || (k === 'Backspace' && !ctl)) { go(cur - 1); e.preventDefault(); }
    else if (k === 'Home') { go(0); e.preventDefault(); }
    else if (k === 'End') { go(slides.length - 1); e.preventDefault(); }
    else if (k === 'f' || k === 'F') { full(); e.preventDefault(); }
    else if (k === 'Escape' && !document.fullscreenElement) { close(); e.preventDefault(); }
  });
  // A click into an embedded video moves keyboard focus into its iframe, and the arrow keys and a
  // presenter remote would stop working: hand focus back to the stage (the video keeps playing).
  window.addEventListener('blur', function(){
    if (!on) return;
    setTimeout(function(){ var a = document.activeElement; if (a && a.tagName === 'IFRAME') stage.focus({ preventScroll:true }); }, 0);
  });
  document.addEventListener('fullscreenchange', function(){
    fullBtn.textContent = document.fullscreenElement ? 'Exit full screen' : 'Full screen';
    setTimeout(fitStage, 50);
  });

  if (window.ResizeObserver) new ResizeObserver(scaleAll).observe(document.body);
  window.addEventListener('resize', scaleAll);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(scaleAll);
  scaleAll();

  var q = new URLSearchParams(location.search);
  if (q.get('present') === '1') open((parseInt(q.get('slide'), 10) || 1) - 1);
})();
