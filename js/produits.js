// ZELTO — produits.js

function renderProduits() {
  const cnt = el('produits-count');
  if(cnt) cnt.textContent = STATE.produits.length;
  // NOUVEAU: carte valeur totale du stock (visible seulement si au moins un
  // article a un stock suivi)
  const carteStock = el('valeur-stock-card');
  if (carteStock) {
    const suivis = (STATE.produits || []).filter(function(p) { return p.stock !== null && p.stock !== undefined; });
    if (suivis.length && typeof calculerValeurStockTotale === 'function') {
      carteStock.style.display = 'flex';
      setEl('valeur-stock-montant', fmt(calculerValeurStockTotale()) + ' MAD');
    } else {
      carteStock.style.display = 'none';
    }
  }
  const list = el('produits-list');
  if (!list) return;
  const q = (el('search-produit-inp')?.value||'').toLowerCase();
  const cat = el('filtre-categorie')?.value||'tous';
  let data = STATE.produits.filter(p =>
    (!q || p.nom.toLowerCase().includes(q) || (p.description||'').toLowerCase().includes(q)) &&
    (cat==='tous' || p.categorie===cat)
  );
  if (!data.length) {
    list.innerHTML = `<div class="empty"><div class="empty-ico">📦</div><div class="empty-title">Aucun article</div></div>`;
    return;
  }
  const catIcons = {service:'⚙️',produit:'📦','main-oeuvre':'👷',transport:'🚛',materiaux:'🧱',autre:'📋'};
  list.innerHTML = data.map(p => {
    const suiviStock = p.stock !== null && p.stock !== undefined;
    const enAlerte = suiviStock && p.seuil_alerte != null && Number(p.stock) <= Number(p.seuil_alerte);
    const rupture = suiviStock && Number(p.stock) <= 0;
    const stockColor = rupture ? '#B23A2E' : enAlerte ? '#B8860B' : '#6E8F4E';
    return `
    <div class="card">
      <div class="card-ico" style="background:#E9F4F3">${catIcons[p.categorie]||'📦'}</div>
      <div class="card-body">
        <div class="card-name">${p.nom}</div>
        <div class="card-ref">${p.unite||'u'} · ${p.description||''}</div>
        ${enAlerte && !rupture ? '<div style="font-size:10px;color:#B8860B;font-weight:600;margin-top:2px">⚠️ Stock bas (seuil: '+p.seuil_alerte+')</div>' : ''}
      </div>
      <div class="card-end">
        <div class="card-amt">${fmt(p.prix_ht)} MAD HT</div>
        ${suiviStock ? `<div style="font-size:10px;color:${stockColor};font-weight:600">${p.stock} en stock</div>` : ''}
        <div style="display:flex;gap:4px;margin-top:2px">
          <button onclick="modifierProduit(${p.id})" style="font-size:11px;background:#E9F4F3;color:#C9971F;border:none;border-radius:4px;padding:2px 6px;cursor:pointer">✏️</button>
          ${suiviStock ? `<button onclick="ouvrirAjustementStock(${p.id})" style="font-size:11px;background:#EEF3E4;color:#6E8F4E;border:none;border-radius:4px;padding:2px 6px;cursor:pointer">⚖️</button>
          <button onclick="ouvrirHistoriqueStock(${p.id})" style="font-size:11px;background:#F1EEE8;color:#6B5F54;border:none;border-radius:4px;padding:2px 6px;cursor:pointer">📦</button>` : ''}
          <button onclick="supprimerProduit(${p.id})" style="font-size:11px;background:#F5E4E1;color:#B23A2E;border:none;border-radius:4px;padding:2px 6px;cursor:pointer">🗑️</button>
        </div>
      </div>
    </div>`;
  }).join('');
}

function initNouveauProduit() {
  ['p-nom','p-desc','p-ref','p-prix','p-prix-ttc','p-cout','p-stock','p-seuil'].forEach(id=>{const e=el(id);if(e)e.value='';});
  el('p-unite')&&(el('p-unite').value='u');
  el('p-categorie')&&(el('p-categorie').value='service');
  el('p-tva')&&(el('p-tva').value='20');
}

function calcPrixTTC() {
  const ht = parseFloat(el('p-prix')?.value)||0;
  const tva = parseFloat(el('p-tva')?.value)||20;
  if(el('p-prix-ttc')) el('p-prix-ttc').value = (ht*(1+tva/100)).toFixed(2);
  if(el('p-marge')&&el('p-cout')) {
    const cout = parseFloat(el('p-cout')?.value)||0;
    if (cout > 0) {
      const margeVal = ht > 0 ? Math.round((ht - cout) / ht * 100) : 0;
      el('p-marge').textContent = 'Marge: ' + margeVal + '%';
    }
  }
}

async function sauvegarderProduit() {
  const nom = el('p-nom')?.value.trim();
  if(!nom){showToast("Entrez le nom de l'article",'error');return;}
  if (typeof verifierLimiteProduits === 'function' && !verifierLimiteProduits()) return;
  showToast('⏳...');
  try {
    const r = await sb.post('produits',{
      user_id:sb.user.id, nom,
      description:el('p-desc')?.value.trim(),
      reference:el('p-ref')?.value.trim(),
      prix_ht:parseFloat(el('p-prix')?.value)||0,
      tva_rate:parseFloat(el('p-tva')?.value)||20,
      cout_achat:parseFloat(el('p-cout')?.value)||null,
      stock:el('p-stock')?.value!==''?parseInt(el('p-stock')?.value):null,
      seuil_alerte:el('p-seuil')?.value!==''?parseInt(el('p-seuil')?.value):null,
      unite:el('p-unite')?.value,
      categorie:el('p-categorie')?.value,
    });
    if (r && r.length > 0) { STATE.produits.push(r[0]); } else { throw new Error("Erreur serveur"); }
    STATE.produits.sort((a,b)=>a.nom.localeCompare(b.nom));
    showToast('✅ Article ajouté !','success');
    logAudit('produit', r[0].id, 'creation', nom);
    setTimeout(()=>goScreen('produits'),600);
  } catch(e){showToast('❌ '+e.message,'error');}
}

async function supprimerProduit(id) {
  if(!confirm('Supprimer cet article ?')) return;
  const p = STATE.produits.find(x => x.id === id);
  await sb.del('produits',`id=eq.${id}&user_id=eq.${sb.user.id}`);
  STATE.produits = STATE.produits.filter(p=>p.id!==id);
  renderProduits();
  showToast('Supprimé');
  logAudit('produit', id, 'suppression', p?.nom || '');
}

// ============================================================
// PROFIL
// ============================================================

function ouvrirModifProduit(id) {
  const p = STATE.produits.find(x => x.id === id);
  if (!p) return;
  STATE.currentProduit = p;
  el('mp-nom') && (el('mp-nom').value = p.nom || '');
  el('mp-ref') && (el('mp-ref').value = p.reference || '');
  el('mp-desc') && (el('mp-desc').value = p.description || '');
  el('mp-prix') && (el('mp-prix').value = p.prix_ht || '');
  el('mp-tva') && (el('mp-tva').value = p.tva_rate || 20);
  el('mp-cout') && (el('mp-cout').value = p.cout_achat || '');
  el('mp-stock') && (el('mp-stock').value = p.stock !== null ? p.stock : '');
  el('mp-seuil') && (el('mp-seuil').value = p.seuil_alerte !== null && p.seuil_alerte !== undefined ? p.seuil_alerte : '');
  el('mp-unite') && (el('mp-unite').value = p.unite || 'u');
  el('mp-categorie') && (el('mp-categorie').value = p.categorie || 'service');
  calcPrixTTCModif();
  goScreen('modifier-produit');
}

function calcPrixTTCModif() {
  const ht = parseFloat(el('mp-prix')?.value) || 0;
  const tva = parseFloat(el('mp-tva')?.value) || 20;
  if (el('mp-prix-ttc')) el('mp-prix-ttc').value = (ht * (1 + tva/100)).toFixed(2);
  const cout = parseFloat(el('mp-cout')?.value) || 0;
  const margeEl = el('mp-marge');
  if (margeEl && ht > 0 && cout > 0) {
    margeEl.textContent = 'Marge: ' + Math.round((ht-cout)/ht*100) + '%';
  }
}

async function sauvegarderModifProduit() {
  const p = STATE.currentProduit;
  if (!p) return;
  const nom = el('mp-nom')?.value.trim();
  if (!nom) { showToast('Le nom est obligatoire', 'error'); return; }
  const data = {
    nom,
    reference: el('mp-ref')?.value.trim(),
    description: el('mp-desc')?.value.trim(),
    prix_ht: parseFloat(el('mp-prix')?.value) || 0,
    tva_rate: parseFloat(el('mp-tva')?.value) || 20,
    cout_achat: parseFloat(el('mp-cout')?.value) || null,
    stock: el('mp-stock')?.value !== '' ? parseInt(el('mp-stock')?.value) : null,
    seuil_alerte: el('mp-seuil')?.value !== '' ? parseInt(el('mp-seuil')?.value) : null,
    unite: el('mp-unite')?.value,
    categorie: el('mp-categorie')?.value,
  };
  showToast('⏳ Mise à jour...');
  try {
    await sb.patch('produits', `id=eq.${p.id}&user_id=eq.${sb.user.id}`, data);
    Object.assign(p, data);
    renderProduits();
    showToast('✅ Article mis à jour !', 'success');
    logAudit('produit', p.id, 'modification', nom);
    goScreen('produits');
  } catch(e) { showToast('❌ ' + e.message, 'error'); }
}

function modifierProduit(id) { ouvrirModifProduit(id); }

function archiverProduit(id) {
  const p = STATE.produits.find(x => x.id === id);
  if (!p || !confirm('Archiver cet article ?')) return;
  sb.patch('produits', `id=eq.${id}&user_id=eq.${sb.user.id}`, { archive: true })
    .then(() => {
      STATE.produits = STATE.produits.filter(x => x.id !== id);
      renderProduits();
      showToast('Article archivé');
    });
}

// ============================================================
// IMPORT / EXPORT CSV — CATALOGUE PRODUITS
// ============================================================

function telechargerTemplateProduitsCSV() {
  telechargerCSV(
    'modele_produits.csv',
    ['nom', 'description', 'reference', 'prix_ht', 'tva_rate', 'cout_achat', 'stock', 'unite', 'categorie'],
    [['Prestation exemple', 'Détail optionnel', 'REF-001', '500.00', '20', '', '', 'u', 'service']]
  );
}

function exporterProduitsCSV() {
  if (!STATE.produits.length) { showToast('Aucun article à exporter', 'error'); return; }
  const headers = ['nom', 'description', 'reference', 'prix_ht', 'tva_rate', 'cout_achat', 'stock', 'unite', 'categorie'];
  const rows = STATE.produits.map(function(p) {
    return [p.nom || '', p.description || '', p.reference || '', p.prix_ht || 0, p.tva_rate || 20, p.cout_achat || '', p.stock != null ? p.stock : '', p.unite || 'u', p.categorie || 'service'];
  });
  telechargerCSV('banipay_catalogue_' + today() + '.csv', headers, rows);
  showToast('✅ Export catalogue téléchargé !', 'success');
}

async function importerProduitsCSV(event) {
  const file = event.target.files[0];
  if (!file) return;
  event.target.value = '';

  showToast('⏳ Lecture du fichier...');
  try {
    const text = await lireFichierTexte(file);
    const rows = parseCSV(text);
    if (!rows.length) { showToast('Fichier CSV vide ou illisible', 'error'); return; }

    const getVal = function(r, keys) {
      for (const k of keys) { if (r[k] !== undefined && r[k] !== '') return r[k]; }
      return '';
    };
    const catValides = ['service', 'produit', 'main-oeuvre', 'transport', 'materiaux', 'autre'];

    let importes = 0, ignores = 0, bloquesParLimite = 0;
    showToast('⏳ Import de ' + rows.length + ' ligne(s)...');

    for (const r of rows) {
      const nom = getVal(r, ['nom', 'name', 'designation', 'désignation']);
      if (!nom) { ignores++; continue; }

      const existe = STATE.produits.find(function(p) { return p.nom.toLowerCase() === nom.toLowerCase(); });
      if (existe) { ignores++; continue; }

      if (STATE.limiteProduits != null && (STATE.produits || []).length >= STATE.limiteProduits) {
        bloquesParLimite += (rows.length - importes - ignores - bloquesParLimite);
        break;
      }

      let categorie = (getVal(r, ['categorie', 'catégorie', 'category']) || 'service').toLowerCase();
      if (!catValides.includes(categorie)) categorie = 'autre';

      const body = {
        user_id: sb.user.id,
        nom: nom,
        description: getVal(r, ['description', 'desc']),
        reference: getVal(r, ['reference', 'référence', 'ref']),
        prix_ht: parseFloat(getVal(r, ['prix_ht', 'prix', 'price'])) || 0,
        tva_rate: parseFloat(getVal(r, ['tva_rate', 'tva'])) || 20,
        cout_achat: parseFloat(getVal(r, ['cout_achat', 'coût_achat', 'cout'])) || null,
        stock: getVal(r, ['stock']) !== '' ? parseInt(getVal(r, ['stock'])) : null,
        unite: getVal(r, ['unite', 'unité', 'unit']) || 'u',
        categorie: categorie,
      };

      try {
        const result = await sb.post('produits', body);
        if (result && result.length) { STATE.produits.push(result[0]); importes++; }
      } catch(e2) { ignores++; }
    }

    STATE.produits.sort(function(a, b) { return a.nom.localeCompare(b.nom); });
    renderProduits();
    showToast('✅ ' + importes + ' article(s) importé(s)' + (ignores ? ', ' + ignores + ' ignoré(s)' : '') + (bloquesParLimite ? ', ' + bloquesParLimite + ' bloqué(s) par la limite de votre forfait' : ''), bloquesParLimite ? 'error' : 'success');
    logAudit('produit', null, 'creation', importes + ' articles importés via CSV');
  } catch(e) {
    showToast('Erreur import: ' + e.message, 'error');
  }
}

// ============================================================
// ENVOI UNIFIÉ — WhatsApp / Email / Lien / Zelto
// ============================================================

window._envoiCourant = null;

function ouvrirModalEnvoi(type, id) {
  const doc = type === 'facture'
    ? STATE.factures.find(x => x.id === id)
    : type === 'bon-commande'
    ? (STATE.bonsCommande || []).find(x => x.id === id)
    : STATE.devis.find(x => x.id === id);
  if (!doc) return;

  window._envoiCourant = { type, id, doc };
  const libelleType = type === 'facture' ? 'la facture' : type === 'bon-commande' ? 'le bon de commande' : 'le devis';
  setEl('me-titre', 'Envoyer ' + libelleType + ' ' + doc.ref);
  const picker = el('me-banipay-picker');
  if (picker) { picker.style.display = 'none'; picker.innerHTML = ''; }
  el('modal-envoyer')?.classList.add('active');
}

function envoyerVia(canal) {
  const ctx = window._envoiCourant;
  if (!ctx) return;
  const { type, id, doc } = ctx;
  const p = STATE.profil || {};
  const isBC = type === 'bon-commande';
  const docUrl = window.location.origin + window.location.pathname + (isBC ? '?bc=' + id : '?doc=' + id + (type === 'devis' ? '&type=devis' : ''));
  const libelleDest = isBC ? (doc.fournisseur || '') : (doc.client || '');
  const libelleDoc = type === 'facture' ? 'facture' : isBC ? 'bon de commande' : 'devis';

  if (canal === 'whatsapp') {
    const msg = encodeURIComponent(
      'Bonjour ' + libelleDest + ',\n\n' +
      'Veuillez trouver notre ' + libelleDoc + ' *' + doc.ref + '*.\n\n' +
      (isBC ? '' : '• Montant TTC : *' + fmt(doc.ttc) + ' ' + (doc.devise||'MAD') + '*\n\n') +
      '📎 Consulter et répondre :\n' + docUrl + '\n\n' +
      'Cordialement,\n' + (p.raison||'') + (p.tel ? '\n📞 ' + p.tel : '')
    );
    window.open('https://wa.me/?text=' + msg, '_blank');
    if (isBC && typeof envoyerBonCommande === 'function') _marquerBCEnvoye(id);
    closeAllModals();

  } else if (canal === 'email') {
    const sujet = encodeURIComponent((type === 'facture' ? 'Facture ' : isBC ? 'Bon de commande ' : 'Devis ') + doc.ref);
    const corps = encodeURIComponent(
      'Bonjour ' + libelleDest + ',\n\n' +
      'Veuillez trouver ci-joint notre ' + libelleDoc + ' ' + doc.ref + '.\n' +
      (isBC ? '' : 'Montant TTC : ' + fmt(doc.ttc) + ' ' + (doc.devise||'MAD') + '\n\n') +
      'Consulter et répondre : ' + docUrl + '\n\n' +
      'Cordialement,\n' + (p.raison||'')
    );
    window.location.href = 'mailto:' + (doc.client_email || '') + '?subject=' + sujet + '&body=' + corps;
    if (isBC) _marquerBCEnvoye(id);
    closeAllModals();

  } else if (canal === 'lien') {
    navigator.clipboard?.writeText(docUrl).then(() => showToast('✅ Lien copié !', 'success'));
    if (isBC) _marquerBCEnvoye(id);
    closeAllModals();

  } else if (canal === 'banipay') {
    if (isBC) {
      // NOUVEAU: le BC connaît déjà son fournisseur_id s'il a été choisi via
      // le sélecteur "Fournisseur sur Zelto" — pas besoin de repicker, on
      // notifie directement.
      if (doc.fournisseur_id) {
        _marquerBCEnvoye(id, true);
        closeAllModals();
      } else {
        showToast('Aucun compte Zelto lié à ce fournisseur — liez-le via "Fournisseur sur Zelto" en modifiant le bon de commande', 'error');
      }
    } else {
      afficherPickerClientsZelto();
    }
  }
}

// Marque le BC comme envoyé et notifie le fournisseur s'il a un compte Zelto
async function _marquerBCEnvoye(id, notifierMaintenant) {
  if (typeof envoyerBonCommande !== 'function') return;
  // Réutilise la logique déjà écrite (statut + notification RPC) sans
  // dupliquer le partage, puisqu'on vient de le faire nous-mêmes ci-dessus.
  try {
    await sb.patch('bons_commande', 'id=eq.' + id + '&user_id=eq.' + sb.user.id, { statut: 'envoye' });
    const bc = (STATE.bonsCommande || []).find(function(x) { return x.id === id; });
    if (bc) bc.statut = 'envoye';
    if (bc && bc.fournisseur_id) {
      await fetch(SUPABASE_URL + '/rest/v1/rpc/notifier_bc_recu', {
        method: 'POST',
        headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + sb.token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ p_bc_id: id })
      });
      if (notifierMaintenant) showToast('✅ Notification envoyée au fournisseur', 'success');
    }
  } catch(e) {}
}

function afficherPickerClientsZelto() {
  const picker = el('me-banipay-picker');
  if (!picker) return;
  const clientsBP = (STATE.clients || []).filter(c => c.reference_id);
  picker.style.display = 'block';
  if (!clientsBP.length) {
    picker.innerHTML = '<div style="font-size:12px;color:#9C9186;padding:10px;text-align:center">Aucun client avec compte Zelto lié. Importez-le via son lien de profil dans la fiche client.</div>';
    return;
  }
  picker.innerHTML = clientsBP.map(c =>
    '<div class="card" style="cursor:pointer" onclick="envoyerVersCompteZelto(\'' + c.reference_id + '\',\'' + escapeHTML(c.nom||'').replace(/'/g,"\\'") + '\',\'' + (c.email||'').replace(/'/g,"\\'") + '\')">' +
      '<div class="card-ico" style="background:#FBF0DA">🅿️</div>' +
      '<div class="card-body"><div class="card-name">' + escapeHTML(c.nom||'') + '</div><div class="card-ref">' + (c.email||'') + '</div></div>' +
    '</div>'
  ).join('');
}

async function envoyerVersCompteZelto(destinataireId, destinataireNom, destinataireEmail) {
  const ctx = window._envoiCourant;
  if (!ctx) return;
  const { type, id, doc } = ctx;
  const p = STATE.profil || {};

  try {
    // FIX: utilise la fonction RPC SECURITY DEFINER (contourne complètement
    // la RLS, y compris pour le rôle anon) au lieu d'un accès direct à la
    // table — approche identique à celle qui a fini par résoudre le
    // lettrage/TVA.
    const resp = await fetch(SUPABASE_URL + '/rest/v1/rpc/envoyer_notification', {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        p_user_id: destinataireId,
        p_destinataire_email: destinataireEmail || '',
        p_type: type === 'facture' ? 'facture_recue' : 'devis_recu',
        p_titre: (type === 'facture' ? 'Nouvelle facture' : 'Nouveau devis') + ' — ' + (p.raison || sb.user?.email),
        p_corps: (p.raison || sb.user?.email) + ' vous a envoyé ' + (type === 'facture' ? 'la facture' : 'le devis') + ' ' + doc.ref + ' (' + fmt(doc.ttc) + ' ' + (doc.devise||'MAD') + ').',
        p_meta: JSON.stringify({ doc_type: type, doc_id: id, emetteur_id: sb.user?.id, emetteur_raison: p.raison || '' })
      })
    });
    if (!resp.ok) {
      const errText = await resp.text().catch(function() { return ''; });
      console.error('envoyerVersCompteZelto: échec envoi notification', resp.status, errText);
      afficherDiagnostic('Échec envoi notification Zelto', [
        'Destinataire : ' + destinataireNom + ' (' + destinataireEmail + ')',
        'HTTP ' + resp.status,
        errText || '(pas de détail renvoyé par le serveur)'
      ]);
      return;
    }
    showToast('✅ Envoyé à ' + destinataireNom + ' sur Zelto !', 'success');
    closeAllModals();
  } catch(e) {
    afficherDiagnostic('Erreur envoi notification Zelto', ['Exception JS : ' + e.message]);
  }
}
