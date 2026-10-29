// ZELTO — selection.js — Sélection multiple + actions groupées
// ============================================================
// Mécanisme réutilisable pour les listes (factures, devis, achats, bons de
// commande) : bouton "Sélectionner" qui fait apparaître des cases à
// cocher, puis une barre d'actions groupées (Supprimer / Partager /
// Envoyer).

STATE.selectionMode = null;   // 'factures' | 'devis' | 'achats' | 'bc' | null
STATE.selectionIds = [];

const _SELECTION_CONFIG = {
  factures: { table: 'factures', stateKey: 'factures', renderFn: 'renderFactureList', labelUn: 'facture', labelPl: 'factures' },
  devis: { table: 'devis', stateKey: 'devis', renderFn: 'renderDevisList', labelUn: 'devis', labelPl: 'devis' },
  achats: { table: 'factures_achat', stateKey: 'achats', renderFn: 'renderAchats', labelUn: 'achat', labelPl: 'achats' },
  bc: { table: 'bons_commande', stateKey: 'bonsCommande', renderFn: 'renderBonsCommandeListe', labelUn: 'bon de commande', labelPl: 'bons de commande' },
};

function toggleSelectionMode(type) {
  STATE.selectionMode = STATE.selectionMode === type ? null : type;
  STATE.selectionIds = [];
  const cfg = _SELECTION_CONFIG[type];
  if (cfg && typeof window[cfg.renderFn] === 'function') window[cfg.renderFn]();
  _rafraichirBarreSelection();
}

function estEnSelection(type) {
  return STATE.selectionMode === type;
}

function toggleSelectionItem(id) {
  id = String(id);
  const i = STATE.selectionIds.indexOf(id);
  if (i > -1) STATE.selectionIds.splice(i, 1);
  else STATE.selectionIds.push(id);
  _rafraichirBarreSelection();
  const cfg = _SELECTION_CONFIG[STATE.selectionMode];
  if (cfg) {
    const cb = document.getElementById('sel-cb-' + STATE.selectionMode + '-' + id);
    if (cb) cb.checked = STATE.selectionIds.includes(id);
  }
}

function _rafraichirBarreSelection() {
  let barre = document.getElementById('selection-action-bar');
  const cfg = _SELECTION_CONFIG[STATE.selectionMode];
  if (!STATE.selectionMode || !cfg) {
    if (barre) barre.remove();
    return;
  }
  if (!barre) {
    barre = document.createElement('div');
    barre.id = 'selection-action-bar';
    barre.style.cssText = 'position:fixed;left:0;right:0;bottom:0;background:#0F1F1A;padding:12px 16px;display:flex;gap:8px;align-items:center;z-index:9998;box-shadow:0 -4px 20px rgba(0,0,0,0.2)';
    document.body.appendChild(barre);
  }
  const n = STATE.selectionIds.length;
  barre.innerHTML =
    '<span style="color:#fff;font-size:12px;font-weight:600;flex-shrink:0">' + n + ' sélectionné(s)</span>' +
    '<button onclick="supprimerSelection()" style="flex:1;padding:9px;background:#B23A2E;color:#fff;border:none;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer;font-family:inherit" ' + (n?'':'disabled') + '>🗑️ Supprimer</button>' +
    '<button onclick="toggleSelectionMode(\'' + STATE.selectionMode + '\')" style="padding:9px 12px;background:#EAE4DA;color:#5B6B64;border:none;border-radius:8px;font-size:12px;cursor:pointer;font-family:inherit">✕</button>';
}

async function supprimerSelection() {
  const cfg = _SELECTION_CONFIG[STATE.selectionMode];
  if (!cfg || !STATE.selectionIds.length) return;
  let ids = STATE.selectionIds.slice();
  let refusees = 0;
  // Une facture émise ne se supprime pas (conservation légale) : seuls les brouillons partent.
  if (STATE.selectionMode === 'factures') {
    const ok = ids.filter(function(id) {
      const f = (STATE.factures || []).find(function(x) { return String(x.id) === String(id); });
      return !f || f.statut === 'brouillon';
    });
    refusees = ids.length - ok.length;
    ids = ok;
    if (!ids.length) {
      showToast('Une facture émise ne peut pas être supprimée (conservation légale). Annulez-la ou créez un avoir.', 'error');
      return;
    }
  }
  const n = ids.length;
  if (!confirm('Supprimer ' + n + ' ' + (n>1?cfg.labelPl:cfg.labelUn) + ' ? Cette action est irréversible.' + (refusees ? '\n\n' + refusees + ' facture(s) émise(s) seront conservées (suppression interdite).' : ''))) return;

  showToast('⏳ Suppression...');
  let reussies = 0, derniereErreur = '';
  for (const id of ids) {
    try {
      const res = await sb.del(cfg.table, 'id=eq.' + id + '&user_id=eq.' + (STATE.entrepriseId || sb.user.id));
      if (Array.isArray(res) && res.length === 0) { derniereErreur = 'La base a refusé la suppression.'; continue; }
      STATE[cfg.stateKey] = (STATE[cfg.stateKey] || []).filter(function(x) { return String(x.id) !== String(id); });
      reussies++;
    } catch(e) { derniereErreur = e.message || 'Erreur'; console.warn('Suppression échouée pour', id, e); }
  }
  const echecs = ids.length - reussies;
  if (reussies) showToast('✅ ' + reussies + ' ' + (reussies>1?cfg.labelPl:cfg.labelUn) + ' supprimé(s)' + (echecs ? ' — ' + echecs + ' non supprimé(s)' : ''), 'success');
  if (echecs || refusees) showToast((echecs ? 'Non supprimé : ' + derniereErreur : '') + (refusees ? ' ' + refusees + ' facture(s) émise(s) conservée(s).' : ''), 'error');
  toggleSelectionMode(STATE.selectionMode); // sort du mode sélection et rafraîchit
}

// Génère la case à cocher HTML pour une carte de liste, à insérer dans le
// template de chaque écran concerné.
function checkboxSelection(type, id) {
  if (!estEnSelection(type)) return '';
  const coche = STATE.selectionIds.includes(String(id));
  return '<input type="checkbox" id="sel-cb-' + type + '-' + id + '" ' + (coche?'checked':'') + ' onclick="event.stopPropagation();toggleSelectionItem(\'' + id + '\')" style="width:20px;height:20px;margin-right:10px;flex-shrink:0">';
}
