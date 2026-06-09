function $(id){ return document.getElementById(id); }

// ---- THEME TOGGLE ----
function toggleTheme(){
  const isLight = document.documentElement.classList.toggle('theme-light');
  try{ localStorage.setItem('fxTheme', isLight ? 'light' : 'dark'); }catch(e){}
  updateThemeLabel(isLight);
}
function updateThemeLabel(isLight){
  const lbl = document.getElementById('themeLabel');
  if(lbl) lbl.textContent = isLight ? 'Dark' : 'Light';
}
function loadTheme(){
  try{
    const saved = localStorage.getItem('fxTheme');
    const isLight = saved === 'light';
    if(isLight) document.documentElement.classList.add('theme-light');
    updateThemeLabel(isLight);
  }catch(e){}
}
loadTheme();

// ---- TABS ----
function showTab(name, el) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  el.classList.add('active');
  $('page-' + name).classList.add('active');
  if(name === 'stats') renderStats();

  const infoBanner = $('instrumentInfoBanner');
  // Instrument info banner alleen op voorbereiding en entry
  if(infoBanner) infoBanner.style.display = (name==='checklist'||name==='entry') ? 'flex' : 'none';

  if(name === 'markt' && $('tvWidgetContainer') && !$('tvWidgetContainer').hasChildNodes()){
    buildTVWidget(currentTVInterval);
  }
  updateKeyLevelsBar();
}

function showTabByName(name){
  const tabs = document.querySelectorAll('.tab');
  const tabNames = ['checklist','stats','entry','calc','journal','analyse','markt','leren'];
  const idx = tabNames.indexOf(name);
  if(idx >= 0 && tabs[idx]) showTab(name, tabs[idx]);
}

function updateKeyLevelsBar(){ /* verwijderd */ }

// ---- CLOCK & SESSION ----
function pad(n){ return String(n).padStart(2,'0'); }

// ---- INSTRUMENT CONFIG (declared first so all functions can use it) ----
// ---- INSTRUMENT CONFIG ----
const INSTRUMENTS = {
  // FOREX MAJORS
  EURUSD: {
    label:'EUR/USD', tv:'FX:EURUSD', pip:0.0001, pipVal:10, decimals:4, isCrypto:false,
    currency:'€', spread:'0.1–0.6 pip', bestSessions:['London','New York overlap'],
    schedule:[
      {start:0,   end:420,  type:'rest',   label:'Nacht',           sub:'Markt rustig, niet traden.'},
      {start:420, end:450,  type:'prep',   label:'07:00 — Voorbereiding', sub:'Open ForexFactory. Check H4/Daily trend. Markeer S/R levels.'},
      {start:450, end:480,  type:'prep',   label:'07:30 — Analyse', sub:'Bekijk M15 voor setups. Controleer kalender.'},
      {start:480, end:510,  type:'caution',label:'08:00 — London open (voorzichtig)', sub:'Eerste 30 min: grillige bewegingen. Observeer.'},
      {start:510, end:720,  type:'active', label:'08:30 — Prime time EUR/USD', sub:'Beste window! London actief, hoog volume. Zoek H1/M15 setups.'},
      {start:720, end:780,  type:'caution',label:'12:00 — London lunch', sub:'Volume daalt. Wees selectief.'},
      {start:780, end:870,  type:'prep',   label:'13:00 — Voorbereiding NY', sub:'Herbekijk setup. Check USD-nieuws om 14:30.'},
      {start:870, end:930,  type:'caution',label:'14:30 — News zone', sub:'USD-data (CPI, NFP...). Vermijd 30 min rond nieuws.'},
      {start:930, end:960,  type:'active', label:'15:30 — NY overlap (top!)', sub:'Sterkste moment. Hoogste volume EUR/USD.'},
      {start:960, end:1020, type:'caution',label:'16:00 — NY middag', sub:'Volume daalt. Wees selectiever.'},
      {start:1020,end:1440, type:'rest',   label:'17:00 — Einde trading dag', sub:'Stop. Evalueer. Schrijf in journal.'},
    ]
  },
  GBPUSD: {
    label:'GBP/USD', tv:'FX:GBPUSD', pip:0.0001, pipVal:10, decimals:4, isCrypto:false,
    currency:'€', spread:'0.5–1.5 pip', bestSessions:['London open','New York overlap'],
    schedule:[
      {start:0,   end:420,  type:'rest',   label:'Nacht', sub:'Markt rustig.'},
      {start:420, end:480,  type:'prep',   label:'07:00 — Voorbereiding GBP', sub:'Check UK news (CPI, jobs). GBP reageert sterk op UK data.'},
      {start:480, end:510,  type:'caution',label:'08:00 — London open', sub:'GBP/USD is volatiel bij open. Wacht op bevestiging.'},
      {start:510, end:720,  type:'active', label:'08:30 — Prime time GBP/USD', sub:'Beste window. Hoge volatiliteit = meer kansen en risico.'},
      {start:720, end:870,  type:'caution',label:'12:00 — Middagpauze', sub:'Lagere volumes. Vermijd choppy markt.'},
      {start:870, end:960,  type:'active', label:'14:30 — NY overlap', sub:'Tweede prime window voor GBP/USD.'},
      {start:960, end:1440, type:'rest',   label:'16:00 — Einde dag', sub:'Sluit posities. GBP spread verhoogt.'},
    ]
  },
  USDJPY: {
    label:'USD/JPY', tv:'FX:USDJPY', pip:0.01, pipVal:9, decimals:3, isCrypto:false,
    currency:'€', spread:'0.2–0.8 pip', bestSessions:['Tokyo open','London open','New York'],
    schedule:[
      {start:0,   end:120,  type:'rest',   label:'Nacht', sub:'Markt rustig.'},
      {start:120, end:180,  type:'prep',   label:'02:00 — Voorbereiding Tokyo', sub:'USD/JPY actief tijdens Tokyo. Check Japanse data.'},
      {start:180, end:480,  type:'active', label:'03:00 — Tokyo sessie', sub:'Eerste prime window voor USD/JPY. Rustige, voorspelbare moves.'},
      {start:480, end:540,  type:'active', label:'08:00 — London open', sub:'Volume stijgt sterk. Beste London entry voor USD/JPY.'},
      {start:540, end:870,  type:'caution',label:'09:00 — Overlap verminderd', sub:'Wees selectief tussen sessies.'},
      {start:870, end:960,  type:'active', label:'14:30 — NY sessie', sub:'USD nieuws drijft USD/JPY sterk. Hoog volume.'},
      {start:960, end:1440, type:'rest',   label:'16:00 — Einde dag', sub:'Volume daalt snel na NY.'},
    ]
  },
  GBPJPY: {
    label:'GBP/JPY', tv:'FX:GBPJPY', pip:0.01, pipVal:9, decimals:3, isCrypto:false,
    currency:'€', spread:'1.5–3 pip', bestSessions:['London open'],
    schedule:[
      {start:0,   end:480,  type:'rest',   label:'Nacht', sub:'Vermijd GBP/JPY buiten London — spread is te hoog.'},
      {start:480, end:510,  type:'prep',   label:'08:00 — Voorbereiding', sub:'GBP/JPY is het meest volatiele major pair. Extra voorzichtig.'},
      {start:510, end:720,  type:'active', label:'08:30 — London prime time', sub:'Enige goede window voor GBP/JPY. Grote moves mogelijk.'},
      {start:720, end:870,  type:'rest',   label:'12:00 — Pauze', sub:'Te riskant buiten prime time voor dit pair.'},
      {start:870, end:960,  type:'caution',label:'14:30 — NY overlap', sub:'Mogelijk actief maar hogere spread. Wees extra selectief.'},
      {start:960, end:1440, type:'rest',   label:'16:00 — Einde dag', sub:'Stop. GBP/JPY niet traden na London.'},
    ]
  },
  USDCHF: {
    label:'USD/CHF', tv:'FX:USDCHF', pip:0.0001, pipVal:11, decimals:4, isCrypto:false,
    currency:'€', spread:'0.5–1.2 pip', bestSessions:['London','New York'],
    schedule:[
      {start:0,end:480,type:'rest',label:'Nacht',sub:'Rustig.'},
      {start:480,end:510,type:'prep',label:'08:00 — Voorbereiding',sub:'Check SNB nieuws. CHF reageert op Zwitserse centrale bank.'},
      {start:510,end:720,type:'active',label:'08:30 — London',sub:'Goede liquiditeit voor USD/CHF.'},
      {start:870,end:960,type:'active',label:'14:30 — NY',sub:'USD nieuws drijft USD/CHF. Beste kansen.'},
      {start:960,end:1440,type:'rest',label:'16:00 — Einde',sub:'Stop.'},
    ]
  },
  AUDUSD: {
    label:'AUD/USD', tv:'FX:AUDUSD', pip:0.0001, pipVal:10, decimals:4, isCrypto:false,
    currency:'€', spread:'0.6–1.5 pip', bestSessions:['Sydney/Tokyo open','London open'],
    schedule:[
      {start:0,   end:60,  type:'active',  label:'00:00 — Sydney open',          sub:'AUD/USD wordt actief bij Sydney open. Sterk bij Australische & Chinese data.'},
      {start:60,  end:300, type:'active',  label:'01:00 — Sydney/Tokyo prime',   sub:'Beste early window. Australische data (RBA, jobs, CPI) drijft AUD. Chinese data ook relevant.'},
      {start:300, end:480, type:'caution', label:'05:00 — Rustige periode',       sub:'Lager volume tussen sessies. Wacht op London voor betere liquiditeit.'},
      {start:480, end:720, type:'active',  label:'08:00 — London open',           sub:'Volume stijgt opnieuw. Goede liquiditeit voor AUD/USD.'},
      {start:720, end:870, type:'caution', label:'12:00 — London lunch',          sub:'Lager volume. Selectief zijn.'},
      {start:870, end:960, type:'active',  label:'14:30 — NY overlap',            sub:'USD nieuws drijft AUD/USD. Tweede prime window.'},
      {start:960, end:1320,type:'rest',    label:'16:00 — Rustige periode',       sub:'Lage liquiditeit. Wacht op Sydney open.'},
      {start:1320,end:1440,type:'prep',    label:'22:00 — Voorbereiding Sydney', sub:'Sydney opent rond 23:00. Check Australische & Chinese data voor mogelijke moves.'},
    ]
  },
  NZDUSD: {
    label:'NZD/USD', tv:'FX:NZDUSD', pip:0.0001, pipVal:10, decimals:4, isCrypto:false,
    currency:'€', spread:'1–2 pip', bestSessions:['Sydney','London'],
    schedule:[
      {start:0,end:60,type:'rest',label:'Nacht',sub:'Rustig.'},
      {start:60,end:300,type:'active',label:'01:00 — Sydney sessie',sub:'Beste tijd voor NZD/USD. Check NZ/AU data.'},
      {start:480,end:720,type:'active',label:'08:00 — London',sub:'Tweede window, minder volume dan Sydney.'},
      {start:870,end:960,type:'caution',label:'14:30 — NY',sub:'USD impact aanwezig maar minder volatiel dan majors.'},
      {start:960,end:1440,type:'rest',label:'16:00 — Einde',sub:'Stop.'},
    ]
  },
  USDCAD: {
    label:'USD/CAD', tv:'FX:USDCAD', pip:0.0001, pipVal:10, decimals:4, isCrypto:false,
    currency:'€', spread:'0.8–1.5 pip', bestSessions:['New York','London/NY overlap'],
    schedule:[
      {start:0,end:480,type:'rest',label:'Nacht',sub:'Rustig.'},
      {start:480,end:720,type:'caution',label:'08:00 — London',sub:'USD/CAD is minder actief tijdens London. Wacht op NY.'},
      {start:780,end:810,type:'prep',label:'13:00 — Voorbereiding NY/CAD',sub:'Check CAD oil news en USD data om 14:30.'},
      {start:810,end:960,type:'active',label:'13:30 — NY prime time',sub:'Beste window voor USD/CAD. CAD volgt olieprijzen.'},
      {start:960,end:1440,type:'rest',label:'16:00 — Einde',sub:'Stop.'},
    ]
  },
  // CRYPTO
  BTCUSD: {
    label:'BTC/USD', tv:'BINANCE:BTCUSDT', pip:1, pipVal:1, decimals:0, isCrypto:true,
    currency:'$', spread:'variabel', bestSessions:['Altijd open — piek 14:00–22:00'],
    schedule:[
      {start:0,end:420,type:'caution',label:'Nacht — lage liquiditeit',sub:'BTC handelt 24/7 maar liquiditeit is lager. Grotere spreads mogelijk.'},
      {start:420,end:510,type:'caution',label:'07:00 — EU markt opent',sub:'Volume begint te stijgen naarmate Europa wakker wordt.'},
      {start:510,end:870,type:'active',label:'08:30 — EU/US overlap nadert',sub:'Toenemend volume. Goede setup kansen.'},
      {start:870,end:1020,type:'active',label:'14:30 — US markt actief',sub:'Hoogste BTC volume van de dag. Sterkste moves mogelijk.'},
      {start:1020,end:1320,type:'caution',label:'17:00 — Afnemend US volume',sub:'Nog actief maar voorzichtiger zijn.'},
      {start:1320,end:1440,type:'caution',label:'22:00 — Lage liquiditeit',sub:'Kleinere moves, bredere spreads. Wees selectief.'},
    ]
  },
  ETHUSD: {
    label:'ETH/USD', tv:'BINANCE:ETHUSDT', pip:0.01, pipVal:1, decimals:2, isCrypto:true,
    currency:'$', spread:'variabel', bestSessions:['Altijd open — piek 14:00–22:00'],
    schedule:[
      {start:0,end:420,type:'caution',label:'Nacht',sub:'ETH volgt BTC. Lage liquiditeit s nachts.'},
      {start:510,end:870,type:'active',label:'08:30 — EU sessie',sub:'Volume stijgt. ETH vaak volatieler dan BTC.'},
      {start:870,end:1020,type:'active',label:'14:30 — US prime time',sub:'Beste window voor ETH. Hoogste volume.'},
      {start:1020,end:1440,type:'caution',label:'17:00 — Afbouw',sub:'Voorzichtiger. ETH kan snel bewegen.'},
    ]
  },
  SOLUSD: {
    label:'SOL/USD', tv:'BINANCE:SOLUSDT', pip:0.01, pipVal:1, decimals:2, isCrypto:true,
    currency:'$', spread:'variabel', bestSessions:['US sessie'],
    schedule:[
      {start:0,end:510,type:'rest',label:'Nacht',sub:'SOL heeft minder liquiditeit. Wacht op US sessie.'},
      {start:510,end:870,type:'caution',label:'08:30 — EU sessie',sub:'Matig volume voor SOL.'},
      {start:870,end:1020,type:'active',label:'14:30 — US prime time',sub:'Beste window voor SOL/USD.'},
      {start:1020,end:1440,type:'caution',label:'17:00 — Afbouw',sub:'Voorzichtiger zijn.'},
    ]
  },
  XRPUSD: {
    label:'XRP/USD', tv:'BINANCE:XRPUSDT', pip:0.0001, pipVal:1, decimals:4, isCrypto:true,
    currency:'$', spread:'variabel', bestSessions:['US sessie'],
    schedule:[
      {start:0,end:510,type:'rest',label:'Nacht',sub:'Laag volume voor XRP.'},
      {start:870,end:1020,type:'active',label:'14:30 — US prime time',sub:'Beste window voor XRP.'},
      {start:1020,end:1440,type:'caution',label:'17:00 — Afbouw',sub:'Voorzichtig.'},
    ]
  },
  BNBUSD: {
    label:'BNB/USD', tv:'BINANCE:BNBUSDT', pip:0.01, pipVal:1, decimals:2, isCrypto:true,
    currency:'$', spread:'variabel', bestSessions:['US sessie'],
    schedule:[
      {start:0,end:510,type:'rest',label:'Nacht',sub:'Laag volume.'},
      {start:870,end:1020,type:'active',label:'14:30 — US prime time',sub:'Beste window voor BNB.'},
      {start:1020,end:1440,type:'caution',label:'17:00 — Afbouw',sub:'Voorzichtig.'},
    ]
  },
  // EUR CROSS PAIRS
  EURGBP: {
    label:'EUR/GBP', tv:'FX:EURGBP', pip:0.0001, pipVal:10, decimals:4, isCrypto:false,
    currency:'€', spread:'0.5–1.5 pip', bestSessions:['London','London/NY overlap'],
    schedule:[
      {start:0,end:420,type:'rest',label:'Nacht',sub:'Rustig, laag volume.'},
      {start:420,end:480,type:'prep',label:'07:00 — Voorbereiding',sub:'Check UK en EU data. EUR/GBP reageert sterk op ECB/BOE nieuws.'},
      {start:480,end:510,type:'caution',label:'08:00 — London open',sub:'Wacht op initiële beweeglijkheid. EUR/GBP kan grillig zijn bij open.'},
      {start:510,end:720,type:'active',label:'08:30 — Prime time EUR/GBP',sub:'Beste window. London drives both EUR and GBP. Hoog volume.'},
      {start:720,end:870,type:'caution',label:'12:00 — London lunch',sub:'Volume daalt. Wees selectief.'},
      {start:870,end:960,type:'caution',label:'14:30 — NY overlap',sub:'Beperkte impact op EUR/GBP. Minder relevant dan London.'},
      {start:960,end:1440,type:'rest',label:'16:00 — Einde dag',sub:'Stop. EUR/GBP is een London pair.'},
    ]
  },
  EURAUD: {
    label:'EUR/AUD', tv:'FX:EURAUD', pip:0.0001, pipVal:10, decimals:4, isCrypto:false,
    currency:'€', spread:'1–2.5 pip', bestSessions:['Sydney/Tokyo open', 'London open'],
    schedule:[
      {start:0,   end:60,  type:'active',  label:'00:00 — Sydney open (AUD-driven)', sub:'AUD wordt actief. Interessant bij Australische data (RBA, jobs) of Chinese data. EUR slaapt → zuivere AUD-moves.'},
      {start:60,  end:300, type:'active',  label:'01:00 — Sydney/Tokyo sessie',      sub:'Beste early window. AUD reageert op Australische & Chinese data. Trends zijn duidelijker.'},
      {start:300, end:480, type:'caution', label:'05:00 — Overgangsperiode',          sub:'Tussen sessies. Lagere liquiditeit. Wacht op London voor betere spreads.'},
      {start:480, end:510, type:'caution', label:'08:00 — London open (voorzichtig)', sub:'Eerste 30 min: initiële EUR-beweeglijkheid. Observeer eerst.'},
      {start:510, end:720, type:'active',  label:'08:30 — London prime time',         sub:'Beste Europese window. EUR actief. Goede liquiditeit voor EUR/AUD.'},
      {start:720, end:870, type:'caution', label:'12:00 — London lunch',              sub:'Volume daalt. Minder interessant.'},
      {start:870, end:960, type:'caution', label:'14:30 — NY overlap',                sub:'Beperkte impact op EUR/AUD. Selectief zijn.'},
      {start:960, end:1320,type:'rest',    label:'16:00 — Rustige periode',           sub:'Lage liquiditeit. Spreads verbreden. Wacht op Sydney.'},
      {start:1320,end:1440,type:'prep',    label:'22:00 — Voorbereiding Sydney',      sub:'Sydney opent rond 23:00 Belgische tijd. Check Australische & Chinese data. EUR/AUD kan gaan bewegen.'},
    ]
  },
  EURCAD: {
    label:'EUR/CAD', tv:'FX:EURCAD', pip:0.0001, pipVal:10, decimals:4, isCrypto:false,
    currency:'€', spread:'1–2 pip', bestSessions:['London','New York'],
    schedule:[
      {start:0,end:480,type:'rest',label:'Nacht',sub:'Rustig.'},
      {start:480,end:720,type:'caution',label:'08:00 — London',sub:'Matige liquiditeit voor EUR/CAD. Spreads nog vrij breed.'},
      {start:780,end:810,type:'prep',label:'13:00 — Voorbereiding NY',sub:'Check CAD olie-gerelateerd nieuws en USD data.'},
      {start:810,end:960,type:'active',label:'13:30 — London/NY overlap',sub:'Beste window voor EUR/CAD. Hoogste volume en liquiditeit.'},
      {start:960,end:1440,type:'rest',label:'16:00 — Einde',sub:'Stop.'},
    ]
  },
  EURCHF: {
    label:'EUR/CHF', tv:'FX:EURCHF', pip:0.0001, pipVal:11, decimals:4, isCrypto:false,
    currency:'€', spread:'0.5–1.5 pip', bestSessions:['London','Frankfurt open'],
    schedule:[
      {start:0,end:420,type:'rest',label:'Nacht',sub:'Rustig.'},
      {start:420,end:480,type:'prep',label:'07:00 — Frankfurt open',sub:'EUR/CHF reageert op EU en Zwitserse data. Check SNB/ECB nieuws.'},
      {start:480,end:720,type:'active',label:'08:00 — London prime time',sub:'Beste window. EUR en CHF beide actief tijdens Europese uren.'},
      {start:720,end:870,type:'caution',label:'12:00 — Middagpauze',sub:'Voorzichtig. EUR/CHF soms erg rustig.'},
      {start:870,end:960,type:'caution',label:'14:30 — NY',sub:'Beperkte invloed. EUR/CHF is primair een Europees pair.'},
      {start:960,end:1440,type:'rest',label:'16:00 — Einde',sub:'Stop.'},
    ]
  },
  EURJPY: {
    label:'EUR/JPY', tv:'FX:EURJPY', pip:0.01, pipVal:9, decimals:3, isCrypto:false,
    currency:'€', spread:'0.8–2 pip', bestSessions:['Tokyo open','London','London/NY overlap'],
    schedule:[
      {start:0,   end:120, type:'caution', label:'00:00 — Nacht',               sub:'JPY kan bewegen bij Japanse data. EUR rustig.'},
      {start:120, end:180, type:'prep',    label:'02:00 — Voorbereiding Tokyo', sub:'EUR/JPY wordt actiever. Check Japanse economische data.'},
      {start:180, end:480, type:'active',  label:'03:00 — Tokyo sessie',        sub:'Goed window voor EUR/JPY. JPY-gedreven moves op Japanse data (BOJ, CPI). Trends zijn helder.'},
      {start:480, end:510, type:'caution', label:'08:00 — London open',         sub:'EUR wordt actief. Eerste 30 min volatiel. Observeer.'},
      {start:510, end:720, type:'active',  label:'08:30 — London prime time',   sub:'Beste Europese window. Beide valuta actief. Hoge volatiliteit én liquiditeit.'},
      {start:720, end:870, type:'caution', label:'12:00 — London lunch',        sub:'Volume daalt. Minder interessant.'},
      {start:870, end:960, type:'active',  label:'14:30 — NY/Tokyo overlap',    sub:'Tweede prime window. USD/JPY correlatie. Amerikaans nieuws beïnvloedt JPY.'},
      {start:960, end:1020,type:'caution', label:'16:00 — Afbouw',              sub:'Volume daalt. Voorzichtiger zijn.'},
      {start:1020,end:1440,type:'rest',    label:'17:00 — Rustige periode',     sub:'Lage liquiditeit. Tokyo opent opnieuw rond 01:00.'},
    ]
  },
};

let activeInstrument = 'EURUSD';
// Alias zodat live feed code (currentInstrument) en originele code (activeInstrument) synchroon lopen
Object.defineProperty(window, 'currentInstrument', { get(){ return activeInstrument; } });
function buildTimeline(){
  const inst = INSTRUMENTS[activeInstrument] || INSTRUMENTS.EURUSD;
  const sched = inst.schedule;
  const tl = $('timeline');
  if(!tl) return;
  tl.innerHTML = sched.map(s=>`
    <div class="tl-item" id="tl-${s.start}">
      <div class="tl-dot ${s.type==='active'?'active-window':s.type}" id="tldot-${s.start}"></div>
      <div class="tl-time">${minsToTime(s.start)}${s.end<1200?' — '+minsToTime(s.end):''}</div>
      <div class="tl-title">${s.label.replace(/^\d+:\d+ — /,'')}<span class="tl-badge" id="tlbadge-${s.start}" style="display:none">Nu</span></div>
      <div class="tl-desc">${s.sub}</div>
    </div>`).join('');
  // Update timeline card title
  const tlCard = tl.closest('.card')?.querySelector('.card-title');
  if(tlCard) tlCard.innerHTML = `<div class="dot" style="background:var(--accent)"></div>${inst.label} dagschema (Belgische tijd)`;
}

function minsToTime(m){ return pad(Math.floor(m/60))+':'+pad(m%60); }

function getCurrentSlot(mins){
  const inst = INSTRUMENTS[activeInstrument] || INSTRUMENTS.EURUSD;
  return inst.schedule.find(s => mins >= s.start && mins < s.end) || inst.schedule[inst.schedule.length-1];
}

function updateWindowBanner(mins){
  const slot = getCurrentSlot(mins);
  const inst = INSTRUMENTS[activeInstrument] || INSTRUMENTS.EURUSD;
  const banner = $('windowBanner');
  const icons = { prep:'📋', active:'✓', caution:'⚠', rest:'—' };
  const classes = { prep:'prep', active:'go', caution:'caution', rest:'rest' };
  const messages = {
    prep: `Voorbereidingstijd — analyseer chart, check kalender, markeer levels voor ${inst.label}.`,
    active: `PRIME TRADING WINDOW — beste kansen voor ${inst.label}!`,
    caution: 'Voorzichtig — verhoogd risico of lager volume. Wees selectief.',
    rest: inst.isCrypto ? `${inst.label} handelt 24/7 maar dit is geen optimale periode.` : 'Geen trading aanbevolen op dit moment.',
  };
  banner.className = 'window-banner ' + (classes[slot.type]||'rest');
  $('windowIcon').textContent = icons[slot.type]||'—';
  $('windowTitle').textContent = slot.label;
  $('windowSub').textContent = messages[slot.type]||'';
}

function updateTimelineHighlight(mins){
  const inst = INSTRUMENTS[activeInstrument] || INSTRUMENTS.EURUSD;
  document.querySelectorAll('[id^="tlbadge-"]').forEach(b=>b.style.display='none');
  document.querySelectorAll('[id^="tldot-"]').forEach(d=>{
    const start = parseInt(d.id.split('-')[1]);
    const slot = inst.schedule.find(s=>s.start===start);
    if(!slot) return;
    d.className = 'tl-dot ' + (slot.type==='active'?'active-window':slot.type);
  });
  const slot = getCurrentSlot(mins);
  const badge = $('tlbadge-'+slot.start);
  const dot = $('tldot-'+slot.start);
  if(badge){ badge.style.display='inline'; badge.className='tl-badge badge-now'; badge.textContent='Nu'; }
  if(dot){ dot.className='tl-dot now'; }
}

buildTimeline();

function updateClock(){
  const now = new Date();
  const clk = $('headerClock'); if(clk) clk.textContent = pad(now.getHours())+':'+pad(now.getMinutes())+':'+pad(now.getSeconds());
  const days=['zondag','maandag','dinsdag','woensdag','donderdag','vrijdag','zaterdag'];
  const months=['jan','feb','mrt','apr','mei','jun','jul','aug','sep','okt','nov','dec'];
  const hd = $('headerDate'); if(hd) hd.textContent = days[now.getDay()]+' '+now.getDate()+' '+months[now.getMonth()]+' '+now.getFullYear();
  const h = now.getHours(), m = now.getMinutes();
  const mins = h*60+m;
  updateSessionUI(mins);
  updateWindowBanner(mins);
  updateTimelineHighlight(mins);
}
// ================================================================
// SESSION TIMER
// ================================================================
const SESSIONS = [
  { key:'sydney',  label:'Sydney',   colorCls:'sb-sydney-c',  chipColor:'var(--amber)',  start: 0,   end: 540  },
  { key:'tokyo',   label:'Tokyo',    colorCls:'sb-tokyo-c',   chipColor:'var(--purple)', start: 60,  end: 600  },
  { key:'london',  label:'London',   colorCls:'sb-london-c',  chipColor:'var(--accent)', start: 420, end: 1020 },
  { key:'ny',      label:'New York', colorCls:'sb-ny-c',      chipColor:'var(--green)',  start: 780, end: 1320 },
];
const DAY_MINS = 1440;

function pct(m){ return (m / DAY_MINS * 100).toFixed(3) + '%'; }
function fmtCountdown(diff){
  const h = Math.floor(diff/60), m = diff%60;
  return h > 0 ? `${h}u ${m}m` : `${m}m`;
}

function buildSessionBar(){
  const grid = $('sessionBarGrid');
  if(!grid || grid.dataset.built) return;
  grid.dataset.built = '1';

  // Tijdas bovenaan (enkel de track-kolom)
  const axisRow = document.createElement('div');
  axisRow.className = 'sb-axis-row';
  axisRow.innerHTML = ['00','03','06','09','12','15','18','21','24']
    .map(h => `<span>${h}:00</span>`).join('');
  // lege label-cel + axis
  grid.appendChild(document.createElement('div'));
  grid.appendChild(axisRow);

  // Nu-marker rij (wordt elk seconde bijgewerkt via left%)
  const markerLabel = document.createElement('div');
  const markerEl = document.createElement('div');
  markerEl.id = 'sbNowMarker';
  markerEl.className = 'sb-now-marker';
  grid.appendChild(markerLabel);
  grid.appendChild(markerEl);

  // Sessie-rijen
  SESSIONS.forEach(s => {
    const label = document.createElement('div');
    label.className = 'sb-row-label';
    label.id = `sb-label-${s.key}`;
    label.textContent = s.label;

    const track = document.createElement('div');
    track.className = 'sb-row-track';

    const fill = document.createElement('div');
    fill.className = `sb-row-fill ${s.colorCls}`;
    fill.id = `sb-fill-${s.key}`;
    fill.style.left  = pct(s.start);
    fill.style.width = pct(s.end - s.start);
    track.appendChild(fill);

    // Nu-lijn binnen elke track
    const nowCol = document.createElement('div');
    nowCol.className = 'sb-now-col';
    nowCol.id = `sb-now-${s.key}`;
    track.appendChild(nowCol);

    grid.appendChild(label);
    grid.appendChild(track);
  });
}

function updateSessionUI(mins){
  buildSessionBar();

  // Nu-lijn positie in elke rij
  SESSIONS.forEach(s => {
    const col = $(`sb-now-${s.key}`);
    if(col) col.style.left = pct(mins);
  });

  // Nu-marker pijl boven de tijdas
  const marker = $('sbNowMarker');
  if(marker) marker.style.setProperty('--now-left', pct(mins));

  // Welke sessies zijn open
  const open = SESSIONS.filter(s => mins >= s.start && mins < s.end);
  SESSIONS.forEach(s => {
    const isOpen = open.some(o => o.key === s.key);
    const fill  = $(`sb-fill-${s.key}`);
    const label = $(`sb-label-${s.key}`);
    if(fill)  fill.classList.toggle('active', isOpen);
    if(label){ label.classList.toggle('active', isOpen);
               label.style.color = isOpen ? s.chipColor : ''; }
  });

  // Chips
  const chips = $('sessionChips');
  if(chips){
    chips.innerHTML = SESSIONS.map(s => {
      const isOpen = open.some(o => o.key === s.key);
      const openH  = Math.floor(s.start/60), openM  = s.start%60;
      const closeH = Math.floor(s.end/60) % 24, closeM = s.end%60;
      const timeStr = `${pad(openH)}:${pad(openM)}–${pad(closeH)}:${pad(closeM)}`;
      return `<div class="session-chip ${isOpen?'open':''}" style="${isOpen?`color:${s.chipColor};border-color:${s.chipColor};`:''}">
        <div class="chip-dot"></div>${s.label}
        <span class="chip-time">${timeStr}</span>
      </div>`;
    }).join('');
  }

  // Countdown
  const cd = $('sessionCountdown');
  if(cd){
    if(open.length === 0){
      const next = SESSIONS.slice().sort((a,b)=>a.start-b.start).find(s => s.start > mins)
                || SESSIONS.slice().sort((a,b)=>a.start-b.start)[0];
      const diff = next.start > mins ? next.start - mins : (DAY_MINS - mins) + next.start;
      cd.innerHTML = `Volgende sessie: <strong>${next.label}</strong> opent over <strong>${fmtCountdown(diff)}</strong>`;
    } else {
      const soonest = open.slice().sort((a,b)=>a.end-b.end)[0];
      const diff = soonest.end - mins;
      const names = open.map(s=>s.label).join(' + ');
      cd.innerHTML = `<strong>${names}</strong> — sluit over <strong>${fmtCountdown(diff)}</strong>`;
    }
  }

  // Header badge
  const badge = $('sessionBadge');
  if(badge){
    if(open.length === 0){
      badge.className = 'session-badge session-closed';
      badge.textContent = 'Markt rustig';
    } else if(open.some(s=>s.key==='london') && open.some(s=>s.key==='ny')){
      badge.className = 'session-badge session-ny';
      badge.textContent = `London × NY · ${fmtCountdown(SESSIONS.find(s=>s.key==='london').end - mins)}`;
    } else if(open.some(s=>s.key==='london')){
      badge.className = 'session-badge session-london';
      badge.textContent = `London · ${fmtCountdown(SESSIONS.find(s=>s.key==='london').end - mins)}`;
    } else if(open.some(s=>s.key==='ny')){
      badge.className = 'session-badge session-ny';
      badge.textContent = `New York · ${fmtCountdown(SESSIONS.find(s=>s.key==='ny').end - mins)}`;
    } else if(open.some(s=>s.key==='tokyo')){
      badge.className = 'session-badge session-asia';
      badge.textContent = `Tokyo · ${fmtCountdown(SESSIONS.find(s=>s.key==='tokyo').end - mins)}`;
    } else {
      badge.className = 'session-badge session-asia';
      badge.textContent = 'Sydney';
    }
  }
}

setInterval(updateClock,1000);
updateClock();

// ---- CALENDAR ----
function loadCalEvents(){
  const dow = new Date().getDay();
  const ev = {
    1:[{time:'10:00',curr:'EUR',name:'ECB Speech',impact:'med'},{time:'15:00',curr:'USD',name:'ISM Manufacturing PMI',impact:'med'}],
    2:[{time:'09:30',curr:'GBP',name:'Claimant Count Change',impact:'med'},{time:'14:30',curr:'USD',name:'Core CPI (m/m)',impact:'high'}],
    3:[{time:'14:30',curr:'USD',name:'ADP Non-Farm Employment',impact:'high'},{time:'20:00',curr:'USD',name:'FOMC Meeting Minutes',impact:'high'}],
    4:[{time:'13:45',curr:'EUR',name:'ECB Rate Decision',impact:'high'},{time:'14:30',curr:'USD',name:'Jobless Claims',impact:'med'}],
    5:[{time:'14:30',curr:'USD',name:'Non-Farm Payrolls (NFP)',impact:'high'},{time:'14:30',curr:'USD',name:'Unemployment Rate',impact:'high'},{time:'16:00',curr:'USD',name:'Consumer Sentiment',impact:'low'}],
    6:[],0:[]
  };
  const events = ev[dow]||[];
  const el = $('calEvents');
  if(!events.length){el.innerHTML='<div class="no-events">Geen grote events vandaag — gunstige tradingdag voor '+(INSTRUMENTS[activeInstrument]?.label||'EUR/USD')+'.</div>';return;}
  el.innerHTML = events.map(e=>`
    <div class="event-row">
      <span class="event-time">${e.time}</span>
      <span class="event-curr" style="color:${e.curr==='USD'?'#4f9eff':e.curr==='EUR'?'#a78bfa':'#2ecc8a'}">${e.curr}</span>
      <div class="impact-dot impact-${e.impact}"></div>
      <span class="event-name">${e.name}</span>
      ${e.impact==='high'?'<span class="event-warn">Vermijd 30min</span>':''}
    </div>`).join('');
}
loadCalEvents();


function switchInstrument(key){
  if(!INSTRUMENTS[key]) return;

  // Sla levels op voor het HUIDIGE instrument vóór we wisselen
  const prevKey = activeInstrument;
  if(prevKey && prevKey !== key){
    try{
      const w={wHigh:$('wHigh')?.value||'',wLow:$('wLow')?.value||'',wOpen:$('wOpen')?.value||'',wClose:$('wClose')?.value||'',wCurrent:$('wCurrent')?.value||''};
      if(w.wHigh) localStorage.setItem('fxWeekly_'+prevKey, JSON.stringify(w));
      const d={dHigh:$('dHigh')?.value||'',dLow:$('dLow')?.value||'',dOpen:$('dOpen')?.value||'',dClose:$('dClose')?.value||''};
      if(d.dHigh) localStorage.setItem('fxDaily_'+prevKey, JSON.stringify(d));
    }catch(e){}
  }

  activeInstrument = key;
  const inst = INSTRUMENTS[key];
  try{ localStorage.setItem('fxActiveInstrument', key); }catch(e){}

  // Update header label
  const lbl = $('activeInstrumentLabel');
  if(lbl) lbl.textContent = inst.label;

  // Update timeline card title
  const tlTitle = document.querySelector('#page-checklist .card-title .dot + *');
  const tlCard = document.querySelector('#timeline')?.closest('.card')?.querySelector('.card-title');
  if(tlCard) tlCard.innerHTML = `<div class="dot" style="background:var(--accent)"></div>${inst.label} dagschema (Belgische tijd)`;

  // Rebuild timeline with new schedule
  buildTimeline();
  const now = new Date();
  updateWindowBanner(now.getHours()*60+now.getMinutes());
  updateTimelineHighlight(now.getHours()*60+now.getMinutes());

  // Update TradingView chart titel en widget
  const tvTitle = $('tvChartTitle');
  if(tvTitle) tvTitle.textContent = inst.label + ' chart';

  // Update Markt Analyse labels
  const wct = $('marktWeeklyCardTitle');
  if(wct) wct.textContent = `Weekly candle ${inst.label} — vorige week`;

  const bl = $('marktBullLabel');
  if(bl) bl.textContent = `Bullish signalen (${inst.label} stijgt)`;

  const bearl = $('marktBearLabel');
  if(bearl) bearl.textContent = `Bearish signalen (${inst.label} daalt)`;

  // Update placeholder waarden in OHLC invoer velden op basis van instrument
  const isJpy  = key.includes('JPY');
  const isCrypto = inst.isCrypto;
  const [wHp, wLp, wOp, wCp, wCurp] = isCrypto
    ? (key==='BTCUSD' ? ['98000','92000','94000','96000','95500']
      : key==='ETHUSD' ? ['3800','3400','3500','3700','3600']
      : ['200','170','180','190','185'])
    : isJpy ? ['155.50','152.00','153.00','154.50','154.00']
    : ['1.0950','1.0820','1.0860','1.0910','1.0895'];
  const setph = (id, v) => { const e=$(id); if(e) e.placeholder=v; };
  setph('wHigh',wHp); setph('wLow',wLp); setph('wOpen',wOp); setph('wClose',wCp); setph('wCurrent',wCurp);
  const [dHp, dLp, dOp, dCp] = isCrypto
    ? (key==='BTCUSD' ? ['96500','94500','95000','96000']
      : key==='ETHUSD' ? ['3700','3550','3600','3680']
      : ['190','178','180','185'])
    : isJpy ? ['154.80','153.20','153.50','154.50']
    : ['1.0935','1.0875','1.0880','1.0920'];
  setph('dHigh',dHp); setph('dLow',dLp); setph('dOpen',dOp); setph('dClose',dCp);
  if($('tvWidgetContainer')){
    // Altijd herbouwen zodat het juiste symbool geladen wordt
    buildTVWidget(currentTVInterval);
  }

  // Update pip value label in calculator
  const pipLbl = $('pipValueLabel');
  if(pipLbl) pipLbl.textContent = inst.isCrypto
    ? 'Prijs per eenheid (geen vaste pip waarde)'
    : `${inst.currency}${inst.pipVal} per pip (1 lot)`;

  // Update instrument info banner
  const banner = $('instrumentInfoBanner');
  if(banner){
    banner.innerHTML = inst.isCrypto
      ? `<span style="color:var(--purple)">₿</span> <span><strong style="color:var(--text)">${inst.label}</strong> — Crypto handelt 24/7. Beste uren: <strong style="color:var(--text)">${inst.bestSessions.join(', ')}</strong>. Geen vaste pip-waarde — gebruik % risico van positiegrootte.</span>`
      : `<span style="color:var(--accent)">i</span> <span><strong style="color:var(--text)">${inst.label}</strong> — Spread: <strong style="color:var(--text)">${inst.spread}</strong>. Beste sessies: <strong style="color:var(--text)">${inst.bestSessions.join(', ')}</strong>. Pip-waarde: <strong style="color:var(--text)">${inst.currency}${inst.pipVal}/pip</strong> per standaard lot.</span>`;
  }

  // Update journal default pair
  const jPair = $('jPair');
  if(jPair) jPair.value = inst.label.includes('/') ? inst.label : inst.label;

  // Recalc position size
  calcPos();

  // Show crypto-specific note in calculator if needed
  const cryptoNote = $('cryptoNote');
  if(cryptoNote) cryptoNote.style.display = inst.isCrypto ? 'block' : 'none';

  // Herrender alerts voor het nieuwe instrument
  renderAlerts();

  // Wis Markt Analyse levels — waarden zijn instrument-specifiek
  const marktFields = ['wHigh','wLow','wOpen','wClose','wCurrent',
                       'dHigh','dLow','dOpen','dClose'];
  marktFields.forEach(id => { const e=$(id); if(e) e.value=''; });

  // Reset berekende weergave
  ['wHighVal','wLowVal','wOpenVal','wCloseVal'].forEach(id=>{ const e=$(id); if(e) e.textContent='—'; });
  ['dHighVal','dLowVal','dOpenVal','dCloseVal'].forEach(id=>{ const e=$(id); if(e) e.textContent='—'; });
  ['wRangeLabel','wDirectionLabel','wBodyLabel'].forEach(id=>{
    const e=$(id); if(e){ e.textContent=id==='wRangeLabel'?'Range: —':id==='wDirectionLabel'?'Richting: —':'Body: —'; e.className='level-badge'; }
  });
  ['dRangeLabel','dDirectionLabel','dBodyLabel'].forEach(id=>{
    const e=$(id); if(e){ e.textContent=id==='dRangeLabel'?'Range: —':id==='dDirectionLabel'?'Richting: —':'Body: —'; e.className='level-badge'; }
  });
  ['pvPP','pvR1','pvR2','pvS1','pvS2','pvMid','dR1','dS1','dMid','dRangeVal'].forEach(id=>{ const e=$(id); if(e) e.textContent='—'; });

  const wv = $('weeklyCandleViz');
  if(wv) wv.innerHTML = '<span style="color:var(--muted);font-size:12px;">Vul de waarden in om de candle te zien</span>';
  const dv = $('dailyCandleViz');
  if(dv) dv.innerHTML = '<span style="color:var(--muted);font-size:12px;">Vul de waarden in om de candle te zien</span>';

  const wa = $('weeklyAnalysis');
  if(wa) wa.innerHTML = '<div style="color:var(--muted);font-size:12px;">Vul de weekly waarden links in voor automatische analyse...</div>';
  const da = $('dailyAnalysis');
  if(da) da.innerHTML = '<div style="color:var(--muted);font-size:12px;">Vul de daily waarden links in voor automatische analyse...</div>';

  // Laad bewaard levels voor het NIEUWE instrument (als die bestaan)
  try{
    const w = JSON.parse(localStorage.getItem('fxWeekly_'+key)||'null');
    if(w && w.wHigh){
      ['wHigh','wLow','wOpen','wClose','wCurrent'].forEach(id=>{ const e=$(id); if(e&&w[id]) e.value=w[id]; });
      updateWeeklyCalc();
    }
    const d = JSON.parse(localStorage.getItem('fxDaily_'+key)||'null');
    if(d && d.dHigh){
      ['dHigh','dLow','dOpen','dClose'].forEach(id=>{ const e=$(id); if(e&&d[id]) e.value=d[id]; });
      updateDailyCalc();
    }
  }catch(e){}

  // Update key levels balk
  updateKeyLevelsBar();
}

function loadSavedInstrument(){
  try{
    const saved = localStorage.getItem('fxActiveInstrument');
    if(saved && INSTRUMENTS[saved]){
      const sel = $('instrumentSelect');
      if(sel) sel.value = saved;
      switchInstrument(saved);
    }
  }catch(e){}
}

// ---- CHECKLIST ----
function toggleCheck(el){
  el.classList.toggle('checked');
  el.querySelector('.checkbox').textContent = el.classList.contains('checked') ? '✓' : '';
  updateProgress();
}
function toggleBlock(el){
  // blocked items stay permanently blocked (red X) — clicking does nothing
}

function updateProgress(){
  const items = document.querySelectorAll('#page-checklist .check-item:not(.blocked)');
  const checked = document.querySelectorAll('#page-checklist .check-item.checked:not(.blocked)').length;
  const pct = items.length ? Math.round(checked/items.length*100) : 0;
  $('prepPct').textContent = pct+'%';
  $('prepBar').style.width = pct+'%';
  const v = $('prepVerdict');
  if(pct===100){v.className='verdict go';v.innerHTML='<span class="verdict-icon">✓</span><span>Klaar om te traden!</span>';}
  else if(pct>=60){v.className='verdict wait';v.innerHTML='<span class="verdict-icon">⚡</span><span>Bijna klaar — vul de rest in.</span>';}
  else{v.className='verdict neutral';v.innerHTML='<span class="verdict-icon">○</span><span>Voorbereiding niet volledig...</span>';}

  const conf = document.querySelectorAll('#page-entry .check-item[data-conf].checked').length;
  const eChecked = document.querySelectorAll('#page-entry .check-item:not([data-conf]).checked').length;
  const ev = $('entryVerdict');
  if(!ev) return;
  if(conf>=2&&eChecked>=5){ev.className='verdict go';ev.innerHTML='<span class="verdict-icon">✓</span><span>Entry valid — je kunt traden!</span>';}
  else if(conf>=2){ev.className='verdict wait';ev.innerHTML='<span class="verdict-icon">⚡</span><span>Confluence OK — check ook de risico punten.</span>';}
  else if(conf===1){ev.className='verdict wait';ev.innerHTML='<span class="verdict-icon">⚠</span><span>Slechts 1 confluence — wacht op meer bevestiging.</span>';}
  else{ev.className='verdict stop';ev.innerHTML='<span class="verdict-icon">✕</span><span>Onvoldoende confluence — sla deze trade over.</span>';}
}
document.querySelectorAll('.check-item').forEach(el=>el.addEventListener('click',updateProgress));

// ---- CALCULATOR ----
function setMode(mode, btn){
  document.querySelectorAll('.mode-btn').forEach(b=>b.classList.remove('active'));
  document.querySelectorAll('.prop-section').forEach(s=>s.classList.remove('active'));
  btn.classList.add('active');
  $('section-'+mode).classList.add('active');
}

function calcPos(){
  const inst = INSTRUMENTS[activeInstrument] || INSTRUMENTS.EURUSD;
  const acc = parseFloat($('cAccount').value)||5000;
  const risk = parseFloat($('cRisk').value)||1;
  const sl = parseFloat($('cSL').value)||20;
  const tp = parseFloat($('cTP').value)||40;
  const riskAmt = acc*risk/100;
  const pv = inst.pipVal || 10;
  const lotSize = inst.isCrypto ? riskAmt/sl : riskAmt/(sl*pv);
  const profitAmt = inst.isCrypto ? lotSize*tp : lotSize*tp*pv;
  const rr = tp/sl;
  const sym = inst.currency||'€';
  $('riskEur').textContent = sym+riskAmt.toFixed(0);
  $('lotSize').textContent = inst.isCrypto ? lotSize.toFixed(4) : lotSize.toFixed(2);
  $('profitEur').textContent = sym+profitAmt.toFixed(0);
  $('rrRatio').textContent = '1 : '+rr.toFixed(1);
  $('rrRatio').style.color = rr>=2?'var(--green)':rr>=1.5?'var(--amber)':'var(--red)';
  const pl = $('pipValueLabel');
  if(pl) pl.textContent = inst.isCrypto ? 'Crypto: risico in $ per eenheid' : sym+pv+' per pip (1 lot) — '+inst.label;
}
calcPos();

// ---- PROP FIRM PRESETS ----
const firmPresets = {
  ftmo:           { daily: 5,   total: 10 },
  myforexfunds:   { daily: 5,   total: 12 },
  e8:             { daily: 5,   total: 8  },
  topstep:        { daily: 4,   total: 8  },
};
function applyFirmPreset(){
  const firm = $('pFirmType').value;
  if(firmPresets[firm]){
    $('pDailyLoss').value = firmPresets[firm].daily;
    $('pTotalLoss').value = firmPresets[firm].total;
  }
  calcProp();
}

function calcProp(){
  const acc = parseFloat($('pAccount').value)||10000;
  const dailyPct = parseFloat($('pDailyLoss').value)||5;
  const currentLoss = parseFloat($('pCurrentLoss').value)||0;
  const sl = parseFloat($('pSL').value)||20;

  const maxDaily = acc*dailyPct/100;
  const remaining = Math.max(0, maxDaily - currentLoss);
  const safeRemaining = remaining * 0.5; // gebruik max 50% als veiligheidsbuffer
  const maxLot = safeRemaining / (sl * 10);
  const riskPerTrade = acc * 0.01;
  const maxTrades = Math.floor(remaining / riskPerTrade);
  const usedPct = maxDaily > 0 ? Math.round(currentLoss/maxDaily*100) : 0;

  $('pMaxDaily').textContent = '$'+maxDaily.toFixed(0);
  $('pRemainingToday').textContent = '$'+remaining.toFixed(0);
  $('pMaxLot').textContent = maxLot > 0 ? maxLot.toFixed(2) : '0.00';
  $('pMaxTrades').textContent = Math.max(0, maxTrades);
  $('pRiskPerTrade').textContent = '$'+riskPerTrade.toFixed(0);
  $('pDangerPct').textContent = usedPct+'%';

  const fill = $('pDangerFill');
  fill.style.width = Math.min(100,usedPct)+'%';
  fill.style.background = usedPct<50?'var(--green)':usedPct<80?'var(--amber)':'var(--red)';

  const warn = $('propWarning');
  const warnText = $('propWarningText');
  if(remaining<=0){
    warn.className='prop-warning blocked';
    warnText.textContent='STOP — Dagelijkse verliesilimiet bereikt. Geen trades meer vandaag!';
  } else if(usedPct>=80){
    warn.className='prop-warning danger';
    warnText.textContent='Gevaar! Je zit op '+usedPct+'% van je dagelijkse limiet. Nog max '+maxTrades+' trade(s) mogelijk.';
  } else if(usedPct>=50){
    warn.className='prop-warning caution';
    warnText.textContent='Let op: '+usedPct+'% van dagelijkse limiet gebruikt. Wees extra selectief.';
  } else {
    warn.className='prop-warning safe';
    warnText.textContent='Je zit veilig binnen de daglimieten ('+usedPct+'% gebruikt). Je kunt traden.';
  }
}
calcProp();

// ---- JOURNAL ----
let trades = [];
try { trades = JSON.parse(localStorage.getItem('fxTrades2')||'[]'); } catch(e){}

function saveTrades(){ try{localStorage.setItem('fxTrades2',JSON.stringify(trades));}catch(e){} }

// ---- JOURNAL FILTERS ----
let journalFilters = { dateFrom:'', dateTo:'', result:'', pair:'', edge:'', search:'' };

function applyFilters(){
  journalFilters.dateFrom = $('fDateFrom')?.value || '';
  journalFilters.dateTo   = $('fDateTo')?.value   || '';
  journalFilters.result   = $('fResult')?.value   || '';
  journalFilters.pair     = $('fPair')?.value     || '';
  journalFilters.edge     = $('fEdge')?.value     || '';
  journalFilters.search   = ($('fSearch')?.value  || '').toLowerCase().trim();
  // Highlight actieve filters
  ['fDateFrom','fDateTo','fResult','fPair','fEdge','fSearch'].forEach(id=>{
    const el=$(id); if(!el) return;
    el.classList.toggle('filter-active', !!(el.value && el.value !== ''));
  });
  renderTrades();
}

function clearFilters(){
  ['fDateFrom','fDateTo'].forEach(id=>{ const e=$(id); if(e) e.value=''; });
  ['fResult','fPair','fEdge'].forEach(id=>{ const e=$(id); if(e) e.value=''; });
  const fs=$('fSearch'); if(fs) fs.value='';
  journalFilters = { dateFrom:'', dateTo:'', result:'', pair:'', edge:'', search:'' };
  document.querySelectorAll('#journalFilterBar .filter-active').forEach(el=>el.classList.remove('filter-active'));
  renderTrades();
}

function getFilteredTrades(){
  return trades.filter(t=>{
    if(journalFilters.dateFrom && t.date < journalFilters.dateFrom) return false;
    if(journalFilters.dateTo   && t.date > journalFilters.dateTo)   return false;
    if(journalFilters.result   && t.result    !== journalFilters.result) return false;
    if(journalFilters.pair     && t.pair      !== journalFilters.pair)   return false;
    if(journalFilters.edge     && t.edge_match!== journalFilters.edge)   return false;
    if(journalFilters.search){
      const q = journalFilters.search;
      const inNotes = (t.notes     ||'').toLowerCase().includes(q);
      const inEdge  = (t.edge_desc ||'').toLowerCase().includes(q);
      const inPair  = (t.pair      ||'').toLowerCase().includes(q);
      if(!inNotes && !inEdge && !inPair) return false;
    }
    return true;
  });
}

function exportCSV(){
  const filtered = getFilteredTrades();
  if(!filtered.length){ alert('Geen trades om te exporteren (check je filters).'); return; }
  const edgeMatchLabel = { yes:'Edge', partial:'Deels edge', no:'Geen edge', '':'' };
  const edgeConfLabel  = { high:'Hoog', medium:'Matig', low:'Laag', '':'' };
  const headers = [
    'Datum','Pair','Richting','Uitkomst',
    'Entry prijs','Stop-loss','Take profit','Lot grootte',
    'P&L (€/$ )','R:R ratio',
    'Edge beschrijving','Edge match','Edge vertrouwen',
    'Notities'
  ];
  const rows = filtered.map(t=>[
    t.date, t.pair,
    t.dir==='long'?'LONG':'SHORT',
    t.result.toUpperCase(),
    t.entry||'', t.sl||'', t.tp||'', t.lot||'',
    t.pnl||0, t.rr||0,
    (t.edge_desc ||'').replace(/"/g,'""'),
    edgeMatchLabel[t.edge_match||''],
    edgeConfLabel [t.edge_conf ||''],
    (t.notes     ||'').replace(/"/g,'""'),
  ]);
  const csv = [headers,...rows].map(r=>r.map(v=>`"${v}"`).join(',')).join('\n');
  // \uFEFF = BOM zodat Excel direct UTF-8 herkent
  const blob = new Blob(['\uFEFF'+csv],{type:'text/csv;charset=utf-8;'});
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href=url; a.download=`fx-journal-${new Date().toISOString().split('T')[0]}.csv`;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a); URL.revokeObjectURL(url);
}

// ---- JOURNAL IMAGE HANDLING ----
let journalImageBase64 = null;

function handleJournalImage(e){
  const file = e.target.files[0];
  if(!file) return;
  compressAndSetJournalImage(file, 'j');
}

function compressAndSetJournalImage(file, prefix){
  const reader = new FileReader();
  reader.onload = function(ev){
    const img = new Image();
    img.onload = function(){
      const canvas = document.createElement('canvas');
      const MAX = 900;
      let w = img.width, h = img.height;
      if(w > MAX){ h = Math.round(h * MAX / w); w = MAX; }
      canvas.width = w; canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);
      const compressed = canvas.toDataURL('image/jpeg', 0.82);
      if(prefix === 'j'){
        journalImageBase64 = compressed;
        const prev = $('jPreview');
        prev.src = compressed; prev.style.display = 'block';
        $('jDropzoneText').style.display = 'none';
        $('jImgName').textContent = file.name;
        $('jClearImg').style.display = 'inline';
      } else if(prefix === 'pattern'){
        patternImageBase64 = compressed;
        const prev = $('patternPreview');
        if(prev){ prev.src = compressed; prev.style.display = 'block'; }
        const dzt = $('patternDropzoneText');
        if(dzt) dzt.style.display = 'none';
      } else {
        editImageBase64 = compressed;
        const prev = $('ePreview');
        prev.src = compressed; prev.style.display = 'block';
        $('eDropzoneText').style.display = 'none';
        $('eImgName').textContent = file.name;
        $('eClearImg').style.display = 'inline';
      }
    };
    img.src = ev.target.result;
  };
  reader.readAsDataURL(file);
}

function clearJournalImage(){
  journalImageBase64 = null;
  $('jPreview').src=''; $('jPreview').style.display='none';
  $('jDropzoneText').style.display='block';
  $('jChartFile').value='';
  $('jImgName').textContent='';
  $('jClearImg').style.display='none';
}

// Drag & drop voor journal dropzone
(function(){
  const dz = $('jDropzone');
  if(!dz) return;
  dz.addEventListener('dragover', e=>{ e.preventDefault(); dz.classList.add('dragover'); });
  dz.addEventListener('dragleave', ()=>dz.classList.remove('dragover'));
  dz.addEventListener('drop', e=>{
    e.preventDefault(); dz.classList.remove('dragover');
    const file = e.dataTransfer.files[0];
    if(file && file.type.startsWith('image/')) compressAndSetJournalImage(file,'j');
  });
})();

// ── Edge helpers ──
function getEdgeFields(prefix) {
  return {
    edge_desc:  ($(prefix + 'EdgeDesc')?.value  || '').trim(),
    edge_match: $(prefix + 'EdgeMatch')?.value  || '',
    edge_conf:  $(prefix + 'EdgeConf')?.value   || '',
  };
}

function setEdgeFields(prefix, t) {
  const desc  = $(prefix + 'EdgeDesc');  if(desc)  desc.value  = t.edge_desc  || '';
  const match = $(prefix + 'EdgeMatch'); if(match) match.value = t.edge_match || '';
  const conf  = $(prefix + 'EdgeConf');  if(conf)  conf.value  = t.edge_conf  || '';
}

function clearEdgeFields(prefix) {
  const desc  = $(prefix + 'EdgeDesc');  if(desc)  desc.value  = '';
  const match = $(prefix + 'EdgeMatch'); if(match) match.value = '';
  const conf  = $(prefix + 'EdgeConf');  if(conf)  conf.value  = '';
}

function addTrade(){
  const t = {
    id: Date.now(),
    date: $('jDate').value || new Date().toISOString().split('T')[0],
    pair: $('jPair').value,
    dir: $('jDir').value,
    result: $('jResult').value,
    entry: parseFloat($('jEntry').value)||null,
    lot: parseFloat($('jLot').value)||null,
    sl: parseFloat($('jSL').value)||null,
    tp: parseFloat($('jTP').value)||null,
    pnl: parseFloat($('jPnl').value)||0,
    rr: parseFloat($('jRR').value)||0,
    notes: $('jNotes').value.trim(),
    img: journalImageBase64 || null,
    accountId: $('jAccount')?.value || fxActiveAccountId || '',
    ...getEdgeFields('j')
  };
  trades.unshift(t);
  saveTrades();
  renderTrades();
  $('jNotes').value=''; $('jPnl').value=''; $('jRR').value='';
  $('jEntry').value=''; $('jLot').value=''; $('jSL').value=''; $('jTP').value='';
  clearEdgeFields('j');
  clearJournalImage();
  const rr2 = $('jReviewResult'); if(rr2){ rr2.style.display='none'; rr2.innerHTML=''; }
}

function showConfirm(msg, onOk, title='Bevestigen', btnLabel='Verwijderen'){
  $('confirmModalTitle').textContent = title;
  $('confirmModalMsg').textContent = msg;
  $('confirmModalOk').textContent = btnLabel;
  $('confirmModalOverlay').classList.add('show');
  const ok = $('confirmModalOk');
  const cancel = $('confirmModalCancel');
  const close = () => { $('confirmModalOverlay').classList.remove('show'); ok.onclick=null; cancel.onclick=null; };
  ok.onclick = () => { close(); onOk(); };
  cancel.onclick = close;
}
function deleteTrade(id){ showConfirm('Trade verwijderen? Dit kan niet ongedaan gemaakt worden.', ()=>{ trades=trades.filter(t=>t.id!==id); saveTrades(); renderTrades(); }, 'Trade verwijderen'); }
function clearTrades(){ showConfirm('Alle trades wissen? Dit verwijdert de volledige trade log en kan niet ongedaan gemaakt worden.', ()=>{trades=[];saveTrades();renderTrades();}, 'Trade log wissen', 'Alles wissen'); }

// ================================================================
// ACCOUNT SYSTEEM
// ================================================================
let fxAccounts = JSON.parse(localStorage.getItem('fxAccounts')||'[]');
let fxActiveAccountId = localStorage.getItem('fxActiveAccountId')||'';

function saveAccounts(){
  localStorage.setItem('fxAccounts', JSON.stringify(fxAccounts));
  scheduleDriveSave();
}

function togglePropFields(on){
  const el = $('accPropFields');
  if(el) el.style.display = on ? 'block' : 'none';
}

function addAccount(){
  const name = $('accName')?.value.trim();
  const size = parseFloat($('accSize')?.value) || 0;
  const desc = $('accDesc')?.value.trim();
  if(!name){ alert('Geef een naam in voor het account.'); return; }
  const isProp = $('accIsProp')?.checked || false;
  const acc = {
    id: 'acc_'+Date.now(), name, desc, initialSize: size, createdAt: new Date().toISOString(),
    propChallenge: isProp ? {
      phases: [{
        name: 'Fase 1',
        profitTarget: parseFloat($('accProfitTarget')?.value) || 0,
        maxLoss:      parseFloat($('accMaxLoss')?.value)      || 0,
        dailyLoss:    parseFloat($('accDailyLoss')?.value)    || 0,
        minDays:      parseInt($('accMinDays')?.value)        || 0,
      }],
      currentPhase: 0,
      phaseStartDates: [new Date().toISOString().split('T')[0]]
    } : null
  };
  fxAccounts.push(acc);
  saveAccounts();
  // Reset prop velden
  if($('accIsProp')){ $('accIsProp').checked = false; togglePropFields(false); }
  if($('accProfitTarget')) $('accProfitTarget').value='';
  if($('accMaxLoss'))      $('accMaxLoss').value='';
  if($('accDailyLoss'))    $('accDailyLoss').value='';
  if($('accMinDays'))      $('accMinDays').value='';
  if($('accName')) $('accName').value='';
  if($('accSize')) $('accSize').value='';
  if($('accDesc')) $('accDesc').value='';
  renderAccountsList();
  renderAccountSelects();
  // Activeer automatisch als eerste account
  if(!fxActiveAccountId){ switchAccount(acc.id); }
}

function deleteAccount(id){
  showConfirm('Account verwijderen? Trades blijven bewaard maar zijn niet meer gekoppeld aan dit account.', () => {
    fxAccounts = fxAccounts.filter(a => a.id !== id);
    saveAccounts();
    if(fxActiveAccountId === id){ fxActiveAccountId = fxAccounts.length ? fxAccounts[0].id : ''; localStorage.setItem('fxActiveAccountId', fxActiveAccountId); }
    renderAccountsList();
    renderAccountSelects();
  }, 'Account verwijderen');
}

function breachAccount(id){
  showConfirm('Account markeren als gebreacht? Het account wordt inactief en kan niet meer geselecteerd worden voor nieuwe trades.', () => {
    const acc = fxAccounts.find(a => a.id === id);
    if(!acc) return;
    acc.breached = true;
    saveAccounts();
    if(fxActiveAccountId === id){ fxActiveAccountId = fxAccounts.find(a=>!a.breached)?.id || ''; localStorage.setItem('fxActiveAccountId', fxActiveAccountId); }
    renderAccountsList();
    renderAccountSelects();
  }, 'Account gebreacht markeren', 'Markeer als gebreacht');
}

function unbreachAccount(id){
  const acc = fxAccounts.find(a => a.id === id);
  if(!acc) return;
  acc.breached = false;
  saveAccounts();
  renderAccountsList();
  renderAccountSelects();
}

function switchAccount(id){
  fxActiveAccountId = id;
  localStorage.setItem('fxActiveAccountId', id);
  // Update header selector
  const sel = $('accountSelect');
  if(sel) sel.value = id;
  // Update journal form selector
  const jSel = $('jAccount');
  if(jSel) jSel.value = id;
  renderAccountsList();
}

function getAccountBalance(accId){
  const acc = fxAccounts.find(a => a.id === accId);
  if(!acc) return null;
  const accTrades = trades.filter(t => t.accountId === accId && t.result !== 'open');
  const pnl = accTrades.reduce((s,t) => s + (t.pnl||0), 0);
  return { initial: acc.initialSize, pnl, current: acc.initialSize + pnl, trades: accTrades.length };
}

// Zet oud single-phase formaat om naar nieuw phases-formaat
function normalizePropChallenge(raw){
  if(!raw) return null;
  if(raw.phases) return raw; // al nieuw formaat
  // Oud formaat: { profitTarget, maxLoss, dailyLoss, minDays, startDate }
  return {
    phases: [{ name: 'Fase 1', profitTarget: raw.profitTarget||0, maxLoss: raw.maxLoss||0, dailyLoss: raw.dailyLoss||0, minDays: raw.minDays||0 }],
    currentPhase: 0,
    phaseStartDates: [raw.startDate || new Date().toISOString().split('T')[0]]
  };
}

function calcPhaseStatus(phase, phaseTrades, initial){
  const closedTrades = phaseTrades.filter(t => t.result !== 'open');
  const totalPnl = closedTrades.reduce((s,t) => s + (t.pnl||0), 0);
  const profitPct = (totalPnl / initial) * 100;
  const winTrades  = closedTrades.filter(t => (t.pnl||0) > 0);
  const lossTrades = closedTrades.filter(t => (t.pnl||0) < 0);
  const winTotal   = winTrades.reduce((s,t)  => s + (t.pnl||0), 0);
  const lossTotal  = lossTrades.reduce((s,t) => s + (t.pnl||0), 0);
  const top3Losers  = [...closedTrades].sort((a,b) => (a.pnl||0)-(b.pnl||0)).slice(0,3);
  const top3Winners = [...closedTrades].sort((a,b) => (b.pnl||0)-(a.pnl||0)).slice(0,3);

  const dayMap = {}, dayTradesMap = {};
  closedTrades.forEach(t => {
    const d = (t.date||'').slice(0,10); if(!d) return;
    dayMap[d] = (dayMap[d]||0) + (t.pnl||0);
    if(!dayTradesMap[d]) dayTradesMap[d] = [];
    dayTradesMap[d].push(t);
  });
  const dayEntries = Object.entries(dayMap).sort((a,b) => a[1]-b[1]);
  const worstDayPnl  = dayEntries.length ? dayEntries[0][1] : 0;
  const worstDayDate = dayEntries.length ? dayEntries[0][0] : null;
  const worstDayPct  = (worstDayPnl / initial) * 100;
  const worstDayTrades = worstDayDate ? dayTradesMap[worstDayDate] : [];
  const tradingDaysList = [...dayEntries].sort((a,b) => a[0].localeCompare(b[0]))
    .map(([date, pnl]) => ({ date, pnl, pct:(pnl/initial)*100, count: dayTradesMap[date].length }));
  const tradingDays = tradingDaysList.length;

  const totalLossBreached = phase.maxLoss   > 0 && profitPct       <= -phase.maxLoss;
  const dailyLossBreached = phase.dailyLoss > 0 && worstDayPct     <= -phase.dailyLoss;
  const isBreached        = totalLossBreached || dailyLossBreached;
  const targetReached     = phase.profitTarget === 0 || profitPct  >= phase.profitTarget;
  const daysOk            = phase.minDays === 0 || tradingDays      >= phase.minDays;
  const isPassed          = !isBreached && targetReached && daysOk;

  return {
    profitPct, totalLossPct: profitPct, totalLossBreached,
    worstDayPct, worstDayDate, worstDayTrades, dailyLossBreached,
    tradingDays, tradingDaysList,
    winTrades, lossTrades, winTotal, lossTotal,
    top3Losers, top3Winners, totalPnl, closedTrades,
    isBreached, isPassed, phase, initial
  };
}

function getPropChallengeStatus(accId){
  const acc = fxAccounts.find(a => a.id === accId);
  if(!acc || !acc.propChallenge) return null;

  // Normaliseer naar nieuw formaat (backward compat)
  const pc = normalizePropChallenge(acc.propChallenge);
  // Sla genormaliseerde versie terug op als het oud formaat was
  if(!acc.propChallenge.phases){ acc.propChallenge = pc; saveAccounts(); }

  const initial = acc.initialSize || 1;
  const allClosed = trades.filter(t => t.accountId === accId && t.result !== 'open');
  const ci = Math.min(pc.currentPhase || 0, pc.phases.length - 1);

  // Filter trades per fase op datum
  const phaseStatuses = pc.phases.map((phase, i) => {
    const start = pc.phaseStartDates?.[i] || null;
    const end   = pc.phaseStartDates?.[i+1] || null;
    const phaseTrades = allClosed.filter(t => {
      const d = (t.date||'').slice(0,10);
      if(!d) return false;
      if(start && d < start) return false;
      if(end   && d >= end)  return false;
      return true;
    });
    return calcPhaseStatus(phase, phaseTrades, initial);
  });

  const current = phaseStatuses[ci];
  const isLastPhase = ci === pc.phases.length - 1;

  return { pc, ci, isLastPhase, phaseStatuses, current, initial };
}


function renderAccountsList(){
  const el = $('accountsList');
  if(!el) return;
  if(!fxAccounts.length){
    el.innerHTML = '<div style="font-size:12px;color:var(--muted);padding:8px 0;">Nog geen accounts aangemaakt.</div>';
    return;
  }
  el.innerHTML = fxAccounts.map(acc => {
    const bal = getAccountBalance(acc.id);
    const cs = getPropChallengeStatus(acc.id);
    const isActive = acc.id === fxActiveAccountId;
    const isBreached = !!acc.breached;
    const pnlColor = (bal?.pnl||0) >= 0 ? 'var(--green)' : 'var(--red)';
    const growthPct = bal?.initial > 0 ? ((bal.pnl / bal.initial)*100).toFixed(1) : '—';
    const bgColor = isBreached ? 'rgba(255,92,92,0.07)' : isActive ? 'rgba(79,158,255,0.08)' : 'var(--surface2)';
    const borderColor = isBreached ? 'rgba(255,92,92,0.35)' : isActive ? 'rgba(79,158,255,0.3)' : 'var(--border)';

    // Prop challenge status badge & blok
    let challengeHtml = '';
    if(cs){
      const { pc, ci, isLastPhase, phaseStatuses, current } = cs;
      const fmt    = (v) => { const n=v??0; return (n>=0?'+':'')+n.toFixed(2); };
      const fmtPct = (v) => { const n=v??0; return (n>=0?'+':'')+n.toFixed(2)+'%'; };
      const fmtDate = (d) => d ? d.slice(5).replace('-','/') : '—';

      // Fase dots navigatie
      const phaseDots = pc.phases.map((ph, i) => {
        const st = phaseStatuses[i];
        const isCurrent = i === ci;
        const color = isCurrent ? 'var(--accent)' : st.isPassed ? 'var(--green)' : st.isBreached ? 'var(--red)' : 'var(--border2)';
        const icon  = isCurrent ? '●' : st.isPassed ? '✓' : st.isBreached ? '✕' : '○';
        return `<span title="${ph.name}" style="font-size:13px;color:${color};font-weight:700;">${icon}</span>`;
      }).join(' ');

      // Status huidige fase
      const statusColor = current.isBreached ? 'var(--red)' : current.isPassed ? 'var(--green)' : 'var(--amber)';
      const statusLabel = current.isBreached ? '❌ GEFAALD' : current.isPassed ? '✅ GESLAAGD' : '🔄 BEZIG';
      const phase = pc.phases[ci];
      const startDate = pc.phaseStartDates?.[ci] || '—';

      // Helper: parameter balk met detail toggle
      const mkRow = (label, valuePct, targetPct, color, inverted, detail, rowId) => {
        const lossPct = inverted ? Math.max(0, -(valuePct??0)) : Math.max(0, valuePct??0);
        const rawFill = targetPct > 0 ? Math.min(100, lossPct / targetPct * 100) : 0;
        const fc = inverted
          ? (rawFill>=100?'var(--red)':rawFill>=75?'var(--amber)':'var(--green)')
          : (rawFill>=100?'var(--green)':color);
        const vStr = (valuePct??0)>=0 ? `+${(valuePct??0).toFixed(1)}%` : `${(valuePct??0).toFixed(1)}%`;
        const tStr = inverted ? `-${targetPct}%` : `+${targetPct}%`;
        return `<div style="margin-bottom:7px;">
          <div style="display:flex;justify-content:space-between;align-items:center;font-size:10px;color:var(--muted);margin-bottom:3px;cursor:pointer;"
            onclick="(function(el){el.style.display=el.style.display==='none'?'block':'none';})(document.getElementById('${rowId}'))">
            <span style="font-family:var(--font-head);font-weight:700;">${label} <span style="opacity:0.4;">ℹ</span></span>
            <span style="color:${fc};font-weight:700;">${vStr} <span style="color:var(--muted);font-weight:400;">/ ${tStr}</span></span>
          </div>
          <div style="height:5px;background:var(--border);border-radius:3px;overflow:hidden;">
            <div style="height:100%;width:${rawFill}%;background:${fc};border-radius:3px;transition:width .4s;"></div>
          </div>
          <div id="${rowId}" style="display:none;margin-top:5px;font-size:11px;color:var(--muted);line-height:1.8;padding:7px 9px;background:var(--bg);border-radius:6px;">${detail}</div>
        </div>`;
      };

      // Detail teksten
      const profitDetail = `
        💰 Startkapitaal: <strong style="color:var(--text)">€${current.initial.toLocaleString()}</strong><br>
        ✅ Winsten: <strong style="color:var(--green)">${current.winTrades.length}t · ${fmt(current.winTotal)}</strong> &nbsp;
        ❌ Verliezen: <strong style="color:var(--red)">${current.lossTrades.length}t · ${fmt(current.lossTotal)}</strong><br>
        📈 Netto: <strong style="color:${current.totalPnl>=0?'var(--green)':'var(--red)'}">${fmt(current.totalPnl)} (${fmtPct(current.profitPct)})</strong>
        ${current.top3Winners.length?`<br>🏅 Top: ${current.top3Winners.map(t=>`<span style="color:var(--green)">${t.pair||'?'} ${fmt(t.pnl)}</span>`).join(' · ')}`:''}`;

      const lossDetail = `
        💰 Startkapitaal: <strong style="color:var(--text)">€${current.initial.toLocaleString()}</strong><br>
        📉 Netto P&L: <strong style="color:${current.totalPnl>=0?'var(--green)':'var(--red)'}">${fmt(current.totalPnl)} (${fmtPct(current.totalLossPct)})</strong><br>
        🚨 Limiet: <strong style="color:var(--red)">-€${(current.initial*phase.maxLoss/100).toFixed(2)} (-${phase.maxLoss}%)</strong> &nbsp;
        📦 Ruimte: <strong style="color:var(--text)">€${Math.max(0, current.initial*phase.maxLoss/100+current.totalPnl).toFixed(2)}</strong>
        ${current.top3Losers.filter(t=>(t.pnl||0)<0).length?`<br>💀 Verliezers: ${current.top3Losers.filter(t=>(t.pnl||0)<0).map(t=>`<span style="color:var(--red)">${t.pair||'?'} ${fmt(t.pnl)}</span>`).join(' · ')}`:''}`;

      const dailyDetail = `
        📅 Slechtste dag: ${current.worstDayDate
          ? `<strong style="color:var(--red)">${current.worstDayDate} · ${fmt(current.worstDayPnl)} (${fmtPct(current.worstDayPct)})</strong><br>
             &nbsp;&nbsp;${current.worstDayTrades.map(t=>`<span style="color:${(t.pnl||0)>=0?'var(--green)':'var(--red)'}">${t.pair||'?'} ${fmt(t.pnl||0)}</span>`).join(' · ')}`
          : 'Nog geen trades.'}<br>
        🚨 Limiet: <strong style="color:var(--red)">-€${(current.initial*phase.dailyLoss/100).toFixed(2)} (-${phase.dailyLoss}%)</strong>
        ${current.tradingDaysList.length>1?`<br>Alle dagen: ${current.tradingDaysList.map(d=>`<span style="color:${d.pnl>=0?'var(--green)':'var(--red)'}">${fmtDate(d.date)} ${fmt(d.pnl)}</span>`).join(' · ')}`:''}`;

      const daysDetail = `
        📊 Unieke kalenderdagen met ≥1 gesloten trade in deze fase<br>
        📅 <strong style="color:var(--text)">${current.tradingDays}</strong> days / vereist: <strong style="color:var(--text)">${phase.minDays}</strong>
        ${current.tradingDaysList.length?`<br>${current.tradingDaysList.map(d=>`<span style="color:var(--muted)">${d.date} <span style="color:${d.pnl>=0?'var(--green)':'var(--red)'}">${fmt(d.pnl)}</span>(${d.count}t)</span>`).join(' ')}`:''}`;

      const profitRow = phase.profitTarget > 0
        ? mkRow('Profit Target',      current.profitPct,   phase.profitTarget, 'var(--green)', false, profitDetail, `pd_pt_${acc.id}`) : '';
      const lossRow   = phase.maxLoss > 0
        ? mkRow('Max Totaal Verlies', current.totalLossPct, phase.maxLoss,      'var(--red)',   true,  lossDetail,   `pd_ml_${acc.id}`) : '';
      const dailyRow  = phase.dailyLoss > 0
        ? mkRow('Slechtste Dag',      current.worstDayPct, phase.dailyLoss,    'var(--amber)', true,  dailyDetail,  `pd_dl_${acc.id}`) : '';
      const daysRow   = phase.minDays > 0 ? mkRow(
        'Trading Days',
        (current.tradingDays / phase.minDays * 100) - 100 < 0 ? (current.tradingDays / phase.minDays * 100) - 100 : 0,
        0, 'var(--green)', false, daysDetail, `pd_td_${acc.id}`) : '';

      // Trading days apart renderen (geen % logica)
      const daysRowHtml = phase.minDays > 0 ? `<div style="margin-bottom:7px;">
        <div style="display:flex;justify-content:space-between;align-items:center;font-size:10px;color:var(--muted);margin-bottom:3px;cursor:pointer;"
          onclick="(function(el){el.style.display=el.style.display==='none'?'block':'none';})(document.getElementById('pd_td_${acc.id}'))">
          <span style="font-family:var(--font-head);font-weight:700;">Trading Days <span style="opacity:0.4;">ℹ</span></span>
          <span style="color:${current.tradingDays>=phase.minDays?'var(--green)':'var(--muted)'};font-weight:700;">
            ${current.tradingDays} <span style="color:var(--muted);font-weight:400;">/ min. ${phase.minDays}</span>
          </span>
        </div>
        <div style="height:5px;background:var(--border);border-radius:3px;overflow:hidden;">
          <div style="height:100%;width:${Math.min(100,phase.minDays>0?current.tradingDays/phase.minDays*100:0)}%;background:${current.tradingDays>=phase.minDays?'var(--green)':'var(--muted)'};border-radius:3px;transition:width .4s;"></div>
        </div>
        <div id="pd_td_${acc.id}" style="display:none;margin-top:5px;font-size:11px;color:var(--muted);line-height:1.8;padding:7px 9px;background:var(--bg);border-radius:6px;">${daysDetail}</div>
      </div>` : '';

      // Voltooide fases samenvatting
      const completedHtml = phaseStatuses.map((st, i) => {
        if(i >= ci) return '';
        const ph = pc.phases[i];
        const clr = st.isBreached ? 'var(--red)' : 'var(--green)';
        const ico = st.isBreached ? '✕' : '✓';
        return `<div style="display:flex;align-items:center;gap:8px;font-size:10px;color:var(--muted);padding:3px 0;border-bottom:1px solid var(--border);">
          <span style="color:${clr};font-weight:700;">${ico}</span>
          <span style="font-family:var(--font-head);font-weight:700;color:var(--text);">${ph.name}</span>
          <span>${ph.profitTarget?`T:+${ph.profitTarget}%`:''} ${ph.maxLoss?`ML:-${ph.maxLoss}%`:''} ${ph.dailyLoss?`DL:-${ph.dailyLoss}%`:''}</span>
          <span style="margin-left:auto;color:${clr};font-weight:700;">${fmt(st.totalPnl)} (${fmtPct(st.profitPct)})</span>
        </div>`;
      }).join('');

      // Knop naar volgende fase / herstarten
      const actionBtn = current.isPassed && !isLastPhase
        ? `<button onclick="advancePhase('${acc.id}')" style="width:100%;margin-top:10px;padding:8px;border-radius:7px;border:none;background:var(--green);color:#0d0f14;font-family:var(--font-head);font-weight:800;font-size:12px;cursor:pointer;">
            ✅ Naar ${pc.phases[ci+1]?.name || 'volgende fase'} →
           </button>`
        : current.isPassed && isLastPhase
        ? `<div style="margin-top:8px;padding:8px 12px;border-radius:7px;background:rgba(46,204,138,0.1);border:1px solid rgba(46,204,138,0.3);text-align:center;font-family:var(--font-head);font-weight:800;font-size:12px;color:var(--green);">
            🏆 CHALLENGE VOLLEDIG GESLAAGD!
           </div>`
        : current.isBreached
        ? `<button onclick="resetPhase('${acc.id}')" style="width:100%;margin-top:10px;padding:8px;border-radius:7px;border:1px solid rgba(255,92,92,0.4);background:rgba(255,92,92,0.08);color:var(--red);font-family:var(--font-head);font-weight:700;font-size:11px;cursor:pointer;">
            🔄 Fase herstarten (nieuwe startdatum)
           </button>`
        : '';

      challengeHtml = `<div style="margin-top:10px;padding:10px 12px;border-radius:8px;background:rgba(0,0,0,0.15);border:1px solid var(--border);">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
          <div style="display:flex;align-items:center;gap:8px;">
            <span style="font-size:10px;color:var(--muted);font-family:var(--font-head);font-weight:700;text-transform:uppercase;letter-spacing:.5px;">🏆 Prop Challenge</span>
            <span style="font-size:11px;letter-spacing:3px;">${phaseDots}</span>
          </div>
          <button onclick="editPropChallenge('${acc.id}')" style="padding:2px 8px;font-size:10px;border-radius:5px;border:1px solid var(--border2);background:transparent;color:var(--muted);cursor:pointer;font-family:var(--font-head);font-weight:700;">✏️ Bewerk</button>
        </div>
        ${completedHtml ? `<div style="margin-bottom:8px;">${completedHtml}</div>` : ''}
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;">
          <span style="font-family:var(--font-head);font-weight:800;font-size:12px;color:var(--text);">
            ${phase.name}
            <span style="font-size:10px;color:var(--muted);font-weight:400;margin-left:4px;">Fase ${ci+1}/${pc.phases.length} · vanaf ${startDate}</span>
          </span>
          <span style="font-size:10px;font-family:var(--font-head);font-weight:700;color:${statusColor};">${statusLabel}</span>
        </div>
        <div style="font-size:9px;color:var(--muted);margin-bottom:6px;font-style:italic;">Klik op een parameter voor details</div>
        ${profitRow}${lossRow}${dailyRow}${daysRowHtml}
        ${actionBtn}
      </div>`;
    }

    return `<div class="account-list-item" style="flex-direction:column;padding:10px 12px;background:${bgColor};border:1px solid ${borderColor};border-radius:10px;margin-bottom:6px;${isBreached?'opacity:0.75;':''}">
      <div style="display:flex;align-items:center;justify-content:space-between;width:100%;">
        <div style="flex:1;">
          <div style="display:flex;align-items:center;gap:8px;">
            <span style="font-family:var(--font-head);font-weight:700;font-size:13px;color:${isBreached?'var(--red)':isActive?'var(--accent)':'var(--text)'};">${acc.name}</span>
            ${isBreached?'<span style="font-size:9px;background:rgba(255,92,92,0.2);color:var(--red);padding:1px 6px;border-radius:4px;font-family:var(--font-head);font-weight:700;">GEBREACHT</span>':
              isActive?'<span style="font-size:9px;background:rgba(79,158,255,0.2);color:var(--accent);padding:1px 6px;border-radius:4px;font-family:var(--font-head);font-weight:700;">ACTIEF</span>':''}
            ${acc.propChallenge?'<span style="font-size:9px;background:rgba(167,139,250,0.2);color:var(--purple);padding:1px 6px;border-radius:4px;font-family:var(--font-head);font-weight:700;">PROP</span>':''}
          </div>
          ${acc.desc?`<div style="font-size:11px;color:var(--muted);margin-top:2px;">${acc.desc}</div>`:''}
          <div style="display:flex;gap:12px;margin-top:6px;font-size:11px;flex-wrap:wrap;">
            <span style="color:var(--muted);">Start: <strong style="color:var(--text)">€${(acc.initialSize||0).toLocaleString()}</strong></span>
            ${bal?`<span style="color:var(--muted);">Huidig: <strong style="color:var(--text)">€${(bal.current||0).toLocaleString('nl-BE',{minimumFractionDigits:0,maximumFractionDigits:0})}</strong></span>
            <span style="color:${pnlColor};font-weight:700;">${(bal.pnl||0)>=0?'+':''}€${(bal.pnl||0).toFixed(0)} (${growthPct}%)</span>
            <span style="color:var(--muted);">${bal.trades} trades</span>`:''}
          </div>
        </div>
        <div class="account-list-btns" style="display:flex;gap:6px;margin-left:10px;flex-wrap:wrap;justify-content:flex-end;align-self:flex-start;">
          ${isBreached
            ? `<button onclick="unbreachAccount('${acc.id}')" style="padding:5px 10px;font-size:11px;border-radius:6px;border:1px solid var(--border);background:transparent;color:var(--muted);cursor:pointer;font-family:var(--font-head);font-weight:700;">Herstel</button>`
            : `${!isActive?`<button onclick="switchAccount('${acc.id}')" style="padding:5px 10px;font-size:11px;border-radius:6px;border:1px solid var(--accent);background:rgba(79,158,255,0.1);color:var(--accent);cursor:pointer;font-family:var(--font-head);font-weight:700;">Activeer</button>`:''}
               <button onclick="breachAccount('${acc.id}')" style="padding:5px 10px;font-size:11px;border-radius:6px;border:1px solid rgba(255,92,92,0.4);background:rgba(255,92,92,0.08);color:var(--red);cursor:pointer;font-family:var(--font-head);font-weight:700;">Gebreacht</button>
               ${!acc.propChallenge?`<button onclick="editPropChallenge('${acc.id}')" style="padding:5px 10px;font-size:11px;border-radius:6px;border:1px solid rgba(167,139,250,0.4);background:rgba(167,139,250,0.08);color:var(--purple);cursor:pointer;font-family:var(--font-head);font-weight:700;">🏆 Challenge</button>`:''}`
          }
          <button onclick="deleteAccount('${acc.id}')" style="padding:5px 10px;font-size:11px;border-radius:6px;border:1px solid var(--border);background:transparent;color:var(--muted);cursor:pointer;">✕</button>
        </div>
      </div>
      ${challengeHtml}
    </div>`;
  }).join('');
}

function _phaseRowHtml(phase, i, startDate){
  const inpStyle = 'width:100%;padding:6px 8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;color:var(--text);font-family:var(--font-mono);font-size:12px;';
  const lblStyle = 'font-size:9px;color:var(--muted);display:block;margin-bottom:2px;text-transform:uppercase;letter-spacing:.5px;';
  return `<div class="pe-phase-row" data-phase-idx="${i}" style="background:rgba(79,158,255,0.04);border:1px solid rgba(79,158,255,0.15);border-radius:8px;padding:10px 12px;margin-bottom:8px;">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
      <span style="font-size:10px;color:var(--accent);font-family:var(--font-head);font-weight:700;">FASE ${i+1}</span>
      <button onclick="removePePhase(${i})" style="background:none;border:none;color:var(--muted);cursor:pointer;font-size:13px;padding:0 2px;" title="Fase verwijderen">✕</button>
    </div>
    <div style="margin-bottom:8px;">
      <label style="${lblStyle}">Naam fase</label>
      <input class="pe-phase-name" type="text" value="${phase.name||`Fase ${i+1}`}" placeholder="bv. Challenge" style="${inpStyle}">
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:6px;">
      <div><label style="${lblStyle}">Profit Target (%)</label>
        <input class="pe-phase-target" type="number" value="${phase.profitTarget||''}" placeholder="bv. 10" step="0.5" min="0" style="${inpStyle}">
      </div>
      <div><label style="${lblStyle}">Max totaal verlies (%)</label>
        <input class="pe-phase-maxloss" type="number" value="${phase.maxLoss||''}" placeholder="bv. 10" step="0.5" min="0" style="${inpStyle}">
      </div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:6px;">
      <div><label style="${lblStyle}">Max dagelijks verlies (%)</label>
        <input class="pe-phase-dailyloss" type="number" value="${phase.dailyLoss||''}" placeholder="bv. 5" step="0.5" min="0" style="${inpStyle}">
      </div>
      <div><label style="${lblStyle}">Min. trading days</label>
        <input class="pe-phase-mindays" type="number" value="${phase.minDays||''}" placeholder="bv. 4" step="1" min="0" style="${inpStyle}">
      </div>
    </div>
    <div><label style="${lblStyle}">Startdatum fase</label>
      <input class="pe-phase-startdate" type="date" value="${startDate||''}" style="${inpStyle}">
    </div>
  </div>`;
}

function editPropChallenge(accId){
  const acc = fxAccounts.find(a => a.id === accId);
  if(!acc) return;
  const existing = $('propEditOverlay');
  if(existing) existing.remove();

  // Normaliseer naar nieuw formaat
  const pc = normalizePropChallenge(acc.propChallenge || {
    phases:[{name:'Fase 1',profitTarget:0,maxLoss:0,dailyLoss:0,minDays:0}],
    currentPhase:0, phaseStartDates:[new Date().toISOString().split('T')[0]]
  });

  const phasesHtml = pc.phases.map((ph, i) => _phaseRowHtml(ph, i, pc.phaseStartDates?.[i]||'')).join('');

  const overlay = document.createElement('div');
  overlay.id = 'propEditOverlay';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(10,11,16,0.85);z-index:600;display:flex;align-items:center;justify-content:center;padding:16px;';
  overlay.innerHTML = `
    <div style="background:var(--surface);border:1px solid var(--border2);border-radius:16px;padding:20px;width:100%;max-width:480px;max-height:90vh;overflow-y:auto;">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;">
        <div style="font-family:var(--font-head);font-weight:800;font-size:15px;">🏆 Challenge — ${acc.name}</div>
        <button onclick="$('propEditOverlay').remove()" style="background:none;border:none;color:var(--muted);font-size:20px;cursor:pointer;line-height:1;">×</button>
      </div>
      <div id="pePhasesContainer">${phasesHtml}</div>
      <button onclick="addPePhase()" style="width:100%;padding:8px;border-radius:7px;border:1px dashed var(--border2);background:transparent;color:var(--muted);cursor:pointer;font-family:var(--font-head);font-weight:700;font-size:11px;margin-bottom:14px;">+ Fase toevoegen</button>
      <div style="display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap;">
        ${acc.propChallenge?`<button onclick="removePropChallenge('${accId}')" style="padding:8px 12px;border-radius:7px;font-family:var(--font-head);font-weight:700;font-size:11px;cursor:pointer;border:1px solid rgba(255,92,92,0.4);background:rgba(255,92,92,0.07);color:var(--red);margin-right:auto;">Verwijderen</button>`:''}
        <button onclick="$('propEditOverlay').remove()" style="padding:8px 14px;border-radius:7px;font-family:var(--font-head);font-weight:700;font-size:11px;cursor:pointer;border:1px solid var(--border);background:var(--surface2);color:var(--muted);">Annuleren</button>
        <button onclick="savePropChallenge('${accId}')" style="padding:8px 18px;border-radius:7px;font-family:var(--font-head);font-weight:700;font-size:12px;cursor:pointer;border:none;background:var(--accent);color:#fff;">Opslaan</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.addEventListener('click', e => { if(e.target === overlay) overlay.remove(); });
}

function addPePhase(){
  const container = document.getElementById('pePhasesContainer');
  if(!container) return;
  const existing = container.querySelectorAll('.pe-phase-row');
  const i = existing.length;
  const div = document.createElement('div');
  div.innerHTML = _phaseRowHtml({name:`Fase ${i+1}`,profitTarget:'',maxLoss:'',dailyLoss:'',minDays:''}, i, '');
  container.appendChild(div.firstElementChild);
}

function removePePhase(idx){
  const container = document.getElementById('pePhasesContainer');
  if(!container) return;
  const rows = container.querySelectorAll('.pe-phase-row');
  if(rows.length <= 1){ alert('Je hebt minstens 1 fase nodig.'); return; }
  rows[idx]?.remove();
  // Hernum de fase-labels
  container.querySelectorAll('.pe-phase-row').forEach((row, i) => {
    row.setAttribute('data-phase-idx', i);
    const label = row.querySelector('span[style*="color:var(--accent)"]');
    if(label) label.textContent = `FASE ${i+1}`;
    const rmBtn = row.querySelector('button');
    if(rmBtn) rmBtn.setAttribute('onclick', `removePePhase(${i})`);
  });
}

function savePropChallenge(accId){
  const acc = fxAccounts.find(a => a.id === accId);
  if(!acc) return;
  const container = document.getElementById('pePhasesContainer');
  if(!container) return;
  const rows = container.querySelectorAll('.pe-phase-row');
  const phases = [], phaseStartDates = [];
  rows.forEach(row => {
    phases.push({
      name:        row.querySelector('.pe-phase-name')?.value.trim()    || `Fase ${phases.length+1}`,
      profitTarget:parseFloat(row.querySelector('.pe-phase-target')?.value)   || 0,
      maxLoss:     parseFloat(row.querySelector('.pe-phase-maxloss')?.value)  || 0,
      dailyLoss:   parseFloat(row.querySelector('.pe-phase-dailyloss')?.value)|| 0,
      minDays:     parseInt(row.querySelector('.pe-phase-mindays')?.value)    || 0,
    });
    phaseStartDates.push(row.querySelector('.pe-phase-startdate')?.value || null);
  });
  const existing = normalizePropChallenge(acc.propChallenge);
  acc.propChallenge = {
    phases,
    currentPhase: Math.min(existing?.currentPhase||0, phases.length-1),
    phaseStartDates
  };
  saveAccounts();
  $('propEditOverlay')?.remove();
  renderAccountsList();
}

function removePropChallenge(accId){
  const acc = fxAccounts.find(a => a.id === accId);
  if(!acc) return;
  acc.propChallenge = null;
  saveAccounts();
  $('propEditOverlay')?.remove();
  renderAccountsList();
}

function advancePhase(accId){
  const acc = fxAccounts.find(a => a.id === accId);
  if(!acc || !acc.propChallenge) return;
  const pc = normalizePropChallenge(acc.propChallenge);
  const next = (pc.currentPhase||0) + 1;
  if(next >= pc.phases.length) return;
  pc.currentPhase = next;
  if(!pc.phaseStartDates) pc.phaseStartDates = [];
  pc.phaseStartDates[next] = new Date().toISOString().split('T')[0];
  acc.propChallenge = pc;
  saveAccounts();
  renderAccountsList();
}

function resetPhase(accId){
  showConfirm('Huidige fase herstarten? De startdatum wordt vandaag. Trades vóór vandaag tellen niet meer mee voor deze fase.', () => {
    const acc = fxAccounts.find(a => a.id === accId);
    if(!acc || !acc.propChallenge) return;
    const pc = normalizePropChallenge(acc.propChallenge);
    const ci = pc.currentPhase||0;
    if(!pc.phaseStartDates) pc.phaseStartDates = [];
    pc.phaseStartDates[ci] = new Date().toISOString().split('T')[0];
    acc.propChallenge = pc;
    saveAccounts();
    renderAccountsList();
  }, 'Fase herstarten', 'Ja, herstart fase');
}

function renderAccountSelects(){
  const opts = `<option value="">— Geen account —</option>` +
    fxAccounts.map(a => `<option value="${a.id}">${a.breached ? '⚠ ' : ''}${a.name}${a.breached ? ' (gebreacht)' : ''}</option>`).join('');
  ['accountSelect','jAccount','eAccount'].forEach(id => {
    const sel = $(id);
    if(sel){ sel.innerHTML = opts; sel.value = fxActiveAccountId || ''; }
  });
}

function toggleTradeLog(){
  const body = $('tradeLogBody');
  const toggle = $('tradeLogToggle');
  if(!body) return;
  const open = getComputedStyle(body).display !== 'none';
  body.style.display = open ? 'none' : 'block';
  if(toggle) toggle.textContent = open ? '▾' : '▴';
}

function toggleJournalForm(){
  const body = $('journalFormBody');
  const toggle = $('journalFormToggle');
  if(!body) return;
  const open = body.style.display !== 'none';
  body.style.display = open ? 'none' : 'block';
  if(toggle) toggle.textContent = open ? '▾ toon formulier' : '▴ verberg formulier';
}

function toggleFilters(){
  const bar = $('journalFilterBar');
  if(bar) bar.style.display = bar.style.display === 'none' ? 'block' : 'none';
}

// ================================================================
// TRADING KALENDER
// ================================================================
let calYear = new Date().getFullYear();
let calMonth = new Date().getMonth(); // 0-based

function renderCalendar(){
  const cal = $('tradingCalendar');
  const label = $('calMonthLabel');
  if(!cal) return;

  const monthNames = ['Januari','Februari','Maart','April','Mei','Juni','Juli','Augustus','September','Oktober','November','December'];
  if(label) label.textContent = monthNames[calMonth] + ' ' + calYear;

  // Bouw dagmap: date string → trades
  const dayMap = {};
  trades.forEach(t => {
    if(!t.date) return;
    if(!dayMap[t.date]) dayMap[t.date] = [];
    dayMap[t.date].push(t);
  });

  const firstDay = new Date(calYear, calMonth, 1).getDay(); // 0=Sun
  const daysInMonth = new Date(calYear, calMonth+1, 0).getDate();
  const startOffset = (firstDay + 6) % 7; // Monday=0

  let html = `<div style="display:grid;grid-template-columns:repeat(7,1fr);gap:3px;margin-top:8px;">`;

  // Dag headers
  ['Ma','Di','Wo','Do','Vr','Za','Zo'].forEach(d => {
    html += `<div style="text-align:center;font-size:10px;font-family:var(--font-head);font-weight:700;color:var(--muted);padding:4px 0;">${d}</div>`;
  });

  // Lege vakjes voor offset
  for(let i = 0; i < startOffset; i++){
    html += `<div></div>`;
  }

  // Dag vakjes
  for(let day = 1; day <= daysInMonth; day++){
    const dateStr = `${calYear}-${String(calMonth+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
    const dayTrades = dayMap[dateStr] || [];
    const today = new Date().toISOString().slice(0,10);
    const isToday = dateStr === today;

    let bgColor = 'var(--surface2)';
    let textColor = 'var(--muted)';
    let pnlText = '';
    let border = '1px solid var(--border)';

    if(dayTrades.length > 0){
      const closed = dayTrades.filter(t => t.result !== 'open');
      const totalPnl = closed.reduce((s,t) => s + (t.pnl||0), 0);
      const wins = closed.filter(t => t.result === 'win').length;
      const losses = closed.filter(t => t.result === 'loss').length;

      if(closed.length > 0){
        if(totalPnl > 0){ bgColor = 'rgba(46,204,138,0.15)'; border = '1px solid rgba(46,204,138,0.4)'; textColor = 'var(--green)'; }
        else if(totalPnl < 0){ bgColor = 'rgba(255,92,92,0.15)'; border = '1px solid rgba(255,92,92,0.4)'; textColor = 'var(--red)'; }
        else { bgColor = 'rgba(245,166,35,0.1)'; border = '1px solid rgba(245,166,35,0.3)'; textColor = 'var(--amber)'; }
        pnlText = `<div style="font-size:9px;font-weight:700;margin-top:2px;">${totalPnl>=0?'+':''}€${totalPnl.toFixed(0)}</div>
                   <div style="font-size:8px;opacity:0.8;">${dayTrades.length} trade${dayTrades.length>1?'s':''}</div>`;
      } else {
        // Enkel open trades
        bgColor = 'rgba(79,158,255,0.08)'; border = '1px solid rgba(79,158,255,0.2)'; textColor = 'var(--accent)';
        pnlText = `<div style="font-size:8px;margin-top:2px;opacity:0.8;">${dayTrades.length}× open</div>`;
      }
    }

    const cursor = dayTrades.length > 0 ? 'cursor:pointer;' : '';
    const todayStyle = isToday ? 'box-shadow:0 0 0 2px var(--accent);' : '';
    const onclick = dayTrades.length > 0 ? `onclick="openCalDay('${dateStr}')"` : '';

    html += `<div ${onclick} style="min-height:75px;border-radius:10px;background:${bgColor};border:${border};${todayStyle}${cursor}padding:8px 6px;display:flex;flex-direction:column;align-items:center;transition:opacity .15s;" ${dayTrades.length>0?'onmouseenter="this.style.opacity=\'0.8\'" onmouseleave="this.style.opacity=\'1\'"':''}>
      <div style="font-size:12px;font-family:var(--font-head);font-weight:700;color:${isToday?'var(--accent)':textColor};">${day}</div>
      <div style="color:${textColor};text-align:center;margin-top:2px;">${pnlText}</div>
    </div>`;
  }

  html += `</div>`;

  // Legenda
  html += `<div style="display:flex;gap:16px;margin-top:10px;font-size:10px;color:var(--muted);flex-wrap:wrap;">
    <span style="display:flex;align-items:center;gap:4px;"><span style="width:10px;height:10px;border-radius:3px;background:rgba(46,204,138,0.3);display:inline-block;"></span> Winstdag</span>
    <span style="display:flex;align-items:center;gap:4px;"><span style="width:10px;height:10px;border-radius:3px;background:rgba(255,92,92,0.3);display:inline-block;"></span> Verliesdag</span>
    <span style="display:flex;align-items:center;gap:4px;"><span style="width:10px;height:10px;border-radius:3px;background:rgba(245,166,35,0.2);display:inline-block;"></span> Break-even</span>
    <span style="display:flex;align-items:center;gap:4px;"><span style="width:10px;height:10px;border-radius:3px;background:rgba(79,158,255,0.15);display:inline-block;"></span> Open trades</span>
    <span style="display:flex;align-items:center;gap:4px;"><span style="width:10px;height:10px;border-radius:3px;border:2px solid var(--accent);display:inline-block;"></span> Vandaag</span>
  </div>`;

  cal.innerHTML = html;
}

function calPrevMonth(){
  calMonth--;
  if(calMonth < 0){ calMonth = 11; calYear--; }
  renderCalendar();
}
function calNextMonth(){
  calMonth++;
  if(calMonth > 11){ calMonth = 0; calYear++; }
  renderCalendar();
}

function openCalDay(dateStr){
  const dayTrades = trades.filter(t => t.date === dateStr);
  if(!dayTrades.length) return;

  const modal = $('calDayModal');
  const title = $('calDayTitle');
  const summary = $('calDaySummary');
  const container = $('calDayTrades');
  if(!modal) return;

  // Datum formatteren
  const d = new Date(dateStr + 'T12:00:00');
  const dayNames = ['Zondag','Maandag','Dinsdag','Woensdag','Donderdag','Vrijdag','Zaterdag'];
  const monthNames = ['januari','februari','maart','april','mei','juni','juli','augustus','september','oktober','november','december'];
  if(title) title.textContent = `${dayNames[d.getDay()]} ${d.getDate()} ${monthNames[d.getMonth()]} ${d.getFullYear()}`;

  const closed = dayTrades.filter(t => t.result !== 'open');
  const totalPnl = closed.reduce((s,t) => s + (t.pnl||0), 0);
  const wins = closed.filter(t => t.result === 'win').length;
  if(summary) summary.textContent = `${dayTrades.length} trade${dayTrades.length>1?'s':''} · ${wins} win${wins!==1?'s':''} · P&L: ${totalPnl>=0?'+':''}€${totalPnl.toFixed(0)}`;

  // Trade kaarten
  container.innerHTML = dayTrades.map(t => {
    const resColor = t.result==='win'?'var(--green)':t.result==='loss'?'var(--red)':t.result==='be'?'var(--amber)':'var(--muted)';
    const resLabel = t.result==='win'?'WIN':t.result==='loss'?'LOSS':t.result==='be'?'BE':'OPEN';
    const dirColor = t.dir==='long'?'var(--green)':'var(--red)';
    return `<div style="background:var(--surface2);border:1px solid var(--border);border-radius:12px;padding:16px;margin-bottom:10px;">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">
        <div style="display:flex;align-items:center;gap:10px;">
          <span style="font-family:var(--font-head);font-weight:800;font-size:15px;color:var(--text);">${t.pair||'—'}</span>
          <span style="font-size:11px;font-weight:700;color:${dirColor};background:${dirColor}22;padding:2px 8px;border-radius:4px;">${(t.dir||'').toUpperCase()}</span>
        </div>
        <span style="font-size:12px;font-weight:800;color:${resColor};background:${resColor}22;padding:3px 12px;border-radius:6px;font-family:var(--font-head);">${resLabel}</span>
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(110px,1fr));gap:8px;margin-bottom:${t.notes||t.edge_desc||t.img?'10':'0'}px;">
        ${t.pnl!=null?`<div style="text-align:center;background:var(--bg);border-radius:8px;padding:8px;"><div style="font-size:16px;font-weight:800;color:${(t.pnl||0)>=0?'var(--green)':'var(--red)'};">${(t.pnl||0)>=0?'+':''}€${(t.pnl||0).toFixed(0)}</div><div style="font-size:9px;color:var(--muted);">P&L</div></div>`:''}
        ${t.rr?`<div style="text-align:center;background:var(--bg);border-radius:8px;padding:8px;"><div style="font-size:16px;font-weight:800;color:var(--accent);">${t.rr}R</div><div style="font-size:9px;color:var(--muted);">R:R</div></div>`:''}
        ${t.entry?`<div style="text-align:center;background:var(--bg);border-radius:8px;padding:8px;"><div style="font-size:13px;font-weight:700;color:var(--text);">${t.entry}</div><div style="font-size:9px;color:var(--muted);">Entry</div></div>`:''}
        ${t.sl?`<div style="text-align:center;background:var(--bg);border-radius:8px;padding:8px;"><div style="font-size:13px;font-weight:700;color:var(--red);">${t.sl}</div><div style="font-size:9px;color:var(--muted);">SL</div></div>`:''}
        ${t.tp?`<div style="text-align:center;background:var(--bg);border-radius:8px;padding:8px;"><div style="font-size:13px;font-weight:700;color:var(--green);">${t.tp}</div><div style="font-size:9px;color:var(--muted);">TP</div></div>`:''}
        ${t.lot?`<div style="text-align:center;background:var(--bg);border-radius:8px;padding:8px;"><div style="font-size:13px;font-weight:700;color:var(--text);">${t.lot}</div><div style="font-size:9px;color:var(--muted);">Lot</div></div>`:''}
      </div>
      ${t.notes?`<div style="font-size:12px;color:var(--muted);line-height:1.7;padding:10px;background:var(--bg);border-radius:8px;margin-bottom:8px;"><strong style="color:var(--text);">📝 Notities:</strong> ${t.notes}</div>`:''}
      ${t.edge_desc?`<div style="font-size:12px;color:var(--muted);line-height:1.7;padding:10px;background:rgba(167,139,250,0.06);border-radius:8px;border-left:3px solid var(--purple);margin-bottom:8px;"><strong style="color:var(--purple);">⚡ Edge:</strong> ${t.edge_desc}</div>`:''}
      ${t.img?`<img src="${t.img}" style="width:100%;border-radius:8px;margin-top:4px;max-height:300px;object-fit:contain;background:var(--bg);">`:''}
      <div style="margin-top:10px;text-align:right;">
        <button onclick="closeCalDayModal();editTrade('${t.id}')" style="padding:6px 14px;border-radius:8px;font-family:var(--font-head);font-weight:700;font-size:11px;cursor:pointer;border:1px solid var(--accent);background:rgba(79,158,255,0.1);color:var(--accent);">✏ Wijzigen</button>
      </div>
    </div>`;
  }).join('');

  modal.style.display = 'flex';
  document.body.style.overflow = 'hidden';
}

function closeCalDayModal(){
  const m = $('calDayModal');
  if(m){ m.style.display='none'; document.body.style.overflow=''; }
}
document.addEventListener('click', e => {
  const m = $('calDayModal');
  if(m && e.target === m) closeCalDayModal();
});

// ================================================================
// AI TRADE REVIEW  (journal tab)
// ================================================================
async function reviewTradeWithAI() {
  const apiKey = $('anthropicApiKey')?.value.trim() || localStorage.getItem('fxAnthropicKey') || '';
  if(!apiKey){
    alert('Voer eerst je Anthropic API sleutel in via het "Setup & Backup" tabblad.');
    return;
  }

  // Collect current form values
  const pair      = $('jPair')?.value || '';
  const dir       = $('jDir')?.value || '';
  const result    = $('jResult')?.value || '';
  const edgeFields = getEdgeFields('j');
  const entry  = $('jEntry')?.value || '';
  const sl     = $('jSL')?.value || '';
  const tp     = $('jTP')?.value || '';
  const lot    = $('jLot')?.value || '';
  const pnl    = $('jPnl')?.value || '';
  const rr     = $('jRR')?.value || '';
  const notes  = $('jNotes')?.value.trim() || '';

  if(!pair && !entry && !notes){
    alert('Vul eerst minstens het valutapaar, entry prijs en/of je notities in voor een zinvolle review.');
    return;
  }

  const reviewBtn = $('jReviewBtn');
  const loading   = $('jReviewLoading');
  const result_el = $('jReviewResult');

  if(reviewBtn) reviewBtn.disabled = true;
  if(loading)   loading.style.display = 'flex';
  if(result_el) result_el.style.display = 'none';

  const matchLabels = { yes:'Ja — trade zit binnen mijn edge', partial:'Deels — niet alle criteria gevuld', no:'Nee — trade buiten mijn edge' };
  const confLabels  = { high:'Hoog', medium:'Matig', low:'Laag' };
  const tradeDetails = [
    `Pair: ${pair}`,
    `Richting: ${dir === 'long' ? 'LONG (kopen)' : 'SHORT (verkopen)'}`,
    `Uitkomst: ${result}`,
    entry  ? `Entry prijs: ${entry}` : '',
    sl     ? `Stop-loss: ${sl}` : '',
    tp     ? `Take profit: ${tp}` : '',
    lot    ? `Lot grootte: ${lot}` : '',
    pnl    ? `P&L: ${pnl}` : '',
    rr     ? `R:R ratio: ${rr}` : '',
    edgeFields.edge_desc  ? `Trading edge beschrijving: ${edgeFields.edge_desc}` : '',
    edgeFields.edge_match ? `Voldoet aan edge regels: ${matchLabels[edgeFields.edge_match]||edgeFields.edge_match}` : '',
    edgeFields.edge_conf  ? `Vertrouwen in edge: ${confLabels[edgeFields.edge_conf]||edgeFields.edge_conf}` : '',
    notes  ? `Notities van de trader: ${notes}` : '',
  ].filter(Boolean).join('\n');

  const systemPrompt = `Je bent een ervaren forex trading coach die trade journal entries reviewt. Je geeft eerlijke, constructieve feedback gericht op het leren en verbeteren van de trader. Je bent niet sycofantisch — wees direct als er fouten zijn.

Geef je antwoord ALTIJD in dit vaste JSON formaat (geen markdown backticks):
{
  "score": <getal 1-10 voor kwaliteit van de trade uitvoering>,
  "edge_quality": <"strong" | "moderate" | "weak" | "none">,
  "samenvatting": "<2 zinnen over de trade>",
  "goed_gedaan": ["<concreet positief punt>", "<concreet positief punt>"],
  "verbeterpunten": ["<concreet verbeterpunt>", "<concreet verbeterpunt>"],
  "risico_review": "<beoordeling van SL/TP placement en R:R — is het correct geplaatst?>",
  "edge_review": "<was de edge sterk genoeg? had je meer confluence nodig?>",
  "les": "<de belangrijkste les uit deze specifieke trade in 1-2 zinnen>",
  "volgende_keer": "<1 concreet, actionable ding om volgende keer anders te doen>"
}`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1200,
        system: systemPrompt,
        messages: [{ role: 'user', content: `Review mijn trade:\n\n${tradeDetails}` }]
      })
    });

    if(!response.ok){
      const err = await response.json().catch(()=>({}));
      throw new Error(err?.error?.message || 'HTTP ' + response.status);
    }

    const data = await response.json();
    const raw  = data.content?.find(b => b.type === 'text')?.text || '';
    let review;
    try {
      review = JSON.parse(raw.replace(/```json|```/g,'').trim());
    } catch(e) {
      review = tryPartialParse(raw.replace(/```json|```/g,'').trim());
    }
    if(!review) throw new Error('Kon de review niet verwerken. Probeer opnieuw.');
    renderTradeReview(review, result_el);

  } catch(err) {
    if(result_el){
      result_el.innerHTML = `<div class="deep-tip red" style="margin-top:8px;"><span>✕</span><span>Fout: ${err.message}</span></div>`;
      result_el.style.display = 'block';
    }
  } finally {
    if(reviewBtn) reviewBtn.disabled = false;
    if(loading)   loading.style.display = 'none';
  }
}

async function reviewExistingTrade(id) {
  const t = trades.find(x => x.id === id);
  if(!t) return;

  const apiKey = $('anthropicApiKey')?.value.trim() || localStorage.getItem('fxAnthropicKey') || '';
  if(!apiKey){
    alert('Voer eerst je Anthropic API sleutel in via het "Setup & Backup" tabblad.');
    return;
  }

  const container = $('inline-review-' + id);
  if(!container) return;

  // Toggle: als review al zichtbaar is, verbergen
  if(container.style.display === 'block' && container.innerHTML){
    container.style.display = 'none';
    return;
  }

  // Loading state
  container.style.display = 'block';
  container.innerHTML = `<div style="display:flex;align-items:center;gap:8px;padding:8px 0;color:var(--muted);font-size:12px;"><div class="spinner" style="border-top-color:var(--purple);width:14px;height:14px;border-width:1.5px;"></div><span>AI analyseert trade...</span></div>`;

  const matchLabels = { yes:'Ja — trade zat binnen mijn edge', partial:'Deels — niet alle criteria gevuld', no:'Nee — trade buiten mijn edge' };
  const confLabels  = { high:'Hoog', medium:'Matig', low:'Laag' };

  const tradeDetails = [
    `Datum: ${t.date}`,
    `Pair: ${t.pair}`,
    `Richting: ${t.dir === 'long' ? 'LONG' : 'SHORT'}`,
    `Uitkomst: ${t.result}`,
    t.entry ? `Entry prijs: ${t.entry}` : '',
    t.sl    ? `Stop-loss: ${t.sl}` : '',
    t.tp    ? `Take profit: ${t.tp}` : '',
    t.lot   ? `Lot grootte: ${t.lot}` : '',
    t.pnl   ? `P&L: ${t.pnl}` : '',
    t.rr    ? `R:R ratio: ${t.rr}` : '',
    t.edge_desc  ? `Trading edge beschrijving: ${t.edge_desc}` : '',
    t.edge_match ? `Voldoet aan edge regels: ${matchLabels[t.edge_match]||t.edge_match}` : '',
    t.edge_conf  ? `Vertrouwen in edge: ${confLabels[t.edge_conf]||t.edge_conf}` : '',
    t.notes ? `Notities van de trader: ${t.notes}` : '',
  ].filter(Boolean).join('\n');

  const systemPrompt = `Je bent een ervaren forex trading coach die trade journal entries reviewt. Je geeft eerlijke, constructieve feedback gericht op het leren en verbeteren van de trader. Beoordeel ook of de trader zijn trading edge correct heeft toegepast — een trading edge is een meetbaar voordeel dat over een serie trades tot positieve verwachting (positive expectancy) leidt.

Geef je antwoord ALTIJD in dit vaste JSON formaat (geen markdown backticks):
{
  "score": <getal 1-10>,
  "edge_quality": <"strong"|"moderate"|"weak"|"none">,
  "samenvatting": "<2 zinnen>",
  "goed_gedaan": ["<punt>", "<punt>"],
  "verbeterpunten": ["<punt>", "<punt>"],
  "risico_review": "<SL/TP en R:R beoordeling>",
  "edge_review": "<was de edge aanwezig en correct toegepast? past dit binnen positive expectancy?>",
  "les": "<de belangrijkste les>",
  "volgende_keer": "<1 concreet actionable punt>"
}`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1200,
        system: systemPrompt,
        messages: [{ role: 'user', content: `Review deze trade:\n\n${tradeDetails}` }]
      })
    });

    if(!response.ok){
      const err = await response.json().catch(()=>({}));
      throw new Error(err?.error?.message || 'HTTP ' + response.status);
    }

    const data = await response.json();
    const raw  = data.content?.find(b => b.type === 'text')?.text || '';
    let review;
    try {
      review = JSON.parse(raw.replace(/```json|```/g,'').trim());
    } catch(e) {
      review = tryPartialParse(raw.replace(/```json|```/g,'').trim());
    }
    if(!review) throw new Error('Review kon niet verwerkt worden.');
    renderTradeReview(review, container);

  } catch(err) {
    container.innerHTML = `<div class="deep-tip red" style="margin:4px 0;"><span>✕</span><span>${err.message}</span></div>`;
  }
}

function renderTradeReview(r, container) {
  if(!container) return;
  const scoreColor = r.score >= 8 ? 'var(--green)' : r.score >= 5 ? 'var(--amber)' : 'var(--red)';
  const edgeClasses = { strong: 'edge-strong', moderate: 'edge-moderate', weak: 'edge-weak', none: 'edge-weak' };
  const edgeLabels  = { strong: 'Sterke edge', moderate: 'Matige edge', weak: 'Zwakke edge', none: 'Geen edge' };
  const edgeCls = edgeClasses[r.edge_quality] || 'edge-moderate';
  const edgeLbl = edgeLabels[r.edge_quality]  || r.edge_quality || '';

  let html = `
    <div class="review-score-row">
      <div class="review-score-circle" style="background:${scoreColor}22;border:2px solid ${scoreColor};color:${scoreColor};">${r.score ?? '?'}</div>
      <div>
        <div style="font-family:var(--font-head);font-weight:700;font-size:14px;color:${scoreColor};">${r.samenvatting || ''}</div>
        <div style="margin-top:5px;display:flex;gap:6px;flex-wrap:wrap;align-items:center;">
          <span class="review-edge-pill ${edgeCls}">${edgeLbl}</span>
          <span style="font-size:10px;color:var(--muted);">Uitvoering ${r.score}/10</span>
        </div>
      </div>
    </div>`;

  // Two columns: good + improvements
  html += `<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px;">`;
  if(r.goed_gedaan?.length){
    html += `<div class="review-block">
      <div class="review-block-title" style="color:var(--green);">✓ Goed gedaan</div>
      <ul>${r.goed_gedaan.map(g=>`<li><span style="color:var(--green);flex-shrink:0">✓</span><span>${g}</span></li>`).join('')}</ul>
    </div>`;
  }
  if(r.verbeterpunten?.length){
    html += `<div class="review-block">
      <div class="review-block-title" style="color:var(--amber);">⚠ Verbeterpunten</div>
      <ul>${r.verbeterpunten.map(v=>`<li><span style="color:var(--amber);flex-shrink:0">⚠</span><span>${v}</span></li>`).join('')}</ul>
    </div>`;
  }
  html += `</div>`;

  if(r.risico_review){
    html += `<div class="review-block" style="margin-bottom:8px;">
      <div class="review-block-title" style="color:var(--accent);">🛡 Risico & R:R</div>
      <div>${r.risico_review}</div>
    </div>`;
  }
  if(r.edge_review){
    html += `<div class="review-block" style="margin-bottom:8px;">
      <div class="review-block-title" style="color:var(--purple);">⚡ Edge kwaliteit</div>
      <div>${r.edge_review}</div>
    </div>`;
  }
  if(r.les || r.volgende_keer){
    html += `<div class="review-lesson">
      <div class="review-lesson-title">📌 Les uit deze trade</div>
      ${r.les ? `<div style="margin-bottom:${r.volgende_keer?'8':'0'}px;">${r.les}</div>` : ''}
      ${r.volgende_keer ? `<div style="padding:8px 12px;background:rgba(167,139,250,0.08);border-radius:6px;border-left:3px solid var(--purple);font-size:11px;color:var(--text);">
        <strong style="color:var(--purple);">Volgende keer:</strong> ${r.volgende_keer}
      </div>` : ''}
    </div>`;
  }

  container.innerHTML = html;
  container.style.display = 'block';
  container.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function renderTrades(){
  renderCalendar();
  const log=$('tradeLog');
  const filtered = getFilteredTrades();
  const total = trades.length;
  const fc = $('filterCount');
  if(fc) fc.textContent = total ? `${filtered.length} van ${total} trades` : '';
  if(!filtered.length){
    log.innerHTML='<div class="no-events">'+(total ? 'Geen trades gevonden met deze filters.' : 'Nog geen trades gelogd.')+'</div>';
    updateStats();return;
  }
  const equitySummary = fxAccounts.length ? (() => {
    const cards = fxAccounts.map(acc => {
      const bal = getAccountBalance(acc.id);
      if(!bal) return '';
      const pnlColor = bal.pnl >= 0 ? 'var(--green)' : 'var(--red)';
      const pnlSign = bal.pnl >= 0 ? '+' : '';
      return `<div style="background:var(--surface2);border:1px solid var(--border);border-radius:10px;padding:10px 14px;min-width:160px;">
        <div style="font-size:10px;color:var(--muted);font-family:var(--font-head);font-weight:700;margin-bottom:4px;">${acc.name}</div>
        <div style="font-size:15px;font-family:var(--font-head);font-weight:800;color:var(--text);">€${bal.current.toFixed(2)}</div>
        <div style="font-size:11px;color:${pnlColor};margin-top:2px;">${pnlSign}€${bal.pnl.toFixed(2)} P&L (${bal.trades} trades)</div>
      </div>`;
    }).filter(Boolean).join('');
    return cards ? `<div class="account-equity-summary" style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:14px;">${cards}</div>` : '';
  })() : '';
  log.innerHTML= equitySummary + filtered.map(t=>{
    const hasPrices = t.entry || t.sl || t.tp || t.lot;
    const priceLine = hasPrices ? `<div class="trade-levels">
      ${t.lot?`<span class="trade-lot">${t.lot} lot</span>`:''}
      ${t.entry?`<span class="trade-level-item">Entry <strong>${t.entry}</strong></span>`:''}
      ${t.sl?`<span class="trade-level-item" style="color:var(--red)">SL <strong style="color:var(--red)">${t.sl}</strong></span>`:''}
      ${t.tp?`<span class="trade-level-item" style="color:var(--green)">TP <strong style="color:var(--green)">${t.tp}</strong></span>`:''}
    </div>` : '';
    return `
    <div class="trade-entry" style="align-items:flex-start;gap:12px;">
      ${t.img?`<img class="trade-thumb" src="${t.img}" onclick="openLightbox('${t.id}')" title="Klik om te vergroten">`:''}
      <div style="display:flex;flex-direction:column;gap:5px;flex:1;min-width:0;">
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
          <span style="font-family:var(--font-head);font-weight:700;font-size:13px">${t.pair}</span>
          <span class="trade-tag tag-${t.dir}">${t.dir.toUpperCase()}</span>
          <span class="trade-tag tag-${t.result}">${t.result.toUpperCase()}</span>
          ${t.pnl?`<span style="font-weight:500;color:${t.pnl>0?'var(--green)':'var(--red)'}">${t.pnl>0?'+':''}€${t.pnl}</span>`:''}
          ${t.rr?`<span style="color:var(--muted);font-size:11px">R:R ${t.rr}</span>`:''}
        </div>
        <div class="trade-meta">${t.date}</div>
        ${priceLine}
        ${t.edge_match || t.edge_conf || t.edge_desc ? `<div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin-top:3px;">
          ${t.edge_match==='yes'?`<span class="trade-edge" style="background:rgba(46,204,138,0.12);color:var(--green);border-color:rgba(46,204,138,0.3);">✓ Edge</span>`:
            t.edge_match==='partial'?`<span class="trade-edge" style="background:rgba(245,166,35,0.12);color:var(--amber);border-color:rgba(245,166,35,0.3);">~ Deels edge</span>`:
            t.edge_match==='no'?`<span class="trade-edge" style="background:rgba(255,92,92,0.12);color:var(--red);border-color:rgba(255,92,92,0.3);">✕ Geen edge</span>`:''}
          ${t.edge_conf==='high'?`<span class="trade-edge">🟢 Hoog</span>`:t.edge_conf==='medium'?`<span class="trade-edge">🟡 Matig</span>`:t.edge_conf==='low'?`<span class="trade-edge">🔴 Laag</span>`:''}
          ${t.edge_desc?`<span style="font-size:11px;color:var(--muted);font-style:italic;max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${t.edge_desc.replace(/"/g,'&quot;')}">"${t.edge_desc.length>60?t.edge_desc.slice(0,60)+'…':t.edge_desc}"</span>`:''}
        </div>` : ''}
        ${t.notes?`<div class="trade-notes">"${t.notes}"</div>`:''}
        <!-- Inline AI review result for this trade -->
        <div id="inline-review-${t.id}" style="display:none;margin-top:8px;"></div>
      </div>
      <div class="trade-entry-actions" style="display:flex;flex-direction:column;gap:4px;flex-shrink:0;align-items:flex-end;">
        <button class="trade-edit" onclick="reviewExistingTrade(${t.id})" title="AI review van deze trade" style="color:var(--purple);border:none;background:none;cursor:pointer;font-size:12px;font-family:var(--font-head);font-weight:700;">🤖</button>
        <button class="trade-edit" onclick="openEditModal(${t.id})" title="Bewerken">✎ edit</button>
        <button class="trade-del" onclick="deleteTrade(${t.id})" title="Verwijderen">×</button>
      </div>
    </div>`;
  }).join('');
  updateStats();
}

// ---- LIGHTBOX ----
function openLightbox(tradeId){
  const t = trades.find(x=>x.id===parseInt(tradeId)||x.id===tradeId);
  if(!t || !t.img) return;
  $('imgLightboxSrc').src = t.img;
  $('imgLightbox').classList.add('show');
}
function closeLightbox(){ $('imgLightbox').classList.remove('show'); }
document.addEventListener('keydown', e=>{ if(e.key==='Escape'){ closeLightbox(); closeEditModal(); closeChartLightbox(); closeLearnModal(); } });

// ---- EDIT MODAL ----
let editImageBase64 = null;

function openEditModal(id){
  const t = trades.find(x=>x.id===id);
  if(!t) return;
  $('eId').value = t.id;
  $('eDate').value = t.date||'';
  $('eAccount').value = t.accountId||'';
  $('ePair').value = t.pair||'EUR/USD';
  $('eDir').value = t.dir||'long';
  $('eResult').value = t.result||'open';
  $('eEntry').value = t.entry||'';
  $('eLot').value = t.lot||'';
  $('eSL').value = t.sl||'';
  $('eTP').value = t.tp||'';
  $('ePnl').value = t.pnl||'';
  $('eRR').value = t.rr||'';
  $('eNotes').value = t.notes||'';
  setEdgeFields('e', t);
  editImageBase64 = t.img||null;
  const prev = $('ePreview');
  if(t.img){
    prev.src=t.img; prev.style.display='block';
    $('eDropzoneText').style.display='none';
    $('eImgName').textContent='Bestaande screenshot';
    $('eClearImg').style.display='inline';
  } else {
    prev.src=''; prev.style.display='none';
    $('eDropzoneText').style.display='block';
    $('eImgName').textContent='';
    $('eClearImg').style.display='none';
  }
  $('editModalOverlay').classList.add('show');
  document.body.style.overflow='hidden';
}

function closeEditModal(e){
  if(e && e.target !== $('editModalOverlay')) return;
  $('editModalOverlay').classList.remove('show');
  document.body.style.overflow='';
  editImageBase64 = null;
}

function handleEditImage(e){
  const file = e.target.files[0];
  if(!file) return;
  compressAndSetJournalImage(file, 'e');
}

function clearEditImage(){
  editImageBase64 = null;
  $('ePreview').src=''; $('ePreview').style.display='none';
  $('eDropzoneText').style.display='block';
  $('eChartFile').value='';
  $('eImgName').textContent='';
  $('eClearImg').style.display='none';
}

function saveEditTrade(){
  const id = parseInt($('eId').value);
  const idx = trades.findIndex(x=>x.id===id);
  if(idx === -1) return;
  trades[idx] = {
    ...trades[idx],
    date: $('eDate').value,
    accountId: $('eAccount').value,
    pair: $('ePair').value,
    dir: $('eDir').value,
    result: $('eResult').value,
    entry: parseFloat($('eEntry').value)||null,
    lot: parseFloat($('eLot').value)||null,
    sl: parseFloat($('eSL').value)||null,
    tp: parseFloat($('eTP').value)||null,
    pnl: parseFloat($('ePnl').value)||0,
    rr: parseFloat($('eRR').value)||0,
    ...getEdgeFields('e'),
    notes: $('eNotes').value.trim(),
    img: editImageBase64
  };
  saveTrades();
  renderTrades();
  $('editModalOverlay').classList.remove('show');
  document.body.style.overflow='';
  editImageBase64 = null;
}

function updateStats(){
  const closed=trades.filter(t=>t.result!=='open');
  const wins=closed.filter(t=>t.result==='win').length;
  const pnl=trades.reduce((s,t)=>s+(t.pnl||0),0);
  const rrTrades=trades.filter(t=>t.rr>0);
  const avgRR=rrTrades.length?rrTrades.reduce((s,t)=>s+t.rr,0)/rrTrades.length:0;
  $('sTotalTrades').textContent=trades.length;
  $('sWinrate').textContent=closed.length?Math.round(wins/closed.length*100)+'%':'0%';
  $('sWinrate').style.color=closed.length&&wins/closed.length>=0.5?'var(--green)':'var(--amber)';
  $('sPnL').textContent=(pnl>=0?'+':'')+'€'+pnl.toFixed(0);
  $('sPnL').style.color=pnl>0?'var(--green)':pnl<0?'var(--red)':'var(--muted)';
  $('sAvgRR').textContent=avgRR.toFixed(1);
}

function resetPage(page){
  document.querySelectorAll(`#page-${page} .check-item:not(.blocked)`).forEach(el=>{
    el.classList.remove('checked');
    el.querySelector('.checkbox').textContent='';
  });
  updateProgress();
}

// ---- WEEKEND & FRIDAY ----
function checkDayWarnings(){
  const dow = new Date().getDay();
  const h = new Date().getHours();
  // 0 = zondag, 6 = zaterdag, 5 = vrijdag
  if(dow === 0 || dow === 6){
    const overlay = $('weekendOverlay');
    if(overlay){ overlay.classList.add('show'); }
    if(dow === 0){
      const t = $('weekendTitle'); if(t) t.textContent = 'Zondag — Markt gesloten';
      const m = $('weekendMsg'); if(m) m.innerHTML = 'De forex markt is gesloten op zondag. EUR/USD opent zondagavond om ±22:00 Belgische tijd.<br><br>Gebruik deze dag om je week voor te bereiden, levels te markeren en je strategie te reviewen.';
    }
  }
  if(dow === 5){
    const fb = $('fridayBanner'); if(fb) fb.classList.add('show');
  }
  // Vrijdag na 21:00 ook de overlay tonen
  if(dow === 5 && h >= 21){
    const overlay = $('weekendOverlay');
    const t = $('weekendTitle'); if(t) t.textContent = 'Vrijdagavond — Markt sluit';
    const m = $('weekendMsg'); if(m) m.innerHTML = 'De forex markt sluit vanavond om 22:00. Zorg dat al je open trades gesloten zijn voor marktsluiting.<br><br>Geen nieuwe trades meer openen. Bereid je voor op volgende week.';
    if(overlay) overlay.classList.add('show');
  }
}
function dismissWeekend(){
  const o = $('weekendOverlay'); if(o) o.classList.remove('show');
}
checkDayWarnings();

// ---- AI CHART ANALYSE ----
let chartImageBase64 = null;
let _lastAnalyseDesc = '';       // bewaar originele beschrijving voor deep follow-up
let _lastAnalyseResult = null;   // bewaar eerste analyse resultaat

function handleImage(e){
  const file = e.target.files[0];
  if(!file) return;
  const reader = new FileReader();
  reader.onload = function(ev){
    chartImageBase64 = ev.target.result;
    const preview = $('chartPreview');
    preview.src = chartImageBase64;
    preview.style.display = 'block';
    $('dropzoneText').style.display = 'none';
  };
  reader.readAsDataURL(file);
}

// Drag & drop support
const dz = $('dropzone');
if(dz){
  dz.addEventListener('dragover', e => { e.preventDefault(); dz.classList.add('dragover'); });
  dz.addEventListener('dragleave', () => dz.classList.remove('dragover'));
  dz.addEventListener('drop', e => {
    e.preventDefault(); dz.classList.remove('dragover');
    const file = e.dataTransfer.files[0];
    if(file && file.type.startsWith('image/')){
      const fakeEvt = { target: { files: [file] } };
      handleImage(fakeEvt);
    }
  });
}

async function analyseTradeSetup(){
  const desc = $('aiDesc').value.trim();
  if(!desc){ alert('Beschrijf eerst je trade setup in het tekstveld.'); return; }

  const apiKey = $('anthropicApiKey')?.value.trim() || localStorage.getItem('fxAnthropicKey') || '';
  if(!apiKey){
    alert('Voer eerst je Anthropic API sleutel in het veld hierboven in.');
    return;
  }
  // Sla op voor volgende keer
  try{ localStorage.setItem('fxAnthropicKey', apiKey); }catch(e){}

  $('aiLoading').classList.add('show');
  $('analyseBtn').disabled = true;
  $('aiResultCard').style.display = 'none';
  $('aiPlaceholderCard').style.display = 'none';

  const hasImage = !!chartImageBase64;
  const systemPrompt = `Je bent een ervaren forex trading coach gespecialiseerd in price action en candlestick analyse. Je analyseert trade setups van studerende traders en geeft constructieve, eerlijke feedback in het Nederlands.

Je beoordeelt setups op basis van:
1. Confluence (meerdere bevestigingen: trend, S/R, price action, indicatoren)
2. Risicobeheer (SL/TP placement, R:R ratio)
3. Entry timing (sessie, marktcontext)
4. Patroon kwaliteit (welk signaal, hoe sterk)
5. Algemene discipline

${hasImage ? `ALS ER EEN CHART AFBEELDING IS MEEGESTUURD: Analyseer de candlesticks zorgvuldig. Identificeer:
- Welke specifieke candlestick patronen zichtbaar zijn (Hammer, Engulfing, Doji, Morning Star, Pin Bar, Inside Bar, Tweezer, etc.)
- Op welke candle(s) het patroon te zien is en of het zich op een belangrijk niveau bevindt
- Hoe bepalend elk patroon is voor de trade richting (bullish/bearish/neutraal)
- Of er confluence is tussen het candlepatroon en andere chart elementen (S/R, trend, EMA)
Vul het "candlesticks" veld in de JSON hieronder altijd in als er een afbeelding is.` : ''}

Geef je antwoord ALTIJD in dit vaste JSON formaat zonder markdown backticks:
{
  "score": <getal 1-10>,
  "verdict": <"GO" of "WAIT" of "SKIP">,
  "samenvatting": "<2 zinnen max>",
  "positief": ["<punt 1>", "<punt 2>"],
  "aandachtspunten": ["<punt 1>", "<punt 2>"],
  "risico": "<beoordeling van SL/TP en R:R>",
  "advies": "<concreet advies wat te doen of verbeteren>",
  "candlesticks": [
    { "naam": "<patroonnaam>", "type": "<bullish|bearish|neutraal>", "belang": "<hoog|matig|laag>", "uitleg": "<1 zin uitleg waarom dit patroon hier relevant is>" }
  ]
}`;

  const userContent = [];

  if(chartImageBase64){
    const base64Data = chartImageBase64.split(',')[1];
    const mimeType = chartImageBase64.split(';')[0].split(':')[1];
    userContent.push({ type: 'image', source: { type: 'base64', media_type: mimeType, data: base64Data } });
  }

  _lastAnalyseDesc = desc;  // bewaar voor deep follow-up
  userContent.push({ type: 'text', text: `Analyseer mijn EUR/USD trade setup:\n\n${desc}` });

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1000,
        system: systemPrompt,
        messages: [{ role: 'user', content: userContent }]
      })
    });

    if(!response.ok){
      const errData = await response.json().catch(()=>({}));
      const errMsg = errData?.error?.message || 'HTTP ' + response.status;
      renderAnalyseResult({ score: '!', verdict: 'ERROR', samenvatting: 'API fout: ' + errMsg, positief: [], aandachtspunten: [], risico: '', advies: 'Controleer je API sleutel in de instellingen van de Trade Analyse tab.' });
      return;
    }

    const data = await response.json();
    const raw = data.content?.find(b => b.type === 'text')?.text || '';

    let result;
    try {
      result = JSON.parse(raw.replace(/```json|```/g,'').trim());
    } catch(e) {
      result = { score: '?', verdict: 'WAIT', samenvatting: raw, positief: [], aandachtspunten: [], risico: '', advies: '' };
    }

    renderAnalyseResult(result);
  } catch(err) {
    renderAnalyseResult({ score: '!', verdict: 'ERROR', samenvatting: 'Verbindingsfout: ' + (err.message||err), positief: [], aandachtspunten: [], risico: '', advies: 'Controleer je API sleutel en internetverbinding.' });
  } finally {
    $('aiLoading').classList.remove('show');
    $('analyseBtn').disabled = false;
  }
}

function renderAnalyseResult(r){
  const scoreColors = { GO: 'var(--green)', WAIT: 'var(--amber)', SKIP: 'var(--red)', ERROR: 'var(--muted)' };
  const verdictLabels = { GO: 'Trade plaatsen', WAIT: 'Wacht op betere setup', SKIP: 'Sla deze trade over', ERROR: 'Fout opgetreden' };
  const color = scoreColors[r.verdict] || 'var(--muted)';

  $('aiScore').textContent = r.score;
  $('aiScore').style.color = color;
  $('aiVerdictLabel').textContent = verdictLabels[r.verdict] || r.verdict;
  $('aiVerdictLabel').style.color = color;

  let html = '';
  if(r.samenvatting){
    html += `<div class="ai-section"><div class="ai-section-title" style="color:var(--muted)">Samenvatting</div><div style="font-size:13px;line-height:1.6;">${r.samenvatting}</div></div>`;
  }
  if(r.positief?.length){
    html += `<div class="ai-section"><div class="ai-section-title" style="color:var(--green)">Wat goed is</div><ul style="list-style:none;display:flex;flex-direction:column;gap:5px;">${r.positief.map(p=>`<li style="display:flex;gap:8px;font-size:12px;"><span style="color:var(--green)">✓</span>${p}</li>`).join('')}</ul></div>`;
  }
  if(r.aandachtspunten?.length){
    html += `<div class="ai-section"><div class="ai-section-title" style="color:var(--amber)">Aandachtspunten</div><ul style="list-style:none;display:flex;flex-direction:column;gap:5px;">${r.aandachtspunten.map(p=>`<li style="display:flex;gap:8px;font-size:12px;"><span style="color:var(--amber)">⚠</span>${p}</li>`).join('')}</ul></div>`;
  }
  if(r.risico){
    html += `<div class="ai-section"><div class="ai-section-title" style="color:var(--accent)">Risicobeheer</div><div style="font-size:12px;line-height:1.6;">${r.risico}</div></div>`;
  }
  if(r.advies){
    html += `<div class="ai-section" style="padding:12px;background:rgba(79,158,255,0.06);border-radius:8px;border:1px solid rgba(79,158,255,0.2);"><div class="ai-section-title" style="color:var(--accent)">Advies</div><div style="font-size:12px;line-height:1.6;">${r.advies}</div></div>`;
  }
  if(r.candlesticks?.length){
    const belColor = { hoog:'var(--green)', matig:'var(--amber)', laag:'var(--muted)' };
    const typeIcon = { bullish:'🟢', bearish:'🔴', neutraal:'⚪' };
    const cards = r.candlesticks.map(c => {
      const col = belColor[c.belang] || 'var(--muted)';
      const ico = typeIcon[c.type] || '⚪';
      // Link naar learn tab als patroon matcht
      const matchId = CANDLE_DATA.find(d =>
        d.NL?.name?.toLowerCase().includes(c.naam?.toLowerCase()) ||
        c.naam?.toLowerCase().includes(d.NL?.name?.toLowerCase())
      )?.id;
      const link = matchId
        ? `<span onclick="showTabByName('leren');setTimeout(()=>{setLearnCat('candlesticks',document.querySelector('[data-cat=candlesticks]'));setTimeout(()=>{const el=document.getElementById('cc-${matchId}');if(el){el.scrollIntoView({behavior:'smooth',block:'center'});}},200);},200);" style="color:var(--accent);cursor:pointer;font-size:10px;text-decoration:underline;">📖 bekijk patroon</span>`
        : '';
      return `<div style="background:var(--surface2);border:1px solid var(--border);border-radius:8px;padding:10px 12px;display:flex;flex-direction:column;gap:3px;">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;">
          <span style="font-family:var(--font-head);font-weight:700;font-size:12px;">${ico} ${c.naam}</span>
          <span style="font-size:10px;font-family:var(--font-head);font-weight:700;color:${col};letter-spacing:0.5px;text-transform:uppercase;">${c.belang}</span>
        </div>
        <div style="font-size:11px;color:var(--muted);line-height:1.5;">${c.uitleg}</div>
        ${link}
      </div>`;
    }).join('');
    html += `<div class="ai-section"><div class="ai-section-title" style="color:var(--purple)">🕯 Herkende candlestick patronen</div><div style="display:flex;flex-direction:column;gap:8px;">${cards}</div></div>`;
  }

  $('aiResponseContent').innerHTML = html;
  $('aiResultCard').style.display = 'block';

  // Bewaar resultaat en toon "Meer uitleg" knop (niet bij ERROR)
  _lastAnalyseResult = r;
  const deepSec = $('aiDeepSection');
  const deepContent = $('aiDeepContent');
  const deepLoading = $('aiDeepLoading');
  const deepBtn = $('deeperBtn');
  if(deepSec){
    deepSec.style.display = (r.verdict === 'ERROR') ? 'none' : 'block';
  }
  // Reset deep sectie bij nieuwe analyse
  if(deepContent){ deepContent.style.display = 'none'; deepContent.innerHTML = ''; }
  if(deepLoading){ deepLoading.style.display = 'none'; }
  if(deepBtn){ deepBtn.style.display = 'inline-flex'; deepBtn.disabled = false; deepBtn.textContent = 'Meer uitleg & voorbeelden'; }
}

function clearAnalyse(){
  chartImageBase64 = null;
  _lastAnalyseDesc = '';
  _lastAnalyseResult = null;
  const preview = $('chartPreview'); if(preview){ preview.src=''; preview.style.display='none'; }
  const dt = $('dropzoneText'); if(dt) dt.style.display='block';
  const fi = $('chartFile'); if(fi) fi.value='';
  const desc = $('aiDesc'); if(desc) desc.value='';
  $('aiResultCard').style.display='none';
  $('aiPlaceholderCard').style.display='block';
}

async function deeperExplanation(){
  if(!_lastAnalyseDesc && !_lastAnalyseResult){
    alert('Voer eerst een analyse uit.'); return;
  }
  const apiKey = $('anthropicApiKey')?.value.trim() || localStorage.getItem('fxAnthropicKey') || '';
  if(!apiKey){ alert('Voer eerst je Anthropic API sleutel in.'); return; }

  const deepBtn = $('deeperBtn');
  const deepLoading = $('aiDeepLoading');
  const deepContent = $('aiDeepContent');
  if(deepBtn){ deepBtn.disabled = true; deepBtn.textContent = 'Bezig...'; }
  if(deepLoading){ deepLoading.style.display = 'flex'; }
  if(deepContent){ deepContent.style.display = 'none'; }

  // Bouw context op uit eerste analyse
  const r = _lastAnalyseResult || {};
  const contextSummary = [
    r.verdict ? `Verdict: ${r.verdict} (score ${r.score}/10)` : '',
    r.samenvatting ? `Samenvatting: ${r.samenvatting}` : '',
    r.advies ? `Advies: ${r.advies}` : '',
    (r.aandachtspunten||[]).length ? `Aandachtspunten: ${r.aandachtspunten.join('; ')}` : '',
  ].filter(Boolean).join('\n');

  const systemPrompt = `Je bent een ervaren forex trading coach die traders leert hoe ze setups stap voor stap kunnen herkennen en timen. Je geeft diepgaande maar BEKNOPTE educatieve uitleg met concrete candle-voorbeelden. Houd stap-beschrijvingen kort (max 3 zinnen), voorbeelden concreet en tips scherp. Maximaal 5 stappen.

Je antwoordt ALTIJD in dit vaste JSON formaat (geen markdown backticks):
{
  "patroon_uitleg": {
    "titel": "<naam van het patroon/setup>",
    "beschrijving": "<2-3 zinnen over waarom dit patroon werkt>",
    "candle_voorbeeld": "<ASCII art candle visualisatie van het ideale patroon, gebruik | voor wick, # voor body, gebruik meerdere regels>"
  },
  "stappen": [
    {
      "stap": 1,
      "titel": "<staptitel>",
      "beschrijving": "<wat je concreet moet zien of doen>",
      "voorbeeld": "<concreet voorbeeld met prijsniveaus uit de setup>",
      "tip_type": "<'green'|'amber'|'blue'|'red'>",
      "tip": "<praktische tip of waarschuwing>"
    }
  ],
  "trend_herkenning": {
    "beschrijving": "<hoe je de trend leest voor deze setup>",
    "signalen_long": ["<signaal 1>", "<signaal 2>", "<signaal 3>"],
    "signalen_short": ["<signaal 1>", "<signaal 2>", "<signaal 3>"],
    "candle_trend": "<ASCII visualisatie van trend structuur>"
  },
  "entry_timing": {
    "beste_moment": "<wanneer precies in te stappen>",
    "wachten_op": ["<bevestiging 1>", "<bevestiging 2>"],
    "te_vroeg": "<hoe te vroeg instappen eruitziet>",
    "te_laat": "<hoe te laat instappen eruitziet>"
  },
  "veelgemaakte_fouten": ["<fout 1>", "<fout 2>", "<fout 3>"]
}

Geef minimaal 4 stappen. Maak candle-ASCII art met | voor wicks en duidelijke body-symbolen zoals [  ] of [##]. Gebruik Nederlandse termen.`;

  const userMsg = `Geef stap-voor-stap uitleg voor mijn trade setup:

ORIGINELE SETUP:
${_lastAnalyseDesc}

EERSTE ANALYSE RESULTAAT:
${contextSummary}

Geef nu diepgaande uitleg met:
- Hoe het patroon er precies uitziet op de chart (met ASCII candle voorbeelden)
- Stap-voor-stap hoe ik de ideale entry herken en time
- Hoe ik de trend lees op hogere timeframes
- Wanneer precies in te stappen (niet te vroeg, niet te laat)
- De meest gemaakte fouten bij dit type setup`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 4096,
        system: systemPrompt,
        messages: [{ role: 'user', content: userMsg }]
      })
    });

    if(!response.ok){
      const errData = await response.json().catch(()=>({}));
      throw new Error(errData?.error?.message || 'HTTP ' + response.status);
    }

    const data = await response.json();
    const raw = data.content?.find(b => b.type === 'text')?.text || '';

    let result;
    const cleaned = raw.replace(/```json|```/g,'').trim();
    try {
      result = JSON.parse(cleaned);
    } catch(e) {
      // JSON afgekapt of ongeldig — probeer partial parse te redden
      result = tryPartialParse(cleaned);
      if(!result) {
        if(deepContent){
          deepContent.innerHTML = `
            <div class="deep-tip amber" style="margin-bottom:12px;">
              <span>⚠</span>
              <span>De uitleg was te lang en werd afgekapt. Probeer het opnieuw — de volgende poging geeft een kortere, complete versie.</span>
            </div>
            <div style="text-align:center;">
              <button onclick="deeperExplanation()" style="padding:9px 18px;border-radius:8px;font-family:var(--font-head);font-weight:700;font-size:12px;cursor:pointer;border:1px solid var(--purple);background:rgba(167,139,250,0.1);color:var(--purple);">↻ Opnieuw proberen</button>
            </div>`;
          deepContent.style.display = 'block';
        }
        return;
      }
    }
    renderDeeperResult(result);

  } catch(err){
    if(deepContent){
      deepContent.innerHTML = `<div class="deep-tip red"><span>✕</span><span>Fout: ${err.message}. Controleer je API sleutel.</span></div>`;
      deepContent.style.display = 'block';
    }
  } finally {
    if(deepLoading){ deepLoading.style.display = 'none'; }
    if(deepBtn){ deepBtn.disabled = false; deepBtn.textContent = '↻ Opnieuw genereren'; }
  }
}

// Probeert een afgekapte JSON zo veel mogelijk te redden
function tryPartialParse(raw) {
  try {
    // Probeer ontbrekende haakjes toe te voegen
    let s = raw;
    const openBraces   = (s.match(/\{/g)||[]).length;
    const closeBraces  = (s.match(/\}/g)||[]).length;
    const openBrackets = (s.match(/\[/g)||[]).length;
    const closeBrackets= (s.match(/\]/g)||[]).length;
    // Sluit openstaande string als de laatste char geen " is
    if((s.match(/"/g)||[]).length % 2 !== 0) s += '"';
    // Sluit openstaande arrays en objecten
    for(let i=0; i<openBrackets - closeBrackets; i++) s += ']';
    for(let i=0; i<openBraces - closeBraces;   i++) s += '}';
    const parsed = JSON.parse(s);
    return (typeof parsed === 'object' && parsed !== null) ? parsed : null;
  } catch(e) {
    return null;
  }
}

function renderDeeperResult(r){
  const deepContent = $('aiDeepContent');
  if(!deepContent) return;
  let html = '';

  // ── Patroon uitleg ──
  if(r.patroon_uitleg){
    const p = r.patroon_uitleg;
    html += `<div class="deep-step">
      <div class="deep-step-header">
        <div class="deep-step-num" style="background:var(--purple)">📊</div>
        <div class="deep-step-title">${p.titel || 'Patroon uitleg'}</div>
      </div>
      <div class="deep-step-body">
        <p style="margin-bottom:10px;">${p.beschrijving || ''}</p>
        ${p.candle_voorbeeld ? `<div class="deep-section-label">Ideaal candle patroon</div><div class="deep-candle-block">${escapeHtml(p.candle_voorbeeld)}</div>` : ''}
      </div>
    </div>`;
  }

  // ── Stap-voor-stap ──
  if(r.stappen?.length){
    html += `<div class="deep-section-label" style="margin-top:4px;">Stap-voor-stap entry plan</div>`;
    html += r.stappen.map(s => `
      <div class="deep-step">
        <div class="deep-step-header">
          <div class="deep-step-num">${s.stap}</div>
          <div class="deep-step-title">${s.titel || ''}</div>
        </div>
        <div class="deep-step-body">
          <p>${s.beschrijving || ''}</p>
          ${s.voorbeeld ? `<div style="margin:8px 0;padding:8px 12px;background:var(--bg);border-radius:6px;border-left:3px solid var(--purple);font-size:11px;color:var(--muted);line-height:1.6;"><strong style="color:var(--text);">Voorbeeld:</strong> ${s.voorbeeld}</div>` : ''}
          ${s.tip ? `<div class="deep-tip ${s.tip_type||'blue'}"><span style="flex-shrink:0;">${s.tip_type==='green'?'✓':s.tip_type==='red'?'✕':s.tip_type==='amber'?'⚠':'→'}</span><span>${s.tip}</span></div>` : ''}
        </div>
      </div>`).join('');
  }

  // ── Trend herkenning ──
  if(r.trend_herkenning){
    const t = r.trend_herkenning;
    html += `<div class="deep-step">
      <div class="deep-step-header">
        <div class="deep-step-num" style="background:var(--accent)">📈</div>
        <div class="deep-step-title">Trend herkenning</div>
      </div>
      <div class="deep-step-body">
        <p style="margin-bottom:10px;">${t.beschrijving || ''}</p>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px;">
          ${t.signalen_long?.length ? `<div>
            <div class="deep-section-label" style="color:var(--green)">Long signalen</div>
            <ul>${t.signalen_long.map(s=>`<li><span style="color:var(--green);">↑</span> ${s}</li>`).join('')}</ul>
          </div>` : ''}
          ${t.signalen_short?.length ? `<div>
            <div class="deep-section-label" style="color:var(--red)">Short signalen</div>
            <ul>${t.signalen_short.map(s=>`<li><span style="color:var(--red);">↓</span> ${s}</li>`).join('')}</ul>
          </div>` : ''}
        </div>
        ${t.candle_trend ? `<div class="deep-section-label">Trend structuur</div><div class="deep-candle-block">${escapeHtml(t.candle_trend)}</div>` : ''}
      </div>
    </div>`;
  }

  // ── Entry timing ──
  if(r.entry_timing){
    const e = r.entry_timing;
    html += `<div class="deep-step">
      <div class="deep-step-header">
        <div class="deep-step-num" style="background:var(--green)">⏱</div>
        <div class="deep-step-title">Entry timing</div>
      </div>
      <div class="deep-step-body">
        <div class="deep-tip green"><span>✓</span><span><strong>Beste moment:</strong> ${e.beste_moment || ''}</span></div>
        ${e.wachten_op?.length ? `<div style="margin-top:10px;"><div class="deep-section-label">Wacht op bevestiging van</div><ul>${e.wachten_op.map(w=>`<li><span style="color:var(--accent);">→</span> ${w}</li>`).join('')}</ul></div>` : ''}
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:10px;">
          ${e.te_vroeg ? `<div class="deep-tip amber"><span>⚠</span><span><strong>Te vroeg:</strong> ${e.te_vroeg}</span></div>` : ''}
          ${e.te_laat ? `<div class="deep-tip red"><span>✕</span><span><strong>Te laat:</strong> ${e.te_laat}</span></div>` : ''}
        </div>
      </div>
    </div>`;
  }

  // ── Veelgemaakte fouten ──
  if(r.veelgemaakte_fouten?.length){
    html += `<div class="deep-step" style="border-color:rgba(255,92,92,0.25);background:rgba(255,92,92,0.04);">
      <div class="deep-step-header">
        <div class="deep-step-num" style="background:var(--red)">✕</div>
        <div class="deep-step-title" style="color:var(--red)">Veelgemaakte fouten</div>
      </div>
      <div class="deep-step-body">
        <ul>${r.veelgemaakte_fouten.map(f=>`<li><span style="color:var(--red);">✕</span> ${f}</li>`).join('')}</ul>
      </div>
    </div>`;
  }

  deepContent.innerHTML = html;
  deepContent.style.display = 'block';
  // Scroll naar deep sectie
  deepContent.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function escapeHtml(str){
  return (str||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// ---- TRADINGVIEW WIDGET ----
let currentTVInterval = 'W';
let tvMode = 'default';

function loadTVSettings(){
  try {
    const saved = JSON.parse(localStorage.getItem('fxTVSettings')||'{}');
    if(saved.mode){ tvMode = saved.mode; const r = $(tvMode==='personal'?'modePersonal':'modeDefault'); if(r) r.checked=true; }
    if(saved.personalUrl && $('personalTVUrl')) $('personalTVUrl').value = saved.personalUrl;
    if(saved.openTabUrl && $('openTabUrl')) $('openTabUrl').value = saved.openTabUrl;
  } catch(e){}
}

function saveTVUrl(){
  try {
    const saved = JSON.parse(localStorage.getItem('fxTVSettings')||'{}');
    saved.personalUrl = $('personalTVUrl').value;
    localStorage.setItem('fxTVSettings', JSON.stringify(saved));
  } catch(e){}
}

function saveTabUrl(){
  try {
    const saved = JSON.parse(localStorage.getItem('fxTVSettings')||'{}');
    saved.openTabUrl = $('openTabUrl').value;
    localStorage.setItem('fxTVSettings', JSON.stringify(saved));
  } catch(e){}
}

function switchTVMode(){
  const personal = $('modePersonal');
  tvMode = personal && personal.checked ? 'personal' : 'default';
  try {
    const saved = JSON.parse(localStorage.getItem('fxTVSettings')||'{}');
    saved.mode = tvMode;
    localStorage.setItem('fxTVSettings', JSON.stringify(saved));
  } catch(e){}
  buildTVWidget(currentTVInterval);
}

function applyPersonalUrl(){
  tvMode = 'personal';
  const r = $('modePersonal'); if(r) r.checked = true;
  switchTVMode();
}

function toggleTVSettings(){
  const p = $('tvSettingsPanel');
  if(p) p.style.display = p.style.display==='none' ? 'block' : 'none';
}

function openTVTab(){
  try {
    const saved = JSON.parse(localStorage.getItem('fxTVSettings')||'{}');
    const url = (saved.openTabUrl && saved.openTabUrl.trim()) ||
                'https://www.tradingview.com/chart/?symbol=FX%3AEURUSD';
    window.open(url, '_blank');
  } catch(e){
    window.open('https://www.tradingview.com/chart/?symbol=FX%3AEURUSD', '_blank');
  }
}

function buildTVWidget(interval){
  const container = $('tvWidgetContainer');
  if(!container) return;
  container.innerHTML = '';

  // Optie B: persoonlijke gepubliceerde layout via iframe
  if(tvMode === 'personal'){
    try {
      const saved = JSON.parse(localStorage.getItem('fxTVSettings')||'{}');
      const url = saved.personalUrl && saved.personalUrl.trim();
      if(url){
        // Bouw embed URL: voeg /embed/ toe indien nodig
        let embedUrl = url;
        if(embedUrl.includes('tradingview.com/chart/') && !embedUrl.includes('/embed')){
          embedUrl = embedUrl.replace('tradingview.com/chart/', 'tradingview.com/chart/embed/');
        }
        if(!embedUrl.includes('?')) embedUrl += '?';
        embedUrl += '&theme=dark&style=1&timezone=Europe%2FBrussels';
        const iframe = document.createElement('iframe');
        iframe.src = embedUrl;
        iframe.style.cssText = 'width:100%;height:480px;border:none;';
        iframe.allow = 'fullscreen';
        container.appendChild(iframe);

        // Info banner onder iframe
        const info = document.createElement('div');
        info.style.cssText = 'padding:8px 16px;font-size:11px;color:var(--muted);background:rgba(167,139,250,0.06);border-top:1px solid rgba(167,139,250,0.2);display:flex;gap:8px;align-items:center;';
        info.innerHTML = '<span style="color:var(--purple)">★</span> Jouw persoonlijke TradingView layout is geladen. Als de chart niet zichtbaar is: controleer of de layout gepubliceerd is op TradingView (Share → Publish).';
        container.appendChild(info);
        return;
      }
    } catch(e){}
    // Fallback: toon instructie als URL leeg is
    container.innerHTML = `<div style="height:480px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;padding:24px;text-align:center;">
      <div style="font-size:36px;opacity:0.3">📊</div>
      <div style="font-family:var(--font-head);font-weight:700;font-size:15px;color:var(--text)">Geen persoonlijke URL ingesteld</div>
      <div style="font-size:12px;color:var(--muted);max-width:400px;line-height:1.6;">Klik op <strong style="color:var(--text)">Instellingen</strong> hierboven en vul je gepubliceerde TradingView chart-URL in onder Optie B.</div>
      <button class="save-btn" onclick="toggleTVSettings()" style="margin-top:8px;">Instellingen openen</button>
    </div>`;
    return;
  }

  // Optie A: standaard TradingView embed widget
  const script = document.createElement('script');
  script.type = 'text/javascript';
  script.src = 'https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js';
  script.async = true;
  script.innerHTML = JSON.stringify({
    autosize: true,
    symbol: INSTRUMENTS[activeInstrument]?.tv || 'FX:EURUSD',
    interval: interval,
    timezone: 'Europe/Brussels',
    theme: 'dark',
    style: '1',
    locale: 'nl',
    backgroundColor: '#141720',
    gridColor: '#2a2f42',
    hide_top_toolbar: false,
    hide_legend: false,
    allow_symbol_change: false,
    save_image: false,
    studies: ['MASimple@tv-scriptpak!20','MASimple@tv-scriptpak!50','RSI@tv-scriptpak!'],
    support_host: 'https://www.tradingview.com'
  });
  const widgetDiv = document.createElement('div');
  widgetDiv.className = 'tradingview-widget-container';
  widgetDiv.style.cssText = 'height:480px;width:100%;';
  const innerDiv = document.createElement('div');
  innerDiv.className = 'tradingview-widget-container__widget';
  innerDiv.style.cssText = 'height:100%;width:100%;';
  widgetDiv.appendChild(innerDiv);
  widgetDiv.appendChild(script);
  container.appendChild(widgetDiv);
}

function setTVInterval(interval, btn){
  document.querySelectorAll('[id^="tvBtn-"]').forEach(b=>b.classList.remove('active'));
  if(btn) btn.classList.add('active');
  currentTVInterval = interval;
  // In persoonlijke modus kan interval niet programmatisch worden gewijzigd
  if(tvMode === 'personal'){
    const info = document.createElement('div');
    return; // iframe interval is niet aanpasbaar
  }
  buildTVWidget(interval);
  if(interval==='W'){ const b=document.querySelector('.tf-btn[onclick*="weekly"]'); if(b) setMarktTF('weekly',b); }
  else if(interval==='D'||interval==='240'){ const b=document.querySelector('.tf-btn[onclick*="daily"]'); if(b) setMarktTF('daily',b); }
}

// ---- MARKT ANALYSE ----
function setMarktTF(tf, btn){
  document.querySelectorAll('.tf-tabs .tf-btn').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
  ['weekly','daily','bias','scanner'].forEach(t=>{ const el=$('markt-'+t); if(el) el.style.display = t===tf?'block':'none'; });
  if(tf === 'scanner') updateScanLevelsSummary();
}

function updateScanLevelsSummary(){
  const get = id => parseFloat($(id)?.value) || null;
  const wH = get('wHigh'), wL = get('wLow'), wO = get('wOpen'), wC = get('wClose');
  const dH = get('dHigh'), dL = get('dLow'), dC = get('dClose');
  const wMid = wH && wL ? ((wH + wL) / 2).toFixed(5) : '—';
  const fmt5 = v => v ? parseFloat(v).toFixed(5) : '—';
  $('sl-wHigh').textContent = fmt5(wH);
  $('sl-wLow').textContent  = fmt5(wL);
  $('sl-wMid').textContent  = wMid;
  $('sl-dHigh').textContent = fmt5(dH);
  $('sl-dLow').textContent  = fmt5(dL);
  $('sl-dClose').textContent= fmt5(dC);
  // Sync paar met actief instrument
  const sel = $('scanPair');
  if(sel && activeInstrument && INSTRUMENTS[activeInstrument]){
    const label = INSTRUMENTS[activeInstrument].label;
    for(let i=0;i<sel.options.length;i++){ if(sel.options[i].value===label||sel.options[i].text===label){ sel.selectedIndex=i; break; } }
  }
}

async function runMarketScan(){
  const apiKey = $('anthropicApiKey')?.value.trim() || localStorage.getItem('fxAnthropicKey') || '';
  if(!apiKey){ alert('Voer eerst je Anthropic API sleutel in via het "Setup & Backup" tabblad.'); return; }

  const pair    = $('scanPair')?.value || 'EUR/USD';
  const price   = $('scanCurrentPrice')?.value || '?';
  const context = $('scanContext')?.value.trim() || '';

  const wH = $('wHigh')?.value, wL = $('wLow')?.value, wO = $('wOpen')?.value, wC = $('wClose')?.value;
  const dH = $('dHigh')?.value, dL = $('dLow')?.value, dO = $('dOpen')?.value, dC = $('dClose')?.value;
  const wMid = wH && wL ? ((parseFloat(wH)+parseFloat(wL))/2).toFixed(5) : null;

  const levelsText = [
    wH ? `Vorige Weekly High: ${wH}` : null,
    wL ? `Vorige Weekly Low: ${wL}` : null,
    wO ? `Vorige Weekly Open: ${wO}` : null,
    wC ? `Vorige Weekly Close: ${wC}` : null,
    wMid ? `Weekly Midpoint: ${wMid}` : null,
    dH ? `Vorige Daily High (PDH): ${dH}` : null,
    dL ? `Vorige Daily Low (PDL): ${dL}` : null,
    dO ? `Vorige Daily Open: ${dO}` : null,
    dC ? `Vorige Daily Close: ${dC}` : null,
  ].filter(Boolean).join('\n');

  const today = new Date().toLocaleDateString('nl-BE',{weekday:'long',year:'numeric',month:'long',day:'numeric'});

  const userMsg = `Valutapaar: ${pair}
Datum vandaag: ${today}
Huidige prijs: ${price}

INGEVOERDE LEVELS:
${levelsText || '(geen levels ingevoerd)'}

${context ? `EXTRA CONTEXT VAN DE TRADER:\n${context}` : ''}`;

  const systemPrompt = `Je bent een ervaren forex marktanalist gespecialiseerd in technische analyse en dagelijkse marktvoorbereiding. Je geeft een gestructureerde dagelijkse marktanalyse op basis van de ingevoerde OHLC-levels en huidige prijs. Je spreekt altijd in het Nederlands.

STRUCTUUR VAN JE ANTWOORD (gebruik exact deze koppen met emoji):

## 📊 Dagelijkse Bias
Geef een duidelijke bias: BULLISH / BEARISH / NEUTRAAL. Leg in 2-3 zinnen uit waarom, gebaseerd op de positie van de huidige prijs t.o.v. de ingevoerde levels (weekly midpoint, PDH/PDL, weekly high/low).

## 🎯 Key Levels vandaag
Som de 4-6 belangrijkste levels op die je vandaag in de gaten houdt. Geef bij elk level aan of het support of resistance is en waarom het relevant is. Formaat:
- **1.XXXXX** — [type] — [reden]

## 📋 Scenario A — Bullish
Beschrijf concreet wat er moet gebeuren voor een long setup: welk level moet breken of houden, waar zou je een entry zoeken, wat is een logisch target. Max 4 zinnen.

## 📋 Scenario B — Bearish
Zelfde maar voor een short setup. Max 4 zinnen.

## ⚠️ Wanneer niets doen
Beschrijf de invalidatiescenario's: wanneer is de marktstructuur onduidelijk en is het beter om te wachten.

## 📰 Nieuwsimpact inschatting
BELANGRIJK: Dit is GEEN live nieuwsfeed. Gebaseerd op je trainingskennis: welke terugkerende economische events hebben typisch grote impact op ${pair}? Denk aan NFP, CPI, FOMC, ECB, BoE meetings, Retail Sales etc. Vermeld welke events typisch op welke dag van de week/maand vallen. Sluit altijd af met: "⚠️ Verifieer actuele events op Forex Factory of Investing.com."

## 💡 Trader tip
Één concrete, actionable tip voor vandaag specifiek voor dit paar en deze marktcontext.

TOON: Professioneel maar direct. Wees eerlijk als de marktstructuur onduidelijk is. Geen vage uitspraken. Geef concrete prijsniveaus waar mogelijk.`;

  const btn = $('scanBtn');
  const loading = $('scanLoading');
  const resultCard = $('scanResultCard');
  const placeholder = $('scanPlaceholderCard');

  btn.disabled = true;
  if(loading) { loading.style.display = 'flex'; }

  try {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1800,
        system: systemPrompt,
        messages: [{ role: 'user', content: userMsg }]
      })
    });

    if(!resp.ok){ const e = await resp.json(); throw new Error(e?.error?.message || resp.status); }
    const data = await resp.json();
    const text = data.content?.[0]?.text || '';

    if(loading) loading.style.display = 'none';
    btn.disabled = false;

    if(placeholder) placeholder.style.display = 'none';
    if(resultCard) resultCard.style.display = 'block';

    $('scanResultContent').innerHTML = renderScanResult(text, pair, price, today);

  } catch(err) {
    if(loading) loading.style.display = 'none';
    btn.disabled = false;
    if(resultCard) resultCard.style.display = 'block';
    if(placeholder) placeholder.style.display = 'none';
    $('scanResultContent').innerHTML = `<div style="color:var(--red);font-size:13px;padding:10px;">❌ Fout: ${err.message}</div>`;
  }
}

function renderScanResult(text, pair, price, date){
  let html = renderMarkdownResult(text);
  return `
    <div style="padding:10px 12px;background:rgba(167,139,250,0.07);border:1px solid rgba(167,139,250,0.25);border-radius:8px;margin-bottom:14px;display:flex;gap:12px;align-items:center;flex-wrap:wrap;">
      <span style="font-family:var(--font-head);font-weight:800;font-size:15px;color:var(--purple);">${pair}</span>
      <span style="font-size:12px;color:var(--muted);">Prijs: <strong style="color:var(--text)">${price}</strong></span>
      <span style="font-size:11px;color:var(--muted);">${date}</span>
    </div>
    <div style="font-size:12px;color:var(--text);line-height:1.8;">${html}</div>
    <div style="margin-top:14px;padding:10px 12px;background:rgba(245,166,35,0.06);border-radius:8px;border-left:3px solid var(--amber);font-size:11px;color:var(--muted);">
      ⚠️ Dit is een AI-indicatie op basis van ingevoerde data — geen handelssignaal. Nieuwsdata is niet live. Verifieer altijd op Forex Factory.
    </div>`;
}

function clearScanResult(){
  const rc = $('scanResultCard'), ph = $('scanPlaceholderCard');
  if(rc) rc.style.display = 'none';
  if(ph) ph.style.display = 'block';
  if($('scanCurrentPrice')) $('scanCurrentPrice').value = '';
  if($('scanContext')) $('scanContext').value = '';
}

// ================================================================
// ANALYSE MODE TOGGLE
// ================================================================
function setAnalyseMode(mode, btn){
  document.querySelectorAll('#page-analyse .tf-tabs .tf-btn').forEach(b=>b.classList.remove('active'));
  if(btn) btn.classList.add('active');
  ['setup','pattern'].forEach(m=>{
    const el = $('analyseMode-'+m);
    if(el) el.style.display = m===mode ? 'block' : 'none';
  });
}

// ================================================================
// PATROON SCANNER
// ================================================================
let patternImageBase64 = null;

function handlePatternImage(e){
  const file = e.target.files[0];
  if(!file) return;
  compressAndSetJournalImage(file, 'pattern');
}

function clearPatternScan(){
  patternImageBase64 = null;
  const prev = $('patternPreview');
  if(prev){ prev.src=''; prev.style.display='none'; }
  if($('patternDropzoneText')) $('patternDropzoneText').style.display='block';
  if($('patternFile')) $('patternFile').value='';
  if($('patternContext')) $('patternContext').value='';
  if($('patternResultCard')) $('patternResultCard').style.display='none';
  if($('patternPlaceholderCard')) $('patternPlaceholderCard').style.display='block';
}

async function runPatternScan(){
  const apiKey = $('anthropicApiKey')?.value.trim() || localStorage.getItem('fxAnthropicKey') || '';
  if(!apiKey){ alert('Voer eerst je Anthropic API sleutel in via het "Setup & Backup" tabblad.'); return; }
  if(!patternImageBase64){ alert('Upload eerst een chart screenshot.'); return; }

  const ctx = $('patternContext')?.value.trim() || '';
  const btn = $('patternScanBtn');
  const loading = $('patternLoading');

  btn.disabled = true;
  if(loading) loading.style.display = 'flex';

  const systemPrompt = `Je bent een expert technisch analist gespecialiseerd in het herkennen van candlestick- en chart patronen. Je analyseert een chart screenshot en geeft een gestructureerd overzicht van ALLE zichtbare patronen. Je spreekt in het Nederlands.

STRUCTUUR (gebruik exact deze koppen):

## 🕯 Candlestick Patronen
Som elk zichtbaar candlestick patroon op. Per patroon:
- **Naam patroon** (locatie op chart) — Bullish/Bearish — Betrouwbaarheid: Hoog/Matig/Laag
  Korte uitleg wat dit patroon betekent in deze context.

Als er geen duidelijke candlestick patronen zijn: vermeld dat.

## 📐 Chart Patronen
Beschrijf bredere chart patronen die je ziet (double top/bottom, H&S, wedge, triangle, flag, channel, etc.). Als geen: vermeld dat.

## 📊 Trend Structuur
Beschrijf de zichtbare trendstructuur: uptrend/downtrend/ranging, HH/HL of LH/LL patroon, eventuele trendbreaks.

## 📈 Indicator Signalen
Beschrijf zichtbare indicator signalen (EMA crossover, RSI divergentie/overbought/oversold, etc.). Als geen indicators zichtbaar: vermeld dat.

## 🎯 Bias & Potentiële Setup
Geef op basis van alle gevonden patronen:
- **Bias**: Bullish / Bearish / Neutraal
- **Sterkste signaal**: welk patroon geeft het duidelijkste signaal
- **Potentiële entry zone**: waar zou je op letten
- **Invalidatie**: wanneer klopt de analyse niet meer

## ⚠️ Kanttekeningen
Wees eerlijk over onzekerheden. Welke patronen zijn minder duidelijk? Wat ontbreekt er om een hogekwaliteitssetup te hebben?

TOON: Concreet, eerlijk, geen overdrijving. Als een patroon twijfelachtig is, zeg dat. Betrouwbaarheid is belangrijker dan indruk maken.`;

  const userContent = [
    { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: patternImageBase64.split(',')[1] || patternImageBase64 } },
    { type: 'text', text: `Analyseer deze chart op patronen.${ctx ? '\nExtra context: ' + ctx : ''}` }
  ];

  try {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1600,
        system: systemPrompt,
        messages: [{ role: 'user', content: userContent }]
      })
    });

    if(!resp.ok){ const e = await resp.json(); throw new Error(e?.error?.message || resp.status); }
    const data = await resp.json();
    const text = data.content?.[0]?.text || '';

    if(loading) loading.style.display = 'none';
    btn.disabled = false;

    const rc = $('patternResultCard'), ph = $('patternPlaceholderCard');
    if(ph) ph.style.display = 'none';
    if(rc) rc.style.display = 'block';

    $('patternResultContent').innerHTML = renderMarkdownResult(text);

  } catch(err) {
    if(loading) loading.style.display = 'none';
    btn.disabled = false;
    const rc = $('patternResultCard');
    if(rc){ rc.style.display='block'; $('patternResultContent').innerHTML = `<div style="color:var(--red);font-size:13px;padding:10px;">❌ Fout: ${err.message}</div>`; }
  }
}

// ================================================================
// AI WEEKREVIEW
// ================================================================
async function runWeekReview(){
  const apiKey = $('anthropicApiKey')?.value.trim() || localStorage.getItem('fxAnthropicKey') || '';
  if(!apiKey){ alert('Voer eerst je Anthropic API sleutel in via het "Setup & Backup" tabblad.'); return; }

  const days = parseInt($('weekReviewPeriod')?.value) || 7;
  const cutoff = days === 0 ? null : new Date(Date.now() - days * 86400000);
  const subset = cutoff
    ? trades.filter(t => t.date && new Date(t.date) >= cutoff)
    : [...trades];

  if(!subset.length){
    alert('Geen trades gevonden in deze periode. Voeg eerst trades toe aan je journal.');
    return;
  }

  const btn = $('weekReviewBtn');
  const loading = $('weekReviewLoading');
  const result = $('weekReviewResult');

  btn.disabled = true;
  if(loading) loading.style.display = 'flex';
  if(result) result.style.display = 'none';

  const tradesSummary = subset.map((t,i) => {
    const parts = [
      `Trade ${i+1}: ${t.date||'?'} — ${t.pair||'?'} ${(t.dir||'').toUpperCase()} — ${(t.result||'?').toUpperCase()}`,
      t.pnl != null ? `P&L: €${t.pnl}` : null,
      t.rr ? `R:R: ${t.rr}` : null,
      t.entry ? `Entry: ${t.entry}` : null,
      t.sl ? `SL: ${t.sl}` : null,
      t.tp ? `TP: ${t.tp}` : null,
      t.lot ? `Lot: ${t.lot}` : null,
      t.edge_match ? `Edge: ${t.edge_match}` : null,
      t.edge_conf ? `Vertrouwen: ${t.edge_conf}` : null,
      t.notes ? `Notities: "${t.notes}"` : null,
    ].filter(Boolean);
    return parts.join(' | ');
  }).join('\n');

  const wins = subset.filter(t=>t.result==='win').length;
  const losses = subset.filter(t=>t.result==='loss').length;
  const be = subset.filter(t=>t.result==='be').length;
  const totalPnl = subset.reduce((s,t)=>s+(t.pnl||0),0);
  const label = days === 0 ? 'alle trades' : `afgelopen ${days} dagen`;

  const systemPrompt = `Je bent een eerlijke, directe forex trading coach die een trader helpt te groeien. Je analyseert een reeks trades en geeft een diepgaande, objectieve weekreview. Je spreekt in het Nederlands. Je bent niet sycofantisch — als er problemen zijn, benoem je ze direct maar constructief.

STRUCTUUR (gebruik exact deze koppen):

## 📊 Overzicht
Geef een kort statistisch overzicht van de periode: winrate, P&L trend, gemiddeld R:R.

## ✅ Wat goed gaat
Identificeer 2-4 concrete sterke punten op basis van de trades. Wees specifiek — verwijs naar concrete trades of patronen.

## ⚠️ Terugkerende problemen
Dit is het belangrijkste onderdeel. Zoek actief naar:
- Paren waar je consistent verliest
- Tijdstippen of sessies met slechte resultaten
- Trades buiten je edge (edge_match = no/partial)
- Overtrading patronen (te veel trades op één dag)
- R:R schendingen (te kleine wins t.o.v. verliezen)
- Emotionele patronen zichtbaar in de notities
Wees direct. Als je iets problematisch ziet, benoem het met voorbeelden.

## 🎯 Top 3 verbeterpunten
Geef exact 3 concrete, actionable verbeterpunten. Niet vaag ("trade beter") maar specifiek ("Vermijd GBP/USD op maandag — 3 van je 4 Monday-losses zijn op dit paar").

## 💡 Focus voor volgende week
Één duidelijke focus voor de komende periode. Eén ding, niet tien.

## 🧠 Psychologie check
Wat zie je in de notities en patronen over de mentale staat van de trader? Zijn er signalen van revenge trading, FOMO of gebrek aan discipline?

TOON: Eerlijk als een goede coach — soms oncomfortabel maar altijd constructief en respectvol.`;

  const userMsg = `Review periode: ${label}
Aantal trades: ${subset.length} (${wins} wins, ${losses} losses, ${be} BE)
Totale P&L: €${totalPnl.toFixed(2)}

TRADES:
${tradesSummary}`;

  try {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1800,
        system: systemPrompt,
        messages: [{ role: 'user', content: userMsg }]
      })
    });

    if(!resp.ok){ const e = await resp.json(); throw new Error(e?.error?.message || resp.status); }
    const data = await resp.json();
    const text = data.content?.[0]?.text || '';

    if(loading) loading.style.display = 'none';
    btn.disabled = false;
    if(result){
      result.style.display = 'block';
      result.innerHTML = `
        <div style="padding:10px 12px;background:rgba(167,139,250,0.07);border:1px solid rgba(167,139,250,0.25);border-radius:8px;margin-bottom:14px;font-size:12px;color:var(--muted);">
          📅 Review van <strong style="color:var(--text)">${subset.length} trades</strong> — ${label} — P&L: <strong style="color:${totalPnl>=0?'var(--green)':'var(--red)'}">€${totalPnl.toFixed(2)}</strong>
        </div>
        <div style="font-size:12px;color:var(--text);line-height:1.8;">${renderMarkdownResult(text)}</div>`;
    }
  } catch(err) {
    if(loading) loading.style.display = 'none';
    btn.disabled = false;
    if(result){ result.style.display='block'; result.innerHTML=`<div style="color:var(--red);font-size:13px;">❌ Fout: ${err.message}</div>`; }
  }
}

// Gedeelde markdown renderer
function renderMarkdownResult(text){
  return text
    .replace(/^## (.+)$/gm, '<h4 style="font-family:var(--font-head);font-weight:800;font-size:13px;color:var(--text);margin:18px 0 8px;padding-bottom:4px;border-bottom:1px solid var(--border);">$1</h4>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong style="color:var(--text)">$1</strong>')
    .replace(/^- (.+)$/gm, '<div style="padding:5px 0 5px 12px;border-left:2px solid var(--border);margin:3px 0;font-size:12px;color:var(--text);line-height:1.6;">$1</div>')
    .replace(/\n\n/g, '<br><br>')
    .replace(/\n/g, '<br>');
}

function fmt(v){
  if(!v && v !== 0) return '—';
  const dec = INSTRUMENTS[activeInstrument]?.decimals ?? 4;
  return parseFloat(v).toFixed(dec);
}
function pips(v){
  if(!v && v !== 0) return 0;
  const pip = INSTRUMENTS[activeInstrument]?.pip ?? 0.0001;
  return Math.round(v / pip);
}

function drawCandle(containerId, o, h, l, c){
  const el = $(containerId);
  if(!el||!o||!h||!l||!c){ el.innerHTML='<span style="color:var(--muted);font-size:12px;">Vul de waarden in om de candle te zien</span>'; return; }
  const bullish = c >= o;
  const color = bullish ? 'var(--green)' : 'var(--red)';
  const range = h - l;
  if(range === 0) return;
  const toY = v => Math.round((1-(v-l)/range)*80);
  const highY = 4, lowY = 84;
  const bodyTop = toY(Math.max(o,c));
  const bodyBot = toY(Math.min(o,c));
  const bodyH = Math.max(2, bodyBot - bodyTop);
  el.innerHTML = `
    <svg width="80" height="100" viewBox="0 0 80 100">
      <line x1="40" y1="4" x2="40" y2="${bodyTop}" stroke="${color}" stroke-width="1.5"/>
      <rect x="24" y="${bodyTop}" width="32" height="${bodyH}" fill="${color}" rx="2"/>
      <line x1="40" y1="${bodyTop+bodyH}" x2="40" y2="96" stroke="${color}" stroke-width="1.5"/>
      <text x="40" y="100" text-anchor="middle" fill="var(--muted)" font-size="9" font-family="DM Mono,monospace">${bullish?'▲ Bull':'▼ Bear'}</text>
    </svg>
    <div style="font-size:11px;color:var(--muted);margin-top:4px;text-align:center;">
      H: <span style="color:var(--green)">${fmt(h)}</span> &nbsp; L: <span style="color:var(--red)">${fmt(l)}</span>
    </div>`;
}

function updateWeeklyCalc(){
  const h=parseFloat($('wHigh').value), l=parseFloat($('wLow').value),
        o=parseFloat($('wOpen').value), c=parseFloat($('wClose').value),
        cur=parseFloat($('wCurrent').value);
  if(!h||!l||!o||!c) return;
  const range = h-l, bull = c>=o, body = Math.abs(c-o), mid = (h+l)/2;
  $('wHighVal').textContent = fmt(h);
  $('wLowVal').textContent  = fmt(l);
  $('wOpenVal').textContent = fmt(o);
  $('wCloseVal').textContent= fmt(c);
  $('wRangeLabel').textContent = 'Range: '+pips(range)+' pips';
  $('wDirectionLabel').textContent = bull ? 'Bullish week' : 'Bearish week';
  $('wDirectionLabel').className = 'level-badge '+(bull?'lb-bias-bull':'lb-bias-bear');
  const bodyPct = Math.round(body/range*100);
  $('wBodyLabel').textContent = 'Body: '+bodyPct+'%';
  drawCandle('weeklyCandleViz',o,h,l,c);

  // Pivot points berekening (klassiek)
  const pp = (h+l+c)/3;
  const r1 = 2*pp-l, r2 = pp+(h-l);
  const s1 = 2*pp-h, s2 = pp-(h-l);
  const setEl=(id,v)=>{ const e=$(id); if(e) e.textContent=fmt(v); };
  setEl('pvPP',pp); setEl('pvR1',r1); setEl('pvR2',r2);
  setEl('pvS1',s1); setEl('pvS2',s2); setEl('pvMid',mid);

  // TV Alert links updaten
  const levels=[
    {price:fmt(r2),label:'R2 — weerstand',color:'var(--green)'},
    {price:fmt(r1),label:'R1 — weerstand',color:'#7de8b8'},
    {price:fmt(pp),label:'Pivot PP',color:'var(--accent)'},
    {price:fmt(s1),label:'S1 — steun',color:'#ff9a9a'},
    {price:fmt(s2),label:'S2 — steun',color:'var(--red)'},
    {price:fmt(mid),label:'Midpoint 50%',color:'var(--purple)'},
    {price:fmt(h),label:'Weekly High',color:'var(--green)'},
    {price:fmt(l),label:'Weekly Low',color:'var(--red)'},
  ];
  updateTVAlertLinks(levels);

  generateWeeklyAnalysis(h,l,o,c,cur,mid,bull,range,body,bodyPct,pp,r1,r2,s1,s2);
}

function generateWeeklyAnalysis(h,l,o,c,cur,mid,bull,range,body,bodyPct,pp,r1,r2,s1,s2){
  const el = $('weeklyAnalysis'); if(!el) return;
  const signal = bodyPct > 60 ? 'Sterk '+( bull?'bullish':'bearish')+' signaal' : bodyPct > 30 ? 'Matig signaal' : 'Zwak signaal / doji';
  const posStr = cur ? (cur>mid ? 'boven het weekly midpoint ('+fmt(mid)+') → bullish zone' : 'onder het weekly midpoint ('+fmt(mid)+') → bearish zone') : 'Voer huidige prijs in voor positie-analyse.';
  const rejHigh = cur ? (h-cur < range*0.1 ? '⚠ Prijs is dicht bij Weekly High — verwacht weerstand.' : '') : '';
  const rejLow  = cur ? (cur-l < range*0.1 ? '⚠ Prijs is dicht bij Weekly Low — verwacht steun.' : '') : '';
  const ppCtx = pp ? `Pivot PP <strong style="color:var(--accent)">${fmt(pp)}</strong> is het centrale niveau. ${cur?(cur>pp?'Prijs boven PP → bullish momentum.':'Prijs onder PP → bearish druk.'):''}`:'';
  el.innerHTML = `
    <div class="ao-section"><div class="ao-title" style="color:${bull?'var(--green)':'var(--red)'}">${bull?'Bullish':'Bearish'} weekly candle</div>
    <div>${signal}. Body = ${bodyPct}% van de totale range (${pips(range)} pips).</div></div>
    <div class="ao-section"><div class="ao-title" style="color:var(--accent)">Positie &amp; pivot</div><div>${ppCtx}</div><div style="margin-top:4px;">Prijs is ${posStr}</div>${rejHigh?`<div style="margin-top:4px;color:var(--amber)">${rejHigh}</div>`:''}${rejLow?`<div style="margin-top:4px;color:var(--amber)">${rejLow}</div>`:''}</div>
    <div class="ao-section"><div class="ao-title" style="color:var(--purple)">Bias &amp; key levels</div>
    <div>${bull ? 'Zoek <strong style="color:var(--green)">long setups</strong> op S1 '+fmt(s1)+' of S2 '+fmt(s2)+'.' : 'Zoek <strong style="color:var(--red)">short setups</strong> op R1 '+fmt(r1)+' of R2 '+fmt(r2)+'.'}</div></div>
    <div class="ao-section"><div class="ao-title" style="color:var(--amber)">Range context</div>
    <div>Weekly range: <strong>${pips(range)} pips</strong>. ${pips(range)>130?'Hoog — kan normaliseren.':pips(range)<60?'Laag — uitbraak kan naderen.':'Normaal.'}</div></div>`;
}

function updateDailyCalc(){
  const h=parseFloat($('dHigh').value), l=parseFloat($('dLow').value),
        o=parseFloat($('dOpen').value), c=parseFloat($('dClose').value);
  if(!h||!l||!o||!c) return;
  const range=h-l, bull=c>=o, body=Math.abs(c-o), mid=(h+l)/2, bodyPct=Math.round(body/range*100);
  $('dHighVal').textContent = fmt(h);
  $('dLowVal').textContent  = fmt(l);
  $('dOpenVal').textContent = fmt(o);
  $('dCloseVal').textContent= fmt(c);
  $('dRangeLabel').textContent = 'Range: '+pips(range)+' pips';
  $('dDirectionLabel').textContent = bull ? 'Bullish dag' : 'Bearish dag';
  $('dDirectionLabel').className = 'level-badge '+(bull?'lb-bias-bull':'lb-bias-bear');
  $('dBodyLabel').textContent = 'Body: '+bodyPct+'%';
  $('dR1').textContent = fmt(h);
  $('dMid').textContent = fmt(mid);
  $('dS1').textContent  = fmt(l);
  $('dRangeVal').textContent = pips(range)+' pips';
  drawCandle('dailyCandleViz',o,h,l,c);
  generateDailyAnalysis(h,l,o,c,mid,bull,range,body,bodyPct);
}

function generateDailyAnalysis(h,l,o,c,mid,bull,range,body,bodyPct){
  const el=$('dailyAnalysis'); if(!el) return;
  const topWick=h-Math.max(o,c), botWick=Math.min(o,c)-l;
  const wickPct=wk=>Math.round(wk/range*100);
  const pinBar = wickPct(topWick)>40||wickPct(botWick)>40;
  const doji = bodyPct<10;
  let patternStr = doji ? '⚠ Doji candle — markt aarzelt. Wacht op bevestiging vandaag.' :
    pinBar ? (wickPct(botWick)>40 ? '📌 Bullish pin bar — afwijzing van lage prijzen, mogelijke reversal omhoog.' : '📌 Bearish pin bar — afwijzing van hoge prijzen, mogelijke reversal omlaag.') :
    bull ? 'Sterke bullish candle — momentum is opgaand.' : 'Sterke bearish candle — momentum is neerwaarts.';
  el.innerHTML = `
    <div class="ao-section"><div class="ao-title" style="color:${bull?'var(--green)':'var(--red)'}">Candle type</div><div>${patternStr}</div></div>
    <div class="ao-section"><div class="ao-title" style="color:var(--accent)">Key levels voor vandaag</div>
    <div>PDH <strong style="color:var(--green)">${fmt(h)}</strong> = eerste weerstand.<br>PDL <strong style="color:var(--red)">${fmt(l)}</strong> = eerste steun.<br>Mid <strong style="color:var(--purple)">${fmt(mid)}</strong> = 50% retracement zone.</div></div>
    <div class="ao-section"><div class="ao-title" style="color:var(--amber)">Dagrange analyse</div>
    <div>Gisteren: <strong>${pips(range)} pips</strong>. ${pips(range)>80?'Hoge range dag — verwacht vandaag mogelijk consolidatie.':pips(range)<40?'Lage range dag — kans op expansie vandaag.':'Normale dagrange.'}</div></div>
    <div class="ao-section"><div class="ao-title" style="color:var(--purple)">Setup idee vandaag</div>
    <div>${bull ? 'Zoek longs op retest van PDH '+fmt(h)+' als steun, of op dip naar mid '+fmt(mid)+'.' : 'Zoek shorts op retest van PDL '+fmt(l)+' als weerstand, of op rally naar mid '+fmt(mid)+'.'}</div></div>`;
}

function toggleBias(el,type){
  el.classList.toggle('checked');
  el.querySelector('.checkbox').textContent = el.classList.contains('checked') ? '✓' : '';
  const bull = document.querySelectorAll('[data-checked-bias="bull"]').length +
    Array.from(document.querySelectorAll('.check-item.checked')).filter(e=>e.getAttribute('data-bias-type')==='bull'||e.onclick?.toString().includes("'bull'")).length;
  let bullN=0,bearN=0;
  document.querySelectorAll('#page-markt .check-item.checked').forEach(e=>{
    const oc=e.getAttribute('onclick')||'';
    if(oc.includes("'bull'")) bullN++; else if(oc.includes("'bear'")) bearN++;
  });
  $('bullCount').textContent=bullN;
  $('bearCount').textContent=bearN;
  const total=bullN+bearN||1;
  $('biasBullBar').style.flex=bullN;
  $('biasBearBar').style.flex=bearN;
  const v=$('biasVerdict');
  if(bullN>bearN+1){ v.textContent='Bullish bias — zoek long setups'; v.style.color='var(--green)'; }
  else if(bearN>bullN+1){ v.textContent='Bearish bias — zoek short setups'; v.style.color='var(--red)'; }
  else if(bullN===0&&bearN===0){ v.textContent='Vul signalen in...'; v.style.color='var(--muted)'; }
  else { v.textContent='Neutrale markt — wacht op duidelijkheid'; v.style.color='var(--amber)'; }
}

function flash(id){ const el=$(id); if(!el) return; el.style.opacity='1'; setTimeout(()=>el.style.opacity='0',2000); }

function saveWeeklyLevels(){
  const d={wHigh:$('wHigh').value,wLow:$('wLow').value,wOpen:$('wOpen').value,wClose:$('wClose').value,wCurrent:$('wCurrent').value};
  try{localStorage.setItem('fxWeekly',JSON.stringify(d));}catch(e){}
  flash('wSavedFlash');
}
function saveDailyLevels(){
  const d={dHigh:$('dHigh').value,dLow:$('dLow').value,dOpen:$('dOpen').value,dClose:$('dClose').value};
  try{localStorage.setItem('fxDaily',JSON.stringify(d));}catch(e){}
  flash('dSavedFlash');
}
function saveTradingPlan(){
  const d={biasSummary:$('biasSummary').value,scenarioA:$('scenarioA').value,scenarioB:$('scenarioB').value,invalidation:$('invalidation').value};
  try{localStorage.setItem('fxPlan',JSON.stringify(d));}catch(e){}
  flash('planSavedFlash');
}
function loadTradingPlan(){
  try{
    const d=JSON.parse(localStorage.getItem('fxPlan')||'{}');
    if(d.biasSummary) $('biasSummary').value=d.biasSummary;
    if(d.scenarioA) $('scenarioA').value=d.scenarioA;
    if(d.scenarioB) $('scenarioB').value=d.scenarioB;
    if(d.invalidation) $('invalidation').value=d.invalidation;
  }catch(e){}
}

function loadSavedMarktData(){
  try{
    const w=JSON.parse(localStorage.getItem('fxWeekly')||'{}');
    if(w.wHigh){$('wHigh').value=w.wHigh;$('wLow').value=w.wLow;$('wOpen').value=w.wOpen;$('wClose').value=w.wClose;if(w.wCurrent)$('wCurrent').value=w.wCurrent;updateWeeklyCalc();}
  }catch(e){}
  try{
    const d=JSON.parse(localStorage.getItem('fxDaily')||'{}');
    if(d.dHigh){$('dHigh').value=d.dHigh;$('dLow').value=d.dLow;$('dOpen').value=d.dOpen;$('dClose').value=d.dClose;updateDailyCalc();}
  }catch(e){}
}

// ================================================================
// (live price feed removed)
// ================================================================
const liveFeed = { restartForInstrument(){}, start(){}, stop(){} }; // stub — feed removed


// ================================================================
// ALERTS — verwijderd
// ================================================================
function requestNotifPerm(){}
function updateNotifStatus(){}
function addAlert(){}
function deleteAlert(){}
function renderAlerts(){}
function checkAlerts(){}

function openTVAlertLevel() {}   // removed
function updateTVAlertLinks(pp) {} // removed

// ================================================================
// EXPORT / IMPORT / BACKUP
// ================================================================
function exportData(type) {
  let data={}, fn='';
  if(type==='trades'||type==='all'){
    data.trades = trades;
    data.exportDate = new Date().toISOString();
  }
  if(type==='levels'||type==='all'){
    try{ data.weekly=JSON.parse(localStorage.getItem('fxWeekly')||'{}'); }catch(e){}
    try{ data.daily=JSON.parse(localStorage.getItem('fxDaily')||'{}'); }catch(e){}
    try{ data.plan=JSON.parse(localStorage.getItem('fxPlan')||'{}'); }catch(e){}
  }
  if(type==='all'){
    data.alerts = priceAlerts;
    try{ data.settings={ theme:localStorage.getItem('fxTheme') }; }catch(e){}
  }
  fn = `fxtrader_${type}_${new Date().toISOString().split('T')[0]}.json`;
  const blob = new Blob([JSON.stringify(data,null,2)],{type:'application/json'});
  const a = document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=fn; a.click();
}

function importData(e, type) {
  const file = e.target.files[0]; if(!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    try {
      const d = JSON.parse(ev.target.result);
      if((type==='trades'||type==='all') && d.trades){
        trades = d.trades; saveTrades(); renderTrades();
      }
      if((type==='levels'||type==='all')){
        if(d.weekly) localStorage.setItem('fxWeekly', JSON.stringify(d.weekly));
        if(d.daily)  localStorage.setItem('fxDaily',  JSON.stringify(d.daily));
        if(d.plan)   localStorage.setItem('fxPlan',   JSON.stringify(d.plan));
      }
      if(type==='all' && d.alerts){ priceAlerts=d.alerts; localStorage.setItem('fxAlerts',JSON.stringify(priceAlerts)); renderAlerts(); }
      alert('Importeren geslaagd!');
      updateBackupInfo();
    } catch(err){ alert('Ongeldig JSON bestand: '+err.message); }
  };
  reader.readAsText(file);
  e.target.value='';
}

function updateBackupInfo() {
  const el = $('tradeBackupInfo'); if(el) el.textContent = trades.length+' trades opgeslagen';
  const fill = $('tradeStorageFill');
  if(fill){
    try{
      let used=0;
      for(let k in localStorage) if(k.startsWith('fx')) used += (localStorage[k]||'').length;
      const pct = Math.min(100, used/51200*100);
      fill.style.width = pct+'%';
      fill.style.background = pct>80?'var(--red)':pct>50?'var(--amber)':'var(--accent)';
    }catch(e){}
  }
}

function checkNotifPermOnLoad(){}

// ---- INIT (early) ----
const _jDate=$('jDate'); if(_jDate) _jDate.value=new Date().toISOString().split('T')[0];