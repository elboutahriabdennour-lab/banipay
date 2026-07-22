// BANIPAY — utils.js

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
      payee:    { bg:'#ECFDF5', color:'#059669', label:'Payée' },
      envoyee:  { bg:'#FFFBEB', color:'#D97706', label:'Envoyée' },
      attente:  { bg:'#FFFBEB', color:'#D97706', label:'En attente' },
      retard:   { bg:'#FEF2F2', color:'#EF4444', label:'En retard' },
      brouillon:{ bg:'#F1F5F9', color:'#64748B', label:'Brouillon' },
    },
    devis: {
      envoye:   { bg:'#FFFBEB', color:'#D97706', label:'Envoyé' },
      accepte:  { bg:'#ECFDF5', color:'#059669', label:'Accepté' },
      refuse:   { bg:'#FEF2F2', color:'#EF4444', label:'Refusé' },
      converti: { bg:'#EFF6FF', color:'#2563EB', label:'→ Facture' },
      expire:   { bg:'#F1F5F9', color:'#64748B', label:'Expiré' },
    }
  };
  const cfg = config[type]?.[statut] || { bg:'#F1F5F9', color:'#64748B', label: statut };
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
  list.innerHTML = '<div style="text-align:center;padding:30px;color:#94A3B8">⏳ Chargement...</div>';
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
      return '<div style="display:flex;gap:12px;padding:12px 0;border-bottom:1px solid #F1F5F9;align-items:flex-start">' +
        '<div style="width:32px;height:32px;border-radius:8px;background:#F8FAFC;display:flex;align-items:center;justify-content:center;font-size:15px;flex-shrink:0">' + (actionIcons[l.action] || '📌') + '</div>' +
        '<div style="flex:1">' +
          '<div style="font-size:13px;font-weight:600">' + (typeLabels[l.type_doc] || l.type_doc) + ' — ' + (actionLabels[l.action] || l.action) + '</div>' +
          (l.details ? '<div style="font-size:12px;color:#64748B;margin-top:2px">' + escapeHTML(l.details) + '</div>' : '') +
          '<div style="font-size:11px;color:#94A3B8;margin-top:3px">' + formatDateTime(l.created_at) + '</div>' +
        '</div>' +
      '</div>';
    }).join('');
  } catch(e) {
    list.innerHTML = '<div style="text-align:center;padding:30px;color:#EF4444">Erreur de chargement</div>';
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
// BROUILLONS
// ============================================================
