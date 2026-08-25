/* ---------------- audio engine (all synthesized, offline) ----------------
   Carried over unchanged from noeggi-kahoot, minus the bonus-unlock cue.
   The SILENT loop is the iOS silent-switch unlock: an <audio> element
   playing silence puts the page in the "playback" category so WebAudio
   is audible with the hardware mute switch on. */
const A=(()=>{
  let ctx=null, mg=null, sg=null, tId=0, nextT=0, st=0, musicOn=false, muted=false, unlockEl=null;
  const SILENT="data:audio/wav;base64,UklGRmQGAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YUAGAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
  function unlock(){
    try{
      if(!unlockEl){
        unlockEl=new Audio(SILENT);
        unlockEl.loop=true;
        unlockEl.setAttribute("playsinline","");
      }
      if(!muted) unlockEl.play().catch(()=>{});
    }catch(e){}
    try{
      if(ctx){
        if(ctx.state!=="running") ctx.resume().catch(()=>{});
        const b=ctx.createBuffer(1,1,22050), s=ctx.createBufferSource();
        s.buffer=b; s.connect(ctx.destination); s.start(0);
      }
    }catch(e){}
  }
  const mtof=m=>440*Math.pow(2,(m-69)/12);
  function ensure(){
    if(ctx){ if(ctx.state==="suspended") ctx.resume().catch(()=>{}); return true; }
    try{
      const AC=window.AudioContext||window.webkitAudioContext;
      if(!AC) return false;
      ctx=new AC();
      mg=ctx.createGain(); mg.gain.value=muted?0.0001:0.5; mg.connect(ctx.destination);
      sg=ctx.createGain(); sg.gain.value=muted?0.0001:0.9; sg.connect(ctx.destination);
      if(ctx.state!=="running") ctx.resume().catch(()=>{});
      document.addEventListener("visibilitychange",()=>{
        if(!document.hidden && ctx && ctx.state!=="running") ctx.resume().catch(()=>{});
      });
    }catch(e){ ctx=null; return false; }
    return true;
  }
  function env(g,t0,a,d,peak){
    g.gain.setValueAtTime(0.0001,t0);
    g.gain.exponentialRampToValueAtTime(Math.max(peak,0.0002),t0+a);
    g.gain.exponentialRampToValueAtTime(0.0001,t0+a+d);
  }
  function tone(dest,f0,t0,dur,type,peak,f1){
    try{
      const o=ctx.createOscillator(), g=ctx.createGain();
      o.type=type; o.frequency.setValueAtTime(f0,t0);
      if(f1) o.frequency.exponentialRampToValueAtTime(Math.max(f1,1),t0+dur);
      env(g,t0,0.008,dur,peak);
      o.connect(g); g.connect(dest); o.start(t0); o.stop(t0+dur+0.06);
    }catch(e){}
  }
  function noise(dest,t0,dur,peak,hp){
    try{
      const b=ctx.createBuffer(1,Math.max(1,ctx.sampleRate*dur|0),ctx.sampleRate);
      const d=b.getChannelData(0); for(let i=0;i<d.length;i++) d[i]=Math.random()*2-1;
      const n=ctx.createBufferSource(); n.buffer=b;
      const f=ctx.createBiquadFilter(); f.type="highpass"; f.frequency.value=hp||5000;
      const g=ctx.createGain(); env(g,t0,0.004,dur,peak);
      n.connect(f); f.connect(g); g.connect(dest); n.start(t0);
    }catch(e){}
  }
  const ROOT=[33,29,36,31];                       // Am F C G
  const CH=[[57,60,64],[53,57,60],[48,52,55],[55,59,62]];
  function step16(s,t0){
    const bar=(s>>4)&3, s16=s&15;
    if(s16===0||s16===8) tone(mg,105,t0,.09,"sine",.30,42);
    if(s16%2===1) noise(mg,t0,.03,.05,6000);
    if(s16%2===0){ const oct=(s16%4===2)?12:0; tone(mg,mtof(ROOT[bar]+12+oct),t0,.16,"triangle",.16); }
    if(s16===0){ CH[bar].forEach(m=>{ tone(mg,mtof(m+12)*0.997,t0,2.3,"sawtooth",.018); tone(mg,mtof(m+12)*1.003,t0,2.3,"sawtooth",.018); }); }
    if(s16%8===4) tone(mg,mtof(CH[bar][(s>>2)%3]+24),t0,.12,"square",.035);
  }
  function sched(){
    if(!ctx||!musicOn) return;
    if(nextT<ctx.currentTime-0.2) nextT=ctx.currentTime+0.05;
    while(nextT<ctx.currentTime+0.9){ step16(st,nextT); st=(st+1)&63; nextT+=0.15; }
  }
  return {
    ensure, unlock,
    music(){ if(!ensure()) return; if(musicOn) return;
      musicOn=true; st=0; nextT=ctx.currentTime+0.08;
      clearInterval(tId); tId=setInterval(sched,250); },
    mute(m){ muted=m;
      try{ if(unlockEl){ if(m) unlockEl.pause(); else unlockEl.play().catch(()=>{}); } }catch(e){}
      if(!ctx){ if(!m) ensure(); if(!ctx) return; }
      mg.gain.setTargetAtTime(m?0.0001:0.5, ctx.currentTime, .05);
      sg.gain.setTargetAtTime(m?0.0001:0.9, ctx.currentTime, .05);
      if(!m && ctx.state==="suspended") ctx.resume().catch(()=>{}); },
    tap(){ if(muted||!ensure())return; tone(sg,620,ctx.currentTime,.05,"square",.12,880); },
    correct(stk){ if(muted||!ensure())return; const t0=ctx.currentTime;
      [523,659,784,1046].forEach((f,i)=>tone(sg,f,t0+i*.07,.12,"square",.16));
      if(stk>=2) tone(sg,1319,t0+.30,.14,"square",.13); },
    wrong(){ if(muted||!ensure())return; const t0=ctx.currentTime;
      tone(sg,190,t0,.32,"sawtooth",.20,80); tone(sg,95,t0+.02,.30,"square",.10,60); },
    tick(alt){ if(muted||!ensure())return; tone(sg,alt?1250:940,ctx.currentTime,.035,"sine",.10); },
    timeout(){ if(muted||!ensure())return; tone(sg,170,ctx.currentTime,.5,"sawtooth",.18,60); },
    fanfare(){ if(muted||!ensure())return; const t0=ctx.currentTime;
      [[523,0],[523,.14],[659,.28],[784,.42]].forEach(p=>tone(sg,p[0],t0+p[1],.13,"square",.15));
      [523,659,784,1046].forEach(f=>tone(sg,f,t0+.60,.7,"square",.07)); }
  };
})();
