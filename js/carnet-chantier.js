// ZELTO — carnet-chantier.js — Journal photo par chantier
// ============================================================
// Un carnet de bord simple : une photo + une note + une date, rattachées
// à un nom de chantier (même champ texte libre que sur factures/achats).
// Utile pour garder une trace de l'avancement, sans prétendre remplacer
// un vrai outil de suivi de chantier professionnel.
STATE.photosChantierActuel = STATE.photosChantierActuel || [];
STATE._chantierSelectionne = STATE._chantierSelectionne || '';

// Construit la liste des noms de chantier déjà utilisés (factures +
// achats), pour proposer une liste déroulante plutôt qu'une saisie
// libre à chaque fois — évite les doublons du type "Villa Casa" vs
// "villa casablanca ".
function listerNomsChantiers() {
  const noms = new Set();
  (STATE.factures || []).forEach(function(f) { if (f.chantier) noms.add(f.chantier); });
  (STATE.achats || []).forEach(function(a) { if (a.chantier) noms.add(a.chantier); });
  (STATE.devis || []).forEach(function(d) { if (d.chantier) noms.add(d.chantier); });
  return Array.from(noms).sort();
}

function renderSelecteurChantier() {
  const select = el('carnet-chantier-select');
  if (!select) return;
  const noms = listerNomsChantiers();
  select.innerHTML = '<option value="">— Choisir un chantier —</option>' +
    noms.map(function(n) { return '<option value="' + escapeHTML(n) + '"' + (n === STATE._chantierSelectionne ? ' selected' : '') + '>' + escapeHTML(n) + '</option>'; }).join('');
}

async function changerChantierCarnet() {
  const select = el('carnet-chantier-select');
  STATE._chantierSelectionne = select?.value || '';
  await chargerPhotosChantier();
}

async function chargerPhotosChantier() {
  const zone = el('carnet-chantier-liste');
  if (!zone) return;
  if (!STATE._chantierSelectionne) {
    zone.innerHTML = '<div class="empty"><div class="empty-ico">🏗️</div><div class="empty-title">Choisissez un chantier</div><div>Sélectionnez un chantier ci-dessus pour voir ou ajouter des photos</div></div>';
    return;
  }
  zone.innerHTML = '<div style="text-align:center;padding:20px;color:#9C9186">⏳ Chargement...</div>';
  try {
    STATE.photosChantierActuel = (await sb.get('photos_chantier', 'user_id=eq.' + (STATE.entrepriseId || sb.user.id) + '&chantier=eq.' + encodeURIComponent(STATE._chantierSelectionne) + '&order=date_prise.desc')) || [];
  } catch(e) {
    STATE.photosChantierActuel = [];
  }
  renderPhotosChantier();
}

function renderPhotosChantier() {
  const zone = el('carnet-chantier-liste');
  if (!zone) return;
  const photos = STATE.photosChantierActuel || [];
  if (!photos.length) {
    zone.innerHTML = '<div class="empty"><div class="empty-ico">📷</div><div class="empty-title">Aucune photo pour ce chantier</div><div>Ajoutez la première avec le bouton ci-dessus</div></div>';
    return;
  }
  zone.innerHTML = photos.map(function(p) {
    return '<div style="background:#fff;border-radius:14px;overflow:hidden;margin-bottom:14px;border:1px solid #E3DCCF">' +
      '<img src="' + p.photo + '" style="width:100%;max-height:280px;object-fit:cover;display:block">' +
      '<div style="padding:12px 14px">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">' +
          '<span style="font-size:11px;font-weight:700;color:#6B5F54">' + formatDate(p.date_prise) + '</span>' +
          '<button onclick="supprimerPhotoChantier(\'' + p.id + '\')" style="background:#F5E4E1;color:#B23A2E;border:none;border-radius:6px;padding:4px 8px;font-size:10px;cursor:pointer">🗑️</button>' +
        '</div>' +
        (p.note ? '<div style="font-size:12px;color:#2A2420">' + escapeHTML(p.note) + '</div>' : '') +
      '</div>' +
    '</div>';
  }).join('');
}

// Ouvre le sélecteur de photo (caméra ou galerie, selon l'appareil)
function ouvrirAjoutPhotoChantier() {
  if (!STATE._chantierSelectionne) { showToast('Choisissez d\'abord un chantier', 'error'); return; }
  el('carnet-photo-input')?.click();
}

async function traiterNouvellePhotoChantier(event) {
  const file = event.target.files[0];
  if (!file) return;
  event.target.value = '';
  const reader = new FileReader();
  reader.onload = function(e) {
    window._carnetPhotoEnAttente = e.target.result;
    el('carnet-photo-apercu') && (el('carnet-photo-apercu').src = e.target.result);
    el('carnet-note-input') && (el('carnet-note-input').value = '');
    el('modal-carnet-note')?.classList.add('active');
  };
  reader.readAsDataURL(file);
}

async function confirmerAjoutPhotoChantier() {
  const photo = window._carnetPhotoEnAttente;
  if (!photo || !STATE._chantierSelectionne) return;
  const note = (el('carnet-note-input')?.value || '').trim();
  showToast('⏳ Enregistrement...');
  try {
    const nouvellePhoto = {
      user_id: (STATE.entrepriseId || sb.user.id),
      chantier: STATE._chantierSelectionne,
      photo: photo,
      note: note,
      date_prise: today(),
    };
    const r = await sb.post('photos_chantier', nouvellePhoto);
    if (r && r[0]) STATE.photosChantierActuel.unshift(r[0]);
    window._carnetPhotoEnAttente = null;
    closeAllModals();
    renderPhotosChantier();
    showToast('✅ Photo ajoutée au carnet', 'success');
  } catch(e) {
    showToast('❌ ' + e.message, 'error');
  }
}

async function supprimerPhotoChantier(id) {
  if (!confirm('Supprimer cette photo du carnet ?')) return;
  try {
    await sb.del('photos_chantier', 'id=eq.' + id + '&user_id=eq.' + (STATE.entrepriseId || sb.user.id));
    STATE.photosChantierActuel = (STATE.photosChantierActuel || []).filter(function(p) { return p.id !== id; });
    renderPhotosChantier();
    showToast('Photo supprimée', 'success');
  } catch(e) {
    showToast('Erreur: ' + e.message, 'error');
  }
}

function initCarnetChantier() {
  renderSelecteurChantier();
  if (STATE._chantierSelectionne) chargerPhotosChantier();
  else renderPhotosChantier();
}
