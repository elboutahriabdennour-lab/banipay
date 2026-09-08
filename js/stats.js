// BANIPAY — stats.js
// ============================================================
// FUSION (retour utilisateur) : les écrans "Stats" et "Statistiques
// avancées" étaient deux écrans séparés, avec deux jeux de filtres
// différents et deux navigations distinctes — confus pour retrouver une
// information. Fusionnés ici en un seul écran à 3 onglets (Vue
// d'ensemble / Détail / Prévision), avec un seul jeu de filtres partagé
// entre les trois. La couleur a aussi été reprise : les deux écrans
// utilisaient un jeu de couleurs générique (bleu/vert vif/ambre) sans
// rapport avec la vraie palette de l'app — remplacé ici par les
// couleurs Zelto (zellige, safran, sauge, brique).
// ============================================================
STATE.statsPeriode = STATE.statsPeriode || 'tout';
STATE.statsFiltreClient = STATE.statsFiltreClient || null;
STATE.statsFiltreProduit = STATE.statsFiltreProduit || null;
STATE.statsFiltreStatut = STATE.statsFiltreStatut || '';
STATE.statsFiltreCategorie = STATE.statsFiltreCategorie || '';
STATE.statsFiltreMontantMin = STATE.statsFiltreMontantMin || null;
STATE.statsFiltreMontantMax = STATE.statsFiltreMontantMax || null;
STATE.statsOnglet = STATE.statsOnglet || 'ensemble';

function filtrerParPeriode(items, periode, champDate) {
  if (periode === 'tout') return items;
  const maintenant = new Date();
  if (periode === 'personnalisee') {
    const debut = el('stats-date-debut')?.value;
    const fin = el('stats-date-fin')?.value;
    if (!debut && !fin) return items;
    return items.filter(function(x) {
      const dt = new Date(x[champDate] || '');
      if (isNaN(dt.getTime())) return false;
      if (debut && dt < new Date(debut)) return false;
      if (fin && dt > new Date(fin + 'T23:59:59')) return false;
      return true;
    });
  }
  return items.filter(function(x) {
    const dt = new Date(x[champDate] || '');
    if (isNaN(dt.getTime())) return false;
    if (periode === 'mois') {
      return dt.getMonth() === maintenant.getMonth() && dt.getFullYear() === maintenant.getFullYear();
    }
    if (periode === 'mois-dernier') {
      const moisDernier = new Date(maintenant.getFullYear(), maintenant.getMonth() - 1, 1);
      return dt.getMonth() === moisDernier.getMonth() && dt.getFullYear() === moisDernier.getFullYear();
    }
    if (periode === 'annee') {
      return dt.getFullYear() === maintenant.getFullYear();
    }
    return true;
  });
}
function appliquerDatesPersonnalisees() {
  renderStatsUnifie();
}

// Filtre croisé unique (client/produit/statut/catégorie/montant),
// réutilisé sur les 3 onglets.
function appliquerFiltresCroisesStats(factures) {
  let res = factures;
  if (STATE.statsFiltreClient) {
    res = res.filter(function(f) { return f.client === STATE.statsFiltreClient; });
  }
  if (STATE.statsFiltreProduit) {
    res = res.filter(function(f) {
      const lignes = typeof f.lignes === 'string' ? JSON.parse(f.lignes || '[]') : (f.lignes || []);
      return lignes.some(function(l) { return (l.desc || '').trim() === STATE.statsFiltreProduit; });
    });
  }
  if (STATE.statsFiltreStatut) {
    res = res.filter(function(f) { return f.statut === STATE.statsFiltreStatut; });
  }
  if (STATE.statsFiltreCategorie) {
    const produitsCategorie = {};
    (STATE.produits || []).forEach(function(p) { produitsCategorie[p.id] = p.categorie; });
    res = res.filter(function(f) {
      const lignes = typeof f.lignes === 'string' ? JSON.parse(f.lignes || '[]') : (f.lignes || []);
      return lignes.some(function(l) { return l.produit_id && produitsCategorie[l.produit_id] === STATE.statsFiltreCategorie; });
    });
  }
  if (STATE.statsFiltreMontantMin != null) {
    res = res.filter(function(f) { return Number(f.ttc || 0) >= STATE.statsFiltreMontantMin; });
  }
  if (STATE.statsFiltreMontantMax != null) {
    res = res.filter(function(f) { return Number(f.ttc || 0) <= STATE.statsFiltreMontantMax; });
  }
  return res;
}
function filtrerParClientStats(nomClient) {
  STATE.statsFiltreClient = (STATE.statsFiltreClient === nomClient) ? null : nomClient;
  renderStatsUnifie();
}
function filtrerParProduitStats(desc) {
  STATE.statsFiltreProduit = (STATE.statsFiltreProduit === desc) ? null : desc;
  renderStatsUnifie();
}
function retirerFiltreClientStats() { STATE.statsFiltreClient = null; renderStatsUnifie(); }
function retirerFiltreProduitStats() { STATE.statsFiltreProduit = null; renderStatsUnifie(); }
function changerFiltreStatutStats(statut) { STATE.statsFiltreStatut = statut; renderStatsUnifie(); }
function changerFiltreCategorieStats(cat) { STATE.statsFiltreCategorie = cat; renderStatsUnifie(); }
function appliquerFiltreMontantStats() {
  const min = el('stats-montant-min')?.value;
  const max = el('stats-montant-max')?.value;
  STATE.statsFiltreMontantMin = min ? parseFloat(min) : null;
  STATE.statsFiltreMontantMax = max ? parseFloat(max) : null;
  renderStatsUnifie();
}
function retirerFiltreMontantStats() {
  STATE.statsFiltreMontantMin = null;
  STATE.statsFiltreMontantMax = null;
  el('stats-montant-min') && (el('stats-montant-min').value = '');
  el('stats-montant-max') && (el('stats-montant-max').value = '');
  renderStatsUnifie();
}
function effacerFiltresStats() {
  STATE.statsFiltreClient = null;
  STATE.statsFiltreProduit = null;
  STATE.statsFiltreStatut = '';
  STATE.statsFiltreCategorie = '';
  STATE.statsFiltreMontantMin = null;
  STATE.statsFiltreMontantMax = null;
  el('stats-filtre-statut') && (el('stats-filtre-statut').value = '');
  el('stats-filtre-categorie') && (el('stats-filtre-categorie').value = '');
  el('stats-montant-min') && (el('stats-montant-min').value = '');
  el('stats-montant-max') && (el('stats-montant-max').value = '');
  renderStatsUnifie();
}
function renderFiltresActifsStats() {
  const zone = el('stats-filtres-actifs');
  if (!zone) return;
  const statutLabels = { attente: 'En attente', retard: 'En retard', payee: 'Payée', envoyee: 'Envoyée' };
  const chips = [];
  if (STATE.statsFiltreClient) chips.push({ label: '👤 ' + STATE.statsFiltreClient, fn: 'retirerFiltreClientStats' });
  if (STATE.statsFiltreProduit) chips.push({ label: '📦 ' + STATE.statsFiltreProduit, fn: 'retirerFiltreProduitStats' });
  if (STATE.statsFiltreStatut) chips.push({ label: '🏷️ ' + (statutLabels[STATE.statsFiltreStatut] || STATE.statsFiltreStatut), fn: "changerFiltreStatutStats('')" });
  if (STATE.statsFiltreCategorie) chips.push({ label: '📂 ' + STATE.statsFiltreCategorie, fn: "changerFiltreCategorieStats('')" });
  if (STATE.statsFiltreMontantMin != null || STATE.statsFiltreMontantMax != null) {
    const txt = (STATE.statsFiltreMontantMin != null ? fmt(STATE.statsFiltreMontantMin) : '0') + ' → ' + (STATE.statsFiltreMontantMax != null ? fmt(STATE.statsFiltreMontantMax) : '∞') + ' MAD';
    chips.push({ label: '💰 ' + txt, fn: 'retirerFiltreMontantStats' });
  }
  if (!chips.length) { zone.innerHTML = ''; return; }
  zone.innerHTML = '<div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">' +
    chips.map(function(c) {
      return '<span style="background:#E9F4F3;color:#1F6F72;border-radius:20px;padding:5px 10px;font-size:11px;font-weight:600;display:inline-flex;align-items:center;gap:5px">' + escapeHTML(c.label) + '<span onclick="' + c.fn + '()" style="cursor:pointer;font-weight:800">✕</span></span>';
    }).join('') +
    '<span onclick="effacerFiltresStats()" style="font-size:11px;color:#9C9186;text-decoration:underline;cursor:pointer">Tout effacer</span>' +
  '</div>';
}
function changerPeriodeStats(periode, btn) {
  STATE.statsPeriode = periode;
  document.querySelectorAll('#stats-periode-tabs .ftab').forEach(function(b) { b.classList.remove('active'); });
  if (btn) btn.classList.add('active');
  const zoneDate = el('stats-dates-perso');
  if (zoneDate) zoneDate.style.display = (periode === 'personnalisee') ? 'flex' : 'none';
  renderStatsUnifie();
}

// ============================================================
// ONGLETS — bascule entre Vue d'ensemble / Détail / Prévision
// ============================================================
function switchStatsOnglet(onglet) {
  STATE.statsOnglet = onglet;
  ['ensemble', 'detail', 'prevision'].forEach(function(o) {
    const bouton = el('stats-onglet-' + o);
    const zone = el('stats-panneau-' + o);
    if (bouton) {
      bouton.style.background = (o === onglet) ? '#1F6F72' : '#F1EEE8';
      bouton.style.color = (o === onglet) ? '#fff' : '#6B5F54';
    }
    if (zone) zone.style.display = (o === onglet) ? 'block' : 'none';
  });
  renderStatsUnifie();
}

// Point d'entrée unique — remplace à la fois l'ancien renderStats() et
// l'ancien renderDashboardAvance(). Conservé sous ces deux anciens noms
// (en alias) pour ne rien casser côté nav.js/app.html qui les appellent
// encore par leur nom d'origine.
function renderStatsUnifie() {
  renderFiltresActifsStats();
  const onglet = STATE.statsOnglet || 'ensemble';
  if (onglet === 'ensemble') _renderOngletEnsemble();
  else if (onglet === 'detail') _renderOngletDetail();
  else if (onglet === 'prevision') _renderOngletPrevision();
}
function renderStats() { renderStatsUnifie(); }
function renderDashboardAvance() { switchStatsOnglet('prevision'); }

// ============================================================
// ONGLET 1 — VUE D'ENSEMBLE (KPI + graphique CA + répartition)
// ============================================================
function _renderOngletEnsemble() {
  let f = filtrerParPeriode(STATE.factures || [], STATE.statsPeriode, 'date_emission');
  f = appliquerFiltresCroisesStats(f);
  const now = new Date();
  const caTotal = f.reduce((s,x) => s + (Number(x.ttc)||0), 0);
  const caEncaisse = f.filter(x=>x.statut==='payee').reduce((s,x) => s + (Number(x.ttc)||0), 0);
  const caEnAttente = f.filter(x=>['attente','envoyee'].includes(x.statut)).reduce((s,x) => s + (Number(x.ttc)||0), 0);
  const caEnRetard = f.filter(x=>x.statut==='retard').reduce((s,x) => s + (Number(x.ttc)||0), 0);
  const txRecouvrement = caTotal > 0 ? Math.round(caEncaisse/caTotal*100) : 0;

  const grid = el('stats-grid');
  if (grid) grid.innerHTML = `
    <div style="background:linear-gradient(135deg,#241F1B,#1F6F72);border-radius:18px;padding:18px;grid-column:span 2;box-shadow:0 4px 16px rgba(31,111,114,0.18)">
      <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:16px 12px">
        <div style="text-align:center">
          <div style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:rgba(255,255,255,0.55);margin-bottom:6px">CA Total</div>
          <div style="font-size:19px;font-weight:800;color:#fff">${fmt(caTotal)}</div>
          <div style="font-size:9px;color:rgba(255,255,255,0.45)">MAD</div>
        </div>
        <div style="text-align:center;border-left:1px solid rgba(255,255,255,0.15);padding-left:8px">
          <div style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:rgba(255,255,255,0.55);margin-bottom:6px">Encaissé</div>
          <div style="font-size:19px;font-weight:800;color:#9CBB7A">${fmt(caEncaisse)}</div>
          <div style="font-size:9px;color:#9CBB7A">${txRecouvrement}%</div>
        </div>
        <div style="text-align:center;border-top:1px solid rgba(255,255,255,0.15);padding-top:12px">
          <div style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:rgba(255,255,255,0.55);margin-bottom:6px">En attente</div>
          <div style="font-size:19px;font-weight:800;color:#E4C77A">${fmt(caEnAttente)}</div>
          <div style="font-size:9px;color:rgba(255,255,255,0.45)">MAD</div>
        </div>
        <div style="text-align:center;border-left:1px solid rgba(255,255,255,0.15);border-top:1px solid rgba(255,255,255,0.15);padding-left:8px;padding-top:12px">
          <div style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:rgba(255,255,255,0.55);margin-bottom:6px">En retard</div>
          <div style="font-size:19px;font-weight:800;color:#E0A99C">${fmt(caEnRetard)}</div>
          <div style="font-size:9px;color:rgba(255,255,255,0.45)">MAD</div>
        </div>
      </div>
      <div style="margin-top:14px;height:6px;background:rgba(255,255,255,0.15);border-radius:3px;overflow:hidden">
        <div style="height:100%;background:linear-gradient(90deg,#9CBB7A ${txRecouvrement}%,#E4C77A ${txRecouvrement}%,#E4C77A ${txRecouvrement+Math.round(caEnAttente/Math.max(caTotal,1)*100)}%,#E0A99C 0%);border-radius:3px"></div>
      </div>
      <div style="font-size:10px;color:rgba(255,255,255,0.5);margin-top:6px;text-align:right">Taux de recouvrement : ${txRecouvrement}%</div>
    </div>
  `;

  const months = [];
  for (let i = 11; i >= 0; i--) {
    const dt = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({ label: dt.toLocaleDateString('fr-FR', {month:'short'}), month: dt.getMonth(), year: dt.getFullYear(), ca: 0, paye: 0 });
  }
  f.forEach(fac => {
    const dt = new Date(fac.date_emission||'');
    const m = months.find(x => x.month===dt.getMonth() && x.year===dt.getFullYear());
    if (m) { m.ca += Number(fac.ttc)||0; if(fac.statut==='payee') m.paye += Number(fac.ttc)||0; }
  });
  const maxCA = Math.max(...months.map(m=>m.ca), 1);
  const monthly = el('sa-monthly');
  if (monthly) {
    const W=300, H=65, PX=20, PY=10;
    const pts = months.map((m,i) => ({
      x: PX + i*(W-PX*2)/(months.length-1),
      y: PY + (1 - m.ca/maxCA)*(H-PY*2),
      yp: PY + (1 - m.paye/maxCA)*(H-PY*2),
      m
    }));
    const path = pts.map((p,i) => (i===0?'M':'L')+p.x.toFixed(1)+','+p.y.toFixed(1)).join(' ');
    const pathP = pts.map((p,i) => (i===0?'M':'L')+p.x.toFixed(1)+','+p.yp.toFixed(1)).join(' ');
    const area = path+' L'+pts[pts.length-1].x.toFixed(1)+','+(H-PY)+' L'+PX+','+(H-PY)+' Z';
    const caMois = months[months.length-1].ca;
    monthly.innerHTML = `
      <div style="background:#fff;border-radius:14px;padding:14px;border:1px solid #E3DCCF">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
          <div style="font-size:13px;font-weight:700;color:#241F1B">📈 CA mensuel</div>
          <div style="font-size:11px;color:#6B5F54">Ce mois : <strong style="color:#C9971F">${fmt(caMois)} MAD</strong></div>
        </div>
        <svg width="100%" viewBox="0 0 ${W} ${H}" style="overflow:visible">
          <defs>
            <linearGradient id="gStatsFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stop-color="#C9971F" stop-opacity="0.18"/>
              <stop offset="100%" stop-color="#C9971F" stop-opacity="0"/>
            </linearGradient>
          </defs>
          <path d="${area}" fill="url(#gStatsFill)"/>
          <path d="${path}" fill="none" stroke="#C9971F" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          <path d="${pathP}" fill="none" stroke="#6E8F4E" stroke-width="1.5" stroke-dasharray="4,3" stroke-linecap="round"/>
          ${pts.map(p=>`<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="2.6" fill="#C9971F" stroke="#fff" stroke-width="1.3"/>`).join('')}
          ${pts.filter((_,i)=>i%2===0||i===pts.length-1).map(p=>`<text x="${p.x.toFixed(1)}" y="${H}" text-anchor="middle" font-size="8" fill="#9C9186">${p.m.label}</text>`).join('')}
        </svg>
        <div style="display:flex;gap:16px;margin-top:6px;font-size:10px">
          <span style="color:#C9971F">— CA facturé</span>
          <span style="color:#6E8F4E">- - Encaissé</span>
        </div>
      </div>`;
  }

  const repEl = el('sa-repartition');
  if (repEl) {
    const payees = f.filter(x=>x.statut==='payee').length;
    const attente = f.filter(x=>['attente','envoyee'].includes(x.statut)).length;
    const retard = f.filter(x=>x.statut==='retard').length;
    const total2 = Math.max(f.length, 1);
    repEl.innerHTML = `
      <div style="background:#fff;border-radius:14px;padding:14px;border:1px solid #E3DCCF;margin-top:10px">
        <div style="font-size:13px;font-weight:700;color:#241F1B;margin-bottom:12px">📊 Répartition des statuts</div>
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:12px">
          <div style="text-align:center;background:#EEF3E4;border-radius:10px;padding:10px">
            <div style="font-size:20px;font-weight:800;color:#55702E">${payees}</div>
            <div style="font-size:10px;color:#55702E;margin-top:2px">Payées</div>
          </div>
          <div style="text-align:center;background:#FBF0DA;border-radius:10px;padding:10px">
            <div style="font-size:20px;font-weight:800;color:#A67A16">${attente}</div>
            <div style="font-size:10px;color:#A67A16;margin-top:2px">En attente</div>
          </div>
          <div style="text-align:center;background:#F5E4E1;border-radius:10px;padding:10px">
            <div style="font-size:20px;font-weight:800;color:#8E2E24">${retard}</div>
            <div style="font-size:10px;color:#8E2E24;margin-top:2px">En retard</div>
          </div>
        </div>
        <div style="height:8px;background:#F1EEE8;border-radius:4px;overflow:hidden;display:flex">
          <div style="background:#6E8F4E;width:${Math.round(payees/total2*100)}%"></div>
          <div style="background:#C9971F;width:${Math.round(attente/total2*100)}%"></div>
          <div style="background:#B23A2E;width:${Math.round(retard/total2*100)}%"></div>
        </div>
      </div>`;
  }
  ['sa-top-clients','sa-top-produits','sa-modes-paiement'].forEach(function(id) { const z = el(id); if (z) z.innerHTML = ''; });
}

// ============================================================
// ONGLET 2 — DÉTAIL (top clients, top produits, modes de paiement)
// ============================================================
function _renderOngletDetail() {
  let f = filtrerParPeriode(STATE.factures || [], STATE.statsPeriode, 'date_emission');
  f = appliquerFiltresCroisesStats(f);

  ['stats-grid','sa-monthly','sa-repartition'].forEach(function(id) { const z = el(id); if (z) z.innerHTML = ''; });

  const clientMap = {};
  f.forEach(fac => {
    if (!fac.client) return;
    if (!clientMap[fac.client]) clientMap[fac.client] = {nom:fac.client, ca:0, count:0};
    clientMap[fac.client].ca += Number(fac.ttc)||0;
    clientMap[fac.client].count++;
  });
  const topClients = Object.values(clientMap).sort((a,b)=>b.ca-a.ca).slice(0,5);
  const maxClient = topClients[0]?.ca || 1;
  const couleursAccent = ['#1F6F72','#6E8F4E','#C9971F','#7C5CA6','#B23A2E'];

  const topEl = el('sa-top-clients');
  if (topEl) {
    topEl.innerHTML = `
      <div style="background:#fff;border-radius:14px;padding:14px;border:1px solid #E3DCCF">
        <div style="font-size:13px;font-weight:700;color:#241F1B;margin-bottom:14px">🏆 Top clients</div>
        ${topClients.length ? topClients.map((c,i)=>`
          <div style="margin-bottom:12px;cursor:pointer" onclick="filtrerParClientStats(${JSON.stringify(c.nom)})">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
              <div style="display:flex;align-items:center;gap:8px">
                <div style="width:22px;height:22px;border-radius:50%;background:${couleursAccent[i]};color:#fff;font-size:10px;font-weight:700;display:flex;align-items:center;justify-content:center">${i+1}</div>
                <span style="font-size:12px;font-weight:600;${STATE.statsFiltreClient===c.nom?'text-decoration:underline':''}">${escapeHTML(c.nom)}</span>
              </div>
              <span style="font-size:12px;font-weight:700;color:#241F1B">${fmt(c.ca)} MAD</span>
            </div>
            <div style="height:5px;background:#F1EEE8;border-radius:3px">
              <div style="height:100%;background:${couleursAccent[i]};border-radius:3px;width:${Math.round(c.ca/maxClient*100)}%"></div>
            </div>
            <div style="font-size:10px;color:#9C9186;margin-top:2px">${c.count} facture(s) · toucher pour filtrer</div>
          </div>
        `).join('') : '<div style="text-align:center;padding:14px;color:#9C9186;font-size:12px">Aucune donnée</div>'}
      </div>`;
  }

  const produitMap = {};
  f.forEach(function(fac) {
    const lignes = typeof fac.lignes === 'string' ? JSON.parse(fac.lignes || '[]') : (fac.lignes || []);
    lignes.forEach(function(l) {
      const desc = (l.desc || '').trim();
      if (!desc) return;
      if (!produitMap[desc]) produitMap[desc] = { nom: desc, montant: 0, qte: 0 };
      produitMap[desc].montant += (Number(l.qte)||0) * (Number(l.pu)||0);
      produitMap[desc].qte += Number(l.qte)||0;
    });
  });
  const topProduits = Object.values(produitMap).sort(function(a,b){return b.montant-a.montant;}).slice(0,5);
  const maxProduit = topProduits[0]?.montant || 1;
  const produitEl = el('sa-top-produits');
  if (produitEl) {
    produitEl.innerHTML = topProduits.length ? '<div style="background:#fff;border-radius:14px;padding:14px;border:1px solid #E3DCCF;margin-top:10px">' +
      '<div style="font-size:13px;font-weight:700;color:#241F1B;margin-bottom:14px">📦 Top produits / prestations</div>' +
      topProduits.map(function(p, i) {
        return '<div style="margin-bottom:12px;cursor:pointer" onclick="filtrerParProduitStats(' + JSON.stringify(p.nom) + ')">' +
          '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">' +
            '<span style="font-size:12px;font-weight:600;' + (STATE.statsFiltreProduit===p.nom?'text-decoration:underline':'') + '">' + escapeHTML(p.nom) + '</span>' +
            '<span style="font-size:12px;font-weight:700;color:#241F1B">' + fmt(p.montant) + ' MAD</span>' +
          '</div>' +
          '<div style="height:5px;background:#F1EEE8;border-radius:3px"><div style="height:100%;background:' + couleursAccent[i] + ';border-radius:3px;width:' + Math.round(p.montant/maxProduit*100) + '%"></div></div>' +
          '<div style="font-size:10px;color:#9C9186;margin-top:2px">' + p.qte + ' unité(s) vendue(s)</div>' +
        '</div>';
      }).join('') + '</div>' : '';
  }

  const idsFacturesFiltrees = new Set(f.map(function(fac) { return fac.id; }));
  const paiementsFiltres = (STATE.paiements || []).filter(function(p) { return idsFacturesFiltrees.has(p.facture_id); });
  const modeMap = {};
  paiementsFiltres.forEach(function(p) {
    const mode = p.mode || 'non précisé';
    modeMap[mode] = (modeMap[mode] || 0) + (Number(p.montant) || 0);
  });
  const modeLabels = { virement: '🏦 Virement', especes: '💵 Espèces', cheque: '📝 Chèque', carte: '💳 Carte' };
  const totalPaiements = Object.values(modeMap).reduce(function(s,v){return s+v;}, 0);
  const modes = Object.keys(modeMap).sort(function(a,b){return modeMap[b]-modeMap[a];});
  const modeEl = el('sa-modes-paiement');
  if (modeEl) {
    modeEl.innerHTML = modes.length ? '<div style="background:#fff;border-radius:14px;padding:14px;border:1px solid #E3DCCF;margin-top:10px">' +
      '<div style="font-size:13px;font-weight:700;color:#241F1B;margin-bottom:14px">💰 Modes de paiement</div>' +
      modes.map(function(mode) {
        const montant = modeMap[mode];
        const pct = totalPaiements > 0 ? Math.round(montant/totalPaiements*100) : 0;
        return '<div style="margin-bottom:10px">' +
          '<div style="display:flex;justify-content:space-between;margin-bottom:4px">' +
            '<span style="font-size:12px;font-weight:600">' + (modeLabels[mode] || escapeHTML(mode)) + '</span>' +
            '<span style="font-size:12px;font-weight:700">' + fmt(montant) + ' MAD (' + pct + '%)</span>' +
          '</div>' +
          '<div style="height:6px;background:#F1EEE8;border-radius:3px"><div style="height:100%;background:#1F6F72;border-radius:3px;width:' + pct + '%"></div></div>' +
        '</div>';
      }).join('') + '</div>' : '';
  }
}

// ============================================================
// ONGLET 3 — PRÉVISION (marge estimée + trésorerie 3 mois)
// ============================================================
function _renderOngletPrevision() {
  const factures = (STATE.factures || []).filter(function(f) { return f.statut === 'payee'; }).filter(function(f) { return appliquerFiltresCroisesStats([f]).length > 0; });
  const achats = STATE.achats || [];
  const maintenant = new Date();

  let margeTotale = 0, ventesAvecMarge = 0;
  factures.forEach(function(f) {
    const lignes = typeof f.lignes === 'string' ? JSON.parse(f.lignes || '[]') : (f.lignes || []);
    lignes.forEach(function(l) {
      if (l.produit_id) {
        const prod = (STATE.produits || []).find(function(p) { return p.id === l.produit_id; });
        if (prod && prod.cout_moyen != null) {
          margeTotale += (Number(l.pu) - Number(prod.cout_moyen)) * Number(l.qte);
          ventesAvecMarge++;
        }
      }
    });
  });

  const mois3 = [0,1,2].map(function(i) {
    const d = new Date(maintenant.getFullYear(), maintenant.getMonth() + i, 1);
    return d.toISOString().substring(0,7);
  });
  const previsions = mois3.map(function(m) {
    const aRecevoir = (STATE.factures || []).filter(function(f) {
      return f.statut !== 'payee' && f.statut !== 'annulee' && f.statut !== 'brouillon' && (f.echeance||'').substring(0,7) === m && appliquerFiltresCroisesStats([f]).length > 0;
    }).reduce(function(s,f) { return s + Math.max(0,(f.ttc||0)-(f.montant_recu||0)); }, 0);
    const aPayer = achats.filter(function(a) {
      return a.statut !== 'payee' && (a.echeance||a.date_achat||'').substring(0,7) === m;
    }).reduce(function(s,a) { return s + (a.ttc||0); }, 0);
    return { mois: m, net: aRecevoir - aPayer, aRecevoir, aPayer };
  });

  const nomsMois = ['Jan','Fév','Mar','Avr','Mai','Juin','Juil','Août','Sep','Oct','Nov','Déc'];
  const zone = el('stats-panneau-prevision-contenu');
  if (!zone) return;

  zone.innerHTML =
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:12px">' +
      '<div style="background:linear-gradient(135deg,#55702E,#6E8F4E);border-radius:14px;padding:14px">' +
        '<div style="font-size:11px;color:rgba(255,255,255,0.75);font-weight:600">💰 Marge estimée</div>' +
        '<div style="font-size:19px;font-weight:800;color:#fff">' + fmt(margeTotale) + ' MAD</div>' +
        '<div style="font-size:9px;color:rgba(255,255,255,0.65)">Sur ' + ventesAvecMarge + ' ligne(s) liée(s) au catalogue</div>' +
      '</div>' +
      '<div style="background:linear-gradient(135deg,#154F52,#1F6F72);border-radius:14px;padding:14px">' +
        '<div style="font-size:11px;color:rgba(255,255,255,0.75);font-weight:600">🧾 CA total (payé)</div>' +
        '<div style="font-size:19px;font-weight:800;color:#fff">' + fmt(factures.reduce(function(s,f){return s+(f.ttc||0);},0)) + ' MAD</div>' +
      '</div>' +
    '</div>' +
    '<div style="font-size:13px;font-weight:700;color:#241F1B;margin-bottom:8px">🔮 Prévision de trésorerie (3 prochains mois)</div>' +
    '<div style="background:#fff;border-radius:14px;border:1px solid #E3DCCF;margin-bottom:8px">' +
      previsions.map(function(pr, i) {
        const nomMois = nomsMois[parseInt(pr.mois.split('-')[1]) - 1] + ' ' + pr.mois.split('-')[0];
        return '<div style="padding:12px 14px;' + (i<previsions.length-1?'border-bottom:1px solid #F1EEE8':'') + '">' +
          '<div style="display:flex;justify-content:space-between"><span style="font-size:12px;font-weight:600">' + nomMois + '</span>' +
          '<span style="font-size:13px;font-weight:800;color:' + (pr.net>=0?'#55702E':'#B23A2E') + '">' + fmt(pr.net) + ' MAD</span></div>' +
          '<div style="font-size:10px;color:#9C9186">À recevoir : ' + fmt(pr.aRecevoir) + ' · À payer : ' + fmt(pr.aPayer) + '</div>' +
        '</div>';
      }).join('') +
    '</div>' +
    '<div style="font-size:10px;color:#9C9186;text-align:center;padding:6px">Estimation basée sur les échéances déjà enregistrées — ne remplace pas une vraie prévision de trésorerie professionnelle.</div>';
}

// ============================================================
// FONCTIONS CONSERVÉES TELLES QUELLES (annuaire, notifications de
// rappel, exports CSV) — hors périmètre de la fusion des stats.
// ============================================================
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
    html += rF.map(f => `<div class="card" onclick="openDetail(${f.id})"><div class="card-ico" style="background:#E9F4F3">📄</div><div class="card-body"><div class="card-name">${escapeHTML(f.client)}</div><div class="card-ref">${f.ref}</div></div><div class="card-amt">${fmt(f.ttc)} MAD</div></div>`).join('');
  }
  if (rC.length) {
    html += `<div class="sec-label" style="padding:16px 0 8px">Clients (${rC.length})</div>`;
    html += rC.map(c => `<div class="card" onclick="openDetailClient(${c.id})"><div class="card-ico" style="background:#E9F4F3;font-weight:700;color:#1F6F72;font-size:18px">${escapeHTML(c.nom).charAt(0).toUpperCase()}</div><div class="card-body"><div class="card-name">${escapeHTML(c.nom)}</div><div class="card-ref">${c.tel||c.email||''}</div></div></div>`).join('');
  }
  if (rD.length) {
    html += `<div class="sec-label" style="padding:16px 0 8px">Devis (${rD.length})</div>`;
    html += rD.map(d => `<div class="card" onclick="openDetailDevis(${d.id})"><div class="card-ico" style="background:#FBF0DA">📝</div><div class="card-body"><div class="card-name">${escapeHTML(d.client)}</div><div class="card-ref">${d.ref}</div></div><div class="card-amt">${fmt(d.ttc)} MAD</div></div>`).join('');
  }
  res.innerHTML = html;
}
let _annuaireData = [];
let _annuaireSecteur = '';
async function _recupererEmailsAgentsSupport() {
  try {
    const r = await fetch(SUPABASE_URL + '/rest/v1/agents_support?select=email', {
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY }
    });
    if (!r.ok) return new Set();
    const agents = (await r.json()) || [];
    return new Set(agents.map(function(a) { return (a.email || '').toLowerCase(); }));
  } catch(e) {
    return new Set();
  }
}
async function loadAnnuaire() {
  try {
    const emailsAgents = await _recupererEmailsAgentsSupport();
    const rEnt = await fetch(SUPABASE_URL + '/rest/v1/profils_entreprise?select=id,raison,secteur,ville,tel,email,id_unique,annuaire_contact_visible,adresse,rc,identifiant_fiscal,ice&raison=not.is.null&order=raison.asc&limit=100', {
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY }
    });
    const entreprises = ((await rEnt.json()) || [])
      .filter(function(e) { return !emailsAgents.has((e.email || '').toLowerCase()); })
      .map(function(e) {
        const visible = e.annuaire_contact_visible !== false;
        return Object.assign({}, e, { _type: 'entreprise', tel: visible ? e.tel : '', email: visible ? e.email : '' });
      });
    let comptables = [];
    try {
      const rCpt = await fetch(SUPABASE_URL + '/rest/v1/profils_comptable?select=nom,cabinet,tel,email,annuaire_contact_visible&nom=not.is.null&order=nom.asc&limit=100', {
        headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY }
      });
      comptables = ((await rCpt.json()) || [])
        .filter(function(c) { return !emailsAgents.has((c.email || '').toLowerCase()); })
        .map(function(c) {
          const visible = c.annuaire_contact_visible !== false;
          return { raison: c.cabinet || c.nom, secteur: 'Comptabilité', ville: '', tel: visible ? c.tel : '', email: visible ? c.email : '', id_unique: null, _type: 'comptable', _nomPerso: c.nom };
        });
    } catch(eCpt) {}
    _annuaireData = entreprises.concat(comptables);
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
  const myRaison = STATE.profil?.raison;
  if (myRaison) data = data.filter(e => e.raison !== myRaison);
  if (!data.length) {
    list.innerHTML = '<div class="empty"><div class="empty-ico">🏢</div><div class="empty-title">Aucune entreprise trouvée</div></div>';
    return;
  }
  const secteurEmoji = { 'BTP & Construction':'🏗️', 'Commerce & Négoce':'🛒', 'Transport & Logistique':'🚛', 'Conseil & Expertise':'💼', 'Informatique & Tech':'💻', 'Santé & Médical':'🏥', 'Immobilier':'🏠', 'Artisanat':'🪡', 'Comptabilité':'🧮' };
  function estProfilComplet(e) {
    if (e._type === 'comptable') return false;
    const requis = ['raison', 'adresse', 'tel', 'rc', 'identifiant_fiscal', 'ice'];
    return requis.every(function(k) { return !!e[k]; });
  }
  list.innerHTML = data.map(e => `
    <div class="card" style="margin:0 20px 10px;cursor:pointer" onclick="${e._type === 'comptable' ? `voirProfilComptablePublic('${escapeHTML(e.email||'').replace(/'/g,"\\'")}','${escapeHTML(e.raison||'').replace(/'/g,"\\'")}','${escapeHTML(e.tel||'').replace(/'/g,"\\'")}')` : `ouvrirActionsEntreprise('${e.id_unique||''}','${e.id||''}','${escapeHTML(e.raison||'').replace(/'/g,"\\'")}','${escapeHTML(e.tel||'').replace(/'/g,"\\'")}','${escapeHTML(e.email||'').replace(/'/g,"\\'")}')`}">
      <div style="display:flex;align-items:center;gap:12px">
        <div style="width:44px;height:44px;border-radius:12px;background:#E9F4F3;display:flex;align-items:center;justify-content:center;font-size:22px;flex-shrink:0">${secteurEmoji[e.secteur]||'🏢'}</div>
        <div style="flex:1">
          <div style="font-size:13px;font-weight:700;display:flex;align-items:center;gap:5px">${escapeHTML(e.raison||'')}${estProfilComplet(e) ? '<span title="Profil complet" style="font-size:11px;background:#EEF3E4;color:#55702E;padding:1px 6px;border-radius:8px;font-weight:700">✓ Profil complet</span>' : ''}</div>
          <div style="font-size:11px;color:#6B5F54;margin-top:2px">${e._type === 'comptable' ? '🧮 Cabinet comptable' + (e._nomPerso ? ' · ' + escapeHTML(e._nomPerso) : '') : escapeHTML(e.secteur||'') + (e.ville?' · 📍'+escapeHTML(e.ville):'')}</div>
          ${e.tel?`<div style="font-size:11px;color:#9C9186">📞 ${escapeHTML(e.tel)}</div>`:''}
        </div>
        <div style="font-size:18px;color:#9C9186">›</div>
      </div>
    </div>
  `).join('');
}
function voirProfilEntreprise(idUnique) {
  if (!idUnique) return;
  const url = window.location.origin + window.location.pathname + '?profil=' + idUnique;
  window.open(url, '_blank');
}
function voirProfilComptablePublic(email, raison, tel) {
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;padding:24px';
  overlay.innerHTML =
    '<div style="background:#fff;border-radius:18px;padding:24px;max-width:320px;width:100%;text-align:center">' +
      '<div style="font-size:36px;margin-bottom:10px">🧮</div>' +
      '<div style="font-size:16px;font-weight:700;margin-bottom:4px">' + escapeHTML(raison) + '</div>' +
      '<div style="font-size:12px;color:#9C9186;margin-bottom:18px">Cabinet comptable</div>' +
      (tel ? '<a href="https://wa.me/' + tel.replace(/[^0-9]/g,'') + '" target="_blank" style="display:block;padding:12px;background:#25D366;color:#fff;border-radius:10px;text-decoration:none;font-weight:600;font-size:13px;margin-bottom:8px">💬 Contacter par WhatsApp</a>' : '') +
      (email ? '<a href="mailto:' + email + '" style="display:block;padding:12px;background:#F1EEE8;color:#2A2420;border-radius:10px;text-decoration:none;font-weight:600;font-size:13px;margin-bottom:8px">✉️ ' + escapeHTML(email) + '</a>' : '') +
      '<button onclick="this.closest(\'div[style*=fixed]\').remove()" style="width:100%;padding:10px;background:none;border:none;color:#9C9186;font-size:13px;cursor:pointer;font-family:inherit">Fermer</button>' +
    '</div>';
  overlay.addEventListener('click', function(e) { if (e.target === overlay) overlay.remove(); });
  document.body.appendChild(overlay);
}
function ouvrirActionsEntreprise(idUnique, id, raison, tel, email) {
  const url = window.location.origin + window.location.pathname + '?profil=' + idUnique;
  const qrUrl = 'https://api.qrserver.com/v1/create-qr-code/?size=180x180&color=1F6F72&bgcolor=ffffff&data=' + encodeURIComponent(url);

  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,0.6);display:flex;align-items:flex-end;justify-content:center';
  overlay.innerHTML =
    '<div style="background:#fff;border-radius:20px 20px 0 0;padding:24px;max-width:420px;width:100%;text-align:center">' +
      '<div style="width:40px;height:4px;background:#E3DCCF;border-radius:2px;margin:0 auto 16px"></div>' +
      '<div style="font-size:16px;font-weight:700;margin-bottom:16px">' + escapeHTML(raison) + '</div>' +
      '<img src="' + qrUrl + '" style="width:140px;height:140px;margin-bottom:16px" alt="QR code">' +
      '<div style="display:flex;flex-direction:column;gap:8px">' +
        (id ? '<button class="btn-annuaire-discuter" style="padding:12px;background:#E9F4F3;color:#1F6F72;border:none;border-radius:10px;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit">💬 Discuter</button>' : '') +
        '<button class="btn-annuaire-devis" style="padding:12px;background:#FBF0DA;color:#A67A16;border:none;border-radius:10px;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit">📝 Demander un devis</button>' +
        '<button class="btn-annuaire-voir-profil" style="padding:12px;background:#F1EEE8;color:#2A2420;border:none;border-radius:10px;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit">📄 Voir le profil complet</button>' +
        '<button class="btn-annuaire-fermer" style="padding:11px;background:none;color:#9C9186;border:none;font-size:13px;cursor:pointer;font-family:inherit">Fermer</button>' +
      '</div>' +
    '</div>';
  overlay.addEventListener('click', function(e) { if (e.target === overlay) overlay.remove(); });
  document.body.appendChild(overlay);

  const btnDiscuter = overlay.querySelector('.btn-annuaire-discuter');
  if (btnDiscuter) btnDiscuter.onclick = function() {
    overlay.remove();
    if (typeof demarrerConversation === 'function') demarrerConversation(id, email, sb.user?.email);
  };
  overlay.querySelector('.btn-annuaire-devis').onclick = function() {
    overlay.remove();
    goScreen('demande-devis-fournisseur', null);
    setTimeout(function() {
      const champLien = el('ddf-fournisseur-lien');
      const champNom = el('ddf-fournisseur-nom');
      if (champLien) champLien.value = url;
      if (champNom) champNom.value = raison;
    }, 150);
  };
  overlay.querySelector('.btn-annuaire-voir-profil').onclick = function() {
    overlay.remove();
    window.open(url, '_blank');
  };
  overlay.querySelector('.btn-annuaire-fermer').onclick = function() { overlay.remove(); };
}
function exporterCSV() {
  const f = STATE.factures || [];
  if (!f.length) { showToast('Aucune facture à exporter', 'error'); return; }
  const headers = ['Référence', 'Client', 'Date', 'Échéance', 'HT', 'TVA', 'TTC', 'Statut', 'Mode paiement', 'Chantier / Projet'];
  const rows = f.map(fac => [
    fac.ref || '', fac.client || '', fac.date_emission || '', fac.echeance || '',
    (Number(fac.ht) || 0).toFixed(2), (Number(fac.tva) || 0).toFixed(2), (Number(fac.ttc) || 0).toFixed(2),
    fac.statut || '', fac.paiement || '', fac.chantier || ''
  ]);
  const csv = [headers, ...rows].map(r => r.map(v => '"' + String(v).replace(/"/g, '""') + '"').join(',')).join('\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'banipay_factures_' + new Date().toISOString().split('T')[0] + '.csv';
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 3000);
  showToast('✅ Export CSV téléchargé !', 'success');
}
function exporterCSVDevis() {
  const d = STATE.devis || [];
  if (!d.length) { showToast('Aucun devis à exporter', 'error'); return; }
  const headers = ['Référence', 'Client', 'Date', 'Validité (j)', 'HT', 'TVA', 'TTC', 'Statut', 'Chantier / Projet'];
  const rows = d.map(dv => [
    dv.ref || '', dv.client || '', dv.date_emission || '', dv.validite || 30,
    (Number(dv.ht) || 0).toFixed(2), (Number(dv.tva) || 0).toFixed(2), (Number(dv.ttc) || 0).toFixed(2),
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
function verifierRappels() {
  const today = new Date();
  const retards = (STATE.factures || []).filter(f => {
    if (f.statut === 'payee' || f.statut === 'annulee') return false;
    if (!f.echeance) return false;
    return new Date(f.echeance) < today;
  });
  if (retards.length === 0) return;
  retards.forEach(f => {
    const jours = Math.floor((today - new Date(f.echeance)) / 86400000);
    const existeDejaNotif = STATE.notifications.some(n => n.factureId === f.id && n.type === 'rappel');
    if (!existeDejaNotif) {
      STATE.notifications.unshift({
        type: 'danger', icon: '⚠️',
        title: `Rappel: ${f.ref} en retard de ${jours}j`,
        body: `Client: ${f.client} · ${fmt(f.ttc)} MAD`,
        factureId: f.id
      });
    }
  });
  if (retards.length > 0) badgeF();
}
