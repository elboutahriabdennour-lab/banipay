// Tafir — écran « Connexions » : réception de documents (email / appareil), exports pour logiciels de comptabilité,
// et cartes des futurs connecteurs ERP. S'ajoute au menu ☰ via le registre de modules.
// Rien n'est créé automatiquement : tout document reçu est relu et validé par l'utilisateur.
(function () {
  // Passer à true UNIQUEMENT quand l'email de réception est réellement branché (voir le guide d'activation).
  var RECEPTION_ACTIVE = false;
  var DOMAINE = 'in.tafir.fr';
  var TYPES_OK = { 'application/pdf': 1, 'image/jpeg': 1, 'image/png': 1, 'image/webp': 1 };
  var MAX_UPLOAD = 8 * 1024 * 1024;
  var _docs = [], _code = null, _interets = {}, _erreurBase = false;

  function e(s) { return escapeHTML(String(s == null ? '' : s)); }
  function complet() { return document.body.getAttribute('data-mode') === 'complet'; }
  function aleatoire(n) {
    var a = new Uint8Array(n), s = '', c = 'abcdefghijklmnopqrstuvwxyz0123456789';
    (window.crypto || window.msCrypto).getRandomValues(a);
    for (var i = 0; i < n; i++) s += c[a[i] % c.length];
    return s;
  }
  function tailleLisible(o) { return o > 1048576 ? (o / 1048576).toFixed(1) + ' Mo' : Math.max(1, Math.round(o / 1024)) + ' Ko'; }
  function dateCourte(s) { var d = new Date(s); return isNaN(d.getTime()) ? '' : d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' }); }
  function entetesStockage(extra) {
    return Object.assign({ apikey: SUPABASE_KEY, Authorization: 'Bearer ' + sb.token }, extra || {});
  }

  // ── Chargement ────────────────────────────────────────────────────────────
  async function charger() {
    _erreurBase = false;
    try {
      _docs = (await sb.get('documents_recus', 'select=*&order=created_at.desc&limit=100')) || [];
      if (!Array.isArray(_docs)) { _docs = []; _erreurBase = true; }
    } catch (x) { _docs = []; _erreurBase = true; }
    try {
      var c = await sb.get('reception_codes', 'select=code&limit=1');
      _code = Array.isArray(c) && c[0] ? c[0].code : null;
      if (!_code && RECEPTION_ACTIVE && !_erreurBase) {
        var nouveau = aleatoire(12);
        var ins = await sb.post('reception_codes', { code: nouveau });
        _code = Array.isArray(ins) && ins[0] ? ins[0].code : nouveau;
      }
    } catch (x) { _code = null; }
    try {
      var li = (await sb.get('interet_connecteurs', 'select=connecteur')) || [];
      _interets = {}; if (Array.isArray(li)) li.forEach(function (r) { _interets[r.connecteur] = true; });
    } catch (x) { _interets = {}; }
  }

  // ── Affichage ─────────────────────────────────────────────────────────────
  var ERP = [
    { id: 'odoo', nom: 'Odoo', texte: 'Factures de vente envoyées directement dans votre Odoo.' },
    { id: 'sage', nom: 'Sage', texte: 'Écritures de vente prêtes pour Sage. Version à confirmer avec votre cabinet.' },
    { id: 'sap', nom: 'SAP', texte: 'Pour les entreprises équipées de SAP Business One ou S/4HANA.' },
    { id: 'd365', nom: 'Microsoft Dynamics 365', texte: 'Pour les entreprises équipées de D365 Finance ou Business Central.' }
  ];

  function htmlDocs() {
    if (_erreurBase) return '<div class="cx-vide">La base n’est pas encore mise à jour pour cette fonction (fichier SQL 022). Les exports ci-dessous fonctionnent déjà.</div>';
    if (!_docs.length) return '<div class="cx-vide">Aucun document pour le moment. Ajoutez une facture ou un reçu (PDF ou photo).</div>';
    var lib = { nouveau: 'Nouveau', lu: 'Lu par l’IA', traite: 'Traité', ignore: 'Ignoré' };
    return _docs.map(function (d) {
      var x = d.donnees || null;
      var resume = '';
      if (x && x.lisible !== false) {
        var bouts = [];
        if (x.fournisseur) bouts.push(e(x.fournisseur));
        if (x.numero) bouts.push('n° ' + e(x.numero));
        if (x.ttc != null) bouts.push(e(Number(x.ttc).toFixed(2)) + ' ' + e(x.devise || 'MAD') + ' TTC');
        resume = '<div class="cx-resume">' + (bouts.join(' · ') || 'Lecture faite') + (x.coherent === false ? ' <b class="cx-att">montants à vérifier</b>' : '') + '</div>';
      } else if (x && x.lisible === false) resume = '<div class="cx-resume"><b class="cx-att">Document illisible ou ce n’est pas une facture</b></div>';
      var source = d.source === 'email' ? '✉️ ' + e(d.expediteur || 'email') : '📎 Ajouté ici';
      return '<div class="cx-doc" data-id="' + e(d.id) + '">' +
        '<div class="cx-doc-t"><span class="cx-nom">' + e(d.nom_fichier) + '</span><span class="cx-st cx-st-' + e(d.statut) + '">' + e(lib[d.statut] || d.statut) + '</span></div>' +
        '<div class="cx-meta">' + source + ' · ' + e(dateCourte(d.created_at)) + ' · ' + e(tailleLisible(d.taille || 0)) + (d.sujet ? ' · ' + e(d.sujet) : '') + '</div>' + resume +
        '<div class="cx-act">' +
        '<button onclick="cxOuvrir(\'' + e(d.id) + '\')">Voir</button>' +
        '<button onclick="cxLire(\'' + e(d.id) + '\')">' + (x ? 'Relire avec l’IA' : 'Lire avec l’IA') + '</button>' +
        (complet() && x && x.lisible !== false ? '<button class="cx-prim" onclick="cxCreerAchat(\'' + e(d.id) + '\')">Créer l’achat</button>' : '') +
        (d.statut !== 'traite' ? '<button onclick="cxStatut(\'' + e(d.id) + '\',\'traite\')">Marquer traité</button>' : '') +
        '<button class="cx-sup" onclick="cxSupprimer(\'' + e(d.id) + '\')" aria-label="Supprimer">🗑</button>' +
        '</div></div>';
    }).join('');
  }

  function htmlAdresse() {
    if (!RECEPTION_ACTIVE) {
      return '<div class="cx-adresse cx-off"><b>Réception par email : bientôt</b><span>Votre adresse personnelle sera affichée ici dès que le service est activé. En attendant, ajoutez vos documents depuis cet appareil.</span></div>';
    }
    if (!_code) return '<div class="cx-adresse cx-off"><b>Adresse indisponible</b><span>Rechargez la page ou contactez le support.</span></div>';
    var adr = _code + '@' + DOMAINE;
    return '<div class="cx-adresse"><b>Votre adresse de réception</b><code id="cx-adr">' + e(adr) + '</code>' +
      '<button onclick="cxCopier()">Copier l’adresse</button>' +
      '<span>Transférez-y vos factures d’achat et vos reçus. Seules les pièces jointes PDF et photos (4 Mo maximum chacune) sont gardées. Rien n’est enregistré comme facture sans votre validation.</span></div>';
  }

  function htmlErp() {
    return ERP.map(function (p) {
      var inscrit = !!_interets[p.id];
      return '<div class="cx-erp"><div><b>' + e(p.nom) + '</b><span>' + e(p.texte) + '</span></div>' +
        '<div class="cx-erp-d"><em>Bientôt</em>' +
        (inscrit ? '<button onclick="cxRetirerInteret(\'' + p.id + '\')">✓ Vous serez prévenu · Annuler</button>'
                 : '<button onclick="cxInteret(\'' + p.id + '\')">Me prévenir</button>') + '</div></div>';
    }).join('');
  }

  window.renderConnexions = async function () {
    var z = document.getElementById('cx-contenu'); if (!z) return;
    z.innerHTML = '<div class="cx-vide">Chargement…</div>';
    await charger();
    z.innerHTML =
      '<p class="rp-intro">Tout ce qui entre et sort de Tafir : documents reçus, fichiers pour votre comptable, et bientôt vos logiciels de gestion.</p>' +
      '<section class="cx-bloc"><h3>Documents reçus</h3>' + htmlAdresse() +
      '<label class="cx-ajout">＋ Ajouter des documents (PDF ou photos)<input type="file" id="cx-fichiers" multiple accept="application/pdf,image/jpeg,image/png,image/webp" onchange="cxAjouter(this)"></label>' +
      '<div id="cx-liste">' + htmlDocs() + '</div></section>' +
      '<section class="cx-bloc"><h3>Fichiers pour votre comptable ou votre logiciel</h3>' +
      '<p class="cx-note">Les brouillons sont exclus. Les montants viennent de vos factures, à faire contrôler par votre comptable avant tout usage.</p>' +
      '<div class="cx-exp">' +
      '<button onclick="ouvrirExportVentes()"><b>Excel : journal des ventes</b><span>Ventes, TVA par taux et avoirs. Lisible par tout comptable.</span></button>' +
      '<button onclick="cxExportCompta(\'compta\')"><b>Écritures comptables (CSV)</b><span>Journal de ventes en débit / crédit, à importer dans Sage ou un autre logiciel. Comptes à confirmer avec votre cabinet.</span></button>' +
      '<button onclick="cxExportCompta(\'odoo\')"><b>Factures de vente pour Odoo (CSV)</b><span>Modèle d’import Odoo. Les noms de taxes doivent correspondre à ceux de votre Odoo.</span></button>' +
      '</div></section>' +
      '<section class="cx-bloc"><h3>Connecteurs vers vos logiciels</h3>' +
      '<p class="cx-note">Pas encore disponibles. « Me prévenir » enregistre seulement votre intérêt, avec votre accord, pour savoir lesquels construire en premier.</p>' +
      htmlErp() + '</section>';
  };

  // ── Documents ─────────────────────────────────────────────────────────────
  function trouver(id) { return _docs.filter(function (d) { return d.id === id; })[0]; }
  function rafraichirListe() { var z = document.getElementById('cx-liste'); if (z) z.innerHTML = htmlDocs(); }

  window.cxCopier = function () {
    var t = (document.getElementById('cx-adr') || {}).textContent || '';
    if (navigator.clipboard) navigator.clipboard.writeText(t).then(function () { showToast('Adresse copiée', 'success'); }, function () { showToast(t, 'info'); });
    else showToast(t, 'info');
  };

  window.cxAjouter = async function (input) {
    var fichiers = Array.prototype.slice.call(input.files || []);
    input.value = '';
    if (!fichiers.length) return;
    var ok = 0, refus = [];
    for (var i = 0; i < fichiers.length; i++) {
      var f = fichiers[i];
      if (!TYPES_OK[f.type]) { refus.push(f.name + ' (format non pris en charge)'); continue; }
      if (f.size > MAX_UPLOAD) { refus.push(f.name + ' (plus de 8 Mo)'); continue; }
      var ext = f.type === 'application/pdf' ? 'pdf' : f.type === 'image/png' ? 'png' : f.type === 'image/webp' ? 'webp' : 'jpg';
      var base = String(f.name || 'document').replace(/\.[^.]*$/, '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 60) || 'document';
      var nom = base + '.' + ext;
      var chemin = sb.user.id + '/' + aleatoire(16) + '-' + nom;
      try {
        var up = await fetch(SUPABASE_URL + '/storage/v1/object/reception/' + chemin, { method: 'POST', headers: entetesStockage({ 'Content-Type': f.type, 'x-upsert': 'false' }), body: f });
        if (!up.ok) throw new Error('stockage');
        await sb.post('documents_recus', { source: 'upload', nom_fichier: nom, type_mime: f.type, taille: f.size, chemin: chemin });
        ok++;
      } catch (x) { refus.push(f.name + ' (envoi impossible)'); }
    }
    if (ok) showToast('✅ ' + ok + ' document(s) ajouté(s)', 'success');
    if (refus.length) showToast('Non ajouté : ' + refus.join(', '), 'error');
    await charger(); rafraichirListe();
  };

  async function recupererFichier(d) {
    var r = await fetch(SUPABASE_URL + '/storage/v1/object/authenticated/reception/' + d.chemin, { headers: entetesStockage() });
    if (!r.ok) throw new Error('lecture');
    return await r.blob();
  }
  function enDataUrl(blob) {
    return new Promise(function (ok, ko) { var fr = new FileReader(); fr.onload = function () { ok(fr.result); }; fr.onerror = ko; fr.readAsDataURL(blob); });
  }

  window.cxOuvrir = async function (id) {
    var d = trouver(id); if (!d) return;
    try {
      var blob = await recupererFichier(d);
      var url = URL.createObjectURL(blob);
      var w = window.open(url, '_blank');
      if (!w) { var a = document.createElement('a'); a.href = url; a.download = d.nom_fichier; document.body.appendChild(a); a.click(); a.remove(); }
      setTimeout(function () { URL.revokeObjectURL(url); }, 60000);
      if (d.statut === 'nouveau') { sb.patch('documents_recus', 'id=eq.' + d.id, { statut: 'lu' }).catch(function () {}); }
    } catch (x) { showToast('Ouverture impossible', 'error'); }
  };

  window.cxLire = async function (id) {
    var d = trouver(id); if (!d) return;
    if (typeof _iaDocConsentement === 'function' && !_iaDocConsentement()) return;
    showToast('🔍 Lecture par IA en cours…', 'info');
    try {
      var blob = await recupererFichier(d);
      var url = await enDataUrl(blob);
      if (url.indexOf('data:image/') === 0 && typeof _reduireImage === 'function') url = await _reduireImage(url, 1800);
      var r = await fetch('/api/lire-document', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + sb.token }, body: JSON.stringify({ fichier: url }) });
      var res = await r.json().catch(function () { return {}; });
      if (!r.ok) { showToast(res.erreur || 'Lecture par IA impossible', 'error'); return; }
      await sb.patch('documents_recus', 'id=eq.' + d.id, { donnees: res, statut: d.statut === 'traite' ? 'traite' : 'lu' });
      await charger(); rafraichirListe();
      showToast(res.lisible === false ? 'Document illisible' : '✅ Lecture terminée, vérifiez les montants', res.lisible === false ? 'error' : 'success');
    } catch (x) { showToast('Lecture impossible', 'error'); }
  };

  window.cxCreerAchat = function (id) {
    var d = trouver(id); if (!d || !d.donnees) return;
    if (typeof _allerCreerAchat !== 'function') return;
    _allerCreerAchat();
    setTimeout(function () { try { if (typeof _appliquerLectureIA === 'function') _appliquerLectureIA(d.donnees); showToast('Achat pré-rempli : vérifiez puis enregistrez', 'info'); } catch (x) {} }, 350);
  };

  window.cxStatut = async function (id, statut) {
    try { await sb.patch('documents_recus', 'id=eq.' + id, { statut: statut }); await charger(); rafraichirListe(); } catch (x) { showToast('Modification impossible', 'error'); }
  };

  window.cxSupprimer = async function (id) {
    var d = trouver(id); if (!d) return;
    if (!confirm('Supprimer ce document définitivement ?')) return;
    try {
      await fetch(SUPABASE_URL + '/storage/v1/object/reception/' + d.chemin, { method: 'DELETE', headers: entetesStockage() });
      await sb.del('documents_recus', 'id=eq.' + id);
      await charger(); rafraichirListe();
    } catch (x) { showToast('Suppression impossible', 'error'); }
  };

  // ── Intérêt pour les connecteurs (avec consentement) ─────────────────────
  window.cxInteret = function (id) {
    var p = ERP.filter(function (x) { return x.id === id; })[0]; if (!p) return;
    var ancien = document.getElementById('cx-ov'); if (ancien) ancien.remove();
    var ov = document.createElement('div'); ov.id = 'cx-ov'; ov.className = 'cx-ov';
    ov.innerHTML = '<div class="cx-modal"><h4>Me prévenir : ' + e(p.nom) + '</h4>' +
      '<label class="cx-case"><input type="checkbox" id="cx-ok"> J’accepte d’être prévenu(e) par email, à l’adresse de mon compte, quand ce connecteur existera. Je peux me retirer à tout moment ici.</label>' +
      '<div class="cx-bts"><button onclick="document.getElementById(\'cx-ov\').remove()">Annuler</button><button class="cx-prim" onclick="cxConfirmerInteret(\'' + id + '\')">Valider</button></div></div>';
    ov.addEventListener('click', function (ev) { if (ev.target === ov) ov.remove(); });
    document.body.appendChild(ov);
  };
  window.cxConfirmerInteret = async function (id) {
    if (!(document.getElementById('cx-ok') || {}).checked) { showToast('Cochez la case pour valider', 'error'); return; }
    try { await sb.post('interet_connecteurs', { connecteur: id, consentement: true }); _interets[id] = true; }
    catch (x) { if (!/duplicate|unique/i.test(String(x && x.message))) { showToast('Enregistrement impossible (base à mettre à jour ?)', 'error'); return; } _interets[id] = true; }
    var ov = document.getElementById('cx-ov'); if (ov) ov.remove();
    showToast('✅ Noté. Vous serez prévenu(e).', 'success');
    var z = document.querySelector('#cx-contenu'); if (z) renderConnexions();
  };
  window.cxRetirerInteret = async function (id) {
    try { await sb.del('interet_connecteurs', 'connecteur=eq.' + id); delete _interets[id]; renderConnexions(); } catch (x) { showToast('Modification impossible', 'error'); }
  };

  // ── Exports comptables ───────────────────────────────────────────────────
  function csv(lignes, sep) {
    return '﻿' + lignes.map(function (r) { return r.map(function (v) { return '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"'; }).join(sep || ';'); }).join('\r\n');
  }
  function telecharger(contenu, nom) {
    var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([contenu], { type: 'text/csv;charset=utf-8' }));
    a.download = nom; document.body.appendChild(a); a.click(); document.body.removeChild(a);
  }
  function virg(n) { return (Math.round((Number(n) || 0) * 100) / 100).toFixed(2).replace('.', ','); }

  window.cxExportCompta = function (format) {
    var ancien = document.getElementById('cx-ov'); if (ancien) ancien.remove();
    var ov = document.createElement('div'); ov.id = 'cx-ov'; ov.className = 'cx-ov';
    var compta = format === 'compta';
    ov.innerHTML = '<div class="cx-modal"><h4>' + (compta ? 'Écritures comptables des ventes' : 'Factures de vente pour Odoo') + '</h4>' +
      '<label class="f-lbl" for="cx-per">Période</label>' +
      '<select id="cx-per" class="f-inp"><option value="mois-1">Mois précédent</option><option value="mois">Ce mois</option><option value="trim-1">Trimestre précédent</option><option value="trim">Trimestre en cours</option><option value="annee">Année en cours</option></select>' +
      (compta ? '<div class="cx-comptes"><label>Journal<input id="cx-j" class="f-inp" value="VE" maxlength="6"></label><label>Compte clients<input id="cx-c" class="f-inp" value="3421" maxlength="12"></label><label>Compte ventes<input id="cx-v" class="f-inp" value="7111" maxlength="12"></label><label>Compte TVA facturée<input id="cx-t" class="f-inp" value="4455" maxlength="12"></label></div>' +
        '<p class="cx-note">Numéros proposés par défaut selon le plan comptable marocain courant. Faites-les confirmer par votre comptable : ils varient selon l’activité et le cabinet.</p>'
        : '<p class="cx-note">Dans Odoo : Comptabilité, Clients, Factures, Favoris, Importer des enregistrements. Si vos taxes portent un autre nom que « 20% », remplacez-les dans le fichier avant l’import.</p>') +
      '<div class="cx-bts"><button onclick="document.getElementById(\'cx-ov\').remove()">Annuler</button><button class="cx-prim" onclick="cxLancerExport(\'' + format + '\')">Télécharger</button></div></div>';
    ov.addEventListener('click', function (ev) { if (ev.target === ov) ov.remove(); });
    document.body.appendChild(ov);
  };

  window.cxLancerExport = function (format) {
    var per = _evPeriode((document.getElementById('cx-per') || {}).value || 'mois-1');
    var profil = STATE.profil || {};
    var factures = (STATE.factures || []).filter(function (f) { return f.statut !== 'brouillon' && f.statut !== 'annulee' && f.date_emission && f.date_emission >= per.du && f.date_emission <= per.au; })
      .sort(function (a, b) { return (a.date_emission + a.ref) < (b.date_emission + b.ref) ? -1 : 1; });
    var avoirs = format === 'compta' ? (STATE.avoirs || []).filter(function (a) { return a.date_emission && a.date_emission >= per.du && a.date_emission <= per.au; }) : [];
    var devise = factures.filter(function (f) { return f.devise && f.devise !== 'MAD'; }).length;
    if (format === 'compta') { factures = factures.filter(function (f) { return !f.devise || f.devise === 'MAD'; }); }
    if (!factures.length && !avoirs.length) { showToast('Aucune facture sur cette période', 'error'); return; }
    var nomEnt = String(profil.raison || 'entreprise').replace(/[^\w\-]+/g, '_').slice(0, 30);

    if (format === 'compta') {
      var J = (document.getElementById('cx-j') || {}).value || 'VE', C = (document.getElementById('cx-c') || {}).value || '3421',
          V = (document.getElementById('cx-v') || {}).value || '7111', T = (document.getElementById('cx-t') || {}).value || '4455';
      var L = [['Journal', 'Date', 'Pièce', 'Compte', 'Libellé', 'Débit', 'Crédit']];
      var totD = 0, totC = 0;
      var ecrire = function (jour, piece, client, ht, tva, sens) {  // sens +1 facture, -1 avoir
        ht = _evR(ht); tva = _evR(tva); var ttc = _evR(ht + tva);
        var d1 = sens > 0 ? ttc : 0, c1 = sens > 0 ? 0 : ttc, d2 = sens > 0 ? 0 : ht, c2 = sens > 0 ? ht : 0, d3 = sens > 0 ? 0 : tva, c3 = sens > 0 ? tva : 0;
        var lib = (sens > 0 ? 'Facture ' : 'Avoir ') + piece + ' ' + (client || '');
        var date = _evFR(jour);
        L.push([J, date, piece, C, lib, virg(d1), virg(c1)]);
        L.push([J, date, piece, V, lib, virg(d2), virg(c2)]);
        if (tva) L.push([J, date, piece, T, lib, virg(d3), virg(c3)]);
        totD += d1 + d2 + d3; totC += c1 + c2 + c3;
      };
      factures.forEach(function (f) { ecrire(f.date_emission, f.ref || '', f.client, f.ht, f.tva, 1); });
      avoirs.forEach(function (a) { ecrire(a.date_emission, a.ref || '', a.client, a.ht, a.tva, -1); });
      L.push(['TOTAL', '', '', '', '', virg(totD), virg(totC)]);
      telecharger(csv(L), 'ecritures_ventes_' + nomEnt + '_' + per.du + '_' + per.au + '.csv');
      var ov = document.getElementById('cx-ov'); if (ov) ov.remove();
      showToast('✅ ' + factures.length + ' facture(s), ' + avoirs.length + ' avoir(s)' + (devise ? ' · ' + devise + ' en devise étrangère exclue(s)' : '') + (Math.abs(totD - totC) > 0.01 ? ' · ⚠ écart débit/crédit' : ''), Math.abs(totD - totC) > 0.01 ? 'error' : 'success');
      return;
    }

    // Odoo : une ligne par ligne de facture, les informations d'en-tête seulement sur la première.
    var O = [['move_type', 'partner_id', 'ref', 'invoice_date', 'invoice_date_due', 'currency_id', 'invoice_line_ids/name', 'invoice_line_ids/quantity', 'invoice_line_ids/price_unit', 'invoice_line_ids/tax_ids']];
    factures.forEach(function (f) {
      var lg = lignesEnTableau(f.lignes);
      if (!lg.length) lg = [{ desc: 'Facture ' + (f.ref || ''), qte: 1, pu: Number(f.ht) || 0, tva: (Number(f.ht) > 0 ? Math.round((Number(f.tva) || 0) / Number(f.ht) * 100) : 0) }];
      lg.forEach(function (l, i) {
        var taux = Number(l.tva) >= 0 ? Number(l.tva) : 20;
        var ent = i === 0 ? ['out_invoice', f.client || '', f.ref || '', f.date_emission || '', f.echeance || '', f.devise || 'MAD'] : ['', '', '', '', '', ''];
        O.push(ent.concat([l.desc || l.description || 'Article', Number(l.qte) || 0, Number(l.pu) || 0, taux + '%']));
      });
    });
    var nf = factures.length;
    telecharger(csv(O, ','), 'odoo_factures_' + nomEnt + '_' + per.du + '_' + per.au + '.csv');
    var ov2 = document.getElementById('cx-ov'); if (ov2) ov2.remove();
    showToast('✅ ' + nf + ' facture(s) pour Odoo', 'success');
  };

  // ── Branchement au menu ───────────────────────────────────────────────────
  if (typeof enregistrerModule === 'function') {
    enregistrerModule({ id: 'connexions', groupe: 'Gestion', libelle: 'Connexions', icone: 'link', ecran: 'connexions' });
  }
})();
