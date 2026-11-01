// Tafir — rapports personnalisés : l'utilisateur choisit quoi calculer (source, mesure, regroupement, filtres),
// voit le résultat (tableau + barres), peut le détailler, l'exporter et l'enregistrer.
// Lecture seule : un rapport ne modifie jamais les données. Calcul sur l'appareil, à partir des données déjà chargées.
(function () {
  var SOURCES = { factures: 'Factures de vente', devis: 'Devis', achats: 'Achats (fournisseurs)', avoirs: 'Avoirs', paiements: 'Paiements reçus' };
  var MESURES = { somme_ttc: 'Montant TTC (somme)', somme_ht: 'Montant HT (somme)', somme_tva: 'TVA (somme)', nombre: 'Nombre de documents', moyenne_ttc: 'Montant TTC moyen', reste: 'Reste à encaisser / à payer', delai_accorde: 'Délai accordé (jours, moyenne)', delai_paiement: 'Délai de paiement réel (jours, moyenne)' };
  var GROUPES = { aucun: 'Aucun (un seul total)', tiers: 'Client / Fournisseur', mois: 'Mois', trimestre: 'Trimestre', annee: 'Année', statut: 'Statut', produit: 'Produit / Article', taux_tva: 'Taux de TVA' };
  var PERIODES = { tout: 'Tout', mois: 'Ce mois', mois_dernier: 'Mois dernier', trimestre: 'Ce trimestre', annee: 'Cette année', '12mois': '12 derniers mois', perso: 'Dates précises' };
  var TRIS = { valeur_desc: 'Du plus grand au plus petit', valeur_asc: 'Du plus petit au plus grand', libelle: 'Par ordre alphabétique / chronologique' };
  var STATUTS = { '': 'Tous', payee: 'Payée', attente: 'En attente', envoyee: 'Envoyée', retard: 'En retard (statut)', retard_reel: 'En retard (selon l’échéance)', impayee: 'Non soldée', brouillon: 'Brouillon', annulee: 'Annulée' };
  var MODELES = [
    { nom: 'CA par client', c: { source: 'factures', mesure: 'somme_ttc', groupe: 'tiers', periode: 'annee', tri: 'valeur_desc', limite: 10 } },
    { nom: 'CA par mois', c: { source: 'factures', mesure: 'somme_ttc', groupe: 'mois', periode: '12mois', tri: 'libelle' } },
    { nom: 'Qui me doit de l’argent ?', c: { source: 'factures', mesure: 'reste', groupe: 'tiers', periode: 'tout', statut: 'impayee', tri: 'valeur_desc' } },
    { nom: 'Retards par client', c: { source: 'factures', mesure: 'reste', groupe: 'tiers', periode: 'tout', statut: 'retard_reel', tri: 'valeur_desc' } },
    { nom: 'Délai de paiement par client', c: { source: 'factures', mesure: 'delai_paiement', groupe: 'tiers', periode: 'tout', tri: 'valeur_desc' } },
    { nom: 'TVA collectée par mois', c: { source: 'factures', mesure: 'somme_tva', groupe: 'mois', periode: 'annee', tri: 'libelle' } },
    { nom: 'Produits les plus vendus', c: { source: 'factures', mesure: 'somme_ht', groupe: 'produit', periode: 'annee', tri: 'valeur_desc', limite: 10 } },
    { nom: 'Achats par fournisseur', c: { source: 'achats', mesure: 'somme_ttc', groupe: 'tiers', periode: 'annee', tri: 'valeur_desc' } }
  ];
  var DEFAUT = { source: 'factures', mesure: 'somme_ttc', groupe: 'tiers', periode: 'annee', du: '', au: '', statut: '', tiers: '', min: '', tri: 'valeur_desc', limite: 0 };
  var _cfg = Object.assign({}, DEFAUT), _resultat = null, _sauvegardes = [];

  function e(s) { return escapeHTML(String(s == null ? '' : s)); }
  function jour(s) { var d = new Date(s || ''); if (isNaN(d.getTime())) return null; d.setHours(0, 0, 0, 0); return d; }
  function lignes(f) { try { return typeof f.lignes === 'string' ? JSON.parse(f.lignes || '[]') : (f.lignes || []); } catch (x) { return []; } }
  function reste(f) { return f.statut === 'payee' ? 0 : Math.max(0, Number(f.ttc || 0) - Number(f.montant_recu || 0)); }
  var MOIS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];

  window.rapportValider = function (c) {          // même règle pour l'IA, les modèles et les rapports enregistrés
    var o = Object.assign({}, DEFAUT, c || {});
    if (!SOURCES[o.source]) o.source = 'factures';
    if (!MESURES[o.mesure]) o.mesure = 'somme_ttc';
    if (!GROUPES[o.groupe]) o.groupe = 'aucun';
    if (!PERIODES[o.periode]) o.periode = 'tout';
    if (!TRIS[o.tri]) o.tri = 'valeur_desc';
    if (!(o.statut in STATUTS)) o.statut = '';
    o.limite = [0, 5, 10, 20].indexOf(Number(o.limite)) >= 0 ? Number(o.limite) : 0;
    o.tiers = String(o.tiers || '').slice(0, 80); o.min = o.min === '' || o.min == null || !isFinite(Number(o.min)) ? '' : Number(o.min);
    o.du = /^\d{4}-\d{2}-\d{2}$/.test(o.du) ? o.du : ''; o.au = /^\d{4}-\d{2}-\d{2}$/.test(o.au) ? o.au : '';
    var s = o.source;
    if ((o.mesure === 'reste' || o.mesure === 'delai_accorde' || o.mesure === 'delai_paiement') && s !== 'factures' && !(o.mesure === 'reste' && s === 'achats')) o.mesure = 'somme_ttc';
    if (o.groupe === 'produit' && ['factures', 'devis'].indexOf(s) < 0) o.groupe = 'tiers';
    if (o.groupe === 'taux_tva' && ['factures', 'devis'].indexOf(s) < 0) o.groupe = 'tiers';
    if ((o.groupe === 'produit' || o.groupe === 'taux_tva') && ['reste', 'delai_accorde', 'delai_paiement'].indexOf(o.mesure) >= 0) o.mesure = 'somme_ht';
    if (o.statut === 'retard_reel' || o.statut === 'impayee') { if (['factures', 'achats'].indexOf(s) < 0) o.statut = ''; }
    if (o.groupe === 'mois' || o.groupe === 'trimestre' || o.groupe === 'annee') { if (!c || !c.tri) o.tri = 'libelle'; }
    return o;
  };

  function bornes(c) {
    var n = new Date(), y = n.getFullYear(), m = n.getMonth(), d0 = null, d1 = null;
    if (c.periode === 'mois') { d0 = new Date(y, m, 1); d1 = new Date(y, m + 1, 0); }
    else if (c.periode === 'mois_dernier') { d0 = new Date(y, m - 1, 1); d1 = new Date(y, m, 0); }
    else if (c.periode === 'trimestre') { var q = Math.floor(m / 3) * 3; d0 = new Date(y, q, 1); d1 = new Date(y, q + 3, 0); }
    else if (c.periode === 'annee') { d0 = new Date(y, 0, 1); d1 = new Date(y, 11, 31); }
    else if (c.periode === '12mois') { d0 = new Date(y, m - 11, 1); d1 = new Date(y, m + 1, 0); }
    else if (c.periode === 'perso') { d0 = c.du ? jour(c.du) : null; d1 = c.au ? jour(c.au) : null; }
    if (d0) d0.setHours(0, 0, 0, 0); if (d1) d1.setHours(23, 59, 59, 999);
    return [d0, d1];
  }

  // Normalise chaque document en une fiche commune.
  function fiches(c) {
    var A = [], pays = {}, facById = {};
    (STATE.factures || []).forEach(function (f) { facById[String(f.id)] = f; });
    (STATE.paiements || []).forEach(function (p) { (pays[String(p.facture_id)] = pays[String(p.facture_id)] || []).push(p); });
    var S = c.source;
    if (S === 'paiements') {
      return (STATE.paiements || []).map(function (p) { var f = facById[String(p.facture_id)] || {}; var m = Number(p.montant || 0);
        return { src: p, date: p.date || p.created_at, tiers: f.client || '—', ttc: m, ht: m, tva: 0, statut: p.mode || 'virement', reste: 0, lignes: [], ref: f.ref || '', type: 'paiement', idFacture: f.id }; });
    }
    var liste = S === 'factures' ? STATE.factures : S === 'devis' ? STATE.devis : S === 'achats' ? STATE.achats : STATE.avoirs;
    var auj = jour(new Date());
    (liste || []).forEach(function (x) {
      var date = S === 'achats' ? x.date_achat : x.date_emission, ec = jour(x.echeance), r = S === 'factures' ? reste(x) : (S === 'achats' ? (x.statut === 'payee' ? 0 : Number(x.ttc || 0)) : 0);
      var fi = { src: x, date: date, tiers: (S === 'achats' ? x.fournisseur : x.client) || '—', ttc: Number(x.ttc || 0), ht: Number(x.ht || 0), tva: Number(x.tva || 0), statut: x.statut || '', reste: r, lignes: (S === 'factures' || S === 'devis') ? lignes(x) : [], ref: x.ref || x.ref_fournisseur || '', type: S, id: x.id };
      fi.retardReel = r > 0.009 && ec && ec < auj;
      var em = jour(date);
      fi.delaiAccorde = (em && ec) ? Math.round((ec - em) / 86400000) : null;
      if (S === 'factures') {
        var lp = (pays[String(x.id)] || []).map(function (p) { return jour(p.date); }).filter(Boolean).sort(function (a, b) { return b - a; })[0];
        fi.delaiPaiement = (r <= 0.009 && lp && em) ? Math.round((lp - em) / 86400000) : null;
      }
      A.push(fi);
    });
    return A;
  }

  window.rapportCalculer = function (cfg) {
    var c = rapportValider(cfg), B = bornes(c), F = fiches(c), t = c.tiers.trim().toLowerCase();
    var explicite = c.statut !== '';
    F = F.filter(function (x) {
      if (!explicite && (c.source === 'factures' || c.source === 'devis') && (x.statut === 'brouillon' || x.statut === 'annulee')) return false;
      var d = jour(x.date); if (B[0] || B[1]) { if (!d) return false; if (B[0] && d < B[0]) return false; if (B[1] && d > B[1]) return false; }
      if (c.statut === 'retard_reel') { if (!x.retardReel) return false; }
      else if (c.statut === 'impayee') { if (!(x.reste > 0.009)) return false; }
      else if (c.statut && x.statut !== c.statut) return false;
      if (t && String(x.tiers).toLowerCase().indexOf(t) < 0) return false;
      if (c.min !== '' && x.ttc < c.min) return false;
      return true;
    });
    var groupes = {}, ordreCle = [];
    function cle(x) {
      var d = jour(x.date), g = c.groupe;
      if (g === 'aucun') return ['tout', 'Total'];
      if (g === 'tiers') return [String(x.tiers).toLowerCase(), x.tiers];
      if (g === 'statut') return [x.statut || '—', (STATUTS[x.statut] || x.statut || '—')];
      if (!d) return ['0', 'Sans date'];
      if (g === 'mois') return [d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'), MOIS[d.getMonth()] + ' ' + d.getFullYear()];
      if (g === 'trimestre') return [d.getFullYear() + '-T' + (Math.floor(d.getMonth() / 3) + 1), 'T' + (Math.floor(d.getMonth() / 3) + 1) + ' ' + d.getFullYear()];
      if (g === 'annee') return [String(d.getFullYear()), String(d.getFullYear())];
      return ['tout', 'Total'];
    }
    function pousser(k, l, v, doc) { var g = groupes[k]; if (!g) { g = groupes[k] = { cle: k, label: l, vals: [], n: 0, docs: [] }; ordreCle.push(k); } g.vals.push(v); g.n++; g.docs.push(doc); }
    var M = c.mesure;
    F.forEach(function (x) {
      if (c.groupe === 'produit' || c.groupe === 'taux_tva') {
        var ls = x.lignes.length ? x.lignes : [], base = ls.reduce(function (s, l) { return s + Number(l.qte || 0) * Number(l.pu || 0); }, 0), rem = base > 0 && x.ht > 0 ? x.ht / base : 1;
        ls.forEach(function (l) {
          var ht = Number(l.qte || 0) * Number(l.pu || 0) * rem, tv = Number(l.tva != null ? l.tva : 20), tva = ht * tv / 100, ttc = ht + tva;
          var v = M === 'somme_ht' ? ht : M === 'somme_tva' ? tva : M === 'nombre' ? 1 : M === 'moyenne_ttc' ? ttc : ttc;
          var k = c.groupe === 'produit' ? [String(l.desc || '—').trim().toLowerCase(), String(l.desc || '—').trim()] : [String(tv), 'TVA ' + tv + ' %'];
          pousser(k[0], k[1], v, x);
        });
        return;
      }
      var k = cle(x), v;
      if (M === 'somme_ht') v = x.ht; else if (M === 'somme_tva') v = x.tva; else if (M === 'nombre') v = 1; else if (M === 'reste') v = x.reste;
      else if (M === 'delai_accorde') v = x.delaiAccorde; else if (M === 'delai_paiement') v = x.delaiPaiement; else v = x.ttc;
      if ((M === 'delai_accorde' || M === 'delai_paiement') && v == null) return;
      pousser(k[0], k[1], v, x);
    });
    var rows = ordreCle.map(function (k) {
      var g = groupes[k], s = g.vals.reduce(function (a, b) { return a + b; }, 0);
      var val = (M === 'moyenne_ttc' || M === 'delai_accorde' || M === 'delai_paiement') ? (g.vals.length ? s / g.vals.length : 0) : s;
      var uniq = {}; var docs = g.docs.filter(function (d) { var i = d.type + (d.id || d.src.id); if (uniq[i]) return false; uniq[i] = 1; return true; });
      return { cle: g.cle, label: g.label, valeur: val, n: docs.length, docs: docs };
    });
    if (c.tri === 'libelle') rows.sort(function (a, b) { return (c.groupe === 'tiers' || c.groupe === 'produit' || c.groupe === 'statut') ? a.label.localeCompare(b.label, 'fr') : (a.cle < b.cle ? -1 : 1); });
    else rows.sort(function (a, b) { return c.tri === 'valeur_asc' ? a.valeur - b.valeur : b.valeur - a.valeur; });
    if (c.limite) rows = rows.slice(0, c.limite);
    var total = M === 'nombre' || M === 'somme_ttc' || M === 'somme_ht' || M === 'somme_tva' || M === 'reste' ? rows.reduce(function (s, r) { return s + r.valeur; }, 0) : null;
    return { cfg: c, rows: rows, total: total, nbDocs: F.length };
  };

  function formater(m, v) {
    if (m === 'nombre') return String(Math.round(v));
    if (m === 'delai_accorde' || m === 'delai_paiement') return Math.round(v) + ' j';
    return fmt(v);
  }
  function titreRapport(c) {
    return MESURES[c.mesure] + ' — ' + SOURCES[c.source].toLowerCase() + (c.groupe !== 'aucun' ? ', par ' + GROUPES[c.groupe].toLowerCase() : '') + ' · ' + PERIODES[c.periode].toLowerCase();
  }

  function sel(id, opts, val) { return '<select id="' + id + '" class="f-inp" onchange="rapportChamp()">' + Object.keys(opts).map(function (k) { return '<option value="' + e(k) + '"' + (String(k) === String(val) ? ' selected' : '') + '>' + e(opts[k]) + '</option>'; }).join('') + '</select>'; }

  window.rapportChamp = function () {
    var v = function (id) { var x = document.getElementById(id); return x ? x.value : ''; };
    _cfg = rapportValider({ source: v('rp-source'), mesure: v('rp-mesure'), groupe: v('rp-groupe'), periode: v('rp-periode'), du: v('rp-du'), au: v('rp-au'), statut: v('rp-statut'), tiers: v('rp-tiers'), min: v('rp-min'), tri: v('rp-tri'), limite: v('rp-limite') });
    rapportLancer();
  };

  function formHTML() {
    var c = _cfg, perso = c.periode === 'perso';
    var mes = {}; Object.keys(MESURES).forEach(function (k) { var ok = true; if (['delai_accorde', 'delai_paiement'].indexOf(k) >= 0 && c.source !== 'factures') ok = false; if (k === 'reste' && ['factures', 'achats'].indexOf(c.source) < 0) ok = false; if (ok) mes[k] = MESURES[k]; });
    var grp = {}; Object.keys(GROUPES).forEach(function (k) { if ((k === 'produit' || k === 'taux_tva') && ['factures', 'devis'].indexOf(c.source) < 0) return; grp[k] = GROUPES[k]; });
    var st = {}; Object.keys(STATUTS).forEach(function (k) { if ((k === 'retard_reel' || k === 'impayee') && ['factures', 'achats'].indexOf(c.source) < 0) return; st[k] = STATUTS[k]; });
    return '<div class="rp-form">' +
      '<label>Je veux analyser' + sel('rp-source', SOURCES, c.source) + '</label>' +
      '<label>Je veux calculer' + sel('rp-mesure', mes, c.mesure) + '</label>' +
      '<label>Regrouper par' + sel('rp-groupe', grp, c.groupe) + '</label>' +
      '<label>Période' + sel('rp-periode', PERIODES, c.periode) + '</label>' +
      '<label class="rp-dates" style="' + (perso ? '' : 'display:none') + '">Du<input type="date" id="rp-du" class="f-inp" value="' + e(c.du) + '" onchange="rapportChamp()"></label>' +
      '<label class="rp-dates" style="' + (perso ? '' : 'display:none') + '">Au<input type="date" id="rp-au" class="f-inp" value="' + e(c.au) + '" onchange="rapportChamp()"></label>' +
      '<label>Statut' + sel('rp-statut', st, c.statut) + '</label>' +
      '<label>Nom contient<input type="text" id="rp-tiers" class="f-inp" placeholder="ex. Karim" value="' + e(c.tiers) + '" onchange="rapportChamp()"></label>' +
      '<label>Montant TTC minimum<input type="number" id="rp-min" class="f-inp" placeholder="0" value="' + e(c.min) + '" onchange="rapportChamp()"></label>' +
      '<label>Trier' + sel('rp-tri', TRIS, c.tri) + '</label>' +
      '<label>Nombre de lignes' + sel('rp-limite', { 0: 'Toutes', 5: '5 premières', 10: '10 premières', 20: '20 premières' }, c.limite) + '</label>' +
      '</div>';
  }

  function resultatHTML(R) {
    var c = R.cfg, M = c.mesure;
    if (!R.rows.length) return '<div class="su-info">Aucun résultat avec ces choix. Élargissez la période ou retirez un filtre.</div>';
    var max = Math.max.apply(null, R.rows.map(function (r) { return Math.abs(r.valeur); }).concat([1e-9]));
    var temporel = ['mois', 'trimestre', 'annee'].indexOf(c.groupe) >= 0 && R.rows.length <= 24;
    var graph = temporel ? '<div class="su-mois" style="height:140px;margin-bottom:6px">' + R.rows.map(function (r) { return '<div class="su-mcol" title="' + e(r.label) + ' : ' + formater(M, r.valeur) + '"><div class="su-mbar"><div class="su-mfac" style="height:' + Math.round(Math.abs(r.valeur) / max * 100) + '%;width:70%"></div></div><div class="su-mlib">' + e(r.label.split(' ')[0]) + '</div></div>'; }).join('') + '</div>' : '';
    var lignesH = R.rows.map(function (r, i) {
      return '<tr class="rp-l" onclick="rapportDetail(' + i + ')"><td>' + e(r.label) + '<div class="su-piste" style="margin-top:5px"><div style="width:' + Math.round(Math.abs(r.valeur) / max * 100) + '%"></div></div></td><td class="rp-n">' + r.n + '</td><td class="rp-v">' + formater(M, r.valeur) + '</td></tr><tr class="rp-d" id="rp-d' + i + '" style="display:none"><td colspan="3"></td></tr>';
    }).join('');
    var unite = (M === 'nombre' || M === 'delai_accorde' || M === 'delai_paiement') ? '' : ' MAD';
    return '<div class="rp-total">' + (R.total != null ? '<span>Total</span><b>' + formater(M, R.total) + unite + '</b>' : '<span>' + R.nbDocs + ' document(s) analysé(s)</span>') + '</div>' + graph +
      '<table class="rp-tab"><thead><tr><th>' + e(GROUPES[c.groupe] === GROUPES.aucun ? 'Résultat' : GROUPES[c.groupe]) + '</th><th class="rp-n">Docs</th><th class="rp-v">' + e(MESURES[M]) + '</th></tr></thead><tbody>' + lignesH + '</tbody></table>' +
      '<div class="rp-actions"><button type="button" onclick="rapportExporter(\'csv\')">⬇️ CSV</button><button type="button" onclick="rapportExporter(\'xlsx\')">⬇️ Excel</button><button type="button" class="rp-prim" onclick="rapportEnregistrer()">💾 Enregistrer ce rapport</button></div>';
  }

  window.rapportLancer = function () {
    _resultat = rapportCalculer(_cfg); _cfg = _resultat.cfg;
    var f = document.getElementById('rp-form'); if (f && !f.dataset.fige) { /* formulaire reconstruit pour refléter les choix compatibles */ }
    var z = document.getElementById('rp-formulaire'); if (z) z.innerHTML = formHTML();
    var r = document.getElementById('rp-resultat'); if (r) r.innerHTML = '<h3 class="rp-titre">' + e(titreRapport(_cfg)) + '</h3>' + resultatHTML(_resultat);
  };

  window.rapportDetail = function (i) {
    var row = _resultat && _resultat.rows[i], tr = document.getElementById('rp-d' + i); if (!row || !tr) return;
    if (tr.style.display !== 'none') { tr.style.display = 'none'; return; }
    var td = tr.firstChild;
    td.innerHTML = '<div class="rp-docs">' + row.docs.slice(0, 40).map(function (d) {
      var lien = d.type === 'factures' ? 'ouvrirFactureStats(\'' + String(d.id).replace(/'/g, '') + '\')' : d.type === 'paiement' && d.idFacture ? 'ouvrirFactureStats(\'' + String(d.idFacture).replace(/'/g, '') + '\')' : d.type === 'achats' ? 'ouvrirDetailAchat(\'' + String(d.id).replace(/'/g, '') + '\')' : '';
      return '<div class="rp-doc"' + (lien ? ' onclick="' + lien + '"' : '') + '><span>' + e(d.ref || '—') + ' · ' + e(String(d.date || '').slice(0, 10)) + ' · ' + e(d.tiers) + '</span><b>' + fmt(d.ttc) + '</b></div>';
    }).join('') + (row.docs.length > 40 ? '<div class="su-vide">… et ' + (row.docs.length - 40) + ' autres (exportez pour tout voir).</div>' : '') + '</div>';
    tr.style.display = 'table-row';
  };

  function nomFichier() { return 'rapport_' + new Date().toISOString().slice(0, 10); }
  window.rapportExporter = async function (type) {
    if (!_resultat) return;
    var c = _resultat.cfg, M = c.mesure, tete = [GROUPES[c.groupe] === GROUPES.aucun ? 'Résultat' : GROUPES[c.groupe], 'Documents', MESURES[M]];
    var data = [[titreRapport(c)], [], tete].concat(_resultat.rows.map(function (r) { return [r.label, r.n, (M === 'nombre' ? Math.round(r.valeur) : Math.round(r.valeur * 100) / 100)]; }));
    if (_resultat.total != null) data.push(['Total', '', Math.round(_resultat.total * 100) / 100]);
    data.push([], ['Rapport établi par Tafir à partir des documents saisis. À contrôler avant toute déclaration.']);
    if (type === 'csv') {
      var csv = '﻿' + data.map(function (l) { return l.map(function (x) { var s = String(x == null ? '' : x).replace(/"/g, '""'); return /[;"\n]/.test(s) ? '"' + s + '"' : s; }).join(';'); }).join('\r\n');
      var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' })); a.download = nomFichier() + '.csv'; document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
    } else {
      try { await _chargerSheetJS(); var wb = XLSX.utils.book_new(), ws = XLSX.utils.aoa_to_sheet(data); ws['!cols'] = [{ wch: 36 }, { wch: 12 }, { wch: 22 }]; XLSX.utils.book_append_sheet(wb, ws, 'Rapport'); XLSX.writeFile(wb, nomFichier() + '.xlsx'); }
      catch (x) { showToast('Excel indisponible : utilisez le CSV.', 'error'); }
    }
  };

  // ── Rapports enregistrés (table rapports_perso si elle existe, sinon cet appareil) ──
  function cleLocale() { return 'tafir_rapports_' + ((sb.user && sb.user.id) || 'x'); }
  async function charger() {
    var loc = []; try { loc = JSON.parse(localStorage.getItem(cleLocale()) || '[]') || []; } catch (x) {}
    var dist = [];
    try { var r = await sb.get('rapports_perso', 'user_id=eq.' + sb.user.id + '&order=created_at.desc'); if (Array.isArray(r)) { dist = r.map(function (x) { return { id: x.id, nom: x.nom, cfg: typeof x.config === 'string' ? JSON.parse(x.config) : x.config, distant: true }; }); window._rapportsServeur = true; } } catch (x) { window._rapportsServeur = false; }
    _sauvegardes = dist.concat(loc.filter(function (l) { return !dist.some(function (d) { return d.nom === l.nom; }); }));
  }
  function sauverLocal() { try { localStorage.setItem(cleLocale(), JSON.stringify(_sauvegardes.filter(function (s) { return !s.distant; }))); } catch (x) {} }
  window.rapportEnregistrer = async function () {
    var nom = (prompt('Donnez un nom à ce rapport :', titreRapport(_cfg).slice(0, 50)) || '').trim().slice(0, 80);
    if (!nom) return;
    var cfg = rapportValider(_cfg), ok = false;
    try { var r = await sb.post('rapports_perso', { user_id: sb.user.id, nom: nom, config: cfg }); ok = !!(r && r.length); } catch (x) { ok = false; }
    if (!ok) { _sauvegardes = _sauvegardes.filter(function (s) { return s.nom !== nom; }); _sauvegardes.unshift({ id: 'loc' + Date.now(), nom: nom, cfg: cfg, distant: false }); sauverLocal(); showToast('💾 Rapport enregistré sur cet appareil', 'success'); }
    else showToast('💾 Rapport enregistré', 'success');
    await charger(); majSauvegardes();
  };
  window.rapportOuvrir = function (i) { var s = _sauvegardes[i]; if (!s) return; _cfg = rapportValider(s.cfg); rapportLancer(); window.scrollTo(0, 0); var sc = document.getElementById('screen-rapports'); if (sc) sc.scrollTo(0, 0); };
  window.rapportModele = function (i) { _cfg = rapportValider(MODELES[i].c); rapportLancer(); var r = document.getElementById('rp-resultat'); if (r) r.scrollIntoView({ behavior: 'smooth', block: 'start' }); };
  window.rapportSupprimer = async function (i) {
    var s = _sauvegardes[i]; if (!s || !confirm('Supprimer le rapport « ' + s.nom + ' » ?')) return;
    if (s.distant) { try { await sb.del('rapports_perso', 'id=eq.' + s.id + '&user_id=eq.' + sb.user.id); } catch (x) { showToast('Suppression impossible', 'error'); return; } }
    _sauvegardes.splice(i, 1); sauverLocal(); majSauvegardes();
  };
  function majSauvegardes() {
    var z = document.getElementById('rp-sauvegardes'); if (!z) return;
    z.innerHTML = _sauvegardes.length ? _sauvegardes.map(function (s, i) {
      return '<div class="rp-sv"><span onclick="rapportOuvrir(' + i + ')">📄 ' + e(s.nom) + (s.distant ? '' : ' <small>(cet appareil)</small>') + '</span><button type="button" aria-label="Supprimer" onclick="rapportSupprimer(' + i + ')">✕</button></div>';
    }).join('') : '<div class="su-vide">Aucun rapport enregistré pour l’instant.</div>';
  }

  // ── Question en français → rapport (IA, ne reçoit que la phrase, jamais vos données) ──
  window.rapportDemanderIA = async function () {
    var zone = document.getElementById('rp-question'), q = zone ? zone.value.trim() : '';
    if (q.length < 5) { showToast('Écrivez votre question, par exemple : « Quels clients me doivent le plus ? »', 'error'); return; }
    if (typeof _dicteeConsentement === 'function' && !_dicteeConsentement()) return;
    var b = document.getElementById('rp-ia-btn'); if (b) { b.disabled = true; b.textContent = '⏳ Je prépare…'; }
    try {
      var jeton = sb.token || '';
      var r = await fetch('/api/rapport-ia', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + jeton }, body: JSON.stringify({ question: q }) });
      var d = await r.json().catch(function () { return {}; });
      if (!r.ok) { showToast(d.erreur || 'L’assistant n’a pas pu répondre.', 'error'); return; }
      _cfg = rapportValider(d.config); rapportLancer();
      var n = document.getElementById('rp-ia-note'); if (n) n.textContent = d.explication ? '🤖 ' + d.explication + ' Vérifiez les choix ci-dessous.' : '';
    } catch (x) { showToast('Connexion impossible, réessayez.', 'error'); }
    finally { if (b) { b.disabled = false; b.textContent = '✨ Créer le rapport'; } }
  };

  window.renderRapports = async function () {
    var sc = document.getElementById('rp-contenu'); if (!sc) return;
    sc.innerHTML =
      '<div class="rp-intro">Choisissez ce que vous voulez calculer : Tafir construit le rapport, vous le voyez tout de suite, puis vous l’exportez ou l’enregistrez. <b>Un rapport ne modifie jamais vos factures.</b></div>' +
      '<div class="su-bloc"><h3><span>✨ Posez votre question</span><small>l’assistant prépare le rapport</small></h3><div class="rp-ia"><input type="text" id="rp-question" class="f-inp" maxlength="300" placeholder="Ex. : quels clients me doivent le plus ? / mon CA par mois cette année" onkeydown="if(event.key===\'Enter\')rapportDemanderIA()"><button type="button" id="rp-ia-btn" onclick="rapportDemanderIA()">✨ Créer le rapport</button></div><div id="rp-ia-note" class="rp-note"></div><div class="rp-note">Seule votre phrase est envoyée, jamais vos factures ni vos clients.</div></div>' +
      '<div class="su-bloc"><h3>Modèles prêts</h3><div class="rp-modeles">' + MODELES.map(function (m, i) { return '<button type="button" onclick="rapportModele(' + i + ')">' + e(m.nom) + '</button>'; }).join('') + '</div></div>' +
      '<div class="su-bloc"><h3>Construire mon rapport</h3><div id="rp-formulaire"></div></div>' +
      '<div class="su-bloc"><div id="rp-resultat"></div></div>' +
      '<div class="su-bloc"><h3>Mes rapports enregistrés</h3><div id="rp-sauvegardes"></div></div>';
    rapportLancer();
    await charger(); majSauvegardes();
  };
})();
