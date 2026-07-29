// ZELTO — dashboard-avance.js — Statistiques avancées
// ============================================================
// Nouvel écran : chiffre d'affaires par mois, marge (estimée sur les
// lignes liées au catalogue), top clients, top produits, évolution du CA,
// prévision de trésorerie simple (factures + achats groupés par échéance).
// Graphiques en barres/courbe construits en SVG pur (pas de librairie
// externe ajoutée).

function renderDashboardAvance() {
  const container = el('dashboard-avance-content');
  if (!container) return;

  const factures = (STATE.factures || []).filter(function(f) { return f.statut === 'payee'; });
  const achats = STATE.achats || [];

  // ---- CA par mois (12 derniers mois) ----
  const mois12 = [];
  const maintenant = new Date();
  for (let i = 11; i >= 0; i--) {
    const d = new Date(maintenant.getFullYear(), maintenant.getMonth() - i, 1);
    mois12.push(d.toISOString().substring(0, 7));
  }
  const caParMois = mois12.map(function(m) {
    return factures.filter(function(f) { return (f.date_emission || '').substring(0,7) === m; })
      .reduce(function(s, f) { return s + (Number(f.ttc) || 0); }, 0);
  });
  const maxCA = Math.max(1, ...caParMois);

  // ---- Marge estimée (uniquement sur les lignes liées au catalogue —
  // impossible à calculer pour une ligne saisie librement sans coût connu) ----
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

  // ---- Top clients ----
  const parClient = {};
  factures.forEach(function(f) { parClient[f.client] = (parClient[f.client] || 0) + (Number(f.ttc) || 0); });
  const topClients = Object.entries(parClient).sort(function(a,b) { return b[1]-a[1]; }).slice(0, 5);

  // ---- Top produits ----
  const parProduit = {};
  factures.forEach(function(f) {
    const lignes = typeof f.lignes === 'string' ? JSON.parse(f.lignes || '[]') : (f.lignes || []);
    lignes.forEach(function(l) { parProduit[l.desc] = (parProduit[l.desc] || 0) + (Number(l.qte)*Number(l.pu) || 0); });
  });
  const topProduits = Object.entries(parProduit).sort(function(a,b) { return b[1]-a[1]; }).slice(0, 5);

  // ---- Prévision de trésorerie (3 prochains mois, factures à recevoir vs achats à payer, par échéance) ----
  const mois3 = [0,1,2].map(function(i) {
    const d = new Date(maintenant.getFullYear(), maintenant.getMonth() + i, 1);
    return d.toISOString().substring(0,7);
  });
  const previsions = mois3.map(function(m) {
    const aRecevoir = (STATE.factures || []).filter(function(f) {
      return f.statut !== 'payee' && f.statut !== 'annulee' && f.statut !== 'brouillon' && (f.echeance||'').substring(0,7) === m;
    }).reduce(function(s,f) { return s + Math.max(0,(f.ttc||0)-(f.montant_recu||0)); }, 0);
    const aPayer = achats.filter(function(a) {
      return a.statut !== 'payee' && (a.echeance||a.date_achat||'').substring(0,7) === m;
    }).reduce(function(s,a) { return s + (a.ttc||0); }, 0);
    return { mois: m, net: aRecevoir - aPayer, aRecevoir, aPayer };
  });

  // ---- Rendu ----
  const nomsMois = ['Jan','Fév','Mar','Avr','Mai','Juin','Juil','Août','Sep','Oct','Nov','Déc'];
  const barresCA = caParMois.map(function(v, i) {
    const h = Math.round((v / maxCA) * 100);
    const label = nomsMois[parseInt(mois12[i].split('-')[1]) - 1];
    return '<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:4px">' +
      '<div style="width:100%;max-width:22px;height:100px;display:flex;align-items:flex-end">' +
        '<div style="width:100%;height:' + h + '%;background:#C9971F;border-radius:3px 3px 0 0" title="' + fmt(v) + ' MAD"></div>' +
      '</div>' +
      '<div style="font-size:9px;color:#9C9186">' + label + '</div>' +
    '</div>';
  }).join('');

  container.innerHTML =
    '<div style="font-size:13px;font-weight:700;margin-bottom:8px">📈 Chiffre d\'affaires — 12 derniers mois</div>' +
    '<div style="display:flex;gap:4px;align-items:flex-end;background:#fff;border-radius:12px;padding:12px;margin-bottom:16px;border:1px solid #E3DCCF">' + barresCA + '</div>' +

    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:16px">' +
      '<div style="background:#EEF3E4;border-radius:12px;padding:12px">' +
        '<div style="font-size:11px;color:#55702E;font-weight:600">💰 Marge estimée</div>' +
        '<div style="font-size:18px;font-weight:800;color:#55702E">' + fmt(margeTotale) + ' MAD</div>' +
        '<div style="font-size:9px;color:#55702E">Sur ' + ventesAvecMarge + ' ligne(s) liée(s) au catalogue</div>' +
      '</div>' +
      '<div style="background:#E9F4F3;border-radius:12px;padding:12px">' +
        '<div style="font-size:11px;color:#1F6F72;font-weight:600">🧾 CA total (payé)</div>' +
        '<div style="font-size:18px;font-weight:800;color:#1F6F72">' + fmt(factures.reduce(function(s,f){return s+(f.ttc||0);},0)) + ' MAD</div>' +
      '</div>' +
    '</div>' +

    '<div style="font-size:13px;font-weight:700;margin-bottom:8px">🏆 Top 5 clients</div>' +
    '<div style="background:#fff;border-radius:12px;border:1px solid #E3DCCF;margin-bottom:16px">' +
      (topClients.length ? topClients.map(function(c, i) {
        return '<div style="display:flex;justify-content:space-between;padding:10px 14px;' + (i<topClients.length-1?'border-bottom:1px solid #F1EEE8':'') + '">' +
          '<span style="font-size:12px">' + (i+1) + '. ' + escapeHTML(c[0]) + '</span>' +
          '<span style="font-size:12px;font-weight:700">' + fmt(c[1]) + ' MAD</span>' +
        '</div>';
      }).join('') : '<div style="padding:14px;text-align:center;color:#9C9186;font-size:12px">Aucune donnée</div>') +
    '</div>' +

    '<div style="font-size:13px;font-weight:700;margin-bottom:8px">📦 Top 5 produits/prestations</div>' +
    '<div style="background:#fff;border-radius:12px;border:1px solid #E3DCCF;margin-bottom:16px">' +
      (topProduits.length ? topProduits.map(function(pr, i) {
        return '<div style="display:flex;justify-content:space-between;padding:10px 14px;' + (i<topProduits.length-1?'border-bottom:1px solid #F1EEE8':'') + '">' +
          '<span style="font-size:12px">' + (i+1) + '. ' + escapeHTML(pr[0]) + '</span>' +
          '<span style="font-size:12px;font-weight:700">' + fmt(pr[1]) + ' MAD</span>' +
        '</div>';
      }).join('') : '<div style="padding:14px;text-align:center;color:#9C9186;font-size:12px">Aucune donnée</div>') +
    '</div>' +

    '<div style="font-size:13px;font-weight:700;margin-bottom:8px">🔮 Prévision de trésorerie (simple)</div>' +
    '<div style="background:#fff;border-radius:12px;border:1px solid #E3DCCF;margin-bottom:8px">' +
      previsions.map(function(pr, i) {
        const nomMois = nomsMois[parseInt(pr.mois.split('-')[1]) - 1] + ' ' + pr.mois.split('-')[0];
        return '<div style="padding:12px 14px;' + (i<previsions.length-1?'border-bottom:1px solid #F1EEE8':'') + '">' +
          '<div style="display:flex;justify-content:space-between"><span style="font-size:12px;font-weight:600">' + nomMois + '</span>' +
          '<span style="font-size:13px;font-weight:800;color:' + (pr.net>=0?'#6E8F4E':'#B23A2E') + '">' + fmt(pr.net) + ' MAD</span></div>' +
          '<div style="font-size:10px;color:#9C9186">À recevoir: ' + fmt(pr.aRecevoir) + ' · À payer: ' + fmt(pr.aPayer) + '</div>' +
        '</div>';
      }).join('') +
    '</div>' +
    '<div style="font-size:10px;color:#9C9186;text-align:center;padding:8px">Estimation basée sur les échéances déjà enregistrées — ne remplace pas une vraie prévision de trésorerie professionnelle.</div>';
}
