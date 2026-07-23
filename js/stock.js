// BANIPAY — stock.js — Gestion de stock avancée

// ============================================================
// DÉCRÉMENT AUTOMATIQUE À LA FACTURATION
// ============================================================

// Appelé après la création d'une facture : décrémente le stock de chaque
// ligne rattachée à un article du catalogue (produit_id présent sur la ligne)
async function decrementerStockDepuisLignes(lignes, refFacture) {
  const uid = sb.user?.id;
  if (!uid) return;
  const lignesAvecStock = (lignes || []).filter(function(l) { return l.produit_id; });
  if (!lignesAvecStock.length) return;

  for (const l of lignesAvecStock) {
    const produit = STATE.produits.find(function(p) { return p.id === l.produit_id; });
    if (!produit || produit.stock === null || produit.stock === undefined) continue; // pas de suivi de stock sur cet article

    const qte = Number(l.qte) || 0;
    const nouveauStock = Math.max(0, Number(produit.stock) - qte);

    try {
      await sb.patch('produits', 'id=eq.' + produit.id + '&user_id=eq.' + uid, { stock: nouveauStock });
      produit.stock = nouveauStock;

      await sb.post('mouvements_stock', {
        user_id: uid,
        produit_id: produit.id,
        type: 'sortie',
        quantite: qte,
        motif: 'Facturation',
        reference: refFacture || ''
      });
    } catch(e) {
      console.warn('decrementerStockDepuisLignes:', e);
    }
  }
  renderProduits();
}

// ============================================================
// AJUSTEMENT MANUEL DE STOCK (entrée / sortie / ajustement)
// ============================================================

window._stockCtx = null;

function ouvrirAjustementStock(produitId) {
  const p = STATE.produits.find(function(x) { return x.id === produitId; });
  if (!p) return;
  window._stockCtx = { produitId };
  setEl('as-titre', 'Ajuster le stock — ' + p.nom);
  setEl('as-stock-actuel', (p.stock !== null && p.stock !== undefined ? p.stock : '—') + ' ' + (p.unite || 'u'));
  el('as-type') && (el('as-type').value = 'entree');
  el('as-quantite') && (el('as-quantite').value = '');
  el('as-motif') && (el('as-motif').value = '');
  el('modal-ajustement-stock')?.classList.add('active');
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

  const stockActuel = Number(p.stock) || 0;
  let nouveauStock;
  if (type === 'entree') nouveauStock = stockActuel + quantite;
  else if (type === 'sortie') nouveauStock = Math.max(0, stockActuel - quantite);
  else nouveauStock = quantite; // ajustement = nouvelle valeur absolue

  showToast('⏳ Mise à jour...');
  try {
    await sb.patch('produits', 'id=eq.' + p.id + '&user_id=eq.' + sb.user.id, { stock: nouveauStock });
    p.stock = nouveauStock;

    await sb.post('mouvements_stock', {
      user_id: sb.user.id,
      produit_id: p.id,
      type: type,
      quantite: type === 'ajustement' ? (nouveauStock - stockActuel) : quantite,
      motif: motif || (type === 'entree' ? 'Entrée manuelle' : type === 'sortie' ? 'Sortie manuelle' : 'Ajustement manuel'),
      reference: ''
    });

    closeAllModals();
    renderProduits();
    showToast('✅ Stock mis à jour : ' + nouveauStock + ' ' + (p.unite || 'u'), 'success');
    logAudit('produit', p.id, 'modification', 'Stock ajusté (' + type + ') : ' + p.nom + ' → ' + nouveauStock);
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
  overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;z-index:9999;background:#F8FAFC;overflow-y:auto;font-family:inherit';
  overlay.innerHTML =
    '<div style="background:linear-gradient(135deg,#1E1B4B,#3730A3);padding:14px 20px;display:flex;align-items:center;gap:12px">' +
      '<button class="close-hist-stock" style="background:rgba(255,255,255,0.15);color:#fff;border:none;border-radius:8px;padding:7px 12px;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit">←</button>' +
      '<div><div style="font-size:14px;font-weight:700;color:#fff">' + escapeHTML(p.nom) + '</div>' +
      '<div style="font-size:11px;color:rgba(255,255,255,0.5)">Stock actuel : ' + (p.stock !== null && p.stock !== undefined ? p.stock : '—') + ' ' + (p.unite||'u') + '</div></div>' +
    '</div>' +
    '<div id="historique-stock-list" style="padding:16px 20px"><div style="text-align:center;color:#94A3B8;padding:30px">⏳ Chargement...</div></div>';

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
    const typeColors = { entree: '#059669', sortie: '#EF4444', ajustement: '#D97706' };
    const typeLabels = { entree: 'Entrée', sortie: 'Sortie', ajustement: 'Ajustement' };
    list.innerHTML = mouvements.map(function(m) {
      return '<div style="display:flex;gap:12px;padding:12px 0;border-bottom:1px solid #F1F5F9;align-items:flex-start">' +
        '<div style="width:32px;height:32px;border-radius:8px;background:#F8FAFC;display:flex;align-items:center;justify-content:center;font-size:15px;flex-shrink:0">' + (typeIcons[m.type]||'📌') + '</div>' +
        '<div style="flex:1">' +
          '<div style="font-size:13px;font-weight:600;color:' + (typeColors[m.type]||'#0F172A') + '">' + (typeLabels[m.type]||m.type) + ' — ' + m.quantite + ' ' + (p.unite||'u') + '</div>' +
          (m.motif ? '<div style="font-size:12px;color:#64748B;margin-top:2px">' + escapeHTML(m.motif) + (m.reference ? ' · ' + escapeHTML(m.reference) : '') + '</div>' : '') +
          '<div style="font-size:11px;color:#94A3B8;margin-top:3px">' + formatDateTime(m.created_at) + '</div>' +
        '</div>' +
      '</div>';
    }).join('');
  } catch(e) {
    const list = document.getElementById('historique-stock-list');
    if (list) list.innerHTML = '<div style="text-align:center;padding:30px;color:#EF4444">Erreur de chargement</div>';
  }
}
