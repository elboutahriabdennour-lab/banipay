// ============================================================
// BANIPAY — utils.js — Fonctions utilitaires (fmt, today, escapeHTML...)
// ============================================================

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

let _toastTimer;

function showToast(msg, type = 'default') {
  const t = document.getElementById('toast');
  if (!t) return;
  // Force reset before showing
  t.classList.remove('show');
  void t.offsetWidth; // reflow
  t.textContent = msg;
  t.className = '';
  t.classList.add('toast', 'show', 'toast-' + type);
  clearTimeout(_toastTimer);
  // Loading messages stay longer, others 3s
  const duration = msg.startsWith('⏳') ? 5000 : 2000;
  _toastTimer = setTimeout(() => {
    t.classList.remove('show');
    setTimeout(() => { t.className = 'toast'; }, 300);
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
// BROUILLONS
// ============================================================
