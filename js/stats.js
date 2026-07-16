// ============================================================
// BANIPAY — stats.js — Dashboard, stats, TVA, recherche
// ============================================================

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
  const f = STATE.factures;
  const total = f.reduce((s,x) => s + Number(x.ttc), 0);
  const payees = f.filter(x => x.statut==='payee');
  const retards = f.filter(x => x.statut==='retard');
  const attente = f.filter(x => ['attente','envoyee'].includes(x.statut));

  const grid = el('stats-grid');
  if (grid) grid.innerHTML = [
    {val: f.length, lbl: 'Factures totales', c: '#2563EB'},
    {val: fmt(total)+' MAD', lbl: 'Volume total', c: '#0F172A'},
    {val: payees.length, lbl: 'Payées', c: '#059669'},
    {val: retards.length, lbl: 'En retard', c: '#EF4444'},
    {val: STATE.devis.length, lbl: 'Devis émis', c: '#D97706'},
    {val: STATE.clients.length, lbl: 'Clients', c: '#9333EA'},
    {val: fmt(payees.reduce((s,x)=>s+Number(x.tva),0))+' MAD', lbl: 'TVA collectée', c: '#059669'},
    {val: STATE.produits.length, lbl: 'Articles catalogue', c: '#2563EB'},
  ].map(s => `<div class="stat-box"><div class="stat-val" style="color:${s.c}">${s.val}</div><div class="stat-lbl">${s.lbl}</div></div>`).join('');

  // Monthly chart
  const months = ['J','F','M','A','M','J','J','A','S','O','N','D'];
  const year = new Date().getFullYear();
  const monthly = Array(12).fill(0);
  f.forEach(x => {
    const d = new Date(x.date_emission || x.created_at);
    if (d.getFullYear() === year) monthly[d.getMonth()] += Number(x.ttc);
  });
  const maxVal = Math.max(...monthly, 1);
  const barsEl = el('sa-monthly');
  if (barsEl) {
    // SVG Curve chart
    const W = 340, H = 120, PAD = 20;
    const pts = monthly.map((v,i) => ({
      x: PAD + i * (W - PAD*2) / 11,
      y: H - PAD - (maxVal > 0 ? (v / maxVal) * (H - PAD*2) : 0)
    }));
    // Smooth path
    let path = 'M ' + pts[0].x + ' ' + pts[0].y;
    for (let i = 1; i < pts.length; i++) {
      const cp1x = pts[i-1].x + (pts[i].x - pts[i-1].x) / 3;
      const cp2x = pts[i].x - (pts[i].x - pts[i-1].x) / 3;
      path += ' C ' + cp1x + ' ' + pts[i-1].y + ' ' + cp2x + ' ' + pts[i].y + ' ' + pts[i].x + ' ' + pts[i].y;
    }
    // Fill path
    let fillPath = path + ' L ' + pts[pts.length-1].x + ' ' + (H-PAD) + ' L ' + pts[0].x + ' ' + (H-PAD) + ' Z';
    const curMonth = new Date().getMonth();
    const dots = pts.map((p,i) => monthly[i] > 0 ?
      '<circle cx="' + p.x + '" cy="' + p.y + '" r="' + (i===curMonth?5:3) + '" fill="' + (i===curMonth?'#2563EB':'#93C5FD') + '" stroke="#fff" stroke-width="2"/>' +
      (monthly[i] > 0 ? '<text x="' + p.x + '" y="' + (p.y-8) + '" text-anchor="middle" font-size="8" fill="#64748B">' + Math.round(monthly[i]/1000) + 'k</text>' : '')
      : ''
    ).join('');
    const labels = months.map((m,i) =>
      '<text x="' + (PAD + i*(W-PAD*2)/11) + '" y="' + (H-4) + '" text-anchor="middle" font-size="8" fill="' + (i===curMonth?'#2563EB':'#94A3B8') + '">' + m + '</text>'
    ).join('');
    barsEl.innerHTML = '<svg viewBox="0 0 ' + W + ' ' + H + '" style="width:100%;height:' + H + 'px;overflow:visible">' +
      '<defs><linearGradient id="grad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#2563EB" stop-opacity="0.15"/><stop offset="100%" stop-color="#2563EB" stop-opacity="0"/></linearGradient></defs>' +
      '<path d="' + fillPath + '" fill="url(#grad)"/>' +
      '<path d="' + path + '" fill="none" stroke="#2563EB" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>' +
      dots + labels + '</svg>';
  }

  // Top clients
  const clientCA = {};
  payees.forEach(x => { clientCA[x.client] = (clientCA[x.client]||0) + Number(x.ttc); });
  const top5 = Object.entries(clientCA).sort((a,b)=>b[1]-a[1]).slice(0,5);
  const topEl = el('sa-top-clients');
  if (topEl) topEl.innerHTML = top5.length ? top5.map(([nom,ca]) => `
    <div class="card">
      <div class="card-ico" style="background:#EFF6FF;font-weight:700;color:#2563EB;font-size:18px">${nom.charAt(0).toUpperCase()}</div>
      <div class="card-body"><div class="card-name">${nom}</div><div class="card-ref">CA payé</div></div>
      <div style="font-size:14px;font-weight:700;color:#059669">${fmtInt(ca)} MAD</div>
    </div>`).join('') : '<div class="empty"><div>Aucune donnée</div></div>';

  // Top produits
  const prodCA = {};
  f.forEach(x => (x.lignes||[]).forEach(l => { prodCA[l.desc] = (prodCA[l.desc]||0) + Number(l.qte*l.pu); }));
  const top5p = Object.entries(prodCA).sort((a,b)=>b[1]-a[1]).slice(0,5);
  const topPEl = el('sa-top-produits');
  if (topPEl) topPEl.innerHTML = top5p.map(([nom,ca]) => `
    <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid #F1F5F9;font-size:13px">
      <span style="color:#0F172A;font-weight:500">${nom}</span>
      <span style="font-weight:600;color:#2563EB">${fmtInt(ca)} MAD</span>
    </div>`).join('');

  // Répartition
  const tT = total || 1;
  const repEl = el('sa-repartition');
  if (repEl) repEl.innerHTML = [
    {lbl:'Payées', val:payees.reduce((s,x)=>s+Number(x.ttc),0), color:'#059669'},
    {lbl:'En attente', val:attente.reduce((s,x)=>s+Number(x.ttc),0), color:'#D97706'},
    {lbl:'En retard', val:retards.reduce((s,x)=>s+Number(x.ttc),0), color:'#EF4444'},
  ].map(b => `
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px">
      <div style="font-size:11px;color:#64748B;width:70px;flex-shrink:0">${b.lbl}</div>
      <div style="flex:1;height:8px;background:#F1F5F9;border-radius:4px;overflow:hidden"><div style="height:100%;border-radius:4px;background:${b.color};width:${Math.round(b.val/tT*100)}%"></div></div>
      <div style="font-size:11px;font-weight:600;color:#0F172A;width:80px;text-align:right">${fmtInt(b.val)} MAD</div>
    </div>`).join('');
}

// ============================================================
// TVA
// ============================================================

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
