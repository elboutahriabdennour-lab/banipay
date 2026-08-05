// ZELTO — utils.js

function fmt(n) { return Number(n || 0).toLocaleString('fr-MA', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

function fmtInt(n) { return Math.round(n || 0).toLocaleString('fr-MA'); }

function today() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().split('T')[0];
}

function uid6() { return Math.random().toString(36).substr(2, 6).toUpperCase(); }

function getRef(prefix, list) {
  const year = new Date().getFullYear();
  const n = String((list?.length || 0) + 1).padStart(4, '0');
  const custom = STATE.profil?.numerotation;
  if (custom) return custom.replace('{PREFIX}', prefix).replace('{YEAR}', year).replace('{NUM}', n);
  return `${prefix}-${year}-${n}`;
}


// CORRECTIF ANNULÉ : j'avais ajouté "let _toastTimer" ici en pensant
// qu'elle n'était déclarée nulle part — en réalité config.js la déclare
// déjà ("let _toastTimer;") tout en bas du fichier. Deux "let" du même nom
// au niveau racine entre deux scripts classiques provoquent une ERREUR DE
// SYNTAXE qui empêche tout ce fichier (utils.js) de s'exécuter — donc
// showToast, fmt, el, et toutes les autres fonctions utilitaires
// utilisées PARTOUT dans l'app. C'est cette régression, introduite par ma
// propre correction précédente, qui a cassé les boutons.

function showToast(msg, type) {
  if (!type) type = 'default';
  const t = document.getElementById('toast');
  if (!t) return;
  clearTimeout(_toastTimer);
  t.classList.remove('show');
  void t.offsetWidth;
  t.textContent = msg;
  t.className = 'toast show toast-' + type;
  const duration = msg.startsWith('⏳') ? 4000 : 2500;
  _toastTimer = setTimeout(function() {
    t.classList.remove('show');
    setTimeout(function() { t.className = 'toast'; t.textContent = ''; }, 400);
  }, duration);

  // FIX: garde-fou absolu — si showToast() est rappelée rapidement plusieurs
  // fois de suite (ex: boucle d'envoi, plusieurs opérations qui se
  // terminent presque en même temps), chaque appel annule le minuteur
  // précédent et en relance un nouveau : le message peut donner
  // l'impression de ne jamais disparaître tant que les appels s'enchaînent.
  // Ce second minuteur, lui, n'est JAMAIS annulé — il force la disparition
  // 8 secondes après le PREMIER message de la rafale, quoi qu'il arrive.
  if (!window._toastDeadline) {
    window._toastDeadline = setTimeout(function() {
      const tt = document.getElementById('toast');
      if (tt) { tt.classList.remove('show'); setTimeout(function() { tt.className = 'toast'; tt.textContent = ''; }, 400); }
      window._toastDeadline = null;
    }, 8000);
  }
}


function hideToast() {
  const t = document.getElementById('toast');
  if (!t) return;
  clearTimeout(_toastTimer);
  t.classList.remove('show');
  setTimeout(() => { t.className = 'toast'; }, 350);
}

function escapeHTML(str) {
  if (typeof str !== 'string') return str || '';
  return str.replace(/[&<>'"]/g, tag => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[tag]));
}

function el(id) { return document.getElementById(id); }

function setEl(id, v, prop = 'textContent') { const e = el(id); if (e) e[prop] = v; }

function closeAllModals() {
  document.querySelectorAll('.modal-overlay').forEach(m => m.classList.remove('active'));
}

// Dark mode

function applyDarkMode() {
  document.body.classList.toggle('dark', STATE.darkMode);
}

// ============================================================
// LOAD ALL DATA
// ============================================================

function toggleDarkMode() {
  STATE.darkMode = !STATE.darkMode;
  localStorage.setItem('bp_dark', STATE.darkMode ? '1' : '0');
  applyDarkMode();
  showToast(STATE.darkMode ? '🌙 Mode sombre activé' : '☀️ Mode clair activé');
}

// ============================================================
// NOTIFICATIONS SCREEN
// ============================================================

function togglePwd(inputId, btnId) {
  const inp = el(inputId);
  const btn = el(btnId);
  if (!inp) return;
  if (inp.type === 'password') {
    inp.type = 'text';
    if (btn) btn.textContent = '🙈';
  } else {
    inp.type = 'password';
    if (btn) btn.textContent = '👁️';
  }
}

function toggleRememberMe() {
  const checked = el('remember-me')?.checked;
  if (checked) {
    const email = el('login-email')?.value;
    if (email) localStorage.setItem('bp_saved_email', email);
  } else {
    localStorage.removeItem('bp_saved_email');
    localStorage.removeItem('bp_saved_pwd');
  }
}

function loadSavedCredentials() {
  const savedEmail = localStorage.getItem('bp_saved_email');
  if (savedEmail) {
    if (el('login-email')) el('login-email').value = savedEmail;
    if (el('remember-me')) el('remember-me').checked = true;
  }
}

function formatDate(d) {
  if (!d) return '—';
  const date = new Date(d);
  return date.toLocaleDateString('fr-MA', { day:'2-digit', month:'2-digit', year:'numeric' });
}

function formatDateTime(d) {
  if (!d) return '—';
  const date = new Date(d);
  return date.toLocaleDateString('fr-MA') + ' ' + date.toLocaleTimeString('fr-MA', { hour:'2-digit', minute:'2-digit' });
}

function isValidEmail(e) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e); }

function isValidPhone(p) { return /^[\+\d\s\-]{8,15}$/.test(p); }

function isValidICE(v) { return /^\d{15}$/.test(v); }

function getStatusBadge(type, statut) {
  const config = {
    facture: {
      payee:    { bg:'#EEF3E4', color:'#6E8F4E', label:'Payée' },
      envoyee:  { bg:'#F7EFDC', color:'#B8860B', label:'Envoyée' },
      attente:  { bg:'#F7EFDC', color:'#B8860B', label:'En attente' },
      retard:   { bg:'#F5E4E1', color:'#B23A2E', label:'En retard' },
      brouillon:{ bg:'#EAE4DA', color:'#6B5F54', label:'Brouillon' },
    },
    devis: {
      envoye:   { bg:'#F7EFDC', color:'#B8860B', label:'Envoyé' },
      accepte:  { bg:'#EEF3E4', color:'#6E8F4E', label:'Accepté' },
      refuse:   { bg:'#F5E4E1', color:'#B23A2E', label:'Refusé' },
      converti: { bg:'#E9F4F3', color:'#C9971F', label:'→ Facture' },
      expire:   { bg:'#EAE4DA', color:'#6B5F54', label:'Expiré' },
    }
  };
  const cfg = config[type]?.[statut] || { bg:'#EAE4DA', color:'#6B5F54', label: statut };
  return `<span style="display:inline-block;padding:2px 8px;border-radius:8px;font-size:10px;font-weight:600;text-transform:uppercase;background:${cfg.bg};color:${cfg.color}">${cfg.label}</span>`;
}

function isOverdue(facture) {
  if (facture.statut === 'payee') return false;
  if (!facture.echeance) return false;
  return new Date(facture.echeance) < new Date();
}

function getDaysLate(facture) {
  if (!facture.echeance || !isOverdue(facture)) return 0;
  const diff = new Date() - new Date(facture.echeance);
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

function calculateDueDate(dateEmission, delaiJours) {
  const d = new Date(dateEmission || today());
  d.setDate(d.getDate() + (delaiJours || 30));
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().split('T')[0];
}

function validateInvoice(data) {
  const errors = [];
  if (!data.client?.trim()) errors.push('Le nom du client est obligatoire');
  if (!data.lignes?.length) errors.push('Ajoutez au moins une prestation');
  if (!data.date_emission) errors.push('La date est obligatoire');
  return errors;
}

function validateClient(data) {
  const errors = [];
  if (!data.nom?.trim()) errors.push('Le nom est obligatoire');
  if (data.email && !isValidEmail(data.email)) errors.push('Email invalide');
  if (data.tel && !isValidPhone(data.tel)) errors.push('Téléphone invalide');
  return errors;
}

function validateProduct(data) {
  const errors = [];
  if (!data.nom?.trim()) errors.push('Le nom est obligatoire');
  if (!data.prix_ht || Number(data.prix_ht) < 0) errors.push('Le prix doit être positif');
  return errors;
}

// ============================================================
// JOURNAL D'AUDIT — traçabilité des actions clés
// ============================================================

// Enregistre une action dans le journal d'audit (best-effort, ne bloque jamais l'UI)
async function logAudit(typeDoc, docId, action, details) {
  try {
    const uid = sb.user?.id;
    if (!uid) return;
    await sb.post('audit_log', {
      user_id: uid,
      type_doc: typeDoc,
      doc_id: docId != null ? String(docId) : null,
      action: action,
      details: details || ''
    });
  } catch(e) {
    // Silencieux : le journal ne doit jamais bloquer l'action métier
    console.warn('logAudit:', e);
  }
}

async function renderJournalAudit() {
  const list = el('audit-list');
  if (!list) return;
  list.innerHTML = '<div style="text-align:center;padding:30px;color:#9C9186">⏳ Chargement...</div>';
  try {
    const uid = sb.user?.id;
    const logs = await sb.get('audit_log', 'user_id=eq.' + uid + '&order=created_at.desc&limit=100');
    if (!logs || !logs.length) {
      list.innerHTML = '<div class="empty"><div class="empty-ico">📋</div><div class="empty-title">Aucune activité enregistrée</div></div>';
      return;
    }
    const actionIcons = { creation:'✨', modification:'✏️', suppression:'🗑️', acceptation:'✅', refus:'❌', paiement:'💰' };
    const actionLabels = { creation:'Création', modification:'Modification', suppression:'Suppression', acceptation:'Acceptation', refus:'Refus', paiement:'Paiement' };
    const typeLabels = { facture:'Facture', devis:'Devis', client:'Client', produit:'Article' };
    list.innerHTML = logs.map(function(l) {
      return '<div style="display:flex;gap:12px;padding:12px 0;border-bottom:1px solid #EAE4DA;align-items:flex-start">' +
        '<div style="width:32px;height:32px;border-radius:8px;background:#F1EEE8;display:flex;align-items:center;justify-content:center;font-size:15px;flex-shrink:0">' + (actionIcons[l.action] || '📌') + '</div>' +
        '<div style="flex:1">' +
          '<div style="font-size:13px;font-weight:600">' + (typeLabels[l.type_doc] || l.type_doc) + ' — ' + (actionLabels[l.action] || l.action) + '</div>' +
          (l.details ? '<div style="font-size:12px;color:#6B5F54;margin-top:2px">' + escapeHTML(l.details) + '</div>' : '') +
          '<div style="font-size:11px;color:#9C9186;margin-top:3px">' + formatDateTime(l.created_at) + '</div>' +
        '</div>' +
      '</div>';
    }).join('');
  } catch(e) {
    list.innerHTML = '<div style="text-align:center;padding:30px;color:#B23A2E">Erreur de chargement</div>';
  }
}

// ============================================================
// EXPORT / IMPORT CSV GÉNÉRIQUE
// ============================================================

// Parseur CSV minimal mais robuste : gère les guillemets et les virgules dans les champs
function parseCSV(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  // Retirer le BOM UTF-8 éventuel
  if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    const next = text[i + 1];
    if (inQuotes) {
      if (c === '"' && next === '"') { field += '"'; i++; }
      else if (c === '"') { inQuotes = false; }
      else { field += c; }
    } else {
      if (c === '"') { inQuotes = true; }
      else if (c === ',' || c === ';') { row.push(field); field = ''; }
      else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
      else if (c === '\r') { /* ignore */ }
      else { field += c; }
    }
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }

  if (!rows.length) return [];
  const headers = rows[0].map(function(h) { return h.trim().toLowerCase(); });
  return rows.slice(1).filter(function(r) { return r.some(function(v) { return v.trim() !== ''; }); }).map(function(r) {
    const obj = {};
    headers.forEach(function(h, idx) { obj[h] = (r[idx] || '').trim(); });
    return obj;
  });
}

function telechargerCSV(nomFichier, headers, rows) {
  const csv = [headers].concat(rows).map(function(r) {
    return r.map(function(v) { return '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"'; }).join(',');
  }).join('\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nomFichier;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(function() { URL.revokeObjectURL(url); }, 3000);
}

function lireFichierTexte(file) {
  return new Promise(function(resolve, reject) {
    const reader = new FileReader();
    reader.onload = function(e) { resolve(e.target.result); };
    reader.onerror = reject;
    reader.readAsText(file, 'UTF-8');
  });
}

// ============================================================
// PANNEAU DE DIAGNOSTIC VISIBLE (générique, réutilisable partout)
// ============================================================
// Affiche un panneau persistant et copiable à l'écran — pas besoin d'ouvrir
// la console F12. Utilisé chaque fois qu'une opération réseau échoue de
// façon peu claire (RLS, RPC manquante, etc.).
function afficherDiagnostic(titre, lignes) {
  document.getElementById('diag-overlay')?.remove();
  const overlay = document.createElement('div');
  overlay.id = 'diag-overlay';
  overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;z-index:999999;background:rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;padding:20px';
  overlay.innerHTML =
    '<div style="background:#fff;border-radius:16px;padding:20px;max-width:500px;width:100%;max-height:80vh;overflow-y:auto;font-family:monospace">' +
      '<div style="font-size:15px;font-weight:700;color:#2A2420;margin-bottom:4px;font-family:\'Baloo 2\',sans-serif">🔍 ' + escapeHTML(titre) + '</div>' +
      '<div style="font-size:11px;color:#9C9186;margin-bottom:14px">Copie-colle ce texte si tu demandes de l\'aide</div>' +
      '<div style="background:#F1EEE8;border-radius:10px;padding:12px;font-size:12px;line-height:1.7;color:#2A2420;white-space:pre-wrap">' +
        lignes.map(function(l) { return escapeHTML(l); }).join('\n') +
      '</div>' +
      '<button onclick="document.getElementById(\'diag-overlay\').remove()" style="width:100%;margin-top:14px;padding:12px;background:#241F1B;color:#fff;border:none;border-radius:10px;font-size:13px;font-weight:600;cursor:pointer;font-family:\'Karla\',sans-serif">Fermer</button>' +
    '</div>';
  document.body.appendChild(overlay);
}

// Télécharge un fichier stocké en base64 (data URL) — utilisé pour les
// relevés bancaires, pièces jointes d'achats, etc.
function telechargerFichierBase64(dataUrl, nomSouhaite) {
  try {
    const a = document.createElement('a');
    a.href = dataUrl;
    // Déduire une extension raisonnable si le nom n'en a pas déjà une
    let nom = nomSouhaite || 'fichier';
    if (!/\.[a-zA-Z0-9]+$/.test(nom)) {
      const m = dataUrl.match(/^data:([^;]+);/);
      const mime = m ? m[1] : '';
      const ext = mime.includes('pdf') ? '.pdf' : mime.includes('png') ? '.png' : mime.includes('jpeg') ? '.jpg' : '';
      nom += ext;
    }
    a.download = nom;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    showToast('✅ Téléchargement lancé', 'success');
  } catch(e) {
    showToast('Erreur téléchargement: ' + e.message, 'error');
  }
}
