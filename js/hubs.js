// ZELTO — hubs.js — Rubriques Achats / Ventes restructurées
// ============================================================
// Deux points d'entrée consolidés (au lieu d'écrans dispersés) :
// - Achats : devis d'achat (à venir), factures d'achat, bons de commande
//   envoyés aux fournisseurs
// - Ventes : devis, factures, bons de commande reçus des clients, bons de
//   livraison
// Chaque tuile affiche un résumé et mène vers l'écran détaillé existant
// (rien n'est dupliqué — on ne fait que consolider l'accès).

function _tuileHub(icone, titre, sousTitre, montant, couleurFond, couleurTexte, onclick) {
  return '<div onclick="' + onclick + '" style="background:' + couleurFond + ';border-radius:14px;padding:16px;margin-bottom:10px;cursor:pointer;display:flex;justify-content:space-between;align-items:center">' +
    '<div style="display:flex;align-items:center;gap:12px">' +
      '<div style="font-size:24px">' + icone + '</div>' +
      '<div><div style="font-size:13px;font-weight:700;color:' + couleurTexte + '">' + titre + '</div><div style="font-size:11px;color:' + couleurTexte + ';opacity:0.75">' + sousTitre + '</div></div>' +
    '</div>' +
    (montant != null ? '<div style="font-size:14px;font-weight:800;color:' + couleurTexte + '">' + montant + '</div>' : '<div style="font-size:16px;color:' + couleurTexte + '">→</div>') +
  '</div>';
}

function renderHubAchats() {
  const container = el('hub-achats-content');
  if (!container) return;

  const achats = STATE.achats || [];
  const bcEnvoyes = STATE.bonsCommande || [];
  const totalAchats = achats.reduce(function(s,a){return s+(Number(a.ttc)||0);},0);
  const bcEnAttente = bcEnvoyes.filter(function(bc){return bc.statut==='envoye';}).length;

  container.innerHTML =
    _tuileHub('🧾', 'Factures d\'achat', achats.length + ' facture(s) enregistrée(s)', fmt(totalAchats) + ' MAD', '#F5E4E1', '#8E2E24', "goScreen('achats',null)") +
    _tuileHub('📋', 'Bons de commande envoyés', bcEnvoyes.length + ' BC · ' + bcEnAttente + ' en attente de réponse', null, '#EDE6F0', '#6A4E85', "goScreen('bons-commande-list',null)") +
    '<div style="font-size:10px;color:#9C9186;text-align:center;padding:12px">💡 Un devis d\'achat (demande de prix à un fournisseur) n\'existe pas encore comme document séparé — à construire si besoin.</div>';
}

function renderHubVentes() {
  const container = el('hub-ventes-content');
  if (!container) return;

  const factures = STATE.factures || [];
  const devisListe = STATE.devis || [];
  const bcRecus = STATE.bcRecus || [];
  const bl = STATE.bonsLivraison || [];
  const totalCA = factures.filter(function(f){return f.statut==='payee';}).reduce(function(s,f){return s+(Number(f.ttc)||0);},0);
  const bcNonConvertis = bcRecus.filter(function(bc){return !bc.facture_generee_id;}).length;

  container.innerHTML =
    _tuileHub('📝', 'Devis', devisListe.length + ' devis', null, '#F7EFDC', '#A67A16', "goScreen('devis-list',null)") +
    _tuileHub('🧾', 'Factures', factures.length + ' facture(s)', fmt(totalCA) + ' MAD encaissé', '#EEF3E4', '#55702E', "goScreen('dashboard',null)") +
    _tuileHub('📋', 'Bons de commande reçus', bcRecus.length + ' reçu(s) · ' + bcNonConvertis + ' à convertir', null, '#EDE6F0', '#6A4E85', "loadBCRecus();goScreen('bc-recus',null)") +
    _tuileHub('📦', 'Bons de livraison', bl.length + ' BL envoyé(s)', null, '#E9F4F3', '#1F6F72', "goScreen('bons-livraison-list',null)");
}
