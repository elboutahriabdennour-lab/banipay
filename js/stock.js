// ZELTO — stock.js — Gestion de stock avancée + valorisation CMUP/FIFO/LIFO

// ============================================================
// ENTRÉE DE STOCK (achats, réapprovisionnement)
// ============================================================
// Met à jour le stock, le coût moyen pondéré, crée un lot (pour FIFO/LIFO)
// et journalise le mouvement avec son coût unitaire.
async function enregistrerEntreeStock(produitId, quantite, coutUnitaire, motif, reference) {
  const uid = sb.user?.id;
  if (!uid || !produitId || !(quantite > 0)) return;
  const produit = STATE.produits.find(function(p) { return p.id === produitId; });
  if (!produit) return;

  const stockActuel = Number(produit.stock) || 0;
  const nouveauStock = stockActuel + quantite;
  const coutMoyenActuel = Number(produit.cout_moyen) || 0;
  const cout = Number(coutUnitaire) || 0;
  const nouveauCoutMoyen = nouveauStock > 0
    ? ((stockActuel * coutMoyenActuel) + (quantite * cout)) / nouveauStock
    : cout;

  try {
    await sb.patch('produits', 'id=eq.' + produitId + '&user_id=eq.' + uid, { stock: nouveauStock, cout_moyen: nouveauCoutMoyen });
    produit.stock = nouveauStock;
    produit.cout_moyen = nouveauCoutMoyen;

    await sb.post('lots_stock', {
      user_id: uid,
      produit_id: produitId,
      quantite_restante: quantite,
      cout_unitaire: cout
    });

    await sb.post('mouvements_stock', {
      user_id: uid,
      produit_id: produitId,
      type: 'entree',
      quantite: quantite,
      cout_unitaire: cout,
      motif: motif || 'Entrée stock',
      reference: reference || ''
    });

    renderProduits();
  } catch(e) {
    console.warn('enregistrerEntreeStock:', e);
  }
}

// ============================================================
// SORTIE DE STOCK (ventes, facturation) — coût calculé selon la
// méthode de valorisation choisie par l'entreprise (CMUP/FIFO/LIFO)
// ============================================================
async function enregistrerSortieStock(produitId, quantite, motif, reference) {
  const uid = sb.user?.id;
  if (!uid || !produitId || !(quantite > 0)) return 0;
  const produit = STATE.produits.find(function(p) { return p.id === produitId; });
  if (!produit) return 0;

  const methode = (STATE.profil?.methode_stock || 'CMUP').toUpperCase();
  const stockActuel = Number(produit.stock) || 0;
  const nouveauStock = Math.max(0, stockActuel - quantite);
  let coutTotalSortie = 0;

  try {
    if (methode === 'FIFO' || methode === 'LIFO') {
      const ordre = methode === 'FIFO' ? 'created_at.asc' : 'created_at.desc';
      const lots = await sb.get('lots_stock', 'produit_id=eq.' + produitId + '&user_id=eq.' + uid + '&quantite_restante=gt.0&order=' + ordre);
      let aConsommer = quantite;
      for (const lot of (lots || [])) {
        if (aConsommer <= 0) break;
        const qteConsommee = Math.min(Number(lot.quantite_restante), aConsommer);
        coutTotalSortie += qteConsommee * (Number(lot.cout_unitaire) || 0);
        aConsommer -= qteConsommee;
        try {
          await sb.patch('lots_stock', 'id=eq.' + lot.id, { quantite_restante: Number(lot.quantite_restante) - qteConsommee });
        } catch(eLot) { console.warn('enregistrerSortieStock: maj lot échouée', eLot); }
      }
      if (aConsommer > 0) {
        coutTotalSortie += aConsommer * (Number(produit.cout_moyen) || 0);
      }
    } else {
      coutTotalSortie = quantite * (Number(produit.cout_moyen) || 0);
    }

    await sb.patch('produits', 'id=eq.' + produitId + '&user_id=eq.' + uid, { stock: nouveauStock });
    produit.stock = nouveauStock;

    const coutUnitaireSortie = quantite > 0 ? coutTotalSortie / quantite : 0;
    await sb.post('mouvements_stock', {
      user_id: uid,
      produit_id: produitId,
      type: 'sortie',
      quantite: quantite,
      cout_unitaire: coutUnitaireSortie,
      motif: motif || 'Sortie stock',
      reference: reference || ''
    });

    renderProduits();
    return coutTotalSortie;
  } catch(e) {
    console.warn('enregistrerSortieStock:', e);
    return 0;
  }
}

// ============================================================
// DÉCRÉMENT AUTOMATIQUE À LA FACTURATION (appelé depuis factures.js)
// ============================================================

async function decrementerStockDepuisLignes(lignes, refFacture) {
  const lignesAvecStock = (lignes || []).filter(function(l) { return l.produit_id; });
  if (!lignesAvecStock.length) return;

  for (const l of lignesAvecStock) {
    const produit = STATE.produits.find(function(p) { return p.id === l.produit_id; });
    if (!produit || produit.stock === null || produit.stock === undefined) continue;
    const qte = Number(l.qte) || 0;
    await enregistrerSortieStock(produit.id, qte, 'Facturation', refFacture || '');
  }
}

// ============================================================
// AJUSTEMENT MANUEL DE STOCK (entrée / sortie / ajustement)
// ============================================================

window._stockCtx = null;

function ouvrirAjustementStock(produitId) {
  if (typeof verifierAccesFeature === 'function' && !verifierAccesFeature('stock', 'Gestion de stock avancée')) return;
  const p = STATE.produits.find(function(x) { return x.id === produitId; });
  if (!p) return;
  window._stockCtx = { produitId };
  setEl('as-titre', 'Ajuster le stock — ' + p.nom);
  setEl('as-stock-actuel', (p.stock !== null && p.stock !== undefined ? p.stock : '—') + ' ' + (p.unite || 'u'));
  el('as-type') && (el('as-type').value = 'entree');
  el('as-quantite') && (el('as-quantite').value = '');
  el('as-cout') && (el('as-cout').value = p.cout_moyen || '');
  el('as-motif') && (el('as-motif').value = '');
  afficherChampCoutSiEntree();
  el('modal-ajustement-stock')?.classList.add('active');
}

function afficherChampCoutSiEntree() {
  const type = el('as-type')?.value;
  const bloc = el('as-cout-bloc');
  if (bloc) bloc.style.display = (type === 'entree') ? 'block' : 'none';
}

async function confirmerAjustementStock() {
  const ctx = window._stockCtx;
  if (!ctx) return;
  const p = STATE.produits.find(function(x) { return x.id === ctx.produitId; });
  if (!p) return;

  const type = el('as-type')?.value || 'entree';
  const quantite = parseFloat(el('as-quantite')?.value) || 0;
  const motif = el('as-motif')?.value.trim() || '';

  if (quantite <= 0) { showToast('Entrez une quantité valide', 'error'); return; }

  showToast('⏳ Mise à jour...');
  try {
    if (type === 'entree') {
      const cout = parseFloat(el('as-cout')?.value) || 0;
      await enregistrerEntreeStock(p.id, quantite, cout, motif || 'Entrée manuelle');
    } else if (type === 'sortie') {
      await enregistrerSortieStock(p.id, quantite, motif || 'Sortie manuelle');
    } else {
      const stockActuel = Number(p.stock) || 0;
      await sb.patch('produits', 'id=eq.' + p.id + '&user_id=eq.' + sb.user.id, { stock: quantite });
      p.stock = quantite;
      await sb.post('mouvements_stock', {
        user_id: sb.user.id,
        produit_id: p.id,
        type: 'ajustement',
        quantite: quantite - stockActuel,
        motif: motif || 'Ajustement manuel (inventaire)',
        reference: ''
      });
      renderProduits();
    }

    closeAllModals();
    showToast('✅ Stock mis à jour : ' + p.stock + ' ' + (p.unite || 'u'), 'success');
    logAudit('produit', p.id, 'modification', 'Stock ajusté (' + type + ') : ' + p.nom + ' → ' + p.stock);
  } catch(e) {
    showToast('❌ ' + e.message, 'error');
  }
}

// ============================================================
// HISTORIQUE DES MOUVEMENTS D'UN PRODUIT
// ============================================================

async function ouvrirHistoriqueStock(produitId) {
  const p = STATE.produits.find(function(x) { return x.id === produitId; });
  if (!p) return;

  const overlay = document.createElement('div');
  overlay.id = 'historique-stock-overlay';
  overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;z-index:9999;background:#F1EEE8;overflow-y:auto;font-family:inherit';
  overlay.innerHTML =
    '<div style="background:linear-gradient(135deg,#241F1B,#A67A16);padding:14px 20px;display:flex;align-items:center;gap:12px">' +
      '<button class="close-hist-stock" style="background:rgba(255,255,255,0.15);color:#fff;border:none;border-radius:8px;padding:7px 12px;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit">←</button>' +
      '<div><div style="font-size:14px;font-weight:700;color:#fff">' + escapeHTML(p.nom) + '</div>' +
      '<div style="font-size:11px;color:rgba(255,255,255,0.5)">Stock actuel : ' + (p.stock !== null && p.stock !== undefined ? p.stock : '—') + ' ' + (p.unite||'u') + (p.cout_moyen ? ' · Coût moyen : ' + fmt(p.cout_moyen) + ' MAD' : '') + '</div></div>' +
    '</div>' +
    '<div id="historique-stock-list" style="padding:16px 20px"><div style="text-align:center;color:#9C9186;padding:30px">⏳ Chargement...</div></div>';

  document.body.appendChild(overlay);
  overlay.querySelector('.close-hist-stock').onclick = function() { overlay.remove(); };

  try {
    const mouvements = await sb.get('mouvements_stock', 'produit_id=eq.' + produitId + '&order=created_at.desc&limit=50');
    const list = document.getElementById('historique-stock-list');
    if (!mouvements || !mouvements.length) {
      list.innerHTML = '<div class="empty"><div class="empty-ico">📦</div><div class="empty-title">Aucun mouvement enregistré</div></div>';
      return;
    }
    const typeIcons = { entree: '⬆️', sortie: '⬇️', ajustement: '⚖️' };
    const typeColors = { entree: '#6E8F4E', sortie: '#B23A2E', ajustement: '#B8860B' };
    const typeLabels = { entree: 'Entrée', sortie: 'Sortie', ajustement: 'Ajustement' };
    list.innerHTML = mouvements.map(function(m) {
      return '<div style="display:flex;gap:12px;padding:12px 0;border-bottom:1px solid #EAE4DA;align-items:flex-start">' +
        '<div style="width:32px;height:32px;border-radius:8px;background:#F1EEE8;display:flex;align-items:center;justify-content:center;font-size:15px;flex-shrink:0">' + (typeIcons[m.type]||'📌') + '</div>' +
        '<div style="flex:1">' +
          '<div style="font-size:13px;font-weight:600;color:' + (typeColors[m.type]||'#2A2420') + '">' + (typeLabels[m.type]||m.type) + ' — ' + m.quantite + ' ' + (p.unite||'u') + (m.cout_unitaire ? ' · ' + fmt(m.cout_unitaire) + ' MAD/u' : '') + '</div>' +
          (m.motif ? '<div style="font-size:12px;color:#6B5F54;margin-top:2px">' + escapeHTML(m.motif) + (m.reference ? ' · ' + escapeHTML(m.reference) : '') + '</div>' : '') +
          '<div style="font-size:11px;color:#9C9186;margin-top:3px">' + formatDateTime(m.created_at) + '</div>' +
        '</div>' +
      '</div>';
    }).join('');
  } catch(e) {
    const list = document.getElementById('historique-stock-list');
    if (list) list.innerHTML = '<div style="text-align:center;padding:30px;color:#B23A2E">Erreur de chargement</div>';
  }
}

// ============================================================
// VALEUR TOTALE DU STOCK (utilise le coût moyen — vue rapide)
// ============================================================

function calculerValeurStockTotale() {
  return (STATE.produits || []).reduce(function(s, p) {
    if (p.stock == null) return s;
    return s + (Number(p.stock) * (Number(p.cout_moyen) || 0));
  }, 0);
}

// ============================================================
// RAPPORT DE VALORISATION DU STOCK
// ============================================================
// Le calcul (CMUP/FIFO/LIFO) tournait déjà en interne à chaque mouvement,
// mais rien n'affichait concrètement le détail par article — juste un total
// global sur l'écran Catalogue.
function renderRapportStock() {
  const container = el('rapport-stock-content');
  if (!container) return;

  const produits = (STATE.produits || []).filter(function(p) { return p.stock !== null && p.stock !== undefined; });
  if (!produits.length) {
    container.innerHTML = '<div class="empty"><div class="empty-ico">📦</div><div class="empty-title">Aucun article suivi en stock</div></div>';
    return;
  }

  const methode = STATE.profil?.methode_stock || 'CMUP';
  const methodeLabel = { CMUP: 'Coût moyen unitaire pondéré', FIFO: 'Premier entré, premier sorti', LIFO: 'Dernier entré, premier sorti' }[methode] || methode;
  const valeurTotale = calculerValeurStockTotale();

  container.innerHTML =
    '<div style="background:#FBF0DA;border-radius:12px;padding:12px 16px;margin-bottom:12px">' +
      '<div style="font-size:11px;color:#A67A16;font-weight:600">Méthode active : ' + methodeLabel + '</div>' +
      '<div style="font-size:20px;font-weight:800;color:#A67A16;margin-top:4px">' + fmt(valeurTotale) + ' MAD</div>' +
      '<div style="font-size:10px;color:#A67A16">Valeur totale du stock (modifiable dans Paramètres)</div>' +
    '</div>' +
    '<div style="display:grid;grid-template-columns:1fr 60px 70px 80px;padding:8px 4px;font-size:9px;font-weight:700;text-transform:uppercase;color:#9C9186;border-bottom:1px solid #E3DCCF">' +
      '<div>Article</div><div style="text-align:right">Stock</div><div style="text-align:right">Coût moy.</div><div style="text-align:right">Valeur</div>' +
    '</div>' +
    produits.map(function(p) {
      const cout = Number(p.cout_moyen) || 0;
      const valeur = (Number(p.stock)||0) * cout;
      const bas = p.seuil_alerte != null && Number(p.stock) <= Number(p.seuil_alerte);
      return '<div style="display:grid;grid-template-columns:1fr 60px 70px 80px;padding:10px 4px;border-bottom:1px solid #F1EEE8;align-items:center">' +
        '<div style="font-size:12px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + escapeHTML(p.nom) + (bas ? ' ⚠️' : '') + '</div>' +
        '<div style="font-size:12px;text-align:right;' + (bas ? 'color:#B23A2E;font-weight:700' : '') + '">' + p.stock + '</div>' +
        '<div style="font-size:11px;text-align:right;color:#6B5F54">' + fmt(cout) + '</div>' +
        '<div style="font-size:12px;text-align:right;font-weight:700">' + fmt(valeur) + '</div>' +
      '</div>';
    }).join('');
}
