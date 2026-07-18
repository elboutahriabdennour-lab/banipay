// BANIPAY — stats.js

function renderDashboard() {
  const f = STATE.factures;
  const totalRecv = f.filter(x => x.statut !== 'payee').reduce((s,x) => s + Number(x.ttc), 0);
  const totalPayee = f.filter(x => x.statut === 'payee').reduce((s,x) => s + Number(x.ttc), 0);
  const totalAttente = f.filter(x => ['attente','envoyee'].includes(x.statut)).reduce((s,x) => s + Number(x.ttc), 0);
  const totalRetard = f.filter(x => x.statut === 'retard').reduce((s,x) => s + Number(x.ttc), 0);
  const actives = f.filter(x => x.statut !== 'payee').length;

  setEl('hero-total', fmt(totalRecv) + ' MAD');
  setEl('hero-sub', actives + ' facture(s) active(s)');
  setEl('stat-payee', fmtInt(totalPayee));
  setEl('stat-attente', fmtInt(totalAttente));
  setEl('stat-retard', fmtInt(totalRetard));

  // Avatar
  const meta = sb.user?.user_metadata || {};
  const nom = meta.nom || sb.user?.email || 'U';
  const av = el('user-avatar');
  if (av) av.textContent = nom.split(' ').slice(0,2).map(w => w[0]||'').join('').toUpperCase() || nom[0].toUpperCase();

  // Alerte retard
  const ab = el('alerte-bar');
  if (ab) {
    if (totalRetard > 0) {
      ab.classList.remove('hidden');
      setEl('alerte-text', `${f.filter(x=>x.statut==='retard').length} facture(s) en retard — ${fmtInt(totalRetard)} MAD`);
    } else ab.classList.add('hidden');
  }

  // Objectif mensuel
  renderObjectifMensuel();
  genNotifications();
  renderFactureList();
}

function renderStats() {
  const f = STATE.factures || [];
  const d = STATE.devis || [];
  const now = new Date();
  const thisMonth = now.getMonth();
  const thisYear = now.getFullYear();

  // ── KPIs globaux ──────────────────────────────────────────
  const caTotal = f.reduce((s,x) => s + (Number(x.ttc)||0), 0);
  const caEncaisse = f.filter(x=>x.statut==='payee').reduce((s,x) => s + (Number(x.ttc)||0), 0);
  const caEnAttente = f.filter(x=>['attente','envoyee'].includes(x.statut)).reduce((s,x) => s + (Number(x.ttc)||0), 0);
  const caEnRetard = f.filter(x=>x.statut==='retard').reduce((s,x) => s + (Number(x.ttc)||0), 0);
  const txRecouvrement = caTotal > 0 ? Math.round(caEncaisse/caTotal*100) : 0;

  // ── Mois en cours ──────────────────────────────────────────
  const fMois = f.filter(x => {
    const dt = new Date(x.date_emission||'');
    return dt.getMonth()===thisMonth && dt.getFullYear()===thisYear;
  });
  const caMois = fMois.reduce((s,x) => s + (Number(x.ttc)||0), 0);

  // ── 12 mois ──────────────────────────────────────────────
  const months = [];
  for (let i = 11; i >= 0; i--) {
    const dt = new Date(thisYear, thisMonth - i, 1);
    months.push({
      label: dt.toLocaleDateString('fr-FR', {month:'short'}),
      month: dt.getMonth(), year: dt.getFullYear(),
      ca: 0, paye: 0
    });
  }
  f.forEach(fac => {
    const dt = new Date(fac.date_emission||'');
    const m = months.find(x => x.month===dt.getMonth() && x.year===dt.getFullYear());
    if (m) { m.ca += Number(fac.ttc)||0; if(fac.statut==='payee') m.paye += Number(fac.ttc)||0; }
  });
  const maxCA = Math.max(...months.map(m=>m.ca), 1);

  // ── Top clients ───────────────────────────────────────────
  const clientMap = {};
  f.forEach(fac => {
    if (!fac.client) return;
    if (!clientMap[fac.client]) clientMap[fac.client] = {nom:fac.client, ca:0, count:0};
    clientMap[fac.client].ca += Number(fac.ttc)||0;
    clientMap[fac.client].count++;
  });
  const topClients = Object.values(clientMap).sort((a,b)=>b.ca-a.ca).slice(0,5);
  const maxClient = topClients[0]?.ca || 1;

  // ── Render ────────────────────────────────────────────────
  const grid = el('stats-grid');
  if (grid) grid.innerHTML = `
    <div style="background:#fff;border-radius:16px;padding:16px;border:1px solid #F1F5F9;grid-column:span 2">
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px">
        <div style="text-align:center">
          <div style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:#94A3B8;margin-bottom:6px">CA Total</div>
          <div style="font-size:18px;font-weight:800;color:#0F172A">${fmt(caTotal)}</div>
          <div style="font-size:9px;color:#64748B">MAD</div>
        </div>
        <div style="text-align:center;border-left:1px solid #F1F5F9;padding-left:8px">
          <div style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:#94A3B8;margin-bottom:6px">Encaissé</div>
          <div style="font-size:18px;font-weight:800;color:#059669">${fmt(caEncaisse)}</div>
          <div style="font-size:9px;color:#059669">${txRecouvrement}%</div>
        </div>
        <div style="text-align:center;border-left:1px solid #F1F5F9;padding-left:8px">
          <div style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:#94A3B8;margin-bottom:6px">En attente</div>
          <div style="font-size:18px;font-weight:800;color:#D97706">${fmt(caEnAttente)}</div>
          <div style="font-size:9px;color:#64748B">MAD</div>
        </div>
        <div style="text-align:center;border-left:1px solid #F1F5F9;padding-left:8px">
          <div style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:#94A3B8;margin-bottom:6px">En retard</div>
          <div style="font-size:18px;font-weight:800;color:#EF4444">${fmt(caEnRetard)}</div>
          <div style="font-size:9px;color:#64748B">MAD</div>
        </div>
      </div>
      <div style="margin-top:12px;height:6px;background:#F1F5F9;border-radius:3px;overflow:hidden">
        <div style="height:100%;background:linear-gradient(90deg,#059669 ${txRecouvrement}%,#D97706 ${txRecouvrement}%,#D97706 ${txRecouvrement+Math.round(caEnAttente/caTotal*100)}%,#EF4444 0%);border-radius:3px"></div>
      </div>
      <div style="font-size:10px;color:#94A3B8;margin-top:4px;text-align:right">Taux recouvrement: ${txRecouvrement}%</div>
    </div>
  `;

  // Courbe mensuelle
  const monthly = el('sa-monthly');
  if (monthly) {
    const W=300, H=100, PX=24, PY=16;
    const pts = months.map((m,i) => ({
      x: PX + i*(W-PX*2)/(months.length-1),
      y: PY + (1 - m.ca/maxCA)*(H-PY*2),
      yp: PY + (1 - m.paye/maxCA)*(H-PY*2),
      m
    }));
    const path = pts.map((p,i) => (i===0?'M':'L')+p.x.toFixed(1)+','+p.y.toFixed(1)).join(' ');
    const pathP = pts.map((p,i) => (i===0?'M':'L')+p.x.toFixed(1)+','+p.yp.toFixed(1)).join(' ');
    const area = path+' L'+pts[pts.length-1].x.toFixed(1)+','+(H-PY)+' L'+PX+','+(H-PY)+' Z';

    monthly.innerHTML = `
      <div style="background:#fff;border-radius:16px;padding:16px;border:1px solid #F1F5F9;margin-top:12px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
          <div style="font-size:13px;font-weight:700;color:#0F172A">📈 CA mensuel</div>
          <div style="font-size:11px;color:#64748B">Ce mois: <strong style="color:#2563EB">${fmt(caMois)} MAD</strong></div>
        </div>
        <svg width="100%" viewBox="0 0 ${W} ${H}" style="overflow:visible">
          <defs>
            <linearGradient id="g1" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stop-color="#2563EB" stop-opacity="0.15"/>
              <stop offset="100%" stop-color="#2563EB" stop-opacity="0"/>
            </linearGradient>
          </defs>
          <path d="${area}" fill="url(#g1)"/>
          <path d="${path}" fill="none" stroke="#2563EB" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          <path d="${pathP}" fill="none" stroke="#059669" stroke-width="1.5" stroke-dasharray="4,3" stroke-linecap="round"/>
          ${pts.map(p=>`<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="3" fill="#2563EB" stroke="#fff" stroke-width="1.5"/>`).join('')}
          ${pts.filter((_,i)=>i%2===0||i===pts.length-1).map(p=>`<text x="${p.x.toFixed(1)}" y="${H}" text-anchor="middle" font-size="8" fill="#94A3B8">${p.m.label}</text>`).join('')}
        </svg>
        <div style="display:flex;gap:16px;margin-top:6px;font-size:10px">
          <span style="color:#2563EB">— CA facturé</span>
          <span style="color:#059669">- - Encaissé</span>
        </div>
      </div>`;
  }

  // Top clients
  const topEl = el('sa-top-clients');
  if (topEl && topClients.length) {
    topEl.innerHTML = `
      <div style="background:#fff;border-radius:16px;padding:16px;border:1px solid #F1F5F9;margin-top:12px">
        <div style="font-size:13px;font-weight:700;color:#0F172A;margin-bottom:14px">🏆 Top clients</div>
        ${topClients.map((c,i)=>`
          <div style="margin-bottom:12px">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
              <div style="display:flex;align-items:center;gap:8px">
                <div style="width:22px;height:22px;border-radius:50%;background:${['#2563EB','#059669','#D97706','#9333EA','#EF4444'][i]};color:#fff;font-size:10px;font-weight:700;display:flex;align-items:center;justify-content:center">${i+1}</div>
                <span style="font-size:12px;font-weight:600">${escapeHTML(c.nom)}</span>
              </div>
              <span style="font-size:12px;font-weight:700;color:#0F172A">${fmt(c.ca)} MAD</span>
            </div>
            <div style="height:5px;background:#F1F5F9;border-radius:3px">
              <div style="height:100%;background:${['#2563EB','#059669','#D97706','#9333EA','#EF4444'][i]};border-radius:3px;width:${Math.round(c.ca/maxClient*100)}%;transition:width 0.6s"></div>
            </div>
            <div style="font-size:10px;color:#94A3B8;margin-top:2px">${c.count} facture(s)</div>
          </div>
        `).join('')}
      </div>`;
  }

  // Répartition
  const repEl = el('sa-repartition');
  if (repEl) {
    const payees = f.filter(x=>x.statut==='payee').length;
    const attente = f.filter(x=>['attente','envoyee'].includes(x.statut)).length;
    const retard = f.filter(x=>x.statut==='retard').length;
    const total2 = Math.max(f.length, 1);
    repEl.innerHTML = `
      <div style="background:#fff;border-radius:16px;padding:16px;border:1px solid #F1F5F9;margin-top:12px">
        <div style="font-size:13px;font-weight:700;color:#0F172A;margin-bottom:14px">📊 Répartition</div>
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:12px">
          <div style="text-align:center;background:#ECFDF5;border-radius:10px;padding:10px">
            <div style="font-size:20px;font-weight:800;color:#059669">${payees}</div>
            <div style="font-size:10px;color:#059669;margin-top:2px">Payées</div>
          </div>
          <div style="text-align:center;background:#FFFBEB;border-radius:10px;padding:10px">
            <div style="font-size:20px;font-weight:800;color:#D97706">${attente}</div>
            <div style="font-size:10px;color:#D97706;margin-top:2px">En attente</div>
          </div>
          <div style="text-align:center;background:#FEF2F2;border-radius:10px;padding:10px">
            <div style="font-size:20px;font-weight:800;color:#EF4444">${retard}</div>
            <div style="font-size:10px;color:#EF4444;margin-top:2px">En retard</div>
          </div>
        </div>
        <div style="height:8px;background:#F1F5F9;border-radius:4px;overflow:hidden;display:flex">
          <div style="background:#059669;width:${Math.round(payees/total2*100)}%;transition:width 0.6s"></div>
          <div style="background:#D97706;width:${Math.round(attente/total2*100)}%;transition:width 0.6s"></div>
          <div style="background:#EF4444;width:${Math.round(retard/total2*100)}%;transition:width 0.6s"></div>
        </div>
      </div>`;
  }
}


function renderTVA() {
  const months = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];
  const year = new Date().getFullYear();
  const data = Array(12).fill(null).map((_,i) => ({mois:months[i], ht:0, tva:0, ttc:0}));
  STATE.factures.forEach(f => {
    const d = new Date(f.date_emission||f.created_at);
    if (d.getFullYear()===year) {
      data[d.getMonth()].ht += Number(f.ht);
      data[d.getMonth()].tva += Number(f.tva);
      data[d.getMonth()].ttc += Number(f.ttc);
    }
  });
  const total = data.reduce((acc,d) => ({ ht:acc.ht+d.ht, tva:acc.tva+d.tva, ttc:acc.ttc+d.ttc }), {ht:0,tva:0,ttc:0});
  const body = el('tva-body');
  if (!body) return;
  body.innerHTML = data.filter(d=>d.ttc>0).map(d => `
    <tr>
      <td style="padding:10px 12px">${d.mois}</td>
      <td style="padding:10px 12px;text-align:right">${fmt(d.ht)}</td>
      <td style="padding:10px 12px;text-align:right;color:#059669;font-weight:600">${fmt(d.tva)}</td>
      <td style="padding:10px 12px;text-align:right;font-weight:600">${fmt(d.ttc)}</td>
    </tr>`).join('') + `
    <tr style="background:#F8FAFC;font-weight:700;border-top:2px solid #E2E8F0">
      <td style="padding:12px">Total ${year}</td>
      <td style="padding:12px;text-align:right">${fmt(total.ht)}</td>
      <td style="padding:12px;text-align:right;color:#059669">${fmt(total.tva)}</td>
      <td style="padding:12px;text-align:right">${fmt(total.ttc)}</td>
    </tr>`;
}

// ============================================================
// RECHERCHE GLOBALE
// ============================================================

function initRecherche() {
  const inp = el('search-global');
  if (inp) { inp.value = ''; renderSearchResults(''); setTimeout(()=>inp.focus(),200); }
}

function rechercheGlobale() {
  const q = el('search-global')?.value || '';
  renderSearchResults(q);
}

function renderSearchResults(q) {
  const res = el('search-results');
  if (!res) return;
  if (!q.trim()) { res.innerHTML = '<div class="empty"><div class="empty-ico">🔍</div><div class="empty-title">Tapez pour rechercher</div></div>'; return; }
  const ql = q.toLowerCase();
  const rF = STATE.factures.filter(f => f.client.toLowerCase().includes(ql) || f.ref.toLowerCase().includes(ql) || (f.chantier||'').toLowerCase().includes(ql));
  const rD = STATE.devis.filter(d => d.client.toLowerCase().includes(ql) || d.ref.toLowerCase().includes(ql));
  const rC = STATE.clients.filter(c => c.nom.toLowerCase().includes(ql) || (c.tel||'').includes(ql) || (c.email||'').toLowerCase().includes(ql));
  if (!rF.length && !rD.length && !rC.length) {
    res.innerHTML = `<div class="empty"><div class="empty-ico">🔍</div><div class="empty-title">Aucun résultat</div></div>`;
    return;
  }
  let html = '';
  if (rF.length) {
    html += `<div class="sec-label" style="padding:16px 0 8px">Factures (${rF.length})</div>`;
    html += rF.map(f => `<div class="card" onclick="openDetail(${f.id})"><div class="card-ico" style="background:#EFF6FF">📄</div><div class="card-body"><div class="card-name">${escapeHTML(f.client)}</div><div class="card-ref">${f.ref}</div></div><div class="card-amt">${fmt(f.ttc)} MAD</div></div>`).join('');
  }
  if (rC.length) {
    html += `<div class="sec-label" style="padding:16px 0 8px">Clients (${rC.length})</div>`;
    html += rC.map(c => `<div class="card" onclick="openDetailClient(${c.id})"><div class="card-ico" style="background:#EFF6FF;font-weight:700;color:#2563EB;font-size:18px">${escapeHTML(c.nom).charAt(0).toUpperCase()}</div><div class="card-body"><div class="card-name">${escapeHTML(c.nom)}</div><div class="card-ref">${c.tel||c.email||''}</div></div></div>`).join('');
  }
  if (rD.length) {
    html += `<div class="sec-label" style="padding:16px 0 8px">Devis (${rD.length})</div>`;
    html += rD.map(d => `<div class="card" onclick="openDetailDevis(${d.id})"><div class="card-ico" style="background:#FFFBEB">📝</div><div class="card-body"><div class="card-name">${escapeHTML(d.client)}</div><div class="card-ref">${d.ref}</div></div><div class="card-amt">${fmt(d.ttc)} MAD</div></div>`).join('');
  }
  res.innerHTML = html;
}


// ===== FACTURES.JS =====
// ============================================================
// BANIPAY — Factures
// ============================================================


// ============================================================
// ANNUAIRE BANIPAY
// ============================================================

let _annuaireData = [];
let _annuaireSecteur = '';

async function loadAnnuaire() {
  try {
    const r = await fetch(SUPABASE_URL + '/rest/v1/profils_entreprise?select=raison,secteur,ville,tel,email,id_unique&raison=not.is.null&order=raison.asc&limit=100', {
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY }
    });
    _annuaireData = await r.json() || [];
    filtrerAnnuaire();
  } catch(e) {
    showToast('Erreur chargement annuaire', 'error');
    _annuaireData = [];
  }
}

function filtrerAnnuaireSecteur(secteur, btn) {
  _annuaireSecteur = secteur;
  document.querySelectorAll('#screen-annuaire .ftab').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  filtrerAnnuaire();
}

function filtrerAnnuaire() {
  const q = (el('annuaire-search')?.value || '').toLowerCase();
  const list = el('annuaire-list');
  if (!list) return;

  let data = _annuaireData;
  if (_annuaireSecteur) data = data.filter(e => e.secteur === _annuaireSecteur);
  if (q) data = data.filter(e => (e.raison||'').toLowerCase().includes(q) || (e.ville||'').toLowerCase().includes(q) || (e.secteur||'').toLowerCase().includes(q));

  // Hide current user's company
  const myRaison = STATE.profil?.raison;
  if (myRaison) data = data.filter(e => e.raison !== myRaison);

  if (!data.length) {
    list.innerHTML = '<div class="empty"><div class="empty-ico">🏢</div><div class="empty-title">Aucune entreprise trouvée</div></div>';
    return;
  }

  const secteurEmoji = { 'BTP & Construction':'🏗️', 'Commerce & Négoce':'🛒', 'Transport & Logistique':'🚛', 'Conseil & Expertise':'💼', 'Informatique & Tech':'💻', 'Santé & Médical':'🏥', 'Immobilier':'🏠', 'Artisanat':'🪡' };

  list.innerHTML = data.map(e => `
    <div class="card" style="margin:0 20px 10px;cursor:pointer" onclick="voirProfilEntreprise('${e.id_unique||''}')">
      <div style="display:flex;align-items:center;gap:12px">
        <div style="width:44px;height:44px;border-radius:12px;background:#EFF6FF;display:flex;align-items:center;justify-content:center;font-size:22px;flex-shrink:0">${secteurEmoji[e.secteur]||'🏢'}</div>
        <div style="flex:1">
          <div style="font-size:13px;font-weight:700">${escapeHTML(e.raison||'')}</div>
          <div style="font-size:11px;color:#64748B;margin-top:2px">${e.secteur||''} ${e.ville?'· 📍'+e.ville:''}</div>
          ${e.tel?`<div style="font-size:11px;color:#94A3B8">📞 ${e.tel}</div>`:''}
        </div>
        <div style="font-size:18px;color:#94A3B8">›</div>
      </div>
    </div>
  `).join('');
}

function voirProfilEntreprise(idUnique) {
  if (!idUnique) return;
  const url = window.location.origin + window.location.pathname + '?profil=' + idUnique;
  window.open(url, '_blank');
}

// ============================================================
// STATS AVANCÉES — CA mensuel, courbe, top clients
// ============================================================

function renderStatsDashboard() {
  const f = STATE.factures || [];
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();

  // CA par mois (12 derniers mois)
  const months = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({
      label: d.toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' }),
      month: d.getMonth(),
      year: d.getFullYear(),
      ca: 0, paye: 0, count: 0
    });
  }

  f.forEach(fac => {
    if (!fac.date_emission) return;
    const d = new Date(fac.date_emission);
    const m = months.find(x => x.month === d.getMonth() && x.year === d.getFullYear());
    if (m) {
      m.ca += Number(fac.ttc) || 0;
      if (fac.statut === 'payee') m.paye += Number(fac.ttc) || 0;
      m.count++;
    }
  });

  // Mois en cours
  const moisCourant = months[months.length - 1];
  const moisPrec = months[months.length - 2];
  const evolution = moisPrec.ca > 0 ? ((moisCourant.ca - moisPrec.ca) / moisPrec.ca * 100).toFixed(1) : 0;
  const evolPositif = Number(evolution) >= 0;

  // Top clients
  const clientsMap = {};
  f.forEach(fac => {
    if (!fac.client) return;
    if (!clientsMap[fac.client]) clientsMap[fac.client] = { nom: fac.client, ca: 0, count: 0 };
    clientsMap[fac.client].ca += Number(fac.ttc) || 0;
    clientsMap[fac.client].count++;
  });
  const topClients = Object.values(clientsMap).sort((a, b) => b.ca - a.ca).slice(0, 5);

  // CA total annuel
  const caAnnuel = f.filter(x => new Date(x.date_emission||'').getFullYear() === currentYear)
    .reduce((s, x) => s + Number(x.ttc), 0);
  const paiementsAnnuels = f.filter(x => x.statut === 'payee' && new Date(x.date_emission||'').getFullYear() === currentYear)
    .reduce((s, x) => s + Number(x.ttc), 0);

  // Render stats grid
  const grid = el('stats-grid');
  if (grid) {
    grid.innerHTML = `
      <div style="background:#fff;border-radius:12px;padding:14px;border:1px solid #F1F5F9">
        <div style="font-size:10px;color:#94A3B8;text-transform:uppercase;font-weight:600">CA ${currentYear}</div>
        <div style="font-size:20px;font-weight:700;color:#0F172A;margin-top:4px">${fmt(caAnnuel)}</div>
        <div style="font-size:10px;color:#64748B;margin-top:2px">MAD TTC</div>
      </div>
      <div style="background:#fff;border-radius:12px;padding:14px;border:1px solid #F1F5F9">
        <div style="font-size:10px;color:#94A3B8;text-transform:uppercase;font-weight:600">Encaissé</div>
        <div style="font-size:20px;font-weight:700;color:#059669;margin-top:4px">${fmt(paiementsAnnuels)}</div>
        <div style="font-size:10px;color:#64748B;margin-top:2px">${caAnnuel > 0 ? Math.round(paiementsAnnuels/caAnnuel*100) : 0}% du CA</div>
      </div>
      <div style="background:#fff;border-radius:12px;padding:14px;border:1px solid #F1F5F9">
        <div style="font-size:10px;color:#94A3B8;text-transform:uppercase;font-weight:600">Ce mois</div>
        <div style="font-size:20px;font-weight:700;color:#2563EB;margin-top:4px">${fmt(moisCourant.ca)}</div>
        <div style="font-size:10px;margin-top:2px;color:${evolPositif?'#059669':'#EF4444'}">${evolPositif?'↗':'↘'} ${Math.abs(evolution)}% vs mois préc.</div>
      </div>
      <div style="background:#fff;border-radius:12px;padding:14px;border:1px solid #F1F5F9">
        <div style="font-size:10px;color:#94A3B8;text-transform:uppercase;font-weight:600">Factures</div>
        <div style="font-size:20px;font-weight:700;color:#0F172A;margin-top:4px">${f.length}</div>
        <div style="font-size:10px;color:#64748B;margin-top:2px">${f.filter(x=>x.statut==='payee').length} payées</div>
      </div>
    `;
  }

  // Courbe SVG CA mensuel
  const chartEl = el('sa-monthly');
  if (chartEl && months.length) {
    const maxCA = Math.max(...months.map(m => m.ca), 1);
    const W = 320, H = 120, PAD = 30;
    const pts = months.map((m, i) => {
      const x = PAD + (i / (months.length - 1)) * (W - PAD * 2);
      const y = H - PAD - (m.ca / maxCA) * (H - PAD * 2);
      return { x, y, m };
    });
    const path = pts.map((p, i) => (i === 0 ? `M${p.x},${p.y}` : `L${p.x},${p.y}`)).join(' ');
    const areaPath = `${path} L${pts[pts.length-1].x},${H-PAD} L${pts[0].x},${H-PAD} Z`;

    chartEl.innerHTML = `
      <div style="background:#fff;border-radius:12px;padding:14px;border:1px solid #F1F5F9;margin-bottom:12px">
        <div style="font-size:12px;font-weight:600;color:#0F172A;margin-bottom:10px">📈 Évolution CA mensuel</div>
        <svg width="100%" viewBox="0 0 ${W} ${H}" style="overflow:visible">
          <defs>
            <linearGradient id="caGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stop-color="#2563EB" stop-opacity="0.2"/>
              <stop offset="100%" stop-color="#2563EB" stop-opacity="0"/>
            </linearGradient>
          </defs>
          <path d="${areaPath}" fill="url(#caGrad)"/>
          <path d="${path}" fill="none" stroke="#2563EB" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          ${pts.map(p => `<circle cx="${p.x}" cy="${p.y}" r="3" fill="#2563EB"/>`).join('')}
          ${pts.filter((p,i) => i % 3 === 0 || i === pts.length-1).map(p =>
            `<text x="${p.x}" y="${H-4}" text-anchor="middle" font-size="8" fill="#94A3B8">${p.m.label}</text>`
          ).join('')}
        </svg>
      </div>
    `;
  }

  // Top clients
  const topEl = el('sa-top-clients');
  if (topEl && topClients.length) {
    const maxCA2 = topClients[0].ca;
    topEl.innerHTML = `
      <div style="background:#fff;border-radius:12px;padding:14px;border:1px solid #F1F5F9;margin-bottom:12px">
        <div style="font-size:12px;font-weight:600;color:#0F172A;margin-bottom:12px">🏆 Top clients</div>
        ${topClients.map((c, i) => `
          <div style="margin-bottom:10px">
            <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:3px">
              <span style="font-weight:500">${i+1}. ${escapeHTML(c.nom)}</span>
              <span style="font-weight:700;color:#2563EB">${fmt(c.ca)} MAD</span>
            </div>
            <div style="height:6px;background:#F1F5F9;border-radius:3px">
              <div style="height:100%;background:#2563EB;border-radius:3px;width:${Math.round(c.ca/maxCA2*100)}%"></div>
            </div>
            <div style="font-size:10px;color:#94A3B8;margin-top:2px">${c.count} facture(s)</div>
          </div>
        `).join('')}
      </div>
    `;
  }

  // Répartition par statut
  const repEl = el('sa-repartition');
  if (repEl) {
    const payees = f.filter(x => x.statut === 'payee').length;
    const attente = f.filter(x => x.statut === 'attente' || x.statut === 'envoyee').length;
    const retard = f.filter(x => x.statut === 'retard').length;
    const total2 = f.length || 1;
    repEl.innerHTML = `
      <div style="background:#fff;border-radius:12px;padding:14px;border:1px solid #F1F5F9;margin-bottom:12px">
        <div style="font-size:12px;font-weight:600;color:#0F172A;margin-bottom:10px">📊 Répartition factures</div>
        <div style="display:flex;height:12px;border-radius:6px;overflow:hidden;margin-bottom:10px">
          <div style="background:#059669;width:${Math.round(payees/total2*100)}%"></div>
          <div style="background:#D97706;width:${Math.round(attente/total2*100)}%"></div>
          <div style="background:#EF4444;width:${Math.round(retard/total2*100)}%"></div>
        </div>
        <div style="display:flex;gap:12px;font-size:11px">
          <span><span style="color:#059669">●</span> Payées (${payees})</span>
          <span><span style="color:#D97706">●</span> En attente (${attente})</span>
          <span><span style="color:#EF4444">●</span> Retard (${retard})</span>
        </div>
      </div>
    `;
  }
}

// ============================================================
// EXPORT CSV
// ============================================================

function exporterCSV() {
  const f = STATE.factures || [];
  if (!f.length) { showToast('Aucune facture à exporter', 'error'); return; }

  const headers = ['Référence', 'Client', 'Date', 'Échéance', 'HT', 'TVA', 'TTC', 'Statut', 'Mode paiement', 'Chantier'];
  const rows = f.map(fac => [
    fac.ref || '',
    fac.client || '',
    fac.date_emission || '',
    fac.echeance || '',
    (Number(fac.ht) || 0).toFixed(2),
    (Number(fac.tva) || 0).toFixed(2),
    (Number(fac.ttc) || 0).toFixed(2),
    fac.statut || '',
    fac.paiement || '',
    fac.chantier || ''
  ]);

  const csv = [headers, ...rows].map(r => r.map(v => '"' + String(v).replace(/"/g, '""') + '"').join(',')).join('\n');
  const BOM = '\uFEFF'; // UTF-8 BOM pour Excel
  const blob = new Blob([BOM + csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'banipay_factures_' + new Date().toISOString().split('T')[0] + '.csv';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 3000);
  showToast('✅ Export CSV téléchargé !', 'success');
}

function exporterCSVDevis() {
  const d = STATE.devis || [];
  if (!d.length) { showToast('Aucun devis à exporter', 'error'); return; }

  const headers = ['Référence', 'Client', 'Date', 'Validité (j)', 'HT', 'TVA', 'TTC', 'Statut', 'Chantier'];
  const rows = d.map(dv => [
    dv.ref || '', dv.client || '', dv.date_emission || '',
    dv.validite || 30,
    (Number(dv.ht) || 0).toFixed(2),
    (Number(dv.tva) || 0).toFixed(2),
    (Number(dv.ttc) || 0).toFixed(2),
    dv.statut || '', dv.chantier || ''
  ]);

  const csv = [headers, ...rows].map(r => r.map(v => '"' + String(v).replace(/"/g, '""') + '"').join(',')).join('\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'banipay_devis_' + new Date().toISOString().split('T')[0] + '.csv';
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 3000);
  showToast('✅ Export devis CSV !', 'success');
}

// ============================================================
// RAPPELS AUTOMATIQUES
// ============================================================

function verifierRappels() {
  const today = new Date();
  const retards = (STATE.factures || []).filter(f => {
    if (f.statut === 'payee' || f.statut === 'annulee') return false;
    if (!f.echeance) return false;
    return new Date(f.echeance) < today;
  });

  if (retards.length === 0) return;

  // Ajouter notifications de rappel
  retards.forEach(f => {
    const jours = Math.floor((today - new Date(f.echeance)) / 86400000);
    const existeDejaNotif = STATE.notifications.some(n => n.factureId === f.id && n.type === 'rappel');
    if (!existeDejaNotif) {
      STATE.notifications.unshift({
        type: 'danger',
        icon: '⚠️',
        title: `Rappel: ${f.ref} en retard de ${jours}j`,
        body: `Client: ${f.client} · ${fmt(f.ttc)} MAD`,
        factureId: f.id
      });
    }
  });

  if (retards.length > 0) badgeF();
}
