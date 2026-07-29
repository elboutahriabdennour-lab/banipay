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
    barre.style.cssText = 'position:fixed;left:0;right:0;bottom:0;background:#241F1B;padding:12px 16px;display:flex;gap:8px;align-items:center;z-index:9998;box-shadow:0 -4px 20px rgba(0,0,0,0.2)';
    document.body.appendChild(barre);
  }
  const n = STATE.selectionIds.length;
  barre.innerHTML =
    '<span style="color:#fff;font-size:12px;font-weight:600;flex-shrink:0">' + n + ' sélectionné(s)</span>' +
    '<button onclick="supprimerSelection()" style="flex:1;padding:9px;background:#B23A2E;color:#fff;border:none;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer;font-family:inherit" ' + (n?'':'disabled') + '>🗑️ Supprimer</button>' +
    '<button onclick="partagerSelection()" style="flex:1;padding:9px;background:#1F6F72;color:#fff;border:none;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer;font-family:inherit" ' + (n?'':'disabled') + '>📤 Partager</button>' +
    '<button onclick="envoyerSelectionGroupee()" style="flex:1;padding:9px;background:#6E8F4E;color:#fff;border:none;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer;font-family:inherit" ' + (n?'':'disabled') + '>✉️ Envoyer</button>' +
    '<button onclick="toggleSelectionMode(\'' + STATE.selectionMode + '\')" style="padding:9px 12px;background:#EAE4DA;color:#6B5F54;border:none;border-radius:8px;font-size:12px;cursor:pointer;font-family:inherit">✕</button>';
}

async function supprimerSelection() {
  const cfg = _SELECTION_CONFIG[STATE.selectionMode];
  if (!cfg || !STATE.selectionIds.length) return;
  const n = STATE.selectionIds.length;
  if (!confirm('Supprimer ' + n + ' ' + (n>1?cfg.labelPl:cfg.labelUn) + ' ? Cette action est irréversible.')) return;

  showToast('⏳ Suppression...');
  let reussies = 0;
  for (const id of STATE.selectionIds.slice()) {
    try {
      await sb.del(cfg.table, 'id=eq.' + id + '&user_id=eq.' + sb.user.id);
      STATE[cfg.stateKey] = (STATE[cfg.stateKey] || []).filter(function(x) { return x.id !== id; });
      reussies++;
    } catch(e) { console.warn('Suppression échouée pour', id, e); }
  }
  showToast('✅ ' + reussies + ' ' + (reussies>1?cfg.labelPl:cfg.labelUn) + ' supprimé(s)', 'success');
  toggleSelectionMode(STATE.selectionMode); // sort du mode sélection et rafraîchit
}

function partagerSelection() {
  const cfg = _SELECTION_CONFIG[STATE.selectionMode];
  if (!cfg || !STATE.selectionIds.length) return;
  const items = (STATE[cfg.stateKey] || []).filter(function(x) { return STATE.selectionIds.includes(x.id); });
  const base = window.location.origin + window.location.pathname;
  const paramType = STATE.selectionMode === 'bc' ? 'bc' : STATE.selectionMode === 'devis' ? 'doc' : 'doc';
  const lignes = items.map(function(it) {
    const lien = STATE.selectionMode === 'bc' ? base + '?bc=' + it.id : base + '?doc=' + it.id + (STATE.selectionMode === 'devis' ? '&type=devis' : '');
    return '• ' + (it.ref || '') + (it.client || it.fournisseur ? ' — ' + (it.client || it.fournisseur) : '') + '\n  ' + lien;
  });
  const texte = 'Voici ' + items.length + ' document(s) :\n\n' + lignes.join('\n\n');
  navigator.clipboard?.writeText(texte).then(function() {
    showToast('✅ Liste avec liens copiée — collez-la où vous voulez', 'success');
  });
}

async function envoyerSelectionGroupee() {
  const cfg = _SELECTION_CONFIG[STATE.selectionMode];
  if (!cfg || !STATE.selectionIds.length) return;
  // Envoie chaque élément sélectionné par WhatsApp, un message par élément
  // (WhatsApp ne permet pas un envoi groupé multi-destinataires en un clic).
  const ids = STATE.selectionIds.slice();
  for (const id of ids) {
    if (STATE.selectionMode === 'bc' && typeof ouvrirModalEnvoi === 'function') {
      ouvrirModalEnvoi('bon-commande', id);
      return; // ouvre le modal pour le premier — l'utilisateur répète pour les suivants
    } else if ((STATE.selectionMode === 'factures' || STATE.selectionMode === 'devis') && typeof ouvrirModalEnvoi === 'function') {
      ouvrirModalEnvoi(STATE.selectionMode === 'factures' ? 'facture' : 'devis', id);
      return;
    }
  }
  showToast('Envoi groupé non disponible pour ce type de document', 'error');
}

// Génère la case à cocher HTML pour une carte de liste, à insérer dans le
// template de chaque écran concerné.
function checkboxSelection(type, id) {
  if (!estEnSelection(type)) return '';
  const coche = STATE.selectionIds.includes(id);
  return '<input type="checkbox" id="sel-cb-' + type + '-' + id + '" ' + (coche?'checked':'') + ' onclick="event.stopPropagation();toggleSelectionItem(' + id + ')" style="width:20px;height:20px;margin-right:10px;flex-shrink:0">';
}
