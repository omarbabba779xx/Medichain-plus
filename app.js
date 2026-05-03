/* ============================================================
 * MediChain+ — Démo interactive v3.1
 * Smart contract déployé sur Polygon Amoy (testnet réel)
 * Contract : 0x8Abba481989476ea2C917337bCce07C2C48cd725
 * Explorer : https://amoy.polygonscan.com/address/0x8Abba481989476ea2C917337bCce07C2C48cd725
 * ============================================================ */

/* ── Déploiement réel Polygon Amoy ── */
const DEPLOYED = {
  network:   'Polygon Amoy',
  chainId:   80002,
  Insurance: '0x8Abba481989476ea2C917337bCce07C2C48cd725',
  MockUSDC:  '0x6E93211E162012B21a57661166eB36ADE5Aa5Bb9',
  deployer:  '0x4b3d2407d0A6bEE0512f63ad8104BF0BBF7caC76',
  explorer:  (addr) => `https://amoy.polygonscan.com/address/${addr}`,
  txLink:    (hash) => `https://amoy.polygonscan.com/tx/${hash}`,
};

const $ = (id) => document.getElementById(id);
const $$ = (sel) => document.querySelectorAll(sel);
const uid = (p='') => { const b = new Uint8Array(5); crypto.getRandomValues(b); return p + [...b].map(x=>x.toString(16).padStart(2,'0')).join('').slice(0,8); };
const now = () => new Date();
const fmtTime = (d) => d.toTimeString().slice(0,8);
const fmtDate = (d) => d.toLocaleDateString('fr-FR') + ' ' + fmtTime(d);

async function sha256(str) {
  const buf = new TextEncoder().encode(str);
  const hash = await crypto.subtle.digest('SHA-256', buf);
  return [...new Uint8Array(hash)].map(b=>b.toString(16).padStart(2,'0')).join('');
}
const shortHash = h => h.length>14 ? `0x${h.slice(0,6)}…${h.slice(-4)}` : h;
const esc = (s) => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');

/* ═══════════════════════════════════════════════════════════
   LOCAL STORAGE PERSISTENCE
═══════════════════════════════════════════════════════════ */
function savePrefs() {
  try {
    localStorage.setItem('mc_dark',  JSON.stringify(state.darkMode));
    localStorage.setItem('mc_lang',  state.lang);
    localStorage.setItem('mc_sound', JSON.stringify(state.soundOn));
  } catch(e) {}
}

function loadPrefs() {
  try {
    const dark  = localStorage.getItem('mc_dark');
    const lang  = localStorage.getItem('mc_lang');
    const sound = localStorage.getItem('mc_sound');
    if (dark  !== null) state.darkMode = JSON.parse(dark);
    if (lang  !== null) state.lang     = lang;
    if (sound !== null) state.soundOn  = JSON.parse(sound);
  } catch(e) {}
}

/* ═══════════════════════════════════════════════════════════
   STATE
═══════════════════════════════════════════════════════════ */
const state = {
  lang: localStorage.getItem('mc_lang') || 'fr',
  darkMode: (() => { try { return JSON.parse(localStorage.getItem('mc_dark')) || false; } catch(e){ return false; } })(),
  soundOn:  (() => { try { const v = localStorage.getItem('mc_sound'); return v === null ? true : JSON.parse(v); } catch(e){ return true; } })(),
  walletConnected: false,
  walletAddress: null,
  walletMode:     null,  // 'metamask' | 'simulated' | null
  walletSigner:   null,
  walletProvider: null,
  patient: {
    did:'did:indy:xyz123salma', name:'Salma Ben Ali',
    address:'0xPATIENT'+uid(), balance:0,
    records:[], consents:[], prescriptions:[], claims:[], keyPair:null,
  },
  doctor:  { did:'did:indy:dr-karim', name:'Dr. Karim Hassan', alerts:[] },
  pharmacy:{
    inbox:[],
    stock:[
      {code:'MED-INS-2024-88421',name:'Insuline rapide 100 UI/ml',lot:'LOT-A2024-09',maker:'Sanofi',chain:['Sanofi (Paris)','Distribeuro','Al-Andalous'],ok:true},
      {code:'MED-MET-2024-55012',name:'Metformine 850 mg',lot:'LOT-B2024-11',maker:'Teva',chain:['Teva (Tel Aviv)','MedStock','Al-Andalous'],ok:true},
      {code:'MED-GLI-2023-33221',name:'Glimepiride 4 mg',lot:'LOT-C2023-07',maker:'Sanofi',chain:['Sanofi (Paris)','Distribeuro','Al-Andalous'],ok:true},
      {code:'MED-FAKE-0001',name:'Insuline (contrefaçon)',lot:'LOT-?',maker:'Inconnu',chain:[],ok:false},
    ],
  },
  insurer: { balance:10000, claims:[], coveragePercent:85 },
  fabric:  { blocks:[], txCount:0 },
  polygon: { blocks:[], txCount:0, gasUsed:0 },
  glucoseHistory: [],
  claimsHistory:  [],
};

/* ═══════════════════════════════════════════════════════════
   SPLASH SCREEN
═══════════════════════════════════════════════════════════ */
function hideSplash() {
  const s = $('splash');
  if (!s) return;
  const msgs = [
    { fr: 'Génération des clés ECDSA…',         en: 'Generating ECDSA keys…',         ar: 'توليد مفاتيح ECDSA…' },
    { fr: 'Connexion au réseau Fabric…',         en: 'Connecting to Fabric network…',  ar: 'الاتصال بشبكة Fabric…' },
    { fr: 'Déploiement du smart contract…',      en: 'Deploying smart contract…',      ar: 'نشر العقد الذكي…' },
    { fr: 'Prêt !',                              en: 'Ready!',                          ar: 'جاهز!' },
  ];
  let i = 0;
  const msg  = s.querySelector('.splash-msg');
  const fill = s.querySelector('.splash-fill');
  const iv = setInterval(() => {
    i++;
    const entry = msgs[Math.min(i, msgs.length-1)];
    if (msg)  msg.textContent  = entry[state.lang] || entry.fr;
    if (fill) fill.style.width = (i / msgs.length * 100) + '%';
    if (i >= msgs.length) {
      clearInterval(iv);
      setTimeout(() => { s.style.opacity='0'; setTimeout(()=>s.remove(),400); }, 400);
    }
  }, 500);
}

/* ═══════════════════════════════════════════════════════════
   CRYPTO
═══════════════════════════════════════════════════════════ */
async function initCrypto() {
  state.patient.keyPair = await crypto.subtle.generateKey(
    {name:'ECDSA',namedCurve:'P-256'}, true, ['sign','verify']
  );
}
async function signMessage(msg) {
  const sig = await crypto.subtle.sign(
    {name:'ECDSA',hash:'SHA-256'},
    state.patient.keyPair.privateKey,
    new TextEncoder().encode(msg)
  );
  return [...new Uint8Array(sig)].map(b=>b.toString(16).padStart(2,'0')).join('');
}

/* ═══════════════════════════════════════════════════════════
   DARK MODE
═══════════════════════════════════════════════════════════ */
function toggleDark() {
  state.darkMode = !state.darkMode;
  applyDark();
  savePrefs();
}
function applyDark() {
  document.documentElement.setAttribute('data-theme', state.darkMode ? 'dark' : 'light');
  const btn = $('darkBtn');
  if (btn) btn.textContent = state.darkMode ? '☀️' : '🌙';
  if (glucoseChartInst) updateChartTheme(glucoseChartInst);
  if (claimsChartInst)  updateChartTheme(claimsChartInst);
  if (netChartInst)     updateChartTheme(netChartInst);
}
function updateChartTheme(chart) {
  const color = state.darkMode ? '#94a3b8' : '#64748b';
  if (chart.options.scales && chart.options.scales.x) chart.options.scales.x.ticks.color = color;
  if (chart.options.scales && chart.options.scales.y) chart.options.scales.y.ticks.color = color;
  chart.update();
}

/* ═══════════════════════════════════════════════════════════
   LANGUE FR / EN / AR
═══════════════════════════════════════════════════════════ */
const translations = {
  fr: {
    'dashboard':'Tableau de bord — Salma Ben Ali',
    'wallet':'Solde wallet',
    'iot':'Capteur IoT (Glucomètre)',
    'normal-btn':'Mesure normale',
    'high-btn':'⚠ Hyperglycémie',
    'chart-title':'Courbe Glycémie (temps réel)',
    'consents':'Consentements actifs',
    'grant':'+ Accorder un accès',
    'records':'Dossier médical',
    'rx':'Ordonnances',
    'claims':'Remboursements DeFi',
    'doctor':'Espace Médecin — Dr. Karim Hassan',
    'pharmacy':'Espace Pharmacie — Al-Andalous',
    'insurer':'Espace Assureur — SantéSûre SA',
    'sign-rx':'🔏 Signer & envoyer',
  },
  en: {
    'dashboard':'Dashboard — Salma Ben Ali',
    'wallet':'Wallet balance',
    'iot':'IoT Sensor (Glucometer)',
    'normal-btn':'Normal reading',
    'high-btn':'⚠ Hyperglycemia',
    'chart-title':'Blood Sugar Chart (real-time)',
    'consents':'Active consents',
    'grant':'+ Grant access',
    'records':'Medical records',
    'rx':'Prescriptions',
    'claims':'DeFi Reimbursements',
    'doctor':'Doctor Portal — Dr. Karim Hassan',
    'pharmacy':'Pharmacy Portal — Al-Andalous',
    'insurer':'Insurer Portal — SantéSûre SA',
    'sign-rx':'🔏 Sign & send',
  },
  ar: {
    'dashboard':'لوحة التحكم — سلمى بن علي',
    'wallet':'رصيد المحفظة',
    'iot':'مستشعر IoT (جهاز قياس السكر)',
    'normal-btn':'قراءة طبيعية',
    'high-btn':'⚠ ارتفاع السكر',
    'chart-title':'منحنى السكر في الدم (مباشر)',
    'consents':'الموافقات النشطة',
    'grant':'+ منح وصول',
    'records':'السجل الطبي',
    'rx':'الوصفات الطبية',
    'claims':'المطالبات DeFi',
    'doctor':'بوابة الطبيب — د. كريم حسان',
    'pharmacy':'بوابة الصيدلية — الأندلس',
    'insurer':'بوابة التأمين — صحة آمنة',
    'sign-rx':'🔏 توقيع وإرسال',
  }
};

function toggleLang() {
  if (state.lang === 'fr')      state.lang = 'en';
  else if (state.lang === 'en') state.lang = 'ar';
  else                          state.lang = 'fr';

  applyLang();
  savePrefs();
}

function applyLang() {
  const btn = $('langBtn');
  if (btn) {
    if (state.lang === 'fr')      btn.textContent = '🌐 EN';
    else if (state.lang === 'en') btn.textContent = '🌐 AR';
    else                          btn.textContent = '🌐 FR';
  }

  if (state.lang === 'ar') {
    document.documentElement.setAttribute('dir', 'rtl');
    document.documentElement.setAttribute('lang', 'ar');
  } else {
    document.documentElement.removeAttribute('dir');
    document.documentElement.setAttribute('lang', state.lang);
  }

  $$('[data-fr]').forEach(el => {
    const val = el.getAttribute('data-' + state.lang) || el.getAttribute('data-fr');
    el.textContent = val;
  });
}

/* ═══════════════════════════════════════════════════════════
   SOUND (Web Audio API)
═══════════════════════════════════════════════════════════ */
let audioCtx = null;
function getAudio() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  return audioCtx;
}
function playBeep(freq=440, dur=0.15, type='sine', vol=0.3) {
  if (!state.soundOn) return;
  try {
    const ctx = getAudio();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    osc.type = type; osc.frequency.value = freq;
    gain.gain.setValueAtTime(vol, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
    osc.start(); osc.stop(ctx.currentTime + dur);
  } catch(e){}
}
function playAlert()   { playBeep(880,0.3,'sawtooth',0.2); setTimeout(()=>playBeep(660,0.2,'sawtooth',0.15),200); }
function playSuccess() { playBeep(523,0.1,'sine',0.2); setTimeout(()=>playBeep(659,0.1,'sine',0.2),120); setTimeout(()=>playBeep(784,0.2,'sine',0.2),240); }
function playInfo()    { playBeep(440,0.1,'sine',0.15); }

function toggleSound() {
  state.soundOn = !state.soundOn;
  const btn = $('soundBtn');
  if (btn) btn.textContent = state.soundOn ? '🔔' : '🔕';
  toast('Son', state.soundOn ? 'Notifications sonores activées' : 'Son désactivé', 'info');
  savePrefs();
}

/* ═══════════════════════════════════════════════════════════
   CHARTS (Chart.js)
═══════════════════════════════════════════════════════════ */
let glucoseChartInst = null;
let claimsChartInst  = null;
let netChartInst     = null;

function initGlucoseChart() {
  const canvas = $('glucoseChart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  glucoseChartInst = new Chart(ctx, {
    type: 'line',
    data: {
      labels: [],
      datasets: [{
        label: 'Glycémie (g/L)',
        data: [],
        borderColor: '#10b981',
        backgroundColor: 'rgba(16,185,129,.1)',
        borderWidth: 2,
        pointBackgroundColor: '#10b981',
        pointRadius: 4,
        tension: 0.4,
        fill: true,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 500 },
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: ctx => ctx.parsed.y.toFixed(2) + ' g/L' } }
      },
      scales: {
        x: { ticks:{ color:'#64748b', maxTicksLimit:6 }, grid:{ color:'rgba(100,116,139,.1)' } },
        y: {
          ticks:{ color:'#64748b' }, grid:{ color:'rgba(100,116,139,.1)' },
          min: 0.5, max: 3.5,
        }
      }
    }
  });
}

function addGlucosePoint(value, isHigh) {
  if (!glucoseChartInst) return;
  const label = fmtTime(now());
  const ds = glucoseChartInst.data;
  ds.labels.push(label);
  ds.datasets[0].data.push(value);
  ds.datasets[0].pointBackgroundColor = ds.datasets[0].data.map(v => v >= 2.0 ? '#ef4444' : '#10b981');
  ds.datasets[0].borderColor = isHigh ? '#ef4444' : '#10b981';
  ds.datasets[0].backgroundColor = isHigh ? 'rgba(239,68,68,.1)' : 'rgba(16,185,129,.1)';
  if (ds.labels.length > 12) { ds.labels.shift(); ds.datasets[0].data.shift(); }
  glucoseChartInst.update();
}

function initClaimsChart() {
  const canvas = $('claimsChart');
  if (!canvas) return;
  claimsChartInst = new Chart(canvas.getContext('2d'), {
    type: 'bar',
    data: {
      labels: [],
      datasets: [
        { label:'Montant facture', data:[], backgroundColor:'rgba(59,130,246,.6)', borderRadius:6 },
        { label:'Remboursé (85%)', data:[], backgroundColor:'rgba(16,185,129,.8)', borderRadius:6 },
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend:{ labels:{ color:'#64748b', font:{ size:11 } } } },
      scales: {
        x: { ticks:{ color:'#64748b' }, grid:{ display:false } },
        y: { ticks:{ color:'#64748b', callback: v => v+' USDC' }, grid:{ color:'rgba(100,116,139,.1)' } }
      }
    }
  });
}

function addClaimsPoint(med, amount, payout) {
  if (!claimsChartInst) return;
  const ds = claimsChartInst.data;
  const short = med.split(' ').slice(0,2).join(' ');
  ds.labels.push(short);
  ds.datasets[0].data.push(amount);
  ds.datasets[1].data.push(payout);
  if (ds.labels.length > 6) {
    ds.labels.shift();
    ds.datasets.forEach(d => d.data.shift());
  }
  claimsChartInst.update();
}

/* ═══════════════════════════════════════════════════════════
   REALTIME NETWORK CHART
═══════════════════════════════════════════════════════════ */
function initNetChart() {
  const canvas = $('netChart');
  if (!canvas) return;
  const tickColor = state.darkMode ? '#94a3b8' : '#64748b';
  netChartInst = new Chart(canvas.getContext('2d'), {
    type: 'line',
    data: {
      labels: [],
      datasets: [
        {
          label: 'Fabric Tx',
          data: [],
          borderColor: '#10b981',
          backgroundColor: 'rgba(16,185,129,.15)',
          borderWidth: 2,
          pointRadius: 3,
          tension: 0.4,
          fill: true,
        },
        {
          label: 'Polygon Tx',
          data: [],
          borderColor: '#3b82f6',
          backgroundColor: 'rgba(59,130,246,.15)',
          borderWidth: 2,
          pointRadius: 3,
          tension: 0.4,
          fill: true,
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 300 },
      plugins: {
        legend: { labels: { color: tickColor, font: { size: 11 } } },
      },
      scales: {
        x: { ticks:{ color: tickColor, maxTicksLimit: 8 }, grid:{ color:'rgba(100,116,139,.1)' } },
        y: { ticks:{ color: tickColor }, grid:{ color:'rgba(100,116,139,.1)' }, beginAtZero: true }
      }
    }
  });
}

function updateNetChart() {
  if (!netChartInst) return;
  const label = fmtTime(now());
  const ds = netChartInst.data;
  ds.labels.push(label);
  ds.datasets[0].data.push(state.fabric.txCount);
  ds.datasets[1].data.push(state.polygon.txCount);
  if (ds.labels.length > 10) {
    ds.labels.shift();
    ds.datasets.forEach(d => d.data.shift());
  }
  netChartInst.update();
}

/* ═══════════════════════════════════════════════════════════
   REIMBURSEMENT TIMER
═══════════════════════════════════════════════════════════ */
function startTimer(onDone) {
  const overlay = $('timerOverlay');
  const count   = $('timerCount');
  const bar     = $('timerBar');
  overlay.classList.remove('hidden');
  let secs = 90;
  count.textContent = secs;
  bar.style.width = '100%';
  const iv = setInterval(() => {
    secs--;
    count.textContent = secs;
    bar.style.width = (secs / 90 * 100) + '%';
    if (secs <= 0) {
      clearInterval(iv);
      overlay.classList.add('hidden');
      onDone();
    }
  }, 1000);
  // Pour la démo on accélère (sinon 90 vraies secondes)
  setTimeout(() => {
    clearInterval(iv);
    secs = 0; count.textContent = '0'; bar.style.width = '0%';
    overlay.classList.add('hidden');
    onDone();
  }, 3000);
}

/* ═══════════════════════════════════════════════════════════
   QR CODE GENERATOR
═══════════════════════════════════════════════════════════ */
function generateQR(text, containerId) {
  const container = $(containerId);
  if (!container) return;
  container.innerHTML = '';
  try {
    new QRCode(container, {
      text, width:128, height:128,
      colorDark:'#0b1120', colorLight:'#ffffff',
      correctLevel: QRCode.CorrectLevel.M
    });
  } catch(e) {
    container.innerHTML = `<div style="font-size:11px;color:var(--muted)">${text}</div>`;
  }
}

/* ═══════════════════════════════════════════════════════════
   REAL POLYGON CONTRACT INTEGRATION
   Calls MediChainInsurance.sol on Polygon Amoy when MetaMask
   is connected. Falls back to local simulation otherwise.
═══════════════════════════════════════════════════════════ */

// Minimal ABI — exactly matches MediChainInsurance.sol deployment
const INSURANCE_ABI = [
  'function submitClaim(bytes32 id, address patient, bytes32 diagHash, uint256 amount) external',
  'function validateAndPay(bytes32 id, bytes32 proofHash) external',
  'function getClaim(bytes32 id) external view returns (tuple(address patient, bytes32 diagnosisHash, uint256 amount, uint256 timestamp, uint8 status))',
  'function treasuryBalance() external view returns (uint256)',
  'event ClaimSubmitted(bytes32 indexed id, address indexed patient, uint256 amount)',
  'event ClaimPaid(bytes32 indexed id, address indexed patient, uint256 payout)',
];

function getInsuranceContract() {
  if (!state.walletSigner || state.walletMode !== 'metamask') return null;
  try {
    return new ethers.Contract(DEPLOYED.Insurance, INSURANCE_ABI, state.walletSigner);
  } catch(e) {
    console.warn('[MediChain] could not instantiate contract:', e.message);
    return null;
  }
}

// Try a real on-chain call; on any error fall back to simulation
async function callPolygon(fnName, args, simFallback) {
  const contract = getInsuranceContract();
  if (contract) {
    try {
      const tx = await contract[fnName](...args);
      const receipt = await tx.wait();
      const realTx = {
        id: uid('poly_'), blockNum: receipt.blockNumber,
        type: fnName, payload: simFallback,
        timestamp: new Date().toISOString(),
        hash: receipt.hash || tx.hash,
        gas: Number(receipt.gasUsed || 0),
        contract: DEPLOYED.Insurance,
        contractLink: DEPLOYED.explorer(DEPLOYED.Insurance),
        network: DEPLOYED.network, chainId: DEPLOYED.chainId,
        real: true,
      };
      state.polygon.blocks.push(realTx);
      state.polygon.txCount++;
      state.polygon.gasUsed += realTx.gas;
      appendTxLog('polyLog', realTx, 'polygon');
      updateNetStats(); updateNetChart();
      console.info(`[MediChain] ✅ real tx ${fnName} → ${receipt.hash}`);
      return realTx;
    } catch(err) {
      console.warn(`[MediChain] ⚠ real call ${fnName} failed (${err.reason || err.message}) — falling back to simulation`);
      toast('⚠ Contrat', `Simulation (${err.reason || err.code || 'RPC error'})`, 'warn');
    }
  }
  return polygonTx(fnName, simFallback);
}

/* ═══════════════════════════════════════════════════════════
   BLOCKCHAIN SIMULATION
═══════════════════════════════════════════════════════════ */
async function fabricTx(type, payload) {
  const tx = {
    id: uid('fab_'), blockNum: state.fabric.blocks.length+1,
    type, payload, timestamp: now().toISOString(),
    hash: await sha256(JSON.stringify(payload)+Date.now()),
    org: payload._org || 'Org1.Hospital',
  };
  state.fabric.blocks.push(tx);
  state.fabric.txCount++;
  appendTxLog('fabricLog', tx, 'fabric');
  updateNetStats();
  updateNetChart();
  return tx;
}

async function polygonTx(type, payload) {
  const gas = Math.floor(21000 + Math.random()*80000);
  const hash = await sha256(JSON.stringify(payload)+Date.now()+'poly');
  const tx = {
    id: uid('poly_'), blockNum: state.polygon.blocks.length+1,
    type, payload, timestamp: now().toISOString(),
    hash, gas,
    contract:     DEPLOYED.Insurance,
    contractLink: DEPLOYED.explorer(DEPLOYED.Insurance),
    network:      DEPLOYED.network,
    chainId:      DEPLOYED.chainId,
  };
  state.polygon.blocks.push(tx);
  state.polygon.txCount++;
  state.polygon.gasUsed += gas;
  appendTxLog('polyLog', tx, 'polygon');
  updateNetStats();
  updateNetChart();
  return tx;
}

function appendTxLog(elId, tx, kind) {
  const el = $(elId); if (!el) return;
  const entry = document.createElement('div');
  entry.className = 'tx-entry';
  entry.innerHTML = `<span class="tx-time">[${fmtTime(new Date(tx.timestamp))}]</span><span class="tx-type">${tx.type}</span>#${tx.blockNum} · <span class="tx-hash">${shortHash(tx.hash)}</span>`;
  entry.onclick = () => {
    inspectBlock(tx, kind);
    switchPersona('network');
  };
  el.prepend(entry);
}

function inspectBlock(tx, kind) {
  const inspector = $('blockInspector');
  if (!inspector) return;
  inspector.textContent = JSON.stringify({
    network: kind==='fabric' ? 'Hyperledger Fabric' : 'Polygon Amoy',
    blockNumber: tx.blockNum, transactionId: tx.id, transactionHash: tx.hash,
    type: tx.type, timestamp: tx.timestamp,
    ...(tx.gas ? {gasUsed:tx.gas} : {organization:tx.org}),
    payload: tx.payload,
  }, null, 2);
  inspector.onclick = () => copyText(inspector.textContent, 'Bloc JSON copié');
}

function updateNetStats() {
  $('fabricBlocks').textContent = state.fabric.blocks.length;
  $('fabricTx').textContent     = state.fabric.txCount;
  $('polyBlocks').textContent   = state.polygon.blocks.length;
  $('polyTx').textContent       = state.polygon.txCount;
  $('polyGas').textContent      = state.polygon.gasUsed.toLocaleString();
}

/* ═══════════════════════════════════════════════════════════
   TOASTS
═══════════════════════════════════════════════════════════ */
function toast(title, msg, kind='ok') {
  const c = $('toastContainer');
  if (!c) return;
  const t = document.createElement('div');
  t.className = 'toast ' + (kind==='ok'?'':kind);
  t.innerHTML = `<div class="toast-title">${title}</div><div class="toast-msg">${msg}</div>`;
  c.appendChild(t);
  setTimeout(()=>t.remove(), 4500);
}

/* ═══════════════════════════════════════════════════════════
   MODAL
═══════════════════════════════════════════════════════════ */
function openModal(title, bodyHtml, onConfirm) {
  $('modalTitle').textContent = title;
  $('modalBody').innerHTML = bodyHtml;
  $('modalBackdrop').classList.remove('hidden');
  const btn = $('modalConfirmBtn');
  if (btn) btn.onclick = onConfirm;
}
function closeModal() {
  const mb = $('modalBackdrop');
  if (mb) mb.classList.add('hidden');
}

/* ═══════════════════════════════════════════════════════════
   COPY TO CLIPBOARD
═══════════════════════════════════════════════════════════ */
window.copyText = async function(text, label='Copié !') {
  try {
    await navigator.clipboard.writeText(text);
    toast('📋 ' + label, text.length > 60 ? text.slice(0, 60) + '…' : text, 'info');
    playInfo();
  } catch(e) {
    // Fallback
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); toast('📋 ' + label, '', 'info'); playInfo(); } catch(e2){}
    document.body.removeChild(ta);
  }
};

/* ═══════════════════════════════════════════════════════════
   PERSONA SWITCH (with view transitions)
═══════════════════════════════════════════════════════════ */
function switchPersona(p) {
  const currentView = document.querySelector('.view.active');
  const nextView    = document.getElementById('view-' + p);

  $$('.persona, .tab').forEach(b => b.classList.toggle('active', b.dataset.persona === p));

  if (currentView && nextView && currentView !== nextView) {
    currentView.classList.add('view-out');
    setTimeout(() => {
      currentView.classList.remove('active', 'view-out');
      if (nextView) {
        nextView.classList.add('active', 'view-in');
        setTimeout(() => nextView.classList.remove('view-in'), 300);
      }
    }, 180);
  } else if (nextView) {
    $$('.view').forEach(v => v.classList.toggle('active', v.id === 'view-' + p));
  }

  window.scrollTo({top:0, behavior:'smooth'});
}

/* ═══════════════════════════════════════════════════════════
   CONFETTI
═══════════════════════════════════════════════════════════ */
function launchConfetti() {
  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:9999';
  canvas.width  = window.innerWidth;
  canvas.height = window.innerHeight;
  document.body.appendChild(canvas);
  const ctx = canvas.getContext('2d');

  const colors = ['#10b981','#3b82f6','#f59e0b','#ef4444','#8b5cf6','#ec4899'];
  const particles = [];
  for (let i = 0; i < 120; i++) {
    particles.push({
      x:     Math.random() * canvas.width,
      y:     Math.random() * canvas.height - canvas.height,
      r:     Math.random() * 7 + 3,
      color: colors[Math.floor(Math.random() * colors.length)],
      vx:    (Math.random() - 0.5) * 3,
      vy:    Math.random() * 3 + 2,
      angle: Math.random() * Math.PI * 2,
      spin:  (Math.random() - 0.5) * 0.2,
    });
  }

  let frame = 0;
  const totalFrames = 140;

  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    particles.forEach(p => {
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.angle);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.r / 2, -p.r / 2, p.r, p.r * 0.6);
      ctx.restore();
      p.x     += p.vx;
      p.y     += p.vy;
      p.vy    += 0.07;
      p.angle += p.spin;
    });
    frame++;
    if (frame < totalFrames) {
      requestAnimationFrame(draw);
    } else {
      canvas.remove();
    }
  }
  draw();
}

/* ═══════════════════════════════════════════════════════════
   TOUR GUIDE
═══════════════════════════════════════════════════════════ */
const tourSteps = [
  {
    persona: 'patient',
    title: '👋 Bienvenue sur MediChain+',
    body:  'MediChain+ est une démo interactive d\'une plateforme blockchain de santé. Ce tour guidé vous présente les 5 espaces : Patient, Médecin, Pharmacie, Assureur et Réseau.',
  },
  {
    persona: 'patient',
    title: '🧑‍⚕️ Vue Patient — Salma Ben Ali',
    body:  'L\'espace patient contient le tableau de bord IoT (glucomètre), les consentements SSI/DID, le dossier médical, les ordonnances et les remboursements DeFi. Simulez une mesure avec les boutons.',
  },
  {
    persona: 'patient',
    title: '🔐 Consentements SSI',
    body:  'Le patient accorde ou révoque l\'accès à ses données médicales grâce aux DID W3C et Hyperledger Indy. Chaque consentement est signé avec ECDSA et enregistré sur Fabric.',
  },
  {
    persona: 'doctor',
    title: '👨‍⚕️ Espace Médecin',
    body:  'Le Dr. Karim Hassan reçoit les alertes d\'hyperglycémie en temps réel. Il peut rédiger et signer des ordonnances numériques qui transitent directement vers la pharmacie via Fabric.',
  },
  {
    persona: 'pharmacy',
    title: '💊 Espace Pharmacie',
    body:  'La pharmacie reçoit les ordonnances signées et vérifie les médicaments via QR code blockchain. Essayez le code MED-INS-2024-88421 pour vérifier une Insuline authentique.',
  },
  {
    persona: 'insurer',
    title: '🏦 Espace Assureur — Validation DeFi',
    body:  'L\'assureur valide les réclamations. Un oracle Chainlink vérifie le diagnostic, puis le smart contract Polygon verse automatiquement 85 % du montant en USDC au patient.',
  },
  {
    persona: 'network',
    title: '🌐 Vue Réseau',
    body:  'Consultez les transactions en temps réel sur Hyperledger Fabric et Polygon Amoy. Cliquez sur une entrée du journal pour inspecter le bloc JSON complet.',
  },
  {
    persona: 'patient',
    title: '✅ Tour terminé !',
    body:  'Vous connaissez maintenant MediChain+ ! Raccourcis : touches 1-5 pour changer de vue, D=dark mode, S=son, T=tour, ?=aide. Bonne exploration !',
  },
];

let tourCurrentStep = 0;

function startTour() {
  tourCurrentStep = 0;
  showTourStep();
}

function showTourStep() {
  let overlay = $('tourOverlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'tourOverlay';
    overlay.style.cssText = 'position:fixed;bottom:24px;right:24px;z-index:8000;max-width:340px;width:calc(100% - 48px)';
    document.body.appendChild(overlay);
  }

  const step  = tourSteps[tourCurrentStep];
  const total = tourSteps.length;
  const dots  = tourSteps.map((_, i) =>
    `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;margin:0 3px;background:${i === tourCurrentStep ? '#3b82f6' : 'var(--border, #e2e8f0)'}"></span>`
  ).join('');

  overlay.innerHTML = `
    <div class="tour-box" style="
      background:var(--card,#fff);
      border:1px solid var(--border,#e2e8f0);
      border-radius:16px;
      padding:20px;
      box-shadow:0 8px 32px rgba(0,0,0,.18);
    ">
      <div style="font-weight:700;font-size:15px;margin-bottom:8px">${step.title}</div>
      <div style="font-size:13px;color:var(--muted,#64748b);line-height:1.5;margin-bottom:14px">${step.body}</div>
      <div style="text-align:center;margin-bottom:14px">${dots}</div>
      <div style="display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap">
        <button onclick="window.endTour()" style="
          padding:6px 12px;border-radius:8px;border:1px solid var(--border,#e2e8f0);
          background:transparent;cursor:pointer;font-size:12px;color:var(--muted,#64748b)
        ">Passer</button>
        ${tourCurrentStep > 0 ? `<button onclick="window.prevTourStep()" style="
          padding:6px 12px;border-radius:8px;border:1px solid var(--border,#e2e8f0);
          background:transparent;cursor:pointer;font-size:12px
        ">← Précédent</button>` : ''}
        <button onclick="window.nextTourStep()" style="
          padding:6px 14px;border-radius:8px;border:none;
          background:#3b82f6;color:#fff;cursor:pointer;font-size:12px;font-weight:600
        ">${tourCurrentStep < total - 1 ? 'Suivant →' : '✓ Terminer'}</button>
      </div>
      <div style="font-size:11px;color:var(--muted,#94a3b8);text-align:center;margin-top:8px">${tourCurrentStep+1} / ${total}</div>
    </div>`;

  switchPersona(step.persona);
}

window.nextTourStep = function() {
  if (tourCurrentStep < tourSteps.length - 1) {
    tourCurrentStep++;
    showTourStep();
  } else {
    window.endTour();
  }
};

window.prevTourStep = function() {
  if (tourCurrentStep > 0) {
    tourCurrentStep--;
    showTourStep();
  }
};

window.endTour = function() {
  const overlay = $('tourOverlay');
  if (overlay) overlay.remove();
};

/* ═══════════════════════════════════════════════════════════
   KEYBOARD SHORTCUTS
═══════════════════════════════════════════════════════════ */
function initKeyboardShortcuts() {
  const personaMap = { '1':'patient', '2':'doctor', '3':'pharmacy', '4':'insurer', '5':'network' };

  document.addEventListener('keydown', (e) => {
    const tag = (e.target || document.body).tagName;
    if (['INPUT','TEXTAREA','SELECT'].includes(tag)) return;

    const key = e.key;

    if (personaMap[key]) {
      switchPersona(personaMap[key]);
      return;
    }

    if (key === 'd' || key === 'D') { toggleDark(); return; }
    if (key === 's' || key === 'S') { toggleSound(); return; }
    if (key === 't' || key === 'T') { startTour(); return; }

    if (key === 'Escape') {
      closeModal();
      const cp = $('chatPanel');
      if (cp) cp.classList.add('hidden');
      window.endTour();
      return;
    }

    if (key === '?') {
      toast('⌨️ Raccourcis clavier',
        '1-5 : Changer de vue · D : Dark mode · S : Son · T : Tour · Esc : Fermer · ? : Cette aide',
        'info'
      );
      return;
    }
  });
}

/* ═══════════════════════════════════════════════════════════
   METAMASK (real via ethers.js v6, fallback simulation)
═══════════════════════════════════════════════════════════ */
const AMOY_CHAIN_ID_HEX = '0x13882';          // 80002 en hex
const AMOY_PARAMS = {
  chainId:           AMOY_CHAIN_ID_HEX,
  chainName:         'Polygon Amoy Testnet',
  nativeCurrency:    { name: 'POL', symbol: 'POL', decimals: 18 },
  rpcUrls:           ['https://rpc-amoy.polygon.technology/'],
  blockExplorerUrls: ['https://amoy.polygonscan.com'],
};

async function ensureAmoyNetwork() {
  if (!window.ethereum) return false;
  try {
    await window.ethereum.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: AMOY_CHAIN_ID_HEX }],
    });
    return true;
  } catch (err) {
    // Code 4902 = chain not added
    if (err.code === 4902 || (err.data && err.data.originalError && err.data.originalError.code === 4902)) {
      try {
        await window.ethereum.request({
          method: 'wallet_addEthereumChain',
          params: [AMOY_PARAMS],
        });
        return true;
      } catch (addErr) {
        console.error('Failed to add Amoy network:', addErr);
        return false;
      }
    }
    console.error('Failed to switch to Amoy:', err);
    return false;
  }
}

async function connectWallet() {
  const btn = $('walletBtn');
  if (!btn) return;

  // Disconnect
  if (state.walletConnected) {
    state.walletConnected = false;
    state.walletAddress   = null;
    state.walletMode      = null;
    state.walletSigner    = null;
    state.walletProvider  = null;
    btn.textContent       = '🦊 Connecter';
    btn.classList.remove('wallet-connected');
    toast('🔌 Wallet déconnecté', 'Connexion MetaMask fermée', 'warn');
    return;
  }

  btn.textContent = '⏳ Connexion…';

  // Real MetaMask path (preferred)
  if (window.ethereum && typeof window.ethers !== 'undefined') {
    try {
      const provider  = new window.ethers.BrowserProvider(window.ethereum);
      const accounts  = await provider.send('eth_requestAccounts', []);
      if (!accounts || accounts.length === 0) throw new Error('No account returned');

      await ensureAmoyNetwork();
      const signer  = await provider.getSigner();
      const address = await signer.getAddress();
      const network = await provider.getNetwork();

      state.walletAddress   = address;
      state.walletConnected = true;
      state.walletMode      = 'metamask';
      state.walletSigner    = signer;
      state.walletProvider  = provider;

      const short = address.slice(0, 6) + '…' + address.slice(-4);
      btn.textContent = '🟢 ' + short;
      btn.classList.add('wallet-connected');

      // React to account/network changes
      if (!window._mcListenersBound) {
        window._mcListenersBound = true;
        window.ethereum.on('accountsChanged', () => location.reload());
        window.ethereum.on('chainChanged',    () => location.reload());
      }

      playSuccess();
      toast('🦊 MetaMask connecté', `${short} · chainId ${Number(network.chainId)}`, 'ok');
      await polygonTx('WALLET_CONNECT', {
        mode: 'metamask', address, chainId: Number(network.chainId),
        network: network.name || 'Polygon Amoy', timestamp: now().toISOString(),
      });
      return;
    } catch (err) {
      console.warn('[wallet] MetaMask connect failed, falling back to simulation:', err);
      toast('⚠️ MetaMask', (err && err.message) || 'Connexion refusée, passage en mode démo', 'warn');
    }
  }

  // Fallback : simulation (no MetaMask installed)
  await new Promise(r => setTimeout(r, 900));
  const chars = '0123456789abcdef';
  let addr = '';
  for (let i = 0; i < 40; i++) addr += chars[Math.floor(Math.random() * 16)];
  state.walletAddress   = '0x' + addr;
  state.walletConnected = true;
  state.walletMode      = 'simulated';

  const short = state.walletAddress.slice(0, 6) + '…' + state.walletAddress.slice(-4);
  btn.textContent = '🧪 ' + short;
  btn.classList.add('wallet-connected');

  playSuccess();
  toast('🧪 Mode démo', 'MetaMask absent — wallet simulé', 'info');
  await polygonTx('WALLET_CONNECT', {
    mode: 'simulated', address: state.walletAddress,
    network: 'Polygon Amoy (simulated)', chainId: 80002, timestamp: now().toISOString(),
  });
}
window.connectWallet = connectWallet;

/* Real on-chain message signing (uses MetaMask personal_sign if available) */
async function signWithWallet(message) {
  if (state.walletMode === 'metamask' && state.walletSigner) {
    try {
      return await state.walletSigner.signMessage(message);
    } catch (err) {
      console.warn('[wallet] Signature rejected:', err);
      throw err;
    }
  }
  // Fallback: in-memory ECDSA via existing signMessage()
  return signMessage(message);
}
window.signWithWallet = signWithWallet;

/* ═══════════════════════════════════════════════════════════
   SHARE BUTTON
═══════════════════════════════════════════════════════════ */
async function shareProject() {
  const url   = 'https://nexorasecurity.site';
  const title = 'MediChain+ — Démo Blockchain Healthcare';
  const text  = 'Découvrez MediChain+, une démo interactive de plateforme blockchain pour la santé (Hyperledger Fabric + Polygon + DeFi).';

  if (navigator.share) {
    try {
      await navigator.share({ title, text, url });
      toast('🔗 Partagé !', 'Merci de partager MediChain+', 'ok');
      return;
    } catch(e) {
      if (e.name === 'AbortError') return;
    }
  }

  // Fallback: copy URL
  try {
    await navigator.clipboard.writeText(url);
    toast('🔗 Lien copié !', url, 'info');
    playInfo();
  } catch(e) {
    toast('🔗 Projet', url, 'info');
  }
}
window.shareProject = shareProject;

/* ═══════════════════════════════════════════════════════════
   RENDERERS
═══════════════════════════════════════════════════════════ */
function renderPatient() {
  const didEl = $('patientDid');
  if (didEl) {
    didEl.textContent = state.patient.did;
    // Add copy button next to DID if not already there
    const didWrap = didEl.parentElement;
    if (didWrap && !didWrap.querySelector('.copy-btn-did')) {
      const cpBtn = document.createElement('button');
      cpBtn.className = 'copy-btn copy-btn-did btn-outline';
      cpBtn.textContent = '📋';
      cpBtn.title = 'Copier DID';
      cpBtn.style.cssText = 'margin-left:6px;padding:2px 6px;font-size:11px;vertical-align:middle';
      cpBtn.onclick = (e) => { e.stopPropagation(); copyText(state.patient.did, 'DID copié'); };
      didEl.after(cpBtn);
    }
  }

  const balEl = $('patientBalance');
  if (balEl) balEl.textContent = state.patient.balance.toFixed(2);

  const cEl = $('consentList');
  if (cEl) {
    cEl.innerHTML = state.patient.consents.length===0
      ? '<div class="empty">Aucun consentement actif</div>'
      : state.patient.consents.map(c=>`
        <div class="consent-item">
          <div><div class="who">${esc(c.to)}</div><div class="when">Expire : ${fmtDate(new Date(c.expires))}</div></div>
          <button onclick="revokeConsent('${c.id}')">Révoquer</button>
        </div>`).join('');
  }

  const rEl = $('recordList');
  if (rEl) {
    rEl.innerHTML = state.patient.records.length===0
      ? '<div class="empty">Aucune donnée</div>'
      : state.patient.records.slice().reverse().map(r=>`
        <div class="record-item">
          <div class="rec-type">${esc(r.type)}</div>
          <div class="rec-val">${esc(r.value)}</div>
          <div class="rec-meta">${fmtDate(new Date(r.ts))} · <span class="hash-text">${shortHash(r.hash)}</span>
            <button class="copy-btn btn-outline" onclick="copyText('${r.hash}','Hash copié')" title="Copier hash" style="padding:1px 5px;font-size:10px;margin-left:4px">📋</button>
          </div>
        </div>`).join('');
  }

  const pEl = $('prescriptionList');
  if (pEl) {
    pEl.innerHTML = state.patient.prescriptions.length===0
      ? '<div class="empty">Aucune ordonnance</div>'
      : state.patient.prescriptions.slice().reverse().map(p=>`
        <div class="rx-item">
          <div class="rx-med">${esc(p.med)}</div>
          <div>${esc(p.dose)} · ${p.price} USDC</div>
          <div class="rec-meta">${esc(p.doctor)} · ${fmtDate(new Date(p.ts))}</div>
        </div>`).join('');
  }

  const clEl = $('claimList');
  if (clEl) {
    clEl.innerHTML = state.patient.claims.length===0
      ? '<div class="empty">Aucun remboursement</div>'
      : state.patient.claims.slice().reverse().map(c=>`
        <div class="claim-item">
          <div><span class="claim-amount">${c.payout.toFixed(2)} USDC</span>
          <span class="claim-status status-${c.status}">${statusLabel(c.status)}</span></div>
          <div class="rec-meta">${esc(c.reason)} · ${fmtDate(new Date(c.ts))}</div>
        </div>`).join('');
  }
}

const statusLabel = s => ({pending:'⏳ En attente',validated:'✓ Validé',paid:'💰 Payé'}[s]||s);

function renderDoctor() {
  const alEl = $('doctorAlerts');
  if (alEl) {
    alEl.innerHTML = state.doctor.alerts.length===0
      ? '<div class="empty">Aucune alerte</div>'
      : state.doctor.alerts.slice().reverse().map(a=>`
        <div class="alert-item">
          <strong>⚠ ${esc(a.title)}</strong><div>${esc(a.body)}</div>
          <div class="rec-meta">${fmtDate(new Date(a.ts))}</div>
        </div>`).join('');
  }

  const acc = $('doctorAccess');
  if (acc) {
    const consent = state.patient.consents.find(c=>c.to.includes('Karim'));
    acc.innerHTML = consent
      ? `<div style="background:var(--green-light);padding:12px;border-radius:10px;margin-bottom:10px;font-size:13px">
          ✅ Accès accordé · Expire ${fmtDate(new Date(consent.expires))}</div>
          ${state.patient.records.slice(-5).reverse().map(r=>`
          <div class="record-item"><div class="rec-type">${r.type}</div>
          <div class="rec-val">${r.value}</div>
          <div class="rec-meta">${fmtDate(new Date(r.ts))}</div></div>`).join('')}`
      : '<p class="muted">Aucun consentement. Accordez l\'accès depuis la vue Patient.</p>';
  }
}

function renderPharmacy() {
  const inbEl = $('pharmacyInbox');
  if (inbEl) {
    inbEl.innerHTML = state.pharmacy.inbox.length===0
      ? '<div class="empty">Aucune ordonnance</div>'
      : state.pharmacy.inbox.slice().reverse().map(p=>`
        <div class="inbox-item">
          <strong>${esc(p.med)}</strong><div>Patient : ${esc(p.patient)} · ${esc(p.dose)}</div>
          <div class="rec-meta">Signé par ${esc(p.doctor)} · <span class="hash-text">${shortHash(p.hash)}</span>
            <button class="copy-btn btn-outline" onclick="copyText('${p.hash}','Hash ordonnance copié')" title="Copier hash" style="padding:1px 5px;font-size:10px;margin-left:4px">📋</button>
          </div>
        </div>`).join('');
  }

  const stEl = $('stockTable');
  if (stEl) {
    stEl.innerHTML = state.pharmacy.stock.map(m=>`
      <tr>
        <td><code>${m.code}</code>
          <button class="copy-btn btn-outline" onclick="copyText('${m.code}','Code copié')" title="Copier code" style="padding:1px 5px;font-size:10px;margin-left:4px">📋</button>
        </td>
        <td>${m.name}</td>
        <td><code>${m.lot}</code></td>
        <td>${m.maker}</td>
        <td>${m.chain.length} étapes</td>
        <td>${m.ok ? `<button class="btn-outline" onclick="showQR('${m.code}','${m.name}')">📷 QR</button>` : '—'}</td>
        <td>${m.ok?'<span style="color:#059669">✓ Auth</span>':'<span style="color:#dc2626">✗ Suspect</span>'}</td>
      </tr>`).join('');
  }
}

function renderInsurer() {
  const ibEl = $('insurerBalance');
  if (ibEl) ibEl.textContent = state.insurer.balance.toFixed(2);
  const stTotal = $('statTotal');
  const stPaid  = $('statPaid');
  if (stTotal) stTotal.textContent = state.insurer.claims.length;
  if (stPaid)  stPaid.textContent  = state.insurer.claims.filter(c=>c.status==='paid').length;

  const tEl = $('insurerClaims');
  if (tEl) {
    tEl.innerHTML = state.insurer.claims.length===0
      ? '<tr><td colspan="6" style="text-align:center;padding:20px;color:var(--muted)">Aucune réclamation</td></tr>'
      : state.insurer.claims.slice().reverse().map(c=>`
        <tr>
          <td><code>${c.id.slice(0,10)}</code></td>
          <td>${esc(c.patientName)}</td>
          <td><code>${shortHash(c.diagnosisHash)}</code>
            <button class="copy-btn btn-outline" onclick="copyText('${c.diagnosisHash}','Hash diagnostic copié')" title="Copier hash" style="padding:1px 5px;font-size:10px;margin-left:4px">📋</button>
          </td>
          <td>${c.amount.toFixed(2)} USDC</td>
          <td><span class="claim-status status-${c.status}">${statusLabel(c.status)}</span></td>
          <td>${c.status==='pending'?`<button class="btn-outline" onclick="validateClaim('${c.id}')">Valider & payer</button>`:'—'}</td>
        </tr>`).join('');
  }
}

function renderAll() {
  renderPatient(); renderDoctor(); renderPharmacy(); renderInsurer(); updateNetStats();
}

/* ═══════════════════════════════════════════════════════════
   CORE ACTIONS
═══════════════════════════════════════════════════════════ */
async function recordGlucose(value, isHigh) {
  const gaugeBox = $('gaugeBox');
  if (gaugeBox) gaugeBox.classList.toggle('high', isHigh);
  const gv = $('glucoseValue');
  const gs = $('glucoseState');
  if (gv) gv.textContent = value.toFixed(2);
  if (gs) gs.textContent = isHigh ? 'Hyperglycémie' : 'Normal';

  const record = { id:uid('rec_'), type:'Glycémie (IoT)', value:`${value.toFixed(2)} g/L ${isHigh?'⚠️':'✓'}`, ts:now().toISOString() };
  const sig = await signMessage(JSON.stringify(record));
  record.signature = sig; record.hash = await sha256(JSON.stringify(record));
  state.patient.records.push(record);
  state.glucoseHistory.push({ time: fmtTime(now()), value });
  addGlucosePoint(value, isHigh);

  await fabricTx('RECORD_GLUCOSE', { patient:state.patient.did, recordId:record.id, hash:record.hash, signature:shortHash(sig), _org:'Org1.Hospital' });

  if (isHigh) {
    playAlert();
    state.doctor.alerts.push({ id:uid('al_'), title:`Hyperglycémie — ${state.patient.name}`, body:`Glycémie à ${value.toFixed(2)} g/L`, ts:now().toISOString() });
    toast('📡 Mesure enregistrée', `${value.toFixed(2)} g/L — Alerte envoyée au Dr. Karim`, 'warn');
  } else {
    playInfo();
    toast('📡 Mesure enregistrée', `${value.toFixed(2)} g/L — Normal`, 'info');
  }
  renderAll();
}

function openGrantConsent() {
  openModal('Accorder un accès', `
    <div class="form-row"><label>À qui ?</label>
    <select id="consentTo">
      <option>Dr. Karim Hassan (Endocrinologue)</option>
      <option>Dr. Nadia Trabelsi (Généraliste)</option>
      <option>Laboratoire CentralBio</option>
    </select></div>
    <div class="form-row"><label>Durée</label>
    <select id="consentDur">
      <option value="1">1 heure</option>
      <option value="24" selected>24 heures</option>
      <option value="168">7 jours</option>
    </select></div>
    <div class="modal-actions">
      <button class="btn-ghost" style="background:#e2e8f0;color:#334155" onclick="closeModal()">Annuler</button>
      <button id="modalConfirmBtn" class="btn-primary">🔏 Signer</button>
    </div>`, grantConsent);
}

async function grantConsent() {
  const toEl  = $('consentTo');
  const durEl = $('consentDur');
  if (!toEl || !durEl) return;
  const to    = toEl.value;
  const hours = parseInt(durEl.value);
  const consent = { id:uid('cons_'), to, expires:new Date(Date.now()+hours*3600000).toISOString(), ts:now().toISOString() };
  const sig = await signMessage(JSON.stringify(consent));
  consent.signature = sig;
  state.patient.consents.push(consent);
  await fabricTx('GRANT_CONSENT', { patient:state.patient.did, to, expiresAt:consent.expires, _org:'Org1.Hospital' });
  playSuccess();
  toast('✅ Consentement', `Accès accordé à ${to} pour ${hours}h`);
  closeModal(); renderAll();
}

window.revokeConsent = async function(id) {
  state.patient.consents = state.patient.consents.filter(c=>c.id!==id);
  await fabricTx('REVOKE_CONSENT', { patient:state.patient.did, consentId:id, _org:'Org1.Hospital' });
  playInfo();
  toast('🚫 Consentement révoqué', 'Accès retiré immédiatement', 'warn');
  renderAll();
};

async function signPrescription() {
  const medEl   = $('rxMed');
  const doseEl  = $('rxDose');
  const priceEl = $('rxPrice');
  const med   = medEl ? medEl.value : 'Médicament';
  const dose  = (doseEl && doseEl.value) ? doseEl.value : 'Voir notice';
  const price = (priceEl && priceEl.value) ? parseFloat(priceEl.value) : 50;
  const rx = { id:uid('rx_'), med, dose, price, patient:state.patient.did, doctor:state.doctor.name, ts:now().toISOString() };
  rx.hash = await sha256(JSON.stringify(rx));
  state.patient.prescriptions.push(rx);
  state.pharmacy.inbox.push({ ...rx, patient:state.patient.name });
  await fabricTx('ISSUE_PRESCRIPTION', { rxId:rx.id, patient:state.patient.did, doctor:state.doctor.did, medication:med, hash:rx.hash, _org:'Org1.Hospital' });

  const claim = { id:uid('claim_'), patientName:state.patient.name, patientAddr:state.patient.address, diagnosisHash:rx.hash, amount:price, payout:price*state.insurer.coveragePercent/100, reason:`Ordonnance : ${med}`, status:'pending', ts:now().toISOString() };
  state.insurer.claims.push(claim);
  state.patient.claims.push(claim);
  // Real ethers.Contract call when MetaMask on Amoy, simulation fallback otherwise
  const claimId32  = ethers.id(claim.id);           // bytes32 from claim id
  const diagHash32 = ethers.id(rx.hash);             // bytes32 from diagnosis hash
  const amountUsdc = BigInt(Math.round(price * 1e6)); // USDC 6 decimals
  const patientAddr = (state.walletAddress && state.walletAddress.startsWith('0x') && state.walletMode === 'metamask')
    ? state.walletAddress : ethers.ZeroAddress;
  await callPolygon('submitClaim',
    [claimId32, patientAddr, diagHash32, amountUsdc],
    { claimId:claim.id, patient:patientAddr, diagnosisHash:rx.hash, amount:price });
  playInfo();
  toast('🔏 Ordonnance signée', `${med} → pharmacie + réclamation créée`);
  renderAll();
}

window.validateClaim = async function(claimId) {
  const claim = state.insurer.claims.find(c=>c.id===claimId);
  if (!claim || claim.status!=='pending') return;

  // Real validateAndPay when MetaMask on Amoy (oracle = deployer = connected wallet)
  const claimId32  = ethers.id(claimId);
  const proofHash  = ethers.id(claim.diagnosisHash);
  await callPolygon('validateAndPay',
    [claimId32, proofHash],
    { claimId, oracleProof: claim.diagnosisHash, validator: 'ChainlinkOracle' });

  claim.status = 'validated';
  renderAll();
  toast('✓ Oracle actif', 'Vérification du diagnostic en cours…', 'info');

  startTimer(async () => {
    if (state.insurer.balance < claim.payout) { toast('❌ Fonds insuffisants','','err'); return; }
    state.insurer.balance -= claim.payout;
    state.patient.balance += claim.payout;
    claim.status = 'paid';
    // En mode simulation seulement — en mode réel, ClaimPaid est émis dans la même tx que validateAndPay
    if (state.walletMode !== 'metamask') {
      await polygonTx('ClaimPaid', { claimId, patient:claim.patientAddr, amount:claim.payout, stablecoin:'USDC' });
    }
    addClaimsPoint(claim.reason.replace('Ordonnance : ',''), claim.amount, claim.payout);
    playSuccess();
    launchConfetti();
    toast('💰 Remboursement effectué', `+${claim.payout.toFixed(2)} USDC → wallet Salma`);
    renderAll();
  });
};

function verifyQr() {
  const codeEl = $('qrInput');
  const result = $('qrResult');
  const qrBox  = $('qrCodeDisplay');
  const qrCnv  = $('qrCodeCanvas');
  const qrLbl  = $('qrCodeLabel');
  if (!codeEl) return;
  const code = codeEl.value.trim();
  if (!code) { if(result){result.className='err'; result.style.display='block'; result.innerHTML='⚠ Entrez un code';} return; }
  const med = state.pharmacy.stock.find(m=>m.code===code);
  if (!med || !med.ok) {
    if (result) { result.className='err'; result.style.display='block'; result.innerHTML=`<strong>❌ CONTREFAÇON DÉTECTÉE</strong><br/>Ce médicament n'est pas authentifié sur la blockchain.`; }
    if (qrBox) qrBox.classList.add('hidden');
    playAlert();
    fabricTx('VERIFY_MED_FAIL',{code,result:'counterfeit',_org:'Org3.Pharmacy'});
    return;
  }
  if (result) {
    result.className='ok'; result.style.display='block';
    result.innerHTML=`<strong>✅ Médicament authentique</strong><br/><b>${med.name}</b> · Lot ${med.lot}<br/>
    ${med.chain.map((s,i)=>`<span style="display:inline-block;padding:2px 8px;background:var(--green-light);border-radius:8px;margin:2px;font-size:11px">${i+1}. ${s}</span>`).join(' → ')}`;
  }
  if (qrBox) qrBox.classList.remove('hidden');
  if (qrCnv) qrCnv.innerHTML='';
  generateQR(code, 'qrCodeCanvas');
  if (qrLbl) qrLbl.textContent = code;
  playSuccess();
  fabricTx('VERIFY_MED_OK',{code,maker:med.maker,lot:med.lot,_org:'Org3.Pharmacy'});
}

window.showQR = function(code, name) {
  openModal(`QR Code — ${name}`, `
    <div style="text-align:center;padding:10px">
      <div id="modalQrCanvas" style="display:inline-block;padding:16px;background:#fff;border-radius:12px;box-shadow:0 4px 16px rgba(0,0,0,.1)"></div>
      <div style="margin-top:12px;font-family:monospace;font-size:12px;color:var(--muted)">${code}</div>
      <p style="margin-top:8px;font-size:13px;color:var(--muted)">Scannez ce QR code pour vérifier l'authenticité</p>
    </div>
    <div class="modal-actions"><button class="btn-primary" onclick="closeModal()">Fermer</button></div>`,
    null
  );
  setTimeout(() => generateQR(code, 'modalQrCanvas'), 100);
};

/* ═══════════════════════════════════════════════════════════
   CHATBOT
═══════════════════════════════════════════════════════════ */
const faq = [
  { q:['hyperledger','fabric','dme','dossier'], r:'MediChain+ utilise Hyperledger Fabric pour les Dossiers Médicaux Électroniques. C\'est une blockchain permissionnée avec 3 organisations : Hôpital, Laboratoire et Pharmacie.' },
  { q:['defi','assurance','remboursement','usdc'], r:'La micro-assurance DeFi est gérée par un smart contract Solidity sur Polygon. Le remboursement est automatique (85%) en USDC dès qu\'un oracle Chainlink valide le diagnostic.' },
  { q:['iot','glucometre','capteur'], r:'Les capteurs IoT (glucomètre, tensiomètre) signent chaque mesure avec ECDSA secp256k1 avant de l\'envoyer via MQTT/TLS. Cela garantit l\'intégrité des données médicales.' },
  { q:['ssi','did','identite','consentement'], r:'L\'identité auto-souveraine (SSI) est basée sur les standards DID W3C et Hyperledger Indy. Le patient contrôle qui accède à ses données via des Verifiable Credentials.' },
  { q:['qr','medicament','contrefacon'], r:'Chaque médicament a un QR code unique enregistré sur Fabric. Scanner ce code permet de vérifier toute la chaîne : fabricant → distributeur → pharmacie, pour lutter contre les contrefaçons.' },
  { q:['ia','federe','fedchain'], r:'L\'IA fédérée (FedChain) permet aux hôpitaux d\'entraîner ensemble des modèles médicaux sans partager leurs données brutes. Seuls les gradients agrégés transitent sur la blockchain.' },
  { q:['solidity','smart contract','polygon'], r:'Le smart contract MediChainInsurance.sol est déployé sur Polygon Amoy (chain ID 80002). Il utilise AccessControl, ReentrancyGuard et Pausable d\'OpenZeppelin pour la sécurité.' },
  { q:['budget','cout','prix'], r:'Le budget total du projet est estimé à ~310 USD, réductible à ~115 USD avec les crédits AWS Educate. L\'infrastructure utilise uniquement des outils open-source gratuits.' },
  { q:['tour','guide','visite'], r:'Appuyez sur le bouton Tour ou la touche T pour lancer le tour guidé en 8 étapes. Il vous présentera chaque espace de la démo interactive.' },
  { q:['raccourci','clavier','shortcut','touches'], r:'Raccourcis : 1-5 = changer de vue, D = dark mode, S = son, T = tour guidé, Échap = fermer, ? = afficher l\'aide des raccourcis.' },
  { q:['bonjour','salut','hello','hi'], r:'Bonjour ! Je suis l\'assistant MediChain+. Je peux répondre à vos questions sur la blockchain, le DeFi, la sécurité IoT, ou le code du projet.' },
  { q:['merci','thanks'], r:'Avec plaisir ! N\'hésitez pas si vous avez d\'autres questions sur MediChain+ 🚀' },
];

function chatbotReply(input) {
  const low = input.toLowerCase();
  const match = faq.find(f => f.q.some(k => low.includes(k)));
  return match ? match.r : 'Je n\'ai pas de réponse précise à cette question. Consultez la section correspondante dans la présentation du projet (nexorasecurity.site) ou posez une question sur Hyperledger, DeFi, IoT, SSI, QR code ou le budget.';
}

function initChatbot() {
  const btn   = $('chatbotBtn');
  const panel = $('chatPanel');
  const close = $('chatClose');
  const input = $('chatInput');
  const send  = $('chatSend');

  if (!btn || !panel || !close || !input || !send) return;

  btn.onclick   = () => { panel.classList.toggle('hidden'); if (!panel.classList.contains('hidden')) input.focus(); };
  close.onclick = () => panel.classList.add('hidden');

  function sendMsg() {
    const txt = input.value.trim(); if (!txt) return;
    addChatMsg(txt, 'user');
    input.value = '';
    setTimeout(() => addChatMsg(chatbotReply(txt), 'bot'), 600);
  }
  send.onclick = sendMsg;
  input.addEventListener('keydown', e => { if (e.key==='Enter') sendMsg(); });
}

function addChatMsg(text, who) {
  const msgs = $('chatMessages');
  if (!msgs) return;
  const div  = document.createElement('div');
  div.className = 'chat-msg ' + who;
  div.textContent = text;
  msgs.appendChild(div);
  msgs.scrollTop = msgs.scrollHeight;
}

/* ═══════════════════════════════════════════════════════════
   SCROLL ANIMATIONS
═══════════════════════════════════════════════════════════ */
function initScrollAnimations() {
  const obs = new IntersectionObserver(entries => {
    entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('visible'); obs.unobserve(e.target); } });
  }, { threshold: 0.1 });
  $$('.animate-in').forEach(el => obs.observe(el));
}

/* ═══════════════════════════════════════════════════════════
   RESET
═══════════════════════════════════════════════════════════ */
function resetAll() {
  if (!confirm('Réinitialiser toutes les données ?')) return;
  location.reload();
}

/* ═══════════════════════════════════════════════════════════
   GLOBAL WINDOW EXPORTS
═══════════════════════════════════════════════════════════ */
window.revokeConsent  = window.revokeConsent;
window.validateClaim  = window.validateClaim;
window.closeModal     = closeModal;
window.showQR         = window.showQR;
window.connectWallet  = connectWallet;
window.shareProject   = shareProject;
window.startTour      = startTour;

/* ═══════════════════════════════════════════════════════════
   INIT
═══════════════════════════════════════════════════════════ */
async function init() {
  // 1. Load saved preferences first
  loadPrefs();

  // 2. Splash with correct language
  hideSplash();

  // 3. Crypto
  await initCrypto();

  // 4. Apply saved dark / lang state
  applyDark();
  applyLang();

  // 5. Apply saved sound button state
  const soundBtn = $('soundBtn');
  if (soundBtn) soundBtn.textContent = state.soundOn ? '🔔' : '🔕';

  // 6. Persona switch
  $$('.persona, .tab').forEach(btn => btn.addEventListener('click', () => switchPersona(btn.dataset.persona)));

  // 7. Core buttons
  const sn = $('simulateNormal');  if (sn) sn.onclick = () => recordGlucose(+(0.9+Math.random()*0.4).toFixed(2), false);
  const sh = $('simulateHigh');    if (sh) sh.onclick  = () => recordGlucose(+(2.2+Math.random()*0.8).toFixed(2), true);
  const gcb = $('grantConsentBtn'); if (gcb) gcb.onclick = openGrantConsent;
  const srx = $('signRxBtn');       if (srx) srx.onclick = signPrescription;
  const vqr = $('verifyQrBtn');     if (vqr) vqr.onclick = verifyQr;
  const rst = $('resetBtn');        if (rst) rst.onclick  = resetAll;
  const mc  = $('modalClose');      if (mc)  mc.onclick   = closeModal;
  const db  = $('darkBtn');         if (db)  db.onclick   = toggleDark;
  const sb  = $('soundBtn');        if (sb)  sb.onclick   = toggleSound;
  const lb  = $('langBtn');         if (lb)  lb.onclick   = toggleLang;
  const mb  = $('modalBackdrop');   if (mb)  mb.onclick   = e => { if (e.target.id==='modalBackdrop') closeModal(); };

  // 8. New feature buttons
  const tourBtn  = $('tourBtn');  if (tourBtn)  tourBtn.onclick  = startTour;
  const shareBtn = $('shareBtn'); if (shareBtn) shareBtn.onclick = shareProject;
  const walletBtn= $('walletBtn');if (walletBtn)walletBtn.onclick= connectWallet;

  // 9. Init charts
  initGlucoseChart();
  initClaimsChart();
  initNetChart();

  // 10. Init other systems
  initChatbot();
  initScrollAnimations();
  initKeyboardShortcuts();

  // 11. Genesis blocks
  await fabricTx('GENESIS', { network:'MediChain+', organizations:['Org1.Hospital','Org2.Laboratory','Org3.Pharmacy'], _org:'System' });
  await polygonTx('deployContract', { contract:'MediChainInsurance', address:DEPLOYED.Insurance, treasury:'10000 USDC' });

  // 12. Render
  renderAll();

  // 13. Welcome toast
  toast('⚕ MediChain+ v3.0 prêt', 'T: Tour guidé · ?: Raccourcis · 💬: Chatbot', 'info');
  playSuccess();

  // 14. Register service worker
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }
}

init();
