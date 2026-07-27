// BANIPAY — finance.js — Position financière consolidée
// Combine factures impayées (à recevoir), achats impayés (à payer) et
// valeur du stock pour donner une photo de trésorerie en un coup d'œil.

function renderPositionFinanciere() {
  const container = el('position-financiere-content');
  if (!container) return;

  const factures = STATE.factures || [];
  const achats = STATE.achats || [];
  const produits = STATE.produits || [];

  const aRecevoir = factures
    .filter(function(f) { return f.statut !== 'payee' && f.statut !== 'annulee' && f.statut !== 'brouillon'; })
    .reduce(function(s, f) { return s + Math.max(0, Number(f.ttc || 0) - Number(f.montant_recu || 0)); }, 0);

  const aPayer = achats
    .filter(function(a) { return a.statut !== 'payee'; })
    .reduce(function(s, a) { return s + Number(a.ttc || 0); }, 0);

  const valeurStock = typeof calculerValeurStockTotale === 'function' ? calculerValeurStockTotale() : 0;
  const suiviStock = produits.some(function(p) { return p.stock !== null && p.stock !== undefined; });

  const soldeNet = aRecevoir + valeurStock - aPayer;

  const nbFacturesImpayees = factures.filter(function(f) { return f.statut !== 'payee' && f.statut !== 'annulee' && f.statut !== 'brouillon'; }).length;
  const nbAchatsImpayes = achats.filter(function(a) { return a.statut !== 'payee'; }).length;

  container.innerHTML =
    '<div style="background:linear-gradient(160deg,#241F1B,#154F52);border-radius:16px;padding:20px;margin-bottom:16px">' +
      '<div style="font-size:11px;color:rgba(255,255,255,0.5);text-transform:uppercase;letter-spacing:0.08em;margin-bottom:6px">Solde net estimé</div>' +
      '<div style="font-size:30px;font-weight:800;color:' + (soldeNet >= 0 ? '#9CBB7A' : '#D98177') + '">' + fmt(soldeNet) + ' MAD</div>' +
      '<div style="font-size:11px;color:rgba(255,255,255,0.4);margin-top:4px">À recevoir + valeur du stock − à payer</div>' +
    '</div>' +

    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px">' +
      '<div style="background:#EEF3E4;border-radius:12px;padding:14px">' +
        '<div style="font-size:11px;font-weight:600;color:#55702E">💰 À recevoir</div>' +
        '<div style="font-size:18px;font-weight:800;color:#55702E">' + fmt(aRecevoir) + ' MAD</div>' +
        '<div style="font-size:10px;color:#55702E;margin-top:2px">' + nbFacturesImpayees + ' facture(s) impayée(s)</div>' +
      '</div>' +
      '<div style="background:#F5E4E1;border-radius:12px;padding:14px">' +
        '<div style="font-size:11px;font-weight:600;color:#B23A2E">🛒 À payer</div>' +
        '<div style="font-size:18px;font-weight:800;color:#B23A2E">' + fmt(aPayer) + ' MAD</div>' +
        '<div style="font-size:10px;color:#B23A2E;margin-top:2px">' + nbAchatsImpayes + ' achat(s) en attente</div>' +
      '</div>' +
    '</div>' +

    (suiviStock ?
      '<div style="background:#FBF0DA;border-radius:12px;padding:14px;margin-bottom:16px">' +
        '<div style="font-size:11px;font-weight:600;color:#A67A16">📦 Valeur du stock</div>' +
        '<div style="font-size:18px;font-weight:800;color:#A67A16">' + fmt(valeurStock) + ' MAD</div>' +
      '</div>' : '') +

    '<div style="font-size:11px;color:#9C9186;text-align:center;padding:0 8px">Estimation indicative basée sur les factures/achats enregistrés dans BaniPay — ne remplace pas un état de trésorerie comptable complet.</div>';
}
