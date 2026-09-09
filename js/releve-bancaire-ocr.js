// ZELTO — releve-bancaire-ocr.js — Lecture et rapprochement des relevés
// ============================================================
// PÉRIMÈTRE HONNÊTE : les relevés bancaires marocains ont des mises en
// page très différentes d'une banque à l'autre — contrairement aux
// factures d'achat (assez similaires entre elles), il n'existe pas de
// format universel. Plutôt que d'écrire des règles séparées pour chaque
// banque (risqué sans avoir de vrais relevés de chacune pour les
// valider), l'heuristique générique ci-dessous reconnaît désormais un
// vocabulaire élargi couvrant les termes les plus courants employés par
// les banques marocaines sur leurs relevés (français, parfois anglais
// pour les comptes en devises). Chaque suggestion reste à vérifier —
// rien n'est jamais lié automatiquement sans confirmation.

// Liste des banques marocaines proposées dans le sélecteur — stockée
// avec chaque relevé importé, pour affichage et pour affiner la lecture
// au fil du temps si des retours précis remontent sur une banque donnée.
const BANQUES_MAROCAINES = [
  'Attijariwafa Bank', 'Bank of Africa (BOA)', 'Banque Populaire',
  'Société Générale Maroc', 'BMCI', 'CIH Bank', 'Crédit Agricole du Maroc',
  'Al Barid Bank', 'CFG Bank', 'Crédit du Maroc', 'Bank Al Yousr',
  'Bank Assafa', 'Umnia Bank', 'Autre / non listée',
];

function remplirSelecteurBanques() {
  const select = el('releve-banque');
  if (!select) return;
  select.innerHTML = '<option value="">Sélectionner votre banque...</option>' +
    BANQUES_MAROCAINES.map(function(b) { return '<option value="' + escapeHTML(b) + '">' + escapeHTML(b) + '</option>'; }).join('');
}

// FIX (retour utilisateur) : n'acceptait que les PDF — beaucoup de
// banques marocaines proposent aussi (ou uniquement) un export Excel du
// relevé, généralement bien plus fiable à lire qu'un PDF scanné
// puisque les colonnes (date, libellé, montant) sont déjà séparées
// proprement, contrairement à un texte brut à deviner par regex.
// Détecte maintenant le type de fichier reçu et redirige vers la bonne
// méthode de lecture — le reste de l'app (rapprochement, affichage,
// confirmation) ne change pas, quel que soit le format d'origine.
async function lireReleveBancaire(fichierDataUrl) {
  const estExcel = /^data:application\/(vnd\.openxmlformats-officedocument\.spreadsheetml|vnd\.ms-excel)/.test(fichierDataUrl)
    || /^data:.*;base64,/.test(fichierDataUrl) === false; // repli si le type mime n'est pas reconnu du tout
  if (estExcel) {
    return await _lireReleveBancaireExcel(fichierDataUrl);
  }
  return await _lireReleveBancairePdf(fichierDataUrl);
}

// Lecture PDF (comportement historique, inchangé) — extraction du texte
// brut, puis mêmes heuristiques regex qu'avant.
async function _lireReleveBancairePdf(pdfDataUrl) {
  try {
    await _chargerPdfJs();
  } catch(e) {
    console.warn('PDF.js indisponible — lecture automatique du relevé impossible');
    return null;
  }
  try {
    const base64 = pdfDataUrl.split(',')[1];
    const binaire = atob(base64);
    const octets = new Uint8Array(binaire.length);
    for (let i = 0; i < binaire.length; i++) octets[i] = binaire.charCodeAt(i);
    const doc = await pdfjsLib.getDocument({ data: octets }).promise;
    let texte = '';
    const nbPages = Math.min(doc.numPages, 20);
    for (let p = 1; p <= nbPages; p++) {
      const page = await doc.getPage(p);
      const contenu = await page.getTextContent();
      texte += contenu.items.map(function(it) { return it.str; }).join(' ') + '\n';
    }
    return _extraireTransactionsReleve(texte);
  } catch(e) {
    console.warn('_lireReleveBancairePdf:', e);
    return null;
  }
}

// NOUVEAU : lecture d'un relevé au format Excel (.xlsx/.xls) — réutilise
// SheetJS, déjà chargée ailleurs dans l'app pour l'export comptable
// (voir _chargerSheetJS() dans finance.js), pas de nouvelle dépendance.
// Plus fiable que le PDF : les colonnes sont déjà séparées par la
// banque, on n'a pas besoin de deviner où finit la date et où commence
// le montant dans une seule ligne de texte brut.
async function _lireReleveBancaireExcel(excelDataUrl) {
  try {
    if (typeof _chargerSheetJS === 'function') await _chargerSheetJS();
    if (typeof XLSX === 'undefined') {
      console.warn('SheetJS indisponible — lecture automatique du relevé Excel impossible');
      return null;
    }
    const base64 = excelDataUrl.split(',')[1];
    const binaire = atob(base64);
    const octets = new Uint8Array(binaire.length);
    for (let i = 0; i < binaire.length; i++) octets[i] = binaire.charCodeAt(i);
    const classeur = XLSX.read(octets, { type: 'array', cellDates: true });
    const premierOnglet = classeur.Sheets[classeur.SheetNames[0]];
    const lignes = XLSX.utils.sheet_to_json(premierOnglet, { defval: '' });
    return _extraireTransactionsReleveExcel(lignes);
  } catch(e) {
    console.warn('_lireReleveBancaireExcel:', e);
    return null;
  }
}

// Heuristique sur les en-têtes de colonnes — volontairement tolérante,
// puisque chaque banque nomme ses colonnes différemment (Date/Date
// opération/Date valeur, Libellé/Description/Intitulé, un seul montant
// signé OU deux colonnes Débit/Crédit séparées).
function _extraireTransactionsReleveExcel(lignes) {
  const transactions = [];

  function valeurColonne(ligne, cles) {
    const clesLigne = Object.keys(ligne);
    for (const cle of clesLigne) {
      const cleNormalisee = cle.toLowerCase().trim();
      if (cles.some(function(k) { return cleNormalisee.includes(k); })) {
        return ligne[cle];
      }
    }
    return '';
  }

  lignes.forEach(function(ligne) {
    // Vocabulaire élargi — couvre les intitulés de colonnes les plus
    // courants observés chez les banques marocaines (Attijariwafa,
    // BOA, Banque Populaire, CIH, SGMA, BMCI, CAM, Al Barid Bank...),
    // en français et parfois en anglais pour les comptes en devises.
    const brutDate = valeurColonne(ligne, [
      'date opération', 'date operation', 'date opé', 'date ope',
      'date valeur', 'date comptable', 'date exécution', 'date execution',
      'transaction date', 'value date', 'date',
    ]);
    const description = String(valeurColonne(ligne, [
      'libellé', 'libelle', 'description', 'intitulé', 'intitule',
      'objet', 'nature', 'nature opération', 'nature operation',
      'détail', 'detail', 'motif', 'référence', 'reference',
      'narrative', 'particulars',
    ])).trim();
    if (!description) return;

    let dateBrute = '';
    if (brutDate instanceof Date) {
      dateBrute = String(brutDate.getDate()).padStart(2,'0') + '/' + String(brutDate.getMonth()+1).padStart(2,'0') + '/' + brutDate.getFullYear();
    } else if (brutDate) {
      dateBrute = String(brutDate).trim();
    }

    // Soit un montant unique signé, soit deux colonnes Débit/Crédit
    // séparées — on prend celle qui est non vide, en valeur absolue
    // (le sens n'a pas d'importance ici, seul le montant compte pour le
    // rapprochement par égalité).
    const montantUnique = valeurColonne(ligne, ['montant', 'amount', 'somme']);
    const debit = valeurColonne(ligne, ['débit', 'debit', 'sortie', 'retrait', 'withdrawal']);
    const credit = valeurColonne(ligne, ['crédit', 'credit', 'entrée', 'entree', 'dépôt', 'depot', 'deposit']);

    let montant = null;
    [montantUnique, debit, credit].forEach(function(v) {
      if (montant !== null) return;
      const nettoye = String(v).replace(/\s/g, '').replace(',', '.');
      const val = parseFloat(nettoye);
      if (!isNaN(val) && val !== 0) montant = Math.abs(val);
    });
    if (montant === null || montant <= 0 || montant > 10000000) return;

    transactions.push({ dateBrute: dateBrute, description: description.slice(0, 80), montant: montant });
  });

  return transactions;
}

// FIX (retour utilisateur) : élargi pour couvrir plus de mises en page
// bancaires marocaines — certaines banques utilisent un tiret bas ou un
// espace comme séparateur de milliers dans le montant (ex: "1 234,50"
// ou "1_234.50"), et certaines affichent la date en fin de ligne plutôt
// qu'en début (date valeur après le libellé). Deux motifs sont
// désormais essayés — date en début, puis date en fin — pour couvrir
// les deux mises en page les plus fréquentes.
function _extraireTransactionsReleve(texte) {
  const transactions = [];
  const lignes = texte.split('\n').map(function(l) { return l.trim(); }).filter(Boolean);

  // FIX (autotest) : le premier motif doit être ancré en tout début de
  // ligne (^) — sans cet ancrage, une date présente n'importe où dans une
  // ligne "description d'abord, date ensuite" était quand même happée
  // par ce motif en premier (l'ordre de test étant motif 1 puis motif 2),
  // en coupant le montant au mauvais endroit et en le rendant invalide.
  const motifsLigne = [
    // Date en tout début de ligne, montant en fin (mise en page la plus courante)
    /^\s*(\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4}).{3,80}?([\d\s_]{1,9}[.,]\d{2})\s*$/,
    // Date en fin de ligne (certaines banques affichent le libellé puis
    // la date valeur juste avant le montant)
    /^(.{3,80}?)(\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4}).{0,20}?([\d\s_]{1,9}[.,]\d{2})\s*$/,
  ];

  for (const ligne of lignes) {
    let dateBrute = null, montantBrutTexte = null, descriptionBrute = ligne;

    const m1 = ligne.match(motifsLigne[0]);
    if (m1) {
      dateBrute = m1[1];
      montantBrutTexte = m1[2];
      descriptionBrute = ligne.replace(m1[1], '').replace(m1[2], '');
    } else {
      const m2 = ligne.match(motifsLigne[1]);
      if (m2) {
        descriptionBrute = m2[1];
        dateBrute = m2[2];
        montantBrutTexte = m2[3];
      }
    }
    if (!dateBrute || !montantBrutTexte) continue;

    const montantBrut = montantBrutTexte.replace(/[\s_]/g, '').replace(',', '.');
    const montant = parseFloat(montantBrut);
    if (isNaN(montant) || montant <= 0 || montant > 10000000) continue;

    const description = descriptionBrute
      .replace(/[|;]/g, ' ')
      .trim()
      .slice(0, 80);
    if (description.length < 3) continue;

    transactions.push({ dateBrute: dateBrute, description: description, montant: montant });
  }
  return transactions;
}

// FIX (retour utilisateur) : ne cherchait auparavant que du côté des
// factures de vente (encaissements clients) — un virement SORTANT vers
// un fournisseur, même correspondant exactement à un achat déjà
// enregistré, s'affichait toujours comme "aucune correspondance",
// puisque STATE.achats n'était jamais consulté. Cherche désormais des
// deux côtés, et marque chaque correspondance par son type (_type)
// pour que l'affichage et la confirmation sachent quelle table mettre
// à jour.
//
// FIX (retour utilisateur) : en pratique, aucun des 3 critères n'est
// jamais parfaitement exact — le montant peut différer (frais bancaires,
// règlement partiel, arrondi), le nom peut être tronqué/mal orthographié
// par la banque, et la date d'opération bancaire tombe souvent plusieurs
// jours après la date de la facture (délai de traitement, weekend...).
// Exiger une correspondance exacte sur l'un de ces 3 critères pour
// même APPARAÎTRE dans la liste ratait donc trop de vrais rapprochements.
//
// Refait ici avec un vrai score de similarité sur chacun des 3 critères
// (tolérance large sur le montant, distance de Levenshtein sur le nom,
// tolérance élargie sur la date), combinés en un score global — une
// facture apparaît dès qu'elle a un minimum de signaux cohérents, pas
// besoin qu'un seul critère soit parfait. Toujours des suggestions à
// vérifier soi-même, jamais un lien automatique.
function _sansAccents(s) {
  return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

// Transforme une date de relevé (JJ/MM/AAAA, JJ-MM-AAAA...) en objet
// Date exploitable — tolérant sur le séparateur, comme le reste de la
// lecture de relevé.
function _parserDateReleve(dateBrute) {
  const m = String(dateBrute || '').match(/(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/);
  if (!m) return null;
  const jour = parseInt(m[1], 10), mois = parseInt(m[2], 10) - 1;
  let annee = parseInt(m[3], 10);
  if (annee < 100) annee += 2000;
  const d = new Date(annee, mois, jour);
  return isNaN(d.getTime()) ? null : d;
}

// Distance de Levenshtein classique (nombre minimal de modifications
// pour passer d'une chaîne à l'autre) — permet de détecter un nom mal
// orthographié ou tronqué par la banque, pas seulement une correspondance
// exacte ou une sous-chaîne.
function _distanceLevenshtein(a, b) {
  const m = a.length, n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const ligne = new Array(n + 1);
  for (let j = 0; j <= n; j++) ligne[j] = j;
  for (let i = 1; i <= m; i++) {
    let precedent = ligne[0];
    ligne[0] = i;
    for (let j = 1; j <= n; j++) {
      const temp = ligne[j];
      ligne[j] = a[i-1] === b[j-1] ? precedent : 1 + Math.min(precedent, ligne[j], ligne[j-1]);
      precedent = temp;
    }
  }
  return ligne[n];
}

// Similarité de 0 (rien en commun) à 1 (identique) entre un nom connu
// (client/fournisseur) et le libellé brut de la transaction — combine
// une recherche de sous-chaîne/mots (rapide, gère l'ordre différent des
// mots) et la distance de Levenshtein (gère les fautes de frappe/troncatures).
function _similariteNom(nomDoc, descriptionTransaction) {
  const nomNorm = _sansAccents(String(nomDoc || '').toLowerCase()).trim();
  const descNorm = _sansAccents(String(descriptionTransaction || '').toLowerCase());
  if (!nomNorm || nomNorm.length < 2) return 0;

  if (descNorm.includes(nomNorm)) return 1; // nom complet retrouvé tel quel

  const motsNom = nomNorm.split(/\s+/).filter(function(m) { return m.length >= 3; });
  const motsDesc = descNorm.split(/\s+/).filter(function(m) { return m.length >= 3; });
  if (!motsNom.length) return 0;

  // Pour chaque mot du nom, cherche le meilleur mot correspondant dans la
  // description (sous-chaîne, ou Levenshtein tolérant ~30% de différence
  // pour absorber une faute de frappe/troncature de la banque).
  let scoreMots = 0;
  motsNom.forEach(function(mot) {
    let meilleur = 0;
    motsDesc.forEach(function(motDesc) {
      if (motDesc.includes(mot) || mot.includes(motDesc)) { meilleur = Math.max(meilleur, 1); return; }
      const dist = _distanceLevenshtein(mot, motDesc);
      const sim = 1 - dist / Math.max(mot.length, motDesc.length);
      meilleur = Math.max(meilleur, sim);
    });
    scoreMots += meilleur >= 0.7 ? meilleur : 0; // ignore les correspondances trop faibles
  });
  return Math.min(1, scoreMots / motsNom.length);
}

// Score de montant : 1 = identique, dégressif selon l'écart en % du
// montant — tolère un règlement partiel, des frais bancaires déduits, un
// arrondi, tout en restant strict au-delà d'un certain écart pour ne pas
// proposer n'importe quoi.
function _scoreMontant(montantDoc, montantTransaction) {
  const doc = Number(montantDoc) || 0;
  const trans = Number(montantTransaction) || 0;
  if (doc <= 0) return 0;
  const ecart = Math.abs(doc - trans);
  const ecartPct = ecart / doc;
  if (ecart < 1) return 1;
  if (ecartPct <= 0.02) return 0.9;
  if (ecartPct <= 0.05) return 0.7;
  if (ecartPct <= 0.10) return 0.5;
  if (ecartPct <= 0.20) return 0.25;
  return 0;
}

// Score de date : dégressif selon l'écart en jours — une opération
// bancaire tombe souvent plusieurs jours après la date de la facture
// (délai de traitement, weekend, virement programmé...), tolérance donc
// plus large qu'un simple "même jour".
function _scoreDate(dateDoc, dateTransactionBrute) {
  const dDoc = dateDoc ? new Date(dateDoc) : null;
  const dTrans = _parserDateReleve(dateTransactionBrute);
  if (!dDoc || !dTrans || isNaN(dDoc.getTime())) return 0;
  const ecartJours = Math.abs((dTrans - dDoc) / 86400000);
  if (ecartJours <= 2) return 1;
  if (ecartJours <= 7) return 0.7;
  if (ecartJours <= 15) return 0.4;
  if (ecartJours <= 30) return 0.15;
  return 0;
}

// Score global pondéré : le montant compte le plus (c'est le signal le
// plus fiable en pratique), le nom ensuite, la date en dernier (souvent
// décalée pour des raisons purement bancaires, sans rapport avec un
// mauvais rapprochement).
function _scoreGlobalCorrespondance(montantDoc, montantTransaction, nomDoc, descriptionTransaction, dateDoc, dateTransactionBrute) {
  const sMontant = _scoreMontant(montantDoc, montantTransaction);
  const sNom = _similariteNom(nomDoc, descriptionTransaction);
  const sDate = _scoreDate(dateDoc, dateTransactionBrute);
  return {
    total: sMontant * 0.5 + sNom * 0.3 + sDate * 0.2,
    detail: { montant: sMontant, nom: sNom, date: sDate }
  };
}

function suggererRapprochements(transactions) {
  const facturesCandidates = (STATE.factures || []).filter(function(f) {
    return f.statut !== 'payee' && f.statut !== 'refusee';
  });
  const achatsCandidats = (STATE.achats || []).filter(function(a) {
    return a.statut !== 'payee';
  });
  // Seuil minimal pour même apparaître comme proposition — évite de
  // noyer l'entreprise sous des dizaines de factures sans aucun rapport
  // réel, tout en restant assez large pour capter un règlement partiel
  // avec un nom mal reconnu, par exemple.
  const SEUIL_MINIMAL = 0.3;

  return transactions.map(function(t) {
    const correspondancesFactures = facturesCandidates.map(function(f) {
      const s = _scoreGlobalCorrespondance(f.ttc, t.montant, f.client, t.description, f.echeance || f.date_emission, t.dateBrute);
      return { id: f.id, ref: f.ref, client: f.client, _type: 'facture', _score: s.total, _detail: s.detail };
    }).filter(function(c) { return c._score >= SEUIL_MINIMAL; });

    const correspondancesAchats = achatsCandidats.map(function(a) {
      const s = _scoreGlobalCorrespondance(a.ttc, t.montant, a.fournisseur, t.description, a.echeance || a.date_achat, t.dateBrute);
      return { id: a.id, ref: a.ref_fournisseur || '', client: a.fournisseur || '', _type: 'achat', _score: s.total, _detail: s.detail };
    }).filter(function(c) { return c._score >= SEUIL_MINIMAL; });

    // Meilleur score global en premier — toujours une proposition,
    // jamais un choix imposé.
    const toutes = correspondancesFactures.concat(correspondancesAchats).sort(function(a, b) { return b._score - a._score; });
    return Object.assign({}, t, { correspondances: toutes });
  });
}

async function analyserReleve(releveId) {
  const releve = (STATE.releves || []).find(function(r) { return String(r.id) === String(releveId); });
  if (!releve) return;
  showToast('🔍 Lecture du relevé en cours...');
  const transactions = await lireReleveBancaire(releve.data);
  if (!transactions || !transactions.length) {
    showToast('⚠️ Aucune transaction reconnue dans ce relevé — la mise en page de cette banque n\'est peut-être pas encore prise en charge', 'error');
    return;
  }
  const avecSuggestions = suggererRapprochements(transactions);
  STATE._transactionsReleveActuel = avecSuggestions;
  renderTransactionsReleve();
  goScreen('rapprochement-releve', null);
}

function renderTransactionsReleve() {
  const zone = el('rapprochement-releve-content');
  if (!zone) return;
  const transactions = STATE._transactionsReleveActuel || [];
  if (!transactions.length) {
    zone.innerHTML = '<div class="empty"><div class="empty-ico">🏦</div><div class="empty-title">Aucune transaction</div></div>';
    return;
  }
  zone.innerHTML = '<div style="padding:10px 20px;font-size:11px;color:#9C9186">Lecture automatique — à vérifier avant de confirmer. Certaines transactions peuvent manquer ou être mal reconnues selon la mise en page de votre banque.</div>' +
    transactions.map(function(t, i) {
      const aDesCorrespondances = t.correspondances && t.correspondances.length > 0;
      return '<div style="background:#fff;border-radius:12px;padding:14px;margin:0 20px 10px;border:1px solid #E3DCCF">' +
        '<div style="display:flex;justify-content:space-between;margin-bottom:8px">' +
          '<span style="font-size:12px;color:#6B5F54">' + escapeHTML(t.dateBrute) + ' · ' + escapeHTML(t.description) + '</span>' +
          '<span style="font-weight:700;font-size:13px">' + fmt(t.montant) + ' MAD</span>' +
        '</div>' +
        (aDesCorrespondances
          ? t.correspondances.map(function(f) {
              const estAchat = f._type === 'achat';
              const libelle = estAchat ? 'l\'achat' : 'la facture';
              const couleurFond = estAchat ? '#F5E4E1' : '#EEF3E4';
              const couleurTexte = estAchat ? '#8E2E24' : '#55702E';
              // NOUVEAU (retour utilisateur) : badge de confiance basé sur
              // le nom + la date, en plus du montant déjà garanti exact —
              // aide à repérer en un coup d'œil la proposition la plus
              // fiable quand plusieurs factures ont le même montant.
              // Nouveaux seuils : le score global va maintenant de 0 à 1
              // (pondération montant 50% / nom 30% / date 20%).
              const badge = f._score >= 0.75 ? '<span style="background:#1F6F72;color:#fff;font-size:9px;font-weight:700;padding:1px 6px;border-radius:6px;margin-left:6px">✓✓ Forte correspondance</span>'
                : f._score >= 0.5 ? '<span style="background:#C9971F;color:#fff;font-size:9px;font-weight:700;padding:1px 6px;border-radius:6px;margin-left:6px">✓ Correspondance probable</span>'
                : '<span style="background:#9C9186;color:#fff;font-size:9px;font-weight:700;padding:1px 6px;border-radius:6px;margin-left:6px">? À vérifier</span>';
              return '<button onclick="confirmerRapprochementReleve(\'' + f.id + '\',\'' + f._type + '\',' + i + ')" style="width:100%;padding:9px;background:' + couleurFond + ';color:' + couleurTexte + ';border:none;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer;font-family:inherit;text-align:left;margin-bottom:4px">✅ Lier à ' + libelle + ' ' + escapeHTML(f.ref || '') + ' — ' + escapeHTML(f.client || '') + badge + '</button>';
            }).join('')
          : '<div style="font-size:11px;color:#9C9186">Aucune correspondance trouvée</div>') +
      '</div>';
    }).join('');
}

// FIX (retour utilisateur) : prend maintenant un paramètre type
// ('facture' ou 'achat') pour mettre à jour la bonne table — auparavant
// cette fonction ne savait faire que des factures de vente.
async function confirmerRapprochementReleve(id, type, indexTransaction) {
  if (type === 'achat') {
    try {
      await sb.patch('factures_achat', 'id=eq.' + id + '&user_id=eq.' + (STATE.entrepriseId || sb.user.id), { statut: 'payee' });
      const a = (STATE.achats || []).find(function(x) { return String(x.id) === String(id); });
      if (a) a.statut = 'payee';
    } catch(e) { showToast('Erreur: ' + e.message, 'error'); return; }
  } else if (typeof marquerPayee === 'function') {
    await marquerPayee(id);
  } else {
    try {
      await sb.patch('factures', 'id=eq.' + id + '&user_id=eq.' + (STATE.entrepriseId || sb.user.id), { statut: 'payee' });
      const f = (STATE.factures || []).find(function(x) { return String(x.id) === String(id); });
      if (f) f.statut = 'payee';
    } catch(e) { showToast('Erreur: ' + e.message, 'error'); return; }
  }
  if (STATE._transactionsReleveActuel && STATE._transactionsReleveActuel[indexTransaction]) {
    STATE._transactionsReleveActuel[indexTransaction].correspondances = [];
    STATE._transactionsReleveActuel[indexTransaction]._traitee = true;
  }
  renderTransactionsReleve();
  showToast(type === 'achat' ? '✅ Achat rapproché' : '✅ Facture rapprochée', 'success');
}
