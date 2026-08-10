// ZELTO — achats.js — Factures d'achat

STATE.achats = STATE.achats || [];
STATE.achatFiltreActuel = 'tous';
STATE.lignesAchat = STATE.lignesAchat || [];

// ============================================================
// CHARGEMENT
// ============================================================

async function loadAchats() {
  try {
    const uid = sb.user?.id;
    if (!uid) return;
    const r = await sb.get('factures_achat', 'user_id=eq.' + uid + '&order=date_achat.desc');
    STATE.achats = r || [];
  } catch(e) { STATE.achats = []; }
  renderAchats();
}

// ============================================================
// LISTE ACHATS
// ============================================================

function filtrerAchats(filtre, btn) {
  STATE.achatFiltreActuel = filtre;
  document.querySelectorAll('#screen-achats .ftab').forEach(function(b) { b.classList.remove('active'); });
  if (btn) btn.classList.add('active');
  renderAchats();
}

function renderAchats() {
  const list = el('achats-list');
  if (!list) return;

  let achats = STATE.achats || [];
  const filtre = STATE.achatFiltreActuel || 'tous';

  if (filtre === 'attente') achats = achats.filter(function(a) { return a.statut === 'attente'; });
  else if (filtre === 'payee') achats = achats.filter(function(a) { return a.statut === 'payee'; });
  else if (filtre === 'banipay') achats = achats.filter(function(a) { return a.fournisseur_banipay; });

  // Total
  const total = achats.reduce(function(s, a) { return s + (Number(a.ttc) || 0); }, 0);
  setEl('achats-total', fmt(total) + ' MAD');

  if (!achats.length) {
    list.innerHTML = '<div class="empty"><div class="empty-ico">🛒</div><div class="empty-title">Aucune facture d\'achat</div><div>Ajoutez vos factures fournisseurs</div></div>';
    return;
  }

  const catIcons = { materiel:'🔧', services:'💼', fournitures:'📦', transport:'🚛', immobilier:'🏠', autre:'📄' };
  const statutBg = { payee:'#EEF3E4', attente:'#F7EFDC' };
  const statutColor = { payee:'#55702E', attente:'#B8860B' };
  const statutLabel = { payee:'Payée', attente:'En attente' };

  list.innerHTML = achats.map(function(a) {
    const enSelection = typeof estEnSelection === 'function' && estEnSelection('achats');
    return '<div class="card" onclick="' + (enSelection ? 'toggleSelectionItem(' + a.id + ')' : "ouvrirDetailAchat('" + a.id + "')") + '">' +
      (typeof checkboxSelection === 'function' ? checkboxSelection('achats', a.id) : '') +
      '<div class="card-ico" style="background:#F5E4E1;font-size:20px">' + (catIcons[a.categorie] || '📄') + '</div>' +
      '<div class="card-body">' +
        '<div class="card-name">' + escapeHTML(a.fournisseur || '—') + (a.fournisseur_banipay ? ' <span style="font-size:9px;background:#E9F4F3;color:#1F6F72;padding:1px 5px;border-radius:4px;font-weight:600">BP</span>' : (a.origine === 'auto_acceptation' ? ' <span style="font-size:9px;background:#EEF3E4;color:#55702E;padding:1px 5px;border-radius:4px;font-weight:600">AUTO</span>' : '')) + '</div>' +
        '<div class="card-ref">' + (a.ref_fournisseur || '') + ' · ' + (a.date_achat || '') + '</div>' +
      '</div>' +
      '<div class="card-end">' +
        '<div class="card-amount" style="color:#B23A2E">' + fmt(a.ttc || 0) + '</div>' +
        '<div style="font-size:10px;padding:2px 6px;border-radius:4px;background:' + (statutBg[a.statut] || '#EAE4DA') + ';color:' + (statutColor[a.statut] || '#6B5F54') + ';font-weight:600;margin-top:4px">' + (statutLabel[a.statut] || a.statut || '') + '</div>' +
      '</div>' +
    '</div>';
  }).join('');
}

// ============================================================
// IMPORT FOURNISSEUR BANIPAY (profil)
// ============================================================

async function importerFournisseurZelto() {
  const lien = (el('achat-fournisseur-lien')?.value || '').trim();
  if (!lien) { showToast('Collez un lien Zelto', 'error'); return; }

  showToast('\u23f3 Chargement...');

  try {
    const url = new URL(lien.startsWith('http') ? lien : 'https://x.com?' + lien);

    // CAS 0: Lien direct vers une FACTURE (?doc=xxx) — import complet de la facture
    const docId = url.searchParams.get('doc');
    if (docId) {
      await importerAchatDepuisFactureId(docId);
      return;
    }

    // CAS 1: Lien profil entreprise (?profil=xxx ou ?portail=xxx)
    const profilId = url.searchParams.get('profil') || url.searchParams.get('portail');
    if (profilId) {
      const r = await fetch(SUPABASE_URL + '/rest/v1/profils_entreprise?id_unique=eq.' + profilId + '&select=*', {
        headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + sb.token }
      });
      const data = await r.json();
      const p = data && data[0];
      if (!p) { showToast('Profil introuvable', 'error'); return; }
      remplirFournisseur(p.raison || '', p.id || '', true);
      showToast('\u2705 Fournisseur importé : ' + p.raison, 'success');
      return;
    }

    // CAS 2: Lien profil comptable (?comptable=CPT-xxxx)
    const comptableId = url.searchParams.get('comptable');
    if (comptableId) {
      const invResp = await fetch(
        SUPABASE_URL + '/rest/v1/invitations_comptable?entreprise_id=eq.' + sb.user?.id + '&statut=eq.acceptee&limit=1',
        { headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + sb.token } }
      );
      const invs = await invResp.json() || [];
      if (invs.length) {
        const emailCpt = invs[0].comptable_email;
        remplirFournisseur(emailCpt, null, true);
        showToast('\u2705 Comptable importé : ' + emailCpt, 'success');
      } else {
        showToast('Aucun comptable lié', 'error');
      }
      return;
    }

    showToast('Lien non reconnu', 'error');

  } catch(e) {
    showToast('Erreur: ' + e.message, 'error');
  }
}

function remplirFournisseur(nom, id, isZelto) {
  if (el('achat-fournisseur')) {
    el('achat-fournisseur').value = nom;
    el('achat-fournisseur').style.background = '#EEF3E4';
  }
  if (el('achat-fournisseur-id')) el('achat-fournisseur-id').value = id || '';
  if (el('achat-fournisseur-banipay')) el('achat-fournisseur-banipay').value = isZelto ? '1' : '0';
  if (el('achat-fournisseur-lien')) el('achat-fournisseur-lien').value = '';
}

// ============================================================
// IMPORT D'ACHAT DEPUIS UNE FACTURE REÇUE (lien ?doc=, QR, ou auto)
// ============================================================
// NOUVEAU: trois façons d'ajouter un achat — saisie manuelle (déjà existante
// ci-dessus), lien d'une facture reçue, scan du QR code d'une facture. Et le
// cas idéal : enregistrement 100% automatique à l'acceptation (voir plus bas).

// Récupère une facture publique (par id) via la clé anon, comme le fait déjà
// la page de consultation publique — ne dépend d'aucun droit RLS particulier
// puisque c'est la même lecture que celle utilisée pour afficher un devis/
// une facture reçue par lien.
async function _fetchFacturePublique(factureId) {
  const r = await fetch(SUPABASE_URL + '/rest/v1/factures?id=eq.' + factureId + '&select=*', {
    headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY }
  });
  const data = await r.json();
  return data && data[0];
}

async function _fetchProfilPublic(userId) {
  const r = await fetch(SUPABASE_URL + '/rest/v1/profils_entreprise?id=eq.' + userId + '&select=*', {
    headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY }
  });
  const data = await r.json();
  return (data && data[0]) || {};
}

// Pré-remplit le formulaire "Nouvelle achat" à partir d'une facture reçue,
// identifiée par son id (extrait d'un lien ?doc=xxx ou d'un QR code scanné).
async function importerAchatDepuisFactureId(factureId) {
  showToast('⏳ Chargement de la facture...');
  try {
    const f = await _fetchFacturePublique(factureId);
    if (!f) { showToast('Facture introuvable', 'error'); return; }
    const emetteur = await _fetchProfilPublic(f.user_id);

    remplirFournisseur(emetteur.raison || f.client_raison || 'Fournisseur', f.user_id, true);
    el('achat-ref') && (el('achat-ref').value = f.ref || '');
    el('achat-date') && (el('achat-date').value = f.date_emission || today());
    el('achat-echeance') && (el('achat-echeance').value = f.echeance || '');
    el('achat-tva-taux') && (el('achat-tva-taux').value = f.ht > 0 ? Math.round((f.tva / f.ht) * 100) : 20);
    // NOUVEAU: reprend les lignes telles quelles depuis la facture reçue —
    // plus besoin de ressaisir chaque article, la ventilation est déjà là.
    const lignesFacture = typeof f.lignes === 'string' ? JSON.parse(f.lignes || '[]') : (f.lignes || []);
    STATE.lignesAchat = lignesFacture.map(function(l) {
      return { desc: l.desc, qte: l.qte, pu: l.pu, unite: l.unite || 'u', produit_id: null };
    });
    renderLignesAchat();
    window._achatFactureLieeId = factureId;
    showToast('✅ Facture ' + (f.ref || '') + ' importée — vérifiez puis enregistrez', 'success');
    goScreen('nouvelle-achat');
  } catch(e) {
    showToast('Erreur: ' + e.message, 'error');
  }
}

// NOTE: importerAchatDepuisLienFacture() a été retirée — elle référençait un
// champ HTML qui n'a jamais existé et n'était appelée par aucun bouton. Sa
// fonctionnalité est déjà couverte par importerFournisseurBaniPay() (le
// champ "Fournisseur sur BaniPay ?" détecte déjà les liens ?doc=... via son
// bouton "Import").

// ============================================================
// SCAN QR CODE RÉEL (jsQR, chargé à la demande depuis un CDN)
// ============================================================

let _jsQRPromise = null;
function _chargerJsQR() {
  if (window.jsQR) return Promise.resolve();
  if (_jsQRPromise) return _jsQRPromise;
  _jsQRPromise = new Promise(function(resolve, reject) {
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jsQR/1.4.0/jsQR.min.js';
    script.onload = resolve;
    script.onerror = reject;
    document.head.appendChild(script);
  });
  return _jsQRPromise;
}

// Ouvre la caméra et scanne en continu jusqu'à détecter un QR code Zelto
// (lien contenant ?doc=... ou ?profil=...), puis importe automatiquement.
async function scannerQRAchat() {
  showToast('⏳ Ouverture de la caméra...');
  try {
    await _chargerJsQR();
  } catch(e) {
    showToast('Impossible de charger le lecteur QR (connexion ?)', 'error');
    return;
  }

  const overlay = document.createElement('div');
  overlay.id = 'qr-scan-overlay';
  overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;z-index:99999;background:#000;display:flex;flex-direction:column';
  overlay.innerHTML =
    '<div style="padding:14px 16px;display:flex;align-items:center;gap:12px;background:rgba(0,0,0,0.6)">' +
      '<button id="qr-scan-close" style="background:rgba(255,255,255,0.15);color:#fff;border:none;border-radius:8px;padding:7px 12px;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit">← Fermer</button>' +
      '<div style="color:#fff;font-size:13px;font-weight:600">Visez le QR code de la facture</div>' +
    '</div>' +
    '<video id="qr-scan-video" style="flex:1;width:100%;object-fit:cover" playsinline autoplay muted></video>' +
    '<canvas id="qr-scan-canvas" style="display:none"></canvas>';
  document.body.appendChild(overlay);

  const video = document.getElementById('qr-scan-video');
  const canvas = document.getElementById('qr-scan-canvas');
  const ctx = canvas.getContext('2d');
  let stream = null;
  let scanning = true;

  function arreter() {
    scanning = false;
    if (stream) stream.getTracks().forEach(function(t) { t.stop(); });
    overlay.remove();
  }
  document.getElementById('qr-scan-close').onclick = arreter;

  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
    video.srcObject = stream;
  } catch(e) {
    showToast('Accès caméra refusé ou indisponible', 'error');
    overlay.remove();
    return;
  }

  function boucleScan() {
    if (!scanning) return;
    if (video.readyState === video.HAVE_ENOUGH_DATA) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const code = window.jsQR(imageData.data, imageData.width, imageData.height);
      if (code && code.data) {
        arreter();
        traiterLienScanne(code.data);
        return;
      }
    }
    requestAnimationFrame(boucleScan);
  }
  requestAnimationFrame(boucleScan);
}

async function traiterLienScanne(texte) {
  let factureId = null, profilId = null;
  try {
    const url = new URL(texte);
    factureId = url.searchParams.get('doc');
    profilId = url.searchParams.get('profil') || url.searchParams.get('portail');
  } catch(e) {
    const m = texte.match(/doc=([^&]+)/);
    factureId = m ? m[1] : null;
  }
  if (factureId) {
    await importerAchatDepuisFactureId(factureId);
  } else if (profilId) {
    el('achat-fournisseur-lien') && (el('achat-fournisseur-lien').value = texte);
    await importerFournisseurZelto();
    goScreen('nouvelle-achat');
  } else {
    showToast('QR code non reconnu par Zelto', 'error');
  }
}

// ============================================================
// ENREGISTREMENT 100% AUTOMATIQUE À L'ACCEPTATION
// ============================================================
// Le cas idéal demandé : quand le fournisseur émet une facture via Zelto
// et que le client l'accepte (depuis ses propres notifications, donc avec sa
// session authentifiée), l'achat s'enregistre tout seul, sans aucune saisie.
async function enregistrerAchatDepuisFactureAcceptee(factureId) {
  const uid = sb.user?.id;
  if (!uid) return;
  try {
    // Éviter les doublons si la notification est traitée deux fois
    const existant = (STATE.achats || []).find(function(a) { return a.facture_source_id === String(factureId); });
    if (existant) return;

    const f = await _fetchFacturePublique(factureId);
    if (!f) return;
    const emetteur = await _fetchProfilPublic(f.user_id);
    const lignesFacture = typeof f.lignes === 'string' ? JSON.parse(f.lignes || '[]') : (f.lignes || []);

    const achat = {
      user_id: uid,
      fournisseur: emetteur.raison || 'Fournisseur Zelto',
      fournisseur_id: f.user_id,
      fournisseur_banipay: true,
      ref_fournisseur: f.ref || '',
      date_achat: f.date_emission || today(),
      echeance: f.echeance || null,
      ht: f.ht || 0,
      tva: f.tva || 0,
      tva_taux: f.ht > 0 ? Math.round((f.tva / f.ht) * 100) : 20,
      ttc: f.ttc || 0,
      categorie: 'autre',
      statut: 'attente',
      // NOUVEAU: reprend les lignes de la facture reçue telles quelles
      // (non liées au catalogue — les deux entreprises ont des catalogues
      // distincts, impossible de deviner une correspondance automatique).
      lignes: lignesFacture.map(function(l) { return { desc: l.desc, qte: l.qte, pu: l.pu, unite: l.unite || 'u', produit_id: null }; }),
      note: 'Enregistré automatiquement à l\'acceptation de la facture ' + (f.ref || ''),
      facture_source_id: String(factureId),
      origine: 'auto_acceptation',
      created_at: new Date().toISOString()
    };

    const result = await sb.post('factures_achat', achat);
    if (result) {
      STATE.achats.unshift(result[0] || achat);
      renderAchats();
      showToast('🛒 Achat ' + (f.ref || '') + ' enregistré automatiquement', 'success');
      if (typeof logAudit === 'function') logAudit('achat', (result[0]||achat).id, 'creation', 'Auto — ' + achat.fournisseur + ' — ' + fmt(achat.ttc) + ' MAD');
    }
  } catch(e) {
    console.warn('enregistrerAchatDepuisFactureAcceptee:', e);
  }
}

// ============================================================
// CALCUL TOTAUX
// ============================================================

// ============================================================
// LIGNES D'ACHAT (désignation, quantité, prix, article lié)
// ============================================================
// NOUVEAU: un achat s'itemise maintenant en lignes, comme une facture/devis
// — chaque ligne peut optionnellement être liée à un article du catalogue,
// ce qui alimente automatiquement le stock à l'enregistrement.

function renderLignesAchat() {
  const c = el('achat-lignes-container');
  if (!c) return;
  c.innerHTML = STATE.lignesAchat.map(function(l, i) {
    return '<div class="ligne-item">' +
      '<div class="ligne-body"><div class="ligne-desc">' + escapeHTML(l.desc) + (l.produit_id ? ' <span style="color:#55702E;font-size:10px">📦</span>' : '') + '</div>' +
      '<div class="ligne-meta">' + l.qte + ' ' + (l.unite||'u') + ' × ' + fmt(l.pu) + ' MAD</div></div>' +
      '<div class="ligne-amt">' + fmt(l.qte * l.pu) + ' MAD</div>' +
      '<button class="ligne-del" onclick="STATE.lignesAchat.splice(' + i + ',1);renderLignesAchat()">×</button>' +
    '</div>';
  }).join('');
  calcAchatTotaux();
}

function openAddLigneAchat() {
  el('mla-desc') && (el('mla-desc').value = '');
  el('mla-qte') && (el('mla-qte').value = '1');
  el('mla-pu') && (el('mla-pu').value = '');
  el('mla-unite') && (el('mla-unite').value = 'u');
  window._ligneAchatProduitId = null;
  el('modal-ligne-achat')?.classList.add('active');
  setTimeout(function() { el('mla-desc')?.focus(); }, 100);
}

function confirmerLigneAchat() {
  const desc = (el('mla-desc')?.value || '').trim();
  const qte = parseFloat((el('mla-qte')?.value || '1').replace(',', '.')) || 1;
  const pu = parseFloat((el('mla-pu')?.value || '0').replace(',', '.')) || 0;
  const unite = el('mla-unite')?.value || 'u';
  if (!desc) { showToast('Entrez une description', 'error'); return; }
  if (pu <= 0) { showToast('Entrez un prix unitaire', 'error'); return; }
  STATE.lignesAchat.push({ desc, qte, pu, unite, produit_id: window._ligneAchatProduitId || null });
  window._ligneAchatProduitId = null;
  closeAllModals();
  renderLignesAchat();
}

// Choisir un article du catalogue pré-remplit la ligne ET la lie au stock
function ouvrirCatalogueAchat() {
  el('search-produit') && (el('search-produit').value = '');
  window._catalogueModePourAchat = true;
  filtrerProduits();
  el('modal-produits')?.classList.add('active');
}

// Étend ajouterDepuisCatalogue (produits.js) pour aussi gérer le contexte achat
function ajouterDepuisCatalogueAchatSiActif(produitId) {
  if (!window._catalogueModePourAchat) return false;
  window._catalogueModePourAchat = false;
  const p = (STATE.produits || []).find(function(x) { return x.id === produitId; });
  if (!p) return true;
  STATE.lignesAchat.push({ desc: p.nom, qte: 1, pu: p.cout_moyen || p.prix_ht || 0, unite: p.unite || 'u', produit_id: p.id });
  closeAllModals();
  renderLignesAchat();
  showToast('✅ ' + p.nom + ' ajouté (lié au stock)', 'success');
  return true;
}

function calcAchatTotaux() {
  const ht = (STATE.lignesAchat || []).reduce(function(s, l) { return s + (Number(l.qte)||0) * (Number(l.pu)||0); }, 0);
  const taux = parseFloat(el('achat-tva-taux')?.value || 20) / 100;
  const tva = ht * taux;
  const ttc = ht + tva;
  setEl('achat-ht-display', fmt(ht) + ' MAD');
  setEl('achat-tva-display', fmt(tva) + ' MAD');
  setEl('achat-ttc-display', fmt(ttc) + ' MAD');
}

// ============================================================
// PIÈCE JOINTE
// ============================================================

function previewAchatPJ(event) {
  const file = event.target.files[0];
  if (!file) return;
  const preview = el('achat-pj-preview');
  if (!preview) return;

  const reader = new FileReader();
  reader.onload = function(e) {
    const isImage = file.type.startsWith('image/');
    preview.innerHTML = isImage
      ? '<img src="' + e.target.result + '" style="max-width:100%;border-radius:10px;border:1px solid #E3DCCF">'
      : '<div style="background:#F1EEE8;border-radius:10px;padding:10px;font-size:12px;color:#6B5F54;border:1px solid #E3DCCF">📎 ' + file.name + ' (' + (file.size/1024).toFixed(0) + ' KB)</div>';
    STATE._achatPJData = e.target.result;
    STATE._achatPJNom = file.name;

    // NOUVEAU: lecture automatique basique (OCR) — extrait le texte de la
    // photo et propose fournisseur/date/montant en pré-remplissage. À
    // calibrer : c'est de la reconnaissance de texte + heuristiques
    // simples, pas une IA qui "comprend" la facture — à vérifier/corriger
    // systématiquement avant d'enregistrer.
    if (isImage && typeof lireFactureParOCR === 'function' && (typeof aAccesFeature !== 'function' || aAccesFeature('ocr_achats'))) lireFactureParOCR(e.target.result);
    else if (file.type === 'application/pdf' && typeof lireFacturePDF === 'function' && (typeof aAccesFeature !== 'function' || aAccesFeature('ocr_achats'))) lireFacturePDF(e.target.result);
  };
  reader.readAsDataURL(file);
}

// ============================================================
// LIER À UN ARTICLE DU CATALOGUE (alimente le stock automatiquement)
// ============================================================

// NOTE: renderAchatProduitPicker() a été retirée — remplacée par les lignes
// itemisées, chacune pouvant être liée individuellement au catalogue via
// ouvrirCatalogueAchat().

// ============================================================
// SAUVEGARDER ACHAT
// ============================================================

async function sauvegarderAchat() {
  const fournisseur = (el('achat-fournisseur')?.value || '').trim();
  if (!fournisseur) { showToast('Saisissez le fournisseur', 'error'); return; }
  if (!STATE.lignesAchat.length) { showToast('Ajoutez au moins une ligne', 'error'); return; }
  const dateAchat = el('achat-date')?.value;
  const echeanceAchat = el('achat-echeance')?.value;
  if (dateAchat && echeanceAchat && echeanceAchat < dateAchat) {
    showToast('⚠️ L\'échéance ne peut pas être avant la date de la facture', 'error');
    return;
  }

  const ht = STATE.lignesAchat.reduce(function(s, l) { return s + (Number(l.qte)||0) * (Number(l.pu)||0); }, 0);
  const taux = parseFloat(el('achat-tva-taux')?.value || 20) / 100;
  const tva = ht * taux;
  const ttc = ht + tva;

  const achat = {
    user_id: sb.user?.id,
    fournisseur: fournisseur,
    fournisseur_id: el('achat-fournisseur-id')?.value || null,
    fournisseur_banipay: el('achat-fournisseur-banipay')?.value === '1',
    ref_fournisseur: el('achat-ref')?.value || '',
    date_achat: el('achat-date')?.value || new Date().toISOString().split('T')[0],
    echeance: el('achat-echeance')?.value || null,
    ht: ht,
    tva: tva,
    tva_taux: parseFloat(el('achat-tva-taux')?.value || 20),
    ttc: ttc,
    categorie: el('achat-categorie')?.value || 'autre',
    statut: el('achat-statut')?.value || 'attente',
    note: el('achat-note')?.value || '',
    lignes: STATE.lignesAchat,
    pj_data: STATE._achatPJData || null,
    pj_nom: STATE._achatPJNom || null,
    facture_source_id: window._achatFactureLieeId || null,
    created_at: new Date().toISOString()
  };

  try {
    showToast('\u23f3 Enregistrement...');
    const result = await sb.post('factures_achat', achat);
    if (result) {
      STATE.achats.unshift(result[0] || achat);
      const lignesEnregistrees = STATE.lignesAchat.slice();
      STATE.lignesAchat = [];
      STATE._achatPJData = null;
      STATE._achatPJNom = null;
      window._achatFactureLieeId = null;

      // NOUVEAU: chaque ligne liée à un article du catalogue alimente le
      // stock automatiquement (entrée), avec son propre coût unitaire —
      // remplace l'ancien lien unique "un achat = un seul article".
      if (typeof enregistrerEntreeStock === 'function') {
        for (const l of lignesEnregistrees) {
          if (l.produit_id && Number(l.qte) > 0) {
            await enregistrerEntreeStock(l.produit_id, Number(l.qte), Number(l.pu) || 0, 'Achat ' + (achat.ref_fournisseur || fournisseur));
          }
        }
      }

      showToast('\u2705 Facture d\'achat enregistrée !', 'success');
      goScreen('achats', null);
      renderAchats();
    }
  } catch(e) {
    showToast('Erreur: ' + e.message, 'error');
  }
}

// ============================================================
// DÉTAIL ACHAT
// ============================================================

// NOUVEAU: visualiser la facture d'origine d'un achat (celle envoyée par le
// fournisseur via Zelto, ou importée par lien) — réutilise les mêmes
// helpers déjà utilisés pour l'import.
async function voirFactureOrigineAchat(factureId) {
  showToast('⏳ Chargement de la facture...');
  try {
    const f = await _fetchFacturePublique(factureId);
    if (!f) { showToast('Facture introuvable', 'error'); return; }
    const emetteur = await _fetchProfilPublic(f.user_id);
    const lignes = typeof f.lignes === 'string' ? JSON.parse(f.lignes || '[]') : (f.lignes || []);
    genDocPDF({
      type: 'FACTURE', ref: f.ref, color: emetteur.couleur_accent || '#C9971F',
      emetteur: emetteur,
      destinataire: { nom: f.client, chantier: f.chantier },
      date: f.date_emission, echeance: f.echeance,
      paiement: f.paiement || '', statut: f.statut,
      lignes: lignes, note: f.note || '',
      ht: f.ht, tva: f.tva, ttc: f.ttc,
      devise: f.devise || 'MAD',
      montant_recu: f.montant_recu || 0,
      showStamp: f.statut === 'payee',
      signatureClient: f.signature_data || null,
    });
  } catch(e) {
    showToast('Erreur: ' + e.message, 'error');
  }
}

function ouvrirDetailAchat(id) {
  const a = STATE.achats.find(function(x) { return x.id === id; });
  if (!a) return;

  const catLabels = { materiel:'Matériel & Équipement', services:'Services', fournitures:'Fournitures', transport:'Transport', immobilier:'Immobilier', autre:'Autre' };

  const overlay = document.createElement('div');
  overlay.id = 'achat-detail-overlay';
  overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;z-index:9999;background:#F1EEE8;overflow-y:auto;font-family:inherit';

  overlay.innerHTML =
    '<div style="background:linear-gradient(135deg,#B23A2E,#8E2E24);padding:14px 20px;display:flex;align-items:center;gap:12px">' +
      '<button onclick="document.getElementById(\'achat-detail-overlay\').remove()" style="background:rgba(255,255,255,0.2);color:#fff;border:none;border-radius:8px;padding:7px 12px;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit">←</button>' +
      '<div><div style="font-size:14px;font-weight:700;color:#fff">' + escapeHTML(a.fournisseur || '') + '</div>' +
      '<div style="font-size:11px;color:rgba(255,255,255,0.6)">' + (a.ref_fournisseur || '') + '</div></div>' +
      (a.fournisseur_banipay ? '<span style="margin-left:auto;background:rgba(255,255,255,0.2);color:#fff;font-size:11px;padding:4px 8px;border-radius:6px;font-weight:600">Zelto</span>' : '') +
    '</div>' +

    '<div style="margin:16px;background:#fff;border-radius:16px;padding:16px;border:1px solid #E3DCCF">' +
      '<div style="display:flex;justify-content:space-between;margin-bottom:12px">' +
        '<div><div style="font-size:11px;color:#9C9186">Date</div><div style="font-size:13px;font-weight:600">' + (a.date_achat || '—') + '</div></div>' +
        '<div style="text-align:right"><div style="font-size:11px;color:#9C9186">Total TTC</div><div style="font-size:18px;font-weight:800;color:#B23A2E">' + fmt(a.ttc || 0) + ' MAD</div></div>' +
      '</div>' +
      '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:12px">' +
        '<div style="background:#F1EEE8;border-radius:8px;padding:8px;text-align:center"><div style="font-size:10px;color:#9C9186">HT</div><div style="font-size:12px;font-weight:700">' + fmt(a.ht || 0) + '</div></div>' +
        '<div style="background:#EDE6F0;border-radius:8px;padding:8px;text-align:center"><div style="font-size:10px;color:#7C5CA6">TVA ' + (a.tva_taux || 20) + '%</div><div style="font-size:12px;font-weight:700;color:#7C5CA6">' + fmt(a.tva || 0) + '</div></div>' +
        '<div style="background:' + (a.statut === 'payee' ? '#EEF3E4' : '#F7EFDC') + ';border-radius:8px;padding:8px;text-align:center"><div style="font-size:10px;color:' + (a.statut === 'payee' ? '#55702E' : '#B8860B') + '">' + (a.statut === 'payee' ? 'Payée' : 'En attente') + '</div></div>' +
      '</div>' +
      '<div style="font-size:12px;color:#6B5F54">Catégorie: ' + (catLabels[a.categorie] || a.categorie || '—') + '</div>' +
      (a.note ? '<div style="margin-top:8px;font-size:12px;color:#6B5F54;background:#F1EEE8;padding:8px;border-radius:8px">📝 ' + escapeHTML(a.note) + '</div>' : '') +
    '</div>' +

    ((function() {
      const lignes = typeof a.lignes === 'string' ? JSON.parse(a.lignes || '[]') : (a.lignes || []);
      if (!lignes.length) return '';
      return '<div style="margin:0 16px 16px;background:#fff;border-radius:16px;padding:16px;border:1px solid #E3DCCF">' +
        '<div style="font-size:12px;font-weight:700;color:#2A2420;margin-bottom:10px">Détail des articles/prestations</div>' +
        lignes.map(function(l) {
          return '<div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #F1EEE8">' +
            '<div><div style="font-size:12px;font-weight:600">' + escapeHTML(l.desc||'') + (l.produit_id ? ' <span style="color:#55702E;font-size:10px">📦 stock</span>' : '') + '</div>' +
            '<div style="font-size:11px;color:#9C9186">' + l.qte + ' ' + (l.unite||'u') + ' × ' + fmt(l.pu) + ' MAD</div></div>' +
            '<div style="font-size:12px;font-weight:700">' + fmt((Number(l.qte)||0)*(Number(l.pu)||0)) + ' MAD</div>' +
          '</div>';
        }).join('') +
      '</div>';
    })()) +

    (a.facture_source_id ?
      '<div style="margin:0 16px 16px">' +
        '<div style="font-size:11px;font-weight:700;color:#9C9186;text-transform:uppercase;margin-bottom:6px">🔗 Documents liés</div>' +
        '<div onclick="voirFactureOrigineAchat(\'' + a.facture_source_id + '\')" style="cursor:pointer;background:#fff;border:1px solid #E3DCCF;border-radius:10px;padding:10px 12px;display:flex;align-items:center;gap:10px">' +
          '<span style="font-size:18px">🧾</span>' +
          '<div style="flex:1"><div style="font-size:11px;color:#9C9186">Facture d\'origine</div><div style="font-size:13px;font-weight:600">Voir le document</div></div>' +
          '<span style="color:#9C9186">→</span>' +
        '</div>' +
      '</div>' : '') +

    (a.fournisseur_banipay && a.fournisseur_id ?
      '<div style="margin:0 16px 16px;background:#E9F4F3;border-radius:16px;padding:16px;border:1px solid #CFE3E2;cursor:pointer" onclick="voirFicheFournisseur(\'' + (a.fournisseur_id || '') + '\')">' +
        '<div style="font-size:12px;font-weight:700;color:#1F6F72;margin-bottom:8px">🔗 Fournisseur sur Zelto</div>' +
        '<div style="font-size:13px;font-weight:600">' + escapeHTML(a.fournisseur || '') + '</div>' +
        '<div style="font-size:11px;color:#6B5F54;margin-top:4px">Appuyez pour voir la fiche</div>' +
      '</div>' : '') +

    (a.pj_data ?
      '<div style="margin:0 16px 16px">' +
        '<div style="font-size:12px;font-weight:700;color:#2A2420;margin-bottom:8px">📎 Pièce jointe</div>' +
        (a.pj_data.startsWith('data:image') ?
          '<img src="' + a.pj_data + '" style="max-width:100%;border-radius:12px;border:1px solid #E3DCCF">' :
          '<div style="background:#F1EEE8;padding:12px;border-radius:10px;font-size:12px;color:#6B5F54">📄 ' + (a.pj_nom || 'Fichier') + '</div>') +
      '</div>' : '') +

    '<div style="padding:0 16px 20px;display:flex;gap:8px">' +
      '<button onclick="marquerAchatPaye(\'' + a.id + '\')" style="flex:1;padding:12px;background:' + (a.statut === 'payee' ? '#EAE4DA' : '#55702E') + ';color:' + (a.statut === 'payee' ? '#6B5F54' : '#fff') + ';border:none;border-radius:12px;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit">' + (a.statut === 'payee' ? '✓ Payée' : '✅ Marquer payée') + '</button>' +
      '<button onclick="supprimerAchat(\'' + a.id + '\')" style="padding:12px 16px;background:#F5E4E1;color:#B23A2E;border:none;border-radius:12px;font-size:13px;cursor:pointer;font-family:inherit">🗑️</button>' +
    '</div>';

  document.body.appendChild(overlay);
}

async function voirFicheFournisseur(fournisseurId) {
  try {
    const p = await _fetchProfilPublic(fournisseurId);
    if (!p || !p.raison) { showToast('Profil introuvable', 'error'); return; }

    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;z-index:99999;background:#fff;overflow-y:auto;font-family:inherit';

    overlay.innerHTML =
      '<div style="background:#2A2420;padding:14px 20px;display:flex;align-items:center;gap:12px">' +
        '<button onclick="this.closest(\'div[style*=fixed]\').remove()" style="background:rgba(255,255,255,0.15);color:#fff;border:none;border-radius:8px;padding:7px 12px;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit">←</button>' +
        '<div style="font-size:14px;font-weight:700;color:#fff">' + escapeHTML(p.raison || '') + '</div>' +
        '<span style="margin-left:auto;background:#1F6F72;color:#fff;font-size:10px;padding:3px 8px;border-radius:6px;font-weight:600">Zelto</span>' +
      '</div>' +

      '<div style="padding:16px">' +
        (p.logo ? '<div style="text-align:center;margin-bottom:16px"><img src="' + p.logo + '" style="max-width:120px;max-height:60px;object-fit:contain"></div>' : '') +

        '<div style="background:#F1EEE8;border-radius:16px;padding:16px;margin-bottom:12px">' +
          [['🏢 Raison sociale', p.raison], ['⚙️ Secteur', p.secteur], ['📍 Adresse', p.adresse ? p.adresse + (p.ville ? ', ' + p.ville : '') : null],
           ['📞 Tél', p.tel], ['✉️ Email', p.email], ['🔢 ICE', p.ice], ['📋 RC', p.rc], ['💼 IF', p.identifiant_fiscal]]
          .filter(function(x) { return x[1]; })
          .map(function(x) {
            return '<div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #E3DCCF;font-size:12px">' +
              '<span style="color:#6B5F54">' + x[0] + '</span>' +
              '<span style="font-weight:600;text-align:right;max-width:60%">' + escapeHTML(String(x[1])) + '</span>' +
            '</div>';
          }).join('') +
        '</div>' +

        '<button onclick="window.open(\'' + window.location.origin + window.location.pathname + '?profil=' + (p.id_unique || '') + '\',\'_blank\')" style="width:100%;padding:12px;background:#1F6F72;color:#fff;border:none;border-radius:12px;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit">🔗 Voir profil public</button>' +
      '</div>';

    document.body.appendChild(overlay);
  } catch(e) {
    showToast('Erreur: ' + e.message, 'error');
  }
}

async function marquerAchatPaye(id) {
  const a = STATE.achats.find(function(x) { return x.id === id; });
  if (!a || a.statut === 'payee') return;
  try {
    await sb.patch('factures_achat', 'id=eq.' + id + '&user_id=eq.' + sb.user.id, { statut: 'payee' });
    a.statut = 'payee';
    showToast('\u2705 Facture marquée payée', 'success');
    document.getElementById('achat-detail-overlay')?.remove();
    renderAchats();
  } catch(e) { showToast('Erreur', 'error'); }
}

async function supprimerAchat(id) {
  if (!confirm('Supprimer cette facture ?')) return;
  try {
    await sb.del('factures_achat', 'id=eq.' + id + '&user_id=eq.' + sb.user.id);
    STATE.achats = STATE.achats.filter(function(x) { return x.id !== id; });
    document.getElementById('achat-detail-overlay')?.remove();
    showToast('Supprimée', 'success');
    renderAchats();
  } catch(e) { showToast('Erreur', 'error'); }
}
