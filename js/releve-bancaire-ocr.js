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

    // FIX (retour utilisateur) : le montant est maintenant SIGNÉ
    // directement — négatif pour une sortie d'argent (débit), positif
    // pour une entrée (crédit) — comme sur un vrai relevé bancaire.
    // Avant, Math.abs() effaçait cette information, avec un risque réel
    // de confondre un paiement fournisseur et un encaissement client au
    // même montant.
    const montantUnique = valeurColonne(ligne, ['montant', 'amount', 'somme']);
    const debit = valeurColonne(ligne, ['débit', 'debit', 'sortie', 'retrait', 'withdrawal']);
    const credit = valeurColonne(ligne, ['crédit', 'credit', 'entrée', 'entree', 'dépôt', 'depot', 'deposit']);

    let montant = null;
    if (String(debit).trim() && !isNaN(parseFloat(String(debit).replace(/\s/g,'').replace(',','.'))) && parseFloat(String(debit).replace(/\s/g,'').replace(',','.')) !== 0) {
      montant = -Math.abs(parseFloat(String(debit).replace(/\s/g,'').replace(',','.')));
    } else if (String(credit).trim() && !isNaN(parseFloat(String(credit).replace(/\s/g,'').replace(',','.'))) && parseFloat(String(credit).replace(/\s/g,'').replace(',','.')) !== 0) {
      montant = Math.abs(parseFloat(String(credit).replace(/\s/g,'').replace(',','.')));
    } else if (String(montantUnique).trim()) {
      const val = parseFloat(String(montantUnique).replace(/\s/g,'').replace(',','.'));
      if (!isNaN(val) && val !== 0) montant = val; // déjà signé si la colonne l'était
    }
    if (montant === null || Math.abs(montant) > 10000000) return;

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
    let montant = parseFloat(montantBrut);
    if (isNaN(montant) || montant <= 0 || montant > 10000000) continue;

    const description = descriptionBrute
      .replace(/[|;]/g, ' ')
      .trim()
      .slice(0, 80);
    if (description.length < 3) continue;

    // NOUVEAU (retour utilisateur) : montant signé — négatif pour une
    // sortie d'argent, positif pour une entrée — comme sur un vrai
    // relevé. Moins fiable qu'en Excel (pas de vraies colonnes séparées
    // dans du texte brut), mais deux indices restent exploitables : un
    // signe moins explicite juste avant le montant, ou des mots-clés
    // typiques du libellé. Si aucun des deux ne permet de trancher, le
    // montant reste positif par défaut plutôt que d'inventer une réponse
    // — dans ce cas, le rapprochement cherchera des deux côtés (voir
    // suggererRapprochements).
    const positionMontant = ligne.lastIndexOf(montantBrutTexte);
    if (positionMontant > 0 && ligne[positionMontant - 1] === '-') {
      montant = -montant;
    } else {
      const descNorm = _sansAccents(description.toLowerCase());
      const motsSortie = ['vir emis', 'virement emis', 'prlv', 'prelevement', 'retrait', 'paiement carte', 'cheque emis', 'frais'];
      if (motsSortie.some(function(m) { return descNorm.includes(m); })) montant = -montant;
    }

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

  // FIX (retour utilisateur) : "la première règle à prendre : nom du
  // fournisseur/client = nom du libellé de paiement" — le NOM est
  // maintenant le signal prioritaire, pas le montant. Un même nom
  // clairement retrouvé dans le libellé est en soi un très bon indice,
  // même si le montant ne correspond pas exactement (accompte, écart de
  // frais...). Le montant reste important mais vient renforcer le nom,
  // pas l'inverse.
  const base = sNom * 0.40 + sMontant * 0.30 + sDate * 0.15 + sReference * 0.15;
  // Référence et règle sont des signaux quasi certains : s'ils sont
  // présents, on relève fortement le plancher du score plutôt que de le
  // simplement additionner — pour qu'une référence exacte l'emporte
  // même face à un montant très différent (règlement partiel imprévu).
  // Un nom parfaitement identique fait de même : c'est le critère
  // prioritaire demandé, il doit pouvoir porter le score seul si besoin.
  const total = Math.max(base, sReference >= 1 ? 0.85 : 0, sRegle >= 1 ? 0.8 : 0, sNom >= 1 ? 0.7 : 0);

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
    // NOUVEAU (retour utilisateur) : le sens se lit directement sur le
    // signe du montant — négatif = sortie, positif = entrée. Plus de
    // champ séparé à maintenir en double.
    const chercherFactures = t.montant >= 0;
    const chercherAchats = t.montant <= 0;
    const montantAbs = Math.abs(t.montant);

    const correspondancesFactures = !chercherFactures ? [] : facturesCandidates.map(function(f) {
      const soldeRestant = (Number(f.ttc) || 0) - (Number(f.montant_recu) || 0);
      const s = _scoreGlobalCorrespondance(soldeRestant, montantAbs, f.client, t.description, f.echeance || f.date_emission, t.dateBrute, f.ref, 'facture');
      // NOUVEAU (retour utilisateur) : nombre de transactions déjà liées
      // à cette facture (acomptes précédents) — information utile, pas
      // un blocage, puisqu'un paiement en plusieurs fois est normal.
      const dejaLiees = (f.transactions_bancaires_liees || []).length;
      return { id: f.id, ref: f.ref, client: f.client, _type: 'facture', _score: s.total, _detail: s.detail, _soldeRestant: soldeRestant, _dejaLiees: dejaLiees };
    }).filter(function(c) { return c._score >= SEUIL_MINIMAL; });

    const correspondancesAchats = !chercherAchats ? [] : achatsCandidats.map(function(a) {
      const soldeRestant = (Number(a.ttc) || 0) - (Number(a.montant_recu) || 0);
      const s = _scoreGlobalCorrespondance(soldeRestant, montantAbs, a.fournisseur, t.description, a.echeance || a.date_achat, t.dateBrute, a.ref_fournisseur, 'achat');
      const dejaLiees = (a.transactions_bancaires_liees || []).length;
      return { id: a.id, ref: a.ref_fournisseur || '', client: a.fournisseur || '', _type: 'achat', _score: s.total, _detail: s.detail, _soldeRestant: soldeRestant, _dejaLiees: dejaLiees };
    }).filter(function(c) { return c._score >= SEUIL_MINIMAL; });

    // Meilleur score global en premier — toujours une proposition,
    // jamais un choix imposé.
    const toutes = correspondancesFactures.concat(correspondancesAchats).sort(function(a, b) { return b._score - a._score; });
    return Object.assign({}, t, { correspondances: toutes });
  });
}

// FIX (retour utilisateur) : STATE._transactionsReleveActuel n'existait
// qu'en mémoire vive — changer d'écran ne le viderait normalement pas,
// mais recharger la page (ou une session qui se réinitialise) faisait
// tout disparaître, y compris les transactions déjà traitées, obligeant
// à tout ré-analyser depuis zéro. Sauvegardé maintenant dans le
// stockage local du navigateur, par relevé — restauré automatiquement
// si ce même relevé est réanalysé plus tard, sans perdre l'état déjà
// confirmé.
function _cleStockageReleve(releveId) {
  return 'bp_releve_transactions_' + releveId;
}
function _sauvegarderTransactionsReleveLocal(releveId, transactions) {
  try {
    localStorage.setItem(_cleStockageReleve(releveId), JSON.stringify(transactions));
  } catch(e) { console.warn('Sauvegarde locale du relevé impossible:', e); }
}
function _chargerTransactionsReleveLocal(releveId) {
  try {
    const brut = localStorage.getItem(_cleStockageReleve(releveId));
    return brut ? JSON.parse(brut) : null;
  } catch(e) { return null; }
}

async function analyserReleve(releveId) {
  const releve = (STATE.releves || []).find(function(r) { return String(r.id) === String(releveId); });
  if (!releve) return;

  // Restaure directement depuis le stockage local si ce relevé a déjà
  // été analysé auparavant — évite de tout refaire, et conserve l'état
  // de ce qui était déjà confirmé.
  const dejaAnalyse = _chargerTransactionsReleveLocal(releveId);
  if (dejaAnalyse && dejaAnalyse.length) {
    STATE._transactionsReleveActuel = dejaAnalyse;
    STATE._releveActuelId = releveId;
    renderTransactionsReleve();
    goScreen('rapprochement-releve', null);
    return;
  }

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
  STATE._releveActuelId = releveId;
  _sauvegarderTransactionsReleveLocal(releveId, avecSuggestions);
  renderTransactionsReleve();
  goScreen('rapprochement-releve', null);
}

// NOUVEAU (retour utilisateur) : force une vraie relecture du fichier,
// en ignorant la version sauvegardée localement — utile si le relevé a
// changé, ou en cas de doute sur la fiabilité de ce qui est affiché.
async function reanalyserReleveDepuisZero(releveId) {
  try { localStorage.removeItem(_cleStockageReleve(releveId)); } catch(e) {}
  await analyserReleve(releveId);
}

// FIX (retour utilisateur) : "4000" et "4000.00" désignaient la même
// transaction mais étaient deux chaînes DIFFÉRENTES pour la détection
// "déjà rapprochée" — un montant sans décimales fixes ici, un autre
// avec .toFixed(2) dans _appliquerAllocationRapprochement(). Résultat
// concret : une facture déjà rapprochée réapparaissait comme "à
// rapprocher" à chaque nouvel import du même relevé, obligeant à tout
// refaire. Format maintenant strictement identique partout dans ce
// fichier — voir aussi _appliquerAllocationRapprochement().
function _construireRefTransaction(t) {
  return (t.dateBrute || '') + '|' + Math.abs(Number(t.montant) || 0).toFixed(2) + '|' + (t.description || '').slice(0, 60);
}

// NOUVEAU (retour utilisateur) : filtres sur l'écran de rapprochement —
// statut de liaison, montant, nom d'entreprise associée, recherche libre
// dans le libellé, et niveau de confiance. Les filtres se combinent tous
// entre eux (ET logique), comme les filtres déjà en place ailleurs dans
// l'app (écran Stats).
STATE._filtreReleveStatut = STATE._filtreReleveStatut || 'tous';
STATE._filtreReleveRecherche = STATE._filtreReleveRecherche || '';
STATE._filtreReleveMontantMin = STATE._filtreReleveMontantMin || null;
STATE._filtreReleveMontantMax = STATE._filtreReleveMontantMax || null;
STATE._filtreReleveConfiance = STATE._filtreReleveConfiance || 'tous';

// Retrouve, pour une transaction donnée, le document déjà lié s'il y en
// a un — réutilisé à la fois par le filtre "Liées/Non liées" et par le
// rendu de chaque ligne, pour ne calculer ça qu'une seule fois par appel.
function _documentLieATransaction(t) {
  const refTransaction = _construireRefTransaction(t);
  return (STATE.factures || []).find(function(f) { return (f.transactions_bancaires_liees || []).includes(refTransaction); })
    || (STATE.achats || []).find(function(a) { return (a.transactions_bancaires_liees || []).includes(refTransaction); });
}

function _appliquerFiltresReleve(transactionsAvecIndex) {
  const q = _sansAccents(STATE._filtreReleveRecherche.toLowerCase().trim());
  return transactionsAvecIndex.filter(function(item) {
    const t = item.t;
    const estLiee = !!(t._traitee || _documentLieATransaction(t));

    if (STATE._filtreReleveStatut === 'liees' && !estLiee) return false;
    if (STATE._filtreReleveStatut === 'non-liees' && estLiee) return false;

    if (q && !_sansAccents((t.description||'').toLowerCase()).includes(q)) return false;

    const montantAbs = Math.abs(t.montant);
    if (STATE._filtreReleveMontantMin != null && montantAbs < STATE._filtreReleveMontantMin) return false;
    if (STATE._filtreReleveMontantMax != null && montantAbs > STATE._filtreReleveMontantMax) return false;

    if (STATE._filtreReleveConfiance !== 'tous' && !estLiee) {
      const meilleurScore = (t.correspondances && t.correspondances.length) ? t.correspondances[0]._score : 0;
      if (STATE._filtreReleveConfiance === 'forte' && meilleurScore < 0.75) return false;
      if (STATE._filtreReleveConfiance === 'probable' && (meilleurScore < 0.5 || meilleurScore >= 0.75)) return false;
      if (STATE._filtreReleveConfiance === 'faible' && meilleurScore >= 0.5) return false;
      if (STATE._filtreReleveConfiance === 'aucune' && (t.correspondances && t.correspondances.length > 0)) return false;
    }
    return true;
  });
}

function changerFiltreReleveStatut(valeur) { STATE._filtreReleveStatut = valeur; renderTransactionsReleve(); }
function changerFiltreReleveConfiance(valeur) { STATE._filtreReleveConfiance = valeur; renderTransactionsReleve(); }
function rechercherDansReleve(valeur) { STATE._filtreReleveRecherche = valeur; renderTransactionsReleve(); }
function appliquerFiltreMontantReleve() {
  const min = el('releve-filtre-montant-min')?.value;
  const max = el('releve-filtre-montant-max')?.value;
  STATE._filtreReleveMontantMin = min ? parseFloat(min) : null;
  STATE._filtreReleveMontantMax = max ? parseFloat(max) : null;
  renderTransactionsReleve();
}
function effacerFiltresReleve() {
  STATE._filtreReleveStatut = 'tous';
  STATE._filtreReleveRecherche = '';
  STATE._filtreReleveMontantMin = null;
  STATE._filtreReleveMontantMax = null;
  STATE._filtreReleveConfiance = 'tous';
  el('releve-filtre-recherche') && (el('releve-filtre-recherche').value = '');
  el('releve-filtre-montant-min') && (el('releve-filtre-montant-min').value = '');
  el('releve-filtre-montant-max') && (el('releve-filtre-montant-max').value = '');
  el('releve-filtre-statut') && (el('releve-filtre-statut').value = 'tous');
  el('releve-filtre-confiance') && (el('releve-filtre-confiance').value = 'tous');
  renderTransactionsReleve();
}

function _barreFiltresReleve() {
  return '<div style="padding:0 20px 10px">' +
    // NOUVEAU (retour utilisateur) : accès direct à la gestion des
    // règles apprises — jusqu'ici, aucun écran ne permettait de les
    // revoir ou d'en supprimer une une fois créées.
    '<div style="display:flex;justify-content:flex-end;margin-bottom:8px">' +
      '<span onclick="ouvrirGestionRegles()" style="font-size:11px;color:#1F6F72;text-decoration:underline;cursor:pointer">🔒 Gérer mes règles (' + (STATE.reglesRapprochement||[]).length + ')</span>' +
    '</div>' +
    '<input id="releve-filtre-recherche" class="f-inp" placeholder="🔍 Rechercher dans le libellé..." value="' + escapeHTML(STATE._filtreReleveRecherche) + '" oninput="rechercherDansReleve(this.value)" style="margin-bottom:8px">' +
    '<div style="display:flex;gap:8px;margin-bottom:8px">' +
      '<select id="releve-filtre-statut" class="f-inp" style="flex:1" onchange="changerFiltreReleveStatut(this.value)">' +
        '<option value="tous"' + (STATE._filtreReleveStatut==='tous'?' selected':'') + '>Toutes</option>' +
        '<option value="liees"' + (STATE._filtreReleveStatut==='liees'?' selected':'') + '>Déjà liées</option>' +
        '<option value="non-liees"' + (STATE._filtreReleveStatut==='non-liees'?' selected':'') + '>Non liées</option>' +
      '</select>' +
      '<select id="releve-filtre-confiance" class="f-inp" style="flex:1" onchange="changerFiltreReleveConfiance(this.value)">' +
        '<option value="tous"' + (STATE._filtreReleveConfiance==='tous'?' selected':'') + '>Toute confiance</option>' +
        '<option value="forte"' + (STATE._filtreReleveConfiance==='forte'?' selected':'') + '>✓✓ Forte</option>' +
        '<option value="probable"' + (STATE._filtreReleveConfiance==='probable'?' selected':'') + '>✓ Probable</option>' +
        '<option value="faible"' + (STATE._filtreReleveConfiance==='faible'?' selected':'') + '>? À vérifier</option>' +
        '<option value="aucune"' + (STATE._filtreReleveConfiance==='aucune'?' selected':'') + '>Aucune correspondance</option>' +
      '</select>' +
    '</div>' +
    '<div style="display:flex;gap:8px;align-items:center;margin-bottom:8px">' +
      '<input type="number" id="releve-filtre-montant-min" class="f-inp" placeholder="Montant min" value="' + (STATE._filtreReleveMontantMin!=null?STATE._filtreReleveMontantMin:'') + '" onchange="appliquerFiltreMontantReleve()" style="flex:1">' +
      '<span style="font-size:12px;color:#9C9186">à</span>' +
      '<input type="number" id="releve-filtre-montant-max" class="f-inp" placeholder="Montant max" value="' + (STATE._filtreReleveMontantMax!=null?STATE._filtreReleveMontantMax:'') + '" onchange="appliquerFiltreMontantReleve()" style="flex:1">' +
    '</div>' +
    ((STATE._filtreReleveStatut!=='tous'||STATE._filtreReleveRecherche||STATE._filtreReleveMontantMin!=null||STATE._filtreReleveMontantMax!=null||STATE._filtreReleveConfiance!=='tous')
      ? '<span onclick="effacerFiltresReleve()" style="font-size:11px;color:#9C9186;text-decoration:underline;cursor:pointer">Effacer les filtres</span>'
      : '') +
  '</div>';
}

// NOUVEAU (retour utilisateur) : affichage décortiqué — date, libellé et
// montant chacun dans leur propre "case" bien visible, plutôt qu'une
// seule ligne de texte compacte. Zébrage sur 2 couleurs alternées
// (papier clair / blanc) entre chaque transaction, pour bien distinguer
// une ligne de la suivante d'un coup d'œil sur une longue liste.
function renderTransactionsReleve() {
  const zone = el('rapprochement-releve-content');
  if (!zone) return;
  const transactions = STATE._transactionsReleveActuel || [];
  if (!transactions.length) {
    zone.innerHTML = '<div class="empty"><div class="empty-ico">🏦</div><div class="empty-title">Aucune transaction</div></div>';
    return;
  }

  // FIX (retour utilisateur) : on garde l'INDICE D'ORIGINE de chaque
  // transaction avant de filtrer — indispensable puisque les boutons
  // "Lier"/"Répartir" appellent confirmerRapprochementReleve(id, type,
  // index) avec cet indice dans le tableau complet STATE._transactionsReleveActuel,
  // pas dans la liste filtrée affichée à l'écran.
  const avecIndex = transactions.map(function(t, i) { return { t: t, indexOriginal: i }; });
  const filtrees = _appliquerFiltresReleve(avecIndex);

  zone.innerHTML = _barreFiltresReleve() +
    '<div style="padding:0 20px 10px;font-size:11px;color:#9C9186">Lecture automatique — à vérifier avant de confirmer. Certaines transactions peuvent manquer ou être mal reconnues selon la mise en page de votre banque.' +
      (filtrees.length !== transactions.length ? ' · <strong>' + filtrees.length + '</strong> sur ' + transactions.length + ' affichée(s)' : '') +
    '</div>' +
    (!filtrees.length ? '<div class="empty"><div class="empty-ico">🔍</div><div class="empty-title">Aucune transaction ne correspond à ces filtres</div></div>' :
    filtrees.map(function(item, position) {
      const t = item.t;
      const i = item.indexOriginal;
      // Zébrage : couleur de fond de la "carte" alternée une ligne sur deux
      // (basé sur la position affichée, pas l'indice d'origine, pour que
      // le zébrage reste cohérent même après filtrage).
      const fondZebre = position % 2 === 0 ? '#fff' : '#FBF9F5';

      const refTransaction = _construireRefTransaction(t);
      const dejaLieeAvec = (STATE.factures || []).find(function(f) { return (f.transactions_bancaires_liees || []).includes(refTransaction); })
        || (STATE.achats || []).find(function(a) { return (a.transactions_bancaires_liees || []).includes(refTransaction); });

      // Bloc "date + libellé" décortiqué en 2 cases distinctes,
      // réutilisé aussi bien pour une transaction déjà traitée que pour
      // une transaction encore à traiter.
      function _blocDateLibelle() {
        return '<div style="display:flex;gap:8px;margin-bottom:8px">' +
          '<div style="background:#F1EEE8;border-radius:8px;padding:6px 10px;font-size:11px;font-weight:700;color:#6B5F54;white-space:nowrap">📅 ' + escapeHTML(t.dateBrute) + '</div>' +
          '<div style="background:#F1EEE8;border-radius:8px;padding:6px 10px;font-size:11px;color:#6B5F54;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">📝 ' + escapeHTML(t.description) + '</div>' +
        '</div>';
      }
      const couleurMontant = t.montant >= 0 ? '#55702E' : '#B23A2E';
      const blocMontant = '<div style="text-align:right;font-weight:800;font-size:15px;color:' + couleurMontant + '">' + (t.montant >= 0 ? '+' : '') + fmt(t.montant) + ' MAD</div>';

      if (t._traitee || dejaLieeAvec) {
        const doc = dejaLieeAvec || {};
        const typeDoc = doc.fournisseur ? 'achat' : 'facture';
        return '<div style="background:' + fondZebre + ';border-radius:12px;padding:14px;margin:0 20px 10px;border:1px solid #DCE8C7;border-left:4px solid #6E8F4E">' +
          _blocDateLibelle() +
          blocMontant +
          '<div style="display:flex;justify-content:space-between;align-items:center;margin-top:6px">' +
            '<div style="font-size:12px;color:#55702E;font-weight:600">✅ Déjà rapprochée' + (doc.ref || doc.ref_fournisseur ? ' — ' + escapeHTML(doc.ref || doc.ref_fournisseur) : '') + '</div>' +
            (doc.id ? '<button onclick="annulerRapprochement(\'' + doc.id + '\',\'' + typeDoc + '\',' + i + ')" style="font-size:10px;color:#B23A2E;background:none;border:1px solid #E0B6AC;border-radius:6px;padding:3px 8px;cursor:pointer;font-family:inherit">↩️ Annuler ce lien</button>' : '') +
          '</div>' +
        '</div>';
      }

      const aDesCorrespondances = t.correspondances && t.correspondances.length > 0;
      return '<div style="background:' + fondZebre + ';border-radius:12px;padding:14px;margin:0 20px 10px;border:1px solid #E3DCCF;border-left:4px solid ' + (t.montant>=0?'#1F6F72':'#B23A2E') + '">' +
        _blocDateLibelle() +
        blocMontant +
        '<div style="margin-top:8px">' +
        (aDesCorrespondances
          ? t.correspondances.map(function(f) {
              const estAchat = f._type === 'achat';
              const libelle = estAchat ? 'l\'achat' : 'la facture';
              const couleurFond = estAchat ? '#F5E4E1' : '#EEF3E4';
              const couleurTexte = estAchat ? '#8E2E24' : '#55702E';
              const badge = f._score >= 0.75 ? '<span style="background:#1F6F72;color:#fff;font-size:9px;font-weight:700;padding:1px 6px;border-radius:6px;margin-left:6px">✓✓ Forte correspondance</span>'
                : f._score >= 0.5 ? '<span style="background:#C9971F;color:#fff;font-size:9px;font-weight:700;padding:1px 6px;border-radius:6px;margin-left:6px">✓ Correspondance probable</span>'
                : '<span style="background:#9C9186;color:#fff;font-size:9px;font-weight:700;padding:1px 6px;border-radius:6px;margin-left:6px">? À vérifier</span>';
              // NOUVEAU (retour utilisateur) : détail du score par
              // critère, pas juste un badge global — visible directement,
              // pas une boîte noire.
              const detailScore = f._detail
                ? '<div style="font-size:9px;color:#9C9186;margin-top:3px">nom ' + Math.round((f._detail.nom||0)*100) + '% · montant ' + Math.round((f._detail.montant||0)*100) + '% · date ' + Math.round((f._detail.date||0)*100) + '%' + (f._detail.regle ? ' · 🔒 règle' : '') + (f._detail.reference >= 1 ? ' · 🎯 référence' : '') + '</div>'
                : '';
              const infoAcompte = f._dejaLiees > 0
                ? '<div style="font-size:10px;color:#1F6F72;margin-top:3px">ℹ️ ' + f._dejaLiees + ' paiement(s) déjà lié(s) — solde restant : ' + fmt(f._soldeRestant) + ' MAD</div>'
                : (f._soldeRestant - Math.abs(t.montant) > 1 ? '<div style="font-size:10px;color:#9C9186;margin-top:3px">Paiement partiel — resterait ' + fmt(f._soldeRestant - Math.abs(t.montant)) + ' MAD après ce lien</div>' : '');
              return '<button onclick="confirmerRapprochementReleve(\'' + f.id + '\',\'' + f._type + '\',' + i + ')" style="width:100%;padding:9px;background:' + couleurFond + ';color:' + couleurTexte + ';border:none;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer;font-family:inherit;text-align:left;margin-bottom:4px">✅ Lier à ' + libelle + ' ' + escapeHTML(f.ref || '') + ' — ' + escapeHTML(f.client || '') + badge + detailScore + infoAcompte + '</button>';
            }).join('')
          : '<div style="font-size:11px;color:#9C9186">Aucune correspondance trouvée</div>') +
        '</div>' +
        '<button onclick="ouvrirRapprochementMultipleTransaction(' + i + ')" style="width:100%;padding:7px;background:none;color:#1F6F72;border:1px dashed #1F6F72;border-radius:8px;font-size:11px;font-weight:600;cursor:pointer;font-family:inherit;margin-top:4px">🔗 Répartir sur plusieurs factures/achats</button>' +
      '</div>';
    }).join(''));
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
  const collection = type === 'achat' ? (STATE.achats || []) : (STATE.factures || []);
  const doc = collection.find(function(x) { return String(x.id) === String(id); });
  if (!doc) { showToast('Document introuvable', 'error'); return; }

  // FIX (retour utilisateur) : passe maintenant par la même fonction
  // partagée que le rapprochement multiple — une seule logique
  // d'allocation dans tout le fichier, avec la même détection d'écart
  // partout plutôt que deux implémentations qui pouvaient diverger.
  const ecart = await _appliquerAllocationRapprochement(id, type, Math.abs(t.montant), t);
  const soldeCouvert = (Number(doc.ttc) || 0) - (Number(doc.montant_recu) || 0) <= 0.5;

  if (STATE._transactionsReleveActuel && STATE._transactionsReleveActuel[indexTransaction]) {
    STATE._transactionsReleveActuel[indexTransaction].correspondances = [];
    STATE._transactionsReleveActuel[indexTransaction]._traitee = true;
  }
  // FIX (retour utilisateur) : sans cette sauvegarde, l'état "déjà
  // rapprochée" ne survivait pas à un changement de page ou un
  // rechargement — il fallait tout refaire à chaque fois.
  if (STATE._releveActuelId) _sauvegarderTransactionsReleveLocal(STATE._releveActuelId, STATE._transactionsReleveActuel);
  renderTransactionsReleve();

  if (ecart) {
    showToast('⚠️ Écart détecté : ce paiement dépasse de ' + fmt(ecart) + ' MAD ce qu\'il restait à payer — vérifiez si une autre facture est concernée', 'error');
  } else {
    showToast(soldeCouvert
      ? (type === 'achat' ? '✅ Achat soldé' : '✅ Facture soldée')
      : '✅ Paiement partiel enregistré — reste ' + fmt((Number(doc.ttc)||0) - (Number(doc.montant_recu)||0)) + ' MAD', 'success');
  }
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
    // FIX (retour utilisateur) : le montant est signé (négatif=sortie,
    // positif=entrée) — on compare toujours la valeur absolue pour le
    // score, mais on vérifie aussi la cohérence du sens (une facture de
    // vente attend une entrée, un achat attend une sortie).
    const sensAttendu = type === 'achat' ? t.montant <= 0 : t.montant >= 0;
    const s = _scoreGlobalCorrespondance(soldeRestant, Math.abs(t.montant), nomDoc, t.description, dateDoc, t.dateBrute, doc.ref || doc.ref_fournisseur, type || 'facture');
    return { t: t, idx: idx, score: sensAttendu ? s.total : 0, detail: s.detail, sensIncoherent: !sensAttendu };
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
        const badge = c.sensIncoherent ? '⚠️ Sens incohérent' : c.detail.regle ? '🔒 Règle' : c.detail.reference >= 1 ? '🎯 Réf. trouvée' : c.score >= 0.75 ? '✓✓ Forte' : c.score >= 0.5 ? '✓ Probable' : c.score >= 0.15 ? '? Faible' : '— Aucun signal';
        const couleurBadge = c.sensIncoherent ? '#B23A2E' : c.detail.regle || c.detail.reference >= 1 ? '#1F6F72' : c.score >= 0.75 ? '#1F6F72' : c.score >= 0.5 ? '#C9971F' : '#9C9186';
        const couleurMontant = c.t.montant >= 0 ? '#55702E' : '#B23A2E';
        return '<div style="border:1px solid #E3DCCF;border-radius:10px;padding:10px;margin-bottom:8px">' +
          '<div style="display:flex;justify-content:space-between;margin-bottom:4px">' +
            '<span style="font-size:11px;color:#6B5F54">' + escapeHTML(c.t.dateBrute) + '</span>' +
            '<span style="font-size:9px;font-weight:700;color:#fff;background:' + couleurBadge + ';padding:1px 6px;border-radius:6px">' + badge + '</span>' +
          '</div>' +
          '<div style="font-size:12px;margin-bottom:6px">' + escapeHTML(c.t.description) + ' — <strong style="color:' + couleurMontant + '">' + (c.t.montant >= 0 ? '+' : '') + fmt(c.t.montant) + ' MAD</strong></div>' +
          '<div style="display:flex;gap:6px">' +
            '<button onclick="confirmerRapprochementReleve(\'' + factureId + '\',\'' + (type||'facture') + '\',' + c.idx + ');document.getElementById(\'rapprochement-depuis-facture-overlay\').remove()" style="flex:1;padding:7px;background:#EEF3E4;color:#55702E;border:none;border-radius:8px;font-size:11px;font-weight:600;cursor:pointer;font-family:inherit">✅ Lier</button>' +
            '<button onclick="ouvrirCreationRegle(' + c.idx + ',' + JSON.stringify(nomDoc) + ',' + JSON.stringify(type||'facture') + ')" style="padding:7px 10px;background:#F1EEE8;color:#6B5F54;border:none;border-radius:8px;font-size:11px;cursor:pointer;font-family:inherit">🔒 Créer une règle</button>' +
          '</div>' +
        '</div>';
      }).join('') +
      // NOUVEAU (retour utilisateur) : accès direct au réglage en
      // plusieurs virements (acompte + solde, tranches...) depuis cette
      // même liste.
      '<button onclick="document.getElementById(\'rapprochement-depuis-facture-overlay\').remove();ouvrirRapprochementMultipleFacture(\'' + factureId + '\',\'' + (type||'facture') + '\')" style="width:100%;padding:10px;background:none;color:#1F6F72;border:1px dashed #1F6F72;border-radius:10px;font-size:12px;font-weight:600;cursor:pointer;font-family:inherit;margin-top:8px;margin-bottom:6px">🔗 Régler avec plusieurs virements (acompte + solde...)</button>' +
      '<button onclick="document.getElementById(\'rapprochement-depuis-facture-overlay\').remove()" style="width:100%;padding:11px;background:none;color:#9C9186;border:none;font-size:13px;cursor:pointer;font-family:inherit">Fermer</button>' +
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

// ============================================================
// RAPPROCHEMENT MULTIPLE (retour utilisateur) — deux scénarios réels
// pris en charge, chacun avec son propre outil dédié :
//
//   A) UN virement couvre PLUSIEURS factures (un client règle 3
//      factures d'un coup dans un seul paiement) —
//      ouvrirRapprochementMultipleTransaction()
//
//   B) UNE facture est réglée en PLUSIEURS virements dans le temps
//      (acompte ce mois, solde le mois prochain, éventuellement une
//      troisième tranche encore après) —
//      ouvrirRapprochementMultipleFacture()
//
// Dans les deux cas : sélection multiple avec case à cocher, total
// affiché en temps réel comparé à ce qui est attendu, indicateur clair
// "✅ Équilibré" / "⚠️ Écart de X MAD" — impossible de confirmer tant
// que ce n'est pas cohérent (ou explicitement accepté comme partiel).
// Toujours des suggestions à vérifier, rien n'est automatique.
// ============================================================

STATE._selectionRapprochementMultiple = STATE._selectionRapprochementMultiple || {};

// ------------------------------------------------------------
// SCÉNARIO A : un virement -> plusieurs factures/achats
// ------------------------------------------------------------
function ouvrirRapprochementMultipleTransaction(indexTransaction) {
  const t = STATE._transactionsReleveActuel && STATE._transactionsReleveActuel[indexTransaction];
  if (!t) return;
  const montantTransaction = Math.abs(t.montant);
  const estEntree = t.montant >= 0;

  // Ne propose que le bon côté selon le sens du virement — une entrée ne
  // peut régler que des factures de vente, une sortie que des achats.
  const candidats = estEntree
    ? (STATE.factures || []).filter(function(f) { return (Number(f.ttc)||0) - (Number(f.montant_recu)||0) > 0.5; })
        .map(function(f) { return { id: f.id, type: 'facture', nom: f.client, ref: f.ref, solde: (Number(f.ttc)||0) - (Number(f.montant_recu)||0) }; })
    : (STATE.achats || []).filter(function(a) { return (Number(a.ttc)||0) - (Number(a.montant_recu)||0) > 0.5; })
        .map(function(a) { return { id: a.id, type: 'achat', nom: a.fournisseur, ref: a.ref_fournisseur, solde: (Number(a.ttc)||0) - (Number(a.montant_recu)||0) }; });

  STATE._selectionRapprochementMultiple = { indexTransaction: indexTransaction, montantTransaction: montantTransaction, coches: {} };

  const overlay = document.createElement('div');
  overlay.id = 'rapprochement-multiple-overlay';
  overlay.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,0.6);display:flex;align-items:flex-end;justify-content:center';
  overlay.innerHTML =
    '<div style="background:#fff;border-radius:20px 20px 0 0;padding:20px;max-width:460px;width:100%;max-height:80vh;overflow-y:auto">' +
      '<div style="width:40px;height:4px;background:#E3DCCF;border-radius:2px;margin:0 auto 14px"></div>' +
      '<div style="font-size:15px;font-weight:700;margin-bottom:4px">🔗 Rapprochement multiple</div>' +
      '<div style="font-size:12px;color:#9C9186;margin-bottom:6px">' + escapeHTML(t.description) + ' — ' + (estEntree?'+':'') + fmt(t.montant) + ' MAD</div>' +
      '<div style="font-size:11px;color:#6B5F54;margin-bottom:14px">Cochez une ou plusieurs ' + (estEntree?'factures':'achats') + ' à régler avec ce virement.</div>' +
      '<div id="rapprochement-multiple-liste">' +
        (candidats.length ? candidats.map(function(c) {
          return '<label style="display:flex;align-items:center;gap:10px;padding:10px;border:1px solid #E3DCCF;border-radius:10px;margin-bottom:6px;cursor:pointer">' +
            '<input type="checkbox" onchange="_toggleSelectionRapprochementMultiple(\'' + c.id + '\',\'' + c.type + '\',' + c.solde + ',this.checked)" style="width:18px;height:18px">' +
            '<div style="flex:1"><div style="font-size:12px;font-weight:600">' + escapeHTML(c.ref||'') + ' — ' + escapeHTML(c.nom||'') + '</div>' +
            '<div style="font-size:11px;color:#9C9186">Solde restant : ' + fmt(c.solde) + ' MAD</div></div>' +
          '</label>';
        }).join('') : '<div style="text-align:center;padding:20px;color:#9C9186;font-size:12px">Aucune ' + (estEntree?'facture':'achat') + ' avec un solde restant à régler.</div>') +
      '</div>' +
      '<div id="rapprochement-multiple-total" style="margin-top:12px;padding:12px;border-radius:10px;background:#F1EEE8;font-size:13px;font-weight:700;text-align:center">Sélectionné : 0 MAD / ' + fmt(montantTransaction) + ' MAD</div>' +
      '<button id="rapprochement-multiple-confirmer" onclick="confirmerRapprochementMultipleTransaction()" disabled style="width:100%;margin-top:12px;padding:12px;background:#EAE4DA;color:#9C9186;border:none;border-radius:10px;font-size:13px;font-weight:700;cursor:not-allowed;font-family:inherit">✅ Confirmer le rapprochement</button>' +
      '<button onclick="document.getElementById(\'rapprochement-multiple-overlay\').remove()" style="width:100%;padding:11px;background:none;color:#9C9186;border:none;font-size:13px;cursor:pointer;font-family:inherit;margin-top:6px">Fermer</button>' +
    '</div>';
  overlay.addEventListener('click', function(e) { if (e.target === overlay) overlay.remove(); });
  document.body.appendChild(overlay);
}

function _toggleSelectionRapprochementMultiple(id, type, solde, coche) {
  const sel = STATE._selectionRapprochementMultiple;
  if (coche) sel.coches[type + ':' + id] = { id: id, type: type, solde: solde };
  else delete sel.coches[type + ':' + id];
  _majAffichageTotalMultiple();
}

// Calcule le total sélectionné et met à jour l'indicateur — vert si le
// montant total sélectionné correspond au virement (à 1 MAD près, pour
// les arrondis), orange s'il reste un écart mais dans un sens qui reste
// plausible (ex: virement plus grand que la somme sélectionnée), rouge
// si la sélection dépasse le montant du virement (impossible à répartir
// sans dépasser ce qui a réellement été reçu/payé).
function _majAffichageTotalMultiple() {
  const sel = STATE._selectionRapprochementMultiple;
  const zone = el('rapprochement-multiple-total');
  const btn = el('rapprochement-multiple-confirmer');
  if (!zone || !sel) return;
  const totalSelectionne = Object.values(sel.coches).reduce(function(s, c) { return s + Math.min(c.solde, sel.montantTransaction); }, 0);
  const ecart = sel.montantTransaction - totalSelectionne;

  let couleur, texte, peutConfirmer;
  if (Math.abs(ecart) < 1) {
    couleur = '#EEF3E4'; texte = '✅ Équilibré — ' + fmt(totalSelectionne) + ' / ' + fmt(sel.montantTransaction) + ' MAD'; peutConfirmer = true;
    zone.style.color = '#55702E';
  } else if (ecart > 0) {
    couleur = '#FBF0DA'; texte = '⚠️ Reste ' + fmt(ecart) + ' MAD non affecté — ' + fmt(totalSelectionne) + ' / ' + fmt(sel.montantTransaction) + ' MAD'; peutConfirmer = totalSelectionne > 0;
    zone.style.color = '#A67A16';
  } else {
    couleur = '#F5E4E1'; texte = '❌ Dépasse le virement de ' + fmt(-ecart) + ' MAD — décochez une ligne'; peutConfirmer = false;
    zone.style.color = '#8E2E24';
  }
  zone.style.background = couleur;
  zone.textContent = texte;
  if (btn) {
    btn.disabled = !peutConfirmer;
    btn.style.background = peutConfirmer ? '#1F6F72' : '#EAE4DA';
    btn.style.color = peutConfirmer ? '#fff' : '#9C9186';
    btn.style.cursor = peutConfirmer ? 'pointer' : 'not-allowed';
  }
}

// Applique la répartition : chaque facture/achat coché reçoit au
// maximum son propre solde restant, prélevé sur le montant du virement,
// dans l'ordre où elles ont été cochées — jusqu'à épuisement du
// virement ou couverture complète de la sélection.
async function confirmerRapprochementMultipleTransaction() {
  const sel = STATE._selectionRapprochementMultiple;
  if (!sel) return;
  const t = STATE._transactionsReleveActuel[sel.indexTransaction];
  let restantAAffecter = sel.montantTransaction;

  for (const cle in sel.coches) {
    const c = sel.coches[cle];
    if (restantAAffecter <= 0.5) break;
    const montantAlloue = Math.min(c.solde, restantAAffecter);
    await _appliquerAllocationRapprochement(c.id, c.type, montantAlloue, t);
    restantAAffecter -= montantAlloue;
  }

  if (STATE._transactionsReleveActuel[sel.indexTransaction]) {
    STATE._transactionsReleveActuel[sel.indexTransaction].correspondances = [];
    STATE._transactionsReleveActuel[sel.indexTransaction]._traitee = true;
  }
  if (STATE._releveActuelId) _sauvegarderTransactionsReleveLocal(STATE._releveActuelId, STATE._transactionsReleveActuel);
  document.getElementById('rapprochement-multiple-overlay')?.remove();
  renderTransactionsReleve();
  showToast('✅ Rapprochement multiple confirmé', 'success');
}

// Fonction partagée par les deux scénarios — applique une allocation
// (potentiellement partielle) d'un virement vers UN document précis, et
// journalise cette allocation dans son historique.
// FIX (retour utilisateur) : le montant reçu était plafonné en silence
// (Math.min) dès qu'une allocation dépassait ce qu'il restait à payer —
// exactement le cas signalé : facture de 3, deux paiements de 2 chacun
// (total 4) — le deuxième paiement était tronqué sans jamais dire que
// 1 MAD ne correspond à rien de connu. Ça peut vouloir dire : ce
// paiement couvre en fait DEUX factures (dont une pas encore
// enregistrée ou pas rapprochée), ou c'est un trop-perçu réel.
// Détecté maintenant explicitement, avec un écart mémorisé sur le
// document — visible, mais jamais bloquant : la liaison se fait quand
// même, l'entreprise vérifie et corrige à son rythme.
async function _appliquerAllocationRapprochement(id, type, montantAlloue, transaction) {
  const table = type === 'achat' ? 'factures_achat' : 'factures';
  const collection = type === 'achat' ? (STATE.achats || []) : (STATE.factures || []);
  const doc = collection.find(function(x) { return String(x.id) === String(id); });
  if (!doc) return null;

  const refAllocation = (transaction.dateBrute||'') + '|' + montantAlloue.toFixed(2) + '|' + (transaction.description||'').slice(0,60);
  const montantRecuActuel = Number(doc.montant_recu) || 0;
  const soldeAvantAllocation = (Number(doc.ttc) || 0) - montantRecuActuel;
  const ecartDetecte = montantAlloue - soldeAvantAllocation; // > 0 = dépasse ce qu'il restait
  const nouveauMontantRecu = Math.min(Number(doc.ttc) || 0, montantRecuActuel + montantAlloue);
  const soldeCouvert = (Number(doc.ttc) || 0) - nouveauMontantRecu <= 0.5;
  const listeTransactions = (doc.transactions_bancaires_liees || []).concat([refAllocation]);

  const maj = { montant_recu: nouveauMontantRecu, transactions_bancaires_liees: listeTransactions, statut_paiement_detail: soldeCouvert ? 'payee' : (nouveauMontantRecu > 0 ? 'partielle' : 'impayee') };
  if (soldeCouvert) maj.statut = 'payee';
  // Écart mémorisé sur le document lui-même — reste visible tant que
  // personne ne l'a explicitement effacé (voir ignorerEcartRapprochement).
  if (ecartDetecte >= 1) maj.ecart_rapprochement = ecartDetecte;

  try {
    await sb.patch(table, 'id=eq.' + id + '&user_id=eq.' + (STATE.entrepriseId || sb.user.id), maj);
    Object.assign(doc, maj);
  } catch(e) { console.warn('_appliquerAllocationRapprochement:', e); }

  return ecartDetecte >= 1 ? ecartDetecte : null;
}

// Statut de paiement lisible pour l'affichage — dérivé directement du
// montant reçu, jamais stocké séparément pour éviter toute
// désynchronisation entre les deux.
function _statutPaiementLisible(doc) {
  const ttc = Number(doc.ttc) || 0;
  const recu = Number(doc.montant_recu) || 0;
  if (recu <= 0.5) return { libelle: 'Impayée', couleur: '#B23A2E', fond: '#F5E4E1' };
  if (ttc - recu <= 0.5) return { libelle: 'Payée', couleur: '#55702E', fond: '#EEF3E4' };
  return { libelle: 'Payée partiellement', couleur: '#A67A16', fond: '#FBF0DA' };
}

// Efface un écart signalé une fois que l'entreprise l'a vérifié et
// jugé normal (ex: un vrai trop-perçu accepté, ou une erreur déjà
// corrigée ailleurs).
async function ignorerEcartRapprochement(id, type) {
  const table = type === 'achat' ? 'factures_achat' : 'factures';
  const collection = type === 'achat' ? (STATE.achats || []) : (STATE.factures || []);
  const doc = collection.find(function(x) { return String(x.id) === String(id); });
  if (!doc) return;
  try {
    await sb.patch(table, 'id=eq.' + id + '&user_id=eq.' + (STATE.entrepriseId || sb.user.id), { ecart_rapprochement: null });
    doc.ecart_rapprochement = null;
    showToast('✅ Écart marqué comme vérifié', 'success');
  } catch(e) { showToast('Erreur: ' + e.message, 'error'); }
}

// ------------------------------------------------------------
// SCÉNARIO B : une facture -> plusieurs virements (acompte, tranches,
// solde) — sélection multiple en une fois, plutôt que de confirmer
// chaque virement séparément l'un après l'autre.
// ------------------------------------------------------------
function ouvrirRapprochementMultipleFacture(factureId, type) {
  const doc = type === 'achat'
    ? (STATE.achats || []).find(function(x) { return String(x.id) === String(factureId); })
    : (STATE.factures || []).find(function(x) { return String(x.id) === String(factureId); });
  if (!doc) return;
  const transactionsDisponibles = STATE._transactionsReleveActuel || [];
  if (!transactionsDisponibles.length) {
    showToast('⚠️ Ouvrez d\'abord un relevé et cliquez "Analyser"', 'error');
    return;
  }
  const soldeRestant = (Number(doc.ttc) || 0) - (Number(doc.montant_recu) || 0);
  // Ne propose que les transactions du bon sens : une facture de vente
  // attend des entrées, un achat attend des sorties.
  const candidats = transactionsDisponibles.map(function(t, idx) { return { t: t, idx: idx }; })
    .filter(function(c) { return type === 'achat' ? c.t.montant <= 0 : c.t.montant >= 0; });

  STATE._selectionRapprochementMultipleFacture = { factureId: factureId, type: type, soldeRestant: soldeRestant, coches: {} };

  const overlay = document.createElement('div');
  overlay.id = 'rapprochement-multiple-facture-overlay';
  overlay.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,0.6);display:flex;align-items:flex-end;justify-content:center';
  overlay.innerHTML =
    '<div style="background:#fff;border-radius:20px 20px 0 0;padding:20px;max-width:460px;width:100%;max-height:80vh;overflow-y:auto">' +
      '<div style="width:40px;height:4px;background:#E3DCCF;border-radius:2px;margin:0 auto 14px"></div>' +
      '<div style="font-size:15px;font-weight:700;margin-bottom:4px">🔗 Régler avec plusieurs virements</div>' +
      '<div style="font-size:12px;color:#9C9186;margin-bottom:14px">' + escapeHTML(doc.ref || doc.ref_fournisseur || '') + ' — solde restant : ' + fmt(soldeRestant) + ' MAD</div>' +
      '<div style="font-size:11px;color:#6B5F54;margin-bottom:10px">Utile pour un acompte suivi d\'un solde, ou plusieurs tranches — cochez tout ce qui doit être appliqué à cette facture.</div>' +
      (candidats.length ? candidats.map(function(c) {
        const signe = c.t.montant >= 0 ? '+' : '';
        return '<label style="display:flex;align-items:center;gap:10px;padding:10px;border:1px solid #E3DCCF;border-radius:10px;margin-bottom:6px;cursor:pointer">' +
          '<input type="checkbox" onchange="_toggleSelectionRapprochementMultipleFacture(' + c.idx + ',' + Math.abs(c.t.montant) + ',this.checked)" style="width:18px;height:18px">' +
          '<div style="flex:1"><div style="font-size:12px">' + escapeHTML(c.t.dateBrute) + ' · ' + escapeHTML(c.t.description) + '</div>' +
          '<div style="font-size:12px;font-weight:700;color:' + (c.t.montant>=0?'#55702E':'#B23A2E') + '">' + signe + fmt(c.t.montant) + ' MAD</div></div>' +
        '</label>';
      }).join('') : '<div style="text-align:center;padding:20px;color:#9C9186;font-size:12px">Aucune transaction du bon sens disponible dans le relevé actuellement ouvert.</div>') +
      '<div id="rapprochement-multiple-facture-total" style="margin-top:12px;padding:12px;border-radius:10px;background:#F1EEE8;font-size:13px;font-weight:700;text-align:center">Sélectionné : 0 MAD / ' + fmt(soldeRestant) + ' MAD restant</div>' +
      '<button id="rapprochement-multiple-facture-confirmer" onclick="confirmerRapprochementMultipleFacture()" disabled style="width:100%;margin-top:12px;padding:12px;background:#EAE4DA;color:#9C9186;border:none;border-radius:10px;font-size:13px;font-weight:700;cursor:not-allowed;font-family:inherit">✅ Confirmer</button>' +
      '<button onclick="document.getElementById(\'rapprochement-multiple-facture-overlay\').remove()" style="width:100%;padding:11px;background:none;color:#9C9186;border:none;font-size:13px;cursor:pointer;font-family:inherit;margin-top:6px">Fermer</button>' +
    '</div>';
  overlay.addEventListener('click', function(e) { if (e.target === overlay) overlay.remove(); });
  document.body.appendChild(overlay);
}

function _toggleSelectionRapprochementMultipleFacture(idxTransaction, montant, coche) {
  const sel = STATE._selectionRapprochementMultipleFacture;
  if (coche) sel.coches[idxTransaction] = montant;
  else delete sel.coches[idxTransaction];

  const zone = el('rapprochement-multiple-facture-total');
  const btn = el('rapprochement-multiple-facture-confirmer');
  const total = Object.values(sel.coches).reduce(function(s, m) { return s + m; }, 0);
  const ecart = sel.soldeRestant - total;
  let peutConfirmer;
  if (Math.abs(ecart) < 1) {
    zone.style.background = '#EEF3E4'; zone.style.color = '#55702E';
    zone.textContent = '✅ Équilibré — ' + fmt(total) + ' / ' + fmt(sel.soldeRestant) + ' MAD'; peutConfirmer = true;
  } else if (ecart > 0) {
    zone.style.background = '#FBF0DA'; zone.style.color = '#A67A16';
    zone.textContent = '⚠️ Restera ' + fmt(ecart) + ' MAD après ces virements — ' + fmt(total) + ' / ' + fmt(sel.soldeRestant) + ' MAD'; peutConfirmer = total > 0;
  } else {
    zone.style.background = '#F5E4E1'; zone.style.color = '#8E2E24';
    zone.textContent = '❌ Dépasse le solde restant de ' + fmt(-ecart) + ' MAD'; peutConfirmer = false;
  }
  if (btn) {
    btn.disabled = !peutConfirmer;
    btn.style.background = peutConfirmer ? '#1F6F72' : '#EAE4DA';
    btn.style.color = peutConfirmer ? '#fff' : '#9C9186';
    btn.style.cursor = peutConfirmer ? 'pointer' : 'not-allowed';
  }
}

async function confirmerRapprochementMultipleFacture() {
  const sel = STATE._selectionRapprochementMultipleFacture;
  if (!sel) return;
  let dernierEcart = null;
  for (const idxStr in sel.coches) {
    const idx = parseInt(idxStr);
    const t = STATE._transactionsReleveActuel[idx];
    if (!t) continue;
    const ecart = await _appliquerAllocationRapprochement(sel.factureId, sel.type, Math.abs(t.montant), t);
    if (ecart) dernierEcart = ecart;
    t.correspondances = [];
    t._traitee = true;
  }
  if (STATE._releveActuelId) _sauvegarderTransactionsReleveLocal(STATE._releveActuelId, STATE._transactionsReleveActuel);
  document.getElementById('rapprochement-multiple-facture-overlay')?.remove();
  renderTransactionsReleve();
  if (dernierEcart) {
    showToast('⚠️ Écart détecté : ' + fmt(dernierEcart) + ' MAD en trop par rapport au solde — vérifiez si une autre facture est concernée', 'error');
  } else {
    showToast('✅ Rapprochement multiple confirmé', 'success');
  }
}

// ============================================================
// EXPORT COMPTABLE (retour utilisateur) — extraction des factures/achats
// avec leur historique complet de paiements, prête à ouvrir dans un
// tableur ou à importer dans un logiciel de comptabilité. Une ligne par
// paiement lié, pas juste une ligne par facture, pour que l'écart
// éventuel entre montant facturé et montant réellement encaissé/payé
// reste visible ligne par ligne.
// ============================================================
function exporterRapprochementComptable() {
  const lignes = [['Type', 'Référence', 'Client/Fournisseur', 'Date facture', 'Montant facture', 'Statut', 'Date paiement', 'Montant payé', 'Libellé banque', 'Écart détecté']];

  function ajouterDocs(docs, type) {
    (docs || []).forEach(function(doc) {
      const nom = type === 'achat' ? doc.fournisseur : doc.client;
      const ref = type === 'achat' ? doc.ref_fournisseur : doc.ref;
      const statut = _statutPaiementLisible(doc).libelle;
      const transactionsLiees = doc.transactions_bancaires_liees || [];
      if (!transactionsLiees.length) {
        lignes.push([type, ref||'', nom||'', doc.date_emission||doc.date_achat||'', fmt(doc.ttc||0), statut, '', '', '', doc.ecart_rapprochement ? fmt(doc.ecart_rapprochement) : '']);
      } else {
        transactionsLiees.forEach(function(refTrans, i) {
          const parts = String(refTrans).split('|');
          lignes.push([
            type, ref||'', nom||'',
            i === 0 ? (doc.date_emission||doc.date_achat||'') : '',
            i === 0 ? fmt(doc.ttc||0) : '',
            i === 0 ? statut : '',
            parts[0]||'', fmt(Math.abs(parseFloat(parts[1])||0)), parts[2]||'',
            i === 0 && doc.ecart_rapprochement ? fmt(doc.ecart_rapprochement) : ''
          ]);
        });
      }
    });
  }

  ajouterDocs(STATE.factures, 'facture');
  ajouterDocs(STATE.achats, 'achat');

  const csv = lignes.map(function(ligne) {
    return ligne.map(function(v) { return '"' + String(v).replace(/"/g, '""') + '"'; }).join(',');
  }).join('\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'rapprochement_bancaire_' + new Date().toISOString().split('T')[0] + '.csv';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(function() { URL.revokeObjectURL(url); }, 3000);
  showToast('✅ Export téléchargé — une ligne par paiement, prêt pour la comptabilité', 'success');
}

// ============================================================
// NOUVEAU (retour utilisateur) : possibilité d'annuler un rapprochement
// déjà confirmé, si c'était une erreur — retire le montant précédemment
// ajouté, retire la transaction de l'historique, recalcule le statut
// (payée / partielle / impayée), et efface un éventuel écart signalé
// pour le recalculer proprement au prochain rapprochement.
// ============================================================
async function annulerRapprochement(docId, type, indexTransaction) {
  if (!confirm('Annuler ce rapprochement ? La facture repassera dans son état précédent.')) return;

  const table = type === 'achat' ? 'factures_achat' : 'factures';
  const collection = type === 'achat' ? (STATE.achats || []) : (STATE.factures || []);
  const doc = collection.find(function(x) { return String(x.id) === String(docId); });
  if (!doc) { showToast('Document introuvable', 'error'); return; }

  const t = STATE._transactionsReleveActuel && STATE._transactionsReleveActuel[indexTransaction];
  if (!t) { showToast('Transaction introuvable', 'error'); return; }
  const refTransaction = _construireRefTransaction(t);

  const listeActuelle = doc.transactions_bancaires_liees || [];
  const nouvelleListe = listeActuelle.filter(function(ref) { return ref !== refTransaction; });
  if (nouvelleListe.length === listeActuelle.length) {
    showToast('⚠️ Ce lien précis n\'a pas été retrouvé dans l\'historique — annulation impossible', 'error');
    return;
  }

  const montantAnnule = Math.abs(t.montant);
  const nouveauMontantRecu = Math.max(0, (Number(doc.montant_recu) || 0) - montantAnnule);
  const maj = {
    montant_recu: nouveauMontantRecu,
    transactions_bancaires_liees: nouvelleListe,
    statut: nouveauMontantRecu >= (Number(doc.ttc)||0) - 0.5 ? 'payee' : (type === 'achat' ? 'attente' : 'envoyee'),
    ecart_rapprochement: null, // remis à zéro — sera recalculé proprement si un nouveau lien dépasse encore
  };

  try {
    await sb.patch(table, 'id=eq.' + docId + '&user_id=eq.' + (STATE.entrepriseId || sb.user.id), maj);
    Object.assign(doc, maj);
  } catch(e) { showToast('Erreur: ' + e.message, 'error'); return; }

  // La transaction redevient disponible pour un nouveau rapprochement —
  // on recalcule ses correspondances pour qu'elle réapparaisse
  // correctement dans la liste (pas juste "vide").
  t._traitee = false;
  t.correspondances = suggererRapprochements([t])[0].correspondances;
  if (STATE._releveActuelId) _sauvegarderTransactionsReleveLocal(STATE._releveActuelId, STATE._transactionsReleveActuel);
  renderTransactionsReleve();
  showToast('✅ Rapprochement annulé — ' + fmt(montantAnnule) + ' MAD retiré(s)', 'success');
}

// ============================================================
// NOUVEAU (retour utilisateur) : les règles apprises n'étaient
// accessibles nulle part une fois créées — aucun écran pour les revoir
// ou en supprimer une. Ce petit écran liste toutes les règles actuelles,
// avec suppression possible.
// ============================================================
function ouvrirGestionRegles() {
  const regles = STATE.reglesRapprochement || [];
  const overlay = document.createElement('div');
  overlay.id = 'gestion-regles-overlay';
  overlay.style.cssText = 'position:fixed;inset:0;z-index:10001;background:rgba(0,0,0,0.6);display:flex;align-items:flex-end;justify-content:center';
  overlay.innerHTML =
    '<div style="background:#fff;border-radius:20px 20px 0 0;padding:20px;max-width:460px;width:100%;max-height:75vh;overflow-y:auto">' +
      '<div style="width:40px;height:4px;background:#E3DCCF;border-radius:2px;margin:0 auto 14px"></div>' +
      '<div style="font-size:15px;font-weight:700;margin-bottom:14px">🔒 Mes règles de rapprochement (' + regles.length + ')</div>' +
      (regles.length ? regles.map(function(r, i) {
        return '<div style="display:flex;justify-content:space-between;align-items:center;border:1px solid #E3DCCF;border-radius:10px;padding:10px 12px;margin-bottom:6px">' +
          '<div><div style="font-size:12px;font-weight:600">"' + escapeHTML(r.motif) + '"</div>' +
          '<div style="font-size:11px;color:#9C9186">→ ' + escapeHTML(r.nom_cible) + ' (' + (r.type==='achat'?'achat':'facture') + ')</div></div>' +
          '<button onclick="supprimerRegleRapprochement(' + r.id + ')" style="background:#F5E4E1;color:#B23A2E;border:none;border-radius:8px;padding:6px 10px;font-size:11px;cursor:pointer;font-family:inherit">🗑️</button>' +
        '</div>';
      }).join('') : '<div style="text-align:center;padding:20px;color:#9C9186;font-size:12px">Aucune règle créée pour l\'instant — vous pouvez en créer une depuis l\'écran de rapprochement, bouton "🔒 Créer une règle".</div>') +
      '<button onclick="document.getElementById(\'gestion-regles-overlay\').remove()" style="width:100%;padding:11px;background:none;color:#9C9186;border:none;font-size:13px;cursor:pointer;font-family:inherit;margin-top:10px">Fermer</button>' +
    '</div>';
  overlay.addEventListener('click', function(e) { if (e.target === overlay) overlay.remove(); });
  document.body.appendChild(overlay);
}

async function supprimerRegleRapprochement(regleId) {
  try {
    await fetch(SUPABASE_URL + '/rest/v1/regles_rapprochement?id=eq.' + regleId + '&user_id=eq.' + (STATE.entrepriseId || sb.user.id), {
      method: 'DELETE',
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + sb.token }
    });
    STATE.reglesRapprochement = (STATE.reglesRapprochement || []).filter(function(r) { return r.id !== regleId; });
    document.getElementById('gestion-regles-overlay')?.remove();
    ouvrirGestionRegles();
    showToast('✅ Règle supprimée', 'success');
  } catch(e) {
    showToast('Erreur: ' + e.message, 'error');
  }
}
