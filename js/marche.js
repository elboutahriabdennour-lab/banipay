// ZELTO — marche.js — Offres et demandes de services entre entreprises
// ============================================================
STATE.marcheType = STATE.marcheType || '';
STATE._marcheData = STATE._marcheData || [];

async function loadMarche() {
  try {
    const r = await fetch(SUPABASE_URL + '/rest/v1/annonces_marche?statut=eq.active&order=created_at.desc&limit=100', {
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY }
    });
    STATE._marcheData = r.ok ? ((await r.json()) || []) : [];
  } catch(e) {
    STATE._marcheData = [];
  }
  renderMarche();
}

function filtrerMarcheType(type, btn) {
  STATE.marcheType = type;
  document.querySelectorAll('#screen-marche .ftab').forEach(function(b) { b.classList.remove('active'); });
  if (btn) btn.classList.add('active');
  renderMarche();
}

function renderMarche() {
  const list = el('marche-list');
  if (!list) return;
  const q = (el('marche-search')?.value || '').toLowerCase();
  let data = STATE._marcheData;
  if (STATE.marcheType) data = data.filter(function(a) { return a.type === STATE.marcheType; });
  if (q) data = data.filter(function(a) { return (a.titre||'').toLowerCase().includes(q) || (a.secteur||'').toLowerCase().includes(q) || (a.ville||'').toLowerCase().includes(q); });

  if (!data.length) {
    list.innerHTML = '<div class="empty"><div class="empty-ico">🤝</div><div class="empty-title">Aucune annonce</div><div>Soyez le premier à publier une offre ou une demande</div></div>';
    return;
  }
  list.innerHTML = data.map(function(a) {
    const estOffre = a.type === 'offre';
    return '<div class="card" style="margin:0 20px 10px" onclick="ouvrirAnnonceMarche(' + JSON.stringify(a.id) + ')">' +
      '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:6px">' +
        '<span style="font-size:10px;font-weight:700;padding:3px 9px;border-radius:12px;background:' + (estOffre ? '#EEF3E4' : '#F7EFDC') + ';color:' + (estOffre ? '#55702E' : '#96751B') + '">' + (estOffre ? '🛠️ OFFRE' : '🔍 DEMANDE') + '</span>' +
      '</div>' +
      '<div style="font-size:14px;font-weight:700;margin-bottom:4px">' + escapeHTML(a.titre || '') + '</div>' +
      '<div style="font-size:12px;color:#6B5F54">' + [a.secteur, a.ville].filter(Boolean).map(escapeHTML).join(' · ') + '</div>' +
    '</div>';
  }).join('');
}

function ouvrirAnnonceMarche(id) {
  const a = (STATE._marcheData || []).find(function(x) { return x.id === id; });
  if (!a) return;
  const estOffre = a.type === 'offre';
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;padding:24px';
  overlay.innerHTML =
    '<div style="background:#fff;border-radius:18px;padding:24px;max-width:340px;width:100%">' +
      '<span style="font-size:10px;font-weight:700;padding:3px 9px;border-radius:12px;background:' + (estOffre ? '#EEF3E4' : '#F7EFDC') + ';color:' + (estOffre ? '#55702E' : '#96751B') + '">' + (estOffre ? '🛠️ OFFRE' : '🔍 DEMANDE') + '</span>' +
      '<div style="font-size:17px;font-weight:700;margin:10px 0 6px">' + escapeHTML(a.titre || '') + '</div>' +
      '<div style="font-size:12px;color:#9C9186;margin-bottom:14px">' + [a.secteur, a.ville].filter(Boolean).map(escapeHTML).join(' · ') + '</div>' +
      (a.description ? '<div style="font-size:13px;color:#2A2420;margin-bottom:18px;white-space:pre-wrap">' + escapeHTML(a.description) + '</div>' : '') +
      '<div id="marche-contact-zone" style="font-size:12px;color:#9C9186;margin-bottom:10px">Chargement du contact...</div>' +
      '<button onclick="this.closest(\'div[style*=fixed]\').remove()" style="width:100%;padding:10px;background:#F1EEE8;border:none;border-radius:10px;color:#6B5F54;font-size:13px;cursor:pointer;font-family:inherit">Fermer</button>' +
    '</div>';
  overlay.addEventListener('click', function(e) { if (e.target === overlay) overlay.remove(); });
  document.body.appendChild(overlay);

  // Récupère le contact du publicateur au moment de l'ouverture — pas
  // stocké en clair dans la liste, pour limiter l'exposition d'emails
  // à ceux qui ouvrent réellement l'annonce.
  fetch(SUPABASE_URL + '/rest/v1/profils_entreprise?id=eq.' + a.user_id + '&select=raison,tel,email,annuaire_contact_visible', {
    headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY }
  }).then(function(r) { return r.json(); }).then(function(profils) {
    const p = (profils && profils[0]) || {};
    const zone = document.getElementById('marche-contact-zone');
    if (!zone) return;
    const visible = p.annuaire_contact_visible !== false;
    if (!visible || (!p.tel && !p.email)) {
      zone.innerHTML = '<div style="text-align:center;color:#9C9186">Contact non communiqué publiquement</div>';
      return;
    }
    zone.innerHTML =
      '<div style="font-size:12px;color:#6B5F54;margin-bottom:8px">Publié par ' + escapeHTML(p.raison || 'une entreprise Zelto') + '</div>' +
      (p.tel ? '<a href="https://wa.me/' + p.tel.replace(/[^0-9]/g,'') + '" target="_blank" style="display:block;padding:11px;background:#25D366;color:#fff;border-radius:10px;text-decoration:none;font-weight:600;font-size:13px;margin-bottom:8px;text-align:center">💬 Contacter par WhatsApp</a>' : '') +
      (p.email ? '<a href="mailto:' + p.email + '" style="display:block;padding:11px;background:#F1EEE8;color:#2A2420;border-radius:10px;text-decoration:none;font-weight:600;font-size:13px;margin-bottom:8px;text-align:center">✉️ ' + escapeHTML(p.email) + '</a>' : '');
  }).catch(function() {
    const zone = document.getElementById('marche-contact-zone');
    if (zone) zone.innerHTML = '<div style="text-align:center;color:#9C9186">Contact indisponible</div>';
  });
}

function initNouvelleAnnonce() {
  el('na-type') && (el('na-type').value = 'offre');
  el('na-titre') && (el('na-titre').value = '');
  el('na-description') && (el('na-description').value = '');
  el('na-secteur') && (el('na-secteur').value = '');
  el('na-ville') && (el('na-ville').value = STATE.profil?.ville || '');
}

async function sauvegarderAnnonce() {
  if (typeof verifierConnexionRequise === 'function' && !verifierConnexionRequise()) return;
  const titre = el('na-titre')?.value.trim();
  if (!titre) { showToast('Donnez un titre à votre annonce', 'error'); return; }
  showToast('⏳ Publication...');
  try {
    const r = await sb.post('annonces_marche', {
      user_id: (STATE.entrepriseId || sb.user.id),
      type: el('na-type')?.value || 'offre',
      titre: titre,
      description: el('na-description')?.value.trim() || null,
      secteur: el('na-secteur')?.value.trim() || null,
      ville: el('na-ville')?.value.trim() || null,
      statut: 'active',
    });
    if (!r || !r.length) throw new Error('Erreur serveur');
    showToast('✅ Annonce publiée !', 'success');
    logAudit('annonce', r[0].id, 'creation', titre);
    goScreen('marche', null);
    loadMarche();
  } catch(e) { showToast('❌ ' + e.message, 'error'); }
}

async function loadMesAnnonces() {
  try {
    const uid = STATE.entrepriseId || sb.user.id;
    STATE._mesAnnonces = await sb.get('annonces_marche', 'user_id=eq.' + uid + '&order=created_at.desc') || [];
  } catch(e) { STATE._mesAnnonces = []; }
  renderMesAnnonces();
}

function renderMesAnnonces() {
  const list = el('mes-annonces-list');
  if (!list) return;
  const data = STATE._mesAnnonces || [];
  if (!data.length) {
    list.innerHTML = '<div class="empty"><div class="empty-ico">📋</div><div class="empty-title">Aucune annonce publiée</div></div>';
    return;
  }
  const statutLabels = { active: '🟢 Active', pourvue: '✅ Pourvue', expiree: '⚪ Expirée' };
  list.innerHTML = data.map(function(a) {
    return '<div style="background:#fff;border-radius:12px;padding:14px;margin:0 20px 10px;border:1px solid #E3DCCF">' +
      '<div style="font-size:13px;font-weight:700;margin-bottom:4px">' + escapeHTML(a.titre || '') + '</div>' +
      '<div style="font-size:11px;color:#6B5F54;margin-bottom:10px">' + (statutLabels[a.statut] || a.statut) + '</div>' +
      (a.statut === 'active' ? '<div style="display:flex;gap:6px">' +
        '<button onclick="changerStatutAnnonce(\'' + a.id + '\',\'pourvue\')" style="flex:1;padding:8px;background:#EEF3E4;color:#55702E;border:none;border-radius:8px;font-size:11px;font-weight:600;cursor:pointer;font-family:inherit">✅ Marquer pourvue</button>' +
        '<button onclick="supprimerAnnonce(\'' + a.id + '\')" style="flex:1;padding:8px;background:#F5E4E1;color:#B23A2E;border:none;border-radius:8px;font-size:11px;font-weight:600;cursor:pointer;font-family:inherit">🗑️ Supprimer</button>' +
      '</div>' : '<button onclick="supprimerAnnonce(\'' + a.id + '\')" style="width:100%;padding:8px;background:#F5E4E1;color:#B23A2E;border:none;border-radius:8px;font-size:11px;font-weight:600;cursor:pointer;font-family:inherit">🗑️ Supprimer</button>') +
    '</div>';
  }).join('');
}

async function changerStatutAnnonce(id, statut) {
  try {
    await sb.patch('annonces_marche', 'id=eq.' + id + '&user_id=eq.' + (STATE.entrepriseId || sb.user.id), { statut: statut });
    const a = (STATE._mesAnnonces || []).find(function(x) { return x.id === id; });
    if (a) a.statut = statut;
    renderMesAnnonces();
    showToast('Statut mis à jour', 'success');
  } catch(e) { showToast('❌ ' + e.message, 'error'); }
}

async function supprimerAnnonce(id) {
  if (!confirm('Supprimer cette annonce définitivement ?')) return;
  try {
    await sb.del('annonces_marche', 'id=eq.' + id + '&user_id=eq.' + (STATE.entrepriseId || sb.user.id));
    STATE._mesAnnonces = (STATE._mesAnnonces || []).filter(function(x) { return x.id !== id; });
    renderMesAnnonces();
    showToast('Annonce supprimée', 'success');
  } catch(e) { showToast('❌ ' + e.message, 'error'); }
}
