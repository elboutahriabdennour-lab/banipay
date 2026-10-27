// ZELTO — fournisseurs.js
// Rubrique Fournisseurs : liste, fiche, ajout / modification / suppression.
// Table Supabase : public.fournisseurs (voir fournisseurs.sql).

STATE.fournisseurs = STATE.fournisseurs || [];
STATE.fournisseurEnCoursId = null;

function _fournisseurUid() { return STATE.entrepriseId || (sb.user && sb.user.id); }

async function loadFournisseurs() {
  try {
    const uid = _fournisseurUid();
    if (!uid) return;
    const r = await sb.get('fournisseurs', 'user_id=eq.' + uid + '&order=nom.asc');
    STATE.fournisseurs = Array.isArray(r) ? r : [];
  } catch (e) {
    STATE.fournisseurs = [];
    console.warn('loadFournisseurs:', e);
  }
  if (typeof renderFournisseurs === 'function') renderFournisseurs();
}

function renderFournisseurs() {
  const list = el('fournisseurs-list');
  if (!list) return;
  const q = (el('search-fournisseur-inp')?.value || '').toLowerCase();
  const tous = STATE.fournisseurs || [];
  const filtres = q ? tous.filter(function (f) {
    return (f.nom || '').toLowerCase().includes(q) || (f.tel || '').includes(q) ||
           (f.email || '').toLowerCase().includes(q) || (f.ville || '').toLowerCase().includes(q);
  }) : tous;
  if (el('fournisseurs-count')) el('fournisseurs-count').textContent = q ? (filtres.length + ' sur ' + tous.length) : tous.length;

  if (!filtres.length) {
    list.innerHTML = q
      ? '<div class="empty"><div class="empty-ico">🔍</div><div class="empty-title">Aucun résultat pour "' + escapeHTML(q) + '"</div></div>'
      : '<div class="empty"><div class="empty-ico">🏭</div><div class="empty-title">Aucun fournisseur</div>' +
        '<div style="margin-top:8px"><span onclick="ouvrirNouveauFournisseur()" style="color:#B23A2E;font-weight:600;cursor:pointer;font-size:13px">+ Ajouter mon premier fournisseur</span></div></div>';
    return;
  }
  list.innerHTML = filtres.map(function (f) {
    const total = (STATE.achats || []).filter(function (a) { return a.fournisseur === f.nom; })
      .reduce(function (s, a) { return s + Number(a.ttc || 0); }, 0);
    const nb = (STATE.achats || []).filter(function (a) { return a.fournisseur === f.nom; }).length;
    return '<div class="card" onclick="ouvrirFicheFournisseur(' + valeurPourOnclick(f.id) + ')">' +
      '<div class="card-ico" style="background:#F5E4E1;font-weight:700;color:#B23A2E;font-size:18px">' + escapeHTML((f.nom || '?').charAt(0).toUpperCase()) + '</div>' +
      '<div class="card-body"><div class="card-name">' + escapeHTML(f.nom || '') + (f.zelto_id ? ' <span style="font-size:9px;background:#E9F4F3;color:#1F6F72;padding:2px 6px;border-radius:6px;font-weight:700">Zelto</span>' : '') + '</div>' +
      '<div class="card-ref">' + escapeHTML([f.ville, f.tel, f.email].filter(Boolean).join(' · ')) + '</div></div>' +
      '<div class="card-end"><div style="font-size:12px;color:#B23A2E;font-weight:600">' + (typeof fmtInt === 'function' ? fmtInt(total) : Math.round(total)) + ' MAD</div>' +
      '<div style="font-size:10px;color:#9C9186">' + nb + ' achat' + (nb > 1 ? 's' : '') + '</div></div></div>';
  }).join('');
}

// ───────── Formulaire (ajout + modification) ─────────
const _CHAMPS_FOURNISSEUR = ['nom', 'tel', 'email', 'ville', 'adresse', 'ice', 'identifiant_fiscal', 'conditions_paiement', 'notes'];
const _IDS_FOURNISSEUR = { nom: 'fo-nom', tel: 'fo-tel', email: 'fo-email', ville: 'fo-ville', adresse: 'fo-adresse', ice: 'fo-ice', identifiant_fiscal: 'fo-if', conditions_paiement: 'fo-conditions', notes: 'fo-notes' };

function ouvrirNouveauFournisseur() {
  STATE.fournisseurEnCoursId = null;
  _CHAMPS_FOURNISSEUR.forEach(function (c) { if (el(_IDS_FOURNISSEUR[c])) el(_IDS_FOURNISSEUR[c]).value = ''; });
  if (el('fo-form-titre')) el('fo-form-titre').textContent = 'Nouveau fournisseur';
  goScreen('fournisseur-form', null);
}

function ouvrirModifFournisseur(id) {
  const f = (STATE.fournisseurs || []).find(function (x) { return String(x.id) === String(id); });
  if (!f) return;
  STATE.fournisseurEnCoursId = f.id;
  _CHAMPS_FOURNISSEUR.forEach(function (c) { if (el(_IDS_FOURNISSEUR[c])) el(_IDS_FOURNISSEUR[c]).value = f[c] || ''; });
  if (el('fo-form-titre')) el('fo-form-titre').textContent = 'Modifier le fournisseur';
  goScreen('fournisseur-form', null);
}

async function sauvegarderFournisseur() {
  if (typeof verifierConnexionRequise === 'function' && !verifierConnexionRequise()) return;
  const nom = (el('fo-nom')?.value || '').trim();
  if (!nom) { showToast('Entrez le nom du fournisseur', 'error'); return; }
  const tel = (el('fo-tel')?.value || '').trim();
  const email = (el('fo-email')?.value || '').trim();
  if (email && !isValidEmail(email)) { showToast('Email invalide', 'error'); return; }
  if (tel && !isValidPhone(tel)) { showToast('Numéro de téléphone invalide', 'error'); return; }
  const doublon = (STATE.fournisseurs || []).find(function (f) {
    return (f.nom || '').trim().toLowerCase() === nom.toLowerCase() && String(f.id) !== String(STATE.fournisseurEnCoursId);
  });
  if (doublon) { showToast('Ce fournisseur existe déjà', 'error'); return; }

  const data = {};
  _CHAMPS_FOURNISSEUR.forEach(function (c) { data[c] = (el(_IDS_FOURNISSEUR[c])?.value || '').trim() || null; });
  data.nom = nom;
  showToast('⏳ Sauvegarde...');
  try {
    const uid = _fournisseurUid();
    if (STATE.fournisseurEnCoursId) {
      await sb.patch('fournisseurs', 'id=eq.' + STATE.fournisseurEnCoursId + '&user_id=eq.' + uid, data);
      const idx = STATE.fournisseurs.findIndex(function (x) { return String(x.id) === String(STATE.fournisseurEnCoursId); });
      if (idx >= 0) STATE.fournisseurs[idx] = Object.assign({}, STATE.fournisseurs[idx], data);
      showToast('✅ Fournisseur modifié', 'success');
    } else {
      const r = await sb.post('fournisseurs', Object.assign({ user_id: uid }, data));
      if (!r || !r.length) throw new Error('Erreur serveur (fournisseur non enregistré)');
      STATE.fournisseurs.push(r[0]);
      showToast('✅ Fournisseur ajouté', 'success');
    }
    STATE.fournisseurs.sort(function (a, b) { return (a.nom || '').localeCompare(b.nom || '', 'fr'); });
    setTimeout(function () { goScreen('fournisseurs', null); }, 600);
  } catch (e) { showToast('❌ ' + e.message, 'error'); }
}

async function supprimerFournisseur(id) {
  const f = (STATE.fournisseurs || []).find(function (x) { return String(x.id) === String(id); });
  if (!f) return;
  if (!confirm('Supprimer "' + f.nom + '" ? Ses achats déjà enregistrés sont conservés.')) return;
  try {
    await sb.del('fournisseurs', 'id=eq.' + id + '&user_id=eq.' + _fournisseurUid());
    STATE.fournisseurs = STATE.fournisseurs.filter(function (x) { return String(x.id) !== String(id); });
    showToast('🗑️ Fournisseur supprimé', 'success');
    goScreen('fournisseurs', null);
  } catch (e) { showToast('❌ ' + e.message, 'error'); }
}

// ───────── Fiche ─────────
function ouvrirFicheFournisseur(id) {
  const f = (STATE.fournisseurs || []).find(function (x) { return String(x.id) === String(id); });
  if (!f) return;
  STATE.fournisseurEnCoursId = f.id;
  if (el('fd-nom')) el('fd-nom').textContent = f.nom || '';
  if (el('fd-meta')) el('fd-meta').textContent = [f.ville, f.conditions_paiement].filter(Boolean).join(' · ');
  const lignes = [['📞 Téléphone', f.tel], ['✉️ Email', f.email], ['📍 Adresse', f.adresse], ['ICE', f.ice], ['IF', f.identifiant_fiscal], ['💳 Conditions de paiement', f.conditions_paiement], ['📝 Notes', f.notes]]
    .filter(function (l) { return l[1]; });
  if (el('fd-infos')) {
    el('fd-infos').innerHTML = lignes.length ? lignes.map(function (l) {
      return '<div style="display:flex;justify-content:space-between;gap:12px;padding:11px 14px;border-bottom:1px solid #EAE4DA;font-size:13px"><span style="color:#9C9186">' + l[0] + '</span><span style="font-weight:600;text-align:right;word-break:break-word">' + escapeHTML(l[1]) + '</span></div>';
    }).join('') : '<div style="padding:14px;color:#9C9186;font-size:13px">Aucune information complémentaire. Utilise « Modifier » pour en ajouter.</div>';
  }
  const achats = (STATE.achats || []).filter(function (a) { return a.fournisseur === f.nom; });
  const total = achats.reduce(function (s, a) { return s + Number(a.ttc || 0); }, 0);
  if (el('fd-stats')) el('fd-stats').textContent = achats.length + ' achat' + (achats.length > 1 ? 's' : '') + ' · ' + (typeof fmtInt === 'function' ? fmtInt(total) : Math.round(total)) + ' MAD TTC';
  const tel = (f.tel || '').replace(/[^\d+]/g, '');
  if (el('fd-btn-appel')) { el('fd-btn-appel').style.display = tel ? 'block' : 'none'; el('fd-btn-appel').onclick = function () { window.location.href = 'tel:' + tel; }; }
  if (el('fd-btn-whatsapp')) {
    el('fd-btn-whatsapp').style.display = tel ? 'block' : 'none';
    el('fd-btn-whatsapp').onclick = function () { window.open('https://wa.me/' + tel.replace(/^\+/, '').replace(/^0/, '212'), '_blank'); };
  }
  if (el('fd-btn-email')) { el('fd-btn-email').style.display = f.email ? 'block' : 'none'; el('fd-btn-email').onclick = function () { window.location.href = 'mailto:' + f.email; }; }
  goScreen('fournisseur-detail', null);
}

function demanderDevisAuFournisseurFiche() {
  const f = (STATE.fournisseurs || []).find(function (x) { return String(x.id) === String(STATE.fournisseurEnCoursId); });
  if (typeof ouvrirDemandeDevisFournisseur !== 'function') { showToast('Module demande de devis non disponible', 'error'); return; }
  ouvrirDemandeDevisFournisseur();
  if (f && el('ddf-fournisseur-nom')) el('ddf-fournisseur-nom').value = f.nom || '';
}

function nouvelAchatPourFournisseurFiche() {
  const f = (STATE.fournisseurs || []).find(function (x) { return String(x.id) === String(STATE.fournisseurEnCoursId); });
  STATE.lignesAchat = []; window._achatFactureLieeId = null; STATE._achatPJData = null; STATE._achatPJNom = null;
  const pv = el('achat-pj-preview'); if (pv) pv.innerHTML = '';
  goScreen('nouvelle-achat', null);
  if (f && typeof remplirFournisseur === 'function') remplirFournisseur(f.nom, f.zelto_id || '', !!f.zelto_id);
}

function modifierFournisseurFiche() { ouvrirModifFournisseur(STATE.fournisseurEnCoursId); }
function supprimerFournisseurFiche() { supprimerFournisseur(STATE.fournisseurEnCoursId); }

function exporterFournisseursCSV() {
  const headers = ['Nom', 'Téléphone', 'Email', 'Ville', 'Adresse', 'ICE', 'IF', 'Conditions paiement', 'Notes'];
  const rows = (STATE.fournisseurs || []).map(function (f) {
    return [f.nom, f.tel, f.email, f.ville, f.adresse, f.ice, f.identifiant_fiscal, f.conditions_paiement, f.notes].map(function (v) { return v || ''; });
  });
  if (typeof telechargerCSV === 'function') telechargerCSV('zelto_fournisseurs_' + today() + '.csv', headers, rows);
}
