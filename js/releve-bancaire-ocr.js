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

    // FIX (retour utilisateur) : le sens de l'opération (entrée/sortie)
    // était perdu ici — Math.abs() effaçait le signe, qu'il vienne d'un
    // montant unique déjà signé (négatif = sortie) ou d'une colonne
    // Débit/Crédit séparée. Sans cette info, une sortie d'argent (vers un
    // fournisseur) pouvait se faire proposer contre une facture de vente,
    // et inversement — un vrai risque de confusion. Le signe est
    // maintenant conservé : sens = 'sortie' (débit) ou 'entree' (crédit).
    const montantUnique = valeurColonne(ligne, ['montant', 'amount', 'somme']);
    const debit = valeurColonne(ligne, ['débit', 'debit', 'sortie', 'retrait', 'withdrawal']);
    const credit = valeurColonne(ligne, ['crédit', 'credit', 'entrée', 'entree', 'dépôt', 'depot', 'deposit']);

    let montant = null, sens = null;
    if (String(debit).trim() && parseFloat(String(debit).replace(/\s/g,'').replace(',','.')) !== 0 && !isNaN(parseFloat(String(debit).replace(/\s/g,'').replace(',','.')))) {
      montant = Math.abs(parseFloat(String(debit).replace(/\s/g,'').replace(',','.')));
      sens = 'sortie';
    } else if (String(credit).trim() && parseFloat(String(credit).replace(/\s/g,'').replace(',','.')) !== 0 && !isNaN(parseFloat(String(credit).replace(/\s/g,'').replace(',','.')))) {
      montant = Math.abs(parseFloat(String(credit).replace(/\s/g,'').replace(',','.')));
      sens = 'entree';
    } else if (String(montantUnique).trim()) {
      const val = parseFloat(String(montantUnique).replace(/\s/g,'').replace(',','.'));
      if (!isNaN(val) && val !== 0) { montant = Math.abs(val); sens = val < 0 ? 'sortie' : 'entree'; }
    }
    if (montant === null || montant <= 0 || montant > 10000000) return;

    transactions.push({ dateBrute: dateBrute, description: description.slice(0, 80), montant: montant, sens: sens });
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

    // NOUVEAU (retour utilisateur) : tente de détecter le sens de
    // l'opération — moins fiable qu'en Excel (pas de vraies colonnes
    // séparées dans du texte brut), mais deux indices restent
    // exploitables : un signe moins explicite juste avant le montant, ou
    // des mots-clés typiques du libellé. Si aucun des deux ne permet de
    // trancher, sens reste indéfini plutôt que d'inventer une réponse.
    let sens = null;
    const positionMontant = ligne.lastIndexOf(montantBrutTexte);
    if (positionMontant > 0 && ligne[positionMontant - 1] === '-') {
      sens = 'sortie';
    } else {
      const descNorm = _sansAccents(description.toLowerCase());
      const motsCles = {
        sortie: ['vir emis', 'virement emis', 'prlv', 'prelevement', 'retrait', 'paiement carte', 'cheque emis', 'frais'],
        entree: ['vir recu', 'virement recu', 'depot', 'remise cheque', 'versement'],
      };
      if (motsCles.sortie.some(function(m) { return descNorm.includes(m); })) sens = 'sortie';
      else if (motsCles.entree.some(function(m) { return descNorm.includes(m); })) sens = 'entree';
    }

    transactions.push({ dateBrute: dateBrute, description: description, montant: montant, sens: sens });
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

// Score de montant : compare au SOLDE RESTANT dû (pas au montant total de
// la facture) — indispensable pour les acomptes et paiements en
// plusieurs fois. Une transaction plus petite que le solde restant reste
// un candidat plausible (paiement partiel), avec un score modéré plutôt
// qu'une exclusion — impossible de deviner à l'avance le montant exact
// d'un acompte.
function _scoreMontant(montantRestant, montantTransaction) {
  const restant = Number(montantRestant) || 0;
  const trans = Number(montantTransaction) || 0;
  if (restant <= 0 || trans <= 0) return 0;
  const ecart = Math.abs(restant - trans);
  const ecartPct = ecart / restant;
  // Solde complet (avec tolérance pour frais bancaires/arrondis)
  if (ecart < 1) return 1;
  if (ecartPct <= 0.02) return 0.9;
  if (ecartPct <= 0.05) return 0.7;
  if (ecartPct <= 0.10) return 0.5;
  if (ecartPct <= 0.20) return 0.25;
  // Paiement partiel plausible : transaction plus petite que le solde
  // restant (acompte, tranche) — jamais exclu, score modéré.
  if (trans < restant) {
    const proportion = trans / restant;
    return proportion >= 0.10 ? 0.4 : 0.15;
  }
  return 0; // transaction nettement plus grande que ce qui est encore dû
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

// NOUVEAU (retour utilisateur) : les règles apprises sont chargées une
// fois par session et gardées en mémoire — évite de refaire un appel
// réseau à chaque transaction analysée. STATE.reglesRapprochement est un
// tableau de { motif, nom_cible, type }.
async function chargerReglesRapprochement() {
  try {
    const r = await fetch(SUPABASE_URL + '/rest/v1/regles_rapprochement?user_id=eq.' + (STATE.entrepriseId || sb.user?.id), {
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + sb.token }
    });
    STATE.reglesRapprochement = r.ok ? ((await r.json()) || []) : [];
  } catch(e) { STATE.reglesRapprochement = []; }
}

// Cherche si une règle apprise correspond au libellé de la transaction —
// retourne le nom cible enregistré si oui, sinon null. Recherche
// insensible aux accents/casse, comme le reste du système.
function _regleCorrespondante(descriptionTransaction, type) {
  const descNorm = _sansAccents(String(descriptionTransaction || '').toLowerCase());
  const regles = STATE.reglesRapprochement || [];
  const trouvee = regles.find(function(r) {
    return r.type === type && descNorm.includes(_sansAccents(String(r.motif || '').toLowerCase()));
  });
  return trouvee || null;
}

// NOUVEAU (retour utilisateur) : détecte si la référence de la facture/
// de l'achat (ex: "FAC-2026-001") apparaît telle quelle dans le libellé
// bancaire — arrive quand le client indique la référence en communication
// du virement. Signal très fiable quand présent, quasiment jamais un
// hasard vu la précision d'une référence de facture.
function _scoreReference(refDoc, descriptionTransaction) {
  const refNorm = _sansAccents(String(refDoc || '').toLowerCase()).replace(/\s/g, '');
  const descNorm = _sansAccents(String(descriptionTransaction || '').toLowerCase()).replace(/\s/g, '');
  if (refNorm && refNorm.length >= 4 && descNorm.includes(refNorm)) return 1;
  return 0;
}

// Score global pondéré et EXPLICABLE — chaque composante est renvoyée en
// détail, affichable pour que l'entreprise comprenne pourquoi une
// proposition est classée où elle l'est (pas une boîte noire).
// Une règle apprise ou une référence retrouvée dans le libellé sont des
// signaux quasi certains — ils dominent largement le score final dès
// qu'ils sont présents, même si montant/nom/date sont imparfaits.
function _scoreGlobalCorrespondance(montantDoc, montantTransaction, nomDoc, descriptionTransaction, dateDoc, dateTransactionBrute, refDoc, type) {
  const sMontant = _scoreMontant(montantDoc, montantTransaction);
  const sNom = _similariteNom(nomDoc, descriptionTransaction);
  const sDate = _scoreDate(dateDoc, dateTransactionBrute);
  const sReference = _scoreReference(refDoc, descriptionTransaction);
  const regle = _regleCorrespondante(descriptionTransaction, type);
  // Une règle apprise dit explicitement "ce libellé = ce client/fournisseur"
  // — mais le NOM CIBLE de la règle doit encore correspondre au document
  // évalué (une règle sert à plusieurs factures du même client, pas à en
  // désigner une seule) : le score de règle ne s'applique que si le nom du
  // document correspond au nom_cible de la règle trouvée.
  const sRegle = (regle && _sansAccents(String(nomDoc||'').toLowerCase()).includes(_sansAccents(String(regle.nom_cible||'').toLowerCase()))) ? 1 : 0;

  const base = sMontant * 0.45 + sNom * 0.25 + sDate * 0.15 + sReference * 0.15;
  // Référence et règle sont des signaux quasi certains : s'ils sont
  // présents, on relève fortement le plancher du score plutôt que de le
  // simplement additionner — pour qu'une référence exacte l'emporte
  // même face à un montant très différent (règlement partiel imprévu).
  const total = Math.max(base, sReference >= 1 ? 0.85 : 0, sRegle >= 1 ? 0.8 : 0);

  return {
    total: total,
    detail: { montant: sMontant, nom: sNom, date: sDate, reference: sReference, regle: sRegle > 0 }
  };
}

function suggererRapprochements(transactions) {
  // FIX (retour utilisateur) : une facture reste candidate tant qu'il lui
  // reste un solde à recevoir — pas seulement tant qu'elle n'a jamais
  // reçu aucun paiement. Indispensable pour les acomptes et paiements en
  // plusieurs fois : une facture ayant déjà reçu un premier acompte doit
  // continuer à apparaître pour le paiement suivant.
  const facturesCandidates = (STATE.factures || []).filter(function(f) {
    if (f.statut === 'refusee' || f.statut === 'annulee' || f.statut === 'brouillon') return false;
    return (Number(f.ttc) || 0) - (Number(f.montant_recu) || 0) > 0.5;
  });
  const achatsCandidats = (STATE.achats || []).filter(function(a) {
    return (Number(a.ttc) || 0) - (Number(a.montant_recu) || 0) > 0.5;
  });
  // Seuil minimal pour même apparaître comme proposition — évite de
  // noyer l'entreprise sous des dizaines de factures sans aucun rapport
  // réel, tout en restant assez large pour capter un règlement partiel
  // avec un nom mal reconnu, par exemple.
  const SEUIL_MINIMAL = 0.15;

  return transactions.map(function(t) {
    // NOUVEAU (retour utilisateur) : ne cherche du côté factures que si
    // la transaction est une ENTRÉE d'argent (ou si le sens n'a pas pu
    // être détecté — mieux vaut chercher un peu trop large que rater un
    // vrai rapprochement à cause d'une détection de sens imparfaite),
    // et du côté achats que si c'est une SORTIE. Empêche par exemple un
    // paiement fournisseur de se faire proposer contre une facture de
    // vente au même montant, par pur hasard.
    const chercherFactures = t.sens !== 'sortie';
    const chercherAchats = t.sens !== 'entree';

    const correspondancesFactures = !chercherFactures ? [] : facturesCandidates.map(function(f) {
      const soldeRestant = (Number(f.ttc) || 0) - (Number(f.montant_recu) || 0);
      const s = _scoreGlobalCorrespondance(soldeRestant, t.montant, f.client, t.description, f.echeance || f.date_emission, t.dateBrute, f.ref, 'facture');
      // NOUVEAU (retour utilisateur) : nombre de transactions déjà liées
      // à cette facture (acomptes précédents) — information utile, pas
      // un blocage, puisqu'un paiement en plusieurs fois est normal.
      const dejaLiees = (f.transactions_bancaires_liees || []).length;
      return { id: f.id, ref: f.ref, client: f.client, _type: 'facture', _score: s.total, _detail: s.detail, _soldeRestant: soldeRestant, _dejaLiees: dejaLiees };
    }).filter(function(c) { return c._score >= SEUIL_MINIMAL; });

    const correspondancesAchats = !chercherAchats ? [] : achatsCandidats.map(function(a) {
      const soldeRestant = (Number(a.ttc) || 0) - (Number(a.montant_recu) || 0);
      const s = _scoreGlobalCorrespondance(soldeRestant, t.montant, a.fournisseur, t.description, a.echeance || a.date_achat, t.dateBrute, a.ref_fournisseur, 'achat');
      const dejaLiees = (a.transactions_bancaires_liees || []).length;
      return { id: a.id, ref: a.ref_fournisseur || '', client: a.fournisseur || '', _type: 'achat', _score: s.total, _detail: s.detail, _soldeRestant: soldeRestant, _dejaLiees: dejaLiees };
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
  // NOUVEAU (retour utilisateur) : charge les règles de rapprochement
  // apprises avant de lancer le matching — sans ça, une règle enregistrée
  // lors d'une session précédente ne serait jamais prise en compte.
  if (!STATE.reglesRapprochement) await chargerReglesRapprochement();
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

// Construit et parse le résumé texte stocké dans transaction_bancaire_ref
// — format simple "date|montant|description", pour rester lisible en
// base directement (utile si un jour quelqu'un regarde la table).
function _construireRefTransaction(t) {
  return (t.dateBrute || '') + '|' + (t.montant || '') + '|' + (t.description || '').slice(0, 60);
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
      // NOUVEAU (retour utilisateur) : signe visuel bidirectionnel — si
      // cette transaction précise a déjà été liée à une facture/achat
      // (recherchée dans la liste transactions_bancaires_liees), on
      // l'affiche comme "déjà rapprochée" plutôt que de reproposer les
      // mêmes boutons "Lier".
      const refTransaction = _construireRefTransaction(t);
      const dejaLieeAvec = (STATE.factures || []).find(function(f) { return (f.transactions_bancaires_liees || []).includes(refTransaction); })
        || (STATE.achats || []).find(function(a) { return (a.transactions_bancaires_liees || []).includes(refTransaction); });

      if (t._traitee || dejaLieeAvec) {
        const doc = dejaLieeAvec || {};
        const estAchatDeja = !!doc.fournisseur;
        return '<div style="background:#EEF3E4;border-radius:12px;padding:14px;margin:0 20px 10px;border:1px solid #DCE8C7">' +
          '<div style="display:flex;justify-content:space-between;margin-bottom:6px">' +
            '<span style="font-size:12px;color:#55702E">' + escapeHTML(t.dateBrute) + ' · ' + escapeHTML(t.description) + '</span>' +
            '<span style="font-weight:700;font-size:13px;color:#55702E">' + fmt(t.montant) + ' MAD</span>' +
          '</div>' +
          '<div style="font-size:12px;color:#55702E;font-weight:600">✅ Déjà rapprochée' + (doc.ref || doc.ref_fournisseur ? ' — ' + escapeHTML(doc.ref || doc.ref_fournisseur) : '') + '</div>' +
        '</div>';
      }

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
              const badge = f._score >= 0.75 ? '<span style="background:#1F6F72;color:#fff;font-size:9px;font-weight:700;padding:1px 6px;border-radius:6px;margin-left:6px">✓✓ Forte correspondance</span>'
                : f._score >= 0.5 ? '<span style="background:#C9971F;color:#fff;font-size:9px;font-weight:700;padding:1px 6px;border-radius:6px;margin-left:6px">✓ Correspondance probable</span>'
                : '<span style="background:#9C9186;color:#fff;font-size:9px;font-weight:700;padding:1px 6px;border-radius:6px;margin-left:6px">? À vérifier</span>';
              // NOUVEAU (retour utilisateur) : un acompte ou un paiement
              // en plusieurs fois est normal — au lieu d'un avertissement
              // de doublon, indique simplement combien de transactions
              // sont déjà liées et ce qu'il reste à recevoir, en info
              // neutre, pas comme un problème à corriger.
              const infoAcompte = f._dejaLiees > 0
                ? '<div style="font-size:10px;color:#1F6F72;margin-top:3px">ℹ️ ' + f._dejaLiees + ' paiement(s) déjà lié(s) — solde restant : ' + fmt(f._soldeRestant) + ' MAD</div>'
                : (f._soldeRestant - t.montant > 1 ? '<div style="font-size:10px;color:#9C9186;margin-top:3px">Paiement partiel — resterait ' + fmt(f._soldeRestant - t.montant) + ' MAD après ce lien</div>' : '');
              return '<button onclick="confirmerRapprochementReleve(\'' + f.id + '\',\'' + f._type + '\',' + i + ')" style="width:100%;padding:9px;background:' + couleurFond + ';color:' + couleurTexte + ';border:none;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer;font-family:inherit;text-align:left;margin-bottom:4px">✅ Lier à ' + libelle + ' ' + escapeHTML(f.ref || '') + ' — ' + escapeHTML(f.client || '') + badge + infoAcompte + '</button>';
            }).join('')
          : '<div style="font-size:11px;color:#9C9186">Aucune correspondance trouvée</div>') +
      '</div>';
    }).join('');
}

// FIX (retour utilisateur) : gère maintenant correctement les paiements
// en plusieurs fois (acompte + solde, ou plusieurs tranches) — au lieu
// de marquer la facture payée dès le premier lien, cumule le montant
// reçu et ne marque payée que si le solde restant est bien couvert.
// Chaque transaction liée s'ajoute à la liste (transactions_bancaires_liees),
// aucune n'écrase les précédentes.
async function confirmerRapprochementReleve(id, type, indexTransaction) {
  const t = STATE._transactionsReleveActuel && STATE._transactionsReleveActuel[indexTransaction];
  if (!t) return;
  const refTransaction = _construireRefTransaction(t);
  const table = type === 'achat' ? 'factures_achat' : 'factures';
  const collection = type === 'achat' ? (STATE.achats || []) : (STATE.factures || []);
  const doc = collection.find(function(x) { return String(x.id) === String(id); });
  if (!doc) { showToast('Document introuvable', 'error'); return; }

  const montantRecuActuel = Number(doc.montant_recu) || 0;
  const nouveauMontantRecu = Math.min(Number(doc.ttc) || 0, montantRecuActuel + t.montant);
  const soldeCouvert = (Number(doc.ttc) || 0) - nouveauMontantRecu <= 0.5;
  const listeTransactions = (doc.transactions_bancaires_liees || []).concat([refTransaction]);

  const maj = {
    montant_recu: nouveauMontantRecu,
    transactions_bancaires_liees: listeTransactions,
  };
  if (soldeCouvert) maj.statut = 'payee';

  try {
    await sb.patch(table, 'id=eq.' + id + '&user_id=eq.' + (STATE.entrepriseId || sb.user.id), maj);
    Object.assign(doc, maj);
  } catch(e) { showToast('Erreur: ' + e.message, 'error'); return; }

  if (STATE._transactionsReleveActuel && STATE._transactionsReleveActuel[indexTransaction]) {
    STATE._transactionsReleveActuel[indexTransaction].correspondances = [];
    STATE._transactionsReleveActuel[indexTransaction]._traitee = true;
  }
  renderTransactionsReleve();
  showToast(soldeCouvert
    ? (type === 'achat' ? '✅ Achat soldé' : '✅ Facture soldée')
    : '✅ Paiement partiel enregistré — reste ' + fmt((Number(doc.ttc)||0) - nouveauMontantRecu) + ' MAD', 'success');
}

// ============================================================
// NOUVEAU (retour utilisateur) : rapprochement lancé DEPUIS la facture
// (pas seulement depuis l'écran de relevé) — cherche parmi TOUS les
// relevés déjà importés et analysés en mémoire cette session, propose
// les transactions qui correspondent le mieux à cette facture précise.
// ============================================================
// NOUVEAU (retour utilisateur) : montre désormais TOUTES les
// transactions bancaires disponibles pour cette facture, pas seulement
// celles au-dessus d'un seuil de score — l'entreprise peut ainsi choisir
// elle-même une transaction que l'algorithme aurait mal classée, plutôt
// que de ne jamais la voir du tout. Le détail du score (montant/nom/
// date/référence/règle) est affiché pour chaque ligne, pas une boîte
// noire.
function ouvrirRapprochementDepuisFacture(factureId, type) {
  const doc = type === 'achat'
    ? (STATE.achats || []).find(function(x) { return String(x.id) === String(factureId); })
    : (STATE.factures || []).find(function(x) { return String(x.id) === String(factureId); });
  if (!doc) return;

  // Rassemble les transactions déjà détectées dans un relevé consulté
  // cette session (STATE._transactionsReleveActuel) — c'est la seule
  // source disponible sans redemander à l'entreprise de re-analyser un
  // relevé pour chaque facture une par une.
  const transactionsDisponibles = STATE._transactionsReleveActuel || [];
  if (!transactionsDisponibles.length) {
    showToast('⚠️ Ouvrez d\'abord un relevé et cliquez "Analyser" pour pouvoir rapprocher depuis une facture', 'error');
    return;
  }

  const nomDoc = type === 'achat' ? doc.fournisseur : doc.client;
  const soldeRestant = (Number(doc.ttc) || 0) - (Number(doc.montant_recu) || 0);
  const dateDoc = doc.echeance || doc.date_emission || doc.date_achat;

  // FIX (retour utilisateur) : plus AUCUN seuil de score ici — toute
  // transaction du relevé ouvert est listée, même avec un score de 0.
  // Le seuil de suggererRapprochements() reste utile pour ne pas noyer
  // l'écran de rapprochement automatique, mais ici l'entreprise a
  // délibérément ouvert cette liste pour UNE facture précise — elle
  // doit tout voir.
  const candidats = transactionsDisponibles.map(function(t, idx) {
    const s = _scoreGlobalCorrespondance(soldeRestant, t.montant, nomDoc, t.description, dateDoc, t.dateBrute, doc.ref || doc.ref_fournisseur, type || 'facture');
    return { t: t, idx: idx, score: s.total, detail: s.detail };
  }).sort(function(a, b) { return b.score - a.score; });

  const overlay = document.createElement('div');
  overlay.id = 'rapprochement-depuis-facture-overlay';
  overlay.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,0.6);display:flex;align-items:flex-end;justify-content:center';
  overlay.innerHTML =
    '<div style="background:#fff;border-radius:20px 20px 0 0;padding:20px;max-width:460px;width:100%;max-height:78vh;overflow-y:auto">' +
      '<div style="width:40px;height:4px;background:#E3DCCF;border-radius:2px;margin:0 auto 14px"></div>' +
      '<div style="font-size:15px;font-weight:700;margin-bottom:4px">🏦 Toutes les opérations bancaires</div>' +
      '<div style="font-size:12px;color:#9C9186;margin-bottom:14px">' + escapeHTML(doc.ref || doc.ref_fournisseur || '') + ' — solde restant : ' + fmt(soldeRestant) + ' MAD</div>' +
      candidats.map(function(c) {
        const badge = c.detail.regle ? '🔒 Règle' : c.detail.reference >= 1 ? '🎯 Réf. trouvée' : c.score >= 0.75 ? '✓✓ Forte' : c.score >= 0.5 ? '✓ Probable' : c.score >= 0.15 ? '? Faible' : '— Aucun signal';
        const couleurBadge = c.detail.regle || c.detail.reference >= 1 ? '#1F6F72' : c.score >= 0.75 ? '#1F6F72' : c.score >= 0.5 ? '#C9971F' : '#9C9186';
        return '<div style="border:1px solid #E3DCCF;border-radius:10px;padding:10px;margin-bottom:8px">' +
          '<div style="display:flex;justify-content:space-between;margin-bottom:4px">' +
            '<span style="font-size:11px;color:#6B5F54">' + escapeHTML(c.t.dateBrute) + '</span>' +
            '<span style="font-size:9px;font-weight:700;color:#fff;background:' + couleurBadge + ';padding:1px 6px;border-radius:6px">' + badge + '</span>' +
          '</div>' +
          '<div style="font-size:12px;margin-bottom:6px">' + escapeHTML(c.t.description) + ' — <strong>' + fmt(c.t.montant) + ' MAD</strong></div>' +
          '<div style="display:flex;gap:6px">' +
            '<button onclick="confirmerRapprochementReleve(\'' + factureId + '\',\'' + (type||'facture') + '\',' + c.idx + ');document.getElementById(\'rapprochement-depuis-facture-overlay\').remove()" style="flex:1;padding:7px;background:#EEF3E4;color:#55702E;border:none;border-radius:8px;font-size:11px;font-weight:600;cursor:pointer;font-family:inherit">✅ Lier</button>' +
            '<button onclick="ouvrirCreationRegle(' + c.idx + ',' + JSON.stringify(nomDoc) + ',' + JSON.stringify(type||'facture') + ')" style="padding:7px 10px;background:#F1EEE8;color:#6B5F54;border:none;border-radius:8px;font-size:11px;cursor:pointer;font-family:inherit">🔒 Créer une règle</button>' +
          '</div>' +
        '</div>';
      }).join('') +
      '<button onclick="document.getElementById(\'rapprochement-depuis-facture-overlay\').remove()" style="width:100%;padding:11px;background:none;color:#9C9186;border:none;font-size:13px;cursor:pointer;font-family:inherit;margin-top:6px">Fermer</button>' +
    '</div>';
  overlay.addEventListener('click', function(e) { if (e.target === overlay) overlay.remove(); });
  document.body.appendChild(overlay);
}

// NOUVEAU (retour utilisateur) : ouvre une petite fenêtre pour confirmer
// le mot-clé à mémoriser comme règle — pré-rempli avec un extrait du
// libellé de la transaction, modifiable avant d'enregistrer. Une règle
// dit "quand ce mot apparaît dans un virement, c'est toujours ce
// client/fournisseur" — utile quand la banque affiche un nom très
// différent de la raison sociale enregistrée (nom du gérant, ancien
// nom, abréviation...).
function ouvrirCreationRegle(indexTransaction, nomCible, type) {
  const t = STATE._transactionsReleveActuel && STATE._transactionsReleveActuel[indexTransaction];
  if (!t) return;
  const motifSuggere = (t.description || '').trim();

  const overlay = document.createElement('div');
  overlay.id = 'creation-regle-overlay';
  overlay.style.cssText = 'position:fixed;inset:0;z-index:10000;background:rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;padding:20px';
  overlay.innerHTML =
    '<div style="background:#fff;border-radius:16px;padding:20px;max-width:380px;width:100%">' +
      '<div style="font-size:14px;font-weight:700;margin-bottom:6px">🔒 Créer une règle de rapprochement</div>' +
      '<div style="font-size:11px;color:#9C9186;margin-bottom:12px">Quand un virement contient ce mot, il sera automatiquement proposé pour <strong>' + escapeHTML(nomCible) + '</strong>.</div>' +
      '<label style="font-size:11px;font-weight:600;color:#6B5F54;display:block;margin-bottom:4px">Mot-clé à reconnaître</label>' +
      '<input id="regle-motif-input" class="f-inp" value="' + escapeHTML(motifSuggere) + '" style="margin-bottom:12px">' +
      '<div style="display:flex;gap:8px">' +
        '<button onclick="document.getElementById(\'creation-regle-overlay\').remove()" style="flex:1;padding:11px;background:#F1EEE8;color:#6B5F54;border:none;border-radius:10px;font-size:13px;cursor:pointer;font-family:inherit">Annuler</button>' +
        '<button onclick="confirmerCreationRegle(' + JSON.stringify(nomCible) + ',' + JSON.stringify(type) + ')" style="flex:1;padding:11px;background:#1F6F72;color:#fff;border:none;border-radius:10px;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit">Enregistrer</button>' +
      '</div>' +
    '</div>';
  overlay.addEventListener('click', function(e) { if (e.target === overlay) overlay.remove(); });
  document.body.appendChild(overlay);
  setTimeout(function() { el('regle-motif-input')?.focus(); }, 100);
}

async function confirmerCreationRegle(nomCible, type) {
  const motif = (el('regle-motif-input')?.value || '').trim();
  if (!motif || motif.length < 3) { showToast('Entrez au moins 3 caractères', 'error'); return; }
  try {
    await fetch(SUPABASE_URL + '/rest/v1/regles_rapprochement', {
      method: 'POST',
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + sb.token, 'Content-Type': 'application/json', 'Prefer': 'return=representation' },
      body: JSON.stringify({ user_id: (STATE.entrepriseId || sb.user.id), motif: motif, nom_cible: nomCible, type: type })
    }).then(async function(r) {
      if (r.ok) {
        const data = await r.json();
        STATE.reglesRapprochement = (STATE.reglesRapprochement || []).concat(data);
      }
    });
    document.getElementById('creation-regle-overlay')?.remove();
    showToast('✅ Règle enregistrée — "' + motif + '" sera reconnu automatiquement', 'success');
  } catch(e) {
    showToast('Erreur: ' + e.message, 'error');
  }
}
