// Variabelen hier opnieuw declareren zou een conflict geven — al gedaan hierboven.

// ---- GOOGLE DRIVE SYNC ----
const GDRIVE_FILENAME = 'fxtrader-data.json';
const GDRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.appdata';
const GDRIVE_CLIENT_ID = '1073322955504-6qbvh4blvulpqo7qh4714ov1o5sf48u4.apps.googleusercontent.com';
let gdriveToken = null;
let gdriveFileId = null;
let gdriveSaveTimer = null;

function openSettings(){
  const m=$('settingsModal');
  if(m){
    m.style.display='flex';
    document.body.style.overflow='hidden';
    try{ updateBackupInfo(); }catch(e){}
    renderAccountsList();
  }
}
function toggleIdeaList(){
  const body = $('ideaListBody');
  const icon = $('ideaListToggleIcon');
  if(!body) return;
  const open = getComputedStyle(body).display !== 'none';
  body.style.display = open ? 'none' : 'block';
  if(icon) icon.style.transform = open ? '' : 'rotate(180deg)';
}

function closeSettings(){
  const m=$('settingsModal');
  if(m){ m.style.display='none'; document.body.style.overflow=''; }
}
// Sluit modal bij klik buiten het venster
document.addEventListener('click', e=>{
  const m=$('settingsModal');
  if(m && e.target===m) closeSettings();
});

function saveApiKey(){
  const key = $('anthropicApiKey')?.value.trim();
  if(!key){ alert('Voer een geldige API sleutel in.'); return; }
  try{ localStorage.setItem('fxAnthropicKey', key); }catch(e){}
  // Toon bevestiging
  const btn = document.querySelector('button[onclick="saveApiKey()"]');
  if(btn){ const orig=btn.textContent; btn.textContent='Opgeslagen!'; btn.style.color='var(--green)'; setTimeout(()=>{btn.textContent=orig;btn.style.color='';},2000); }
  // Sync onmiddellijk naar Google Drive als verbonden
  if(gdriveToken){
    gdriveSaveAll(true).then(()=>{
      if(btn){ btn.textContent='Opgeslagen + Drive ✓'; btn.style.color='var(--green)'; setTimeout(()=>{btn.textContent='Opslaan';btn.style.color='';},3000); }
    });
  }
}

function loadApiKey(){
  try{
    const key = localStorage.getItem('fxAnthropicKey');
    const el = $('anthropicApiKey');
    if(key && el) el.value = key;
  }catch(e){}
}
function nieuweWeek(){
  // Archiveer huidige week naar vorige week history
  try{
    const current = JSON.parse(localStorage.getItem('fxWeekly')||'{}');
    if(!current.wHigh){ alert('Er zijn nog geen weekly levels ingevuld om te archiveren.'); return; }

    // Bouw weeknummer sleutel
    const now = new Date();
    const weekKey = `fxWeeklyArchief_${now.getFullYear()}_W${getWeekNumber(now)}`;
    localStorage.setItem(weekKey, JSON.stringify({...current, archiefDatum: now.toISOString()}));

    // Wis de huidige week velden zodat je de nieuwe week kunt invullen
    ['wHigh','wLow','wOpen','wClose','wCurrent'].forEach(id=>{
      const el=$(id); if(el) el.value='';
    });

    // Reset displays
    ['wHighVal','wLowVal','wOpenVal','wCloseVal'].forEach(id=>{
      const el=$(id); if(el) el.textContent='—';
    });
    ['wRangeLabel','wDirectionLabel','wBodyLabel'].forEach(id=>{
      const el=$(id); if(el){ el.textContent=id==='wRangeLabel'?'Range: —':id==='wDirectionLabel'?'Richting: —':'Body: —'; }
    });
    ['pvPP','pvR1','pvR2','pvS1','pvS2','pvMid'].forEach(id=>{
      const el=$(id); if(el) el.textContent='—';
    });
    const wCandleViz=$('weeklyCandleViz');
    if(wCandleViz) wCandleViz.innerHTML='<span style="color:var(--muted);font-size:12px;">Vul de nieuwe week waarden in</span>';

    const weeklyAnalysis=$('weeklyAnalysis');
    if(weeklyAnalysis) weeklyAnalysis.innerHTML='<div style="color:var(--muted);font-size:12px;">Vul de weekly waarden in voor automatische analyse...</div>';

    // Wis opgeslagen data
    localStorage.removeItem('fxWeekly');
    updateKeyLevelsBar();
    scheduleDriveSave();

    // Toon bevestiging
    const info=$('nieuweWeekInfo');
    if(info){ info.style.display='block'; setTimeout(()=>info.style.display='none',5000); }

    // Update TV alert links leeg
    updateTVAlertLinks([]);

  }catch(e){ alert('Fout bij starten nieuwe week: '+e.message); }
}

function getWeekNumber(d){
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(),0,1));
  return Math.ceil((((date - yearStart) / 86400000) + 1)/7);
}


function saveGdriveConfig(){
  try{
    const cfg={clientId:GDRIVE_CLIENT_ID};
    localStorage.setItem('fxGdriveConfig',JSON.stringify(cfg));
  }catch(e){}
}

function gdriveSignIn(){
  const clientId=GDRIVE_CLIENT_ID;

  // Gebruik Google Identity Services (GIS) — werkt correct vanuit file://
  if(typeof google==='undefined'||!google.accounts){
    alert('Google Identity Services laden mislukt. Controleer je internetverbinding.');return;
  }
  const client=google.accounts.oauth2.initTokenClient({
    client_id:clientId,
    scope:'https://www.googleapis.com/auth/drive.appdata https://www.googleapis.com/auth/drive.file openid email profile',
    callback:(resp)=>{
      if(resp.error){
        alert('Inloggen mislukt: '+resp.error);return;
      }
      gdriveToken=resp.access_token;
      localStorage.setItem('fxGdriveToken',resp.access_token);
      verifyGdriveToken();
    }
  });
  client.requestAccessToken({prompt:'select_account'});
}

async function verifyGdriveToken(){
  if(!gdriveToken)return;
  setSyncStatus('saving','Verbinden...');
  try{
    const r=await fetch('https://www.googleapis.com/oauth2/v1/userinfo?alt=json',{headers:{Authorization:'Bearer '+gdriveToken}});
    if(!r.ok){gdriveToken=null;localStorage.removeItem('fxGdriveToken');setSyncStatus('error','Verlopen');showGdriveSetup(false);return;}
    const info=await r.json();
    showGdriveConnected(info.email);
    await gdriveLoadAll(true);
  }catch(e){setSyncStatus('error','Fout');showGdriveSetup(false);}
}

function showGdriveConnected(email){
  const f=$('gdriveSetupForm'),c=$('gdriveConnected');
  if(f)f.style.display='none';
  if(c)c.style.display='block';
  const em=$('gdriveUserEmail');if(em)em.textContent=email;
  const sb=$('gdriveStatusBadge');
  if(sb){sb.className='sync-badge sync-ok';sb.textContent='Verbonden';}
  setSyncStatus('ok','Verbonden');
}

function showGdriveSetup(connected){
  const f=$('gdriveSetupForm'),c=$('gdriveConnected');
  if(f)f.style.display=connected?'none':'block';
  if(c)c.style.display=connected?'block':'none';
}

function gdriveSignOut(){
  gdriveToken=null;gdriveFileId=null;
  localStorage.removeItem('fxGdriveToken');
  showGdriveSetup(false);
  setSyncStatus('idle','Drive');
  const sb=$('gdriveStatusBadge');
  if(sb){sb.className='sync-badge sync-idle';sb.textContent='Niet verbonden';}
}

function setSyncStatus(state,text){
  const badge=$('syncBadge'),dot=$('syncDot'),txt=$('syncText');
  if(!badge)return;
  const classes={idle:'sync-idle',ok:'sync-ok',saving:'sync-saving',error:'sync-error'};
  badge.className='sync-badge '+(classes[state]||'sync-idle');
  if(dot){dot.className='sync-dot'+(state==='saving'?' pulse':'');}
  if(txt)txt.textContent=text;
}

async function gdriveFindFile(){
  if(!gdriveToken)return null;
  try{
    const r=await fetch("https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&q=name%3D%27"+GDRIVE_FILENAME+"%27&fields=files(id,modifiedTime)",{headers:{Authorization:'Bearer '+gdriveToken}});
    const d=await r.json();
    return d.files&&d.files.length?d.files[0]:null;
  }catch(e){return null;}
}

async function gdriveSaveAll(silent){
  if(!gdriveToken){if(!silent)alert('Log eerst in met Google Drive.');return;}
  setSyncStatus('saving','Opslaan...');
  try{
    const data={
      trades:JSON.parse(localStorage.getItem('fxTrades2')||'[]'),
      weekly:JSON.parse(localStorage.getItem('fxWeekly')||'{}'),
      daily:JSON.parse(localStorage.getItem('fxDaily')||'{}'),
      plan:JSON.parse(localStorage.getItem('fxPlan')||'{}'),
      tvSettings:JSON.parse(localStorage.getItem('fxTVSettings')||'{}'),
      alerts:JSON.parse(localStorage.getItem('fxAlerts')||'[]'),
      anthropicKey:localStorage.getItem('fxAnthropicKey')||'',
      fxAccounts:JSON.parse(localStorage.getItem('fxAccounts')||'[]'),
      fxActiveAccountId:localStorage.getItem('fxActiveAccountId')||'',
      savedAt:new Date().toISOString()
    };
    const json=JSON.stringify(data,null,2);
    const blob=new Blob([json],{type:'application/json'});

    if(!gdriveFileId){
      const existing=await gdriveFindFile();
      if(existing)gdriveFileId=existing.id;
    }

    let r;
    if(gdriveFileId){
      r=await fetch('https://www.googleapis.com/upload/drive/v3/files/'+gdriveFileId+'?uploadType=media',{method:'PATCH',headers:{'Authorization':'Bearer '+gdriveToken,'Content-Type':'application/json'},body:blob});
    }else{
      const meta=JSON.stringify({name:GDRIVE_FILENAME,parents:['appDataFolder']});
      const form=new FormData();
      form.append('metadata',new Blob([meta],{type:'application/json'}));
      form.append('file',blob);
      r=await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart',{method:'POST',headers:{Authorization:'Bearer '+gdriveToken},body:form});
      const d=await r.json();
      if(d.id)gdriveFileId=d.id;
    }

    if(r&&r.ok){
      setSyncStatus('ok','Opgeslagen');
      const ls=$('gdriveLastSync');
      if(ls)ls.textContent='Opgeslagen: '+new Date().toLocaleTimeString('nl-BE',{hour:'2-digit',minute:'2-digit'});
      setTimeout(()=>setSyncStatus('ok','Drive'),3000);
    }else{
      setSyncStatus('error','Fout');
    }
  }catch(e){setSyncStatus('error','Fout');}
}

async function gdriveLoadAll(silent){
  if(!gdriveToken){if(!silent)alert('Log eerst in met Google Drive.');return;}
  setSyncStatus('saving','Laden...');
  try{
    const file=await gdriveFindFile();
    if(!file){setSyncStatus('ok','Drive');if(!silent)alert('Geen data gevonden in Drive. Sla eerst op om te beginnen.');return;}
    gdriveFileId=file.id;
    const r=await fetch('https://www.googleapis.com/drive/v3/files/'+file.id+'?alt=media',{headers:{Authorization:'Bearer '+gdriveToken}});
    const data=await r.json();

    if(data.trades){localStorage.setItem('fxTrades2',JSON.stringify(data.trades));trades=data.trades;renderTrades();}
    if(data.weekly)localStorage.setItem('fxWeekly',JSON.stringify(data.weekly));
    if(data.daily)localStorage.setItem('fxDaily',JSON.stringify(data.daily));
    if(data.plan)localStorage.setItem('fxPlan',JSON.stringify(data.plan));
    if(data.tvSettings)localStorage.setItem('fxTVSettings',JSON.stringify(data.tvSettings));
    if(data.alerts){localStorage.setItem('fxAlerts',JSON.stringify(data.alerts));priceAlerts=data.alerts;renderAlerts();}
    if(data.anthropicKey){
      localStorage.setItem('fxAnthropicKey',data.anthropicKey);
      const fillKey = () => { const el=$('anthropicApiKey'); if(el) el.value=data.anthropicKey; };
      fillKey(); setTimeout(fillKey, 1000);
    }
    if(data.fxAccounts){ localStorage.setItem('fxAccounts', JSON.stringify(data.fxAccounts)); fxAccounts=data.fxAccounts; }
    if(data.fxActiveAccountId){ localStorage.setItem('fxActiveAccountId', data.fxActiveAccountId); fxActiveAccountId=data.fxActiveAccountId; }
    renderAccountSelects(); renderAccountsList();

    loadSavedMarktData();updateBackupInfo();loadTVSettings();

    setSyncStatus('ok','Geladen');
    const ls=$('gdriveLastSync');
    if(ls)ls.textContent='Geladen van Drive: '+new Date(data.savedAt).toLocaleString('nl-BE',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'});
    setTimeout(()=>setSyncStatus('ok','Drive'),3000);
    if(!silent)alert('Data geladen van Google Drive!');
  }catch(e){
    setSyncStatus('error','Fout');
    console.error('Drive load fout:', e);
    if(!silent) alert('Fout bij laden van Drive:\n' + e.message);
  }
}

// Auto-save to Drive 10 seconds after any data change
function scheduleDriveSave(){
  if(!gdriveToken)return;
  clearTimeout(gdriveSaveTimer);
  gdriveSaveTimer=setTimeout(()=>gdriveSaveAll(true),10000);
  setSyncStatus('saving','...');
}

// Hook alle save-functies — inclusief alerts en plan
const _origSaveTrades=window.saveTrades;
function saveTrades(){
  try{localStorage.setItem('fxTrades2',JSON.stringify(trades));}catch(e){}
  scheduleDriveSave();
  // Stats tab live houden
  if(document.getElementById('page-stats')?.classList.contains('active')) renderStats();
}
function saveWeeklyLevels(){
  const d={wHigh:$('wHigh').value,wLow:$('wLow').value,wOpen:$('wOpen').value,wClose:$('wClose').value,wCurrent:$('wCurrent').value};
  try{
    localStorage.setItem('fxWeekly',JSON.stringify(d)); // legacy key (voor backup/Drive compatibiliteit)
    localStorage.setItem('fxWeekly_'+activeInstrument,JSON.stringify(d));
  }catch(e){}
  flash('wSavedFlash'); scheduleDriveSave(); updateKeyLevelsBar();
}
function saveDailyLevels(){
  const d={dHigh:$('dHigh').value,dLow:$('dLow').value,dOpen:$('dOpen').value,dClose:$('dClose').value};
  try{
    localStorage.setItem('fxDaily',JSON.stringify(d)); // legacy key
    localStorage.setItem('fxDaily_'+activeInstrument,JSON.stringify(d));
  }catch(e){}
  flash('dSavedFlash'); scheduleDriveSave(); updateKeyLevelsBar();
}
function saveTradingPlan(){
  const d={biasSummary:$('biasSummary').value,scenarioA:$('scenarioA').value,scenarioB:$('scenarioB').value,invalidation:$('invalidation').value};
  try{localStorage.setItem('fxPlan',JSON.stringify(d));}catch(e){}
  flash('planSavedFlash'); scheduleDriveSave(); updateKeyLevelsBar();
}

// Alerts ook koppelen aan Drive sync
const _origAddAlert=window.addAlert;
function addAlert(){
  const price=parseFloat($('alertPrice').value);
  const dir=$('alertDir').value;
  const note=$('alertNote').value.trim();
  if(!price){alert('Voer een geldige prijs in.');return;}
  priceAlerts.push({id:Date.now(),price,dir,note,triggered:false,active:true});
  try{localStorage.setItem('fxAlerts',JSON.stringify(priceAlerts));}catch(e){}
  $('alertPrice').value='';$('alertNote').value='';
  renderAlerts();
  scheduleDriveSave();
}

// Token auto-refresh — vraag nieuw token stil op als de opgeslagen token verlopen is
async function silentTokenRefresh(clientId){
  if(typeof google==='undefined'||!google.accounts) return;
  return new Promise(resolve=>{
    const client=google.accounts.oauth2.initTokenClient({
      client_id:clientId,
      scope:'https://www.googleapis.com/auth/drive.appdata https://www.googleapis.com/auth/drive.file openid email profile',
      prompt:'',
      callback:(resp)=>{
        if(resp&&resp.access_token){
          gdriveToken=resp.access_token;
          localStorage.setItem('fxGdriveToken',resp.access_token);
          resolve(true);
        } else {
          resolve(false);
        }
      }
    });
    client.requestAccessToken({prompt:''});
  });
}

// Laad config en herstel sessie automatisch bij opstarten
async function loadGdriveConfig(){
  try{
    const cfg={clientId:GDRIVE_CLIENT_ID};
    localStorage.setItem('fxGdriveConfig',JSON.stringify(cfg));

    const token=localStorage.getItem('fxGdriveToken');
    if(token&&cfg.clientId){
      gdriveToken=token;
      setSyncStatus('saving','Verbinden...');

      // Controleer of token nog geldig is
      const test=await fetch('https://www.googleapis.com/oauth2/v1/userinfo?alt=json',{headers:{Authorization:'Bearer '+token}});
      if(test.ok){
        const info=await test.json();
        showGdriveConnected(info.email||'');
        await gdriveLoadAll(true);
      } else {
        // Token verlopen — stil vernieuwen via GIS zonder popup
        setSyncStatus('saving','Vernieuwen...');
        const refreshed=await silentTokenRefresh(cfg.clientId);
        if(refreshed){
          const test2=await fetch('https://www.googleapis.com/oauth2/v1/userinfo?alt=json',{headers:{Authorization:'Bearer '+gdriveToken}});
          if(test2.ok){
            const info2=await test2.json();
            showGdriveConnected(info2.email||'');
            await gdriveLoadAll(true);
          } else {
            // Kon niet vernieuwen — toon login knop maar verwijder token niet meteen
            setSyncStatus('error','Opnieuw inloggen');
            showGdriveSetup(false);
            showDriveReconnectPrompt('');
          }
        } else {
          setSyncStatus('idle','Drive');
          showGdriveSetup(false);
          showDriveReconnectPrompt('');
        }
      }
    }
  }catch(e){setSyncStatus('idle','Drive');}
}

// ================================================================
// DRIVE STARTUP MODAL
// ================================================================

function checkDriveStartup() {
  // Nooit tonen als gebruiker "niet meer vragen" heeft aangeklikt
  if(localStorage.getItem('fxDriveNeverAsk') === '1') return;

  const cfg = JSON.parse(localStorage.getItem('fxGdriveConfig')||'{}');
  const token = localStorage.getItem('fxGdriveToken');
  const skippedUntil = localStorage.getItem('fxDriveSkippedUntil');

  // Tijdelijk overgeslagen? Check datum
  if(skippedUntil) {
    const skipDate = new Date(skippedUntil);
    if(new Date() < skipDate) return; // Nog niet weer tonen
    localStorage.removeItem('fxDriveSkippedUntil');
  }

  if(cfg.clientId && token) {
    // Client ID aanwezig maar token verlopen → toon herverbind-prompt
    // (loadGdriveConfig handelt de verificatie af; we tonen de modal alleen
    //  als de verificatie mislukt — dat signaal krijgen we via showDriveReconnectPrompt)
    return;
  }

  if(cfg.clientId && !token) {
    // Client ID al geconfigureerd, maar nooit ingelogd → toon herverbind-state
    setTimeout(() => {
      const emailEl = $('reconnectEmail');
      if(emailEl) emailEl.textContent = '';
      showDriveStartupModal('reconnect');
    }, 800);
    return;
  }

  // Geen config → toon volledige setup state
  setTimeout(() => {
    showDriveStartupModal('setup');
  }, 700);
}

function showDriveStartupModal(state) {
  const overlay = $('driveStartupOverlay');
  const setupState = $('driveSetupState');
  const reconnectState = $('driveReconnectState');
  if(!overlay) return;
  if(setupState) setupState.style.display = state === 'setup' ? 'block' : 'none';
  if(reconnectState) reconnectState.style.display = state === 'reconnect' ? 'block' : 'none';
  overlay.classList.add('show');
}

function dismissDriveStartup() {
  const overlay = $('driveStartupOverlay');
  if(overlay) overlay.classList.remove('show');
}

function skipDriveStartup(permanent) {
  if(permanent) {
    localStorage.setItem('fxDriveNeverAsk', '1');
  } else {
    // Toon morgen opnieuw
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);
    localStorage.setItem('fxDriveSkippedUntil', tomorrow.toISOString());
  }
  dismissDriveStartup();
}

function showDriveSetupHelp(e) {
  e.preventDefault();
  const help = $('driveSetupHelp');
  if(help) {
    help.style.display = help.style.display === 'none' ? 'block' : 'none';
    e.target.textContent = help.style.display === 'none' ? 'Zo maak je er een aan →' : 'Verberg uitleg ↑';
  }
}

function startupDriveConnect() {
  const input = $('startupClientId');
  const clientId = input ? input.value.trim() : '';
  if(!clientId) {
    if(input) input.classList.add('error');
    input.focus();
    return;
  }
  // Sla de Client ID op en synchroniseer met het veld in Alerts tab
  localStorage.setItem('fxGdriveConfig', JSON.stringify({ clientId }));
  const mainInput = $('gClientId');
  if(mainInput) mainInput.value = clientId;

  // Sluit de modal en start het inlogproces
  dismissDriveStartup();
  // Geef de overlay tijd om te sluiten, dan start login
  setTimeout(() => {
    gdriveSignIn();
  }, 200);
}

function startupDriveReconnect() {
  dismissDriveStartup();
  setTimeout(() => {
    gdriveSignIn();
  }, 200);
}

// Wordt aangeroepen vanuit loadGdriveConfig als token verlopen is en stil vernieuwen mislukt
function showDriveReconnectPrompt(email) {
  if(localStorage.getItem('fxDriveNeverAsk') === '1') return;
  const skippedUntil = localStorage.getItem('fxDriveSkippedUntil');
  if(skippedUntil && new Date() < new Date(skippedUntil)) return;

  const emailEl = $('reconnectEmail');
  if(emailEl && email) emailEl.textContent = `(${email})`;
  setTimeout(() => showDriveStartupModal('reconnect'), 600);
}

// ================================================================
// CANDLESTICK PATTERN SVG RENDERER
// ================================================================

function renderCandleSVG(candles, W=130, H=100) {
  const pad = 10;
  const allP = candles.flatMap(c=>[c.h,c.l]);
  const minP = Math.min(...allP), maxP = Math.max(...allP);
  const range = (maxP - minP) || 1;
  const toY = p => pad + (maxP - p) / range * (H - pad*2);
  const slotW = (W - pad*2) / candles.length;
  const bw = Math.min(22, slotW * 0.55);

  let content = `<rect width="${W}" height="${H}" rx="6" fill="#13151c"/>`;
  // subtle grid lines
  [0.25,0.5,0.75].forEach(f=>{
    const y = pad + f*(H-pad*2);
    content += `<line x1="${pad}" y1="${y}" x2="${W-pad}" y2="${y}" stroke="#2a2f42" stroke-width="0.5"/>`;
  });

  candles.forEach((c,i) => {
    const cx = pad + i*slotW + slotW/2;
    const bull = c.c >= c.o;
    const col = bull ? '#2ecc8a' : '#ff5c5c';
    const bodyTop = toY(Math.max(c.o,c.c));
    const bodyBot = toY(Math.min(c.o,c.c));
    const bodyH = Math.max(2, bodyBot - bodyTop);
    // wick
    content += `<line x1="${cx}" y1="${toY(c.h)}" x2="${cx}" y2="${toY(c.l)}" stroke="${col}" stroke-width="1.5" stroke-linecap="round"/>`;
    // body
    content += `<rect x="${cx-bw/2}" y="${bodyTop}" width="${bw}" height="${bodyH}" fill="${col}" rx="2"/>`;
    // doji line
    if(Math.abs(c.o-c.c)/range < 0.04){
      content += `<line x1="${cx-bw/2}" y1="${toY(c.o)}" x2="${cx+bw/2}" y2="${toY(c.o)}" stroke="${col}" stroke-width="2"/>`;
    }
  });

  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">${content}</svg>`;
}

// ================================================================
// CANDLESTICK PATTERN DATA
// ================================================================

const CANDLE_DATA = [
  // ── ENKELE KAARS ──
  { id:'hammer', type:'bullish', candles:[{o:68,h:72,l:15,c:70}],
    NL:{ name:'Hammer', short:'Kleine body bovenaan, lange onderste wick. Bullish omkeerpatroon na een daling.',
      hoe:'Lange onderste wick (min. 2× de body). Kleine body in het bovenste derde deel. Weinig of geen bovenste wick. Verschijnt na een daling.',
      wanneer:'Op support niveau of key S/R na een daling. Entry: breek boven de high van de hammer candle. SL: onder de low van de wick.',
      goud:'Hoe langer de onderste wick, hoe sterker de afwijzing. Bevestiging met de volgende bullish candle verhoogt de betrouwbaarheid.' },
    EN:{ name:'Hammer', short:'Small body at the top, long lower wick. Bullish reversal pattern after a decline.',
      hoe:'Long lower wick (min. 2× the body). Small body in the upper third. Little or no upper wick. Appears after a decline.',
      wanneer:'At support level or key S/R after a decline. Entry: break above the hammer high. SL: below the wick low.',
      goud:'The longer the lower wick, the stronger the rejection. Confirmation with the next bullish candle increases reliability.' }
  },
  { id:'invertedHammer', type:'bullish', candles:[{o:28,h:82,l:22,c:30}],
    NL:{ name:'Inverted Hammer', short:'Kleine body onderaan, lange bovenste wick. Zwakker bullish signaal na daling.',
      hoe:'Lange bovenste wick (min. 2× de body). Kleine body in het onderste derde deel. Erschijnt na een daling. Minder betrouwbaar dan de Hammer.',
      wanneer:'Na een daling op support. Vereist sterke bevestiging van de volgende candle. Entry pas bij close boven high van de volgende bullish candle.',
      goud:'Verschijnt na een gap down of na een lange daling. Bevestigingscandle is verplicht — nooit alleen op de Inverted Hammer handelen.' },
    EN:{ name:'Inverted Hammer', short:'Small body at the bottom, long upper wick. Weaker bullish signal after a decline.',
      hoe:'Long upper wick (min. 2× the body). Small body in the lower third. Appears after a decline. Less reliable than the Hammer.',
      wanneer:'After a decline at support. Requires strong confirmation from the next candle. Entry only when next bullish candle closes above the high.',
      goud:'Appears after a gap down or after a long decline. Confirmation candle is required — never trade the Inverted Hammer alone.' }
  },
  { id:'shootingStar', type:'bearish', candles:[{o:68,h:95,l:62,c:65}],
    NL:{ name:'Shooting Star', short:'Kleine body onderaan, lange bovenste wick. Bearish omkeerpatroon na een stijging.',
      hoe:'Lange bovenste wick (min. 2× de body). Kleine body in het onderste derde deel. Kleine of geen onderste wick. Verschijnt na een stijging.',
      wanneer:'Op resistance niveau of key S/R na een rally. Entry: break onder de low. SL: boven de high van de wick.',
      goud:'Hoe hoger de gap bij open (boven vorige candle), hoe sterker het signaal. Rode (bearish) body is sterker dan een groene body.' },
    EN:{ name:'Shooting Star', short:'Small body at the bottom, long upper wick. Bearish reversal pattern after a rise.',
      hoe:'Long upper wick (min. 2× the body). Small body in the lower third. Little or no lower wick. Appears after a rise.',
      wanneer:'At resistance level or key S/R after a rally. Entry: break below the low. SL: above the wick high.',
      goud:'The bigger the gap up at open, the stronger the signal. Red (bearish) body is stronger than a green body.' }
  },
  { id:'hangingMan', type:'bearish', candles:[{o:70,h:74,l:20,c:72}],
    NL:{ name:'Hanging Man', short:'Zelfde vorm als Hammer maar bovenaan een stijging. Bearish waarschuwing.',
      hoe:'Identiek aan de Hammer qua shape. Het verschil zit in de context: de Hanging Man verschijnt NA een stijging, de Hammer NA een daling. Lange onderste wick, kleine body bovenaan.',
      wanneer:'Op resistance na een stijging. Minder betrouwbaar — vereist bevestiging. Entry bij break onder de low van de volgende bearish candle.',
      goud:'Rode body maakt het patroon sterker. Hoog volume bij de Hanging Man verhoogt de betrouwbaarheid. Nooit handelen zonder bevestigingscandle.' },
    EN:{ name:'Hanging Man', short:'Same shape as Hammer but at the top of an uptrend. Bearish warning signal.',
      hoe:'Identical to the Hammer in shape. The difference lies in context: the Hanging Man appears AFTER a rise, the Hammer AFTER a decline. Long lower wick, small body at the top.',
      wanneer:'At resistance after a rise. Less reliable — requires confirmation. Entry on break below the next bearish candle low.',
      goud:'Red body makes the pattern stronger. High volume at the Hanging Man increases reliability. Never trade without a confirmation candle.' }
  },
  { id:'bullishMarubozu', type:'bullish', candles:[{o:12,h:12,l:12,c:88}],
    NL:{ name:'Bullish Marubozu', short:'Grote groene candle zonder wicks. Maximale bullish kracht.',
      hoe:'Volledige groene body van open tot close. Geen of minimale wicks. Open = low, close = high. Toont dat kopers de volledige sessie domineerden.',
      wanneer:'Na een uitbraak boven resistance of bij start van een sterke trend. Geeft groen licht voor longs. Stop net onder de low van de candle.',
      goud:'Hoe groter de body (meer pips), hoe sterker het signaal. Na een consolidatie is een Marubozu een sterke trendbevestiging.' },
    EN:{ name:'Bullish Marubozu', short:'Large green candle with no wicks. Maximum bullish strength.',
      hoe:'Full green body from open to close. No or minimal wicks. Open = low, close = high. Shows buyers dominated the entire session.',
      wanneer:'After a breakout above resistance or at the start of a strong trend. Green light for longs. Stop just below the candle low.',
      goud:'The larger the body (more pips), the stronger the signal. After consolidation, a Marubozu is a strong trend confirmation.' }
  },
  { id:'bearishMarubozu', type:'bearish', candles:[{o:88,h:88,l:12,c:12}],
    NL:{ name:'Bearish Marubozu', short:'Grote rode candle zonder wicks. Maximale bearish kracht.',
      hoe:'Volledige rode body van open tot close. Geen of minimale wicks. Open = high, close = low. Verkopers domineerden de volledige sessie.',
      wanneer:'Na een uitbraak onder support of bij start van een bearish trend. Groen licht voor shorts. Stop net boven de high van de candle.',
      goud:'Verschijnt vaak na slechte fundamentele data of bij paniekverkoop. Sterke trendbevestiging na een consolidatieperiode.' },
    EN:{ name:'Bearish Marubozu', short:'Large red candle with no wicks. Maximum bearish strength.',
      hoe:'Full red body from open to close. No or minimal wicks. Open = high, close = low. Sellers dominated the entire session.',
      wanneer:'After a breakout below support or at the start of a bearish trend. Green light for shorts. Stop just above the candle high.',
      goud:'Often appears after bad fundamental data or panic selling. Strong trend confirmation after a consolidation period.' }
  },
  { id:'doji', type:'neutral', candles:[{o:50,h:82,l:18,c:50}],
    NL:{ name:'Doji', short:'Open ≈ Close. Markt in perfecte balans — indecisie en potentiële ommekeer.',
      hoe:'Open en close zijn (bijna) gelijk. Wick aan beide kanten. Verschillende subtypes: Standard Doji (beide wicks gelijk), Long-legged Doji (lange wicks beide kanten), Dragonfly (alleen onderste wick), Gravestone (alleen bovenste wick).',
      wanneer:'Zoek Doji op key levels (support/resistance). Na een trend geeft het een waarschuwing voor mogelijke ommekeer. Na een Doji: wacht op bevestiging van de volgende candle.',
      goud:'Een Doji midden in een trend is minder betekenisvol. Op key S/R niveau is het veel krachtiger. Volume-bevestiging verhoogt de waarde.' },
    EN:{ name:'Doji', short:'Open ≈ Close. Market in perfect balance — indecision and potential reversal.',
      hoe:'Open and close are (nearly) equal. Wick on both sides. Various subtypes: Standard Doji (equal wicks), Long-legged Doji (long wicks both sides), Dragonfly (only lower wick), Gravestone (only upper wick).',
      wanneer:'Look for Doji at key levels (support/resistance). After a trend it warns of a possible reversal. After a Doji: wait for confirmation from the next candle.',
      goud:'A Doji in the middle of a trend is less meaningful. At key S/R it is much more powerful. Volume confirmation increases its value.' }
  },
  { id:'spinningTop', type:'neutral', candles:[{o:52,h:78,l:22,c:48}],
    NL:{ name:'Spinning Top', short:'Kleine body, wicks aan beide kanten. Tijdelijke indecisie — noch bulls noch bears in controle.',
      hoe:'Kleine body (max. 30% van de range). Wicks aan beide kanten (minstens zo lang als de body). Kleur (groen/rood) minder relevant.',
      wanneer:'Geeft een pauze aan in een bestaande trend. Sterkste signaal als het na meerdere candles in dezelfde richting verschijnt. Wacht altijd op bevestiging.',
      goud:'Minder betrouwbaar dan een Doji. Meerdere Spinning Tops na elkaar = sterke consolidatiesignaal. Trend hervat of keert om na bevestiging.' },
    EN:{ name:'Spinning Top', short:'Small body, wicks on both sides. Temporary indecision — neither bulls nor bears in control.',
      hoe:'Small body (max. 30% of range). Wicks on both sides (at least as long as the body). Color (green/red) less relevant.',
      wanneer:'Indicates a pause in an existing trend. Strongest signal when it appears after several candles in the same direction. Always wait for confirmation.',
      goud:'Less reliable than a Doji. Multiple Spinning Tops in a row = strong consolidation signal. Trend resumes or reverses after confirmation.' }
  },
  { id:'dragonflyDoji', type:'bullish', candles:[{o:78,h:80,l:10,c:78}],
    NL:{ name:'Dragonfly Doji', short:'Open ≈ Close bovenaan, lange onderste wick. Sterke bullish afwijzing van lage prijzen.',
      hoe:'Open en close liggen (bijna) gelijk bovenaan de range. Lange onderste wick toont dat verkopers het probeerden maar kopers volledig terugkwamen. Geen of minimale bovenste wick.',
      wanneer:'Op support niveau na een daling. Sterker op Daily/H4. Entry bij close van de volgende bullish candle. SL net onder de low van de Dragonfly.',
      goud:'Hoe langer de onderste wick, hoe sterker de afwijzing. Een variant van de Hammer — maar hier sluit de candle exact op de open. Nog betrouwbaarder als er volume-piek is.' },
    EN:{ name:'Dragonfly Doji', short:'Open ≈ Close at the top, long lower wick. Strong bullish rejection of low prices.',
      hoe:'Open and close are nearly equal at the top of the range. Long lower wick shows sellers tried but buyers fully took back control. No or minimal upper wick.',
      wanneer:'At support level after a decline. Stronger on Daily/H4. Entry at close of the next bullish candle. SL just below the Dragonfly low.',
      goud:'The longer the lower wick, the stronger the rejection. A variant of the Hammer — but here the candle closes exactly at the open. Even more reliable with a volume spike.' }
  },
  { id:'gravestoneDoji', type:'bearish', candles:[{o:22,h:90,l:20,c:22}],
    NL:{ name:'Gravestone Doji', short:'Open ≈ Close onderaan, lange bovenste wick. Sterke bearish afwijzing van hoge prijzen.',
      hoe:'Open en close liggen (bijna) gelijk onderaan de range. Lange bovenste wick toont dat kopers het probeerden maar verkopers volledig terugkwamen. Geen of minimale onderste wick.',
      wanneer:'Op resistance niveau na een stijging. Entry bij close van de volgende bearish candle. SL net boven de high van de Gravestone.',
      goud:'Spiegelpatroon van de Dragonfly Doji. Hoe langer de bovenste wick, hoe sterker het signaal. Krachtigst op Daily en na een sterke rally.' },
    EN:{ name:'Gravestone Doji', short:'Open ≈ Close at the bottom, long upper wick. Strong bearish rejection of high prices.',
      hoe:'Open and close are nearly equal at the bottom of the range. Long upper wick shows buyers tried but sellers fully took back control. No or minimal lower wick.',
      wanneer:'At resistance level after a rise. Entry at close of the next bearish candle. SL just above the Gravestone high.',
      goud:'Mirror pattern of the Dragonfly Doji. The longer the upper wick, the stronger the signal. Most powerful on Daily and after a strong rally.' }
  },
  { id:'longleggedDoji', type:'neutral', candles:[{o:50,h:92,l:8,c:50}],
    NL:{ name:'Long-legged Doji', short:'Open ≈ Close in het midden, extreem lange wicks. Maximale indecisie op de markt.',
      hoe:'Open en close bijna gelijk in het midden van de range. Beide wicks zijn extreem lang en nagenoeg gelijk. De markt bewoog sterk in beide richtingen maar sloot onbeslist.',
      wanneer:'Na een sterke trend als waarschuwingsteken. Op key S/R als signaal dat de markt twijfelt. Vereist altijd bevestiging van de volgende candle vóór enige actie.',
      goud:'Hoe groter de totale range (hoog-laag), hoe groter de volatiliteit en dus de potentiële ommekeer. Veel gezien vóór grote nieuwsgebeurtenissen.' },
    EN:{ name:'Long-legged Doji', short:'Open ≈ Close in the middle, extremely long wicks. Maximum market indecision.',
      hoe:'Open and close nearly equal in the middle of the range. Both wicks are extremely long and nearly equal. The market moved strongly in both directions but closed undecided.',
      wanneer:'After a strong trend as a warning sign. At key S/R as a sign the market is hesitating. Always requires confirmation from the next candle before any action.',
      goud:'The larger the total range (high-low), the greater the volatility and potential reversal. Commonly seen before major news events.' }
  },

  // ── TWEE-KAARS PATRONEN ──
  { id:'bullishEngulfing', type:'bullish', candles:[{o:62,h:66,l:40,c:43},{o:37,h:76,l:35,c:73}],
    NL:{ name:'Bullish Engulfing', short:'Grote groene kaars omhult de vorige rode kaars volledig. Sterk bullish ommekeersignaal.',
      hoe:'Kaars 1: bearish (rood). Kaars 2: bullish die de volledige body van kaars 1 omhult. Open van kaars 2 is lager dan close van kaars 1. Close van kaars 2 is hoger dan open van kaars 1.',
      wanneer:'Na een daling, bij support niveau. Entry: open van de candle NA de engulfing. SL: onder de low van kaars 2. Hoe groter de engulfing, hoe sterker het signaal.',
      goud:'Één van de betrouwbaarste patronen. Krachtigst na een sterke neerwaartse move. Hoog volume bij kaars 2 bevestigt de ommekeer.' },
    EN:{ name:'Bullish Engulfing', short:'Large green candle fully engulfs the previous red candle. Strong bullish reversal signal.',
      hoe:'Candle 1: bearish (red). Candle 2: bullish that fully engulfs the entire body of candle 1. Open of candle 2 is below close of candle 1. Close of candle 2 is above open of candle 1.',
      wanneer:'After a decline, at support level. Entry: open of the candle AFTER the engulfing. SL: below the low of candle 2. The larger the engulfing, the stronger the signal.',
      goud:'One of the most reliable patterns. Most powerful after a strong downward move. High volume on candle 2 confirms the reversal.' }
  },
  { id:'bearishEngulfing', type:'bearish', candles:[{o:35,h:58,l:32,c:55},{o:62,h:65,l:22,c:25}],
    NL:{ name:'Bearish Engulfing', short:'Grote rode kaars omhult de vorige groene kaars volledig. Sterk bearish ommekeersignaal.',
      hoe:'Kaars 1: bullish (groen). Kaars 2: bearish die de volledige body van kaars 1 omhult. Open van kaars 2 is hoger dan close van kaars 1. Close van kaars 2 is lager dan open van kaars 1.',
      wanneer:'Na een stijging, bij resistance niveau. Entry: open van de candle NA de engulfing. SL: boven de high van kaars 2.',
      goud:'Krachtigst na een sterke opwaartse move. Bevestiging via hogere timeframe verhoogt betrouwbaarheid aanzienlijk.' },
    EN:{ name:'Bearish Engulfing', short:'Large red candle fully engulfs the previous green candle. Strong bearish reversal signal.',
      hoe:'Candle 1: bullish (green). Candle 2: bearish that fully engulfs the entire body of candle 1. Open of candle 2 is above close of candle 1. Close of candle 2 is below open of candle 1.',
      wanneer:'After a rise, at resistance level. Entry: open of the candle AFTER the engulfing. SL: above the high of candle 2.',
      goud:'Most powerful after a strong upward move. Higher timeframe confirmation significantly increases reliability.' }
  },
  { id:'bullishHarami', type:'bullish', candles:[{o:78,h:82,l:22,c:25},{o:38,h:54,l:36,c:52}],
    NL:{ name:'Bullish Harami', short:'Kleine groene kaars binnen de body van een grote rode kaars. Zwakker bullish signaal.',
      hoe:'"Harami" betekent "zwanger" in het Japans. Kaars 1: grote bearish candle. Kaars 2: kleine candle (groen of rood) volledig binnen de body van kaars 1. Body van kaars 2 kleiner dan 25% van kaars 1.',
      wanneer:'Na een daling, op support. Minder betrouwbaar dan de Engulfing — vereist sterke bevestiging. Wacht op een derde bullish candle als entry-bevestiging.',
      goud:'Geeft aan dat bearish momentum aan het afnemen is. Cross-variant (Harami Cross) waarbij kaars 2 een Doji is, is sterker.' },
    EN:{ name:'Bullish Harami', short:'Small green candle within the body of a large red candle. Weaker bullish signal.',
      hoe:'"Harami" means "pregnant" in Japanese. Candle 1: large bearish candle. Candle 2: small candle (green or red) completely within the body of candle 1. Body of candle 2 less than 25% of candle 1.',
      wanneer:'After a decline, at support. Less reliable than Engulfing — requires strong confirmation. Wait for a third bullish candle as entry confirmation.',
      goud:'Indicates bearish momentum is decreasing. Cross variant (Harami Cross) where candle 2 is a Doji is stronger.' }
  },
  { id:'bearishHarami', type:'bearish', candles:[{o:22,h:80,l:18,c:78},{o:58,h:65,l:48,c:52}],
    NL:{ name:'Bearish Harami', short:'Kleine rode kaars binnen de body van een grote groene kaars. Zwakker bearish signaal.',
      hoe:'Kaars 1: grote bullish candle. Kaars 2: kleine candle (rood of groen) volledig binnen de body van kaars 1. Geeft aan dat bullish momentum verzwakt.',
      wanneer:'Na een stijging, op resistance. Vereist bevestiging van een derde bearish candle voor entry. Zwakker patroon — gebruik bij voorkeur in combinatie met andere indicatoren.',
      goud:'Harami Cross (kaars 2 = Doji) is sterker. Werkt het beste op H4/Daily charts met duidelijke HTF resistance.' },
    EN:{ name:'Bearish Harami', short:'Small red candle within the body of a large green candle. Weaker bearish signal.',
      hoe:'Candle 1: large bullish candle. Candle 2: small candle (red or green) completely within the body of candle 1. Indicates bullish momentum is weakening.',
      wanneer:'After a rise, at resistance. Requires confirmation from a third bearish candle for entry. Weaker pattern — best used in combination with other indicators.',
      goud:'Harami Cross (candle 2 = Doji) is stronger. Works best on H4/Daily charts with clear HTF resistance.' }
  },
  { id:'piercingLine', type:'bullish', candles:[{o:78,h:82,l:28,c:30},{o:22,h:64,l:20,c:62}],
    NL:{ name:'Piercing Line', short:'Bullish kaars opent onder vorige low en sluit boven het midden. Bullish ommekeer.',
      hoe:'Kaars 1: grote bearish candle. Kaars 2: bullish, opent ONDER de low van kaars 1 (gap down) en sluit BOVEN het midden van de body van kaars 1 (meer dan 50% herstel).',
      wanneer:'Na een daling bij support. Sterker naarmate de bullish kaars dieper begint en verder in de bearish body sluit. Entry bij close boven kaars 1 open.',
      goud:'Pendant-tegenhanger van Dark Cloud Cover. Minimaal 50% penetratie van de vorige body is vereist. Minder dan 50% = zwakker signaal.' },
    EN:{ name:'Piercing Line', short:'Bullish candle opens below previous low and closes above midpoint. Bullish reversal.',
      hoe:'Candle 1: large bearish candle. Candle 2: bullish, opens BELOW the low of candle 1 (gap down) and closes ABOVE the midpoint of candle 1\'s body (more than 50% recovery).',
      wanneer:'After a decline at support. Stronger the deeper the bullish candle starts and further into the bearish body it closes. Entry at close above candle 1 open.',
      goud:'Counterpart to Dark Cloud Cover. Minimum 50% penetration of the previous body is required. Less than 50% = weaker signal.' }
  },
  { id:'darkCloud', type:'bearish', candles:[{o:22,h:75,l:20,c:72},{o:80,h:82,l:34,c:37}],
    NL:{ name:'Dark Cloud Cover', short:'Bearish kaars opent boven vorige high en sluit onder het midden. Bearish ommekeer.',
      hoe:'Kaars 1: grote bullish candle. Kaars 2: bearish, opent BOVEN de high van kaars 1 (gap up) en sluit ONDER het midden van de body van kaars 1 (meer dan 50% daling).',
      wanneer:'Na een stijging bij resistance. Sterker naarmate de bearish kaars hoger opent en verder in de bullish body sluit. Entry bij break onder de low van kaars 2.',
      goud:'Spiegelpatroon van Piercing Line. Minimaal 50% penetratie vereist. Volume-bevestiging is belangrijk.' },
    EN:{ name:'Dark Cloud Cover', short:'Bearish candle opens above previous high and closes below midpoint. Bearish reversal.',
      hoe:'Candle 1: large bullish candle. Candle 2: bearish, opens ABOVE the high of candle 1 (gap up) and closes BELOW the midpoint of candle 1\'s body (more than 50% decline).',
      wanneer:'After a rise at resistance. Stronger the higher the bearish candle opens and further into the bullish body it closes. Entry on break below candle 2 low.',
      goud:'Mirror pattern of Piercing Line. Minimum 50% penetration required. Volume confirmation is important.' }
  },

  { id:'tweezerBottom', type:'bullish', candles:[{o:68,h:72,l:20,c:22},{o:25,h:65,l:20,c:62}],
    NL:{ name:'Tweezer Bottom', short:'Twee kaarsen met exact dezelfde low. Dubbele afwijzing van een prijsniveau — bullish.',
      hoe:'Kaars 1: bearish candle met een lage low. Kaars 2: kaars met exact dezelfde low (wicks op hetzelfde niveau). De tweede kaars hoeft niet dezelfde kleur te hebben, maar is idealiter bullish. Toont sterke afwijzing van het niveau.',
      wanneer:'Op support of key S/R niveau. Ideaal na een neerwaartse trend. Entry bij close boven de high van kaars 2. SL net onder de gedeelde low.',
      goud:'Hoe preciezer de twee lows overeenkomen, hoe sterker het patroon. Wordt krachtig als het gedeelde niveau ook een technisch support is (EMA, pivot, vorig low).' },
    EN:{ name:'Tweezer Bottom', short:'Two candles with the exact same low. Double rejection of a price level — bullish.',
      hoe:'Candle 1: bearish candle with a low. Candle 2: candle with the exact same low (wicks at the same level). The second candle doesn\'t have to be the same color, but is ideally bullish. Shows strong rejection of the level.',
      wanneer:'At support or key S/R level. Ideal after a downtrend. Entry at close above the high of candle 2. SL just below the shared low.',
      goud:'The more precisely the two lows match, the stronger the pattern. Becomes very powerful if the shared level is also a technical support (EMA, pivot, previous low).' }
  },
  { id:'tweezerTop', type:'bearish', candles:[{o:35,h:80,l:32,c:78},{o:72,h:80,l:38,c:40}],
    NL:{ name:'Tweezer Top', short:'Twee kaarsen met exact dezelfde high. Dubbele afwijzing van een prijsniveau — bearish.',
      hoe:'Kaars 1: bullish candle met een hoge high. Kaars 2: kaars met exact dezelfde high. Toont dat de prijs tweemaal werd afgewezen op hetzelfde niveau — sterke resistance.',
      wanneer:'Op resistance of key S/R niveau. Ideaal na een opwaartse trend. Entry bij close onder de low van kaars 2. SL net boven de gedeelde high.',
      goud:'Spiegelpatroon van Tweezer Bottom. Extra krachtig als de gedeelde high samenvalt met een bekende resistance (vorige high, Fibonacci, pivot).' },
    EN:{ name:'Tweezer Top', short:'Two candles with the exact same high. Double rejection of a price level — bearish.',
      hoe:'Candle 1: bullish candle with a high. Candle 2: candle with the exact same high. Shows the price was rejected twice at the same level — strong resistance.',
      wanneer:'At resistance or key S/R level. Ideal after an uptrend. Entry at close below the low of candle 2. SL just above the shared high.',
      goud:'Mirror pattern of Tweezer Bottom. Extra powerful if the shared high coincides with a known resistance (previous high, Fibonacci, pivot).' }
  },
  { id:'insideBar', type:'neutral', candles:[{o:25,h:82,l:18,c:78},{o:55,h:68,l:38,c:42}],
    NL:{ name:'Inside Bar', short:'Kaars 2 valt volledig binnen de range van kaars 1. Consolidatie — potentiële uitbraak.',
      hoe:'Kaars 1 (mother bar): grote kaars die de range bepaalt. Kaars 2: volledige range (high én low) valt binnen de high-low range van kaars 1. Kleur van kaars 2 minder relevant. Geeft consolidatie en spanning aan vóór een uitbraak.',
      wanneer:'Trade de uitbraak: bij break boven de high van kaars 1 → long. Bij break onder de low van kaars 1 → short. SL aan de andere kant van de mother bar.',
      goud:'Hoe kleiner kaars 2 t.o.v. kaars 1, hoe groter de spanning en de potentiële move. Krachtigst op H4/Daily in een duidelijke trend als pullback-signaal.' },
    EN:{ name:'Inside Bar', short:'Candle 2 falls completely within the range of candle 1. Consolidation — potential breakout.',
      hoe:'Candle 1 (mother bar): large candle that sets the range. Candle 2: entire range (high and low) falls within the high-low range of candle 1. Color of candle 2 less relevant. Signals consolidation and tension before a breakout.',
      wanneer:'Trade the breakout: break above candle 1 high → long. Break below candle 1 low → short. SL on the other side of the mother bar.',
      goud:'The smaller candle 2 vs candle 1, the greater the tension and potential move. Most powerful on H4/Daily in a clear trend as a pullback signal.' }
  },
  { id:'bullishKicker', type:'bullish', candles:[{o:72,h:76,l:30,c:32},{o:72,h:90,l:70,c:88}],
    NL:{ name:'Bullish Kicker', short:'Gap-up: bearish kaars gevolgd door een bullish kaars die hoger opent. Explosief signaal.',
      hoe:'Kaars 1: bearish candle. Kaars 2: opent op of boven de open van kaars 1 (gap up) en is bullish. De twee kaarsen "kijken" van elkaar weg. Een van de krachtigste omkeerpatronen.',
      wanneer:'Na een daling. Vereist een gap bij open (makkelijker op dagelijkse charts). Entry direct bij open van kaars 2 of bij bevestiging. SL onder de low van kaars 2.',
      goud:'Ontstaat vaak door onverwachts positief nieuws buiten markturen. Zeldzaam maar extreem betrouwbaar. Op Forex (24h markt) zichtbaar na weekendgaps of grote events.' },
    EN:{ name:'Bullish Kicker', short:'Gap-up: bearish candle followed by a bullish candle opening higher. Explosive signal.',
      hoe:'Candle 1: bearish candle. Candle 2: opens at or above the open of candle 1 (gap up) and is bullish. The two candles "face away" from each other. One of the most powerful reversal patterns.',
      wanneer:'After a decline. Requires a gap at open (easier on daily charts). Entry directly at open of candle 2 or on confirmation. SL below candle 2 low.',
      goud:'Often caused by unexpectedly positive news outside market hours. Rare but extremely reliable. On Forex (24h market) visible after weekend gaps or major events.' }
  },
  { id:'bearishKicker', type:'bearish', candles:[{o:28,h:72,l:24,c:68},{o:28,h:30,l:10,c:12}],
    NL:{ name:'Bearish Kicker', short:'Gap-down: bullish kaars gevolgd door bearish kaars die lager opent. Explosief bearish signaal.',
      hoe:'Kaars 1: bullish candle. Kaars 2: opent op of onder de open van kaars 1 (gap down) en is bearish. Geeft een plotse en krachtige koersommekeer aan.',
      wanneer:'Na een stijging. Entry bij open van kaars 2 of bij bevestiging. SL boven de high van kaars 2.',
      goud:'Spiegelpatroon van Bullish Kicker. Ontstaat door onverwachts negatief nieuws. Zeldzaam maar een van de meest betrouwbare bearish patronen.' },
    EN:{ name:'Bearish Kicker', short:'Gap-down: bullish candle followed by a bearish candle opening lower. Explosive bearish signal.',
      hoe:'Candle 1: bullish candle. Candle 2: opens at or below the open of candle 1 (gap down) and is bearish. Signals a sudden and powerful price reversal.',
      wanneer:'After a rise. Entry at open of candle 2 or on confirmation. SL above candle 2 high.',
      goud:'Mirror pattern of Bullish Kicker. Caused by unexpectedly negative news. Rare but one of the most reliable bearish patterns.' }
  },

  // ── DRIE-KAARS PATRONEN ──
  { id:'morningStar', type:'bullish', candles:[{o:78,h:81,l:42,c:44},{o:38,h:42,l:30,c:34},{o:36,h:74,l:33,c:72}],
    NL:{ name:'Morning Star', short:'Drie-kaars bullish ommekeer: grote rode — kleine star — grote groene. Sterk signaal.',
      hoe:'Kaars 1: grote bearish candle. Kaars 2: kleine candle (Doji of spinning top) die lager opent — de "star". Kaars 3: grote bullish candle die sluit boven het midden van kaars 1.',
      wanneer:'Na een daling op key support. Één van de sterkste bullish ommekeersignalen. Entry: open van de kaars NA kaars 3, of bij close van kaars 3. SL: onder de low van kaars 2.',
      goud:'Morning Doji Star (kaars 2 is een Doji) is nog sterker. Krachtigst op Daily/H4. Hogere timeframe confluence verhoogt betrouwbaarheid sterk.' },
    EN:{ name:'Morning Star', short:'Three-candle bullish reversal: large red — small star — large green. Strong signal.',
      hoe:'Candle 1: large bearish candle. Candle 2: small candle (Doji or spinning top) opening lower — the "star". Candle 3: large bullish candle closing above the midpoint of candle 1.',
      wanneer:'After a decline at key support. One of the strongest bullish reversal signals. Entry: open of candle after candle 3, or at close of candle 3. SL: below the low of candle 2.',
      goud:'Morning Doji Star (candle 2 is a Doji) is even stronger. Most powerful on Daily/H4. Higher timeframe confluence greatly increases reliability.' }
  },
  { id:'eveningStar', type:'bearish', candles:[{o:25,h:68,l:22,c:66},{o:70,h:78,l:68,c:74},{o:72,h:74,l:28,c:30}],
    NL:{ name:'Evening Star', short:'Drie-kaars bearish ommekeer: grote groene — kleine star — grote rode. Sterk signaal.',
      hoe:'Kaars 1: grote bullish candle. Kaars 2: kleine candle (Doji of spinning top) die hoger opent — de "star". Kaars 3: grote bearish candle die sluit onder het midden van kaars 1.',
      wanneer:'Na een stijging op key resistance. Spiegelpatroon van Morning Star. Entry: open van de kaars NA kaars 3. SL: boven de high van kaars 2.',
      goud:'Evening Doji Star is sterker. Verschijnt vaak aan het einde van een langere uptrend. Bevestig altijd met hogere timeframe resistance.' },
    EN:{ name:'Evening Star', short:'Three-candle bearish reversal: large green — small star — large red. Strong signal.',
      hoe:'Candle 1: large bullish candle. Candle 2: small candle (Doji or spinning top) opening higher — the "star". Candle 3: large bearish candle closing below the midpoint of candle 1.',
      wanneer:'After a rise at key resistance. Mirror pattern of Morning Star. Entry: open of candle after candle 3. SL: above the high of candle 2.',
      goud:'Evening Doji Star is stronger. Often appears at the end of a longer uptrend. Always confirm with higher timeframe resistance.' }
  },
  { id:'threeWhiteSoldiers', type:'bullish', candles:[{o:20,h:46,l:18,c:44},{o:40,h:64,l:38,c:62},{o:58,h:82,l:56,c:80}],
    NL:{ name:'Three White Soldiers', short:'Drie opeenvolgende bullish kaarsen. Sterk continuatiesignaal.',
      hoe:'Drie opeenvolgende groene kaarsen. Elke kaars opent binnen de body van de vorige. Elke kaars sluit hoger dan de vorige. Kleine of geen wicks. Toont aanhoudende koopdruk.',
      wanneer:'Na een omkeerpunt of consolidatie als bevestiging van een nieuwe uptrend. Niet te laat instappen — wacht op een pullback naar de eerste soldaat voor betere entry.',
      goud:'Na een lange daling is dit een van de sterkste bullish signalen. Als kaarsen te groot worden = overextended, wacht op pullback.' },
    EN:{ name:'Three White Soldiers', short:'Three consecutive bullish candles. Strong continuation signal.',
      hoe:'Three consecutive green candles. Each candle opens within the body of the previous. Each candle closes higher than the previous. Small or no wicks. Shows sustained buying pressure.',
      wanneer:'After a reversal point or consolidation as confirmation of a new uptrend. Don\'t enter too late — wait for a pullback to the first soldier for better entry.',
      goud:'After a long decline this is one of the strongest bullish signals. If candles become too large = overextended, wait for pullback.' }
  },
  { id:'threeBlackCrows', type:'bearish', candles:[{o:82,h:84,l:55,c:57},{o:60,h:62,l:35,c:37},{o:40,h:42,l:18,c:20}],
    NL:{ name:'Three Black Crows', short:'Drie opeenvolgende bearish kaarsen. Sterk bearish continuatiesignaal.',
      hoe:'Drie opeenvolgende rode kaarsen. Elke kaars opent binnen de body van de vorige. Elke kaars sluit lager dan de vorige. Kleine of geen wicks. Toont aanhoudende verkoopdruk.',
      wanneer:'Na een omkeerpunt of consolidatie als bevestiging van een nieuwe downtrend. Bevestig altijd met hogere timeframe bearish bias.',
      goud:'Spiegelpatroon van Three White Soldiers. Verschijnt vaak na slecht economisch nieuws of bij bearish fundamentals. Niet te laat short gaan.' },
    EN:{ name:'Three Black Crows', short:'Three consecutive bearish candles. Strong bearish continuation signal.',
      hoe:'Three consecutive red candles. Each candle opens within the body of the previous. Each candle closes lower than the previous. Small or no wicks. Shows sustained selling pressure.',
      wanneer:'After a reversal point or consolidation as confirmation of a new downtrend. Always confirm with higher timeframe bearish bias.',
      goud:'Mirror pattern of Three White Soldiers. Often appears after bad economic news or bearish fundamentals. Don\'t go short too late.' }
  },
  { id:'threeInsideUp', type:'bullish', candles:[{o:78,h:82,l:22,c:25},{o:38,h:54,l:36,c:52},{o:48,h:84,l:46,c:82}],
    NL:{ name:'Three Inside Up', short:'Bullish Harami gevolgd door een bevestigingscandle. Sterk bullish ommekeersignaal.',
      hoe:'Kaars 1: grote bearish candle. Kaars 2: kleine bullish candle binnen de body van kaars 1 (Bullish Harami). Kaars 3: bullish candle die sluit boven de high van kaars 1. De derde kaars is de krachtige bevestiging.',
      wanneer:'Na een daling op support. Entry bij close van kaars 3 boven de high van kaars 1. SL onder de low van kaars 1.',
      goud:'Betrouwbaarder dan de Bullish Harami alleen doordat kaars 3 de omkeer bevestigt. Werkt uitstekend op H4/Daily als reversal-bevestiging.' },
    EN:{ name:'Three Inside Up', short:'Bullish Harami followed by a confirmation candle. Strong bullish reversal signal.',
      hoe:'Candle 1: large bearish candle. Candle 2: small bullish candle within candle 1\'s body (Bullish Harami). Candle 3: bullish candle closing above candle 1\'s high. The third candle is the powerful confirmation.',
      wanneer:'After a decline at support. Entry at close of candle 3 above the high of candle 1. SL below the low of candle 1.',
      goud:'More reliable than the Bullish Harami alone because candle 3 confirms the reversal. Works excellently on H4/Daily as a reversal confirmation.' }
  },
  { id:'threeInsideDown', type:'bearish', candles:[{o:22,h:80,l:18,c:78},{o:58,h:65,l:48,c:52},{o:55,h:57,l:18,c:20}],
    NL:{ name:'Three Inside Down', short:'Bearish Harami gevolgd door een bevestigingscandle. Sterk bearish ommekeersignaal.',
      hoe:'Kaars 1: grote bullish candle. Kaars 2: kleine bearish candle binnen de body van kaars 1 (Bearish Harami). Kaars 3: bearish candle die sluit onder de low van kaars 1. Volledige bevestiging van de ommekeer.',
      wanneer:'Na een stijging op resistance. Entry bij close van kaars 3 onder de low van kaars 1. SL boven de high van kaars 1.',
      goud:'Spiegelpatroon van Three Inside Up. Betrouwbaarder dan Bearish Harami alleen. Ideaal op H4/Daily op duidelijke resistance niveaus.' },
    EN:{ name:'Three Inside Down', short:'Bearish Harami followed by a confirmation candle. Strong bearish reversal signal.',
      hoe:'Candle 1: large bullish candle. Candle 2: small bearish candle within candle 1\'s body (Bearish Harami). Candle 3: bearish candle closing below candle 1\'s low. Full reversal confirmation.',
      wanneer:'After a rise at resistance. Entry at close of candle 3 below the low of candle 1. SL above the high of candle 1.',
      goud:'Mirror pattern of Three Inside Up. More reliable than Bearish Harami alone. Ideal on H4/Daily at clear resistance levels.' }
  },
  { id:'threeOutsideUp', type:'bullish', candles:[{o:62,h:66,l:40,c:43},{o:37,h:76,l:35,c:73},{o:70,h:88,l:68,c:86}],
    NL:{ name:'Three Outside Up', short:'Bullish Engulfing gevolgd door een sterke bevestigingscandle. Zeer betrouwbaar.',
      hoe:'Kaars 1: kleine bearish candle. Kaars 2: bullish engulfing die kaars 1 volledig omhult. Kaars 3: bullish candle die sluit boven de close van kaars 2. Drie-kaars bevestiging van de ommekeer.',
      wanneer:'Na een daling op support. Entry bij open van kaars 3 of bij close. SL onder de low van kaars 2.',
      goud:'Combineert de kracht van de Bullish Engulfing met een extra bevestigingscandle. Één van de betrouwbaarste bullish signalen op H4 en Daily.' },
    EN:{ name:'Three Outside Up', short:'Bullish Engulfing followed by a strong confirmation candle. Very reliable.',
      hoe:'Candle 1: small bearish candle. Candle 2: bullish engulfing that fully engulfs candle 1. Candle 3: bullish candle closing above the close of candle 2. Three-candle reversal confirmation.',
      wanneer:'After a decline at support. Entry at open of candle 3 or at close. SL below the low of candle 2.',
      goud:'Combines the power of Bullish Engulfing with an extra confirmation candle. One of the most reliable bullish signals on H4 and Daily.' }
  },
  { id:'threeOutsideDown', type:'bearish', candles:[{o:35,h:58,l:32,c:55},{o:62,h:65,l:22,c:25},{o:28,h:30,l:10,c:12}],
    NL:{ name:'Three Outside Down', short:'Bearish Engulfing gevolgd door een sterke bevestigingscandle. Zeer betrouwbaar bearish signaal.',
      hoe:'Kaars 1: kleine bullish candle. Kaars 2: bearish engulfing die kaars 1 volledig omhult. Kaars 3: bearish candle die sluit onder de close van kaars 2. Krachtige drie-kaars bevestiging van de neerwaartse ommekeer.',
      wanneer:'Na een stijging op resistance. Entry bij open of close van kaars 3. SL boven de high van kaars 2.',
      goud:'Spiegelpatroon van Three Outside Up. Betrouwbaarder dan de Bearish Engulfing alleen. Werkt het best op H4/Daily.' },
    EN:{ name:'Three Outside Down', short:'Bearish Engulfing followed by a strong confirmation candle. Very reliable bearish signal.',
      hoe:'Candle 1: small bullish candle. Candle 2: bearish engulfing that fully engulfs candle 1. Candle 3: bearish candle closing below the close of candle 2. Powerful three-candle confirmation of the downward reversal.',
      wanneer:'After a rise at resistance. Entry at open or close of candle 3. SL above the high of candle 2.',
      goud:'Mirror pattern of Three Outside Up. More reliable than Bearish Engulfing alone. Works best on H4/Daily.' }
  },
  { id:'abandonedBaby', type:'bullish', candles:[{o:78,h:80,l:38,c:40},{o:30,h:34,l:26,c:30},{o:42,h:80,l:40,c:78}],
    NL:{ name:'Abandoned Baby (Bullish)', short:'Doji met gap aan beide kanten omringd door bearish en bullish kaars. Zeldzaam maar extreem krachtig.',
      hoe:'Kaars 1: grote bearish candle. Kaars 2: Doji die met een gap lager opent (de "baby" — geïsoleerd van beide kanten). Kaars 3: grote bullish candle die met een gap hoger opent dan de Doji. Alle drie de kaarsen zijn van elkaar gescheiden door gaps.',
      wanneer:'Na een sterke daling. Zeldzaam op Forex maar krachtig op dagelijkse charts. Entry bij open van kaars 4. SL net onder de low van de Doji.',
      goud:'Een van de zeldzaamste en meest betrouwbare patronen. De isolatie van de Doji (gaps aan beide kanten) is de sleutel. Op Forex zijn echte gaps zeldzaam — zoek naar kaarsen met minimale overlap.' },
    EN:{ name:'Abandoned Baby (Bullish)', short:'Doji gapped away on both sides surrounded by bearish and bullish candle. Rare but extremely powerful.',
      hoe:'Candle 1: large bearish candle. Candle 2: Doji that gaps lower (the "baby" — isolated on both sides). Candle 3: large bullish candle that gaps higher than the Doji. All three candles are separated by gaps.',
      wanneer:'After a strong decline. Rare on Forex but powerful on daily charts. Entry at open of candle 4. SL just below the Doji low.',
      goud:'One of the rarest and most reliable patterns. The isolation of the Doji (gaps on both sides) is key. On Forex real gaps are rare — look for candles with minimal overlap.' }
  },
];

function renderCandleCards(query) {
  const l = currentLang;
  const q = (query||'').toLowerCase().trim();
  const grid = $('learnGrid');
  const noRes = $('learnNoResults');
  if(!grid) return;

  let items = CANDLE_DATA;
  if(q) items = items.filter(item => {
    const d = item[l] || item['NL'];
    return [d.name, d.short, d.hoe, d.wanneer].some(t => t?.toLowerCase().includes(q));
  });

  if(!items.length){
    grid.innerHTML='';
    if(noRes){ noRes.style.display='block'; $('learnSearchTerm').textContent=query; }
    return;
  }
  if(noRes) noRes.style.display='none';

  const typeLabel = { bullish:{ NL:'Bullish', EN:'Bullish' }, bearish:{ NL:'Bearish', EN:'Bearish' }, neutral:{ NL:'Neutraal', EN:'Neutral' } };
  const typeCls   = { bullish:'candle-bull', bearish:'candle-bear', neutral:'candle-neut' };
  const countLabel = { NL: n => n===1?'1 kaars':n+' kaarsen', EN: n => n===1?'1 candle':n+' candles' };
  const moreLabel  = { NL:'▸ Meer uitleg', EN:'▸ More detail' };
  const howLabel   = { NL:'Hoe herkennen', EN:'How to identify' };
  const whenLabel  = { NL:'Wanneer handelen', EN:'When to trade' };
  const goldLabel  = { NL:'💡 Pro tip', EN:'💡 Pro tip' };

  grid.innerHTML = items.map(item => {
    const d = item[l] || item['NL'];
    const svg = renderCandleSVG(item.candles, 120, 96);
    const tl = typeLabel[item.type]?.[l] || item.type;
    const tc = typeCls[item.type] || 'candle-neut';
    const cnt = countLabel[l](item.candles.length);

    return `<div class="candle-card" id="ccard-${item.id}">
      <div class="candle-card-top">
        <div class="candle-svg-wrap">${svg}</div>
        <div class="candle-card-info">
          <div class="candle-card-name">${d.name}</div>
          <div><span class="candle-type-pill ${tc}">${tl}</span> <span style="font-size:10px;color:var(--muted);">${cnt}</span></div>
          <div class="candle-short">${d.short}</div>
        </div>
      </div>
      <button class="candle-toggle" onclick="toggleCandleDetail('${item.id}', this)">
        <span class="cdt-icon">▸</span> ${moreLabel[l]}
      </button>
      <div class="candle-detail" id="cdetail-${item.id}">
        <div class="candle-detail-section">
          <div class="candle-detail-label">${howLabel[l]}</div>
          <div>${d.hoe}</div>
        </div>
        <div class="candle-detail-section">
          <div class="candle-detail-label">${whenLabel[l]}</div>
          <div>${d.wanneer}</div>
        </div>
        <div class="candle-detail-section">
          <div class="candle-detail-label" style="color:var(--amber);">${goldLabel[l]}</div>
          <div style="padding:8px 12px;background:rgba(245,166,35,0.07);border-radius:6px;border-left:3px solid var(--amber);">${d.goud}</div>
        </div>
      </div>
    </div>`;
  }).join('');
}

function toggleCandleDetail(id, btn) {
  const detail = $('cdetail-' + id);
  if(!detail) return;
  const open = detail.classList.toggle('open');
  const icon = btn?.querySelector('.cdt-icon');
  if(icon) icon.textContent = open ? '▾' : '▸';
  if(btn) btn.style.color = open ? 'var(--muted)' : 'var(--accent)';
}

// ================================================================
// TAALSWITCH  (NL ↔ EN)
// ================================================================
let currentLang = 'NL';

const I18N = {
  tabs: {
    NL: ['Voorbereiding','Statistieken','Entry Checklist','Positie Calc','Trade Journal','Trade Analyse','Markt Analyse','📚 Leren'],
    EN: ['Preparation','Statistics','Entry Checklist','Position Calc','Trade Journal','Trade Analysis','Market Analysis','📚 Learn']
  },
  keys: {
    'cat-all':       { NL:'Alles',            EN:'All' },
    'cat-basics':    { NL:'Basis',            EN:'Basics' },
    'cat-priceaction':{ NL:'Price Action',    EN:'Price Action' },
    'cat-riskmanagement':{ NL:'Risk Management', EN:'Risk Management' },
    'cat-indicators':{ NL:'Indicatoren',      EN:'Indicators' },
    'cat-strategies':{ NL:'Strategieën',      EN:'Strategies' },
    'cat-psychology':{ NL:'Psychologie',      EN:'Psychology' },
    'learn-search-placeholder': { NL:'Zoek term of strategie...', EN:'Search term or strategy...' },
  }
};

function toggleLang() {
  currentLang = currentLang === 'NL' ? 'EN' : 'NL';
  try { localStorage.setItem('fxLang', currentLang); } catch(e) {}
  applyLang();
}

function applyLang() {
  const l = currentLang;
  // Toggle knop label
  const lbl = $('langLabel'); if(lbl) lbl.textContent = l === 'NL' ? 'EN' : 'NL';

  // Nav tabs
  const tabs = document.querySelectorAll('nav .tab');
  const tabLabels = I18N.tabs[l];
  tabs.forEach((t, i) => { if(tabLabels[i]) t.innerHTML = tabLabels[i]; });

  // Leer categorie knoppen
  const catMap = { all:'cat-all', basics:'cat-basics', priceaction:'cat-priceaction',
                   riskmanagement:'cat-riskmanagement', indicators:'cat-indicators',
                   strategies:'cat-strategies', psychology:'cat-psychology' };
  document.querySelectorAll('#learnCatTabs .tf-btn').forEach(btn => {
    const cat = btn.getAttribute('data-cat');
    if(cat && catMap[cat] && I18N.keys[catMap[cat]]) btn.textContent = I18N.keys[catMap[cat]][l];
  });

  // Zoekbalk placeholder
  const ls = $('learnSearch'); if(ls) ls.placeholder = I18N.keys['learn-search-placeholder'][l];

  // Herrender leer-kaarten in juiste taal
  renderLearnCards(currentLearnCat, $('learnSearch')?.value || '');
}

function loadLang() {
  try { const s = localStorage.getItem('fxLang'); if(s) currentLang = s; } catch(e) {}
  applyLang();
}

// ================================================================
// LEER-TAB  — Terminology & Strategieën
// ================================================================
let currentLearnCat = 'all';

const LEARN_DATA = [
  // ── BASICS ──
  { id:'pip', cat:'basics',
    NL:{ term:'Pip', short:'Kleinste prijsbeweging in forex.',
      body:'Een pip (percentage in point) is voor de meeste valutaparen de vierde decimaal (0.0001). Bij EUR/USD is een beweging van 1.0850 naar 1.0851 dus 1 pip. Bij JPY-paren is het de tweede decimaal (0.01).',
      example:'EUR/USD beweegt van 1.08500 → 1.08510 = 1 pip omhoog.' },
    EN:{ term:'Pip', short:'Smallest price movement in forex.',
      body:'A pip (percentage in point) is for most currency pairs the fourth decimal (0.0001). In EUR/USD, a move from 1.0850 to 1.0851 is 1 pip. For JPY pairs it is the second decimal (0.01).',
      example:'EUR/USD moves from 1.08500 → 1.08510 = 1 pip up.' }
  },
  { id:'spread', cat:'basics',
    NL:{ term:'Spread', short:'Verschil tussen bied- en vraagprijs — de kosten van een trade.',
      body:'De spread is het verschil tussen de Ask (koopprijs) en de Bid (verkoopprijs). Dit is de voornaamste kostenpost bij forex traden. Een lagere spread = goedkoper traden. EUR/USD heeft typisch een spread van 0.1–0.6 pip bij grote brokers.',
      example:'Bid: 1.08500 / Ask: 1.08506 → spread = 0.6 pip.' },
    EN:{ term:'Spread', short:'Difference between bid and ask — the cost of a trade.',
      body:'The spread is the difference between the Ask (buy price) and the Bid (sell price). This is the main cost when trading forex. A lower spread = cheaper trading. EUR/USD typically has a spread of 0.1–0.6 pip at major brokers.',
      example:'Bid: 1.08500 / Ask: 1.08506 → spread = 0.6 pip.' }
  },
  { id:'lot', cat:'basics',
    NL:{ term:'Lot grootte', short:'Standaardeenheid voor handelsvolume in forex.',
      body:'1 standaard lot = 100.000 eenheden basisvaluta. Voor EUR/USD betekent 1 lot dat je €100.000 koopt of verkoopt. Andere groottes: mini lot = 0.1 (€10.000), micro lot = 0.01 (€1.000). De pip-waarde bij 1 standaard lot EUR/USD = €10 per pip.',
      example:'0.10 lot EUR/USD = €1 per pip. Bij 20 pip winst = €20 winst.' },
    EN:{ term:'Lot size', short:'Standard unit for trading volume in forex.',
      body:'1 standard lot = 100,000 units of the base currency. For EUR/USD, 1 lot means you buy or sell €100,000. Other sizes: mini lot = 0.1 (€10,000), micro lot = 0.01 (€1,000). Pip value for 1 standard lot EUR/USD = €10 per pip.',
      example:'0.10 lot EUR/USD = €1 per pip. With 20 pip profit = €20 profit.' }
  },
  { id:'leverage', cat:'basics',
    NL:{ term:'Leverage (hefboom)', short:'Handelen met geleend kapitaal om positie te vergroten.',
      body:'Leverage laat je een grotere positie openen dan je kapitaal. Met 1:30 leverage kun je met €1.000 een positie van €30.000 openen. Voordeel: grotere winsten bij kleine bewegingen. Risico: ook grotere verliezen. EU-regulering beperkt retail leverage tot 1:30 voor majors.',
      example:'Account €1.000, leverage 1:30 → max positie €30.000 (0.30 lot EUR/USD).' },
    EN:{ term:'Leverage', short:'Trading with borrowed capital to increase position size.',
      body:'Leverage lets you open a larger position than your capital. With 1:30 leverage you can open a €30,000 position with €1,000. Advantage: larger profits on small moves. Risk: also larger losses. EU regulation limits retail leverage to 1:30 for majors.',
      example:'Account €1,000, leverage 1:30 → max position €30,000 (0.30 lot EUR/USD).' }
  },
  { id:'rratio', cat:'basics',
    NL:{ term:'R:R Ratio (Risk:Reward)', short:'Verhouding tussen potentieel verlies en potentiële winst.',
      body:'De R:R ratio vergelijkt hoeveel je riskeert tegenover hoeveel je kunt verdienen. Een ratio van 1:2 betekent: je riskeert €50 om €100 te verdienen. Minimaal 1:2 wordt aanbevolen. Met een winrate van 40% ben je al winstgevend bij een R:R van 1:2.',
      example:'SL = 20 pip, TP = 40 pip → R:R = 1:2. Bij 40% winrate: 4 wins × 40 - 6 losses × 20 = +40 pip netto.' },
    EN:{ term:'R:R Ratio (Risk:Reward)', short:'Ratio between potential loss and potential gain.',
      body:'The R:R ratio compares how much you risk versus how much you can earn. A ratio of 1:2 means: you risk €50 to earn €100. A minimum of 1:2 is recommended. With a win rate of 40% you are already profitable at 1:2 R:R.',
      example:'SL = 20 pip, TP = 40 pip → R:R = 1:2. At 40% win rate: 4 wins × 40 - 6 losses × 20 = +40 pip net.' }
  },
  { id:'margin', cat:'basics',
    NL:{ term:'Margin', short:'Vereist onderpand om een leveraged positie open te houden.',
      body:'Margin is het bedrag dat je broker reserveert als onderpand voor een open positie. Dit is NIET je verlies — het is tijdelijk geblokkeerd kapitaal. Bij een margin call heb je te weinig vrije margin en wordt je positie automatisch gesloten.',
      example:'1 lot EUR/USD bij 1:30 leverage → margin = €100.000 / 30 = €3.333 vereist.' },
    EN:{ term:'Margin', short:'Required collateral to keep a leveraged position open.',
      body:'Margin is the amount your broker reserves as collateral for an open position. This is NOT your loss — it is temporarily blocked capital. In a margin call you have insufficient free margin and your position is automatically closed.',
      example:'1 lot EUR/USD at 1:30 leverage → margin = €100,000 / 30 = €3,333 required.' }
  },

  // ── PRICE ACTION ──
  { id:'supportresistance', cat:'priceaction',
    NL:{ term:'Support & Resistance', short:'Horizontale zones waar prijs herhaaldelijk stuit of keert.',
      body:'Support is een prijszone waar koopdruk historisch sterk genoeg was om een daling te stoppen. Resistance is het omgekeerde. Hoe vaker een level getest wordt zonder doorbraak, hoe sterker het is. Na een doorbraak kan het level van rol wisselen (support wordt resistance en vice versa).',
      example:'EUR/USD stuitte drie keer op 1.0850 → sterk support level. Na doorbraak wordt 1.0850 nieuwe resistance.' },
    EN:{ term:'Support & Resistance', short:'Horizontal zones where price repeatedly stalls or reverses.',
      body:'Support is a price zone where buying pressure was historically strong enough to stop a decline. Resistance is the opposite. The more often a level is tested without a breakout, the stronger it is. After a breakout, the level can switch roles (support becomes resistance).',
      example:'EUR/USD bounced three times at 1.0850 → strong support level. After break, 1.0850 becomes new resistance.' }
  },
  { id:'pinbar', cat:'priceaction',
    NL:{ term:'Pin Bar', short:'Kaarsenpatroon met lange wick — wijst op prijsafwijzing.',
      body:'Een pin bar (ook: hammer/shooting star) heeft een kleine body en een lange wick. De lange wick toont dat prijs ver bewoog maar werd afgewezen door de markt. Bullish pin bar: lange onderste wick op support → koop signaal. Bearish pin bar: lange bovenste wick op resistance → verkoop signaal.',
      example:'EUR/USD raakt support 1.0850, vormt een bullish pin bar met lange wick omlaag → long entry boven de high van de pin bar.' },
    EN:{ term:'Pin Bar', short:'Candlestick pattern with long wick — indicates price rejection.',
      body:'A pin bar (also: hammer/shooting star) has a small body and a long wick. The long wick shows that price moved far but was rejected by the market. Bullish pin bar: long lower wick at support → buy signal. Bearish pin bar: long upper wick at resistance → sell signal.',
      example:'EUR/USD touches support 1.0850, forms a bullish pin bar with long lower wick → long entry above the high of the pin bar.' }
  },
  { id:'engulfing', cat:'priceaction',
    NL:{ term:'Engulfing candle', short:'Kaars die de vorige volledig omsluit — sterke ommekeer.',
      body:'Een bullish engulfing is een grote groene kaars die de vorige rode kaars volledig omsluit. Verschijnt na een daling en signaleert een mogelijke omkering naar boven. Bearish engulfing is het omgekeerde. Hoe groter de engulfing kaars ten opzichte van de vorige, hoe sterker het signaal.',
      example:'Op H1: rode kaars (body 15 pip), daarna groene kaars die de volledige rode kaars overspant (body 22 pip) → bullish engulfing, zoek long.' },
    EN:{ term:'Engulfing candle', short:'Candle that completely engulfs the previous — strong reversal.',
      body:'A bullish engulfing is a large green candle that completely engulfs the previous red candle. Appears after a decline and signals a possible reversal upward. Bearish engulfing is the opposite. The larger the engulfing candle relative to the previous, the stronger the signal.',
      example:'On H1: red candle (body 15 pip), then green candle spanning the entire red candle (body 22 pip) → bullish engulfing, look for long.' }
  },
  { id:'breakretest', cat:'priceaction',
    NL:{ term:'Break & Retest', short:'Prijs breekt door een level en keert terug om het te testen.',
      body:'Na een doorbraak van een key level keert prijs vaak terug om het gebroken level te "retesten" als nieuw support/resistance. Dit geeft een lage-risico entry met een nauw stop-loss net voorbij het level.',
      example:'Resistance 1.0900 doorbroken → prijs stijgt naar 1.0930, daalt terug naar 1.0900, houdt daar → long entry op retest met SL onder 1.0895.' },
    EN:{ term:'Break & Retest', short:'Price breaks through a level and returns to test it.',
      body:'After a breakout of a key level, price often returns to "retest" the broken level as new support/resistance. This provides a low-risk entry with a tight stop-loss just beyond the level.',
      example:'Resistance 1.0900 broken → price rises to 1.0930, drops back to 1.0900, holds there → long entry on retest with SL below 1.0895.' }
  },
  { id:'higherlow', cat:'priceaction',
    NL:{ term:'Higher High / Higher Low', short:'Opeenvolgende hogere toppen en bodems = uptrend.',
      body:'Een uptrend bestaat uit higher highs (HH) en higher lows (HL). Elke rally bereikt een hogere top dan de vorige, en elke correctie stopt op een hoger niveau dan de vorige bodem. Zolang dit patroon intact is, handel je bij voorkeur long. Een lower low doorbreekt de structuur.',
      example:'EUR/USD: bodem 1.0800 → top 1.0920 → bodem 1.0860 (HL) → top 1.0950 (HH) = bevestigde uptrend.' },
    EN:{ term:'Higher High / Higher Low', short:'Successive higher peaks and troughs = uptrend.',
      body:'An uptrend consists of higher highs (HH) and higher lows (HL). Each rally reaches a higher peak than the previous one, and each correction stops at a higher level than the previous trough. As long as this pattern is intact, you preferably trade long. A lower low breaks the structure.',
      example:'EUR/USD: low 1.0800 → high 1.0920 → low 1.0860 (HL) → high 1.0950 (HH) = confirmed uptrend.' }
  },

  // ── RISK MANAGEMENT ──
  { id:'positionsizing', cat:'riskmanagement',
    NL:{ term:'Positiegrootte berekenen', short:'Bereken de juiste lot grootte op basis van risico % en stop-loss.',
      body:'Formule: Lot = (Account × Risico%) / (SL in pips × Pip-waarde)\n\nBij EUR/USD: pip-waarde = €10 per pip per standaard lot. Bij 0.10 lot = €1/pip.\n\nStap 1: Bepaal max risico (bv. 1% van €5.000 = €50)\nStap 2: Bepaal SL afstand (bv. 20 pip)\nStap 3: Lot = €50 / (20 × €10) = 0.25 lot',
      example:'Account €5.000, risico 1% = €50, SL 20 pip → lot = 50 / 200 = 0.25 lot.' },
    EN:{ term:'Position sizing', short:'Calculate the correct lot size based on risk % and stop-loss.',
      body:'Formula: Lot = (Account × Risk%) / (SL in pips × Pip value)\n\nFor EUR/USD: pip value = €10 per pip per standard lot. At 0.10 lot = €1/pip.\n\nStep 1: Determine max risk (e.g. 1% of €5,000 = €50)\nStep 2: Determine SL distance (e.g. 20 pips)\nStep 3: Lot = €50 / (20 × €10) = 0.25 lot',
      example:'Account €5,000, risk 1% = €50, SL 20 pips → lot = 50 / 200 = 0.25 lot.' }
  },
  { id:'maxdrawdown', cat:'riskmanagement',
    NL:{ term:'Max Drawdown', short:'Grootste procentuele daling van het account vanaf een piek.',
      body:'Drawdown meet hoe ver je account is gedaald vanaf het hoogste punt. Een drawdown van 20% op €10.000 = €2.000 verlies. Hoe groter de drawdown, hoe moeilijker het herstel (20% verlies vereist 25% winst om te herstellen; 50% verlies vereist 100% winst).',
      example:'Account groeit van €5.000 naar €7.000, daalt dan naar €5.600 → drawdown = (7.000-5.600)/7.000 = 20%.' },
    EN:{ term:'Max Drawdown', short:'Largest percentage decline of the account from a peak.',
      body:'Drawdown measures how far your account has dropped from its highest point. A drawdown of 20% on €10,000 = €2,000 loss. The larger the drawdown, the harder the recovery (20% loss requires 25% profit to recover; 50% loss requires 100% profit).',
      example:'Account grows from €5,000 to €7,000, then drops to €5,600 → drawdown = (7,000-5,600)/7,000 = 20%.' }
  },
  { id:'stoploss', cat:'riskmanagement',
    NL:{ term:'Stop-loss plaatsen', short:'Beschermende order die je positie automatisch sluit bij een verlies.',
      body:'Drie methoden:\n1. Technisch SL: net achter een key level (support/resistance, swing high/low)\n2. ATR-gebaseerd SL: gebruik Average True Range × 1.5 als buffer\n3. Percentage SL: vaste % van prijs (minder aanbevolen)\n\nRegel: nooit een SL verplaatsen richting verlies. Wel toegestaan: SL meebewegen richting winst (trailing stop).',
      example:'Long EUR/USD op 1.0875, recent swing low op 1.0850 → SL op 1.0843 (7 pip buffer onder swing low).' },
    EN:{ term:'Stop-loss placement', short:'Protective order that automatically closes your position at a loss.',
      body:'Three methods:\n1. Technical SL: just behind a key level (support/resistance, swing high/low)\n2. ATR-based SL: use Average True Range × 1.5 as buffer\n3. Percentage SL: fixed % of price (less recommended)\n\nRule: never move a SL toward the loss. Moving SL toward profit (trailing stop) is allowed.',
      example:'Long EUR/USD at 1.0875, recent swing low at 1.0850 → SL at 1.0843 (7 pip buffer below swing low).' }
  },

  // ── INDICATOREN ──
  { id:'ema', cat:'indicators',
    NL:{ term:'EMA (Exponential Moving Average)', short:'Gewogen voortschrijdend gemiddelde met meer gewicht op recente koersen.',
      body:'De EMA reageert sneller op prijsveranderingen dan een gewone MA. Veelgebruikte combinaties: EMA 20/50 voor korte termijn richting, EMA 50/200 voor grote trend. Prijs boven EMA = bullish. EMA crossovers geven koop/verkoop signalen.\n\nEMA 20: snelle MA (day-trade)\nEMA 50: medium-termijn trend\nEMA 200: grote trend (golden/death cross)',
      example:'EUR/USD H1: EMA 20 kruist EMA 50 omhoog = golden cross op H1 → bullish signaal.' },
    EN:{ term:'EMA (Exponential Moving Average)', short:'Weighted moving average giving more weight to recent prices.',
      body:'The EMA reacts faster to price changes than a simple MA. Common combinations: EMA 20/50 for short-term direction, EMA 50/200 for major trend. Price above EMA = bullish. EMA crossovers give buy/sell signals.\n\nEMA 20: fast MA (day-trade)\nEMA 50: medium-term trend\nEMA 200: major trend (golden/death cross)',
      example:'EUR/USD H1: EMA 20 crosses EMA 50 upward = golden cross on H1 → bullish signal.' }
  },
  { id:'rsi', cat:'indicators',
    NL:{ term:'RSI (Relative Strength Index)', short:'Momentum-indicator die overbought/oversold condities meet.',
      body:'RSI beweegt tussen 0 en 100. Boven 70 = overbought (mogelijk correctie), onder 30 = oversold (mogelijk rally). Standaard periode: 14. RSI divergentie is een krachtig signaal: prijs maakt new high maar RSI daalt = bearish divergentie, waarschuwt voor ommekeer.',
      example:'EUR/USD maakt hogere high maar RSI(14) maakt lagere high → bearish divergentie → waarschuwing voor mogelijke daling.' },
    EN:{ term:'RSI (Relative Strength Index)', short:'Momentum indicator measuring overbought/oversold conditions.',
      body:'RSI moves between 0 and 100. Above 70 = overbought (possible correction), below 30 = oversold (possible rally). Default period: 14. RSI divergence is a powerful signal: price makes new high but RSI declines = bearish divergence, warns of reversal.',
      example:'EUR/USD makes higher high but RSI(14) makes lower high → bearish divergence → warning of possible decline.' }
  },
  { id:'macd', cat:'indicators',
    NL:{ term:'MACD', short:'Trend-volgende momentum-indicator gebaseerd op EMA\'s.',
      body:'MACD = EMA(12) - EMA(26). Signal lijn = EMA(9) van MACD. Histogram = MACD - Signal.\n\nSignalen:\n• MACD kruist Signal omhoog = bullish\n• MACD kruist Signal omlaag = bearish\n• Histogram groeit = toenemend momentum\n• Divergentie met prijs = mogelijke ommekeer',
      example:'MACD lijn kruist Signal lijn omhoog terwijl prijs support test → bevestigde long entry.' },
    EN:{ term:'MACD', short:'Trend-following momentum indicator based on EMAs.',
      body:'MACD = EMA(12) - EMA(26). Signal line = EMA(9) of MACD. Histogram = MACD - Signal.\n\nSignals:\n• MACD crosses Signal upward = bullish\n• MACD crosses Signal downward = bearish\n• Histogram growing = increasing momentum\n• Divergence with price = possible reversal',
      example:'MACD line crosses Signal line upward while price tests support → confirmed long entry.' }
  },
  { id:'atr', cat:'indicators',
    NL:{ term:'ATR (Average True Range)', short:'Meet de gemiddelde volatiliteit van een instrument over N perioden.',
      body:'ATR geeft geen richting aan, alleen de grootte van bewegingen. Nuttig voor:\n• Stop-loss instellen (SL = 1.5 × ATR)\n• Take profit bepalen\n• Beoordelen of markt actief genoeg is om te traden\n\nHoge ATR = hoge volatiliteit. Lage ATR = zijwaartse, rustige markt.',
      example:'EUR/USD H1 ATR = 15 pip. SL = 1.5 × 15 = 22.5 pip minimum afstand voor een realistisch stop-loss.' },
    EN:{ term:'ATR (Average True Range)', short:'Measures the average volatility of an instrument over N periods.',
      body:'ATR gives no direction, only the size of movements. Useful for:\n• Setting stop-loss (SL = 1.5 × ATR)\n• Determining take profit\n• Assessing whether the market is active enough to trade\n\nHigh ATR = high volatility. Low ATR = sideways, quiet market.',
      example:'EUR/USD H1 ATR = 15 pip. SL = 1.5 × 15 = 22.5 pip minimum distance for a realistic stop-loss.' }
  },

  // ── STRATEGIEËN ──
  { id:'londonbreakout', cat:'strategies',
    NL:{ term:'London Breakout Strategie', short:'Trade de initiële beweging bij opening van de London sessie.',
      body:'Methode:\n1. Identificeer de range van de Asia sessie (22:00–07:00 BE)\n2. Noteer de high en low van die range\n3. Bij 08:00–09:00 BE: wacht op doorbraak van de range\n4. Entry bij retest van de gebroken kant, of bij close boven/onder range\n5. SL: net voorbij de range, TP: 1.5× tot 2× de range breedte\n\nBeste paren: EUR/USD, GBP/USD',
      example:'Asia range: 1.0840–1.0870 (30 pip). London breekt boven 1.0870 → long entry op retest 1.0870, SL 1.0855, TP 1.0915.' },
    EN:{ term:'London Breakout Strategy', short:'Trade the initial move at the London session open.',
      body:'Method:\n1. Identify the range of the Asia session (22:00–07:00 BE)\n2. Note the high and low of that range\n3. At 08:00–09:00 BE: wait for a breakout of the range\n4. Entry on retest of the broken side, or on close above/below range\n5. SL: just beyond the range, TP: 1.5× to 2× the range width\n\nBest pairs: EUR/USD, GBP/USD',
      example:'Asia range: 1.0840–1.0870 (30 pip). London breaks above 1.0870 → long entry on retest 1.0870, SL 1.0855, TP 1.0915.' }
  },
  { id:'trendtrading', cat:'strategies',
    NL:{ term:'Trend Trading (met de trend mee)', short:'Trade alleen in de richting van de dominante trend op hogere timeframes.',
      body:'Stappen:\n1. Bepaal trend op Daily/H4 (HH+HL = bullish, LH+LL = bearish)\n2. Wacht op pullback naar key support (voor longs) of resistance (voor shorts)\n3. Zoek price action bevestiging op H1/M15 (pin bar, engulfing)\n4. Enter met SL onder de pullback low (voor longs)\n5. TP bij vorige swing high of Fibonacci extensie\n\nVoordeel: hogere kans op winst omdat de wind in de rug zit.',
      example:'Daily trend bullish (HH+HL). H4 pullback naar EMA 50 en support 1.0875. H1 bullish engulfing → long.' },
    EN:{ term:'Trend Trading', short:'Only trade in the direction of the dominant trend on higher timeframes.',
      body:'Steps:\n1. Determine trend on Daily/H4 (HH+HL = bullish, LH+LL = bearish)\n2. Wait for pullback to key support (for longs) or resistance (for shorts)\n3. Look for price action confirmation on H1/M15 (pin bar, engulfing)\n4. Enter with SL below the pullback low (for longs)\n5. TP at previous swing high or Fibonacci extension\n\nAdvantage: higher win probability because you trade with the trend.',
      example:'Daily trend bullish (HH+HL). H4 pullback to EMA 50 and support 1.0875. H1 bullish engulfing → long.' }
  },
  { id:'scalping', cat:'strategies',
    NL:{ term:'Scalping', short:'Veel snelle trades met kleine winsten van 5–15 pip.',
      body:'Scalpers openen en sluiten posities in minuten. Ze richten zich op M1–M5 charts, hoge liquiditeitstijden (London open, NY open) en paren met lage spreads. Vereist snelle uitvoering en hoge discipline.\n\nVoor- en nadelen:\n✓ Veel trade-opportuniteiten\n✓ Korte blootstelling aan marktrisico\n✗ Hoge mentale belasting\n✗ Spread eet groter deel van winst',
      example:'EUR/USD M5: prijs bounced op EMA 20, entry 1.0882, SL 1.0877 (5 pip), TP 1.0897 (15 pip) → R:R 1:3.' },
    EN:{ term:'Scalping', short:'Many quick trades targeting small profits of 5–15 pips.',
      body:'Scalpers open and close positions in minutes. They focus on M1–M5 charts, high liquidity times (London open, NY open) and pairs with low spreads. Requires fast execution and high discipline.\n\nPros and cons:\n✓ Many trade opportunities\n✓ Short market exposure\n✗ High mental load\n✗ Spread eats a larger portion of profit',
      example:'EUR/USD M5: price bounces on EMA 20, entry 1.0882, SL 1.0877 (5 pip), TP 1.0897 (15 pip) → R:R 1:3.' }
  },
  { id:'swingtrading', cat:'strategies',
    NL:{ term:'Swing Trading', short:'Posities houden van enkele uren tot meerdere dagen.',
      body:'Swing traders zoeken grotere bewegingen (50–200 pip) op H4/Daily. Minder tijdsintensief dan scalping maar meer geduld nodig. Overnight risico bestaat (gap bij marktopening).\n\nTypisch proces:\n1. Weekly + Daily analyse op zondag/maandag\n2. Key levels markeren\n3. Wachten op setup op H4\n4. Entry op H1 bevestiging\n5. Breed SL (30–60 pip), breed TP (100–200 pip)',
      example:'EUR/USD Daily: bounce op weekly support 1.0800, Daily bullish engulfing. H4 entry op 1.0830, SL 1.0800, TP 1.0950 → R:R 1:4.' },
    EN:{ term:'Swing Trading', short:'Holding positions from a few hours to several days.',
      body:'Swing traders seek larger moves (50–200 pips) on H4/Daily. Less time-intensive than scalping but more patience required. Overnight risk exists (gap at market open).\n\nTypical process:\n1. Weekly + Daily analysis on Sunday/Monday\n2. Mark key levels\n3. Wait for setup on H4\n4. Entry on H1 confirmation\n5. Wide SL (30–60 pips), wide TP (100–200 pips)',
      example:'EUR/USD Daily: bounce on weekly support 1.0800, Daily bullish engulfing. H4 entry at 1.0830, SL 1.0800, TP 1.0950 → R:R 1:4.' }
  },

  { id:'sr_bounce', cat:'strategies',
    NL:{ term:'Support & Resistance Bounce', short:'Trade de terugkeer van prijs op een bewezen S&R niveau.',
      body:'Stappen:\n1. Identificeer sterke S/R niveaus op Daily en H4 (meerdere touches = sterker niveau)\n2. Wacht tot prijs het niveau nadert — niet vóór de touch instappen\n3. Zoek bevestiging op H1/M15: pin bar, engulfing, inside bar of sterke rejection wick\n4. Entry: boven de high van de bevestigingscandle (bij long) of onder de low (bij short)\n5. SL: 5–10 pip voorbij het S/R niveau\n6. TP1: 1:2 R/R, TP2: volgende S/R niveau\n\nBelangrijke filters:\n• Trend op Daily moet in dezelfde richting zijn (bounce support = bullish daily)\n• Geen grote news binnen 30 min\n• Minimaal 2 eerdere touches op het niveau\n• Sterkste setups: wanneer S/R samenvalt met round number of Fib-niveau\n\nWerkt op alle paren: EUR/USD, GBP/USD, XAU/USD, NAS100...',
      example:'EUR/USD Daily support op 1.0850. Prijs daalt naar 1.0850, H1 toont bullish pin bar met lange lower wick → long entry boven pin bar high (1.0865), SL 1.0840, TP 1.0915 → R:R 1:2.8.' },
    EN:{ term:'Support & Resistance Bounce', short:'Trade the return of price from a proven S&R level.',
      body:'Steps:\n1. Identify strong S/R levels on Daily and H4 (more touches = stronger level)\n2. Wait for price to approach the level — don\'t enter before the touch\n3. Look for confirmation on H1/M15: pin bar, engulfing, inside bar or strong rejection wick\n4. Entry: above the high of the confirmation candle (long) or below the low (short)\n5. SL: 5–10 pips beyond the S/R level\n6. TP1: 1:2 R/R, TP2: next S/R level\n\nKey filters:\n• Daily trend must align (bounce from support = bullish daily)\n• No major news within 30 min\n• Minimum 2 previous touches on the level\n• Strongest setups: when S/R coincides with round number or Fib level\n\nWorks on all pairs: EUR/USD, GBP/USD, XAU/USD, NAS100...',
      example:'EUR/USD Daily support at 1.0850. Price drops to 1.0850, H1 shows bullish pin bar with long lower wick → long entry above pin bar high (1.0865), SL 1.0840, TP 1.0915 → R:R 1:2.8.' }
  },
  { id:'break_retest', cat:'strategies',
    NL:{ term:'Break & Retest', short:'Trade de terugkeer naar een gebroken S&R niveau als nieuw support/resistance.',
      body:'Principe: een gebroken resistance wordt nieuwe support (en omgekeerd). Na een doorbraak keert prijs vaak terug om het niveau te "retesten".\n\nStappen:\n1. Identificeer een duidelijk S/R niveau op H4/Daily\n2. Wacht op een overtuigende doorbraak (sterke candle close BOVEN resistance of ONDER support)\n3. Wacht op de retest — prijs keert terug naar het niveau\n4. Zoek bevestigingscandle op H1/M15 (rejection van het niveau)\n5. Entry bij bevestiging, SL voorbij het niveau, TP bij volgende structuur\n\nValkuilen:\n✗ Niet traden bij fake-out (prijs breekt maar sluit terug binnen range)\n✗ Geen retest afwachten = chasing the market\n✗ Te smal SL — geef het niveau genoeg ruimte\n\nWerkt op alle paren en timeframes.',
      example:'EUR/USD resistance op 1.0950. Sterke H4 candle sluit boven 1.0950. Prijs retestet 1.0950 → H1 bullish engulfing → long entry 1.0958, SL 1.0942, TP 1.0998 → R:R 1:2.5.' },
    EN:{ term:'Break & Retest', short:'Trade the return to a broken S&R level as new support/resistance.',
      body:'Principle: broken resistance becomes new support (and vice versa). After a breakout, price often returns to "retest" the level.\n\nSteps:\n1. Identify a clear S/R level on H4/Daily\n2. Wait for a convincing breakout (strong candle close ABOVE resistance or BELOW support)\n3. Wait for the retest — price returns to the level\n4. Look for confirmation candle on H1/M15 (rejection of the level)\n5. Entry on confirmation, SL beyond the level, TP at next structure\n\nPitfalls:\n✗ Don\'t trade fake-outs (price breaks but closes back inside range)\n✗ Not waiting for retest = chasing the market\n✗ SL too tight — give the level enough room\n\nWorks on all pairs and timeframes.',
      example:'EUR/USD resistance at 1.0950. Strong H4 candle closes above 1.0950. Price retests 1.0950 → H1 bullish engulfing → long entry 1.0958, SL 1.0942, TP 1.0998 → R:R 1:2.5.' }
  },
  { id:'xauusd_strategy', cat:'strategies',
    NL:{ term:'XAU/USD (Gold) Trading Strategie', short:'Specifieke aanpak voor het traden van goud — het meest volatiele instrument.',
      body:'Kenmerken van XAU/USD:\n• Spread: 15–35 cent (veel breder dan forex!)\n• Pip-waarde: $1 per 0.01 lot per $1 beweging\n• Volatiliteit: 15–40 dollar per dag gemiddeld\n• Beste sessies: London open (09:00–11:00 BE) en NY open (15:00–17:00 BE)\n\nGoud-specifieke triggers:\n• USD-nieuws (NFP, CPI, FOMC) = grote bewegingen\n• Risk-off sentiment → goud stijgt\n• Sterke dollar → goud daalt\n• Round numbers ($2600, $2650, $2700) = zeer sterke niveaus\n\nStrategie:\n1. Analyse op Daily en H4 voor trend en key levels\n2. Focus op London en NY open voor entries\n3. Gebruik minimaal 30 pip SL (volatiliteit!)\n4. Vermijd traden 30 min vóór/na USD-news\n5. R/R minimaal 1:2 door hoge spread\n\nPositiebepaling:\n0.01 lot = ~$0.10 per pip | 0.1 lot = ~$1 per pip | 1 lot = ~$10 per pip',
      example:'Daily trend bullish. H4 key support op 2620 (round number + eerdere weerstand). London open: H1 pin bar op 2620 → long entry 2628, SL 2612 (16$ risico per 0.01 lot), TP 2662 → R:R 1:2.1.' },
    EN:{ term:'XAU/USD (Gold) Trading Strategy', short:'Specific approach for trading gold — the most volatile instrument.',
      body:'XAU/USD characteristics:\n• Spread: 15–35 cents (much wider than forex!)\n• Pip value: $1 per 0.01 lot per $1 move\n• Volatility: 15–40 dollars per day average\n• Best sessions: London open (09:00–11:00 BE) and NY open (15:00–17:00 BE)\n\nGold-specific triggers:\n• USD news (NFP, CPI, FOMC) = large moves\n• Risk-off sentiment → gold rises\n• Strong dollar → gold falls\n• Round numbers ($2600, $2650, $2700) = very strong levels\n\nStrategy:\n1. Analysis on Daily and H4 for trend and key levels\n2. Focus on London and NY open for entries\n3. Use minimum 30 pip SL (volatility!)\n4. Avoid trading 30 min before/after USD news\n5. R/R minimum 1:2 due to high spread\n\nPosition sizing:\n0.01 lot = ~$0.10 per pip | 0.1 lot = ~$1 per pip | 1 lot = ~$10 per pip',
      example:'Daily trend bullish. H4 key support at 2620 (round number + previous resistance). London open: H1 pin bar at 2620 → long entry 2628, SL 2612 ($16 risk per 0.01 lot), TP 2662 → R:R 1:2.1.' }
  },
  { id:'ict_concepts', cat:'strategies',
    NL:{ term:'ICT Concepts (Inner Circle Trader)', short:'Institutionele handelstechnieken: Order Blocks, FVG, BOS en CHoCH.',
      body:'ICT = methode gebaseerd op hoe grote spelers (banken, instituten) de markt bewegen.\n\nBelangrijkste concepten:\n\n📦 ORDER BLOCK (OB)\nDe laatste bearish candle vóór een bullish impulse (of omgekeerd). Banken plaatsen orders in deze zone. Prijs keert vaak terug naar OB.\n→ Bullish OB: laatste bearish candle body vóór opwaartse beweging\n→ Bearish OB: laatste bullish candle body vóór neerwaartse beweging\n\n⚡ FAIR VALUE GAP (FVG)\nEen gap tussen 3 candles waar prijs "inefficiënt" bewoog. Prijs keert terug om de gap te vullen.\n→ Bullish FVG: low van candle 3 > high van candle 1\n→ Bearish FVG: high van candle 3 < low van candle 1\n\n🔄 BOS (Break of Structure)\nBevestiging van trendzetting: prijs breekt een vorig swing high (bullish BOS) of swing low (bearish BOS).\n\n🔄 CHoCH (Change of Character)\nTrendkering: prijs breekt voor het eerst een swing low in een uptrend (bearish CHoCH) → signaal van mogelijke reversal.\n\nICT Entry methode:\n1. HTF (Daily/H4): bepaal trend via BOS\n2. ITF (H1): zoek CHoCH of OB als entry zone\n3. LTF (M15/M5): wacht op FVG fill of OB retest als precisie-entry\n\nWerkt op alle liquide paren: EUR/USD, GBP/USD, XAU/USD, indices...',
      example:'EUR/USD H4: bullish trend (BOS). H1: prijs daalt naar bullish OB op 1.0880 + FVG zone. M15: bullish engulfing in OB → long entry 1.0885, SL 1.0868, TP 1.0936 → R:R 1:3.' },
    EN:{ term:'ICT Concepts (Inner Circle Trader)', short:'Institutional trading techniques: Order Blocks, FVG, BOS and CHoCH.',
      body:'ICT = method based on how large players (banks, institutions) move the market.\n\nKey concepts:\n\n📦 ORDER BLOCK (OB)\nThe last bearish candle before a bullish impulse (or vice versa). Banks place orders in this zone. Price often returns to OB.\n→ Bullish OB: last bearish candle body before upward move\n→ Bearish OB: last bullish candle body before downward move\n\n⚡ FAIR VALUE GAP (FVG)\nA gap between 3 candles where price moved "inefficiently". Price returns to fill the gap.\n→ Bullish FVG: low of candle 3 > high of candle 1\n→ Bearish FVG: high of candle 3 < low of candle 1\n\n🔄 BOS (Break of Structure)\nTrend confirmation: price breaks a previous swing high (bullish BOS) or swing low (bearish BOS).\n\n🔄 CHoCH (Change of Character)\nTrend reversal: price breaks a swing low in an uptrend for the first time (bearish CHoCH) → signal of possible reversal.\n\nICT Entry method:\n1. HTF (Daily/H4): determine trend via BOS\n2. ITF (H1): look for CHoCH or OB as entry zone\n3. LTF (M15/M5): wait for FVG fill or OB retest for precision entry\n\nWorks on all liquid pairs: EUR/USD, GBP/USD, XAU/USD, indices...',
      example:'EUR/USD H4: bullish trend (BOS). H1: price drops to bullish OB at 1.0880 + FVG zone. M15: bullish engulfing in OB → long entry 1.0885, SL 1.0868, TP 1.0936 → R:R 1:3.' }
  },
  { id:'supply_demand', cat:'strategies',
    NL:{ term:'Supply & Demand Zones', short:'Zoek naar zones waar grote spelers orders hebben achtergelaten.',
      body:'Supply & Demand (S&D) verschilt van klassiek S&R: in plaats van een lijn, zoek je een ZONE waar prijs snel weg bewoog (imbalance).\n\nHoe een zone herkennen:\n📈 DEMAND ZONE (= koopzone)\n→ Prijs stond even stil (consolidatie/base) en schoot dan sterk OMHOOG\n→ Zone = de base (consolidatie) die achterbleef\n→ Wanneer prijs terugkeert naar die zone = potentiële long\n\n📉 SUPPLY ZONE (= verkoopzone)\n→ Prijs stond even stil en schoot dan sterk OMLAAG\n→ Zone = de base die achterbleef\n→ Wanneer prijs terugkeert naar die zone = potentiële short\n\nKwaliteit van een zone:\n✓ Sterker: hoe groter de "weg"-beweging vanuit de zone\n✓ Sterker: zone nog niet eerder geraakt (fresh zone)\n✓ Zwakker: zone al meerdere keren geraakt (uitgeput)\n✓ Beste combinatie: S&D zone + S&R niveau + round number\n\nEntry methode:\n1. Markeer zones op Daily/H4\n2. Wacht op retest van zone\n3. Entry bij eerste bevestigingscandle in de zone\n4. SL voorbij de zone, TP bij volgende supply/demand\n\nWerkt op alle paren en timeframes.',
      example:'EUR/USD H4 demand zone: 1.0820–1.0835 (sterke rally vertrok van hier). Prijs retestet 1.0828 → M15 bullish pin bar → long entry 1.0836, SL 1.0818, TP 1.0890 → R:R 1:3.' },
    EN:{ term:'Supply & Demand Zones', short:'Find zones where large players have left orders.',
      body:'Supply & Demand (S&D) differs from classic S&R: instead of a line, you look for a ZONE where price moved away quickly (imbalance).\n\nHow to identify a zone:\n📈 DEMAND ZONE (= buy zone)\n→ Price paused briefly (consolidation/base) then shot strongly UPWARD\n→ Zone = the base (consolidation) left behind\n→ When price returns to that zone = potential long\n\n📉 SUPPLY ZONE (= sell zone)\n→ Price paused briefly then shot strongly DOWNWARD\n→ Zone = the base left behind\n→ When price returns to that zone = potential short\n\nZone quality:\n✓ Stronger: the larger the "away" move from the zone\n✓ Stronger: zone not yet retested (fresh zone)\n✓ Weaker: zone already touched multiple times (exhausted)\n✓ Best combination: S&D zone + S&R level + round number\n\nEntry method:\n1. Mark zones on Daily/H4\n2. Wait for retest of zone\n3. Entry on first confirmation candle in the zone\n4. SL beyond the zone, TP at next supply/demand\n\nWorks on all pairs and timeframes.',
      example:'EUR/USD H4 demand zone: 1.0820–1.0835 (strong rally originated here). Price retests 1.0828 → M15 bullish pin bar → long entry 1.0836, SL 1.0818, TP 1.0890 → R:R 1:3.' }
  },
  { id:'session_open', cat:'strategies',
    NL:{ term:'Session Open Strategie', short:'Trade de initiële impuls bij opening van London of New York.',
      body:'De krachtigste momenten van de dag:\n\n🕗 LONDON OPEN (08:00–10:00 BE)\n• Meeste liquiditeit komt online\n• Groot deel van de dagbeweging wordt hier gezet\n• Asian range wordt vaak doorbroken\n• Strategie: identificeer Asian high/low → wacht op doorbraak bij 08:00–09:00 → entry op retest\n• Beste paren: EUR/USD, GBP/USD, XAU/USD\n\n🕒 NY OPEN (14:30–16:30 BE)\n• Tweede grote liquiditeitsmoment\n• Vaak reversal of acceleratie van London trend\n• USD-nieuws valt hier (NFP, CPI, FOMC)\n• Strategie: kijk of London trend bevestigd wordt of keert → entry bij eerste pullback\n• Beste paren: EUR/USD, XAU/USD, USD/JPY\n\n🕓 LONDON/NY OVERLAP (14:30–17:00 BE)\n• Hoogste volume van de dag\n• Scherpe bewegingen mogelijk in beide richtingen\n\nRegels:\n1. Markeer Asian range vóór London open\n2. Noteer key levels van vorige dag (high, low, close)\n3. Wacht eerste 15–30 min voor richting (geen entry direct bij open)\n4. Trade mee met HTF trend\n5. Stop na 2 uur — setup window voorbij',
      example:'EUR/USD Asian range: 1.0842–1.0865. London open 08:00: doorbraak boven 1.0865 → retest 1.0865 om 08:50 → H1 bullish candle → long entry 1.0868, SL 1.0852, TP 1.0904 → R:R 1:2.3.' },
    EN:{ term:'Session Open Strategy', short:'Trade the initial impulse at the London or New York open.',
      body:'The most powerful moments of the day:\n\n🕗 LONDON OPEN (08:00–10:00 BE)\n• Most liquidity comes online\n• Large portion of daily move is set here\n• Asian range often breached\n• Strategy: identify Asian high/low → wait for breakout at 08:00–09:00 → entry on retest\n• Best pairs: EUR/USD, GBP/USD, XAU/USD\n\n🕒 NY OPEN (14:30–16:30 BE)\n• Second major liquidity event\n• Often reversal or acceleration of London trend\n• USD news drops here (NFP, CPI, FOMC)\n• Strategy: check if London trend is confirmed or reverses → entry at first pullback\n• Best pairs: EUR/USD, XAU/USD, USD/JPY\n\n🕓 LONDON/NY OVERLAP (14:30–17:00 BE)\n• Highest volume of the day\n• Sharp moves possible in both directions\n\nRules:\n1. Mark Asian range before London open\n2. Note previous day key levels (high, low, close)\n3. Wait first 15–30 min to determine direction (no entry at exact open)\n4. Trade with HTF trend\n5. Stop after 2 hours — setup window closed',
      example:'EUR/USD Asian range: 1.0842–1.0865. London open 08:00: breakout above 1.0865 → retest 1.0865 at 08:50 → H1 bullish candle → long entry 1.0868, SL 1.0852, TP 1.0904 → R:R 1:2.3.' }
  },

  { id:'orb', cat:'strategies',
    NL:{ term:'Opening Range Breakout (ORB)', short:'Trade de doorbraak van de high/low die in de eerste N minuten na de open gevormd wordt.',
      body:'De Opening Range Breakout (ORB) is een klassieke strategie waarbij je de high en low van de eerste 5, 15 of 30 minuten na de marktopening markeert. Zodra prijs die range breekt, trade je mee in de richting van de doorbraak.\n\nWERKING:\n1. Bepaal je opening range periode: 5 min (ORB5), 15 min (ORB15) of 30 min (ORB30)\n2. Markeer de high en low van die periode — dit is de "range"\n3. Wacht op een duidelijke candle-close BUITEN de range\n4. Entry bij de re-entry of bij de close van de breakout candle\n5. SL net binnen de range (onder ORB-low bij long, boven ORB-high bij short)\n6. TP = minimaal 1.5× de range-breedte\n\nBESTE MOMENTEN:\n🕗 London open (08:00–08:15 BE) → ORB15 op EUR/USD, GBP/USD\n🕒 NY open (14:30–14:45 BE) → ORB15 op USD-paren, XAU/USD\n\nREGELS:\n• Alleen traden als de doorbraak gepaard gaat met volume/sterke candle\n• Vermijd ORB bij hoge impact news in de range-periode\n• Geen entry als prijs al meer dan 70% van de dagrange bewogen heeft\n• Combineer met HTF trend: alleen long ORB als Daily/H4 bullish is\n\nVARIANTEN:\n• ORB5: agressiever, meer signals, hogere fout-ratio\n• ORB15: meest populair, goede balans\n• ORB30: conservatiever, minder signals maar betrouwbaarder',
      example:'EUR/USD, London open 08:00. ORB15: high 1.0872, low 1.0858 (range = 14 pip). Om 08:22 sluit H1 candle boven 1.0872 → long entry 1.0874, SL 1.0856 (net onder low), TP 1.0895 (14 pip range × 1.5 = 21 pip). R:R = 1:1.2.' },
    EN:{ term:'Opening Range Breakout (ORB)', short:'Trade the breakout of the high/low formed in the first N minutes after the open.',
      body:'The Opening Range Breakout (ORB) is a classic strategy where you mark the high and low of the first 5, 15 or 30 minutes after market open. Once price breaks that range, you trade in the direction of the breakout.\n\nHOW IT WORKS:\n1. Choose your opening range period: 5 min (ORB5), 15 min (ORB15) or 30 min (ORB30)\n2. Mark the high and low of that period — this is the "range"\n3. Wait for a clear candle close OUTSIDE the range\n4. Entry on re-entry or at close of breakout candle\n5. SL just inside the range (below ORB-low for long, above ORB-high for short)\n6. TP = minimum 1.5× the range width\n\nBEST MOMENTS:\n🕗 London open (08:00–08:15 BE) → ORB15 on EUR/USD, GBP/USD\n🕒 NY open (14:30–14:45 BE) → ORB15 on USD pairs, XAU/USD\n\nRULES:\n• Only trade if breakout is accompanied by volume/strong candle\n• Avoid ORB during high impact news within the range period\n• No entry if price has already moved more than 70% of daily range\n• Combine with HTF trend: only long ORB if Daily/H4 is bullish\n\nVARIANTS:\n• ORB5: aggressive, more signals, higher fail rate\n• ORB15: most popular, good balance\n• ORB30: conservative, fewer signals but more reliable',
      example:'EUR/USD, London open 08:00. ORB15: high 1.0872, low 1.0858 (range = 14 pips). At 08:22 H1 candle closes above 1.0872 → long entry 1.0874, SL 1.0856 (just below low), TP 1.0895 (14 pip range × 1.5 = 21 pips). R:R = 1:1.2.' }
  },

  // ── PSYCHOLOGIE ──
  { id:'fomo', cat:'psychology',
    NL:{ term:'FOMO (Fear of Missing Out)', short:'De angst een trade te missen, wat leidt tot slechte entries.',
      body:'FOMO treedt op als je een grote beweging ziet en er snel in wilt zonder je regels te volgen. Typische symptomen: late entries na een grote candle, verhogen van lot grootte uit angst, negeren van SL regels.\n\nOplossing: Er is altijd een volgende setup. Een gemiste trade is beter dan een slechte trade. Noteer FOMO-momenten in je journal.',
      example:'EUR/USD schiet 40 pip omhoog. FOMO: long entry op de top zonder duidelijk niveau → prijs keert, verlies. Juist: wacht op retest.' },
    EN:{ term:'FOMO (Fear of Missing Out)', short:'The fear of missing a trade, leading to poor entries.',
      body:'FOMO occurs when you see a big move and want to jump in quickly without following your rules. Typical symptoms: late entries after a big candle, increasing lot size out of fear, ignoring SL rules.\n\nSolution: There is always a next setup. A missed trade is better than a bad trade. Note FOMO moments in your journal.',
      example:'EUR/USD shoots up 40 pips. FOMO: long entry at the top without a clear level → price reverses, loss. Correct: wait for retest.' }
  },
  { id:'revengetrading', cat:'psychology',
    NL:{ term:'Revenge Trading', short:'Impulsief traden na een verlies om het te recupereren.',
      body:'Na een verlies wil het brein de pijn snel ongedaan maken. Dit leidt tot te grote posities, negeren van setup-criteria en emotionele beslissingen. Revenge trading verergert verliezen vrijwel altijd.\n\nRegels:\n• Stop na 2-3 verliezende trades op één dag\n• Neem altijd een pauze na een verlies\n• Schrijf in je journal waarom de trade slecht was',
      example:'Verlies van €100 op EUR/USD → direct 3× groter lot nemen op volgende trade om te recupereren → verlies van €300.' },
    EN:{ term:'Revenge Trading', short:'Impulsively trading after a loss to recover it.',
      body:'After a loss, the brain wants to undo the pain quickly. This leads to oversized positions, ignoring setup criteria and emotional decisions. Revenge trading almost always worsens losses.\n\nRules:\n• Stop after 2-3 losing trades in one day\n• Always take a break after a loss\n• Write in your journal why the trade was bad',
      example:'Loss of €100 on EUR/USD → immediately take 3× larger lot on next trade to recover → loss of €300.' }
  },
  // ── ICT / SMART MONEY ──
  { id:'fvg', cat:'ict',
    NL:{ term:'Fair Value Gap (FVG)', short:'Imbalance van 3 kaarsen waar prijs later terugkeert om te "vullen".',
      body:'Een Fair Value Gap (ook: imbalance) ontstaat wanneer de wick van kaars 1 en de wick van kaars 3 elkaar NIET overlappen. De lege ruimte daartussen = de FVG.\n\nBullish FVG: ontstaat bij een sterke stijging — de bodem van kaars 3 ligt boven de top van kaars 1.\nBearish FVG: ontstaat bij een sterke daling — de top van kaars 3 ligt onder de bodem van kaars 1.\n\nWaarom werkt het?\nMarktmakers laten bij sterke impulsbewegingen onvervulde orders achter in die zone. Prijs keert vaak terug om die orders te "vullen" voor de beweging verder gaat.\n\nEntry strategie:\n1. Identificeer FVG na een sterke impulsbeweging\n2. Wacht tot prijs de FVG hertest\n3. Entry bij 50% van de FVG (equilibrium) of aan de rand\n4. SL net voorbij de FVG, TP bij volgende liquidity\n\nBelangrijk: FVGs in de richting van de hogere tijdsframe trend zijn het sterkst.',
      example:'EUR/USD maakt een sterke bullish impuls: kaars 1 sluit op 1.0840, kaars 3 opent op 1.0860 → FVG = 1.0840–1.0860. Prijs keert terug naar 1.0850 → long entry, SL 1.0835, TP 1.0920.' },
    EN:{ term:'Fair Value Gap (FVG)', short:'3-candle imbalance where price tends to return to "fill" the gap.',
      body:'A Fair Value Gap (also: imbalance) occurs when the wick of candle 1 and the wick of candle 3 do NOT overlap. The empty space between them = the FVG.\n\nBullish FVG: occurs during a strong rally — the low of candle 3 is above the high of candle 1.\nBearish FVG: occurs during a strong drop — the high of candle 3 is below the low of candle 1.\n\nWhy does it work?\nMarket makers leave unfilled orders in that zone during strong impulse moves. Price often returns to "fill" those orders before continuing.\n\nEntry strategy:\n1. Identify FVG after a strong impulse move\n2. Wait for price to retest the FVG\n3. Entry at 50% of the FVG (equilibrium) or at the edge\n4. SL just beyond the FVG, TP at next liquidity\n\nImportant: FVGs aligned with the higher timeframe trend are the strongest.',
      example:'EUR/USD makes a strong bullish impulse: candle 1 closes at 1.0840, candle 3 opens at 1.0860 → FVG = 1.0840–1.0860. Price returns to 1.0850 → long entry, SL 1.0835, TP 1.0920.' }
  },
  { id:'orderblock', cat:'ict',
    NL:{ term:'Order Block (OB)', short:'De laatste tegengestelde kaars vóór een sterke impulsbeweging — zone met institutionele orders.',
      body:'Een Order Block is de laatste bearish kaars vóór een sterke bullish impuls (bullish OB), of de laatste bullish kaars vóór een sterke bearish impuls (bearish OB).\n\nWaarom? Grote spelers (banken, instituten) plaatsen hun orders in batches. Ze kopen/verkopen niet alles op één prijs — ze laten orders achter in die kaars-zone. Wanneer prijs terugkeert, worden die orders opnieuw geactiveerd.\n\nBullish Order Block:\n→ Zoek de laatste rode kaars vóór een sterke stijging\n→ De body van die kaars = de OB zone\n→ Wanneer prijs terugkomt → potentiële long\n\nBearish Order Block:\n→ Laatste groene kaars vóór sterke daling\n→ Entry short bij retest\n\nCombineer met FVG voor hogere trefkans. Sterkst op H4/Daily in de richting van de HTF trend.',
      example:'Daily chart: laatste rode kaars vóór een +200 pip rally heeft body 1.0810–1.0840 → dit is de bullish OB. Bij retest van 1.0820–1.0840 → long entry met SL onder 1.0805.' },
    EN:{ term:'Order Block (OB)', short:'Last opposing candle before a strong impulse move — zone with institutional orders.',
      body:'An Order Block is the last bearish candle before a strong bullish impulse (bullish OB), or the last bullish candle before a strong bearish impulse (bearish OB).\n\nWhy? Large players (banks, institutions) place their orders in batches. They do not buy/sell everything at one price — they leave orders behind in that candle zone. When price returns, those orders get activated again.\n\nBullish Order Block:\n→ Find the last red candle before a strong rally\n→ The body of that candle = the OB zone\n→ When price returns → potential long\n\nBearish Order Block:\n→ Last green candle before strong drop\n→ Short entry on retest\n\nCombine with FVG for higher hit rate. Strongest on H4/Daily in the direction of the HTF trend.',
      example:'Daily chart: last red candle before a +200 pip rally has body 1.0810–1.0840 → this is the bullish OB. On retest of 1.0820–1.0840 → long entry with SL below 1.0805.' }
  },
  { id:'liquiditysweep', cat:'ict',
    NL:{ term:'Liquidity Sweep / Stop Hunt', short:'Prijs neemt bewust stops weg boven/onder een level voor de echte beweging begint.',
      body:'Institutionele spelers weten waar retailtraders hun stops zetten: net boven een swing high, net onder een swing low, boven/onder ronde nummers.\n\nEen liquidity sweep werkt zo:\n1. Prijs beweegt NAAR die stop-zone (neemt de liquiditeit weg)\n2. Retailtraders worden gestopt of raken in de fout\n3. Prijs keert OM en gaat de andere kant op\n\nVoorbeelden van liquidity zones:\n• Equal highs/lows (meerdere tops/bodems op hetzelfde niveau)\n• Swing highs en swing lows\n• Ronde nummers (1.1000, 1.0900)\n• Previous day high/low\n\nHoe traderen:\n→ Wacht op de sweep (prijs neemt het niveau mee)\n→ Zoek bevestiging dat prijs keert (pin bar, engulfing, doji)\n→ Entry IN de richting van de sweep, TP ver',
      example:'EUR/USD heeft een duidelijk swing high op 1.0920. Prijs stijgt kort tot 1.0928 (sweep), daarna bearish engulfing → short entry 1.0915, SL 1.0932, TP 1.0850.' },
    EN:{ term:'Liquidity Sweep / Stop Hunt', short:'Price deliberately takes out stops above/below a level before the real move begins.',
      body:'Institutional players know where retail traders place their stops: just above a swing high, just below a swing low, above/below round numbers.\n\nA liquidity sweep works like this:\n1. Price moves TOWARD that stop zone (takes out the liquidity)\n2. Retail traders get stopped out or enter the wrong direction\n3. Price REVERSES and moves the other way\n\nExamples of liquidity zones:\n• Equal highs/lows (multiple tops/bottoms at the same level)\n• Swing highs and swing lows\n• Round numbers (1.1000, 1.0900)\n• Previous day high/low\n\nHow to trade:\n→ Wait for the sweep (price takes out the level)\n→ Look for reversal confirmation (pin bar, engulfing, doji)\n→ Entry IN the direction of the sweep, wide TP',
      example:'EUR/USD has a clear swing high at 1.0920. Price briefly rises to 1.0928 (sweep), then bearish engulfing → short entry 1.0915, SL 1.0932, TP 1.0850.' }
  },
  { id:'bos', cat:'ict',
    NL:{ term:'Break of Structure (BOS)', short:'Bevestiging van trendcontinuatie — prijs breekt een vorig swing high/low.',
      body:'Een Break of Structure (BOS) bevestigt dat de huidige trend intact is.\n\nIn een uptrend:\n→ Elke keer dat prijs een nieuw Higher High maakt = BOS bullish\n→ Bevestigt dat de trend doorgaat\n→ Je zoekt longs na de BOS, bij de eerste pullback\n\nIn een downtrend:\n→ Elke keer dat prijs een nieuw Lower Low maakt = BOS bearish\n→ Je zoekt shorts na de BOS\n\nVerschil met ChoCH:\n• BOS = zelfde richting als de trend (continuatie)\n• ChoCH = TEGENGESTELD aan de trend (mogelijke ommekeer)\n\nGebruik BOS om te bevestigen dat je met de trend tradet. Combineer met Order Blocks of FVGs voor precieze entry.',
      example:'EUR/USD uptrend: vorig HH op 1.0950. Prijs breekt 1.0950 → BOS bullish. Pullback naar OB/FVG → long entry mét de trend.' },
    EN:{ term:'Break of Structure (BOS)', short:'Trend continuation confirmation — price breaks a previous swing high/low.',
      body:'A Break of Structure (BOS) confirms the current trend is intact.\n\nIn an uptrend:\n→ Each time price makes a new Higher High = bullish BOS\n→ Confirms the trend continues\n→ Look for longs after the BOS, on the first pullback\n\nIn a downtrend:\n→ Each time price makes a new Lower Low = bearish BOS\n→ Look for shorts after the BOS\n\nDifference with ChoCH:\n• BOS = same direction as trend (continuation)\n• ChoCH = OPPOSITE to the trend (possible reversal)\n\nUse BOS to confirm you are trading with the trend. Combine with Order Blocks or FVGs for precise entries.',
      example:'EUR/USD uptrend: previous HH at 1.0950. Price breaks 1.0950 → bullish BOS. Pullback to OB/FVG → long entry with the trend.' }
  },
  { id:'choch', cat:'ict',
    NL:{ term:'Change of Character (ChoCH)', short:'Eerste teken van trendommekeer — prijs breekt in tegengestelde richting.',
      body:'Een Change of Character (ChoCH) is het eerste signaal dat een trend aan het keren is.\n\nIn een downtrend (bearish structuur):\n→ Prijs maakt Lower Lows en Lower Highs\n→ Als prijs plotseling een vorig Lower High breekt = ChoCH\n→ Signaleert: de bearish structuur is gebroken, mogelijk reversal\n\nIn een uptrend:\n→ Als prijs een vorig Higher Low breekt = ChoCH bearish\n\nChoCH vs BOS:\n• BOS = zelfde richting (trend gaat door)\n• ChoCH = andere richting (trend keert mogelijk)\n\nNa een ChoCH:\n1. Ga niet direct in de tegengestelde richting\n2. Wacht op een pullback en nieuw BOS in de nieuwe richting\n3. Dan pas entry — lager risico\n\nChoCH is alleen geldig als het een SIGNIFICANT swing breekt.',
      example:'GBP/USD downtrend. Prijs maakt LL en LH. Dan breekt prijs het laatste LH op 1.2650 → ChoCH. Pullback naar OB rond 1.2640 → long entry, target 1.2750.' },
    EN:{ term:'Change of Character (ChoCH)', short:'First sign of trend reversal — price breaks in the opposite direction.',
      body:'A Change of Character (ChoCH) is the first signal that a trend is reversing.\n\nIn a downtrend (bearish structure):\n→ Price makes Lower Lows and Lower Highs\n→ If price suddenly breaks a previous Lower High = ChoCH\n→ Signals: the bearish structure is broken, possible reversal\n\nIn an uptrend:\n→ If price breaks a previous Higher Low = bearish ChoCH\n\nChoCH vs BOS:\n• BOS = same direction (trend continues)\n• ChoCH = opposite direction (trend possibly reversing)\n\nAfter a ChoCH:\n1. Do not immediately trade the opposite direction\n2. Wait for a pullback and new BOS in the new direction\n3. Then entry — lower risk\n\nChoCH is only valid if it breaks a SIGNIFICANT swing.',
      example:'GBP/USD downtrend. Price makes LL and LH. Then price breaks the last LH at 1.2650 → ChoCH. Pullback to OB around 1.2640 → long entry, target 1.2750.' }
  },
  { id:'premiumdiscount', cat:'ict',
    NL:{ term:'Premium & Discount Zones', short:'Koop in de discount (onder 50%), verkoop in de premium (boven 50%) van een range.',
      body:'In ICT-analyse wordt elke range (van swing low naar swing high) opgedeeld:\n• 50% niveau = equilibrium (evenwicht)\n• Boven 50% = Premium zone (duur)\n• Onder 50% = Discount zone (goedkoop)\n\nLogica:\n→ Grote spelers kopen in de discount (goedkoop) en verkopen in de premium\n→ Als retailtrader wil je dezelfde logica volgen\n→ Long entries zoeken in de discount (onder 50%)\n→ Short entries zoeken in de premium (boven 50%)\n\nHoe berekenen:\n1. Markeer de relevante swing low en swing high\n2. Bereken het 50% niveau\n3. Is prijs onder 50%? → discount → zoek longs\n4. Is prijs boven 50%? → premium → zoek shorts\n\nCombineer met OB en FVG die in de discount/premium zone liggen voor sterke confluences.',
      example:'EUR/USD range: swing low 1.0800, swing high 1.0960. 50% = 1.0880. Prijs pullback naar 1.0840 (discount zone) en raakt bullish OB → long entry.' },
    EN:{ term:'Premium & Discount Zones', short:'Buy in the discount (below 50%), sell in the premium (above 50%) of a range.',
      body:'In ICT analysis, every range (from swing low to swing high) is divided:\n• 50% level = equilibrium\n• Above 50% = Premium zone (expensive)\n• Below 50% = Discount zone (cheap)\n\nLogic:\n→ Large players buy in the discount (cheap) and sell in the premium\n→ As a retail trader, follow the same logic\n→ Look for long entries in the discount (below 50%)\n→ Look for short entries in the premium (above 50%)\n\nHow to calculate:\n1. Mark the relevant swing low and swing high\n2. Calculate the 50% level\n3. Is price below 50%? → discount → look for longs\n4. Is price above 50%? → premium → look for shorts\n\nCombine with OBs and FVGs that lie in the discount/premium zone for strong confluences.',
      example:'EUR/USD range: swing low 1.0800, swing high 1.0960. 50% = 1.0880. Price pullback to 1.0840 (discount zone) hits bullish OB → long entry.' }
  },
  { id:'inducement', cat:'ict',
    NL:{ term:'Inducement (IDM)', short:'Valse liquiditeitszone die grote spelers creëren om kleinere traders in de foute richting te lokken.',
      body:'Inducement is een bewust gecreëerde "valse" swing die liquiditeit opbouwt voordat de echte beweging begint.\n\nHoe werkt het:\n1. In een uptrend maakt prijs een kleine pullback → vormt een "lage" swing low\n2. Retailtraders plaatsen stops onder die swing low\n3. Prijs sweept die swing low (neemt de stops weg)\n4. Dan gaat prijs verder omhoog — de eigenlijke richting\n\nIDM herkennen:\n→ Een swing die "uitlokt" maar geen echte structuurbreuk is\n→ Gevolgd door een liquidity sweep\n→ Daarna BOS in de oorspronkelijke richting\n\nPraktisch gebruik:\n→ Na een IDM-sweep en ChoCH in de oorspronkelijke richting → entry\n→ Hoge probabiliteit omdat het "dom geld" al gestopt is',
      example:'EUR/USD uptrend. Kleine pullback creëert swing low 1.0850 (IDM). Prijs daalt kort naar 1.0845 (sweep), daarna bullish ChoCH + BOS → long entry 1.0862, SL 1.0842, TP 1.0930.' },
    EN:{ term:'Inducement (IDM)', short:'False liquidity zone that large players create to lure smaller traders in the wrong direction.',
      body:'Inducement is a deliberately created "false" swing that builds liquidity before the real move begins.\n\nHow it works:\n1. In an uptrend, price makes a small pullback → forms a "low" swing low\n2. Retail traders place stops below that swing low\n3. Price sweeps that swing low (takes out the stops)\n4. Then price continues higher — the actual direction\n\nRecognizing IDM:\n→ A swing that "lures" but is not a real structural break\n→ Followed by a liquidity sweep\n→ Then BOS in the original direction\n\nPractical use:\n→ After an IDM sweep and ChoCH in the original direction → entry\n→ High probability because "dumb money" has already been stopped out',
      example:'EUR/USD uptrend. Small pullback creates swing low 1.0850 (IDM). Price briefly drops to 1.0845 (sweep), then bullish ChoCH + BOS → long entry 1.0862, SL 1.0842, TP 1.0930.' }
  },

  { id:'tradingplan', cat:'psychology',
    NL:{ term:'Trading Plan', short:'Schriftelijke regels die bepalen wanneer en hoe je tradet.',
      body:'Een trading plan bevat:\n• Welke instrumenten je tradet\n• Welke sessies (tijden)\n• Entry criteria (minimaal 2 van 3 confluences)\n• SL en TP regels\n• Max risico per trade en per dag\n• Regels voor het stoppen (streak van 3 losses)\n\nVoordeel: je neemt beslissingen vooraf, niet midden in een trade onder druk.',
      example:'Regel: "Ik trade alleen EUR/USD tijdens London sessie. Ik neem alleen longs als de Daily trend bullish is en er een H1 price action signaal is op key support."' },
    EN:{ term:'Trading Plan', short:'Written rules defining when and how you trade.',
      body:'A trading plan contains:\n• Which instruments you trade\n• Which sessions (times)\n• Entry criteria (minimum 2 of 3 confluences)\n• SL and TP rules\n• Max risk per trade and per day\n• Rules for stopping (streak of 3 losses)\n\nAdvantage: you make decisions in advance, not in the middle of a trade under pressure.',
      example:'Rule: "I only trade EUR/USD during the London session. I only take longs if the Daily trend is bullish and there is an H1 price action signal at key support."' }
  },
];

// Kleuren per categorie
const CAT_COLORS = {
  basics:'var(--accent)', priceaction:'var(--green)', riskmanagement:'var(--red)',
  indicators:'var(--purple)', strategies:'var(--amber)', psychology:'var(--muted)',
  ict:'var(--amber)'
};
const CAT_ICONS = {
  basics:'📖', priceaction:'📊', riskmanagement:'🛡️',
  indicators:'📈', strategies:'🎯', psychology:'🧠',
  ict:'⚡'
};

// ================================================================
// QUIZ
// ================================================================
let quizScore = 0, quizWrong = 0, quizStreak = 0, quizBest = 0;
let quizAnswered = false;

function startQuiz() {
  // Toon quiz sectie, verberg grid
  const section = $('learnQuizSection');
  const grid = $('learnGrid');
  const noRes = $('learnNoResults');
  if(grid) grid.style.display = 'none';
  if(noRes) noRes.style.display = 'none';
  if(section) section.style.display = 'block';

  // Markeer quiz knop actief
  document.querySelectorAll('#learnCatTabs .tf-btn').forEach(b => b.classList.remove('active'));
  const qBtn = $('quizTabBtn');
  if(qBtn) qBtn.classList.add('active');

  quizAnswered = false;
  renderQuizQuestion();
}

function closeQuiz() {
  const section = $('learnQuizSection');
  if(section) section.style.display = 'none';
  // Herstel grid
  setLearnCat(currentLearnCat, document.querySelector(`#learnCatTabs .tf-btn[data-cat="${currentLearnCat}"]`) || document.querySelector('#learnCatTabs .tf-btn'));
}

function renderQuizQuestion() {
  quizAnswered = false;
  const cat = $('quizCatFilter')?.value || 'all';
  const l = currentLang;
  const pool = LEARN_DATA.filter(i => (cat === 'all' || i.cat === cat) && (i[l] || i['NL']));

  if(pool.length < 4) {
    $('quizCard').innerHTML = '<div style="color:var(--muted);font-size:13px;padding:20px;text-align:center;">Niet genoeg begrippen in deze categorie voor een quiz. Kies "Alle categorieën".</div>';
    return;
  }

  // Kies willekeurige vraag
  const correct = pool[Math.floor(Math.random() * pool.length)];
  const d = correct[l] || correct['NL'];

  // Kies 3 willekeurige foute antwoorden
  const others = pool.filter(i => i.id !== correct.id);
  const shuffled = others.sort(() => Math.random() - 0.5).slice(0, 3);
  const allOptions = [correct, ...shuffled].sort(() => Math.random() - 0.5);

  const col = CAT_COLORS[correct.cat] || 'var(--accent)';
  const icon = CAT_ICONS[correct.cat] || '●';

  $('quizCard').innerHTML = `
    <div style="font-size:10px;color:var(--muted);font-family:var(--font-head);font-weight:700;text-transform:uppercase;letter-spacing:.5px;margin-bottom:12px;">${icon} ${correct.cat.toUpperCase()} — Welk begrip past bij deze omschrijving?</div>
    <div style="font-size:15px;color:var(--text);line-height:1.7;margin-bottom:20px;padding:16px;background:var(--surface2);border-radius:10px;border-left:3px solid ${col};">
      "${d.short}"
    </div>
    <div style="display:flex;flex-direction:column;gap:10px;" id="quizOptions">
      ${allOptions.map((opt, i) => {
        const od = opt[l] || opt['NL'];
        return `<button onclick="checkQuizAnswer('${opt.id}','${correct.id}')"
          id="quizOpt-${opt.id}"
          style="padding:12px 16px;border-radius:9px;border:1px solid var(--border);background:var(--surface2);color:var(--text);cursor:pointer;text-align:left;font-size:13px;font-family:var(--font-head);font-weight:700;transition:all 0.15s;">
          <span style="color:var(--muted);margin-right:8px;">${['A','B','C','D'][i]}.</span>${od.term}
        </button>`;
      }).join('')}
    </div>
    <div id="quizFeedback" style="display:none;margin-top:16px;padding:14px 16px;border-radius:10px;"></div>
    <div id="quizNextBtn" style="display:none;margin-top:12px;text-align:right;">
      <button onclick="renderQuizQuestion()" style="padding:10px 22px;border-radius:8px;border:none;background:var(--accent);color:#fff;cursor:pointer;font-family:var(--font-head);font-weight:700;font-size:13px;">Volgende vraag →</button>
    </div>
  `;
}

function checkQuizAnswer(selectedId, correctId) {
  if(quizAnswered) return;
  quizAnswered = true;

  const l = currentLang;
  const correctItem = LEARN_DATA.find(i => i.id === correctId);
  const d = correctItem?.[l] || correctItem?.['NL'];
  const isCorrect = selectedId === correctId;

  if(isCorrect) {
    quizScore++;
    quizStreak++;
    if(quizStreak > quizBest) quizBest = quizStreak;
  } else {
    quizWrong++;
    quizStreak = 0;
  }

  // Update score display
  if($('quizScore')) $('quizScore').textContent = quizScore;
  if($('quizWrong')) $('quizWrong').textContent = quizWrong;
  if($('quizStreak')) $('quizStreak').textContent = quizStreak;
  if($('quizBest')) $('quizBest').textContent = quizBest;

  // Kleur knoppen
  document.querySelectorAll('#quizOptions button').forEach(btn => {
    btn.style.cursor = 'default';
    btn.onclick = null;
  });
  const correctBtn = $(`quizOpt-${correctId}`);
  if(correctBtn) { correctBtn.style.background = 'rgba(46,204,138,0.15)'; correctBtn.style.borderColor = 'var(--green)'; correctBtn.style.color = 'var(--green)'; }
  if(!isCorrect) {
    const wrongBtn = $(`quizOpt-${selectedId}`);
    if(wrongBtn) { wrongBtn.style.background = 'rgba(255,92,92,0.15)'; wrongBtn.style.borderColor = 'var(--red)'; wrongBtn.style.color = 'var(--red)'; }
  }

  // Feedback
  const fb = $('quizFeedback');
  if(fb) {
    fb.style.display = 'block';
    fb.style.background = isCorrect ? 'rgba(46,204,138,0.08)' : 'rgba(255,92,92,0.08)';
    fb.style.border = `1px solid ${isCorrect ? 'rgba(46,204,138,0.3)' : 'rgba(255,92,92,0.3)'}`;
    fb.innerHTML = isCorrect
      ? `<div style="color:var(--green);font-family:var(--font-head);font-weight:700;font-size:13px;margin-bottom:4px;">✓ Correct! ${quizStreak > 1 ? '🔥 ' + quizStreak + ' op rij!' : ''}</div>
         <div style="font-size:12px;color:var(--muted);line-height:1.6;">${d?.short || ''}</div>`
      : `<div style="color:var(--red);font-family:var(--font-head);font-weight:700;font-size:13px;margin-bottom:4px;">✕ Fout — het juiste antwoord was: <span style="color:var(--text)">${d?.term || correctId}</span></div>
         <div style="font-size:12px;color:var(--muted);line-height:1.6;">${d?.short || ''}</div>`;
  }
  if($('quizNextBtn')) $('quizNextBtn').style.display = 'block';
}

function setLearnCat(cat, btn) {
  currentLearnCat = cat;
  document.querySelectorAll('#learnCatTabs .tf-btn').forEach(b => b.classList.remove('active'));
  if(btn) btn.classList.add('active');
  // Verberg quiz sectie
  const qs = $('learnQuizSection');
  if(qs) qs.style.display = 'none';
  const grid = $('learnGrid');
  if(grid) grid.style.display = 'grid';
  renderLearnCards(cat, $('learnSearch')?.value || '');
}

function filterLearn(q) {
  renderLearnCards(currentLearnCat, q);
}

function filterLearn(q) {
  renderLearnCards(currentLearnCat, q);
}

// ---- Strategy SVG charts ----
const STRATEGY_CHARTS = {
  sr_bounce: `<svg viewBox="0 0 300 140" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:140px;">
    <rect width="300" height="140" fill="#0d0f14" rx="8"/>
    <!-- Support line -->
    <line x1="20" y1="95" x2="280" y2="95" stroke="#4f9eff" stroke-width="1.5" stroke-dasharray="5,3"/>
    <text x="224" y="91" fill="#4f9eff" font-size="9" font-family="monospace">Support</text>
    <!-- Candles going down -->
    <rect x="30" y="40" width="10" height="30" fill="#ff5c5c" rx="1"/>
    <line x1="35" y1="38" x2="35" y2="72" stroke="#ff5c5c" stroke-width="1"/>
    <rect x="50" y="52" width="10" height="25" fill="#ff5c5c" rx="1"/>
    <line x1="55" y1="49" x2="55" y2="79" stroke="#ff5c5c" stroke-width="1"/>
    <rect x="70" y="60" width="10" height="22" fill="#ff5c5c" rx="1"/>
    <line x1="75" y1="57" x2="75" y2="84" stroke="#ff5c5c" stroke-width="1"/>
    <!-- Pin bar at support -->
    <rect x="92" y="85" width="10" height="8" fill="#2ecc8a" rx="1"/>
    <line x1="97" y1="70" x2="97" y2="95" stroke="#2ecc8a" stroke-width="1.5"/>
    <line x1="97" y1="82" x2="97" y2="95" stroke="#2ecc8a" stroke-width="1.5"/>
    <!-- Bounce up -->
    <rect x="112" y="72" width="10" height="20" fill="#2ecc8a" rx="1"/>
    <line x1="117" y1="69" x2="117" y2="94" stroke="#2ecc8a" stroke-width="1"/>
    <rect x="132" y="58" width="10" height="22" fill="#2ecc8a" rx="1"/>
    <line x1="137" y1="55" x2="137" y2="82" stroke="#2ecc8a" stroke-width="1"/>
    <rect x="152" y="45" width="10" height="20" fill="#2ecc8a" rx="1"/>
    <line x1="157" y1="42" x2="157" y2="67" stroke="#2ecc8a" stroke-width="1"/>
    <!-- Entry arrow -->
    <path d="M97,68 L97,58 L103,63 M97,58 L91,63" stroke="#f5a623" stroke-width="2" fill="none"/>
    <text x="108" y="57" fill="#f5a623" font-size="9" font-family="monospace">Entry</text>
    <!-- SL line -->
    <line x1="86" y1="108" x2="168" y2="108" stroke="#ff5c5c" stroke-width="1" stroke-dasharray="3,2"/>
    <text x="172" y="112" fill="#ff5c5c" font-size="9" font-family="monospace">SL</text>
    <!-- TP line -->
    <line x1="86" y1="32" x2="168" y2="32" stroke="#2ecc8a" stroke-width="1" stroke-dasharray="3,2"/>
    <text x="172" y="36" fill="#2ecc8a" font-size="9" font-family="monospace">TP</text>
  </svg>`,

  break_retest: `<svg viewBox="0 0 300 140" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:140px;">
    <rect width="300" height="140" fill="#0d0f14" rx="8"/>
    <!-- Resistance line -->
    <line x1="20" y1="70" x2="280" y2="70" stroke="#4f9eff" stroke-width="1.5" stroke-dasharray="5,3"/>
    <text x="10" y="67" fill="#4f9eff" font-size="9" font-family="monospace">Res → Support</text>
    <!-- Candles consolidating below resistance -->
    <rect x="25" y="78" width="9" height="18" fill="#2ecc8a" rx="1"/><line x1="29" y1="75" x2="29" y2="97" stroke="#2ecc8a" stroke-width="1"/>
    <rect x="42" y="80" width="9" height="15" fill="#ff5c5c" rx="1"/><line x1="46" y1="77" x2="46" y2="97" stroke="#ff5c5c" stroke-width="1"/>
    <rect x="59" y="76" width="9" height="18" fill="#2ecc8a" rx="1"/><line x1="63" y1="73" x2="63" y2="96" stroke="#2ecc8a" stroke-width="1"/>
    <!-- Strong breakout candle -->
    <rect x="76" y="48" width="11" height="28" fill="#2ecc8a" rx="1"/>
    <line x1="81" y1="44" x2="81" y2="78" stroke="#2ecc8a" stroke-width="1.5"/>
    <!-- Continuation -->
    <rect x="95" y="38" width="9" height="18" fill="#2ecc8a" rx="1"/><line x1="99" y1="35" x2="99" y2="57" stroke="#2ecc8a" stroke-width="1"/>
    <!-- Retest -->
    <rect x="114" y="62" width="9" height="14" fill="#ff5c5c" rx="1"/><line x1="118" y1="58" x2="118" y2="78" stroke="#ff5c5c" stroke-width="1.5"/>
    <!-- Bounce from old resistance (now support) -->
    <rect x="133" y="52" width="9" height="18" fill="#2ecc8a" rx="1"/><line x1="137" y1="48" x2="137" y2="72" stroke="#2ecc8a" stroke-width="1"/>
    <rect x="150" y="38" width="9" height="18" fill="#2ecc8a" rx="1"/><line x1="154" y1="34" x2="154" y2="58" stroke="#2ecc8a" stroke-width="1"/>
    <!-- Entry arrow -->
    <path d="M118,56 L118,44 L124,50 M118,44 L112,50" stroke="#f5a623" stroke-width="2" fill="none"/>
    <text x="126" y="44" fill="#f5a623" font-size="9" font-family="monospace">Entry</text>
    <!-- Labels -->
    <text x="68" y="120" fill="#2ecc8a" font-size="9" font-family="monospace">Breakout</text>
    <text x="108" y="120" fill="#4f9eff" font-size="9" font-family="monospace">Retest</text>
  </svg>`,

  xauusd_strategy: `<svg viewBox="0 0 300 140" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:140px;">
    <rect width="300" height="140" fill="#0d0f14" rx="8"/>
    <text x="20" y="30" fill="#f5a623" font-size="18" font-family="monospace" font-weight="bold">XAU/USD</text>
    <text x="20" y="48" fill="#7a8099" font-size="10" font-family="monospace">GOLD · Spot Price</text>
    <!-- Price line going up -->
    <polyline points="20,110 50,105 80,98 100,102 120,88 140,75 155,80 170,65 190,55 210,48 240,38 270,30" fill="none" stroke="#f5a623" stroke-width="2"/>
    <!-- Round number levels -->
    <line x1="20" y1="88" x2="280" y2="88" stroke="#4f9eff" stroke-width="0.8" stroke-dasharray="4,3" opacity="0.6"/>
    <text x="238" y="85" fill="#4f9eff" font-size="8" font-family="monospace">$2700</text>
    <line x1="20" y1="63" x2="280" y2="63" stroke="#4f9eff" stroke-width="0.8" stroke-dasharray="4,3" opacity="0.6"/>
    <text x="238" y="60" fill="#4f9eff" font-size="8" font-family="monospace">$2750</text>
    <line x1="20" y1="38" x2="280" y2="38" stroke="#4f9eff" stroke-width="0.8" stroke-dasharray="4,3" opacity="0.6"/>
    <text x="238" y="35" fill="#4f9eff" font-size="8" font-family="monospace">$2800</text>
    <!-- Session markers -->
    <rect x="20" y="118" width="40" height="12" fill="rgba(245,166,35,0.15)" rx="3"/>
    <text x="22" y="128" fill="#f5a623" font-size="8" font-family="monospace">Asian</text>
    <rect x="65" y="118" width="50" height="12" fill="rgba(79,158,255,0.15)" rx="3"/>
    <text x="67" y="128" fill="#4f9eff" font-size="8" font-family="monospace">London</text>
    <rect x="120" y="118" width="40" height="12" fill="rgba(46,204,138,0.15)" rx="3"/>
    <text x="122" y="128" fill="#2ecc8a" font-size="8" font-family="monospace">NY</text>
  </svg>`,

  ict_concepts: `<svg viewBox="0 0 300 140" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:140px;">
    <rect width="300" height="140" fill="#0d0f14" rx="8"/>
    <!-- BOS label -->
    <text x="8" y="20" fill="#a78bfa" font-size="9" font-family="monospace" font-weight="bold">BOS</text>
    <!-- Swing lows going up = BOS -->
    <polyline points="20,105 50,95 70,100 100,80 120,85 150,60 170,65 200,40" fill="none" stroke="#363c54" stroke-width="1" stroke-dasharray="2,2"/>
    <!-- Order Block zone -->
    <rect x="108" y="78" width="22" height="14" fill="rgba(79,158,255,0.2)" stroke="#4f9eff" stroke-width="1" rx="2"/>
    <text x="110" y="89" fill="#4f9eff" font-size="7" font-family="monospace">OB</text>
    <!-- Candles -->
    <rect x="25" y="90" width="8" height="15" fill="#ff5c5c" rx="1"/><line x1="29" y1="87" x2="29" y2="107" stroke="#ff5c5c" stroke-width="1"/>
    <rect x="40" y="80" width="8" height="18" fill="#2ecc8a" rx="1"/><line x1="44" y1="77" x2="44" y2="100" stroke="#2ecc8a" stroke-width="1"/>
    <rect x="55" y="85" width="8" height="14" fill="#ff5c5c" rx="1"/><line x1="59" y1="82" x2="59" y2="101" stroke="#ff5c5c" stroke-width="1"/>
    <!-- FVG zone -->
    <rect x="72" y="68" width="28" height="10" fill="rgba(46,204,138,0.15)" stroke="#2ecc8a" stroke-width="0.8" stroke-dasharray="2,2" rx="1"/>
    <text x="74" y="76" fill="#2ecc8a" font-size="7" font-family="monospace">FVG</text>
    <!-- Big bullish impulse -->
    <rect x="75" y="55" width="10" height="30" fill="#2ecc8a" rx="1"/><line x1="80" y1="52" x2="80" y2="87" stroke="#2ecc8a" stroke-width="1.5"/>
    <rect x="93" y="45" width="8" height="20" fill="#2ecc8a" rx="1"/>
    <!-- Retest OB -->
    <rect x="114" y="80" width="8" height="16" fill="#ff5c5c" rx="1"/><line x1="118" y1="77" x2="118" y2="98" stroke="#ff5c5c" stroke-width="1.5"/>
    <!-- Entry & bounce -->
    <rect x="130" y="62" width="8" height="20" fill="#2ecc8a" rx="1"/><line x1="134" y1="58" x2="134" y2="84" stroke="#2ecc8a" stroke-width="1"/>
    <rect x="146" y="48" width="8" height="18" fill="#2ecc8a" rx="1"/>
    <rect x="162" y="36" width="8" height="18" fill="#2ecc8a" rx="1"/>
    <!-- Arrow -->
    <path d="M118,75 L118,63 L124,68 M118,63 L112,68" stroke="#f5a623" stroke-width="1.8" fill="none"/>
    <!-- CHoCH label -->
    <text x="155" y="100" fill="#a78bfa" font-size="8" font-family="monospace">CHoCH →</text>
    <line x1="145" y1="85" x2="175" y2="65" stroke="#a78bfa" stroke-width="0.8" stroke-dasharray="2,2"/>
  </svg>`,

  supply_demand: `<svg viewBox="0 0 300 140" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:140px;">
    <rect width="300" height="140" fill="#0d0f14" rx="8"/>
    <!-- Supply zone top -->
    <rect x="20" y="25" width="260" height="16" fill="rgba(255,92,92,0.12)" stroke="#ff5c5c" stroke-width="0.8" stroke-dasharray="3,2" rx="2"/>
    <text x="24" y="36" fill="#ff5c5c" font-size="9" font-family="monospace">Supply Zone</text>
    <!-- Demand zone bottom -->
    <rect x="20" y="98" width="260" height="16" fill="rgba(46,204,138,0.12)" stroke="#2ecc8a" stroke-width="0.8" stroke-dasharray="3,2" rx="2"/>
    <text x="24" y="109" fill="#2ecc8a" font-size="9" font-family="monospace">Demand Zone</text>
    <!-- Price action -->
    <rect x="30" y="105" width="8" height="12" fill="#2ecc8a" rx="1"/><line x1="34" y1="100" x2="34" y2="118" stroke="#2ecc8a" stroke-width="1"/>
    <!-- Strong rally from demand -->
    <rect x="45" y="72" width="9" height="33" fill="#2ecc8a" rx="1"/><line x1="49" y1="68" x2="49" y2="107" stroke="#2ecc8a" stroke-width="1.5"/>
    <rect x="62" y="55" width="9" height="20" fill="#2ecc8a" rx="1"/>
    <rect x="79" y="42" width="9" height="18" fill="#2ecc8a" rx="1"/>
    <!-- Hit supply, fall -->
    <rect x="96" y="30" width="9" height="16" fill="#ff5c5c" rx="1"/><line x1="100" y1="27" x2="100" y2="48" stroke="#ff5c5c" stroke-width="1.5"/>
    <rect x="113" y="45" width="9" height="20" fill="#ff5c5c" rx="1"/>
    <rect x="130" y="60" width="9" height="22" fill="#ff5c5c" rx="1"/>
    <!-- Return to demand — entry -->
    <rect x="147" y="95" width="9" height="14" fill="#2ecc8a" rx="1"/><line x1="151" y1="91" x2="151" y2="111" stroke="#2ecc8a" stroke-width="1.5"/>
    <path d="M151,89 L151,77 L157,83 M151,77 L145,83" stroke="#f5a623" stroke-width="1.8" fill="none"/>
    <text x="160" y="78" fill="#f5a623" font-size="9" font-family="monospace">Entry</text>
    <!-- Bounce again -->
    <rect x="164" y="78" width="9" height="18" fill="#2ecc8a" rx="1"/>
    <rect x="181" y="60" width="9" height="20" fill="#2ecc8a" rx="1"/>
    <rect x="198" y="44" width="9" height="18" fill="#2ecc8a" rx="1"/>
  </svg>`,

  session_open: `<svg viewBox="0 0 300 140" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:140px;">
    <rect width="300" height="140" fill="#0d0f14" rx="8"/>
    <!-- Asian range box -->
    <rect x="20" y="55" width="80" height="35" fill="rgba(245,166,35,0.08)" stroke="#f5a623" stroke-width="1" stroke-dasharray="3,2" rx="3"/>
    <text x="24" y="50" fill="#f5a623" font-size="9" font-family="monospace">Asian Range</text>
    <!-- Asian candles (small, ranging) -->
    <rect x="26" y="65" width="7" height="10" fill="#2ecc8a" rx="1"/><line x1="29" y1="63" x2="29" y2="77" stroke="#2ecc8a" stroke-width="1"/>
    <rect x="38" y="68" width="7" height="9" fill="#ff5c5c" rx="1"/><line x1="41" y1="65" x2="41" y2="79" stroke="#ff5c5c" stroke-width="1"/>
    <rect x="50" y="64" width="7" height="11" fill="#2ecc8a" rx="1"/><line x1="53" y1="62" x2="53" y2="77" stroke="#2ecc8a" stroke-width="1"/>
    <rect x="62" y="67" width="7" height="9" fill="#ff5c5c" rx="1"/><line x1="65" y1="65" x2="65" y2="78" stroke="#ff5c5c" stroke-width="1"/>
    <rect x="74" y="63" width="7" height="12" fill="#2ecc8a" rx="1"/><line x1="77" y1="60" x2="77" y2="77" stroke="#2ecc8a" stroke-width="1"/>
    <!-- Asian high/low lines extending -->
    <line x1="20" y1="58" x2="280" y2="58" stroke="#f5a623" stroke-width="0.8" stroke-dasharray="3,3" opacity="0.5"/>
    <line x1="20" y1="88" x2="280" y2="88" stroke="#f5a623" stroke-width="0.8" stroke-dasharray="3,3" opacity="0.5"/>
    <!-- London open marker -->
    <line x1="105" y1="20" x2="105" y2="130" stroke="#4f9eff" stroke-width="1" stroke-dasharray="2,2" opacity="0.6"/>
    <text x="107" y="30" fill="#4f9eff" font-size="8" font-family="monospace">London</text>
    <text x="107" y="40" fill="#4f9eff" font-size="8" font-family="monospace">08:00</text>
    <!-- Breakout candle -->
    <rect x="108" y="35" width="11" height="30" fill="#2ecc8a" rx="1"/><line x1="113" y1="30" x2="113" y2="67" stroke="#2ecc8a" stroke-width="1.5"/>
    <!-- Retest -->
    <rect x="127" y="52" width="9" height="14" fill="#ff5c5c" rx="1"/><line x1="131" y1="49" x2="131" y2="68" stroke="#ff5c5c" stroke-width="1.5"/>
    <path d="M131,48 L131,36 L137,42 M131,36 L125,42" stroke="#f5a623" stroke-width="1.8" fill="none"/>
    <text x="140" y="37" fill="#f5a623" font-size="8" font-family="monospace">Entry</text>
    <!-- Continue up -->
    <rect x="144" y="38" width="9" height="18" fill="#2ecc8a" rx="1"/>
    <rect x="161" y="26" width="9" height="18" fill="#2ecc8a" rx="1"/>
    <rect x="178" y="18" width="9" height="16" fill="#2ecc8a" rx="1"/>
    <!-- NY marker -->
    <line x1="220" y1="20" x2="220" y2="130" stroke="#2ecc8a" stroke-width="1" stroke-dasharray="2,2" opacity="0.5"/>
    <text x="222" y="30" fill="#2ecc8a" font-size="8" font-family="monospace">NY</text>
    <text x="222" y="40" fill="#2ecc8a" font-size="8" font-family="monospace">14:30</text>
  </svg>`,

  supportresistance: `<svg viewBox="0 0 300 150" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:150px;">
    <rect width="300" height="150" fill="#0d0f14" rx="8"/>
    <!-- Resistance -->
    <line x1="20" y1="35" x2="280" y2="35" stroke="#ff5c5c" stroke-width="1.5" stroke-dasharray="5,3"/>
    <text x="224" y="30" fill="#ff5c5c" font-size="9" font-family="monospace">Resistance</text>
    <!-- Support -->
    <line x1="20" y1="115" x2="280" y2="115" stroke="#4f9eff" stroke-width="1.5" stroke-dasharray="5,3"/>
    <text x="236" y="128" fill="#4f9eff" font-size="9" font-family="monospace">Support</text>
    <!-- Candle 1: falling toward support -->
    <rect x="28" y="52" width="9" height="28" fill="#ff5c5c" rx="1"/>
    <line x1="32" y1="49" x2="32" y2="82" stroke="#ff5c5c" stroke-width="1"/>
    <!-- Candle 2: small red near support -->
    <rect x="45" y="85" width="9" height="18" fill="#ff5c5c" rx="1"/>
    <line x1="49" y1="82" x2="49" y2="105" stroke="#ff5c5c" stroke-width="1"/>
    <!-- Candle 3: bounce green -->
    <rect x="62" y="68" width="9" height="38" fill="#2ecc8a" rx="1"/>
    <line x1="66" y1="65" x2="66" y2="110" stroke="#2ecc8a" stroke-width="1"/>
    <!-- Candle 4 -->
    <rect x="79" y="52" width="9" height="30" fill="#2ecc8a" rx="1"/>
    <line x1="83" y1="50" x2="83" y2="84" stroke="#2ecc8a" stroke-width="1"/>
    <!-- Candle 5: approaches resistance -->
    <rect x="96" y="42" width="9" height="22" fill="#2ecc8a" rx="1"/>
    <line x1="100" y1="39" x2="100" y2="66" stroke="#2ecc8a" stroke-width="1"/>
    <!-- Candle 6: rejection at resistance -->
    <rect x="113" y="52" width="9" height="20" fill="#ff5c5c" rx="1"/>
    <line x1="117" y1="38" x2="117" y2="74" stroke="#ff5c5c" stroke-width="1"/>
    <!-- Candle 7 -->
    <rect x="130" y="62" width="9" height="22" fill="#ff5c5c" rx="1"/>
    <line x1="134" y1="60" x2="134" y2="86" stroke="#ff5c5c" stroke-width="1"/>
    <!-- Candle 8 -->
    <rect x="147" y="76" width="9" height="28" fill="#ff5c5c" rx="1"/>
    <line x1="151" y1="73" x2="151" y2="107" stroke="#ff5c5c" stroke-width="1"/>
    <!-- Candle 9: bounce off support again -->
    <rect x="164" y="70" width="9" height="36" fill="#2ecc8a" rx="1"/>
    <line x1="168" y1="66" x2="168" y2="110" stroke="#2ecc8a" stroke-width="1"/>
    <!-- Candle 10 -->
    <rect x="181" y="54" width="9" height="28" fill="#2ecc8a" rx="1"/>
    <line x1="185" y1="52" x2="185" y2="84" stroke="#2ecc8a" stroke-width="1"/>
    <!-- Labels bounce arrows -->
    <text x="28" y="145" fill="#4f9eff" font-size="8" font-family="monospace">↑ Bounce</text>
    <text x="113" y="145" fill="#ff5c5c" font-size="8" font-family="monospace">↓ Rejection</text>
    <text x="164" y="145" fill="#4f9eff" font-size="8" font-family="monospace">↑ Bounce</text>
  </svg>`,

  pinbar: `<svg viewBox="0 0 300 150" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:150px;">
    <rect width="300" height="150" fill="#0d0f14" rx="8"/>
    <!-- Divider -->
    <line x1="150" y1="10" x2="150" y2="140" stroke="#1e2230" stroke-width="1"/>
    <!-- LEFT: Bullish pin bar -->
    <text x="12" y="22" fill="#2ecc8a" font-size="9" font-family="monospace" font-weight="bold">Bullish Pin Bar</text>
    <!-- Context candles -->
    <rect x="20" y="55" width="9" height="22" fill="#ff5c5c" rx="1"/>
    <line x1="24" y1="52" x2="24" y2="79" stroke="#ff5c5c" stroke-width="1"/>
    <rect x="37" y="62" width="9" height="20" fill="#ff5c5c" rx="1"/>
    <line x1="41" y1="60" x2="41" y2="84" stroke="#ff5c5c" stroke-width="1"/>
    <!-- Pin bar: small green body, long lower wick -->
    <rect x="60" y="68" width="11" height="8" fill="#2ecc8a" rx="1"/>
    <line x1="65" y1="66" x2="65" y2="118" stroke="#2ecc8a" stroke-width="1.5"/>
    <line x1="65" y1="74" x2="65" y2="76" stroke="#2ecc8a" stroke-width="1.5"/>
    <!-- small upper wick -->
    <line x1="65" y1="62" x2="65" y2="68" stroke="#2ecc8a" stroke-width="1.5"/>
    <!-- Support line -->
    <line x1="10" y1="118" x2="140" y2="118" stroke="#4f9eff" stroke-width="1" stroke-dasharray="4,3"/>
    <text x="10" y="132" fill="#4f9eff" font-size="8" font-family="monospace">Support</text>
    <!-- Arrow -->
    <text x="80" y="100" fill="#2ecc8a" font-size="10" font-family="monospace">↑</text>
    <text x="76" y="112" fill="#2ecc8a" font-size="7" font-family="monospace">entry</text>

    <!-- RIGHT: Bearish pin bar -->
    <text x="158" y="22" fill="#ff5c5c" font-size="9" font-family="monospace" font-weight="bold">Bearish Pin Bar</text>
    <!-- Context candles -->
    <rect x="162" y="75" width="9" height="22" fill="#2ecc8a" rx="1"/>
    <line x1="166" y1="72" x2="166" y2="99" stroke="#2ecc8a" stroke-width="1"/>
    <rect x="179" y="68" width="9" height="20" fill="#2ecc8a" rx="1"/>
    <line x1="183" y1="65" x2="183" y2="90" stroke="#2ecc8a" stroke-width="1"/>
    <!-- Pin bar: small red body, long upper wick -->
    <rect x="202" y="72" width="11" height="8" fill="#ff5c5c" rx="1"/>
    <line x1="207" y1="30" x2="207" y2="72" stroke="#ff5c5c" stroke-width="1.5"/>
    <line x1="207" y1="80" x2="207" y2="84" stroke="#ff5c5c" stroke-width="1.5"/>
    <!-- Resistance line -->
    <line x1="155" y1="30" x2="285" y2="30" stroke="#ff5c5c" stroke-width="1" stroke-dasharray="4,3"/>
    <text x="155" y="25" fill="#ff5c5c" font-size="8" font-family="monospace">Resistance</text>
    <!-- Arrow -->
    <text x="225" y="75" fill="#ff5c5c" font-size="10" font-family="monospace">↓</text>
    <text x="221" y="87" fill="#ff5c5c" font-size="7" font-family="monospace">entry</text>
  </svg>`,

  engulfing: `<svg viewBox="0 0 300 150" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:150px;">
    <rect width="300" height="150" fill="#0d0f14" rx="8"/>
    <line x1="150" y1="10" x2="150" y2="140" stroke="#1e2230" stroke-width="1"/>
    <!-- LEFT: Bullish engulfing -->
    <text x="10" y="22" fill="#2ecc8a" font-size="9" font-family="monospace" font-weight="bold">Bullish Engulfing</text>
    <!-- Context: downtrend -->
    <rect x="18" y="45" width="10" height="20" fill="#ff5c5c" rx="1"/>
    <line x1="23" y1="43" x2="23" y2="67" stroke="#ff5c5c" stroke-width="1"/>
    <rect x="34" y="55" width="10" height="18" fill="#ff5c5c" rx="1"/>
    <line x1="39" y1="53" x2="39" y2="75" stroke="#ff5c5c" stroke-width="1"/>
    <!-- Small red candle -->
    <rect x="54" y="70" width="12" height="18" fill="#ff5c5c" rx="1"/>
    <line x1="60" y1="67" x2="60" y2="90" stroke="#ff5c5c" stroke-width="1.5"/>
    <!-- Big green engulfing -->
    <rect x="72" y="56" width="16" height="40" fill="#2ecc8a" rx="1"/>
    <line x1="80" y1="52" x2="80" y2="100" stroke="#2ecc8a" stroke-width="1.5"/>
    <!-- Brackets showing engulf -->
    <text x="50" y="112" fill="#f5a623" font-size="8" font-family="monospace">← omsloten →</text>
    <text x="70" y="130" fill="#2ecc8a" font-size="8" font-family="monospace">↑ Long signaal</text>

    <!-- RIGHT: Bearish engulfing -->
    <text x="157" y="22" fill="#ff5c5c" font-size="9" font-family="monospace" font-weight="bold">Bearish Engulfing</text>
    <!-- Context: uptrend -->
    <rect x="162" y="90" width="10" height="20" fill="#2ecc8a" rx="1"/>
    <line x1="167" y1="88" x2="167" y2="112" stroke="#2ecc8a" stroke-width="1"/>
    <rect x="178" y="75" width="10" height="18" fill="#2ecc8a" rx="1"/>
    <line x1="183" y1="73" x2="183" y2="95" stroke="#2ecc8a" stroke-width="1"/>
    <!-- Small green candle -->
    <rect x="198" y="62" width="12" height="16" fill="#2ecc8a" rx="1"/>
    <line x1="204" y1="59" x2="204" y2="80" stroke="#2ecc8a" stroke-width="1.5"/>
    <!-- Big red engulfing -->
    <rect x="216" y="50" width="16" height="42" fill="#ff5c5c" rx="1"/>
    <line x1="224" y1="46" x2="224" y2="96" stroke="#ff5c5c" stroke-width="1.5"/>
    <text x="196" y="112" fill="#f5a623" font-size="8" font-family="monospace">← omsloten →</text>
    <text x="210" y="130" fill="#ff5c5c" font-size="8" font-family="monospace">↓ Short signaal</text>
  </svg>`,

  breakretest: `<svg viewBox="0 0 300 150" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:150px;">
    <rect width="300" height="150" fill="#0d0f14" rx="8"/>
    <!-- Resistance / new support line -->
    <line x1="15" y1="80" x2="285" y2="80" stroke="#f5a623" stroke-width="1.5" stroke-dasharray="5,3"/>
    <text x="10" y="75" fill="#f5a623" font-size="8" font-family="monospace">Resistance → Support</text>
    <!-- Phase 1: consolidation below -->
    <rect x="18" y="90" width="9" height="15" fill="#ff5c5c" rx="1"/>
    <line x1="22" y1="88" x2="22" y2="107" stroke="#ff5c5c" stroke-width="1"/>
    <rect x="33" y="85" width="9" height="12" fill="#2ecc8a" rx="1"/>
    <line x1="37" y1="83" x2="37" y2="99" stroke="#2ecc8a" stroke-width="1"/>
    <rect x="48" y="88" width="9" height="14" fill="#ff5c5c" rx="1"/>
    <line x1="52" y1="86" x2="52" y2="104" stroke="#ff5c5c" stroke-width="1"/>
    <!-- Breakout candle -->
    <rect x="68" y="52" width="12" height="30" fill="#2ecc8a" rx="1"/>
    <line x1="74" y1="48" x2="74" y2="84" stroke="#2ecc8a" stroke-width="2"/>
    <text x="65" y="44" fill="#2ecc8a" font-size="8" font-family="monospace">Breakout</text>
    <!-- After breakout: higher -->
    <rect x="86" y="38" width="9" height="20" fill="#2ecc8a" rx="1"/>
    <line x1="90" y1="36" x2="90" y2="60" stroke="#2ecc8a" stroke-width="1"/>
    <rect x="101" y="30" width="9" height="18" fill="#2ecc8a" rx="1"/>
    <line x1="105" y1="28" x2="105" y2="50" stroke="#2ecc8a" stroke-width="1"/>
    <!-- Pullback to level (retest) -->
    <rect x="121" y="58" width="9" height="20" fill="#ff5c5c" rx="1"/>
    <line x1="125" y1="55" x2="125" y2="80" stroke="#ff5c5c" stroke-width="1"/>
    <rect x="136" y="64" width="9" height="18" fill="#ff5c5c" rx="1"/>
    <line x1="140" y1="62" x2="140" y2="84" stroke="#ff5c5c" stroke-width="1"/>
    <!-- Pin bar at retest -->
    <rect x="154" y="72" width="10" height="7" fill="#2ecc8a" rx="1"/>
    <line x1="159" y1="70" x2="159" y2="86" stroke="#2ecc8a" stroke-width="1.5"/>
    <text x="148" y="100" fill="#4f9eff" font-size="8" font-family="monospace">Retest</text>
    <text x="148" y="110" fill="#4f9eff" font-size="7" font-family="monospace">← entry</text>
    <!-- Continue up -->
    <rect x="172" y="52" width="9" height="22" fill="#2ecc8a" rx="1"/>
    <line x1="176" y1="49" x2="176" y2="76" stroke="#2ecc8a" stroke-width="1"/>
    <rect x="187" y="36" width="9" height="20" fill="#2ecc8a" rx="1"/>
    <line x1="191" y1="34" x2="191" y2="58" stroke="#2ecc8a" stroke-width="1"/>
    <rect x="202" y="24" width="9" height="18" fill="#2ecc8a" rx="1"/>
    <line x1="206" y1="22" x2="206" y2="44" stroke="#2ecc8a" stroke-width="1"/>
    <text x="188" y="140" fill="#2ecc8a" font-size="8" font-family="monospace">↑ Verderzetting</text>
  </svg>`,

  higherlow: `<svg viewBox="0 0 300 150" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:150px;">
    <rect width="300" height="150" fill="#0d0f14" rx="8"/>
    <text x="10" y="18" fill="#2ecc8a" font-size="9" font-family="monospace" font-weight="bold">Uptrend: Higher Highs &amp; Higher Lows</text>
    <!-- Trend line -->
    <line x1="30" y1="120" x2="270" y2="40" stroke="#2ecc8a" stroke-width="1" stroke-dasharray="3,3" opacity="0.4"/>
    <!-- Wave: LL → LH → HL → HH → HL2 → HH2 -->
    <!-- Start low -->
    <circle cx="30" cy="120" r="3" fill="#4f9eff"/>
    <text x="15" y="136" fill="#4f9eff" font-size="8" font-family="monospace">Start</text>
    <!-- Rally to HH1 -->
    <line x1="30" y1="120" x2="80" y2="75" stroke="#2ecc8a" stroke-width="1.5"/>
    <circle cx="80" cy="75" r="3" fill="#2ecc8a"/>
    <text x="72" y="70" fill="#2ecc8a" font-size="8" font-family="monospace">HH1</text>
    <!-- Pullback to HL1 -->
    <line x1="80" y1="75" x2="120" y2="100" stroke="#ff5c5c" stroke-width="1.5"/>
    <circle cx="120" cy="100" r="3" fill="#4f9eff"/>
    <text x="108" y="116" fill="#4f9eff" font-size="8" font-family="monospace">HL1</text>
    <!-- Rally to HH2 -->
    <line x1="120" y1="100" x2="175" y2="52" stroke="#2ecc8a" stroke-width="1.5"/>
    <circle cx="175" cy="52" r="3" fill="#2ecc8a"/>
    <text x="167" y="47" fill="#2ecc8a" font-size="8" font-family="monospace">HH2</text>
    <!-- Pullback to HL2 -->
    <line x1="175" y1="52" x2="215" y2="76" stroke="#ff5c5c" stroke-width="1.5"/>
    <circle cx="215" cy="76" r="3" fill="#4f9eff"/>
    <text x="203" y="92" fill="#4f9eff" font-size="8" font-family="monospace">HL2</text>
    <!-- Rally to HH3 -->
    <line x1="215" y1="76" x2="265" y2="33" stroke="#2ecc8a" stroke-width="1.5"/>
    <circle cx="265" cy="33" r="3" fill="#2ecc8a"/>
    <text x="257" y="28" fill="#2ecc8a" font-size="8" font-family="monospace">HH3</text>
    <!-- Legend -->
    <rect x="10" y="138" width="8" height="8" fill="#2ecc8a" rx="1"/>
    <text x="22" y="146" fill="#2ecc8a" font-size="8" font-family="monospace">HH = Higher High</text>
    <rect x="155" y="138" width="8" height="8" fill="#4f9eff" rx="1"/>
    <text x="167" y="146" fill="#4f9eff" font-size="8" font-family="monospace">HL = Higher Low</text>
  </svg>`,

  fvg: `<svg viewBox="0 0 300 155" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:155px;">
    <rect width="300" height="155" fill="#0d0f14" rx="8"/>
    <text x="10" y="16" fill="#f5a623" font-size="9" font-family="monospace" font-weight="bold">Fair Value Gap (FVG)</text>
    <!-- Context candles going up -->
    <rect x="18" y="100" width="11" height="22" fill="#ff5c5c" rx="1"/><line x1="23" y1="97" x2="23" y2="124" stroke="#ff5c5c" stroke-width="1"/>
    <rect x="36" y="92" width="11" height="20" fill="#2ecc8a" rx="1"/><line x1="41" y1="89" x2="41" y2="114" stroke="#2ecc8a" stroke-width="1"/>
    <!-- Candle 1 -->
    <rect x="55" y="80" width="13" height="24" fill="#2ecc8a" rx="1"/>
    <line x1="61" y1="77" x2="61" y2="106" stroke="#2ecc8a" stroke-width="1.5"/>
    <text x="52" y="128" fill="#4f9eff" font-size="7" font-family="monospace">C1</text>
    <!-- Candle 2: impulse -->
    <rect x="75" y="40" width="13" height="42" fill="#2ecc8a" rx="1"/>
    <line x1="81" y1="35" x2="81" y2="84" stroke="#2ecc8a" stroke-width="2"/>
    <text x="72" y="128" fill="#4f9eff" font-size="7" font-family="monospace">C2</text>
    <!-- Candle 3 -->
    <rect x="95" y="28" width="13" height="20" fill="#2ecc8a" rx="1"/>
    <line x1="101" y1="25" x2="101" y2="50" stroke="#2ecc8a" stroke-width="1.5"/>
    <text x="92" y="128" fill="#4f9eff" font-size="7" font-family="monospace">C3</text>
    <!-- FVG zone: top of C1 wick to bottom of C3 wick -->
    <rect x="55" y="50" width="53" height="27" fill="rgba(245,166,35,0.15)" rx="2"/>
    <line x1="55" y1="50" x2="108" y2="50" stroke="#f5a623" stroke-width="1" stroke-dasharray="3,2"/>
    <line x1="55" y1="77" x2="108" y2="77" stroke="#f5a623" stroke-width="1" stroke-dasharray="3,2"/>
    <text x="112" y="58" fill="#f5a623" font-size="8" font-family="monospace">FVG</text>
    <text x="112" y="68" fill="#f5a623" font-size="7" font-family="monospace">zone</text>
    <!-- Continuation -->
    <rect x="115" y="18" width="11" height="16" fill="#2ecc8a" rx="1"/><line x1="120" y1="15" x2="120" y2="36" stroke="#2ecc8a" stroke-width="1"/>
    <rect x="132" y="10" width="11" height="14" fill="#2ecc8a" rx="1"/><line x1="137" y1="7" x2="137" y2="26" stroke="#2ecc8a" stroke-width="1"/>
    <!-- Pullback into FVG -->
    <rect x="152" y="42" width="11" height="24" fill="#ff5c5c" rx="1"/><line x1="157" y1="38" x2="157" y2="68" stroke="#ff5c5c" stroke-width="1.5"/>
    <rect x="168" y="48" width="11" height="18" fill="#ff5c5c" rx="1"/><line x1="173" y1="45" x2="173" y2="68" stroke="#ff5c5c" stroke-width="1.5"/>
    <!-- Entry at FVG -->
    <circle cx="178" cy="63" r="4" fill="none" stroke="#f5a623" stroke-width="1.5"/>
    <text x="182" y="67" fill="#f5a623" font-size="7" font-family="monospace">Entry</text>
    <!-- Continue up -->
    <rect x="188" y="30" width="11" height="28" fill="#2ecc8a" rx="1"/><line x1="193" y1="26" x2="193" y2="60" stroke="#2ecc8a" stroke-width="1"/>
    <rect x="205" y="16" width="11" height="20" fill="#2ecc8a" rx="1"/><line x1="210" y1="13" x2="210" y2="38" stroke="#2ecc8a" stroke-width="1"/>
    <!-- 50% line -->
    <line x1="55" y1="63" x2="108" y2="63" stroke="rgba(245,166,35,0.5)" stroke-width="1" stroke-dasharray="2,2"/>
    <text x="222" y="67" fill="rgba(245,166,35,0.7)" font-size="7" font-family="monospace">50%</text>
  </svg>`,

  orderblock: `<svg viewBox="0 0 300 155" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:155px;">
    <rect width="300" height="155" fill="#0d0f14" rx="8"/>
    <text x="10" y="16" fill="#f5a623" font-size="9" font-family="monospace" font-weight="bold">Order Block (OB)</text>
    <!-- Downtrend context -->
    <rect x="15" y="30" width="11" height="18" fill="#ff5c5c" rx="1"/><line x1="20" y1="27" x2="20" y2="50" stroke="#ff5c5c" stroke-width="1"/>
    <rect x="32" y="40" width="11" height="20" fill="#ff5c5c" rx="1"/><line x1="37" y1="37" x2="37" y2="62" stroke="#ff5c5c" stroke-width="1"/>
    <!-- Last bearish candle (future OB) - highlighted -->
    <rect x="50" y="52" width="13" height="24" fill="#ff5c5c" rx="1" stroke="#f5a623" stroke-width="1.5"/>
    <line x1="56" y1="48" x2="56" y2="78" stroke="#ff5c5c" stroke-width="1.5"/>
    <text x="45" y="92" fill="#f5a623" font-size="7" font-family="monospace">OB zone</text>
    <!-- OB zone rectangle -->
    <rect x="50" y="52" width="120" height="24" fill="rgba(245,166,35,0.1)" rx="2"/>
    <line x1="50" y1="52" x2="170" y2="52" stroke="#f5a623" stroke-width="1" stroke-dasharray="3,2"/>
    <line x1="50" y1="76" x2="170" y2="76" stroke="#f5a623" stroke-width="1" stroke-dasharray="3,2"/>
    <!-- Strong impulse down -->
    <rect x="70" y="76" width="13" height="44" fill="#ff5c5c" rx="1"/>
    <line x1="76" y1="72" x2="76" y2="122" stroke="#ff5c5c" stroke-width="2"/>
    <!-- Continuation down -->
    <rect x="90" y="105" width="11" height="20" fill="#ff5c5c" rx="1"/><line x1="95" y1="102" x2="95" y2="127" stroke="#ff5c5c" stroke-width="1"/>
    <rect x="107" y="112" width="11" height="18" fill="#ff5c5c" rx="1"/><line x1="112" y1="108" x2="112" y2="132" stroke="#ff5c5c" stroke-width="1"/>
    <!-- Retest of OB -->
    <rect x="128" y="72" width="11" height="30" fill="#2ecc8a" rx="1"/><line x1="133" y1="68" x2="133" y2="104" stroke="#2ecc8a" stroke-width="1"/>
    <rect x="145" y="60" width="11" height="22" fill="#2ecc8a" rx="1"/><line x1="150" y1="56" x2="150" y2="84" stroke="#2ecc8a" stroke-width="1.5"/>
    <!-- Entry at OB -->
    <circle cx="155" cy="64" r="4" fill="none" stroke="#f5a623" stroke-width="1.5"/>
    <text x="160" y="68" fill="#f5a623" font-size="7" font-family="monospace">Entry short</text>
    <!-- Continue down -->
    <rect x="175" y="80" width="11" height="28" fill="#ff5c5c" rx="1"/><line x1="180" y1="77" x2="180" y2="110" stroke="#ff5c5c" stroke-width="1"/>
    <rect x="192" y="96" width="11" height="24" fill="#ff5c5c" rx="1"/><line x1="197" y1="93" x2="197" y2="122" stroke="#ff5c5c" stroke-width="1"/>
  </svg>`,

  liquiditysweep: `<svg viewBox="0 0 300 155" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:155px;">
    <rect width="300" height="155" fill="#0d0f14" rx="8"/>
    <text x="10" y="16" fill="#ff5c5c" font-size="9" font-family="monospace" font-weight="bold">Liquidity Sweep / Stop Hunt</text>
    <!-- Equal highs (liquidity) -->
    <line x1="20" y1="50" x2="160" y2="50" stroke="rgba(79,158,255,0.4)" stroke-width="1" stroke-dasharray="4,3"/>
    <text x="162" y="54" fill="#4f9eff" font-size="7" font-family="monospace">Stops hier!</text>
    <!-- Candles approaching highs -->
    <rect x="20" y="70" width="11" height="26" fill="#2ecc8a" rx="1"/><line x1="25" y1="66" x2="25" y2="98" stroke="#2ecc8a" stroke-width="1"/>
    <rect x="38" y="62" width="11" height="20" fill="#ff5c5c" rx="1"/><line x1="43" y1="58" x2="43" y2="84" stroke="#ff5c5c" stroke-width="1"/>
    <rect x="56" y="56" width="11" height="20" fill="#2ecc8a" rx="1"/><line x1="61" y1="52" x2="61" y2="78" stroke="#2ecc8a" stroke-width="1"/>
    <!-- Equal highs -->
    <circle cx="25" cy="52" r="3" fill="#4f9eff"/>
    <circle cx="61" cy="52" r="3" fill="#4f9eff"/>
    <rect x="74" y="62" width="11" height="18" fill="#ff5c5c" rx="1"/><line x1="79" y1="52" x2="79" y2="82" stroke="#ff5c5c" stroke-width="1"/>
    <circle cx="79" cy="52" r="3" fill="#4f9eff"/>
    <!-- SWEEP candle: wick goes above the equal highs -->
    <rect x="94" y="58" width="13" height="16" fill="#2ecc8a" rx="1"/>
    <line x1="100" y1="32" x2="100" y2="76" stroke="#2ecc8a" stroke-width="2"/>
    <text x="106" y="30" fill="#ff5c5c" font-size="8" font-family="monospace">SWEEP!</text>
    <!-- Arrow showing sweep -->
    <path d="M100,38 L100,28" stroke="#ff5c5c" stroke-width="2" marker-end="url(#arr)"/>
    <!-- Rejection / reversal -->
    <rect x="114" y="68" width="13" height="28" fill="#ff5c5c" rx="1"/>
    <line x1="120" y1="62" x2="120" y2="98" stroke="#ff5c5c" stroke-width="2"/>
    <!-- Strong drop -->
    <rect x="134" y="84" width="11" height="30" fill="#ff5c5c" rx="1"/><line x1="139" y1="80" x2="139" y2="116" stroke="#ff5c5c" stroke-width="1.5"/>
    <rect x="151" y="98" width="11" height="26" fill="#ff5c5c" rx="1"/><line x1="156" y1="94" x2="156" y2="126" stroke="#ff5c5c" stroke-width="1.5"/>
    <rect x="168" y="110" width="11" height="22" fill="#ff5c5c" rx="1"/><line x1="173" y1="106" x2="173" y2="134" stroke="#ff5c5c" stroke-width="1.5"/>
    <!-- Entry -->
    <circle cx="120" cy="66" r="4" fill="none" stroke="#f5a623" stroke-width="1.5"/>
    <text x="126" y="62" fill="#f5a623" font-size="7" font-family="monospace">Short entry</text>
    <!-- Labels -->
    <text x="10" y="148" fill="#4f9eff" font-size="8" font-family="monospace">● = stops boven equal highs</text>
  </svg>`,

  bos: `<svg viewBox="0 0 300 155" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:155px;">
    <rect width="300" height="155" fill="#0d0f14" rx="8"/>
    <text x="10" y="16" fill="#2ecc8a" font-size="9" font-family="monospace" font-weight="bold">Break of Structure (BOS) — Trendcontinuatie</text>
    <!-- Uptrend with BOS markers -->
    <!-- Wave 1 -->
    <circle cx="25" cy="125" r="3" fill="#4f9eff"/>
    <line x1="25" y1="125" x2="60" y2="88" stroke="#2ecc8a" stroke-width="1.5"/>
    <circle cx="60" cy="88" r="3" fill="#2ecc8a"/>
    <text x="52" y="84" fill="#2ecc8a" font-size="7" font-family="monospace">HH1</text>
    <!-- BOS 1 line -->
    <line x1="60" y1="88" x2="200" y2="88" stroke="#2ecc8a" stroke-width="1" stroke-dasharray="3,2" opacity="0.5"/>
    <line x1="60" y1="105" x2="200" y2="105" stroke="#4f9eff" stroke-width="1" stroke-dasharray="3,2" opacity="0.4"/>
    <!-- Pullback 1 -->
    <line x1="60" y1="88" x2="85" y2="105" stroke="#ff5c5c" stroke-width="1.5"/>
    <circle cx="85" cy="105" r="3" fill="#4f9eff"/>
    <text x="77" y="118" fill="#4f9eff" font-size="7" font-family="monospace">HL1</text>
    <!-- Rally to BOS -->
    <line x1="85" y1="105" x2="115" y2="72" stroke="#2ecc8a" stroke-width="1.5"/>
    <circle cx="115" cy="72" r="3" fill="#2ecc8a"/>
    <!-- BOS label -->
    <rect x="108" y="82" width="24" height="10" fill="rgba(46,204,138,0.2)" rx="3"/>
    <text x="110" y="90" fill="#2ecc8a" font-size="7" font-family="monospace" font-weight="bold">BOS ✓</text>
    <!-- HH2 -->
    <text x="107" y="68" fill="#2ecc8a" font-size="7" font-family="monospace">HH2</text>
    <!-- Pullback 2 -->
    <line x1="115" y1="72" x2="145" y2="92" stroke="#ff5c5c" stroke-width="1.5"/>
    <circle cx="145" cy="92" r="3" fill="#4f9eff"/>
    <text x="137" y="106" fill="#4f9eff" font-size="7" font-family="monospace">HL2</text>
    <!-- Rally to HH3 -->
    <line x1="145" y1="92" x2="180" y2="52" stroke="#2ecc8a" stroke-width="1.5"/>
    <circle cx="180" cy="52" r="3" fill="#2ecc8a"/>
    <text x="172" y="48" fill="#2ecc8a" font-size="7" font-family="monospace">HH3</text>
    <!-- BOS 2 label -->
    <rect x="173" y="62" width="24" height="10" fill="rgba(46,204,138,0.2)" rx="3"/>
    <text x="175" y="70" fill="#2ecc8a" font-size="7" font-family="monospace" font-weight="bold">BOS ✓</text>
    <!-- Entry zones -->
    <rect x="82" y="100" width="14" height="10" fill="rgba(245,166,35,0.2)" rx="2"/>
    <text x="83" y="108" fill="#f5a623" font-size="6" font-family="monospace">Entry</text>
    <rect x="142" y="87" width="14" height="10" fill="rgba(245,166,35,0.2)" rx="2"/>
    <text x="143" y="95" fill="#f5a623" font-size="6" font-family="monospace">Entry</text>
    <text x="10" y="148" fill="#2ecc8a" font-size="8" font-family="monospace">BOS = prijs breekt vorig HH → trend gaat door</text>
  </svg>`,

  choch: `<svg viewBox="0 0 300 155" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:155px;">
    <rect width="300" height="155" fill="#0d0f14" rx="8"/>
    <text x="10" y="16" fill="#f5a623" font-size="9" font-family="monospace" font-weight="bold">Change of Character (ChoCH) — Trendommekeer</text>
    <!-- Downtrend: LL en LH -->
    <circle cx="20" cy="35" r="3" fill="#ff5c5c"/>
    <text x="12" y="30" fill="#ff5c5c" font-size="7" font-family="monospace">LH1</text>
    <line x1="20" y1="35" x2="50" y2="70" stroke="#ff5c5c" stroke-width="1.5"/>
    <circle cx="50" cy="70" r="3" fill="#4f9eff"/>
    <text x="42" y="82" fill="#4f9eff" font-size="7" font-family="monospace">LL1</text>
    <line x1="50" y1="70" x2="75" y2="50" stroke="#2ecc8a" stroke-width="1.5"/>
    <circle cx="75" cy="50" r="3" fill="#ff5c5c"/>
    <text x="67" y="45" fill="#ff5c5c" font-size="7" font-family="monospace">LH2</text>
    <line x1="75" y1="50" x2="105" y2="90" stroke="#ff5c5c" stroke-width="1.5"/>
    <circle cx="105" cy="90" r="3" fill="#4f9eff"/>
    <text x="97" y="102" fill="#4f9eff" font-size="7" font-family="monospace">LL2</text>
    <!-- ChoCH: breaks above LH2 -->
    <line x1="75" y1="50" x2="220" y2="50" stroke="#f5a623" stroke-width="1" stroke-dasharray="3,2"/>
    <line x1="105" y1="90" x2="140" y2="38" stroke="#2ecc8a" stroke-width="2"/>
    <circle cx="140" cy="38" r="4" fill="#f5a623"/>
    <!-- ChoCH label -->
    <rect x="142" y="30" width="36" height="12" fill="rgba(245,166,35,0.25)" rx="3"/>
    <text x="144" y="40" fill="#f5a623" font-size="8" font-family="monospace" font-weight="bold">ChoCH!</text>
    <!-- New uptrend starts -->
    <line x1="140" y1="38" x2="165" y2="60" stroke="#ff5c5c" stroke-width="1.5"/>
    <circle cx="165" cy="60" r="3" fill="#4f9eff"/>
    <text x="158" y="72" fill="#4f9eff" font-size="7" font-family="monospace">HL</text>
    <line x1="165" y1="60" x2="200" y2="28" stroke="#2ecc8a" stroke-width="2"/>
    <circle cx="200" cy="28" r="3" fill="#2ecc8a"/>
    <text x="192" y="24" fill="#2ecc8a" font-size="7" font-family="monospace">HH</text>
    <!-- BOS after ChoCH -->
    <rect x="192" y="38" width="24" height="10" fill="rgba(46,204,138,0.2)" rx="3"/>
    <text x="194" y="46" fill="#2ecc8a" font-size="7" font-family="monospace">BOS ✓</text>
    <!-- Entry zone -->
    <rect x="160" y="55" width="14" height="10" fill="rgba(245,166,35,0.2)" rx="2"/>
    <text x="161" y="63" fill="#f5a623" font-size="6" font-family="monospace">Entry</text>
    <text x="10" y="148" fill="#f5a623" font-size="8" font-family="monospace">ChoCH = breekt LH → mogelijke ommekeer</text>
  </svg>`,

  premiumdiscount: `<svg viewBox="0 0 300 155" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:155px;">
    <rect width="300" height="155" fill="#0d0f14" rx="8"/>
    <text x="10" y="16" fill="#4f9eff" font-size="9" font-family="monospace" font-weight="bold">Premium &amp; Discount Zones</text>
    <!-- Range box -->
    <line x1="20" y1="30" x2="280" y2="30" stroke="#2ecc8a" stroke-width="1.5"/>
    <text x="222" y="26" fill="#2ecc8a" font-size="8" font-family="monospace">Swing High</text>
    <line x1="20" y1="125" x2="280" y2="125" stroke="#ff5c5c" stroke-width="1.5"/>
    <text x="222" y="140" fill="#ff5c5c" font-size="8" font-family="monospace">Swing Low</text>
    <!-- 50% equilibrium -->
    <line x1="20" y1="77" x2="280" y2="77" stroke="#f5a623" stroke-width="1.5" stroke-dasharray="5,3"/>
    <text x="222" y="73" fill="#f5a623" font-size="8" font-family="monospace">50% EQ</text>
    <!-- Premium zone -->
    <rect x="20" y="30" width="195" height="47" fill="rgba(255,92,92,0.06)" rx="0"/>
    <text x="22" y="57" fill="#ff5c5c" font-size="9" font-family="monospace" font-weight="bold">PREMIUM</text>
    <text x="22" y="68" fill="#ff5c5c" font-size="8" font-family="monospace">→ Zoek shorts hier</text>
    <!-- Discount zone -->
    <rect x="20" y="77" width="195" height="48" fill="rgba(46,204,138,0.06)" rx="0"/>
    <text x="22" y="100" fill="#2ecc8a" font-size="9" font-family="monospace" font-weight="bold">DISCOUNT</text>
    <text x="22" y="111" fill="#2ecc8a" font-size="8" font-family="monospace">→ Zoek longs hier</text>
    <!-- Price movement example -->
    <polyline points="230,30 235,45 228,38 232,60 225,52 228,77 222,92 230,108 218,100 222,125" fill="none" stroke="#4f9eff" stroke-width="1.5"/>
    <!-- Entry markers -->
    <circle cx="228" cy="77" r="4" fill="none" stroke="#f5a623" stroke-width="1.5"/>
    <circle cx="222" cy="92" r="4" fill="#2ecc8a" opacity="0.7"/>
    <text x="238" y="80" fill="#f5a623" font-size="7" font-family="monospace">EQ</text>
    <text x="232" y="96" fill="#2ecc8a" font-size="7" font-family="monospace">Long!</text>
  </svg>`,

  orb: `<svg viewBox="0 0 300 155" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:155px;">
    <rect width="300" height="155" fill="#0d0f14" rx="8"/>
    <text x="10" y="16" fill="#f5a623" font-size="9" font-family="monospace" font-weight="bold">Opening Range Breakout (ORB15)</text>
    <!-- Time axis labels -->
    <text x="18" y="148" fill="#4f9eff" font-size="7" font-family="monospace">08:00</text>
    <text x="68" y="148" fill="#4f9eff" font-size="7" font-family="monospace">08:15</text>
    <text x="118" y="148" fill="#muted" font-size="7" font-family="monospace">08:30</text>
    <text x="178" y="148" fill="#muted" font-size="7" font-family="monospace">09:00</text>
    <!-- Opening range zone (08:00-08:15) -->
    <rect x="20" y="58" width="52" height="52" fill="rgba(79,158,255,0.1)" rx="2"/>
    <!-- ORB candles (range formation) -->
    <rect x="22" y="72" width="9" height="24" fill="#ff5c5c" rx="1"/><line x1="26" y1="68" x2="26" y2="98" stroke="#ff5c5c" stroke-width="1"/>
    <rect x="35" y="66" width="9" height="20" fill="#2ecc8a" rx="1"/><line x1="39" y1="62" x2="39" y2="88" stroke="#2ecc8a" stroke-width="1"/>
    <rect x="48" y="70" width="9" height="18" fill="#ff5c5c" rx="1"/><line x1="52" y1="66" x2="52" y2="90" stroke="#ff5c5c" stroke-width="1"/>
    <!-- ORB High line -->
    <line x1="20" y1="58" x2="240" y2="58" stroke="#2ecc8a" stroke-width="1.5" stroke-dasharray="5,3"/>
    <text x="242" y="62" fill="#2ecc8a" font-size="8" font-family="monospace">ORB H</text>
    <!-- ORB Low line -->
    <line x1="20" y1="110" x2="240" y2="110" stroke="#ff5c5c" stroke-width="1.5" stroke-dasharray="5,3"/>
    <text x="242" y="114" fill="#ff5c5c" font-size="8" font-family="monospace">ORB L</text>
    <!-- Range label -->
    <line x1="15" y1="58" x2="15" y2="110" stroke="#4f9eff" stroke-width="1"/>
    <line x1="12" y1="58" x2="18" y2="58" stroke="#4f9eff" stroke-width="1"/>
    <line x1="12" y1="110" x2="18" y2="110" stroke="#4f9eff" stroke-width="1"/>
    <text x="2" y="87" fill="#4f9eff" font-size="7" font-family="monospace" transform="rotate(-90,8,87)">Range</text>
    <!-- Breakout candle (after 08:15) -->
    <rect x="75" y="36" width="11" height="26" fill="#2ecc8a" rx="1"/>
    <line x1="80" y1="30" x2="80" y2="64" stroke="#2ecc8a" stroke-width="2"/>
    <!-- Breakout label -->
    <text x="64" y="28" fill="#2ecc8a" font-size="7" font-family="monospace">Breakout!</text>
    <!-- Entry arrow -->
    <path d="M80,44 L80,34" stroke="#f5a623" stroke-width="1.5"/>
    <circle cx="80" cy="56" r="4" fill="none" stroke="#f5a623" stroke-width="1.5"/>
    <text x="88" y="60" fill="#f5a623" font-size="7" font-family="monospace">Entry</text>
    <!-- Continuation -->
    <rect x="92" y="26" width="9" height="18" fill="#2ecc8a" rx="1"/><line x1="96" y1="22" x2="96" y2="46" stroke="#2ecc8a" stroke-width="1"/>
    <rect x="107" y="18" width="9" height="16" fill="#2ecc8a" rx="1"/><line x1="111" y1="14" x2="111" y2="36" stroke="#2ecc8a" stroke-width="1"/>
    <rect x="122" y="22" width="9" height="14" fill="#ff5c5c" rx="1"/><line x1="126" y1="18" x2="126" y2="38" stroke="#ff5c5c" stroke-width="1"/>
    <rect x="137" y="14" width="9" height="16" fill="#2ecc8a" rx="1"/><line x1="141" y1="10" x2="141" y2="32" stroke="#2ecc8a" stroke-width="1"/>
    <!-- SL line -->
    <line x1="75" y1="118" x2="175" y2="118" stroke="#ff5c5c" stroke-width="1" stroke-dasharray="3,2"/>
    <text x="177" y="122" fill="#ff5c5c" font-size="7" font-family="monospace">SL</text>
    <!-- TP line -->
    <line x1="75" y1="24" x2="175" y2="24" stroke="#2ecc8a" stroke-width="1" stroke-dasharray="3,2"/>
    <text x="177" y="28" fill="#2ecc8a" font-size="7" font-family="monospace">TP</text>
    <!-- Open marker -->
    <line x1="20" y1="22" x2="20" y2="138" stroke="#4f9eff" stroke-width="1" stroke-dasharray="2,2" opacity="0.5"/>
    <text x="22" y="33" fill="#4f9eff" font-size="7" font-family="monospace">Open</text>
  </svg>`,

  inducement: `<svg viewBox="0 0 300 155" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:155px;">
    <rect width="300" height="155" fill="#0d0f14" rx="8"/>
    <text x="10" y="16" fill="#ff5c5c" font-size="9" font-family="monospace" font-weight="bold">Inducement (IDM) — Valse pullback</text>
    <!-- Uptrend context -->
    <line x1="15" y1="125" x2="55" y2="75" stroke="#2ecc8a" stroke-width="1.5"/>
    <circle cx="55" cy="75" r="3" fill="#2ecc8a"/>
    <text x="47" y="70" fill="#2ecc8a" font-size="7" font-family="monospace">HH</text>
    <!-- Pullback creates IDM -->
    <line x1="55" y1="75" x2="85" y2="98" stroke="#ff5c5c" stroke-width="1.5"/>
    <circle cx="85" cy="98" r="4" fill="#f5a623"/>
    <text x="72" y="112" fill="#f5a623" font-size="7" font-family="monospace">IDM</text>
    <text x="60" y="120" fill="#f5a623" font-size="6" font-family="monospace">(stops hier)</text>
    <!-- IDM stop line -->
    <line x1="85" y1="98" x2="200" y2="98" stroke="#f5a623" stroke-width="1" stroke-dasharray="3,2" opacity="0.6"/>
    <!-- Rally -->
    <line x1="85" y1="98" x2="110" y2="78" stroke="#2ecc8a" stroke-width="1.5"/>
    <circle cx="110" cy="78" r="3" fill="#2ecc8a"/>
    <!-- Sweep of IDM low -->
    <line x1="110" y1="78" x2="130" y2="104" stroke="#ff5c5c" stroke-width="2"/>
    <circle cx="130" cy="104" r="4" fill="#ff5c5c"/>
    <text x="134" y="108" fill="#ff5c5c" font-size="7" font-family="monospace">SWEEP IDM!</text>
    <!-- Reversal up (real move) -->
    <line x1="130" y1="104" x2="160" y2="65" stroke="#2ecc8a" stroke-width="2.5"/>
    <circle cx="160" cy="65" r="3" fill="#2ecc8a"/>
    <text x="152" y="60" fill="#2ecc8a" font-size="7" font-family="monospace">HH2</text>
    <!-- BOS -->
    <rect x="113" y="68" width="24" height="10" fill="rgba(46,204,138,0.2)" rx="3"/>
    <text x="115" y="76" fill="#2ecc8a" font-size="7" font-family="monospace">BOS ✓</text>
    <!-- Continue -->
    <line x1="160" y1="65" x2="180" y2="80" stroke="#ff5c5c" stroke-width="1.5"/>
    <line x1="180" y1="80" x2="215" y2="42" stroke="#2ecc8a" stroke-width="2"/>
    <circle cx="215" cy="42" r="3" fill="#2ecc8a"/>
    <!-- Entry -->
    <circle cx="180" cy="80" r="4" fill="none" stroke="#f5a623" stroke-width="1.5"/>
    <text x="185" y="84" fill="#f5a623" font-size="7" font-family="monospace">Entry long</text>
    <text x="10" y="148" fill="#f5a623" font-size="8" font-family="monospace">IDM sweep → ChoCH/BOS → long mét de trend</text>
  </svg>`,
};

// ================================================================
// ANIMATED CHARTS (CSS-geanimeerde SVG's)
// ================================================================
const ANIMATED_CHARTS = {

  fvg: `<svg viewBox="0 0 300 160" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:160px;">
    <style>
      @keyframes fvg_fi{from{opacity:0}to{opacity:1}}
      .fvg0{opacity:0;animation:fvg_fi .4s ease .1s forwards}
      .fvg1{opacity:0;animation:fvg_fi .4s ease .4s forwards}
      .fvg2{opacity:0;animation:fvg_fi .4s ease .7s forwards}
      .fvg3{opacity:0;animation:fvg_fi .4s ease 1.0s forwards}
      .fvg4{opacity:0;animation:fvg_fi .5s ease 1.4s forwards}
      .fvg5{opacity:0;animation:fvg_fi .4s ease 1.9s forwards}
      .fvg6{opacity:0;animation:fvg_fi .4s ease 2.3s forwards}
      .fvg7{opacity:0;animation:fvg_fi .4s ease 2.7s forwards}
      .fvg8{opacity:0;animation:fvg_fi .4s ease 3.1s forwards}
      .fvg9{opacity:0;animation:fvg_fi .5s ease 3.6s forwards}
      .fvg10{opacity:0;animation:fvg_fi .5s ease 4.2s forwards}
    </style>
    <rect width="300" height="160" fill="#0d0f14" rx="8"/>
    <!-- Labels -->
    <g class="fvg0">
      <text x="10" y="15" fill="#f5a623" font-size="9" font-family="monospace" font-weight="bold">Fair Value Gap — animatie</text>
      <text x="10" y="155" fill="#4f9eff" font-size="7" font-family="monospace">C1 = eerste kaars · C2 = impuls · C3 = derde kaars</text>
    </g>
    <!-- Context candles -->
    <g class="fvg1">
      <rect x="18" y="100" width="11" height="22" fill="#ff5c5c" rx="1"/><line x1="23" y1="97" x2="23" y2="124" stroke="#ff5c5c" stroke-width="1"/>
      <rect x="36" y="92" width="11" height="20" fill="#2ecc8a" rx="1"/><line x1="41" y1="89" x2="41" y2="114" stroke="#2ecc8a" stroke-width="1"/>
    </g>
    <!-- C1 -->
    <g class="fvg2">
      <rect x="55" y="80" width="13" height="24" fill="#2ecc8a" rx="1"/>
      <line x1="61" y1="77" x2="61" y2="106" stroke="#2ecc8a" stroke-width="1.5"/>
      <text x="52" y="130" fill="#4f9eff" font-size="7" font-family="monospace">C1</text>
    </g>
    <!-- C2: impulse -->
    <g class="fvg3">
      <rect x="75" y="40" width="13" height="42" fill="#2ecc8a" rx="1"/>
      <line x1="81" y1="35" x2="81" y2="84" stroke="#2ecc8a" stroke-width="2"/>
      <text x="72" y="130" fill="#4f9eff" font-size="7" font-family="monospace">C2</text>
    </g>
    <!-- FVG zone highlight + lines -->
    <g class="fvg4">
      <rect x="55" y="50" width="55" height="28" fill="rgba(245,166,35,0.18)" rx="2"/>
      <line x1="55" y1="50" x2="110" y2="50" stroke="#f5a623" stroke-width="1.2" stroke-dasharray="3,2"/>
      <line x1="55" y1="78" x2="110" y2="78" stroke="#f5a623" stroke-width="1.2" stroke-dasharray="3,2"/>
      <text x="113" y="58" fill="#f5a623" font-size="8" font-family="monospace" font-weight="bold">FVG</text>
      <text x="113" y="68" fill="#f5a623" font-size="7" font-family="monospace">50%:</text>
      <line x1="55" y1="64" x2="110" y2="64" stroke="rgba(245,166,35,0.5)" stroke-width="1" stroke-dasharray="2,2"/>
    </g>
    <!-- C3 -->
    <g class="fvg5">
      <rect x="95" y="28" width="13" height="20" fill="#2ecc8a" rx="1"/>
      <line x1="101" y1="25" x2="101" y2="50" stroke="#2ecc8a" stroke-width="1.5"/>
      <text x="92" y="130" fill="#4f9eff" font-size="7" font-family="monospace">C3</text>
    </g>
    <!-- Continuation -->
    <g class="fvg6">
      <rect x="115" y="18" width="11" height="16" fill="#2ecc8a" rx="1"/><line x1="120" y1="15" x2="120" y2="36" stroke="#2ecc8a" stroke-width="1"/>
      <rect x="132" y="10" width="11" height="14" fill="#2ecc8a" rx="1"/><line x1="137" y1="7" x2="137" y2="26" stroke="#2ecc8a" stroke-width="1"/>
    </g>
    <!-- Pullback naar FVG -->
    <g class="fvg7">
      <rect x="144" y="28" width="44" height="11" fill="rgba(13,15,20,0.85)" rx="2"/>
      <text x="145" y="37" fill="#ff5c5c" font-size="7" font-family="monospace">↓ pullback</text>
      <rect x="152" y="42" width="11" height="24" fill="#ff5c5c" rx="1"/><line x1="157" y1="38" x2="157" y2="68" stroke="#ff5c5c" stroke-width="1.5"/>
    </g>
    <g class="fvg8">
      <rect x="168" y="50" width="11" height="20" fill="#ff5c5c" rx="1"/><line x1="173" y1="46" x2="173" y2="72" stroke="#ff5c5c" stroke-width="1.5"/>
    </g>
    <!-- Entry in FVG -->
    <g class="fvg9">
      <circle cx="178" cy="64" r="5" fill="none" stroke="#f5a623" stroke-width="2"/>
      <rect x="184" y="52" width="56" height="22" fill="rgba(13,15,20,0.85)" rx="2"/>
      <text x="185" y="61" fill="#f5a623" font-size="8" font-family="monospace" font-weight="bold">Entry!</text>
      <text x="185" y="71" fill="#f5a623" font-size="7" font-family="monospace">in FVG zone</text>
    </g>
    <!-- Continuation na fill -->
    <g class="fvg10">
      <rect x="188" y="30" width="11" height="28" fill="#2ecc8a" rx="1"/><line x1="193" y1="26" x2="193" y2="60" stroke="#2ecc8a" stroke-width="1.5"/>
      <rect x="205" y="16" width="11" height="20" fill="#2ecc8a" rx="1"/><line x1="210" y1="13" x2="210" y2="38" stroke="#2ecc8a" stroke-width="1"/>
      <rect x="222" y="8" width="11" height="16" fill="#2ecc8a" rx="1"/><line x1="227" y1="5" x2="227" y2="26" stroke="#2ecc8a" stroke-width="1"/>
      <text x="190" y="140" fill="#2ecc8a" font-size="8" font-family="monospace">↑ Prijs hervat richting</text>
    </g>
  </svg>`,

  liquiditysweep: `<svg viewBox="0 0 300 160" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:160px;">
    <style>
      @keyframes lq_fi{from{opacity:0}to{opacity:1}}
      .lq0{opacity:0;animation:lq_fi .4s ease .1s forwards}
      .lq1{opacity:0;animation:lq_fi .4s ease .5s forwards}
      .lq2{opacity:0;animation:lq_fi .4s ease .9s forwards}
      .lq3{opacity:0;animation:lq_fi .4s ease 1.3s forwards}
      .lq4{opacity:0;animation:lq_fi .4s ease 1.7s forwards}
      .lq5{opacity:0;animation:lq_fi .6s ease 2.2s forwards}
      .lq6{opacity:0;animation:lq_fi .5s ease 3.0s forwards}
      .lq7{opacity:0;animation:lq_fi .4s ease 3.7s forwards}
      .lq8{opacity:0;animation:lq_fi .4s ease 4.2s forwards}
      .lq9{opacity:0;animation:lq_fi .5s ease 4.8s forwards}
    </style>
    <rect width="300" height="160" fill="#0d0f14" rx="8"/>
    <g class="lq0">
      <text x="10" y="15" fill="#ff5c5c" font-size="9" font-family="monospace" font-weight="bold">Liquidity Sweep — animatie</text>
    </g>
    <!-- Equal highs level -->
    <g class="lq1">
      <line x1="20" y1="52" x2="190" y2="52" stroke="rgba(79,158,255,0.5)" stroke-width="1.2" stroke-dasharray="4,3"/>
      <text x="192" y="56" fill="#4f9eff" font-size="7" font-family="monospace">Stops!</text>
    </g>
    <!-- Candles approaching -->
    <g class="lq2">
      <rect x="20" y="72" width="11" height="26" fill="#2ecc8a" rx="1"/><line x1="25" y1="68" x2="25" y2="100" stroke="#2ecc8a" stroke-width="1"/>
      <circle cx="25" cy="54" r="3" fill="#4f9eff"/>
    </g>
    <g class="lq3">
      <rect x="38" y="64" width="11" height="22" fill="#ff5c5c" rx="1"/><line x1="43" y1="60" x2="43" y2="88" stroke="#ff5c5c" stroke-width="1"/>
    </g>
    <g class="lq4">
      <rect x="56" y="58" width="11" height="20" fill="#2ecc8a" rx="1"/><line x1="61" y1="54" x2="61" y2="80" stroke="#2ecc8a" stroke-width="1"/>
      <circle cx="61" cy="54" r="3" fill="#4f9eff"/>
    </g>
    <!-- SWEEP candle -->
    <g class="lq5">
      <text x="74" y="24" fill="#ff5c5c" font-size="9" font-family="monospace" font-weight="bold">⚡ SWEEP!</text>
      <rect x="75" y="56" width="13" height="16" fill="#2ecc8a" rx="1"/>
      <line x1="81" y1="30" x2="81" y2="74" stroke="#2ecc8a" stroke-width="2.5"/>
      <circle cx="81" cy="30" r="4" fill="#ff5c5c" opacity="0.8"/>
    </g>
    <!-- Rejection -->
    <g class="lq6">
      <rect x="95" y="35" width="50" height="11" fill="rgba(13,15,20,0.85)" rx="2"/>
      <text x="96" y="44" fill="#ff5c5c" font-size="8" font-family="monospace">↓ Reversal</text>
      <rect x="96" y="62" width="13" height="30" fill="#ff5c5c" rx="1"/>
      <line x1="102" y1="56" x2="102" y2="94" stroke="#ff5c5c" stroke-width="2"/>
    </g>
    <!-- Strong drop -->
    <g class="lq7">
      <rect x="116" y="80" width="11" height="28" fill="#ff5c5c" rx="1"/><line x1="121" y1="76" x2="121" y2="110" stroke="#ff5c5c" stroke-width="1.5"/>
      <rect x="133" y="96" width="11" height="26" fill="#ff5c5c" rx="1"/><line x1="138" y1="92" x2="138" y2="124" stroke="#ff5c5c" stroke-width="1.5"/>
    </g>
    <g class="lq8">
      <rect x="150" y="108" width="11" height="24" fill="#ff5c5c" rx="1"/><line x1="155" y1="104" x2="155" y2="134" stroke="#ff5c5c" stroke-width="1.5"/>
      <rect x="167" y="118" width="11" height="22" fill="#ff5c5c" rx="1"/><line x1="172" y1="114" x2="172" y2="142" stroke="#ff5c5c" stroke-width="1.5"/>
    </g>
    <!-- Entry + label -->
    <g class="lq9">
      <circle cx="102" cy="60" r="5" fill="none" stroke="#f5a623" stroke-width="2"/>
      <rect x="116" y="50" width="58" height="11" fill="rgba(13,15,20,0.85)" rx="2"/>
      <text x="117" y="59" fill="#f5a623" font-size="8" font-family="monospace" font-weight="bold">Short entry</text>
      <text x="10" y="155" fill="#4f9eff" font-size="7" font-family="monospace">Stops weggenomen → prijs keert → short kans</text>
    </g>
  </svg>`,

  orb: `<svg viewBox="0 0 300 175" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:175px;">
    <style>
      @keyframes orb_fi{from{opacity:0}to{opacity:1}}
      .orb0{opacity:0;animation:orb_fi .4s ease .1s forwards}
      .orb1{opacity:0;animation:orb_fi .4s ease .5s forwards}
      .orb2{opacity:0;animation:orb_fi .4s ease .9s forwards}
      .orb3{opacity:0;animation:orb_fi .4s ease 1.3s forwards}
      .orb4{opacity:0;animation:orb_fi .6s ease 1.8s forwards}
      .orb5{opacity:0;animation:orb_fi .5s ease 2.5s forwards}
      .orb6{opacity:0;animation:orb_fi .4s ease 3.1s forwards}
      .orb7{opacity:0;animation:orb_fi .4s ease 3.5s forwards}
      .orb8{opacity:0;animation:orb_fi .4s ease 3.9s forwards}
      .orb9{opacity:0;animation:orb_fi .5s ease 4.4s forwards}
    </style>
    <rect width="300" height="175" fill="#0d0f14" rx="8"/>
    <!-- Vaste bodembalk voor statuslabel -->
    <rect x="0" y="155" width="300" height="20" fill="#0d0f14" rx="0"/>
    <g class="orb0">
      <text x="10" y="14" fill="#f5a623" font-size="9" font-family="monospace" font-weight="bold">Opening Range Breakout (ORB15)</text>
    </g>
    <!-- Open marker -->
    <g class="orb1">
      <line x1="22" y1="22" x2="22" y2="148" stroke="#4f9eff" stroke-width="1" stroke-dasharray="2,2" opacity="0.6"/>
      <rect x="23" y="22" width="46" height="10" fill="#0d0f14"/>
      <text x="24" y="30" fill="#4f9eff" font-size="7" font-family="monospace">08:00 Open</text>
      <rect x="5" y="157" width="160" height="11" fill="#0d0f14"/>
      <text x="6" y="166" fill="#4f9eff" font-size="7" font-family="monospace">Stap 1: Markeer opening (08:00)</text>
    </g>
    <!-- Range candle 1 -->
    <g class="orb2">
      <rect x="24" y="78" width="10" height="24" fill="#ff5c5c" rx="1"/><line x1="29" y1="74" x2="29" y2="104" stroke="#ff5c5c" stroke-width="1"/>
      <rect x="5" y="157" width="200" height="11" fill="#0d0f14"/>
      <text x="6" y="166" fill="#4f9eff" font-size="7" font-family="monospace">Stap 2: Range vormt zich (0–15 min)...</text>
    </g>
    <g class="orb3">
      <rect x="40" y="72" width="10" height="20" fill="#2ecc8a" rx="1"/><line x1="45" y1="68" x2="45" y2="94" stroke="#2ecc8a" stroke-width="1"/>
      <rect x="56" y="76" width="10" height="18" fill="#ff5c5c" rx="1"/><line x1="61" y1="72" x2="61" y2="96" stroke="#ff5c5c" stroke-width="1"/>
    </g>
    <!-- ORB H/L lines + zone -->
    <g class="orb4">
      <rect x="22" y="64" width="60" height="52" fill="rgba(79,158,255,0.08)" rx="2"/>
      <line x1="22" y1="64" x2="252" y2="64" stroke="#2ecc8a" stroke-width="1.5" stroke-dasharray="5,3"/>
      <rect x="253" y="57" width="44" height="11" fill="#0d0f14"/>
      <text x="254" y="66" fill="#2ecc8a" font-size="7" font-family="monospace">ORB High</text>
      <line x1="22" y1="116" x2="252" y2="116" stroke="#ff5c5c" stroke-width="1.5" stroke-dasharray="5,3"/>
      <rect x="253" y="109" width="44" height="11" fill="#0d0f14"/>
      <text x="254" y="118" fill="#ff5c5c" font-size="7" font-family="monospace">ORB Low</text>
      <rect x="5" y="157" width="220" height="11" fill="#0d0f14"/>
      <text x="6" y="166" fill="#2ecc8a" font-size="7" font-family="monospace">Stap 3: Range vastgesteld om 08:15!</text>
    </g>
    <!-- 08:15 marker — rechts van de range candles -->
    <g class="orb5">
      <line x1="82" y1="22" x2="82" y2="148" stroke="#f5a623" stroke-width="1" stroke-dasharray="2,2" opacity="0.5"/>
      <rect x="83" y="22" width="30" height="10" fill="#0d0f14"/>
      <text x="84" y="30" fill="#f5a623" font-size="7" font-family="monospace">08:15</text>
    </g>
    <!-- Breakout candle -->
    <g class="orb6">
      <rect x="84" y="38" width="12" height="28" fill="#2ecc8a" rx="1"/>
      <line x1="90" y1="30" x2="90" y2="68" stroke="#2ecc8a" stroke-width="2.5"/>
      <circle cx="90" cy="62" r="5" fill="none" stroke="#f5a623" stroke-width="2"/>
      <!-- Entry label met achtergrond, rechts van candle -->
      <rect x="100" y="54" width="52" height="11" fill="rgba(13,15,20,0.85)" rx="2"/>
      <text x="101" y="63" fill="#f5a623" font-size="7" font-family="monospace" font-weight="bold">⬆ Entry long!</text>
      <rect x="5" y="157" width="220" height="11" fill="#0d0f14"/>
      <text x="6" y="166" fill="#f5a623" font-size="7" font-family="monospace">Stap 4: Breakout boven ORB High → entry</text>
    </g>
    <!-- Continuation -->
    <g class="orb7">
      <rect x="102" y="28" width="10" height="18" fill="#2ecc8a" rx="1"/><line x1="107" y1="24" x2="107" y2="48" stroke="#2ecc8a" stroke-width="1"/>
      <rect x="118" y="20" width="10" height="16" fill="#2ecc8a" rx="1"/><line x1="123" y1="16" x2="123" y2="38" stroke="#2ecc8a" stroke-width="1"/>
    </g>
    <g class="orb8">
      <rect x="134" y="24" width="10" height="14" fill="#ff5c5c" rx="1"/><line x1="139" y1="20" x2="139" y2="40" stroke="#ff5c5c" stroke-width="1"/>
      <rect x="150" y="16" width="10" height="16" fill="#2ecc8a" rx="1"/><line x1="155" y1="12" x2="155" y2="34" stroke="#2ecc8a" stroke-width="1"/>
      <rect x="166" y="10" width="10" height="14" fill="#2ecc8a" rx="1"/><line x1="171" y1="7" x2="171" y2="26" stroke="#2ecc8a" stroke-width="1"/>
    </g>
    <!-- SL / TP lines + eindlabel -->
    <g class="orb9">
      <line x1="84" y1="124" x2="192" y2="124" stroke="#ff5c5c" stroke-width="1" stroke-dasharray="3,2"/>
      <rect x="193" y="118" width="16" height="11" fill="#0d0f14"/>
      <text x="194" y="127" fill="#ff5c5c" font-size="7" font-family="monospace">SL</text>
      <line x1="84" y1="24" x2="192" y2="24" stroke="#2ecc8a" stroke-width="1" stroke-dasharray="3,2"/>
      <rect x="193" y="18" width="16" height="11" fill="#0d0f14"/>
      <text x="194" y="27" fill="#2ecc8a" font-size="7" font-family="monospace">TP</text>
      <rect x="5" y="157" width="292" height="14" fill="#0d0f14"/>
      <text x="6" y="168" fill="#2ecc8a" font-size="7" font-family="monospace">SL net onder ORB Low · TP = 1.5× rangebreedte · R:R ≥ 1.5</text>
    </g>
  </svg>`,

  // ── BASICS ──
  pip: `<svg viewBox="0 0 300 175" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:175px;"><style>@keyframes pp{from{opacity:0}to{opacity:1}}.p0{opacity:0;animation:pp .4s ease .1s forwards}.p1{opacity:0;animation:pp .4s ease .6s forwards}.p2{opacity:0;animation:pp .4s ease 1.2s forwards}.p3{opacity:0;animation:pp .4s ease 1.8s forwards}.p4{opacity:0;animation:pp .5s ease 2.5s forwards}</style>
    <rect width="300" height="175" fill="#0d0f14" rx="8"/>
    <g class="p0"><text x="10" y="14" fill="#4f9eff" font-size="9" font-family="monospace" font-weight="bold">Pip — kleinste prijsbeweging</text></g>
    <g class="p1">
      <rect x="20" y="30" width="260" height="30" fill="rgba(79,158,255,0.08)" rx="6"/>
      <text x="30" y="50" fill="#muted" font-size="13" font-family="monospace" fill="#4f9eff">EUR/USD:  1.0850<tspan fill="#2ecc8a" font-weight="bold">0</tspan></text>
      <rect x="5" y="157" width="292" height="14" fill="#0d0f14"/>
      <text x="6" y="168" fill="#4f9eff" font-size="7" font-family="monospace">Dit is de startprijs</text>
    </g>
    <g class="p2">
      <rect x="20" y="70" width="260" height="30" fill="rgba(46,204,138,0.08)" rx="6"/>
      <text x="30" y="90" fill="#2ecc8a" font-size="13" font-family="monospace">EUR/USD:  1.0851<tspan font-weight="bold">0</tspan></text>
      <line x1="175" y1="62" x2="175" y2="72" stroke="#2ecc8a" stroke-width="1.5"/>
      <text x="178" y="68" fill="#2ecc8a" font-size="8" font-family="monospace">+1 pip</text>
      <rect x="5" y="157" width="292" height="14" fill="#0d0f14"/>
      <text x="6" y="168" fill="#2ecc8a" font-size="7" font-family="monospace">Prijs stijgt met 0.00010 = 1 pip</text>
    </g>
    <g class="p3">
      <rect x="20" y="110" width="260" height="28" fill="rgba(79,158,255,0.06)" rx="6"/>
      <text x="30" y="125" fill="#f5a623" font-size="11" font-family="monospace">0.1 lot × 1 pip = €1 winst</text>
      <text x="30" y="137" fill="#muted" font-size="10" font-family="monospace" fill="#4f9eff">1.0 lot × 1 pip = €10 winst</text>
      <rect x="5" y="157" width="292" height="14" fill="#0d0f14"/>
      <text x="6" y="168" fill="#f5a623" font-size="7" font-family="monospace">Waarde per pip hangt af van je lot grootte</text>
    </g>
    <g class="p4">
      <rect x="20" y="143" width="260" height="12" fill="rgba(167,139,250,0.1)" rx="3"/>
      <text x="25" y="152" fill="#a78bfa" font-size="8" font-family="monospace">JPY-paren: pip = 0.01 (2e decimaal) — let op!</text>
    </g>
  </svg>`,

  spread: `<svg viewBox="0 0 300 175" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:175px;"><style>@keyframes sp{from{opacity:0}to{opacity:1}}.s0{opacity:0;animation:sp .4s ease .1s forwards}.s1{opacity:0;animation:sp .4s ease .6s forwards}.s2{opacity:0;animation:sp .5s ease 1.3s forwards}.s3{opacity:0;animation:sp .5s ease 2.0s forwards}.s4{opacity:0;animation:sp .4s ease 2.8s forwards}</style>
    <rect width="300" height="175" fill="#0d0f14" rx="8"/>
    <g class="s0"><text x="10" y="14" fill="#4f9eff" font-size="9" font-family="monospace" font-weight="bold">Spread — kost bij elke trade</text></g>
    <g class="s1">
      <rect x="20" y="28" width="115" height="40" fill="rgba(46,204,138,0.1)" rx="6"/>
      <text x="30" y="45" fill="#2ecc8a" font-size="10" font-family="monospace">BID (verkoop)</text>
      <text x="30" y="60" fill="#2ecc8a" font-size="14" font-family="monospace" font-weight="bold">1.08500</text>
    </g>
    <g class="s2">
      <rect x="165" y="28" width="115" height="40" fill="rgba(255,92,92,0.1)" rx="6"/>
      <text x="175" y="45" fill="#ff5c5c" font-size="10" font-family="monospace">ASK (koop)</text>
      <text x="175" y="60" fill="#ff5c5c" font-size="14" font-family="monospace" font-weight="bold">1.08502</text>
    </g>
    <g class="s3">
      <line x1="136" y1="48" x2="164" y2="48" stroke="#f5a623" stroke-width="2"/>
      <rect x="130" y="38" width="40" height="14" fill="rgba(13,15,20,0.9)" rx="3"/>
      <text x="136" y="48" fill="#f5a623" font-size="9" font-family="monospace" font-weight="bold">0.2 pip</text>
      <text x="122" y="35" fill="#f5a623" font-size="7" font-family="monospace">SPREAD</text>
    </g>
    <g class="s4">
      <rect x="20" y="82" width="260" height="55" fill="rgba(79,158,255,0.06)" rx="6"/>
      <text x="30" y="98" fill="#4f9eff" font-size="9" font-family="monospace">Jij koopt op ASK: 1.08502</text>
      <text x="30" y="112" fill="#4f9eff" font-size="9" font-family="monospace">Break-even = 1.08502 + spread</text>
      <text x="30" y="126" fill="#f5a623" font-size="9" font-family="monospace">Laag spread = goedkoper traden!</text>
      <rect x="5" y="157" width="292" height="14" fill="#0d0f14"/>
      <text x="6" y="168" fill="#f5a623" font-size="7" font-family="monospace">EUR/USD spread ≈ 0.1–0.6 pip bij grote brokers</text>
    </g>
  </svg>`,

  lot: `<svg viewBox="0 0 300 175" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:175px;"><style>@keyframes lt{from{opacity:0}to{opacity:1}}.l0{opacity:0;animation:lt .4s ease .1s forwards}.l1{opacity:0;animation:lt .4s ease .5s forwards}.l2{opacity:0;animation:lt .4s ease 1.0s forwards}.l3{opacity:0;animation:lt .4s ease 1.5s forwards}.l4{opacity:0;animation:lt .4s ease 2.0s forwards}.l5{opacity:0;animation:lt .5s ease 2.6s forwards}</style>
    <rect width="300" height="175" fill="#0d0f14" rx="8"/>
    <g class="l0"><text x="10" y="14" fill="#4f9eff" font-size="9" font-family="monospace" font-weight="bold">Lot grootte — positiegrootte</text></g>
    <g class="l1">
      <rect x="10" y="22" width="280" height="14" fill="rgba(79,158,255,0.08)" rx="3"/>
      <text x="15" y="32" fill="#4f9eff" font-size="8" font-family="monospace">Naam          Lots    EUR/USD   Pip-waarde</text>
    </g>
    <g class="l2">
      <rect x="10" y="38" width="280" height="13" fill="rgba(46,204,138,0.06)" rx="2"/>
      <text x="15" y="48" fill="#2ecc8a" font-size="8" font-family="monospace">Standaard     1.00    €100.000  €10/pip</text>
    </g>
    <g class="l3">
      <rect x="10" y="53" width="280" height="13" fill="rgba(79,158,255,0.04)" rx="2"/>
      <text x="15" y="63" fill="#4f9eff" font-size="8" font-family="monospace">Mini          0.10    €10.000   €1/pip</text>
    </g>
    <g class="l4">
      <rect x="10" y="68" width="280" height="13" fill="rgba(245,166,35,0.04)" rx="2"/>
      <text x="15" y="78" fill="#f5a623" font-size="8" font-family="monospace">Micro         0.01    €1.000    €0.10/pip</text>
    </g>
    <g class="l5">
      <rect x="10" y="92" width="280" height="50" fill="rgba(167,139,250,0.08)" rx="6"/>
      <text x="20" y="108" fill="#a78bfa" font-size="9" font-family="monospace" font-weight="bold">Voorbeeld: 0.10 lot, 20 pip winst</text>
      <text x="20" y="122" fill="#2ecc8a" font-size="9" font-family="monospace">0.10 × €1/pip × 20 pip = +€20</text>
      <text x="20" y="136" fill="#ff5c5c" font-size="9" font-family="monospace">0.10 × €1/pip × 20 pip = −€20 bij verlies</text>
      <rect x="5" y="157" width="292" height="14" fill="#0d0f14"/>
      <text x="6" y="168" fill="#a78bfa" font-size="7" font-family="monospace">Grote lots = meer winst maar ook meer risico</text>
    </g>
  </svg>`,

  leverage: `<svg viewBox="0 0 300 175" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:175px;"><style>@keyframes lv{from{opacity:0}to{opacity:1}}.lv0{opacity:0;animation:lv .4s ease .1s forwards}.lv1{opacity:0;animation:lv .4s ease .6s forwards}.lv2{opacity:0;animation:lv .5s ease 1.3s forwards}.lv3{opacity:0;animation:lv .5s ease 2.0s forwards}.lv4{opacity:0;animation:lv .4s ease 2.8s forwards}</style>
    <rect width="300" height="175" fill="#0d0f14" rx="8"/>
    <g class="lv0"><text x="10" y="14" fill="#f5a623" font-size="9" font-family="monospace" font-weight="bold">Leverage — hefboomwerking</text></g>
    <g class="lv1">
      <rect x="10" y="24" width="130" height="55" fill="rgba(79,158,255,0.08)" rx="6"/>
      <text x="20" y="40" fill="#4f9eff" font-size="8" font-family="monospace">Jouw kapitaal</text>
      <text x="20" y="56" fill="#4f9eff" font-size="18" font-family="monospace" font-weight="bold">€1.000</text>
      <text x="20" y="70" fill="#4f9eff" font-size="7" font-family="monospace">eigen inleg</text>
    </g>
    <g class="lv2">
      <text x="148" y="54" fill="#f5a623" font-size="14" font-family="monospace" font-weight="bold">×30</text>
      <rect x="185" y="24" width="108" height="55" fill="rgba(46,204,138,0.08)" rx="6"/>
      <text x="195" y="40" fill="#2ecc8a" font-size="8" font-family="monospace">Positiegrootte</text>
      <text x="195" y="56" fill="#2ecc8a" font-size="15" font-family="monospace" font-weight="bold">€30.000</text>
      <text x="195" y="70" fill="#2ecc8a" font-size="7" font-family="monospace">0.30 lot EUR/USD</text>
    </g>
    <g class="lv3">
      <rect x="10" y="92" width="135" height="48" fill="rgba(46,204,138,0.07)" rx="6"/>
      <text x="18" y="107" fill="#2ecc8a" font-size="8" font-family="monospace">+50 pip winst:</text>
      <text x="18" y="122" fill="#2ecc8a" font-size="12" font-family="monospace" font-weight="bold">+€150 (+15%)</text>
      <text x="18" y="134" fill="#2ecc8a" font-size="7" font-family="monospace">op €1.000 kapitaal</text>
    </g>
    <g class="lv4">
      <rect x="155" y="92" width="135" height="48" fill="rgba(255,92,92,0.07)" rx="6"/>
      <text x="163" y="107" fill="#ff5c5c" font-size="8" font-family="monospace">−50 pip verlies:</text>
      <text x="163" y="122" fill="#ff5c5c" font-size="12" font-family="monospace" font-weight="bold">−€150 (−15%)</text>
      <text x="163" y="134" fill="#ff5c5c" font-size="7" font-family="monospace">leverage werkt 2 kanten op!</text>
      <rect x="5" y="157" width="292" height="14" fill="#0d0f14"/>
      <text x="6" y="168" fill="#f5a623" font-size="7" font-family="monospace">Hoge leverage = hogere risico — gebruik max 1:10 als beginner</text>
    </g>
  </svg>`,

  rratio: `<svg viewBox="0 0 300 175" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:175px;"><style>@keyframes rr{from{opacity:0}to{opacity:1}}.rr0{opacity:0;animation:rr .4s ease .1s forwards}.rr1{opacity:0;animation:rr .4s ease .5s forwards}.rr2{opacity:0;animation:rr .4s ease 1.0s forwards}.rr3{opacity:0;animation:rr .5s ease 1.6s forwards}.rr4{opacity:0;animation:rr .5s ease 2.4s forwards}</style>
    <rect width="300" height="175" fill="#0d0f14" rx="8"/>
    <g class="rr0"><text x="10" y="14" fill="#2ecc8a" font-size="9" font-family="monospace" font-weight="bold">R:R Ratio — risico vs beloning</text></g>
    <g class="rr1">
      <line x1="60" y1="88" x2="240" y2="88" stroke="#4f9eff" stroke-width="1.5"/>
      <rect x="52" y="82" width="36" height="12" fill="rgba(13,15,20,0.9)" rx="2"/>
      <text x="54" y="92" fill="#4f9eff" font-size="8" font-family="monospace">Entry</text>
      <circle cx="60" cy="88" r="4" fill="#4f9eff"/>
    </g>
    <g class="rr2">
      <line x1="60" y1="118" x2="240" y2="118" stroke="#ff5c5c" stroke-width="1.5" stroke-dasharray="4,3"/>
      <rect x="52" y="112" width="22" height="12" fill="rgba(13,15,20,0.9)" rx="2"/>
      <text x="54" y="122" fill="#ff5c5c" font-size="8" font-family="monospace">SL</text>
      <line x1="45" y1="88" x2="45" y2="118" stroke="#ff5c5c" stroke-width="1"/>
      <rect x="10" y="98" width="32" height="11" fill="rgba(13,15,20,0.9)" rx="2"/>
      <text x="12" y="107" fill="#ff5c5c" font-size="8" font-family="monospace">1R = €50</text>
    </g>
    <g class="rr3">
      <line x1="60" y1="28" x2="240" y2="28" stroke="#2ecc8a" stroke-width="1.5" stroke-dasharray="4,3"/>
      <rect x="52" y="22" width="22" height="12" fill="rgba(13,15,20,0.9)" rx="2"/>
      <text x="54" y="32" fill="#2ecc8a" font-size="8" font-family="monospace">TP</text>
      <line x1="45" y1="28" x2="45" y2="88" stroke="#2ecc8a" stroke-width="1"/>
      <rect x="10" y="52" width="32" height="11" fill="rgba(13,15,20,0.9)" rx="2"/>
      <text x="12" y="61" fill="#2ecc8a" font-size="8" font-family="monospace">2R = €100</text>
    </g>
    <g class="rr4">
      <rect x="60" y="105" width="180" height="46" fill="rgba(245,166,35,0.08)" rx="6"/>
      <text x="70" y="120" fill="#f5a623" font-size="9" font-family="monospace" font-weight="bold">R:R = 1:2</text>
      <text x="70" y="133" fill="#2ecc8a" font-size="8" font-family="monospace">Win: +€100  (2 keer risico)</text>
      <text x="70" y="145" fill="#ff5c5c" font-size="8" font-family="monospace">Verlies: −€50  (1 keer risico)</text>
      <rect x="5" y="157" width="292" height="14" fill="#0d0f14"/>
      <text x="6" y="168" fill="#f5a623" font-size="7" font-family="monospace">Minimaal 1:2 → ook met 40% winrate winstgevend</text>
    </g>
  </svg>`,

  margin: `<svg viewBox="0 0 300 175" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:175px;"><style>@keyframes mg{from{opacity:0}to{opacity:1}}.mg0{opacity:0;animation:mg .4s ease .1s forwards}.mg1{opacity:0;animation:mg .4s ease .6s forwards}.mg2{opacity:0;animation:mg .5s ease 1.3s forwards}.mg3{opacity:0;animation:mg .4s ease 2.1s forwards}.mg4{opacity:0;animation:mg .5s ease 2.8s forwards}</style>
    <rect width="300" height="175" fill="#0d0f14" rx="8"/>
    <g class="mg0"><text x="10" y="14" fill="#a78bfa" font-size="9" font-family="monospace" font-weight="bold">Margin — vereist onderpand</text></g>
    <g class="mg1">
      <rect x="10" y="24" width="280" height="35" fill="rgba(167,139,250,0.08)" rx="6"/>
      <text x="20" y="38" fill="#a78bfa" font-size="9" font-family="monospace">Account: €5.000 · Leverage 1:30</text>
      <text x="20" y="52" fill="#4f9eff" font-size="9" font-family="monospace">Positie 0.30 lot EUR/USD = €30.000</text>
    </g>
    <g class="mg2">
      <rect x="10" y="68" width="130" height="55" fill="rgba(255,92,92,0.08)" rx="6"/>
      <text x="18" y="83" fill="#ff5c5c" font-size="8" font-family="monospace">Margin gebruikt</text>
      <text x="18" y="98" fill="#ff5c5c" font-size="16" font-family="monospace" font-weight="bold">€1.000</text>
      <text x="18" y="113" fill="#ff5c5c" font-size="7" font-family="monospace">geblokkeerd</text>
    </g>
    <g class="mg3">
      <rect x="155" y="68" width="135" height="55" fill="rgba(46,204,138,0.08)" rx="6"/>
      <text x="163" y="83" fill="#2ecc8a" font-size="8" font-family="monospace">Vrije margin</text>
      <text x="163" y="98" fill="#2ecc8a" font-size="16" font-family="monospace" font-weight="bold">€4.000</text>
      <text x="163" y="113" fill="#2ecc8a" font-size="7" font-family="monospace">beschikbaar</text>
    </g>
    <g class="mg4">
      <rect x="10" y="133" width="280" height="18" fill="rgba(245,166,35,0.08)" rx="4"/>
      <text x="18" y="145" fill="#f5a623" font-size="8" font-family="monospace">Margin call als vrije margin te laag wordt → positie gesloten!</text>
      <rect x="5" y="157" width="292" height="14" fill="#0d0f14"/>
      <text x="6" y="168" fill="#f5a623" font-size="7" font-family="monospace">Houd altijd voldoende vrije margin — vermijd margin calls</text>
    </g>
  </svg>`,

  // ── RISK MANAGEMENT ──
  positionsizing: `<svg viewBox="0 0 300 175" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:175px;"><style>@keyframes ps{from{opacity:0}to{opacity:1}}.ps0{opacity:0;animation:ps .4s ease .1s forwards}.ps1{opacity:0;animation:ps .4s ease .6s forwards}.ps2{opacity:0;animation:ps .4s ease 1.2s forwards}.ps3{opacity:0;animation:ps .4s ease 1.8s forwards}.ps4{opacity:0;animation:ps .5s ease 2.5s forwards}</style>
    <rect width="300" height="175" fill="#0d0f14" rx="8"/>
    <g class="ps0"><text x="10" y="14" fill="#ff5c5c" font-size="9" font-family="monospace" font-weight="bold">Positiegrootte berekenen</text></g>
    <g class="ps1">
      <rect x="10" y="22" width="280" height="13" fill="rgba(79,158,255,0.1)" rx="3"/>
      <text x="15" y="32" fill="#4f9eff" font-size="8" font-family="monospace">Formule: Lot = (Account × Risico%) ÷ (SL pip × Pip€)</text>
    </g>
    <g class="ps2">
      <rect x="10" y="40" width="130" height="42" fill="rgba(79,158,255,0.07)" rx="5"/>
      <text x="18" y="55" fill="#4f9eff" font-size="8" font-family="monospace">Account: €5.000</text>
      <text x="18" y="69" fill="#4f9eff" font-size="8" font-family="monospace">Risico: 1% = €50</text>
    </g>
    <g class="ps3">
      <rect x="155" y="40" width="135" height="42" fill="rgba(245,166,35,0.07)" rx="5"/>
      <text x="163" y="55" fill="#f5a623" font-size="8" font-family="monospace">SL: 20 pip</text>
      <text x="163" y="69" fill="#f5a623" font-size="8" font-family="monospace">Pip€: €10/lot</text>
    </g>
    <g class="ps4">
      <rect x="10" y="92" width="280" height="55" fill="rgba(46,204,138,0.08)" rx="6"/>
      <text x="20" y="108" fill="#2ecc8a" font-size="9" font-family="monospace">€50 ÷ (20 × €10) = €50 ÷ €200</text>
      <text x="20" y="124" fill="#2ecc8a" font-size="14" font-family="monospace" font-weight="bold">= 0.25 lot</text>
      <text x="20" y="140" fill="#muted" font-size="8" font-family="monospace" fill="#4f9eff">Bij 20 pip verlies: −€50 (1% van account)</text>
      <rect x="5" y="157" width="292" height="14" fill="#0d0f14"/>
      <text x="6" y="168" fill="#2ecc8a" font-size="7" font-family="monospace">Bereken VOOR elke trade — nooit gokken met lot grootte</text>
    </g>
  </svg>`,

  maxdrawdown: `<svg viewBox="0 0 300 175" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:175px;"><style>@keyframes md{from{opacity:0}to{opacity:1}}.md0{opacity:0;animation:md .4s ease .1s forwards}.md1{opacity:0;animation:md .4s ease .5s forwards}.md2{opacity:0;animation:md .4s ease 1.0s forwards}.md3{opacity:0;animation:md .4s ease 1.6s forwards}.md4{opacity:0;animation:md .5s ease 2.3s forwards}.md5{opacity:0;animation:md .5s ease 3.0s forwards}</style>
    <rect width="300" height="175" fill="#0d0f14" rx="8"/>
    <g class="md0"><text x="10" y="14" fill="#ff5c5c" font-size="9" font-family="monospace" font-weight="bold">Max Drawdown — daling van piek</text></g>
    <g class="md1">
      <polyline points="20,130 50,110 80,90 110,70 140,55" fill="none" stroke="#2ecc8a" stroke-width="2"/>
    </g>
    <g class="md2">
      <circle cx="140" cy="55" r="4" fill="#2ecc8a"/>
      <rect x="142" y="48" width="38" height="11" fill="rgba(13,15,20,0.9)" rx="2"/>
      <text x="144" y="57" fill="#2ecc8a" font-size="8" font-family="monospace">Piek €7k</text>
    </g>
    <g class="md3">
      <polyline points="140,55 160,75 185,100 205,120" fill="none" stroke="#ff5c5c" stroke-width="2"/>
      <rect x="140" y="55" width="65" height="65" fill="rgba(255,92,92,0.06)" rx="0"/>
      <line x1="138" y1="55" x2="138" y2="120" stroke="#f5a623" stroke-width="1" stroke-dasharray="3,2"/>
    </g>
    <g class="md4">
      <circle cx="205" cy="120" r="4" fill="#ff5c5c"/>
      <rect x="207" y="113" width="56" height="11" fill="rgba(13,15,20,0.9)" rx="2"/>
      <text x="209" y="122" fill="#ff5c5c" font-size="8" font-family="monospace">Dal €5.6k</text>
      <rect x="100" y="82" width="36" height="22" fill="rgba(245,166,35,0.15)" rx="3"/>
      <text x="104" y="91" fill="#f5a623" font-size="7" font-family="monospace" font-weight="bold">DD:</text>
      <text x="104" y="100" fill="#f5a623" font-size="7" font-family="monospace">-20%</text>
    </g>
    <g class="md5">
      <polyline points="205,120 230,105 255,88" fill="none" stroke="#2ecc8a" stroke-width="1.5" stroke-dasharray="3,2"/>
      <rect x="10" y="140" width="280" height="12" fill="rgba(245,166,35,0.07)" rx="3"/>
      <text x="15" y="149" fill="#f5a623" font-size="7" font-family="monospace">20% verlies vereist 25% herstel — 50% verlies = 100% herstel!</text>
      <rect x="5" y="157" width="292" height="14" fill="#0d0f14"/>
      <text x="6" y="168" fill="#ff5c5c" font-size="7" font-family="monospace">Max DD bewaken = account beschermen</text>
    </g>
  </svg>`,

  // ── INDICATORS ──
  ema: `<svg viewBox="0 0 300 175" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:175px;"><style>@keyframes em{from{opacity:0}to{opacity:1}}.em0{opacity:0;animation:em .4s ease .1s forwards}.em1{opacity:0;animation:em .4s ease .5s forwards}.em2{opacity:0;animation:em .5s ease 1.0s forwards}.em3{opacity:0;animation:em .5s ease 1.7s forwards}.em4{opacity:0;animation:em .4s ease 2.5s forwards}</style>
    <rect width="300" height="175" fill="#0d0f14" rx="8"/>
    <g class="em0"><text x="10" y="14" fill="#a78bfa" font-size="9" font-family="monospace" font-weight="bold">EMA — Exponential Moving Average</text></g>
    <g class="em1">
      <rect x="22" y="30" width="8" height="28" fill="#ff5c5c" rx="1"/><line x1="26" y1="28" x2="26" y2="60" stroke="#ff5c5c" stroke-width="1"/>
      <rect x="36" y="36" width="8" height="22" fill="#2ecc8a" rx="1"/><line x1="40" y1="34" x2="40" y2="60" stroke="#2ecc8a" stroke-width="1"/>
      <rect x="50" y="44" width="8" height="20" fill="#ff5c5c" rx="1"/><line x1="54" y1="42" x2="54" y2="66" stroke="#ff5c5c" stroke-width="1"/>
      <rect x="64" y="50" width="8" height="22" fill="#2ecc8a" rx="1"/><line x1="68" y1="48" x2="68" y2="74" stroke="#2ecc8a" stroke-width="1"/>
      <rect x="78" y="58" width="8" height="20" fill="#ff5c5c" rx="1"/><line x1="82" y1="56" x2="82" y2="80" stroke="#ff5c5c" stroke-width="1"/>
      <rect x="92" y="64" width="8" height="22" fill="#2ecc8a" rx="1"/><line x1="96" y1="62" x2="96" y2="88" stroke="#2ecc8a" stroke-width="1"/>
      <rect x="106" y="52" width="8" height="24" fill="#2ecc8a" rx="1"/><line x1="110" y1="50" x2="110" y2="78" stroke="#2ecc8a" stroke-width="1"/>
      <rect x="120" y="40" width="8" height="22" fill="#2ecc8a" rx="1"/><line x1="124" y1="38" x2="124" y2="64" stroke="#2ecc8a" stroke-width="1"/>
      <rect x="134" y="30" width="8" height="20" fill="#2ecc8a" rx="1"/><line x1="138" y1="28" x2="138" y2="52" stroke="#2ecc8a" stroke-width="1"/>
      <rect x="148" y="22" width="8" height="18" fill="#2ecc8a" rx="1"/><line x1="152" y1="20" x2="152" y2="42" stroke="#2ecc8a" stroke-width="1"/>
      <rect x="162" y="14" width="8" height="16" fill="#2ecc8a" rx="1"/><line x1="166" y1="12" x2="166" y2="32" stroke="#2ecc8a" stroke-width="1"/>
    </g>
    <g class="em2">
      <polyline points="26,68 40,66 54,70 68,72 82,76 96,78 110,68 124,58 138,46 152,38 166,28" fill="none" stroke="#f5a623" stroke-width="2" stroke-linejoin="round"/>
      <rect x="170" y="22" width="42" height="11" fill="rgba(13,15,20,0.9)" rx="2"/>
      <text x="172" y="31" fill="#f5a623" font-size="8" font-family="monospace">EMA 20</text>
    </g>
    <g class="em3">
      <polyline points="26,78 40,76 54,80 68,84 82,88 96,90 110,80 124,70 138,60 152,52 166,44" fill="none" stroke="#4f9eff" stroke-width="2" stroke-dasharray="4,2" stroke-linejoin="round"/>
      <rect x="170" y="38" width="42" height="11" fill="rgba(13,15,20,0.9)" rx="2"/>
      <text x="172" y="47" fill="#4f9eff" font-size="8" font-family="monospace">EMA 50</text>
      <circle cx="110" cy="74" r="6" fill="none" stroke="#2ecc8a" stroke-width="1.5"/>
      <rect x="118" y="68" width="74" height="11" fill="rgba(13,15,20,0.9)" rx="2"/>
      <text x="120" y="77" fill="#2ecc8a" font-size="7" font-family="monospace">EMA20 kruist EMA50 ↑</text>
    </g>
    <g class="em4">
      <rect x="10" y="100" width="280" height="48" fill="rgba(167,139,250,0.07)" rx="6"/>
      <text x="18" y="115" fill="#a78bfa" font-size="8" font-family="monospace" font-weight="bold">EMA20 boven EMA50 = Bullish trend</text>
      <text x="18" y="128" fill="#2ecc8a" font-size="8" font-family="monospace">Prijs boven EMA20 → zoek longs</text>
      <text x="18" y="141" fill="#ff5c5c" font-size="8" font-family="monospace">Prijs onder EMA20 → zoek shorts</text>
      <rect x="5" y="157" width="292" height="14" fill="#0d0f14"/>
      <text x="6" y="168" fill="#a78bfa" font-size="7" font-family="monospace">EMA reageert sneller op recente koers dan SMA</text>
    </g>
  </svg>`,

  rsi: `<svg viewBox="0 0 300 175" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:175px;"><style>@keyframes rs{from{opacity:0}to{opacity:1}}.rs0{opacity:0;animation:rs .4s ease .1s forwards}.rs1{opacity:0;animation:rs .4s ease .5s forwards}.rs2{opacity:0;animation:rs .5s ease 1.1s forwards}.rs3{opacity:0;animation:rs .5s ease 1.8s forwards}.rs4{opacity:0;animation:rs .5s ease 2.6s forwards}</style>
    <rect width="300" height="175" fill="#0d0f14" rx="8"/>
    <g class="rs0"><text x="10" y="14" fill="#a78bfa" font-size="9" font-family="monospace" font-weight="bold">RSI — Relative Strength Index</text></g>
    <g class="rs1">
      <rect x="10" y="22" width="280" height="55" fill="rgba(79,158,255,0.04)" rx="4"/>
      <line x1="10" y1="30" x2="290" y2="30" stroke="rgba(255,92,92,0.4)" stroke-width="1" stroke-dasharray="3,2"/>
      <rect x="240" y="24" width="50" height="10" fill="rgba(13,15,20,0.9)" rx="2"/>
      <text x="242" y="32" fill="#ff5c5c" font-size="7" font-family="monospace">OB = 70</text>
      <line x1="10" y1="66" x2="290" y2="66" stroke="rgba(46,204,138,0.4)" stroke-width="1" stroke-dasharray="3,2"/>
      <rect x="240" y="60" width="50" height="10" fill="rgba(13,15,20,0.9)" rx="2"/>
      <text x="242" y="68" fill="#2ecc8a" font-size="7" font-family="monospace">OS = 30</text>
      <line x1="10" y1="48" x2="290" y2="48" stroke="rgba(245,166,35,0.3)" stroke-width="1" stroke-dasharray="2,2"/>
      <text x="12" y="46" fill="#f5a623" font-size="6" font-family="monospace">50</text>
    </g>
    <g class="rs2">
      <polyline points="15,60 35,55 55,48 75,38 90,28 105,24 120,30 135,42 150,55 165,65 180,70 195,72 210,68 225,58 240,48 255,38 270,30" fill="none" stroke="#a78bfa" stroke-width="2" stroke-linejoin="round"/>
    </g>
    <g class="rs3">
      <circle cx="105" cy="24" r="5" fill="none" stroke="#ff5c5c" stroke-width="2"/>
      <rect x="108" y="18" width="70" height="11" fill="rgba(13,15,20,0.9)" rx="2"/>
      <text x="110" y="27" fill="#ff5c5c" font-size="7" font-family="monospace">Overbought → short?</text>
      <circle cx="197" cy="72" r="5" fill="none" stroke="#2ecc8a" stroke-width="2"/>
      <rect x="200" y="66" width="70" height="11" fill="rgba(13,15,20,0.9)" rx="2"/>
      <text x="202" y="75" fill="#2ecc8a" font-size="7" font-family="monospace">Oversold → long?</text>
    </g>
    <g class="rs4">
      <rect x="10" y="90" width="280" height="55" fill="rgba(167,139,250,0.07)" rx="6"/>
      <text x="18" y="105" fill="#a78bfa" font-size="8" font-family="monospace" font-weight="bold">RSI divergentie:</text>
      <text x="18" y="118" fill="#2ecc8a" font-size="8" font-family="monospace">Prijs ↑ maar RSI ↓ = bearish divergentie</text>
      <text x="18" y="131" fill="#ff5c5c" font-size="8" font-family="monospace">Prijs ↓ maar RSI ↑ = bullish divergentie</text>
      <text x="18" y="140" fill="#f5a623" font-size="7" font-family="monospace">Gebruik nooit alleen — combineer met S/R</text>
      <rect x="5" y="157" width="292" height="14" fill="#0d0f14"/>
      <text x="6" y="168" fill="#a78bfa" font-size="7" font-family="monospace">RSI range: 0–100 · Neutrale zone: 40–60</text>
    </g>
  </svg>`,

  macd: `<svg viewBox="0 0 300 175" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:175px;"><style>@keyframes mc{from{opacity:0}to{opacity:1}}.mc0{opacity:0;animation:mc .4s ease .1s forwards}.mc1{opacity:0;animation:mc .4s ease .5s forwards}.mc2{opacity:0;animation:mc .5s ease 1.1s forwards}.mc3{opacity:0;animation:mc .5s ease 1.8s forwards}.mc4{opacity:0;animation:mc .5s ease 2.6s forwards}</style>
    <rect width="300" height="175" fill="#0d0f14" rx="8"/>
    <g class="mc0"><text x="10" y="14" fill="#a78bfa" font-size="9" font-family="monospace" font-weight="bold">MACD — trend &amp; momentum</text></g>
    <g class="mc1">
      <line x1="10" y1="80" x2="290" y2="80" stroke="rgba(255,255,255,0.15)" stroke-width="1"/>
      <text x="12" y="78" fill="#4f9eff" font-size="6" font-family="monospace">0</text>
    </g>
    <g class="mc2">
      <polyline points="20,90 40,84 60,72 80,62 100,55 120,52 140,56 160,68 180,80 200,88 220,86 240,78 260,68 280,58" fill="none" stroke="#4f9eff" stroke-width="2" stroke-linejoin="round"/>
      <rect x="245" y="52" width="45" height="10" fill="rgba(13,15,20,0.9)" rx="2"/>
      <text x="247" y="60" fill="#4f9eff" font-size="7" font-family="monospace">MACD lijn</text>
      <polyline points="20,96 40,90 60,82 80,74 100,68 120,66 140,70 160,78 180,88 200,94 220,92 240,86 260,78 280,70" fill="none" stroke="#ff5c5c" stroke-width="1.5" stroke-dasharray="4,2" stroke-linejoin="round"/>
      <rect x="245" y="64" width="45" height="10" fill="rgba(13,15,20,0.9)" rx="2"/>
      <text x="247" y="72" fill="#ff5c5c" font-size="7" font-family="monospace">Signaal lijn</text>
    </g>
    <g class="mc3">
      <rect x="100" y="100" width="8" height="22" fill="rgba(46,204,138,0.7)" rx="1"/>
      <rect x="112" y="106" width="8" height="16" fill="rgba(46,204,138,0.5)" rx="1"/>
      <rect x="124" y="110" width="8" height="10" fill="rgba(46,204,138,0.4)" rx="1"/>
      <rect x="136" y="108" width="8" height="8" fill="rgba(255,92,92,0.4)" rx="1"/>
      <rect x="148" y="104" width="8" height="14" fill="rgba(255,92,92,0.5)" rx="1"/>
      <text x="100" y="130" fill="#2ecc8a" font-size="7" font-family="monospace">Histogram</text>
    </g>
    <g class="mc4">
      <circle cx="120" cy="66" r="5" fill="none" stroke="#f5a623" stroke-width="2"/>
      <rect x="126" y="60" width="80" height="11" fill="rgba(13,15,20,0.9)" rx="2"/>
      <text x="128" y="69" fill="#f5a623" font-size="7" font-family="monospace">MACD kruist signaal ↑ = koop</text>
      <rect x="5" y="157" width="292" height="14" fill="#0d0f14"/>
      <text x="6" y="168" fill="#a78bfa" font-size="7" font-family="monospace">MACD kruist boven signaal = bullish · onder = bearish</text>
    </g>
  </svg>`,

  atr: `<svg viewBox="0 0 300 175" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:175px;"><style>@keyframes at{from{opacity:0}to{opacity:1}}.at0{opacity:0;animation:at .4s ease .1s forwards}.at1{opacity:0;animation:at .4s ease .5s forwards}.at2{opacity:0;animation:at .5s ease 1.1s forwards}.at3{opacity:0;animation:at .5s ease 1.9s forwards}.at4{opacity:0;animation:at .4s ease 2.7s forwards}</style>
    <rect width="300" height="175" fill="#0d0f14" rx="8"/>
    <g class="at0"><text x="10" y="14" fill="#a78bfa" font-size="9" font-family="monospace" font-weight="bold">ATR — Average True Range</text></g>
    <g class="at1">
      <rect x="20" y="40" width="10" height="30" fill="#ff5c5c" rx="1"/><line x1="25" y1="36" x2="25" y2="72" stroke="#ff5c5c" stroke-width="1.5"/>
      <rect x="38" y="44" width="10" height="28" fill="#2ecc8a" rx="1"/><line x1="43" y1="40" x2="43" y2="74" stroke="#2ecc8a" stroke-width="1.5"/>
      <rect x="56" y="48" width="10" height="26" fill="#ff5c5c" rx="1"/><line x1="61" y1="44" x2="61" y2="76" stroke="#ff5c5c" stroke-width="1.5"/>
    </g>
    <g class="at2">
      <line x1="18" y1="36" x2="18" y2="76" stroke="#f5a623" stroke-width="2"/>
      <line x1="14" y1="36" x2="22" y2="36" stroke="#f5a623" stroke-width="1.5"/>
      <line x1="14" y1="76" x2="22" y2="76" stroke="#f5a623" stroke-width="1.5"/>
      <rect x="0" y="50" width="16" height="11" fill="rgba(13,15,20,0.9)" rx="2"/>
      <text x="2" y="59" fill="#f5a623" font-size="7" font-family="monospace">ATR</text>
      <rect x="66" y="52" width="68" height="11" fill="rgba(13,15,20,0.9)" rx="2"/>
      <text x="68" y="61" fill="#f5a623" font-size="7" font-family="monospace">= 40 pip range</text>
    </g>
    <g class="at3">
      <rect x="10" y="90" width="280" height="56" fill="rgba(167,139,250,0.07)" rx="6"/>
      <text x="18" y="105" fill="#a78bfa" font-size="8" font-family="monospace" font-weight="bold">Gebruik van ATR:</text>
      <text x="18" y="119" fill="#4f9eff" font-size="8" font-family="monospace">SL = 1.5× ATR onder entry</text>
      <text x="18" y="132" fill="#2ecc8a" font-size="8" font-family="monospace">TP = 3× ATR = R:R van 1:2</text>
      <text x="18" y="141" fill="#f5a623" font-size="7" font-family="monospace">Hoge ATR = volatiele markt = wijdere stops</text>
    </g>
    <g class="at4">
      <rect x="5" y="157" width="292" height="14" fill="#0d0f14"/>
      <text x="6" y="168" fill="#a78bfa" font-size="7" font-family="monospace">ATR past je stop-loss automatisch aan de marktvolatiliteit aan</text>
    </g>
  </svg>`,

  // ── STRATEGIES ──
  londonbreakout: `<svg viewBox="0 0 300 175" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:175px;"><style>@keyframes lb{from{opacity:0}to{opacity:1}}.lb0{opacity:0;animation:lb .4s ease .1s forwards}.lb1{opacity:0;animation:lb .4s ease .5s forwards}.lb2{opacity:0;animation:lb .5s ease 1.1s forwards}.lb3{opacity:0;animation:lb .5s ease 1.9s forwards}.lb4{opacity:0;animation:lb .4s ease 2.7s forwards}.lb5{opacity:0;animation:lb .5s ease 3.4s forwards}</style>
    <rect width="300" height="175" fill="#0d0f14" rx="8"/>
    <g class="lb0"><text x="10" y="14" fill="#f5a623" font-size="9" font-family="monospace" font-weight="bold">London Breakout Strategie</text></g>
    <g class="lb1">
      <rect x="15" y="52" width="70" height="58" fill="rgba(79,158,255,0.07)" rx="3"/>
      <text x="18" y="46" fill="#4f9eff" font-size="7" font-family="monospace">Asian sessie (02–08u)</text>
      <rect x="20" y="66" width="9" height="18" fill="#ff5c5c" rx="1"/><line x1="24" y1="63" x2="24" y2="86" stroke="#ff5c5c" stroke-width="1"/>
      <rect x="35" y="62" width="9" height="16" fill="#2ecc8a" rx="1"/><line x1="39" y1="59" x2="39" y2="80" stroke="#2ecc8a" stroke-width="1"/>
      <rect x="50" y="64" width="9" height="18" fill="#ff5c5c" rx="1"/><line x1="54" y1="61" x2="54" y2="84" stroke="#ff5c5c" stroke-width="1"/>
      <rect x="65" y="60" width="9" height="16" fill="#2ecc8a" rx="1"/><line x1="69" y1="57" x2="69" y2="78" stroke="#2ecc8a" stroke-width="1"/>
    </g>
    <g class="lb2">
      <line x1="15" y1="56" x2="270" y2="56" stroke="#2ecc8a" stroke-width="1.2" stroke-dasharray="4,3"/>
      <line x1="15" y1="100" x2="270" y2="100" stroke="#ff5c5c" stroke-width="1.2" stroke-dasharray="4,3"/>
      <rect x="240" y="49" width="52" height="10" fill="rgba(13,15,20,0.9)" rx="2"/>
      <text x="242" y="57" fill="#2ecc8a" font-size="7" font-family="monospace">Asian High</text>
      <rect x="240" y="93" width="52" height="10" fill="rgba(13,15,20,0.9)" rx="2"/>
      <text x="242" y="101" fill="#ff5c5c" font-size="7" font-family="monospace">Asian Low</text>
    </g>
    <g class="lb3">
      <line x1="88" y1="22" x2="88" y2="148" stroke="#f5a623" stroke-width="1" stroke-dasharray="2,2" opacity="0.7"/>
      <rect x="89" y="22" width="44" height="10" fill="rgba(13,15,20,0.9)" rx="2"/>
      <text x="91" y="30" fill="#f5a623" font-size="7" font-family="monospace">08:00 London</text>
      <rect x="91" y="36" width="38" height="18" fill="#2ecc8a" rx="1"/>
      <line x1="96" y1="30" x2="96" y2="56" stroke="#2ecc8a" stroke-width="2.5"/>
      <text x="132" y="43" fill="#f5a623" font-size="8" font-family="monospace" font-weight="bold">⬆ Break!</text>
    </g>
    <g class="lb4">
      <rect x="115" y="26" width="9" height="18" fill="#2ecc8a" rx="1"/><line x1="119" y1="22" x2="119" y2="46" stroke="#2ecc8a" stroke-width="1"/>
      <rect x="130" y="18" width="9" height="16" fill="#2ecc8a" rx="1"/><line x1="134" y1="14" x2="134" y2="36" stroke="#2ecc8a" stroke-width="1"/>
      <rect x="145" y="12" width="9" height="14" fill="#2ecc8a" rx="1"/><line x1="149" y1="8" x2="149" y2="28" stroke="#2ecc8a" stroke-width="1"/>
      <circle cx="96" cy="54" r="4" fill="none" stroke="#f5a623" stroke-width="1.5"/>
      <line x1="100" y1="108" x2="180" y2="108" stroke="#ff5c5c" stroke-width="1" stroke-dasharray="3,2"/>
      <rect x="182" y="102" width="16" height="10" fill="rgba(13,15,20,0.9)" rx="2"/>
      <text x="184" y="110" fill="#ff5c5c" font-size="7" font-family="monospace">SL</text>
    </g>
    <g class="lb5">
      <rect x="5" y="157" width="292" height="14" fill="#0d0f14"/>
      <text x="6" y="168" fill="#f5a623" font-size="7" font-family="monospace">Breakout boven Asian High om 08:00–09:00 → long entry op retest</text>
    </g>
  </svg>`,

  trendtrading: `<svg viewBox="0 0 300 175" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:175px;"><style>@keyframes tt{from{opacity:0}to{opacity:1}}.tt0{opacity:0;animation:tt .4s ease .1s forwards}.tt1{opacity:0;animation:tt .4s ease .5s forwards}.tt2{opacity:0;animation:tt .4s ease 1.0s forwards}.tt3{opacity:0;animation:tt .5s ease 1.7s forwards}.tt4{opacity:0;animation:tt .4s ease 2.4s forwards}.tt5{opacity:0;animation:tt .5s ease 3.1s forwards}</style>
    <rect width="300" height="175" fill="#0d0f14" rx="8"/>
    <g class="tt0"><text x="10" y="14" fill="#2ecc8a" font-size="9" font-family="monospace" font-weight="bold">Trend Trading — handel mee met de trend</text></g>
    <g class="tt1">
      <polyline points="20,130 60,100 100,75 140,55 180,38 220,24" fill="none" stroke="rgba(46,204,138,0.3)" stroke-width="1.5" stroke-dasharray="4,3"/>
    </g>
    <g class="tt2">
      <line x1="20" y1="130" x2="60" y2="100" stroke="#2ecc8a" stroke-width="2"/>
      <line x1="60" y1="100" x2="78" y2="112" stroke="#ff5c5c" stroke-width="1.5"/>
      <circle cx="78" cy="112" r="3" fill="#f5a623"/>
      <rect x="80" y="106" width="44" height="10" fill="rgba(13,15,20,0.9)" rx="2"/>
      <text x="82" y="114" fill="#f5a623" font-size="7" font-family="monospace">Entry 1 ↑</text>
    </g>
    <g class="tt3">
      <line x1="78" y1="112" x2="110" y2="82" stroke="#2ecc8a" stroke-width="2"/>
      <line x1="110" y1="82" x2="126" y2="94" stroke="#ff5c5c" stroke-width="1.5"/>
      <circle cx="126" cy="94" r="3" fill="#f5a623"/>
      <rect x="128" y="88" width="44" height="10" fill="rgba(13,15,20,0.9)" rx="2"/>
      <text x="130" y="96" fill="#f5a623" font-size="7" font-family="monospace">Entry 2 ↑</text>
    </g>
    <g class="tt4">
      <line x1="126" y1="94" x2="160" y2="62" stroke="#2ecc8a" stroke-width="2"/>
      <line x1="160" y1="62" x2="174" y2="72" stroke="#ff5c5c" stroke-width="1.5"/>
      <circle cx="174" cy="72" r="3" fill="#f5a623"/>
      <rect x="176" y="66" width="44" height="10" fill="rgba(13,15,20,0.9)" rx="2"/>
      <text x="178" y="74" fill="#f5a623" font-size="7" font-family="monospace">Entry 3 ↑</text>
      <line x1="174" y1="72" x2="220" y2="36" stroke="#2ecc8a" stroke-width="2"/>
    </g>
    <g class="tt5">
      <rect x="10" y="138" width="280" height="14" fill="rgba(46,204,138,0.07)" rx="3"/>
      <text x="15" y="148" fill="#2ecc8a" font-size="7" font-family="monospace">Koop bij pullbacks (HL) in een uptrend · Elke dip is een kans</text>
      <rect x="5" y="157" width="292" height="14" fill="#0d0f14"/>
      <text x="6" y="168" fill="#2ecc8a" font-size="7" font-family="monospace">Nooit traden TEGEN de trend op H4/Daily</text>
    </g>
  </svg>`,

  scalping: `<svg viewBox="0 0 300 175" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:175px;"><style>@keyframes sc{from{opacity:0}to{opacity:1}}.sc0{opacity:0;animation:sc .4s ease .1s forwards}.sc1{opacity:0;animation:sc .3s ease .5s forwards}.sc2{opacity:0;animation:sc .3s ease .8s forwards}.sc3{opacity:0;animation:sc .3s ease 1.1s forwards}.sc4{opacity:0;animation:sc .3s ease 1.4s forwards}.sc5{opacity:0;animation:sc .5s ease 1.8s forwards}</style>
    <rect width="300" height="175" fill="#0d0f14" rx="8"/>
    <g class="sc0"><text x="10" y="14" fill="#4f9eff" font-size="9" font-family="monospace" font-weight="bold">Scalping — snelle kleine winsten</text></g>
    <g class="sc1">
      <rect x="15" y="68" width="8" height="18" fill="#2ecc8a" rx="1"/><line x1="19" y1="65" x2="19" y2="88" stroke="#2ecc8a" stroke-width="1"/>
      <circle cx="19" cy="68" r="3" fill="#f5a623"/>
      <text x="24" y="72" fill="#f5a623" font-size="6" font-family="monospace">in</text>
    </g>
    <g class="sc2">
      <rect x="29" y="58" width="8" height="16" fill="#2ecc8a" rx="1"/><line x1="33" y1="55" x2="33" y2="76" stroke="#2ecc8a" stroke-width="1"/>
      <rect x="43" y="52" width="8" height="14" fill="#2ecc8a" rx="1"/><line x1="47" y1="49" x2="47" y2="68" stroke="#2ecc8a" stroke-width="1"/>
      <circle cx="55" cy="52" r="3" fill="#ff5c5c"/>
      <text x="58" y="55" fill="#ff5c5c" font-size="6" font-family="monospace">out +5p</text>
    </g>
    <g class="sc3">
      <rect x="65" y="58" width="8" height="18" fill="#ff5c5c" rx="1"/><line x1="69" y1="55" x2="69" y2="78" stroke="#ff5c5c" stroke-width="1"/>
      <circle cx="69" cy="58" r="3" fill="#f5a623"/>
      <text x="74" y="62" fill="#f5a623" font-size="6" font-family="monospace">in</text>
      <rect x="79" y="64" width="8" height="14" fill="#ff5c5c" rx="1"/><line x1="83" y1="61" x2="83" y2="80" stroke="#ff5c5c" stroke-width="1"/>
      <rect x="93" y="68" width="8" height="12" fill="#2ecc8a" rx="1"/><line x1="97" y1="65" x2="97" y2="82" stroke="#2ecc8a" stroke-width="1"/>
      <circle cx="105" cy="68" r="3" fill="#ff5c5c"/>
      <text x="108" y="71" fill="#ff5c5c" font-size="6" font-family="monospace">out −3p</text>
    </g>
    <g class="sc4">
      <rect x="115" y="56" width="8" height="16" fill="#2ecc8a" rx="1"/><line x1="119" y1="53" x2="119" y2="74" stroke="#2ecc8a" stroke-width="1"/>
      <circle cx="119" cy="56" r="3" fill="#f5a623"/>
      <rect x="129" y="46" width="8" height="18" fill="#2ecc8a" rx="1"/><line x1="133" y1="43" x2="133" y2="66" stroke="#2ecc8a" stroke-width="1"/>
      <rect x="143" y="38" width="8" height="16" fill="#2ecc8a" rx="1"/><line x1="147" y1="35" x2="147" y2="56" stroke="#2ecc8a" stroke-width="1"/>
      <circle cx="155" cy="38" r="3" fill="#ff5c5c"/>
      <text x="158" y="42" fill="#ff5c5c" font-size="6" font-family="monospace">out +8p</text>
    </g>
    <g class="sc5">
      <rect x="10" y="95" width="280" height="52" fill="rgba(79,158,255,0.07)" rx="6"/>
      <text x="18" y="110" fill="#4f9eff" font-size="8" font-family="monospace" font-weight="bold">Kenmerken scalping:</text>
      <text x="18" y="123" fill="#4f9eff" font-size="8" font-family="monospace">• M1/M5 timeframe · 3–10 pip targets</text>
      <text x="18" y="136" fill="#f5a623" font-size="8" font-family="monospace">• Hoge discipline + snelle executie vereist</text>
      <text x="18" y="145" fill="#ff5c5c" font-size="7" font-family="monospace">• Spread telt zwaar mee bij kleine targets!</text>
      <rect x="5" y="157" width="292" height="14" fill="#0d0f14"/>
      <text x="6" y="168" fill="#4f9eff" font-size="7" font-family="monospace">Niet geschikt voor beginners — vereist veel ervaring en focus</text>
    </g>
  </svg>`,

  swingtrading: `<svg viewBox="0 0 300 175" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:175px;"><style>@keyframes sw{from{opacity:0}to{opacity:1}}.sw0{opacity:0;animation:sw .4s ease .1s forwards}.sw1{opacity:0;animation:sw .4s ease .5s forwards}.sw2{opacity:0;animation:sw .5s ease 1.1s forwards}.sw3{opacity:0;animation:sw .5s ease 1.9s forwards}.sw4{opacity:0;animation:sw .5s ease 2.8s forwards}</style>
    <rect width="300" height="175" fill="#0d0f14" rx="8"/>
    <g class="sw0"><text x="10" y="14" fill="#2ecc8a" font-size="9" font-family="monospace" font-weight="bold">Swing Trading — meerdere dagen</text></g>
    <g class="sw1">
      <text x="10" y="28" fill="#4f9eff" font-size="7" font-family="monospace">Daily chart — elke kaars = 1 dag</text>
      <rect x="15" y="105" width="12" height="30" fill="#ff5c5c" rx="1"/><line x1="21" y1="100" x2="21" y2="137" stroke="#ff5c5c" stroke-width="1.5"/>
      <rect x="33" y="98" width="12" height="28" fill="#ff5c5c" rx="1"/><line x1="39" y1="93" x2="39" y2="128" stroke="#ff5c5c" stroke-width="1.5"/>
      <rect x="51" y="90" width="12" height="26" fill="#ff5c5c" rx="1"/><line x1="57" y1="85" x2="57" y2="118" stroke="#ff5c5c" stroke-width="1.5"/>
    </g>
    <g class="sw2">
      <rect x="69" y="80" width="12" height="18" fill="#2ecc8a" rx="1"/><line x1="75" y1="75" x2="75" y2="100" stroke="#2ecc8a" stroke-width="1.5"/>
      <circle cx="75" cy="98" r="5" fill="none" stroke="#f5a623" stroke-width="2"/>
      <rect x="81" y="92" width="56" height="10" fill="rgba(13,15,20,0.9)" rx="2"/>
      <text x="83" y="100" fill="#f5a623" font-size="8" font-family="monospace">Entry long!</text>
      <line x1="65" y1="120" x2="200" y2="120" stroke="#ff5c5c" stroke-width="1" stroke-dasharray="3,2"/>
      <rect x="202" y="114" width="16" height="10" fill="rgba(13,15,20,0.9)" rx="2"/>
      <text x="204" y="122" fill="#ff5c5c" font-size="7" font-family="monospace">SL</text>
    </g>
    <g class="sw3">
      <rect x="87" y="62" width="12" height="24" fill="#2ecc8a" rx="1"/><line x1="93" y1="58" x2="93" y2="88" stroke="#2ecc8a" stroke-width="1.5"/>
      <rect x="105" y="46" width="12" height="22" fill="#2ecc8a" rx="1"/><line x1="111" y1="42" x2="111" y2="70" stroke="#2ecc8a" stroke-width="1.5"/>
      <rect x="123" y="34" width="12" height="20" fill="#2ecc8a" rx="1"/><line x1="129" y1="30" x2="129" y2="56" stroke="#2ecc8a" stroke-width="1.5"/>
      <rect x="141" y="24" width="12" height="18" fill="#2ecc8a" rx="1"/><line x1="147" y1="20" x2="147" y2="44" stroke="#2ecc8a" stroke-width="1.5"/>
      <line x1="65" y1="32" x2="200" y2="32" stroke="#2ecc8a" stroke-width="1" stroke-dasharray="3,2"/>
      <rect x="202" y="26" width="16" height="10" fill="rgba(13,15,20,0.9)" rx="2"/>
      <text x="204" y="34" fill="#2ecc8a" font-size="7" font-family="monospace">TP</text>
    </g>
    <g class="sw4">
      <rect x="10" y="138" width="280" height="14" fill="rgba(46,204,138,0.07)" rx="3"/>
      <text x="15" y="148" fill="#2ecc8a" font-size="7" font-family="monospace">H4/Daily setup · SL 30–60p · TP 100–200p · Overnight ok</text>
      <rect x="5" y="157" width="292" height="14" fill="#0d0f14"/>
      <text x="6" y="168" fill="#2ecc8a" font-size="7" font-family="monospace">Minder tijdsintensief dan scalping — ideaal voor werkenden</text>
    </g>
  </svg>`,

  // ── PSYCHOLOGY ──
  fomo: `<svg viewBox="0 0 300 175" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:175px;"><style>@keyframes fo{from{opacity:0}to{opacity:1}}.fo0{opacity:0;animation:fo .4s ease .1s forwards}.fo1{opacity:0;animation:fo .4s ease .5s forwards}.fo2{opacity:0;animation:fo .5s ease 1.1s forwards}.fo3{opacity:0;animation:fo .5s ease 1.9s forwards}.fo4{opacity:0;animation:fo .4s ease 2.8s forwards}</style>
    <rect width="300" height="175" fill="#0d0f14" rx="8"/>
    <g class="fo0"><text x="10" y="14" fill="#ff5c5c" font-size="9" font-family="monospace" font-weight="bold">FOMO — Fear Of Missing Out</text></g>
    <line x1="150" y1="18" x2="150" y2="152" stroke="rgba(255,255,255,0.1)" stroke-width="1"/>
    <text x="20" y="26" fill="#ff5c5c" font-size="7" font-family="monospace">❌ FOMO entry (fout)</text>
    <text x="160" y="26" fill="#2ecc8a" font-size="7" font-family="monospace">✓ Wachten (juist)</text>
    <g class="fo1">
      <rect x="20" y="90" width="9" height="22" fill="#ff5c5c" rx="1"/><line x1="24" y1="87" x2="24" y2="114" stroke="#ff5c5c" stroke-width="1"/>
      <rect x="35" y="74" width="9" height="20" fill="#2ecc8a" rx="1"/><line x1="39" y1="71" x2="39" y2="96" stroke="#2ecc8a" stroke-width="1"/>
      <rect x="50" y="56" width="9" height="22" fill="#2ecc8a" rx="1"/><line x1="54" y1="53" x2="54" y2="80" stroke="#2ecc8a" stroke-width="1"/>
      <rect x="65" y="40" width="11" height="24" fill="#2ecc8a" rx="1"/><line x1="70" y1="36" x2="70" y2="66" stroke="#2ecc8a" stroke-width="2"/>
      <text x="35" y="36" fill="#f5a623" font-size="7" font-family="monospace">40 pip rally!</text>
    </g>
    <g class="fo2">
      <circle cx="80" cy="40" r="5" fill="#ff5c5c" opacity="0.8"/>
      <rect x="82" y="34" width="60" height="10" fill="rgba(13,15,20,0.9)" rx="2"/>
      <text x="84" y="42" fill="#ff5c5c" font-size="7" font-family="monospace">FOMO entry top!</text>
      <rect x="80" y="40" width="9" height="30" fill="#ff5c5c" rx="1"/><line x1="84" y1="36" x2="84" y2="72" stroke="#ff5c5c" stroke-width="1.5"/>
      <rect x="95" y="52" width="9" height="28" fill="#ff5c5c" rx="1"/><line x1="99" y1="49" x2="99" y2="82" stroke="#ff5c5c" stroke-width="1.5"/>
      <rect x="110" y="62" width="9" height="24" fill="#ff5c5c" rx="1"/><line x1="114" y1="59" x2="114" y2="88" stroke="#ff5c5c" stroke-width="1.5"/>
      <text x="80" y="100" fill="#ff5c5c" font-size="7" font-family="monospace">→ Verlies −30p</text>
    </g>
    <g class="fo3">
      <rect x="160" y="90" width="9" height="22" fill="#ff5c5c" rx="1"/><line x1="164" y1="87" x2="164" y2="114" stroke="#ff5c5c" stroke-width="1"/>
      <rect x="175" y="74" width="9" height="20" fill="#2ecc8a" rx="1"/><line x1="179" y1="71" x2="179" y2="96" stroke="#2ecc8a" stroke-width="1"/>
      <rect x="190" y="56" width="9" height="22" fill="#2ecc8a" rx="1"/><line x1="194" y1="53" x2="194" y2="80" stroke="#2ecc8a" stroke-width="1"/>
      <rect x="205" y="40" width="11" height="24" fill="#2ecc8a" rx="1"/>
      <text x="175" y="36" fill="#2ecc8a" font-size="7" font-family="monospace">Rally gemist ✓</text>
      <rect x="220" y="62" width="9" height="18" fill="#ff5c5c" rx="1"/><line x1="224" y1="59" x2="224" y2="82" stroke="#ff5c5c" stroke-width="1.5"/>
      <rect x="235" y="68" width="9" height="16" fill="#ff5c5c" rx="1"/><line x1="239" y1="65" x2="239" y2="86" stroke="#ff5c5c" stroke-width="1"/>
      <text x="218" y="56" fill="#f5a623" font-size="7" font-family="monospace">Pullback!</text>
    </g>
    <g class="fo4">
      <circle cx="239" cy="84" r="5" fill="none" stroke="#2ecc8a" stroke-width="2"/>
      <rect x="242" y="78" width="52" height="10" fill="rgba(13,15,20,0.9)" rx="2"/>
      <text x="244" y="86" fill="#2ecc8a" font-size="7" font-family="monospace">Entry op retest</text>
      <rect x="5" y="157" width="292" height="14" fill="#0d0f14"/>
      <text x="6" y="168" fill="#f5a623" font-size="7" font-family="monospace">Er is altijd een volgende setup — wacht op de retest</text>
    </g>
  </svg>`,

  revengetrading: `<svg viewBox="0 0 300 175" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:175px;"><style>@keyframes rv{from{opacity:0}to{opacity:1}}.rv0{opacity:0;animation:rv .4s ease .1s forwards}.rv1{opacity:0;animation:rv .4s ease .5s forwards}.rv2{opacity:0;animation:rv .5s ease 1.2s forwards}.rv3{opacity:0;animation:rv .5s ease 2.0s forwards}.rv4{opacity:0;animation:rv .5s ease 2.8s forwards}</style>
    <rect width="300" height="175" fill="#0d0f14" rx="8"/>
    <g class="rv0"><text x="10" y="14" fill="#ff5c5c" font-size="9" font-family="monospace" font-weight="bold">Revenge Trading — emotioneel traden</text></g>
    <g class="rv1">
      <rect x="20" y="55" width="28" height="30" fill="rgba(79,158,255,0.1)" rx="4"/>
      <text x="24" y="68" fill="#4f9eff" font-size="7" font-family="monospace">Trade 1</text>
      <text x="24" y="78" fill="#2ecc8a" font-size="8" font-family="monospace" font-weight="bold">0.1 lot</text>
      <line x1="48" y1="70" x2="68" y2="70" stroke="#ff5c5c" stroke-width="1.5"/>
      <text x="52" y="66" fill="#ff5c5c" font-size="7" font-family="monospace">−€20</text>
    </g>
    <g class="rv2">
      <rect x="70" y="45" width="38" height="38" fill="rgba(255,92,92,0.08)" rx="4"/>
      <text x="74" y="58" fill="#ff5c5c" font-size="7" font-family="monospace">Trade 2</text>
      <text x="74" y="70" fill="#ff5c5c" font-size="9" font-family="monospace" font-weight="bold">0.3 lot</text>
      <text x="74" y="79" fill="#f5a623" font-size="6" font-family="monospace">3× groter!</text>
      <line x1="108" y1="65" x2="128" y2="65" stroke="#ff5c5c" stroke-width="2"/>
      <text x="112" y="60" fill="#ff5c5c" font-size="7" font-family="monospace">−€60</text>
    </g>
    <g class="rv3">
      <rect x="130" y="30" width="50" height="52" fill="rgba(255,92,92,0.12)" rx="4"/>
      <text x="135" y="44" fill="#ff5c5c" font-size="7" font-family="monospace">Trade 3</text>
      <text x="135" y="58" fill="#ff5c5c" font-size="12" font-family="monospace" font-weight="bold">1.0 lot</text>
      <text x="135" y="70" fill="#f5a623" font-size="6" font-family="monospace">10× groter!</text>
      <text x="135" y="78" fill="#ff5c5c" font-size="7" font-family="monospace">EMOTIE</text>
      <line x1="180" y1="55" x2="200" y2="55" stroke="#ff5c5c" stroke-width="2.5"/>
      <text x="183" y="50" fill="#ff5c5c" font-size="7" font-family="monospace">−€200</text>
    </g>
    <g class="rv4">
      <rect x="10" y="98" width="280" height="48" fill="rgba(255,92,92,0.06)" rx="6"/>
      <text x="18" y="114" fill="#ff5c5c" font-size="9" font-family="monospace" font-weight="bold">Totaal: −€280 in 3 trades!</text>
      <text x="18" y="127" fill="#f5a623" font-size="8" font-family="monospace">Regel: stop na 2 verlieshandels per dag</text>
      <text x="18" y="140" fill="#2ecc8a" font-size="8" font-family="monospace">Pauze nemen = de beste trade</text>
      <rect x="5" y="157" width="292" height="14" fill="#0d0f14"/>
      <text x="6" y="168" fill="#ff5c5c" font-size="7" font-family="monospace">Verlies accepteren = kracht, niet zwakte</text>
    </g>
  </svg>`,

  tradingplan: `<svg viewBox="0 0 300 175" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:175px;"><style>@keyframes tp{from{opacity:0}to{opacity:1}}.tp0{opacity:0;animation:tp .4s ease .1s forwards}.tp1{opacity:0;animation:tp .4s ease .5s forwards}.tp2{opacity:0;animation:tp .3s ease .9s forwards}.tp3{opacity:0;animation:tp .3s ease 1.2s forwards}.tp4{opacity:0;animation:tp .3s ease 1.5s forwards}.tp5{opacity:0;animation:tp .3s ease 1.8s forwards}.tp6{opacity:0;animation:tp .5s ease 2.4s forwards}</style>
    <rect width="300" height="175" fill="#0d0f14" rx="8"/>
    <g class="tp0"><text x="10" y="14" fill="#2ecc8a" font-size="9" font-family="monospace" font-weight="bold">Trading Plan — jouw regels</text></g>
    <g class="tp1">
      <rect x="10" y="20" width="280" height="10" fill="rgba(46,204,138,0.1)" rx="2"/>
      <text x="15" y="28" fill="#2ecc8a" font-size="7" font-family="monospace">📋 Mijn Trading Plan</text>
    </g>
    <g class="tp2">
      <rect x="10" y="33" width="12" height="10" fill="rgba(46,204,138,0.3)" rx="2"/>
      <text x="14" y="41" fill="#2ecc8a" font-size="7" font-family="monospace">✓</text>
      <text x="28" y="41" fill="#4f9eff" font-size="7" font-family="monospace">Instrument: EUR/USD, GBP/USD</text>
    </g>
    <g class="tp3">
      <rect x="10" y="46" width="12" height="10" fill="rgba(46,204,138,0.3)" rx="2"/>
      <text x="14" y="54" fill="#2ecc8a" font-size="7" font-family="monospace">✓</text>
      <text x="28" y="54" fill="#4f9eff" font-size="7" font-family="monospace">Sessie: London (08–11u)</text>
    </g>
    <g class="tp4">
      <rect x="10" y="59" width="12" height="10" fill="rgba(46,204,138,0.3)" rx="2"/>
      <text x="14" y="67" fill="#2ecc8a" font-size="7" font-family="monospace">✓</text>
      <text x="28" y="67" fill="#4f9eff" font-size="7" font-family="monospace">Entry: price action + S/R + HTF trend</text>
    </g>
    <g class="tp5">
      <rect x="10" y="72" width="12" height="10" fill="rgba(46,204,138,0.3)" rx="2"/>
      <text x="14" y="80" fill="#2ecc8a" font-size="7" font-family="monospace">✓</text>
      <text x="28" y="80" fill="#4f9eff" font-size="7" font-family="monospace">Risico: max 1% per trade, stop na 3 losses</text>
      <rect x="10" y="85" width="12" height="10" fill="rgba(46,204,138,0.3)" rx="2"/>
      <text x="14" y="93" fill="#2ecc8a" font-size="7" font-family="monospace">✓</text>
      <text x="28" y="93" fill="#4f9eff" font-size="7" font-family="monospace">R:R: minimum 1:2</text>
    </g>
    <g class="tp6">
      <rect x="10" y="104" width="280" height="44" fill="rgba(46,204,138,0.06)" rx="6"/>
      <text x="18" y="119" fill="#2ecc8a" font-size="8" font-family="monospace" font-weight="bold">Voordeel: beslissingen VOOR de trade</text>
      <text x="18" y="131" fill="#4f9eff" font-size="8" font-family="monospace">Geen emotie midden in een beweging</text>
      <text x="18" y="143" fill="#f5a623" font-size="7" font-family="monospace">Volg je plan → ook als het oncomfortabel voelt</text>
      <rect x="5" y="157" width="292" height="14" fill="#0d0f14"/>
      <text x="6" y="168" fill="#2ecc8a" font-size="7" font-family="monospace">Een trader zonder plan is een gokker</text>
    </g>
  </svg>`,

  // ── PRICE ACTION (animated versions) ──
  supportresistance: `<svg viewBox="0 0 300 175" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:175px;"><style>@keyframes sr{from{opacity:0}to{opacity:1}}.sr0{opacity:0;animation:sr .4s ease .1s forwards}.sr1{opacity:0;animation:sr .4s ease .5s forwards}.sr2{opacity:0;animation:sr .5s ease 1.1s forwards}.sr3{opacity:0;animation:sr .4s ease 1.8s forwards}.sr4{opacity:0;animation:sr .4s ease 2.4s forwards}.sr5{opacity:0;animation:sr .4s ease 3.0s forwards}.sr6{opacity:0;animation:sr .5s ease 3.7s forwards}</style>
    <rect width="300" height="175" fill="#0d0f14" rx="8"/>
    <g class="sr0"><text x="10" y="14" fill="#4f9eff" font-size="9" font-family="monospace" font-weight="bold">Support &amp; Resistance</text></g>
    <g class="sr1">
      <line x1="10" y1="48" x2="285" y2="48" stroke="#ff5c5c" stroke-width="1.5" stroke-dasharray="5,3"/>
      <rect x="236" y="41" width="52" height="10" fill="rgba(13,15,20,0.9)" rx="2"/>
      <text x="238" y="49" fill="#ff5c5c" font-size="7" font-family="monospace">Resistance</text>
      <line x1="10" y1="118" x2="285" y2="118" stroke="#4f9eff" stroke-width="1.5" stroke-dasharray="5,3"/>
      <rect x="236" y="111" width="48" height="10" fill="rgba(13,15,20,0.9)" rx="2"/>
      <text x="238" y="119" fill="#4f9eff" font-size="7" font-family="monospace">Support</text>
    </g>
    <g class="sr2">
      <rect x="18" y="58" width="9" height="22" fill="#ff5c5c" rx="1"/><line x1="22" y1="55" x2="22" y2="82" stroke="#ff5c5c" stroke-width="1"/>
      <rect x="33" y="68" width="9" height="24" fill="#ff5c5c" rx="1"/><line x1="37" y1="65" x2="37" y2="94" stroke="#ff5c5c" stroke-width="1"/>
      <rect x="48" y="80" width="9" height="26" fill="#ff5c5c" rx="1"/><line x1="52" y1="77" x2="52" y2="108" stroke="#ff5c5c" stroke-width="1"/>
    </g>
    <g class="sr3">
      <rect x="63" y="88" width="9" height="10" fill="#2ecc8a" rx="1"/>
      <line x1="67" y1="84" x2="67" y2="120" stroke="#2ecc8a" stroke-width="1.5"/>
      <text x="73" y="118" fill="#4f9eff" font-size="7" font-family="monospace">↑ Bounce</text>
    </g>
    <g class="sr4">
      <rect x="85" y="72" width="9" height="28" fill="#2ecc8a" rx="1"/><line x1="89" y1="68" x2="89" y2="102" stroke="#2ecc8a" stroke-width="1"/>
      <rect x="100" y="54" width="9" height="26" fill="#2ecc8a" rx="1"/><line x1="104" y1="50" x2="104" y2="82" stroke="#2ecc8a" stroke-width="1"/>
      <rect x="115" y="42" width="9" height="14" fill="#ff5c5c" rx="1"/><line x1="119" y1="38" x2="119" y2="58" stroke="#ff5c5c" stroke-width="1"/>
    </g>
    <g class="sr5">
      <rect x="130" y="52" width="9" height="22" fill="#ff5c5c" rx="1"/><line x1="134" y1="48" x2="134" y2="76" stroke="#ff5c5c" stroke-width="1.5"/>
      <text x="140" y="47" fill="#ff5c5c" font-size="7" font-family="monospace">↓ Rejection</text>
      <rect x="145" y="64" width="9" height="28" fill="#ff5c5c" rx="1"/><line x1="149" y1="60" x2="149" y2="94" stroke="#ff5c5c" stroke-width="1"/>
      <rect x="160" y="80" width="9" height="28" fill="#ff5c5c" rx="1"/><line x1="164" y1="77" x2="164" y2="110" stroke="#ff5c5c" stroke-width="1"/>
    </g>
    <g class="sr6">
      <rect x="175" y="88" width="9" height="10" fill="#2ecc8a" rx="1"/>
      <line x1="179" y1="84" x2="179" y2="120" stroke="#2ecc8a" stroke-width="1.5"/>
      <text x="185" y="118" fill="#4f9eff" font-size="7" font-family="monospace">↑ Bounce</text>
      <rect x="194" y="70" width="9" height="30" fill="#2ecc8a" rx="1"/><line x1="198" y1="66" x2="198" y2="102" stroke="#2ecc8a" stroke-width="1"/>
      <rect x="209" y="52" width="9" height="24" fill="#2ecc8a" rx="1"/><line x1="213" y1="48" x2="213" y2="78" stroke="#2ecc8a" stroke-width="1"/>
      <rect x="5" y="157" width="292" height="14" fill="#0d0f14"/>
      <text x="6" y="168" fill="#4f9eff" font-size="7" font-family="monospace">Hoe vaker getest zonder doorbraak → hoe sterker het niveau</text>
    </g>
  </svg>`,

  pinbar: `<svg viewBox="0 0 300 175" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:175px;"><style>@keyframes pb{from{opacity:0}to{opacity:1}}.pb0{opacity:0;animation:pb .4s ease .1s forwards}.pb1{opacity:0;animation:pb .4s ease .5s forwards}.pb2{opacity:0;animation:pb .4s ease 1.0s forwards}.pb3{opacity:0;animation:pb .5s ease 1.7s forwards}.pb4{opacity:0;animation:pb .4s ease 2.4s forwards}.pb5{opacity:0;animation:pb .5s ease 3.1s forwards}</style>
    <rect width="300" height="175" fill="#0d0f14" rx="8"/>
    <g class="pb0"><text x="10" y="14" fill="#2ecc8a" font-size="9" font-family="monospace" font-weight="bold">Pin Bar — prijsafwijzing</text></g>
    <line x1="150" y1="18" x2="150" y2="152" stroke="rgba(255,255,255,0.1)" stroke-width="1"/>
    <text x="20" y="26" fill="#2ecc8a" font-size="7" font-family="monospace">Bullish Pin Bar</text>
    <text x="158" y="26" fill="#ff5c5c" font-size="7" font-family="monospace">Bearish Pin Bar</text>
    <g class="pb1">
      <rect x="20" y="72" width="9" height="22" fill="#ff5c5c" rx="1"/><line x1="24" y1="69" x2="24" y2="96" stroke="#ff5c5c" stroke-width="1"/>
      <rect x="35" y="80" width="9" height="20" fill="#ff5c5c" rx="1"/><line x1="39" y1="77" x2="39" y2="102" stroke="#ff5c5c" stroke-width="1"/>
      <line x1="10" y1="115" x2="135" y2="115" stroke="#4f9eff" stroke-width="1" stroke-dasharray="4,3"/>
      <rect x="90" y="108" width="42" height="10" fill="rgba(13,15,20,0.9)" rx="2"/>
      <text x="92" y="116" fill="#4f9eff" font-size="7" font-family="monospace">Support</text>
    </g>
    <g class="pb2">
      <rect x="56" y="96" width="11" height="8" fill="#2ecc8a" rx="1"/>
      <line x1="61" y1="92" x2="61" y2="116" stroke="#2ecc8a" stroke-width="2"/>
      <line x1="61" y1="90" x2="61" y2="96" stroke="#2ecc8a" stroke-width="2"/>
      <text x="54" y="88" fill="#4f9eff" font-size="8" font-family="monospace">Pin!</text>
    </g>
    <g class="pb3">
      <text x="74" y="94" fill="#2ecc8a" font-size="8" font-family="monospace">↑ Entry</text>
      <rect x="76" y="70" width="9" height="28" fill="#2ecc8a" rx="1"/><line x1="80" y1="66" x2="80" y2="100" stroke="#2ecc8a" stroke-width="1.5"/>
      <rect x="91" y="54" width="9" height="24" fill="#2ecc8a" rx="1"/><line x1="95" y1="50" x2="95" y2="80" stroke="#2ecc8a" stroke-width="1.5"/>
      <rect x="106" y="42" width="9" height="22" fill="#2ecc8a" rx="1"/><line x1="110" y1="38" x2="110" y2="66" stroke="#2ecc8a" stroke-width="1.5"/>
    </g>
    <g class="pb4">
      <rect x="160" y="78" width="9" height="20" fill="#2ecc8a" rx="1"/><line x1="164" y1="75" x2="164" y2="100" stroke="#2ecc8a" stroke-width="1"/>
      <rect x="175" y="70" width="9" height="22" fill="#2ecc8a" rx="1"/><line x1="179" y1="67" x2="179" y2="94" stroke="#2ecc8a" stroke-width="1"/>
      <line x1="155" y1="48" x2="285" y2="48" stroke="#ff5c5c" stroke-width="1" stroke-dasharray="4,3"/>
      <rect x="240" y="41" width="52" height="10" fill="rgba(13,15,20,0.9)" rx="2"/>
      <text x="242" y="49" fill="#ff5c5c" font-size="7" font-family="monospace">Resistance</text>
    </g>
    <g class="pb5">
      <rect x="196" y="46" width="11" height="8" fill="#ff5c5c" rx="1"/>
      <line x1="201" y1="28" x2="201" y2="46" stroke="#ff5c5c" stroke-width="2"/>
      <line x1="201" y1="54" x2="201" y2="58" stroke="#ff5c5c" stroke-width="2"/>
      <text x="208" y="44" fill="#ff5c5c" font-size="8" font-family="monospace">Pin!</text>
      <text x="208" y="56" fill="#ff5c5c" font-size="8" font-family="monospace">↓ Entry</text>
      <rect x="215" y="58" width="9" height="28" fill="#ff5c5c" rx="1"/><line x1="219" y1="54" x2="219" y2="88" stroke="#ff5c5c" stroke-width="1.5"/>
      <rect x="230" y="72" width="9" height="26" fill="#ff5c5c" rx="1"/><line x1="234" y1="68" x2="234" y2="100" stroke="#ff5c5c" stroke-width="1.5"/>
      <rect x="5" y="157" width="292" height="14" fill="#0d0f14"/>
      <text x="6" y="168" fill="#2ecc8a" font-size="7" font-family="monospace">Lange wick = sterke afwijzing door de markt</text>
    </g>
  </svg>`,

  engulfing: `<svg viewBox="0 0 300 175" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:175px;"><style>@keyframes eg{from{opacity:0}to{opacity:1}}.eg0{opacity:0;animation:eg .4s ease .1s forwards}.eg1{opacity:0;animation:eg .4s ease .5s forwards}.eg2{opacity:0;animation:eg .5s ease 1.2s forwards}.eg3{opacity:0;animation:eg .4s ease 2.0s forwards}.eg4{opacity:0;animation:eg .5s ease 2.8s forwards}</style>
    <rect width="300" height="175" fill="#0d0f14" rx="8"/>
    <g class="eg0"><text x="10" y="14" fill="#2ecc8a" font-size="9" font-family="monospace" font-weight="bold">Engulfing Candle — ommekeer signaal</text></g>
    <line x1="150" y1="18" x2="150" y2="152" stroke="rgba(255,255,255,0.1)" stroke-width="1"/>
    <text x="14" y="26" fill="#2ecc8a" font-size="7" font-family="monospace">Bullish Engulfing</text>
    <text x="158" y="26" fill="#ff5c5c" font-size="7" font-family="monospace">Bearish Engulfing</text>
    <g class="eg1">
      <rect x="18" y="62" width="9" height="22" fill="#ff5c5c" rx="1"/><line x1="22" y1="59" x2="22" y2="86" stroke="#ff5c5c" stroke-width="1"/>
      <rect x="33" y="70" width="9" height="24" fill="#ff5c5c" rx="1"/><line x1="37" y1="67" x2="37" y2="96" stroke="#ff5c5c" stroke-width="1"/>
      <rect x="48" y="78" width="10" height="20" fill="#ff5c5c" rx="1"/><line x1="53" y1="75" x2="53" y2="100" stroke="#ff5c5c" stroke-width="1"/>
      <rect x="158" y="78" width="9" height="22" fill="#2ecc8a" rx="1"/><line x1="162" y1="75" x2="162" y2="102" stroke="#2ecc8a" stroke-width="1"/>
      <rect x="173" y="68" width="9" height="20" fill="#2ecc8a" rx="1"/><line x1="177" y1="65" x2="177" y2="90" stroke="#2ecc8a" stroke-width="1"/>
      <rect x="188" y="60" width="10" height="18" fill="#2ecc8a" rx="1"/><line x1="193" y1="57" x2="193" y2="80" stroke="#2ecc8a" stroke-width="1"/>
    </g>
    <g class="eg2">
      <rect x="65" y="68" width="12" height="20" fill="#ff5c5c" rx="1"/><line x1="71" y1="65" x2="71" y2="90" stroke="#ff5c5c" stroke-width="1.5"/>
      <rect x="205" y="52" width="12" height="16" fill="#2ecc8a" rx="1"/><line x1="211" y1="49" x2="211" y2="70" stroke="#2ecc8a" stroke-width="1.5"/>
    </g>
    <g class="eg3">
      <rect x="83" y="56" width="16" height="40" fill="#2ecc8a" rx="1"/><line x1="91" y1="52" x2="91" y2="98" stroke="#2ecc8a" stroke-width="2"/>
      <rect x="64" y="54" width="46" height="44" fill="rgba(245,166,35,0.1)" rx="2"/>
      <rect x="80" y="46" width="58" height="10" fill="rgba(13,15,20,0.9)" rx="2"/>
      <text x="82" y="54" fill="#f5a623" font-size="7" font-family="monospace">← omsloten →</text>
      <text x="82" y="110" fill="#2ecc8a" font-size="8" font-family="monospace">↑ Long signaal</text>
      <rect x="220" y="38" width="16" height="42" fill="#ff5c5c" rx="1"/><line x1="228" y1="34" x2="228" y2="82" stroke="#ff5c5c" stroke-width="2"/>
      <rect x="204" y="36" width="46" height="44" fill="rgba(245,166,35,0.1)" rx="2"/>
      <rect x="204" y="28" width="58" height="10" fill="rgba(13,15,20,0.9)" rx="2"/>
      <text x="206" y="36" fill="#f5a623" font-size="7" font-family="monospace">← omsloten →</text>
      <text x="216" y="98" fill="#ff5c5c" font-size="8" font-family="monospace">↓ Short signaal</text>
    </g>
    <g class="eg4">
      <rect x="5" y="157" width="292" height="14" fill="#0d0f14"/>
      <text x="6" y="168" fill="#f5a623" font-size="7" font-family="monospace">Hoe groter de engulfing kaars t.o.v. vorige → hoe sterker signaal</text>
    </g>
  </svg>`,

  breakretest: `<svg viewBox="0 0 300 175" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:175px;"><style>@keyframes br{from{opacity:0}to{opacity:1}}.br0{opacity:0;animation:br .4s ease .1s forwards}.br1{opacity:0;animation:br .4s ease .5s forwards}.br2{opacity:0;animation:br .5s ease 1.1s forwards}.br3{opacity:0;animation:br .5s ease 1.9s forwards}.br4{opacity:0;animation:br .4s ease 2.7s forwards}.br5{opacity:0;animation:br .5s ease 3.4s forwards}</style>
    <rect width="300" height="175" fill="#0d0f14" rx="8"/>
    <g class="br0"><text x="10" y="14" fill="#f5a623" font-size="9" font-family="monospace" font-weight="bold">Break &amp; Retest</text></g>
    <g class="br1">
      <line x1="10" y1="88" x2="285" y2="88" stroke="#f5a623" stroke-width="1.5" stroke-dasharray="5,3"/>
      <rect x="225" y="80" width="62" height="10" fill="rgba(13,15,20,0.9)" rx="2"/>
      <text x="227" y="88" fill="#f5a623" font-size="7" font-family="monospace">Res → Support</text>
    </g>
    <g class="br2">
      <rect x="15" y="96" width="9" height="20" fill="#2ecc8a" rx="1"/><line x1="19" y1="93" x2="19" y2="118" stroke="#2ecc8a" stroke-width="1"/>
      <rect x="30" y="92" width="9" height="18" fill="#ff5c5c" rx="1"/><line x1="34" y1="89" x2="34" y2="112" stroke="#ff5c5c" stroke-width="1"/>
      <rect x="45" y="94" width="9" height="18" fill="#2ecc8a" rx="1"/><line x1="49" y1="91" x2="49" y2="114" stroke="#2ecc8a" stroke-width="1"/>
    </g>
    <g class="br3">
      <rect x="62" y="56" width="13" height="34" fill="#2ecc8a" rx="1"/><line x1="68" y1="52" x2="68" y2="92" stroke="#2ecc8a" stroke-width="2.5"/>
      <rect x="60" y="80" width="58" height="10" fill="rgba(13,15,20,0.9)" rx="2"/>
      <text x="62" y="88" fill="#2ecc8a" font-size="8" font-family="monospace">Breakout! ↑</text>
      <rect x="81" y="36" width="9" height="22" fill="#2ecc8a" rx="1"/><line x1="85" y1="32" x2="85" y2="60" stroke="#2ecc8a" stroke-width="1"/>
      <rect x="96" y="24" width="9" height="20" fill="#2ecc8a" rx="1"/><line x1="100" y1="20" x2="100" y2="46" stroke="#2ecc8a" stroke-width="1"/>
    </g>
    <g class="br4">
      <rect x="113" y="60" width="9" height="24" fill="#ff5c5c" rx="1"/><line x1="117" y1="56" x2="117" y2="86" stroke="#ff5c5c" stroke-width="1"/>
      <rect x="128" y="72" width="9" height="18" fill="#ff5c5c" rx="1"/><line x1="132" y1="69" x2="132" y2="92" stroke="#ff5c5c" stroke-width="1.5"/>
      <rect x="108" y="58" width="36" height="10" fill="rgba(13,15,20,0.9)" rx="2"/>
      <text x="110" y="66" fill="#4f9eff" font-size="7" font-family="monospace">Retest...</text>
    </g>
    <g class="br5">
      <rect x="143" y="78" width="10" height="8" fill="#2ecc8a" rx="1"/><line x1="148" y1="74" x2="148" y2="88" stroke="#2ecc8a" stroke-width="1.5"/>
      <circle cx="148" cy="86" r="4" fill="none" stroke="#f5a623" stroke-width="1.5"/>
      <rect x="154" y="80" width="44" height="10" fill="rgba(13,15,20,0.9)" rx="2"/>
      <text x="156" y="88" fill="#f5a623" font-size="7" font-family="monospace">Entry long!</text>
      <rect x="163" y="56" width="9" height="26" fill="#2ecc8a" rx="1"/><line x1="167" y1="52" x2="167" y2="84" stroke="#2ecc8a" stroke-width="1"/>
      <rect x="178" y="38" width="9" height="24" fill="#2ecc8a" rx="1"/><line x1="182" y1="34" x2="182" y2="64" stroke="#2ecc8a" stroke-width="1"/>
      <rect x="193" y="24" width="9" height="20" fill="#2ecc8a" rx="1"/><line x1="197" y1="20" x2="197" y2="46" stroke="#2ecc8a" stroke-width="1"/>
      <rect x="5" y="157" width="292" height="14" fill="#0d0f14"/>
      <text x="6" y="168" fill="#f5a623" font-size="7" font-family="monospace">Na de break keert prijs terug voor retest → lage-risico entry</text>
    </g>
  </svg>`,

  higherlow: `<svg viewBox="0 0 300 175" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:175px;"><style>@keyframes hl{from{opacity:0}to{opacity:1}}.hl0{opacity:0;animation:hl .4s ease .1s forwards}.hl1{opacity:0;animation:hl .4s ease .5s forwards}.hl2{opacity:0;animation:hl .4s ease 1.0s forwards}.hl3{opacity:0;animation:hl .4s ease 1.5s forwards}.hl4{opacity:0;animation:hl .4s ease 2.0s forwards}.hl5{opacity:0;animation:hl .5s ease 2.6s forwards}</style>
    <rect width="300" height="175" fill="#0d0f14" rx="8"/>
    <g class="hl0"><text x="10" y="14" fill="#2ecc8a" font-size="9" font-family="monospace" font-weight="bold">Higher High / Higher Low — Uptrend</text></g>
    <g class="hl1">
      <circle cx="25" cy="128" r="3" fill="#4f9eff"/>
      <line x1="25" y1="128" x2="65" y2="85" stroke="#2ecc8a" stroke-width="2"/>
      <circle cx="65" cy="85" r="3" fill="#2ecc8a"/>
      <rect x="56" y="78" width="28" height="10" fill="rgba(13,15,20,0.9)" rx="2"/>
      <text x="58" y="86" fill="#2ecc8a" font-size="8" font-family="monospace">HH1</text>
    </g>
    <g class="hl2">
      <line x1="65" y1="85" x2="95" y2="102" stroke="#ff5c5c" stroke-width="1.5"/>
      <circle cx="95" cy="102" r="3" fill="#4f9eff"/>
      <rect x="85" y="108" width="28" height="10" fill="rgba(13,15,20,0.9)" rx="2"/>
      <text x="87" y="116" fill="#4f9eff" font-size="8" font-family="monospace">HL1</text>
    </g>
    <g class="hl3">
      <line x1="95" y1="102" x2="145" y2="58" stroke="#2ecc8a" stroke-width="2"/>
      <circle cx="145" cy="58" r="3" fill="#2ecc8a"/>
      <rect x="136" y="51" width="28" height="10" fill="rgba(13,15,20,0.9)" rx="2"/>
      <text x="138" y="59" fill="#2ecc8a" font-size="8" font-family="monospace">HH2</text>
    </g>
    <g class="hl4">
      <line x1="145" y1="58" x2="178" y2="76" stroke="#ff5c5c" stroke-width="1.5"/>
      <circle cx="178" cy="76" r="3" fill="#4f9eff"/>
      <rect x="168" y="82" width="28" height="10" fill="rgba(13,15,20,0.9)" rx="2"/>
      <text x="170" y="90" fill="#4f9eff" font-size="8" font-family="monospace">HL2</text>
      <circle cx="95" cy="102" r="5" fill="none" stroke="#f5a623" stroke-width="1.5"/>
      <circle cx="178" cy="76" r="5" fill="none" stroke="#f5a623" stroke-width="1.5"/>
      <rect x="148" y="82" width="18" height="10" fill="rgba(13,15,20,0.9)" rx="2"/>
      <text x="150" y="90" fill="#f5a623" font-size="6" font-family="monospace">Entry</text>
    </g>
    <g class="hl5">
      <line x1="178" y1="76" x2="255" y2="34" stroke="#2ecc8a" stroke-width="2"/>
      <circle cx="255" cy="34" r="3" fill="#2ecc8a"/>
      <rect x="246" y="27" width="28" height="10" fill="rgba(13,15,20,0.9)" rx="2"/>
      <text x="248" y="35" fill="#2ecc8a" font-size="8" font-family="monospace">HH3</text>
      <rect x="10" y="138" width="280" height="14" fill="rgba(46,204,138,0.07)" rx="3"/>
      <text x="15" y="148" fill="#2ecc8a" font-size="7" font-family="monospace">HH = Higher High (groene cirkel) · HL = Higher Low (blauwe cirkel)</text>
      <rect x="5" y="157" width="292" height="14" fill="#0d0f14"/>
      <text x="6" y="168" fill="#f5a623" font-size="7" font-family="monospace">Koop bij HL — elke pullback is een long kans in uptrend</text>
    </g>
  </svg>`,

  // ── ICT ANIMATED VERSIONS ──
  orderblock: `<svg viewBox="0 0 300 175" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:175px;"><style>@keyframes ob{from{opacity:0}to{opacity:1}}.ob0{opacity:0;animation:ob .4s ease .1s forwards}.ob1{opacity:0;animation:ob .4s ease .5s forwards}.ob2{opacity:0;animation:ob .5s ease 1.1s forwards}.ob3{opacity:0;animation:ob .5s ease 1.9s forwards}.ob4{opacity:0;animation:ob .4s ease 2.7s forwards}.ob5{opacity:0;animation:ob .5s ease 3.4s forwards}</style>
    <rect width="300" height="175" fill="#0d0f14" rx="8"/>
    <g class="ob0"><text x="10" y="14" fill="#f5a623" font-size="9" font-family="monospace" font-weight="bold">Order Block (OB)</text></g>
    <g class="ob1">
      <rect x="15" y="40" width="9" height="18" fill="#ff5c5c" rx="1"/><line x1="19" y1="37" x2="19" y2="60" stroke="#ff5c5c" stroke-width="1"/>
      <rect x="30" y="50" width="9" height="20" fill="#ff5c5c" rx="1"/><line x1="34" y1="47" x2="34" y2="72" stroke="#ff5c5c" stroke-width="1"/>
    </g>
    <g class="ob2">
      <rect x="46" y="58" width="13" height="26" fill="#ff5c5c" rx="1" stroke="#f5a623" stroke-width="1.5"/>
      <line x1="52" y1="54" x2="52" y2="86" stroke="#ff5c5c" stroke-width="1.5"/>
      <rect x="42" y="48" width="50" height="10" fill="rgba(13,15,20,0.9)" rx="2"/>
      <text x="44" y="56" fill="#f5a623" font-size="7" font-family="monospace">OB = deze kaars</text>
    </g>
    <g class="ob3">
      <rect x="46" y="58" width="150" height="26" fill="rgba(245,166,35,0.1)" rx="2"/>
      <line x1="46" y1="58" x2="196" y2="58" stroke="#f5a623" stroke-width="1" stroke-dasharray="4,3"/>
      <line x1="46" y1="84" x2="196" y2="84" stroke="#f5a623" stroke-width="1" stroke-dasharray="4,3"/>
      <rect x="65" y="30" width="13" height="30" fill="#ff5c5c" rx="1"/><line x1="71" y1="26" x2="71" y2="62" stroke="#ff5c5c" stroke-width="2"/>
      <rect x="84" y="50" width="9" height="28" fill="#ff5c5c" rx="1"/><line x1="88" y1="47" x2="88" y2="80" stroke="#ff5c5c" stroke-width="1"/>
      <rect x="99" y="68" width="9" height="26" fill="#ff5c5c" rx="1"/><line x1="103" y1="65" x2="103" y2="96" stroke="#ff5c5c" stroke-width="1"/>
    </g>
    <g class="ob4">
      <rect x="118" y="80" width="9" height="22" fill="#2ecc8a" rx="1"/><line x1="122" y1="77" x2="122" y2="104" stroke="#2ecc8a" stroke-width="1"/>
      <rect x="133" y="68" width="9" height="20" fill="#2ecc8a" rx="1"/><line x1="137" y1="65" x2="137" y2="90" stroke="#2ecc8a" stroke-width="1.5"/>
      <rect x="148" y="60" width="9" height="10" fill="#ff5c5c" rx="1"/><line x1="152" y1="56" x2="152" y2="72" stroke="#ff5c5c" stroke-width="1.5"/>
      <rect x="148" y="56" width="46" height="10" fill="rgba(13,15,20,0.9)" rx="2"/>
      <text x="150" y="64" fill="#4f9eff" font-size="7" font-family="monospace">Retest OB!</text>
    </g>
    <g class="ob5">
      <circle cx="152" cy="70" r="5" fill="none" stroke="#f5a623" stroke-width="2"/>
      <rect x="160" y="64" width="56" height="10" fill="rgba(13,15,20,0.9)" rx="2"/>
      <text x="162" y="72" fill="#f5a623" font-size="7" font-family="monospace">Short entry!</text>
      <rect x="163" y="82" width="9" height="26" fill="#ff5c5c" rx="1"/><line x1="167" y1="78" x2="167" y2="110" stroke="#ff5c5c" stroke-width="1"/>
      <rect x="178" y="96" width="9" height="26" fill="#ff5c5c" rx="1"/><line x1="182" y1="92" x2="182" y2="124" stroke="#ff5c5c" stroke-width="1"/>
      <rect x="5" y="157" width="292" height="14" fill="#0d0f14"/>
      <text x="6" y="168" fill="#f5a623" font-size="7" font-family="monospace">Laatste rode kaars vóór impulse = OB zone → retest = entry</text>
    </g>
  </svg>`,

  bos: `<svg viewBox="0 0 300 175" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:175px;"><style>@keyframes bs{from{opacity:0}to{opacity:1}}.bs0{opacity:0;animation:bs .4s ease .1s forwards}.bs1{opacity:0;animation:bs .4s ease .5s forwards}.bs2{opacity:0;animation:bs .4s ease 1.0s forwards}.bs3{opacity:0;animation:bs .5s ease 1.7s forwards}.bs4{opacity:0;animation:bs .4s ease 2.4s forwards}.bs5{opacity:0;animation:bs .5s ease 3.1s forwards}</style>
    <rect width="300" height="175" fill="#0d0f14" rx="8"/>
    <g class="bs0"><text x="10" y="14" fill="#2ecc8a" font-size="9" font-family="monospace" font-weight="bold">Break of Structure (BOS)</text></g>
    <g class="bs1">
      <circle cx="22" cy="128" r="3" fill="#4f9eff"/>
      <line x1="22" y1="128" x2="58" y2="92" stroke="#2ecc8a" stroke-width="2"/>
      <circle cx="58" cy="92" r="3" fill="#2ecc8a"/>
      <rect x="49" y="85" width="28" height="10" fill="rgba(13,15,20,0.9)" rx="2"/>
      <text x="51" y="93" fill="#2ecc8a" font-size="8" font-family="monospace">HH1</text>
    </g>
    <g class="bs2">
      <line x1="58" y1="92" x2="85" y2="108" stroke="#ff5c5c" stroke-width="1.5"/>
      <circle cx="85" cy="108" r="3" fill="#4f9eff"/>
      <rect x="75" y="114" width="28" height="10" fill="rgba(13,15,20,0.9)" rx="2"/>
      <text x="77" y="122" fill="#4f9eff" font-size="8" font-family="monospace">HL1</text>
    </g>
    <g class="bs3">
      <line x1="58" y1="92" x2="240" y2="92" stroke="rgba(46,204,138,0.35)" stroke-width="1" stroke-dasharray="4,3"/>
      <line x1="85" y1="108" x2="120" y2="68" stroke="#2ecc8a" stroke-width="2"/>
      <circle cx="120" cy="68" r="3" fill="#2ecc8a"/>
      <rect x="104" y="61" width="28" height="10" fill="rgba(13,15,20,0.9)" rx="2"/>
      <text x="106" y="69" fill="#2ecc8a" font-size="8" font-family="monospace">HH2</text>
      <rect x="108" y="78" width="30" height="12" fill="rgba(46,204,138,0.2)" rx="3"/>
      <text x="110" y="88" fill="#2ecc8a" font-size="8" font-family="monospace" font-weight="bold">BOS!</text>
    </g>
    <g class="bs4">
      <line x1="120" y1="68" x2="152" y2="86" stroke="#ff5c5c" stroke-width="1.5"/>
      <circle cx="152" cy="86" r="4" fill="#f5a623"/>
      <rect x="154" y="80" width="44" height="10" fill="rgba(13,15,20,0.9)" rx="2"/>
      <text x="156" y="88" fill="#f5a623" font-size="7" font-family="monospace">Entry op HL!</text>
      <circle cx="85" cy="108" r="5" fill="none" stroke="#f5a623" stroke-width="1.5"/>
      <circle cx="152" cy="86" r="5" fill="none" stroke="#f5a623" stroke-width="1.5"/>
    </g>
    <g class="bs5">
      <line x1="152" y1="86" x2="195" y2="46" stroke="#2ecc8a" stroke-width="2"/>
      <circle cx="195" cy="46" r="3" fill="#2ecc8a"/>
      <rect x="186" y="39" width="28" height="10" fill="rgba(13,15,20,0.9)" rx="2"/>
      <text x="188" y="47" fill="#2ecc8a" font-size="8" font-family="monospace">HH3</text>
      <rect x="186" y="56" width="30" height="12" fill="rgba(46,204,138,0.2)" rx="3"/>
      <text x="188" y="66" fill="#2ecc8a" font-size="8" font-family="monospace" font-weight="bold">BOS!</text>
      <rect x="5" y="157" width="292" height="14" fill="#0d0f14"/>
      <text x="6" y="168" fill="#2ecc8a" font-size="7" font-family="monospace">BOS = nieuw HH → trend gaat door → koop bij pullback HL</text>
    </g>
  </svg>`,

  choch: `<svg viewBox="0 0 300 175" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:175px;"><style>@keyframes cc{from{opacity:0}to{opacity:1}}.cc0{opacity:0;animation:cc .4s ease .1s forwards}.cc1{opacity:0;animation:cc .4s ease .5s forwards}.cc2{opacity:0;animation:cc .4s ease 1.0s forwards}.cc3{opacity:0;animation:cc .5s ease 1.7s forwards}.cc4{opacity:0;animation:cc .5s ease 2.5s forwards}.cc5{opacity:0;animation:cc .5s ease 3.3s forwards}</style>
    <rect width="300" height="175" fill="#0d0f14" rx="8"/>
    <g class="cc0"><text x="10" y="14" fill="#f5a623" font-size="9" font-family="monospace" font-weight="bold">Change of Character (ChoCH)</text></g>
    <g class="cc1">
      <circle cx="20" cy="38" r="3" fill="#ff5c5c"/>
      <rect x="12" y="30" width="26" height="10" fill="rgba(13,15,20,0.9)" rx="2"/>
      <text x="14" y="38" fill="#ff5c5c" font-size="8" font-family="monospace">LH1</text>
      <line x1="20" y1="38" x2="52" y2="75" stroke="#ff5c5c" stroke-width="1.5"/>
      <circle cx="52" cy="75" r="3" fill="#4f9eff"/>
      <rect x="42" y="80" width="28" height="10" fill="rgba(13,15,20,0.9)" rx="2"/>
      <text x="44" y="88" fill="#4f9eff" font-size="8" font-family="monospace">LL1</text>
    </g>
    <g class="cc2">
      <line x1="52" y1="75" x2="82" y2="52" stroke="#2ecc8a" stroke-width="1.5"/>
      <circle cx="82" cy="52" r="3" fill="#ff5c5c"/>
      <rect x="74" y="44" width="26" height="10" fill="rgba(13,15,20,0.9)" rx="2"/>
      <text x="76" y="52" fill="#ff5c5c" font-size="8" font-family="monospace">LH2</text>
      <line x1="82" y1="52" x2="115" y2="92" stroke="#ff5c5c" stroke-width="1.5"/>
      <circle cx="115" cy="92" r="3" fill="#4f9eff"/>
      <rect x="105" y="98" width="28" height="10" fill="rgba(13,15,20,0.9)" rx="2"/>
      <text x="107" y="106" fill="#4f9eff" font-size="8" font-family="monospace">LL2</text>
    </g>
    <g class="cc3">
      <line x1="82" y1="52" x2="260" y2="52" stroke="#f5a623" stroke-width="1" stroke-dasharray="4,3"/>
      <rect x="225" y="44" width="40" height="10" fill="rgba(13,15,20,0.9)" rx="2"/>
      <text x="227" y="52" fill="#f5a623" font-size="7" font-family="monospace">LH niveau</text>
    </g>
    <g class="cc4">
      <line x1="115" y1="92" x2="152" y2="44" stroke="#2ecc8a" stroke-width="2.5"/>
      <circle cx="152" cy="44" r="5" fill="#f5a623"/>
      <rect x="154" y="36" width="46" height="10" fill="rgba(13,15,20,0.9)" rx="2"/>
      <text x="156" y="44" fill="#f5a623" font-size="7" font-family="monospace" font-weight="bold">ChoCH!</text>
      <text x="156" y="55" fill="#f5a623" font-size="6" font-family="monospace">breekt LH2!</text>
    </g>
    <g class="cc5">
      <line x1="152" y1="44" x2="182" y2="64" stroke="#ff5c5c" stroke-width="1.5"/>
      <circle cx="182" cy="64" r="3" fill="#4f9eff"/>
      <rect x="184" y="58" width="28" height="10" fill="rgba(13,15,20,0.9)" rx="2"/>
      <text x="186" y="66" fill="#4f9eff" font-size="8" font-family="monospace">HL</text>
      <circle cx="182" cy="64" r="5" fill="none" stroke="#f5a623" stroke-width="1.5"/>
      <line x1="182" y1="64" x2="230" y2="28" stroke="#2ecc8a" stroke-width="2"/>
      <circle cx="230" cy="28" r="3" fill="#2ecc8a"/>
      <rect x="232" y="22" width="28" height="10" fill="rgba(13,15,20,0.9)" rx="2"/>
      <text x="234" y="30" fill="#2ecc8a" font-size="8" font-family="monospace">HH</text>
      <rect x="5" y="157" width="292" height="14" fill="#0d0f14"/>
      <text x="6" y="168" fill="#f5a623" font-size="7" font-family="monospace">ChoCH breekt LH → nieuwe uptrend start → entry op HL</text>
    </g>
  </svg>`,

  premiumdiscount: `<svg viewBox="0 0 300 175" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:175px;"><style>@keyframes pd{from{opacity:0}to{opacity:1}}.pd0{opacity:0;animation:pd .4s ease .1s forwards}.pd1{opacity:0;animation:pd .5s ease .5s forwards}.pd2{opacity:0;animation:pd .5s ease 1.2s forwards}.pd3{opacity:0;animation:pd .5s ease 2.0s forwards}.pd4{opacity:0;animation:pd .5s ease 2.8s forwards}</style>
    <rect width="300" height="175" fill="#0d0f14" rx="8"/>
    <g class="pd0"><text x="10" y="14" fill="#4f9eff" font-size="9" font-family="monospace" font-weight="bold">Premium &amp; Discount Zones</text></g>
    <g class="pd1">
      <line x1="15" y1="32" x2="220" y2="32" stroke="#2ecc8a" stroke-width="1.5"/>
      <rect x="222" y="26" width="72" height="10" fill="rgba(13,15,20,0.9)" rx="2"/>
      <text x="224" y="34" fill="#2ecc8a" font-size="7" font-family="monospace">Swing High 100%</text>
      <line x1="15" y1="122" x2="220" y2="122" stroke="#ff5c5c" stroke-width="1.5"/>
      <rect x="222" y="116" width="70" height="10" fill="rgba(13,15,20,0.9)" rx="2"/>
      <text x="224" y="124" fill="#ff5c5c" font-size="7" font-family="monospace">Swing Low   0%</text>
    </g>
    <g class="pd2">
      <line x1="15" y1="77" x2="220" y2="77" stroke="#f5a623" stroke-width="1.5" stroke-dasharray="5,3"/>
      <rect x="222" y="71" width="70" height="10" fill="rgba(13,15,20,0.9)" rx="2"/>
      <text x="224" y="79" fill="#f5a623" font-size="7" font-family="monospace">EQ Midpoint 50%</text>
      <rect x="15" y="32" width="205" height="45" fill="rgba(255,92,92,0.07)" rx="0"/>
      <text x="22" y="58" fill="#ff5c5c" font-size="10" font-family="monospace" font-weight="bold">PREMIUM</text>
      <text x="22" y="70" fill="#ff5c5c" font-size="7" font-family="monospace">→ Zoek shorts</text>
      <rect x="15" y="77" width="205" height="45" fill="rgba(46,204,138,0.07)" rx="0"/>
      <text x="22" y="100" fill="#2ecc8a" font-size="10" font-family="monospace" font-weight="bold">DISCOUNT</text>
      <text x="22" y="112" fill="#2ecc8a" font-size="7" font-family="monospace">→ Zoek longs</text>
    </g>
    <g class="pd3">
      <polyline points="235,32 240,48 234,40 238,65 232,55 236,77 230,92 238,108 226,100 230,122" fill="none" stroke="#4f9eff" stroke-width="1.5"/>
      <circle cx="236" cy="77" r="4" fill="none" stroke="#f5a623" stroke-width="1.5"/>
      <circle cx="230" cy="92" r="4" fill="#2ecc8a" opacity="0.8"/>
    </g>
    <g class="pd4">
      <rect x="240" y="86" width="50" height="10" fill="rgba(13,15,20,0.9)" rx="2"/>
      <text x="242" y="94" fill="#2ecc8a" font-size="8" font-family="monospace" font-weight="bold">Long!</text>
      <rect x="5" y="157" width="292" height="14" fill="#0d0f14"/>
      <text x="6" y="168" fill="#4f9eff" font-size="7" font-family="monospace">Koop goedkoop (discount) · Verkoop duur (premium)</text>
    </g>
  </svg>`,

  inducement: `<svg viewBox="0 0 300 175" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:175px;"><style>@keyframes id{from{opacity:0}to{opacity:1}}.id0{opacity:0;animation:id .4s ease .1s forwards}.id1{opacity:0;animation:id .4s ease .5s forwards}.id2{opacity:0;animation:id .5s ease 1.1s forwards}.id3{opacity:0;animation:id .5s ease 1.9s forwards}.id4{opacity:0;animation:id .5s ease 2.8s forwards}.id5{opacity:0;animation:id .5s ease 3.6s forwards}</style>
    <rect width="300" height="175" fill="#0d0f14" rx="8"/>
    <g class="id0"><text x="10" y="14" fill="#ff5c5c" font-size="9" font-family="monospace" font-weight="bold">Inducement (IDM) — valse pullback</text></g>
    <g class="id1">
      <line x1="15" y1="128" x2="55" y2="88" stroke="#2ecc8a" stroke-width="2"/>
      <circle cx="55" cy="88" r="3" fill="#2ecc8a"/>
      <rect x="46" y="81" width="28" height="10" fill="rgba(13,15,20,0.9)" rx="2"/>
      <text x="48" y="89" fill="#2ecc8a" font-size="8" font-family="monospace">HH1</text>
    </g>
    <g class="id2">
      <line x1="55" y1="88" x2="85" y2="105" stroke="#ff5c5c" stroke-width="1.5"/>
      <circle cx="85" cy="105" r="4" fill="#f5a623"/>
      <rect x="74" y="110" width="26" height="10" fill="rgba(13,15,20,0.9)" rx="2"/>
      <text x="76" y="118" fill="#f5a623" font-size="8" font-family="monospace">IDM</text>
      <line x1="85" y1="105" x2="220" y2="105" stroke="#f5a623" stroke-width="1" stroke-dasharray="3,2" opacity="0.6"/>
    </g>
    <g class="id3">
      <line x1="85" y1="105" x2="115" y2="82" stroke="#2ecc8a" stroke-width="1.5"/>
      <circle cx="115" cy="82" r="3" fill="#2ecc8a"/>
      <line x1="115" y1="82" x2="136" y2="108" stroke="#ff5c5c" stroke-width="2"/>
      <circle cx="136" cy="108" r="4" fill="#ff5c5c"/>
      <rect x="138" y="110" width="64" height="10" fill="rgba(13,15,20,0.9)" rx="2"/>
      <text x="140" y="118" fill="#ff5c5c" font-size="7" font-family="monospace">SWEEP IDM!</text>
    </g>
    <g class="id4">
      <line x1="136" y1="108" x2="175" y2="66" stroke="#2ecc8a" stroke-width="2.5"/>
      <circle cx="175" cy="66" r="3" fill="#2ecc8a"/>
      <rect x="166" y="59" width="28" height="10" fill="rgba(13,15,20,0.9)" rx="2"/>
      <text x="168" y="67" fill="#2ecc8a" font-size="8" font-family="monospace">HH2</text>
      <rect x="130" y="76" width="30" height="12" fill="rgba(46,204,138,0.2)" rx="3"/>
      <text x="132" y="86" fill="#2ecc8a" font-size="8" font-family="monospace" font-weight="bold">BOS!</text>
    </g>
    <g class="id5">
      <line x1="175" y1="66" x2="200" y2="82" stroke="#ff5c5c" stroke-width="1.5"/>
      <circle cx="200" cy="82" r="4" fill="none" stroke="#f5a623" stroke-width="1.5"/>
      <rect x="202" y="76" width="56" height="10" fill="rgba(13,15,20,0.9)" rx="2"/>
      <text x="204" y="84" fill="#f5a623" font-size="7" font-family="monospace">Entry long!</text>
      <line x1="200" y1="82" x2="245" y2="44" stroke="#2ecc8a" stroke-width="2"/>
      <circle cx="245" cy="44" r="3" fill="#2ecc8a"/>
      <rect x="5" y="157" width="292" height="14" fill="#0d0f14"/>
      <text x="6" y="168" fill="#f5a623" font-size="7" font-family="monospace">IDM sweep → BOS → entry mét de trend op HL</text>
    </g>
  </svg>`,

  stoploss: `<svg viewBox="0 0 300 175" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:175px;"><style>@keyframes sl{from{opacity:0}to{opacity:1}}.sl0{opacity:0;animation:sl .4s ease .1s forwards}.sl1{opacity:0;animation:sl .4s ease .5s forwards}.sl2{opacity:0;animation:sl .4s ease 1.0s forwards}.sl3{opacity:0;animation:sl .5s ease 1.6s forwards}.sl4{opacity:0;animation:sl .4s ease 2.4s forwards}.sl5{opacity:0;animation:sl .5s ease 3.1s forwards}</style>
    <rect width="300" height="175" fill="#0d0f14" rx="8"/>
    <g class="sl0"><text x="10" y="14" fill="#ff5c5c" font-size="9" font-family="monospace" font-weight="bold">Stop-loss — bescherm je kapitaal</text></g>
    <line x1="150" y1="20" x2="150" y2="152" stroke="rgba(255,255,255,0.1)" stroke-width="1"/>
    <text x="30" y="26" fill="#2ecc8a" font-size="7" font-family="monospace">MET stop-loss</text>
    <text x="165" y="26" fill="#ff5c5c" font-size="7" font-family="monospace">ZONDER stop-loss</text>
    <g class="sl1">
      <rect x="30" y="62" width="10" height="22" fill="#2ecc8a" rx="1"/><line x1="35" y1="59" x2="35" y2="86" stroke="#2ecc8a" stroke-width="1.2"/>
      <rect x="47" y="58" width="10" height="20" fill="#2ecc8a" rx="1"/><line x1="52" y1="55" x2="52" y2="80" stroke="#2ecc8a" stroke-width="1.2"/>
      <rect x="165" y="62" width="10" height="22" fill="#2ecc8a" rx="1"/><line x1="170" y1="59" x2="170" y2="86" stroke="#2ecc8a" stroke-width="1.2"/>
      <rect x="182" y="58" width="10" height="20" fill="#2ecc8a" rx="1"/><line x1="187" y1="55" x2="187" y2="80" stroke="#2ecc8a" stroke-width="1.2"/>
    </g>
    <g class="sl2">
      <line x1="20" y1="100" x2="140" y2="100" stroke="#ff5c5c" stroke-width="1.2" stroke-dasharray="4,3"/>
      <rect x="22" y="93" width="16" height="11" fill="rgba(13,15,20,0.9)" rx="2"/>
      <text x="24" y="102" fill="#ff5c5c" font-size="7" font-family="monospace">SL</text>
    </g>
    <g class="sl3">
      <rect x="64" y="88" width="10" height="24" fill="#ff5c5c" rx="1"/><line x1="69" y1="84" x2="69" y2="114" stroke="#ff5c5c" stroke-width="1.5"/>
      <circle cx="69" cy="100" r="4" fill="#f5a623" opacity="0.8"/>
      <rect x="76" y="96" width="56" height="11" fill="rgba(13,15,20,0.9)" rx="2"/>
      <text x="78" y="105" fill="#f5a623" font-size="7" font-family="monospace">→ Gestopt! −€40</text>
      <rect x="64" y="116" width="65" height="22" fill="rgba(46,204,138,0.08)" rx="4"/>
      <text x="68" y="127" fill="#2ecc8a" font-size="7" font-family="monospace">Kapitaal veilig!</text>
      <text x="68" y="134" fill="#2ecc8a" font-size="6" font-family="monospace">Volgende trade ok</text>
    </g>
    <g class="sl4">
      <rect x="199" y="88" width="10" height="24" fill="#ff5c5c" rx="1"/><line x1="204" y1="84" x2="204" y2="114" stroke="#ff5c5c" stroke-width="1.5"/>
      <rect x="216" y="100" width="10" height="30" fill="#ff5c5c" rx="1"/><line x1="221" y1="96" x2="221" y2="132" stroke="#ff5c5c" stroke-width="1.5"/>
      <rect x="233" y="108" width="10" height="36" fill="#ff5c5c" rx="1"/><line x1="238" y1="104" x2="238" y2="146" stroke="#ff5c5c" stroke-width="2"/>
    </g>
    <g class="sl5">
      <rect x="199" y="120" width="65" height="22" fill="rgba(255,92,92,0.1)" rx="4"/>
      <text x="203" y="131" fill="#ff5c5c" font-size="7" font-family="monospace">−€200 en groeit!</text>
      <text x="203" y="139" fill="#ff5c5c" font-size="6" font-family="monospace">Account beschadigd</text>
      <rect x="5" y="157" width="292" height="14" fill="#0d0f14"/>
      <text x="6" y="168" fill="#ff5c5c" font-size="7" font-family="monospace">Stop-loss = verplicht bij elke trade — altijd instellen</text>
    </g>
  </svg>`,
};

function openLearnModal(itemId) {
  const l = currentLang;
  const item = LEARN_DATA.find(i => i.id === itemId);
  if(!item) return;
  const d = item[l] || item['NL'];
  const col = CAT_COLORS[item.cat] || 'var(--accent)';
  const icon = CAT_ICONS[item.cat] || '●';
  const bodyHtml = (d.body||'').replace(/\n/g, '<br>');
  const staticChart  = STRATEGY_CHARTS[item.id]  || '';
  const animChart    = ANIMATED_CHARTS[item.id]   || '';
  const hasAnim      = !!animChart;
  let   showAnim     = hasAnim; // default: toon animatie als beschikbaar
  const chart        = showAnim ? animChart : staticChart;

  const inner = $('learnModalInner');
  if(!inner) return;

  function buildModal(useAnim){
    const ch = (useAnim && animChart) ? animChart : staticChart;
    inner.innerHTML = `
    <!-- Modal header -->
    <div style="display:flex;align-items:center;justify-content:space-between;padding:20px 24px 16px;border-bottom:1px solid var(--border);border-radius:18px 18px 0 0;background:var(--surface);position:sticky;top:0;z-index:1;">
      <div style="display:flex;align-items:center;gap:10px;">
        <span style="font-size:20px;">${icon}</span>
        <div>
          <div style="font-family:var(--font-head);font-weight:800;font-size:17px;color:var(--text);">${d.term}</div>
          <div style="font-size:11px;color:var(--muted);margin-top:2px;">${d.short}</div>
        </div>
      </div>
      <div style="display:flex;gap:6px;align-items:center;">
        ${hasAnim ? `<button onclick="replayLearnAnim()" title="Replay animatie" style="background:var(--surface2);border:1px solid var(--border);border-radius:8px;color:var(--accent);cursor:pointer;font-size:13px;padding:4px 10px;">▶ Replay</button>` : ''}
        <button onclick="closeLearnModal()" style="background:var(--surface2);border:1px solid var(--border);border-radius:8px;color:var(--muted);cursor:pointer;font-size:18px;padding:4px 10px;line-height:1;flex-shrink:0;">✕</button>
      </div>
    </div>

    <!-- Chart -->
    ${ch ? `<div id="learnChartContainer" onclick="openChartLightbox('${item.id}','${d.term}')" title="Klik om te vergroten" style="padding:16px 24px 0;position:relative;">
      ${ch}
      <div style="position:absolute;bottom:24px;right:32px;background:rgba(13,15,20,0.75);border:1px solid var(--border);border-radius:6px;padding:2px 8px;font-size:9px;color:var(--muted);font-family:var(--font-head);pointer-events:none;letter-spacing:.4px;">🔍 klik om te vergroten</div>
    </div>` : ''}

    <!-- Body -->
    <div style="padding:16px 24px 0;font-size:13px;color:var(--text);line-height:1.9;">
      ${bodyHtml}
    </div>

    <!-- Voorbeeld -->
    ${d.example ? `
    <div style="margin:16px 24px 0;padding:14px 16px;background:var(--surface2);border-radius:10px;border-left:4px solid ${col};">
      <div style="font-family:var(--font-head);font-weight:700;font-size:11px;color:${col};margin-bottom:6px;text-transform:uppercase;letter-spacing:.5px;">📌 Voorbeeld</div>
      <div style="font-size:12px;color:var(--muted);line-height:1.8;">${d.example}</div>
    </div>` : ''}

    <div style="height:24px;"></div>
  `;}

  buildModal(showAnim);

  const modal = $('learnModal');
  if(modal){ modal.style.display='flex'; document.body.style.overflow='hidden'; }
}

function replayLearnAnim(){
  const c = $('learnChartContainer');
  if(!c) return;
  // Bewaar alleen de SVG, niet de badge
  const svg = c.querySelector('svg');
  if(!svg) return;
  const html = svg.outerHTML;
  const svgContainer = svg.parentElement || c;
  svgContainer.innerHTML = '';
  requestAnimationFrame(() => { svgContainer.innerHTML = html; });
}

function openChartLightbox(itemId, title){
  const animChart  = ANIMATED_CHARTS[itemId]  || '';
  const staticChart = STRATEGY_CHARTS[itemId] || '';
  const ch = animChart || staticChart;
  if(!ch) return;

  const overlay = $('chartZoomOverlay');
  const content = $('chartZoomContent');
  const titleEl = $('chartZoomTitle');
  const replayBtn = $('chartZoomReplay');

  if(!overlay || !content) return;

  titleEl.textContent = title || '';
  content.innerHTML = ch;

  // Replay knop alleen voor geanimeerde charts
  if(animChart){
    replayBtn.style.display = 'inline-block';
    replayBtn.onclick = () => {
      const html = animChart;
      content.innerHTML = '';
      requestAnimationFrame(() => { content.innerHTML = html; });
    };
  } else {
    replayBtn.style.display = 'none';
  }

  overlay.classList.add('show');
  document.body.style.overflow = 'hidden';
}

function closeChartLightbox(){
  const overlay = $('chartZoomOverlay');
  if(overlay) overlay.classList.remove('show');
  document.body.style.overflow = '';
}

function closeLearnModal(){
  const modal = $('learnModal');
  if(modal){ modal.style.display='none'; document.body.style.overflow=''; }
}
document.addEventListener('click', e => {
  const m = $('learnModal');
  if(m && e.target === m) closeLearnModal();
});

function renderLearnCards(cat, query) {
  // Candlestick categorie heeft eigen renderer
  if(cat === 'candlesticks') { renderCandleCards(query); return; }
  const l = currentLang;
  const q = (query||'').toLowerCase().trim();
  const grid = $('learnGrid');
  const noRes = $('learnNoResults');
  const noResTerm = $('learnSearchTerm');
  if(!grid) return;

  let items = LEARN_DATA;
  if(cat && cat !== 'all') items = items.filter(i => i.cat === cat);
  if(q) items = items.filter(i => {
    const d = i[l] || i['NL'];
    return (d.term||'').toLowerCase().includes(q) ||
           (d.short||'').toLowerCase().includes(q) ||
           (d.body||'').toLowerCase().includes(q);
  });

  if(!items.length) {
    grid.innerHTML = '';
    if(noRes) noRes.style.display = 'block';
    if(noResTerm) noResTerm.textContent = query;
    return;
  }
  if(noRes) noRes.style.display = 'none';

  grid.innerHTML = items.map(item => {
    const d = item[l] || item['NL'];
    const col = CAT_COLORS[item.cat] || 'var(--accent)';
    const icon = CAT_ICONS[item.cat] || '●';
    const hasChart = !!STRATEGY_CHARTS[item.id];
    return `<div style="background:var(--surface);border:1px solid var(--border);border-radius:12px;overflow:hidden;display:flex;flex-direction:column;cursor:pointer;transition:border-color .15s;" onclick="openLearnModal('${item.id}')" onmouseenter="this.style.borderColor='${col}'" onmouseleave="this.style.borderColor='var(--border)'">
      <div style="padding:16px 18px 14px;border-left:4px solid ${col};">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
          <span style="font-size:16px;">${icon}</span>
          <span style="font-family:var(--font-head);font-weight:800;font-size:15px;color:var(--text);">${d.term}</span>
          <span style="font-size:10px;padding:2px 8px;border-radius:4px;background:${col}22;color:${col};border:1px solid ${col}44;font-family:var(--font-head);font-weight:700;text-transform:uppercase;letter-spacing:0.5px;margin-left:auto;">${item.cat}</span>
        </div>
        <div style="font-size:12px;color:var(--muted);line-height:1.5;margin-bottom:10px;">${d.short}</div>
        <div style="display:flex;align-items:center;gap:6px;font-size:11px;color:${col};font-family:var(--font-head);font-weight:700;">
          <span>▸ Meer uitleg</span>
        </div>
      </div>
    </div>`;
  }).join('');
}

// ---- FINAL INIT ----
updateBackupInfo();
loadGdriveConfig();
loadSavedInstrument();
loadApiKey();
updateKeyLevelsBar();
loadLang();
renderLearnCards('all', '');
renderCalendar();
renderAccountSelects();
renderAccountsList();
// Drive startup modal (alleen als niet al verbonden via loadGdriveConfig)
setTimeout(() => {
  if(!gdriveToken) checkDriveStartup();
}, 1500);
// Instrument info banner alleen tonen op voorbereiding (actieve tab bij start)
const _infoBanner = $('instrumentInfoBanner');
if(_infoBanner) _infoBanner.style.display = 'flex';

// ================================================================
// STATISTIEKEN DASHBOARD
// ================================================================
function renderStats(){
  const t = trades.filter(t => t.result !== 'open');
  const el = id => $(id);

  // ---- KPI's ----
  const wins   = t.filter(x => x.result === 'win');
  const losses = t.filter(x => x.result === 'loss');
  const wr     = t.length ? (wins.length / t.length * 100) : 0;
  const totalPnl = t.reduce((s, x) => s + (x.pnl || 0), 0);
  const avgRR  = t.length ? t.reduce((s, x) => s + (x.rr || 0), 0) / t.length : 0;
  const grossW = wins.reduce((s, x) => s + (x.pnl || 0), 0);
  const grossL = Math.abs(losses.reduce((s, x) => s + (x.pnl || 0), 0));
  const pf     = grossL > 0 ? grossW / grossL : grossW > 0 ? Infinity : 0;
  const expect = t.length ? totalPnl / t.length : 0;

  const set = (id, txt, color) => {
    const el = $(id); if(!el) return;
    el.textContent = txt;
    if(color) el.style.color = color;
  };

  const pnlColor = totalPnl >= 0 ? 'var(--green)' : 'var(--red)';
  const wrColor  = wr >= 50 ? 'var(--green)' : wr >= 40 ? 'var(--amber)' : 'var(--red)';

  set('skTrades',  t.length);
  set('skWinrate', t.length ? wr.toFixed(1) + '%' : '—', wrColor);
  set('skPnl',     t.length ? (totalPnl >= 0 ? '+' : '') + '€' + totalPnl.toFixed(0) : '—', pnlColor);
  set('skAvgRR',   t.length ? '1 : ' + avgRR.toFixed(2) : '—');
  set('skPF',      t.length ? (pf === Infinity ? '∞' : pf.toFixed(2)) : '—', pf >= 1 ? 'var(--green)' : 'var(--red)');
  set('skExpect',  t.length ? (expect >= 0 ? '+' : '') + '€' + expect.toFixed(1) + '/R' : '—', expect >= 0 ? 'var(--green)' : 'var(--red)');

  if(!t.length){
    ['statsByPair','statsByDay','statsByDir','statsByEdge','statsByResult','statsMonthly','streakBox','streakDetail','statsBySession','statsByHour','statsDrawdown','statsAvgWL','statsRDist']
      .forEach(id => { const e=$(id); if(e) e.innerHTML='<div class="no-data-msg">Nog geen afgesloten trades.</div>'; });
    const svg = $('equitySvg'); if(svg) svg.innerHTML='';
    return;
  }

  // ---- Equity curve met assen ----
  const sorted = [...t].sort((a,b) => a.date.localeCompare(b.date));
  let cum = 0;
  const points = sorted.map(x => { cum += (x.pnl||0); return cum; });
  const svgEl = $('equitySvg');
  if(svgEl){
    const W = 600, H = 180;
    const padL = 52, padR = 16, padT = 14, padB = 28;
    const innerW = W - padL - padR, innerH = H - padT - padB;
    const minV = Math.min(0, ...points), maxV = Math.max(0, ...points);
    const range = maxV - minV || 1;
    const xStep = points.length > 1 ? innerW / (points.length - 1) : innerW;
    const toX = i => padL + i * xStep;
    const toY = v => padT + (1 - (v - minV) / range) * innerH;
    const zero = toY(0);
    const lineColor = points[points.length-1] >= 0 ? '#2ecc8a' : '#ff5c5c';
    const fillId = 'eqGrad2';

    // Y-as labels (4 niveaus)
    const yTicks = 4;
    let yLabels = '';
    for(let i = 0; i <= yTicks; i++){
      const val = minV + (range * i / yTicks);
      const y = toY(val);
      const label = (val >= 0 ? '+' : '') + '€' + val.toFixed(0);
      const color = val > 0 ? '#2ecc8a' : val < 0 ? '#ff5c5c' : 'var(--muted)';
      yLabels += `<text x="${padL - 6}" y="${y + 4}" text-anchor="end" font-size="9" fill="${color}" font-family="monospace">${label}</text>`;
      yLabels += `<line x1="${padL}" y1="${y}" x2="${W - padR}" y2="${y}" stroke="var(--border)" stroke-width="0.5" stroke-dasharray="3,3"/>`;
    }

    // X-as labels (max 6 datums)
    let xLabels = '';
    const step = Math.max(1, Math.floor(points.length / 6));
    for(let i = 0; i < points.length; i += step){
      const x = toX(i);
      const date = sorted[i]?.date?.slice(5) || ''; // MM-DD
      xLabels += `<text x="${x}" y="${H - 6}" text-anchor="middle" font-size="9" fill="var(--muted)" font-family="monospace">${date}</text>`;
    }

    let d = `M${toX(0)},${toY(points[0])}`;
    points.forEach((v, i) => { if(i > 0) d += ` L${toX(i)},${toY(v)}`; });
    const fillPath = d + ` L${toX(points.length-1)},${zero} L${toX(0)},${zero} Z`;

    svgEl.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svgEl.innerHTML = `
      <defs>
        <linearGradient id="${fillId}" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="${lineColor}" stop-opacity="0.3"/>
          <stop offset="100%" stop-color="${lineColor}" stop-opacity="0.02"/>
        </linearGradient>
      </defs>
      ${yLabels}
      ${xLabels}
      <line x1="${padL}" y1="${padT}" x2="${padL}" y2="${H - padB}" stroke="var(--border)" stroke-width="1"/>
      <line x1="${padL}" y1="${zero}" x2="${W - padR}" y2="${zero}" stroke="var(--border2)" stroke-width="1"/>
      <path d="${fillPath}" fill="url(#${fillId})"/>
      <path d="${d}" fill="none" stroke="${lineColor}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
      <circle cx="${toX(points.length-1)}" cy="${toY(points[points.length-1])}" r="4" fill="${lineColor}"/>
    `;
  }

  // ---- Streaks ----
  let maxWS=0,maxLS=0,curW=0,curL=0,bestT=null,worstT=null;
  sorted.forEach(x => {
    if(x.result==='win'){ curW++; curL=0; maxWS=Math.max(maxWS,curW); }
    else if(x.result==='loss'){ curL++; curW=0; maxLS=Math.max(maxLS,curL); }
    if(bestT===null || (x.pnl||0) > (bestT.pnl||0)) bestT=x;
    if(worstT===null || (x.pnl||0) < (worstT.pnl||0)) worstT=x;
  });
  const streakBox = $('streakBox');
  if(streakBox) streakBox.innerHTML = `
    <div class="streak-item"><div class="streak-val" style="color:var(--green)">${maxWS}</div><div class="streak-lbl">Max wins op rij</div></div>
    <div class="streak-item"><div class="streak-val" style="color:var(--red)">${maxLS}</div><div class="streak-lbl">Max losses op rij</div></div>
    <div class="streak-item"><div class="streak-val" style="color:var(--green)">+€${(bestT?.pnl||0).toFixed(0)}</div><div class="streak-lbl">Beste trade</div></div>
    <div class="streak-item"><div class="streak-val" style="color:var(--red)">€${(worstT?.pnl||0).toFixed(0)}</div><div class="streak-lbl">Slechtste trade</div></div>
  `;
  const streakDetail = $('streakDetail');
  if(streakDetail) streakDetail.innerHTML =
    `Beste trade: <strong>${bestT?.pair||'—'}</strong> op ${bestT?.date||'—'} &nbsp;|&nbsp; Slechtste: <strong>${worstT?.pair||'—'}</strong> op ${worstT?.date||'—'}`;

  // ---- Helper: bouw bar chart ----
  function barChart(containerId, rows, colorFn){
    const el = $(containerId); if(!el) return;
    if(!rows.length){ el.innerHTML='<div class="no-data-msg">Geen data</div>'; return; }
    const maxV = Math.max(...rows.map(r => r.pct));
    el.innerHTML = rows.map(r => `
      <div class="bar-row">
        <div class="bar-label" title="${r.label}">${r.label}</div>
        <div class="bar-track"><div class="bar-fill" style="width:${maxV>0?(r.pct/maxV*100).toFixed(1):0}%;background:${colorFn(r)};"></div></div>
        <div class="bar-meta">${r.pct.toFixed(0)}% <span style="opacity:0.5">(${r.n})</span></div>
      </div>`).join('');
  }

  function winrateRows(grouped){
    return Object.entries(grouped)
      .map(([label, arr]) => {
        const w = arr.filter(x=>x.result==='win').length;
        const n = arr.filter(x=>x.result!=='open').length;
        return { label, pct: n ? w/n*100 : 0, n };
      })
      .filter(r => r.n > 0)
      .sort((a,b) => b.pct - a.pct);
  }

  const byColor = pct => pct >= 55 ? 'var(--green)' : pct >= 40 ? 'var(--amber)' : 'var(--red)';

  // Per pair
  const byPair = {};
  t.forEach(x => { (byPair[x.pair] = byPair[x.pair]||[]).push(x); });
  barChart('statsByPair', winrateRows(byPair), r => byColor(r.pct));

  // Per dag
  const days = ['Maandag','Dinsdag','Woensdag','Donderdag','Vrijdag','Zaterdag','Zondag'];
  const byDay = {};
  t.forEach(x => {
    const d = new Date(x.date).getDay(); // 0=Sun
    const label = days[(d+6)%7];
    (byDay[label] = byDay[label]||[]).push(x);
  });
  const dayRows = days.map(label => {
    const arr = byDay[label]||[];
    const w = arr.filter(x=>x.result==='win').length;
    const n = arr.filter(x=>x.result!=='open').length;
    return { label: label.slice(0,2), pct: n ? w/n*100 : 0, n };
  }).filter(r => r.n > 0);
  barChart('statsByDay', dayRows, r => byColor(r.pct));

  // Long vs Short
  const byDir = { 'Long': t.filter(x=>x.dir==='long'), 'Short': t.filter(x=>x.dir==='short') };
  barChart('statsByDir', winrateRows(byDir), r => byColor(r.pct));

  // Edge match
  const edgeMap = { yes:'Edge ✓', partial:'Deels edge', no:'Geen edge' };
  const byEdge = {};
  t.forEach(x => { if(x.edge_match){ const k=edgeMap[x.edge_match]||x.edge_match; (byEdge[k]=byEdge[k]||[]).push(x); }});
  barChart('statsByEdge', winrateRows(byEdge), r => byColor(r.pct));

  // Resultaat verdeling
  const resultMap = { win:'Win', loss:'Loss', be:'Break-even' };
  const total = t.length;
  const resultRows = ['win','loss','be'].map(k => ({
    label: resultMap[k], pct: total ? t.filter(x=>x.result===k).length/total*100 : 0, n: t.filter(x=>x.result===k).length
  })).filter(r=>r.n>0);
  const resultColor = r => r.label==='Win'?'var(--green)':r.label==='Loss'?'var(--red)':'var(--muted)';
  barChart('statsByResult', resultRows, resultColor);

  // ---- Winrate per sessie ----
  const sessionOrder = ['Asian','London','New York','London/NY overlap','Andere'];
  const bySession = {};
  t.forEach(x => { const s = x.session||'Andere'; (bySession[s]=bySession[s]||[]).push(x); });
  const sessionRows = sessionOrder.map(s => {
    const arr = bySession[s]||[];
    const w = arr.filter(x=>x.result==='win').length;
    const n = arr.length;
    return { label: s, pct: n ? w/n*100 : 0, n };
  }).filter(r => r.n > 0);
  barChart('statsBySession', sessionRows, r => byColor(r.pct));

  // ---- Winrate per uur ----
  const byHour = {};
  t.forEach(x => {
    if(x.time){ const h = x.time.slice(0,2)+'u'; (byHour[h]=byHour[h]||[]).push(x); }
  });
  const hourRows = Object.entries(byHour)
    .map(([h, arr]) => ({ label: h, pct: arr.filter(x=>x.result==='win').length/arr.length*100, n: arr.length }))
    .sort((a,b) => a.label.localeCompare(b.label));
  const hourEl = $('statsByHour');
  if(hourEl){
    if(!hourRows.length){ hourEl.innerHTML='<div class="no-data-msg">Voeg een tijdstip toe aan je trades.</div>'; }
    else barChart('statsByHour', hourRows, r => byColor(r.pct));
  }

  // ---- Max Drawdown ----
  let peak = 0, maxDD = 0, ddStart = '', ddEnd = '';
  let runPeak = 0;
  sorted.forEach((x, i) => {
    runPeak += (x.pnl||0);
    if(runPeak > peak){ peak = runPeak; ddStart = x.date; }
    const dd = peak - runPeak;
    if(dd > maxDD){ maxDD = dd; ddEnd = x.date; }
  });
  const ddEl = $('statsDrawdown');
  if(ddEl) ddEl.innerHTML = `
    <div style="text-align:center;padding:12px 0;">
      <div style="font-family:var(--font-head);font-weight:800;font-size:28px;color:var(--red);">-€${maxDD.toFixed(0)}</div>
      <div style="font-size:11px;color:var(--muted);margin-top:4px;">Max drawdown</div>
      ${ddEnd ? `<div style="font-size:10px;color:var(--muted);margin-top:6px;">Dieptepunt: ${ddEnd}</div>` : ''}
      <div style="margin-top:12px;display:flex;justify-content:center;gap:20px;">
        <div style="text-align:center;">
          <div style="font-size:14px;font-weight:700;color:var(--amber)">${maxDD > 0 && totalPnl !== 0 ? (maxDD/Math.abs(totalPnl)*100).toFixed(1)+'%' : '—'}</div>
          <div style="font-size:10px;color:var(--muted)">% van totaal P&L</div>
        </div>
        <div style="text-align:center;">
          <div style="font-size:14px;font-weight:700;color:var(--text)">${maxWS}</div>
          <div style="font-size:10px;color:var(--muted)">Max wins op rij</div>
        </div>
        <div style="text-align:center;">
          <div style="font-size:14px;font-weight:700;color:var(--red)">${maxLS}</div>
          <div style="font-size:10px;color:var(--muted)">Max losses op rij</div>
        </div>
      </div>
    </div>`;

  // ---- Gem. win vs verlies ----
  const avgWin  = wins.length  ? wins.reduce((s,x)=>s+(x.pnl||0),0)/wins.length   : 0;
  const avgLoss = losses.length ? Math.abs(losses.reduce((s,x)=>s+(x.pnl||0),0)/losses.length) : 0;
  const avgWLEl = $('statsAvgWL');
  if(avgWLEl) avgWLEl.innerHTML = `
    <div style="padding:8px 0;">
      <div class="bar-row" style="margin-bottom:10px;">
        <div class="bar-label">Gem. win</div>
        <div class="bar-track"><div class="bar-fill" style="width:100%;background:var(--green);"></div></div>
        <div class="bar-meta" style="color:var(--green)">+€${avgWin.toFixed(0)}</div>
      </div>
      <div class="bar-row" style="margin-bottom:14px;">
        <div class="bar-label">Gem. verlies</div>
        <div class="bar-track"><div class="bar-fill" style="width:${avgWin>0?(avgLoss/avgWin*100).toFixed(0):100}%;background:var(--red);"></div></div>
        <div class="bar-meta" style="color:var(--red)">-€${avgLoss.toFixed(0)}</div>
      </div>
      <div style="font-size:11px;color:var(--muted);line-height:1.8;border-top:1px solid var(--border);padding-top:10px;">
        <div>Gem. R gewonnen: <strong style="color:var(--green)">${wins.length ? (wins.reduce((s,x)=>s+(x.rr||0),0)/wins.length).toFixed(2) : '—'}R</strong></div>
        <div>Gem. R verloren: <strong style="color:var(--red)">1.00R</strong></div>
        <div>Win/Loss ratio: <strong style="color:var(--text)">${avgLoss>0?(avgWin/avgLoss).toFixed(2):'∞'}</strong></div>
      </div>
    </div>`;

  // ---- R-distributie histogram ----
  const rBuckets = {'< -1R':0, '-1R':0, '0R (BE)':0, '+1R':0, '+2R':0, '+3R':0, '> +3R':0};
  t.forEach(x => {
    const r = x.result==='win' ? (x.rr||1) : x.result==='be' ? 0 : -1;
    if(r < -1) rBuckets['< -1R']++;
    else if(r <= -0.9) rBuckets['-1R']++;
    else if(Math.abs(r) < 0.1) rBuckets['0R (BE)']++;
    else if(r <= 1.5) rBuckets['+1R']++;
    else if(r <= 2.5) rBuckets['+2R']++;
    else if(r <= 3.5) rBuckets['+3R']++;
    else rBuckets['> +3R']++;
  });
  const rMax = Math.max(...Object.values(rBuckets), 1);
  const rColors = {'< -1R':'var(--red)','-1R':'var(--red)','0R (BE)':'var(--muted)','+1R':'var(--amber)','+2R':'var(--green)','+3R':'var(--green)','> +3R':'var(--green)'};
  const rEl = $('statsRDist');
  if(rEl) rEl.innerHTML = Object.entries(rBuckets).map(([label, count]) => `
    <div class="bar-row">
      <div class="bar-label" style="min-width:58px;">${label}</div>
      <div class="bar-track"><div class="bar-fill" style="width:${(count/rMax*100).toFixed(0)}%;background:${rColors[label]};"></div></div>
      <div class="bar-meta">${count}</div>
    </div>`).join('');

  // Maandelijks P&L
  const byMonth = {};
  t.forEach(x => {
    const key = x.date ? x.date.slice(0,7) : null;
    if(key){ byMonth[key] = (byMonth[key]||0) + (x.pnl||0); }
  });
  const monthEl = $('statsMonthly');
  if(monthEl){
    const monthNames = ['Jan','Feb','Mrt','Apr','Mei','Jun','Jul','Aug','Sep','Okt','Nov','Dec'];
    monthEl.innerHTML = Object.keys(byMonth).sort().map(k => {
      const v = byMonth[k];
      const [yr, mo] = k.split('-');
      return `<div class="month-box">
        <div class="month-lbl">${monthNames[parseInt(mo)-1]} ${yr}</div>
        <div class="month-val" style="color:${v>=0?'var(--green)':'var(--red)'}">${v>=0?'+':''}€${v.toFixed(0)}</div>
      </div>`;
    }).join('') || '<div class="no-data-msg">Geen data</div>';
  }

  renderHeatmap(t);
  renderMoodStats(t);
}

// ================================================================
// PERFORMANCE HEATMAP
// ================================================================
let heatmapDate = new Date();

function changeHeatmapMonth(delta){
  heatmapDate = new Date(heatmapDate.getFullYear(), heatmapDate.getMonth() + delta, 1);
  renderHeatmap(trades.filter(t => t.result !== 'open'));
}

function renderHeatmap(t){
  const el = $('statsHeatmap');
  if(!el) return;

  const yr  = heatmapDate.getFullYear();
  const mo  = heatmapDate.getMonth(); // 0-based
  const monthNames = ['Januari','Februari','Maart','April','Mei','Juni','Juli','Augustus','September','Oktober','November','December'];
  const dowLabels  = ['Ma','Di','Wo','Do','Vr','Za','Zo'];

  // Bouw dagmap voor deze maand
  const dayMap = {};
  t.forEach(trade => {
    const d = (trade.date||'').slice(0,10);
    if(!d) return;
    const td = new Date(d);
    if(td.getFullYear()===yr && td.getMonth()===mo){
      if(!dayMap[d]) dayMap[d] = { pnl:0, trades:[] };
      dayMap[d].pnl += (trade.pnl||0);
      dayMap[d].trades.push(trade);
    }
  });

  // Max abs P&L voor kleurintensiteit
  const pnlVals = Object.values(dayMap).map(d => Math.abs(d.pnl));
  const maxPnl  = pnlVals.length ? Math.max(...pnlVals, 1) : 1;

  const todayStr = new Date().toISOString().slice(0,10);
  const daysInMonth = new Date(yr, mo+1, 0).getDate();
  const firstDow = (new Date(yr, mo, 1).getDay() + 6) % 7; // Ma=0

  // Kleur helper
  const dayColor = (pnl) => {
    const intensity = Math.min(0.9, 0.15 + (Math.abs(pnl)/maxPnl)*0.75);
    return pnl > 0
      ? `rgba(46,204,138,${intensity})`
      : pnl < 0
      ? `rgba(255,92,92,${intensity})`
      : 'var(--surface2)';
  };

  // Bouw grid cellen
  const dowRow = dowLabels.map(d => `<div class="heatmap-dow">${d}</div>`).join('');
  let cells = '';
  // Lege cellen voor eerste week
  for(let i=0; i<firstDow; i++) cells += `<div class="heatmap-day empty"></div>`;

  for(let day=1; day<=daysInMonth; day++){
    const dateStr = `${yr}-${String(mo+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
    const data    = dayMap[dateStr];
    const isToday = dateStr === todayStr;
    const hasTrades = !!data;
    const pnl = data?.pnl || 0;
    const count = data?.trades?.length || 0;
    const bg = hasTrades ? dayColor(pnl) : 'var(--surface2)';
    const pnlText = hasTrades ? `${pnl>=0?'+':''}€${Math.abs(pnl)<100?pnl.toFixed(1):pnl.toFixed(0)}` : '';
    const textColor = 'rgba(255,255,255,0.95)';
    const numColor  = hasTrades ? 'rgba(255,255,255,0.9)' : 'var(--muted)';
    const onclick = hasTrades ? `onclick="showHeatmapDay('${dateStr}')"` : '';
    cells += `<div class="heatmap-day ${hasTrades?'has-trades':''} ${isToday?'today':''}"
      style="background:${bg};" ${onclick} title="${dateStr}${hasTrades?`: ${count} trade(s), P&L: €${pnl.toFixed(2)}`:''}">
      <span class="heatmap-day-num" style="color:${numColor}">${day}</span>
      ${hasTrades ? `<div style="display:flex;flex-direction:column;align-items:center;gap:1px;">
        <span class="heatmap-day-pnl" style="color:${textColor}">${pnlText}</span>
        <span class="heatmap-day-count">${count}t</span>
      </div>` : ''}
    </div>`;
  }

  // Week totalen (rechts naast elke rij)
  const totalPnl = Object.values(dayMap).reduce((s,d)=>s+d.pnl,0);
  const tradeDays = Object.keys(dayMap).length;
  const greenDays = Object.values(dayMap).filter(d=>d.pnl>0).length;
  const redDays   = Object.values(dayMap).filter(d=>d.pnl<0).length;

  el.innerHTML = `
    <div class="heatmap-nav">
      <button class="heatmap-nav-btn" onclick="changeHeatmapMonth(-1)">← Vorige</button>
      <span class="heatmap-month-label">${monthNames[mo]} ${yr}</span>
      <button class="heatmap-nav-btn" onclick="changeHeatmapMonth(1)">Volgende →</button>
    </div>
    <div class="heatmap-grid">${dowRow}${cells}</div>
    <div style="display:flex;gap:16px;flex-wrap:wrap;margin-top:12px;font-size:11px;color:var(--muted);font-family:var(--font-head);font-weight:700;">
      <span>Totaal: <span style="color:${totalPnl>=0?'var(--green)':'var(--red)'}">${totalPnl>=0?'+':''}€${totalPnl.toFixed(2)}</span></span>
      <span>Trading days: <strong style="color:var(--text)">${tradeDays}</strong></span>
      <span>🟢 <strong style="color:var(--green)">${greenDays}</strong></span>
      <span>🔴 <strong style="color:var(--red)">${redDays}</strong></span>
    </div>
    <div class="heatmap-legend">
      <span>Intensiteit:</span>
      <div class="heatmap-legend-cell" style="background:rgba(255,92,92,0.9)"></div><span>Groot verlies</span>
      <div class="heatmap-legend-cell" style="background:rgba(255,92,92,0.3)"></div><span>Klein verlies</span>
      <div class="heatmap-legend-cell" style="background:var(--surface2);border:1px solid var(--border)"></div><span>Geen trades</span>
      <div class="heatmap-legend-cell" style="background:rgba(46,204,138,0.3)"></div><span>Kleine winst</span>
      <div class="heatmap-legend-cell" style="background:rgba(46,204,138,0.9)"></div><span>Grote winst</span>
    </div>`;
}

function showHeatmapDay(dateStr){
  const dayTrades = trades.filter(t => t.date?.slice(0,10) === dateStr);
  if(!dayTrades.length) return;
  const existing = document.getElementById('heatmapDayOverlay');
  if(existing) existing.remove();
  const totalPnl = dayTrades.reduce((s,t)=>(s+(t.pnl||0)),0);
  const overlay = document.createElement('div');
  overlay.id = 'heatmapDayOverlay';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(10,11,16,0.85);z-index:600;display:flex;align-items:center;justify-content:center;padding:20px;';
  const moodIcons = {rustig:'😌',gefocust:'🎯',gespannen:'😤',fomo:'😰',vermoeid:'😴',revenge:'🔄'};
  overlay.innerHTML = `
    <div style="background:var(--surface);border:1px solid var(--border2);border-radius:16px;padding:20px;width:100%;max-width:480px;max-height:85vh;overflow-y:auto;">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;">
        <div>
          <div style="font-family:var(--font-head);font-weight:800;font-size:15px;">${dateStr}</div>
          <div style="font-size:12px;color:${totalPnl>=0?'var(--green)':'var(--red)'};">
            ${dayTrades.length} trade${dayTrades.length>1?'s':''} · ${totalPnl>=0?'+':''}€${totalPnl.toFixed(2)}
          </div>
        </div>
        <button onclick="document.getElementById('heatmapDayOverlay').remove()" style="background:none;border:none;color:var(--muted);font-size:20px;cursor:pointer;">×</button>
      </div>
      ${dayTrades.map(t => `
        <div style="background:var(--surface2);border:1px solid var(--border);border-radius:10px;padding:12px;margin-bottom:8px;">
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:4px;">
            <span style="font-family:var(--font-head);font-weight:700;">${t.pair}</span>
            <span style="font-size:10px;padding:2px 7px;border-radius:5px;font-family:var(--font-head);font-weight:700;background:${t.dir==='long'?'rgba(46,204,138,0.15)':'rgba(255,92,92,0.15)'};color:${t.dir==='long'?'var(--green)':'var(--red)'};">${t.dir.toUpperCase()}</span>
            <span style="font-size:10px;padding:2px 7px;border-radius:5px;font-family:var(--font-head);font-weight:700;background:${t.result==='win'?'rgba(46,204,138,0.15)':t.result==='loss'?'rgba(255,92,92,0.15)':'rgba(122,128,153,0.15)'};color:${t.result==='win'?'var(--green)':t.result==='loss'?'var(--red)':'var(--muted)'};">${t.result.toUpperCase()}</span>
            <span style="color:${(t.pnl||0)>=0?'var(--green)':'var(--red)'};font-weight:700;">${(t.pnl||0)>=0?'+':''}€${(t.pnl||0).toFixed(2)}</span>
            ${t.mood?`<span style="font-size:11px;">${moodIcons[t.mood]||''} ${t.mood}</span>`:''}
          </div>
          ${t.notes?`<div style="font-size:11px;color:var(--muted);font-style:italic;">"${t.notes}"</div>`:''}
        </div>`).join('')}
    </div>`;
  document.body.appendChild(overlay);
  overlay.addEventListener('click', e => { if(e.target===overlay) overlay.remove(); });
}

// ================================================================
// PSYCHOLOGIE STATS
// ================================================================
function renderMoodStats(t){
  const el = $('statsMood');
  if(!el) return;
  const moodTrades = t.filter(x => x.mood);
  if(!moodTrades.length){
    el.innerHTML = '<div class="no-data-msg">Log je mindset bij trades om correlaties te zien</div>';
    return;
  }
  const moodDefs = [
    { key:'rustig',    emoji:'😌', label:'Rustig',    color:'var(--green)' },
    { key:'gefocust',  emoji:'🎯', label:'Gefocust',  color:'var(--accent)' },
    { key:'gespannen', emoji:'😤', label:'Gespannen', color:'var(--amber)' },
    { key:'fomo',      emoji:'😰', label:'FOMO',      color:'var(--red)' },
    { key:'vermoeid',  emoji:'😴', label:'Vermoeid',  color:'var(--muted)' },
    { key:'revenge',   emoji:'🔄', label:'Revenge',   color:'var(--red)' },
  ];
  const stats = moodDefs.map(m => {
    const mt = moodTrades.filter(x => x.mood === m.key);
    if(!mt.length) return null;
    const wins = mt.filter(x => x.result==='win').length;
    const wr   = mt.length ? wins/mt.length*100 : 0;
    const pnl  = mt.reduce((s,x)=>(s+(x.pnl||0)),0);
    const avgPnl = pnl / mt.length;
    return { ...m, n:mt.length, wr, pnl, avgPnl };
  }).filter(Boolean);

  const maxN = Math.max(...stats.map(s=>s.n));
  const rows = stats.sort((a,b)=>b.wr-a.wr).map(s => {
    const wrColor = s.wr>=60?'var(--green)':s.wr>=45?'var(--amber)':'var(--red)';
    const pnlColor = s.avgPnl>=0?'var(--green)':'var(--red)';
    return `<div style="margin-bottom:10px;">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
        <span style="font-size:16px;">${s.emoji}</span>
        <span style="font-family:var(--font-head);font-weight:700;font-size:12px;color:var(--text);min-width:80px;">${s.label}</span>
        <span style="font-size:11px;color:var(--muted);">${s.n} trade${s.n>1?'s':''}</span>
        <span style="margin-left:auto;font-family:var(--font-head);font-weight:700;font-size:12px;color:${wrColor};">${s.wr.toFixed(0)}%</span>
        <span style="font-family:var(--font-head);font-weight:700;font-size:11px;color:${pnlColor};min-width:70px;text-align:right;">${s.avgPnl>=0?'+':''}€${s.avgPnl.toFixed(0)}/trade</span>
      </div>
      <div style="height:6px;background:var(--border);border-radius:3px;overflow:hidden;">
        <div style="height:100%;width:${s.wr}%;background:${wrColor};border-radius:3px;transition:width .5s;"></div>
      </div>
    </div>`;
  }).join('');

  // Beste en slechtste mindset
  const best  = stats.reduce((a,b) => a.wr>b.wr?a:b);
  const worst = stats.reduce((a,b) => a.wr<b.wr?a:b);

  el.innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:16px;">
      <div style="background:rgba(46,204,138,0.07);border:1px solid rgba(46,204,138,0.25);border-radius:10px;padding:12px;">
        <div style="font-size:10px;color:var(--green);font-family:var(--font-head);font-weight:700;text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px;">🏆 Beste mindset</div>
        <div style="font-size:22px;">${best.emoji}</div>
        <div style="font-family:var(--font-head);font-weight:800;font-size:14px;color:var(--text);">${best.label}</div>
        <div style="font-size:12px;color:var(--green);">${best.wr.toFixed(0)}% winrate · ${best.n} trades</div>
      </div>
      <div style="background:rgba(255,92,92,0.07);border:1px solid rgba(255,92,92,0.25);border-radius:10px;padding:12px;">
        <div style="font-size:10px;color:var(--red);font-family:var(--font-head);font-weight:700;text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px;">⚠ Pas op voor</div>
        <div style="font-size:22px;">${worst.emoji}</div>
        <div style="font-family:var(--font-head);font-weight:800;font-size:14px;color:var(--text);">${worst.label}</div>
        <div style="font-size:12px;color:var(--red);">${worst.wr.toFixed(0)}% winrate · ${worst.n} trades</div>
      </div>
    </div>
    <div style="font-size:11px;color:var(--muted);margin-bottom:10px;font-style:italic;">Winrate en gemiddelde P&amp;L per mindset — gesorteerd van beste naar slechtste</div>
    ${rows}`;
}

// Stats worden getriggerd vanuit de bestaande showTab (zie hieronder)

// ================================================================
// RISK OF RUIN CALCULATOR
// ================================================================
function calcRoR(){
  const W    = parseFloat($('rorWR').value)   / 100;
  const RR   = parseFloat($('rorRR').value);
  const risk = parseFloat($('rorRisk').value) / 100;
  const dd   = parseFloat($('rorDD').value)   / 100;

  if(isNaN(W)||isNaN(RR)||isNaN(risk)||isNaN(dd)||W<=0||W>=1||RR<=0||risk<=0) return;

  // Edge per R risked: E = W*RR - (1-W)
  const edge = W * RR - (1 - W);

  // Analytische RoR formule (gambler's ruin):
  // Als edge > 0: RoR = ((1-edge)/(1+edge)) ^ (dd/risk)
  // Als edge <= 0: RoR = 100% (negatieve verwachting = zeker ruïne)
  function rorAt(threshold){
    if(edge <= 0) return 1;
    const units = threshold / risk;
    return Math.pow((1 - edge) / (1 + edge), units);
  }

  // Hoofdwaarde
  const mainRoR = rorAt(dd);
  const mainPct = (mainRoR * 100);

  const mainEl = $('rorMainVal');
  if(mainEl){
    mainEl.textContent = mainPct < 0.01 ? '<0.01%' : mainPct.toFixed(2) + '%';
    mainEl.style.color = mainPct < 1 ? 'var(--green)' : mainPct < 10 ? 'var(--amber)' : 'var(--red)';
  }

  // Meter
  const fill = $('rorMeterFill');
  if(fill){
    const fillPct = Math.min(100, mainPct);
    fill.style.width  = fillPct + '%';
    fill.style.background = mainPct < 1 ? 'var(--green)' : mainPct < 5 ? 'var(--amber)' : 'var(--red)';
  }

  // Edge uitleg
  const edgeBox = $('rorEdgeBox');
  if(edgeBox){
    const expPerTrade = (edge * risk * 100).toFixed(3);
    if(edge > 0){
      const cls = edge > 0.3 ? 'rgba(46,204,138,0.08)' : edge > 0.1 ? 'rgba(245,166,35,0.08)' : 'rgba(255,92,92,0.08)';
      const col = edge > 0.3 ? 'var(--green)' : edge > 0.1 ? 'var(--amber)' : 'var(--red)';
      edgeBox.style.cssText = `background:${cls};border:1px solid ${col}33;`;
      edgeBox.innerHTML = `<span style="color:${col};font-weight:700;">Edge: +${(edge*100).toFixed(1)}%</span> &nbsp;·&nbsp; Verwachting: <strong>+${expPerTrade}% per trade</strong><br>
        <span style="color:var(--muted);font-size:11px;">Bij ${(1/risk)} trades riskeer je gemiddeld je volledige inzet. Positieve edge = winst op lange termijn.</span>`;
    } else {
      edgeBox.style.cssText = 'background:rgba(255,92,92,0.08);border:1px solid rgba(255,92,92,0.3);';
      edgeBox.innerHTML = `<span style="color:var(--red);font-weight:700;">Negatieve edge: ${(edge*100).toFixed(1)}%</span><br>
        <span style="color:var(--muted);font-size:11px;">Met deze winrate en R:R verlies je op lange termijn. Verhoog je winrate of R:R.</span>`;
    }
  }

  // Grid: kans bij 5 vaste drawdown-niveaus
  const levels = [5, 10, 20, 30, 50];
  const grid = $('rorGrid');
  if(grid){
    grid.innerHTML = levels.map(lvl => {
      const r = rorAt(lvl / 100) * 100;
      const cls = r < 1 ? 'ror-safe' : r < 5 ? 'ror-low' : r < 20 ? 'ror-medium' : r < 50 ? 'ror-high' : 'ror-danger';
      const col = r < 1 ? 'var(--green)' : r < 5 ? 'var(--green)' : r < 20 ? 'var(--amber)' : 'var(--red)';
      const txt = r < 0.01 ? '<0.01%' : r > 99.9 ? '>99.9%' : r.toFixed(r < 1 ? 2 : 1) + '%';
      return `<div class="ror-cell ${cls}">
        <div class="ror-dd">${lvl}% DD</div>
        <div class="ror-val" style="color:${col}">${txt}</div>
      </div>`;
    }).join('');
  }
}

function rorFillFromStats(){
  const closed = trades.filter(t => t.result !== 'open');
  if(!closed.length){ alert('Nog geen afgesloten trades in het journal.'); return; }
  const wins = closed.filter(t => t.result === 'win');
  const wr   = (wins.length / closed.length * 100).toFixed(1);
  const avgRR = closed.length ? (closed.reduce((s,t) => s + (t.rr||0), 0) / closed.length).toFixed(2) : 2;
  $('rorWR').value  = wr;
  $('rorRR').value  = avgRR;
  calcRoR();
}

calcRoR();

// ================================================================
// AUTOSAVE
// ================================================================
(function(){
  // Maak autosave-indicator aan
  const indicator = document.createElement('div');
  indicator.id = 'autosaveIndicator';
  indicator.style.cssText = 'position:fixed;bottom:16px;right:16px;padding:5px 12px;border-radius:20px;font-family:var(--font-head);font-weight:700;font-size:10px;letter-spacing:0.8px;text-transform:uppercase;background:var(--surface2);border:1px solid var(--border);color:var(--muted);opacity:0;transition:opacity 0.3s;z-index:9999;pointer-events:none;';
  document.body.appendChild(indicator);

  function showIndicator(text, color){
    indicator.textContent = text;
    indicator.style.color = color || 'var(--muted)';
    indicator.style.opacity = '1';
  }
  function hideIndicator(){
    indicator.style.opacity = '0';
  }

  // Veld-ID → save-functie mapping
  const weeklyIds = new Set(['wHigh','wLow','wOpen','wClose','wCurrent']);
  const dailyIds  = new Set(['dHigh','dLow','dOpen','dClose']);
  const planIds   = new Set(['biasSummary','scenarioA','scenarioB','invalidation']);
  const apiKeyIds = new Set(['anthropicApiKey']);

  const timers = {};

  function scheduleAutosave(groupKey, saveFn, delay){
    clearTimeout(timers[groupKey]);
    showIndicator('Opslaan...', 'var(--muted)');
    timers[groupKey] = setTimeout(()=>{
      try { saveFn(); } catch(e){}
      showIndicator('Opgeslagen ✓', 'var(--green)');
      setTimeout(hideIndicator, 1800);
    }, delay);
  }

  document.addEventListener('input', function(e){
    const id = e.target?.id;
    if(!id) return;

    if(weeklyIds.has(id)){
      scheduleAutosave('weekly', saveWeeklyLevels, 1500);
    } else if(dailyIds.has(id)){
      scheduleAutosave('daily', saveDailyLevels, 1500);
    } else if(planIds.has(id)){
      scheduleAutosave('plan', saveTradingPlan, 1500);
    } else if(apiKeyIds.has(id)){
      scheduleAutosave('apikey', function(){
        const key = e.target.value.trim();
        if(key) try{ localStorage.setItem('fxAnthropicKey', key); }catch(err){}
      }, 2000);
    }
  });
})();