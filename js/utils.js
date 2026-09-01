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
function applyDarkMode() {
  document.body.classList.toggle('dark', STATE.darkMode);
}
function toggleDarkMode() {
  STATE.darkMode = !STATE.darkMode;
  localStorage.setItem('bp_dark', STATE.darkMode ? '1' : '0');
  applyDarkMode();
  showToast(STATE.darkMode ? '🌙 Mode sombre activé' : '☀️ Mode clair activé');
}
function togglePwd(inputId, btnId) {
  const inp = el(inputId);
  const btn = el(btnId);
  if (!inp) return;
  // FIX (demande utilisateur) : le singe 🙈 remplacé par un simple œil
  // barré. Un vrai emoji "œil barré" n'est pas fiable d'un appareil à
  // l'autre (rendu très inégal iOS/Android/Windows) — on garde donc le
  // même œil 👁️ et on le barre avec une simple ligne de texte (CSS),
  // fiable partout, sans rien ajouter au DOM.
  if (inp.type === 'password') {
    inp.type = 'text';
    if (btn) { btn.textContent = '👁️'; btn.style.textDecoration = 'line-through'; }
  } else {
    inp.type = 'password';
    if (btn) { btn.textContent = '👁️'; btn.style.textDecoration = 'none'; }
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
async function logAudit(typeDoc, docId, action, details) {
  try {
    const uid = sb.user?.id;
    if (!uid) return;
    // FIX (retour utilisateur) : distingue désormais l'ENTREPRISE
    // concernée (pour que son propriétaire voie toute l'activité, même
    // celle de son équipe) de l'ACTEUR réel (qui a vraiment fait
    // l'action) — auparavant les deux étaient confondus dans "user_id".
    await sb.post('audit_log', {
      user_id: uid,
      entreprise_id: (STATE.entrepriseId || uid),
      acteur_email: sb.user?.email || null,
      type_doc: typeDoc,
      doc_id: docId != null ? String(docId) : null,
      action: action,
      details: details || ''
    });
  } catch(e) {
    console.warn('logAudit:', e);
  }
}
// NOUVEAU (retour utilisateur) : "Historique" — trace toutes les
// opérations, filtrable par type, par acteur (qui a fait quoi dans
// l'équipe), et par date. Interroge désormais par entreprise_id, pas
// par user_id seul — voir le correctif dans logAudit() ci-dessus.
STATE._historiqueData = STATE._historiqueData || [];
STATE.historiqueFiltreActeur = STATE.historiqueFiltreActeur || '';
STATE.historiqueFiltreType = STATE.historiqueFiltreType || '';

async function renderJournalAudit() {
  const list = el('audit-list');
  if (!list) return;
  list.innerHTML = '<div style="text-align:center;padding:30px;color:#9C9186">⏳ Chargement...</div>';
  try {
    const entrepriseId = STATE.entrepriseId || sb.user?.id;
    const logs = await sb.get('audit_log', 'entreprise_id=eq.' + entrepriseId + '&order=created_at.desc&limit=500');
    STATE._historiqueData = logs || [];
    remplirFiltreActeurs();
    appliquerFiltresHistorique();
  } catch(e) {
    list.innerHTML = '<div style="text-align:center;padding:30px;color:#B23A2E">Erreur de chargement</div>';
  }
}

// Construit la liste des acteurs distincts déjà présents dans
// l'historique chargé, pour remplir le filtre "Qui" dynamiquement.
function remplirFiltreActeurs() {
  const select = el('historique-filtre-acteur');
  if (!select) return;
  const acteurs = Array.from(new Set((STATE._historiqueData || []).map(function(l) { return l.acteur_email; }).filter(Boolean))).sort();
  select.innerHTML = '<option value="">Tous les membres</option>' + acteurs.map(function(a) {
    return '<option value="' + escapeHTML(a) + '">' + escapeHTML(a) + '</option>';
  }).join('');
}

function appliquerFiltresHistorique() {
  const list = el('audit-list');
  if (!list) return;
  let logs = STATE._historiqueData || [];

  const acteur = el('historique-filtre-acteur')?.value || '';
  const type = el('historique-filtre-type')?.value || '';
  const dateDebut = el('historique-date-debut')?.value || '';
  const dateFin = el('historique-date-fin')?.value || '';

  if (acteur) logs = logs.filter(function(l) { return l.acteur_email === acteur; });
  if (type) logs = logs.filter(function(l) { return l.type_doc === type; });
  if (dateDebut) logs = logs.filter(function(l) { return new Date(l.created_at) >= new Date(dateDebut); });
  if (dateFin) logs = logs.filter(function(l) { return new Date(l.created_at) <= new Date(dateFin + 'T23:59:59'); });

  if (!logs.length) {
    list.innerHTML = '<div class="empty"><div class="empty-ico">📋</div><div class="empty-title">Aucune activité trouvée</div></div>';
    return;
  }
  const actionIcons = { creation:'✨', modification:'✏️', suppression:'🗑️', acceptation:'✅', refus:'❌', paiement:'💰', renouvellement:'🔄' };
  const actionLabels = { creation:'Création', modification:'Modification', suppression:'Suppression', acceptation:'Acceptation', refus:'Refus', paiement:'Paiement', renouvellement:'Renouvellement' };
  const typeLabels = { facture:'Facture', devis:'Devis', client:'Client', produit:'Article', achat:'Achat', abonnement:'Abonnement', equipe:'Équipe', annonce:'Annonce marché' };
  list.innerHTML = logs.map(function(l) {
    return '<div style="display:flex;gap:12px;padding:12px 0;border-bottom:1px solid #EAE4DA;align-items:flex-start">' +
      '<div style="width:32px;height:32px;border-radius:8px;background:#F1EEE8;display:flex;align-items:center;justify-content:center;font-size:15px;flex-shrink:0">' + (actionIcons[l.action] || '📌') + '</div>' +
      '<div style="flex:1">' +
        '<div style="font-size:13px;font-weight:600">' + (typeLabels[l.type_doc] || l.type_doc) + ' — ' + (actionLabels[l.action] || l.action) + '</div>' +
        (l.details ? '<div style="font-size:12px;color:#6B5F54;margin-top:2px">' + escapeHTML(l.details) + '</div>' : '') +
        '<div style="font-size:11px;color:#9C9186;margin-top:3px">' + formatDateTime(l.created_at) + (l.acteur_email ? ' · ' + escapeHTML(l.acteur_email) : '') + '</div>' +
      '</div>' +
    '</div>';
  }).join('');
}

function reinitialiserFiltresHistorique() {
  if (el('historique-filtre-acteur')) el('historique-filtre-acteur').value = '';
  if (el('historique-filtre-type')) el('historique-filtre-type').value = '';
  if (el('historique-date-debut')) el('historique-date-debut').value = '';
  if (el('historique-date-fin')) el('historique-date-fin').value = '';
  appliquerFiltresHistorique();
}

function exporterHistoriqueCSV() {
  const logs = STATE._historiqueData || [];
  if (!logs.length) { showToast('Rien à exporter', 'error'); return; }
  const headers = ['Date', 'Type', 'Action', 'Détails', 'Acteur'];
  const rows = logs.map(function(l) {
    return [formatDateTime(l.created_at), l.type_doc || '', l.action || '', l.details || '', l.acteur_email || ''];
  });
  telechargerCSV('zelto_historique_' + new Date().toISOString().split('T')[0] + '.csv', headers, rows);
  showToast('✅ Export téléchargé', 'success');
}
function parseCSV(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
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
      else if (c === '\r') { }
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
function telechargerFichierBase64(dataUrl, nomSouhaite) {
  try {
    const a = document.createElement('a');
    a.href = dataUrl;
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
function changerLangueInterface() {
  const langue = el('param-langue')?.value || 'fr';
  localStorage.setItem('bp_langue', langue);
  appliquerLangueInterface();
}
function appliquerLangueInterface() {
  const langue = localStorage.getItem('bp_langue') || 'fr';
  document.documentElement.setAttribute('dir', langue === 'ar' ? 'rtl' : 'ltr');
  document.documentElement.setAttribute('lang', langue);
  const select = el('param-langue');
  if (select) select.value = langue;
}
appliquerLangueInterface();
