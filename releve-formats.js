// ZELTO — releve-formats.js
// Lecture des relevés bancaires dans TOUS les formats courants.
// À charger APRÈS js/releve-bancaire-ocr.js : remplace lireReleveBancaire().
//
// Formats pris en charge :
//   PDF texte, PDF scanné (OCR), photo / scan (JPG, PNG, WEBP, BMP, GIF),
//   Excel (.xlsx .xls .xlsm .xlsb .ods), CSV / TSV / TXT (séparateur et
//   encodage détectés), OFX / QFX, QIF, MT940 (.sta .mt940 .swi), HTML.
//
// Tout est lu dans le navigateur ; les transactions sont renvoyées dans le
// même format qu'avant : { dateBrute, description, montant } (montant signé).

(function () {
  function _octetsDepuisDataUrl(dataUrl) {
    var base64 = String(dataUrl).split(',')[1] || '';
    var bin = atob(base64);
    var octets = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) octets[i] = bin.charCodeAt(i);
    return octets;
  }

  // UTF-8 si valide, sinon Windows-1252 (cas fréquent des exports bancaires)
  function _texteDepuisOctets(octets) {
    try { return new TextDecoder('utf-8', { fatal: true }).decode(octets).replace(/^﻿/, ''); }
    catch (e) { return new TextDecoder('windows-1252').decode(octets); }
  }

  function _extension(nom) {
    var m = String(nom || '').toLowerCase().match(/\.([a-z0-9]+)$/);
    return m ? m[1] : '';
  }

  function _nombre(valeur) {
    var s = String(valeur == null ? '' : valeur).trim();
    if (!s) return NaN;
    var negatif = /^\(.*\)$/.test(s) || /-\s*$/.test(s) || /^-/.test(s);
    s = s.replace(/[()\s_ A-Za-z€$]/g, '').replace(/^-|-$/g, '');
    // 1.234,56 (FR/MA) ou 1,234.56 (EN)
    if (s.indexOf(',') > -1 && s.indexOf('.') > -1) {
      if (s.lastIndexOf(',') > s.lastIndexOf('.')) s = s.replace(/\./g, '').replace(',', '.');
      else s = s.replace(/,/g, '');
    } else if (s.indexOf(',') > -1) {
      s = s.replace(',', '.');
    }
    var n = parseFloat(s);
    return isNaN(n) ? NaN : (negatif ? -Math.abs(n) : n);
  }

  function _dateFR(d) {
    return String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0') + '/' + d.getFullYear();
  }

  // ───────── Tableaux (CSV, Excel, HTML) : détection de la ligne d'en-têtes ─────────
  var MOTS_MONTANT = ['montant', 'amount', 'débit', 'debit', 'crédit', 'credit', 'somme', 'sortie', 'entrée', 'entree', 'retrait', 'dépôt', 'depot', 'withdrawal', 'deposit'];

  function _lignesDepuisRangees(rangees) {
    var idx = -1;
    for (var i = 0; i < Math.min(rangees.length, 60); i++) {
      var cells = (rangees[i] || []).map(function (c) { return String(c == null ? '' : c).toLowerCase().trim(); });
      var aDate = cells.some(function (c) { return c.indexOf('date') > -1; });
      var aMontant = cells.some(function (c) { return MOTS_MONTANT.some(function (m) { return c.indexOf(m) > -1; }); });
      if (aDate && aMontant) { idx = i; break; }
    }
    if (idx < 0) return [];
    var entetes = (rangees[idx] || []).map(function (c, k) {
      var nom = String(c == null ? '' : c).trim();
      return nom || ('col' + k);
    });
    var vus = {};
    entetes = entetes.map(function (nom) { vus[nom] = (vus[nom] || 0) + 1; return vus[nom] > 1 ? nom + ' ' + vus[nom] : nom; });
    var lignes = [];
    for (var j = idx + 1; j < rangees.length; j++) {
      // Cellules "date" Excel : SheetJS peut décaler de quelques secondes (jour précédent) -> on arrondit au jour le plus proche
      var r = (rangees[j] || []).map(function (c) {
        return (c instanceof Date && !isNaN(c.getTime())) ? _dateFR(new Date(c.getTime() + 12 * 3600 * 1000)) : c;
      });
      if (!r.some(function (c) { return String(c == null ? '' : c).trim() !== ''; })) continue;
      var o = {};
      entetes.forEach(function (nom, k) { o[nom] = r[k] === undefined ? '' : r[k]; });
      lignes.push(o);
    }
    return lignes;
  }

  function _transactionsDepuisRangees(rangees) {
    var lignes = _lignesDepuisRangees(rangees);
    if (!lignes.length) return [];
    return _extraireTransactionsReleveExcel(lignes);
  }

  // ───────── CSV / TSV : séparateur détecté, guillemets gérés ─────────
  function _parserCSV(texte) {
    var echantillon = texte.split(/\r?\n/).slice(0, 15).join('\n');
    var sep = ';', meilleur = -1;
    [';', ',', '\t', '|'].forEach(function (s) {
      var n = echantillon.split(s).length - 1;
      if (n > meilleur) { meilleur = n; sep = s; }
    });
    var rangees = [], rang = [], champ = '', guillemets = false;
    for (var i = 0; i < texte.length; i++) {
      var c = texte[i];
      if (guillemets) {
        if (c === '"') { if (texte[i + 1] === '"') { champ += '"'; i++; } else guillemets = false; }
        else champ += c;
      } else if (c === '"') guillemets = true;
      else if (c === sep) { rang.push(champ); champ = ''; }
      else if (c === '\n' || c === '\r') {
        if (c === '\r' && texte[i + 1] === '\n') i++;
        rang.push(champ); champ = ''; rangees.push(rang); rang = [];
      } else champ += c;
    }
    if (champ !== '' || rang.length) { rang.push(champ); rangees.push(rang); }
    return rangees;
  }

  // ───────── OFX / QFX ─────────
  function _transactionsOFX(texte) {
    var res = [];
    var blocs = texte.split(/<STMTTRN>/i).slice(1);
    blocs.forEach(function (bloc) {
      function champ(nom) {
        var m = bloc.match(new RegExp('<' + nom + '>([^<\\r\\n]*)', 'i'));
        return m ? m[1].trim() : '';
      }
      var montant = _nombre(champ('TRNAMT'));
      var d = champ('DTPOSTED').match(/^(\d{4})(\d{2})(\d{2})/);
      if (isNaN(montant) || !d) return;
      var description = [champ('NAME'), champ('MEMO')].filter(Boolean).join(' ').trim() || 'Transaction';
      res.push({ dateBrute: d[3] + '/' + d[2] + '/' + d[1], description: description.slice(0, 80), montant: montant });
    });
    return res;
  }

  // ───────── QIF ─────────
  function _transactionsQIF(texte) {
    var res = [], cur = {};
    texte.split(/\r?\n/).forEach(function (l) {
      if (!l) return;
      var code = l[0], val = l.slice(1).trim();
      if (code === '^') {
        if (cur.T !== undefined && cur.D) {
          var m = String(cur.D).match(/(\d{1,2})[\/\-.'](\d{1,2})[\/\-.'](\d{2,4})/);
          var montant = _nombre(cur.T);
          if (m && !isNaN(montant)) {
            var an = m[3].length === 2 ? '20' + m[3] : m[3];
            res.push({ dateBrute: m[1].padStart(2, '0') + '/' + m[2].padStart(2, '0') + '/' + an, description: String(cur.P || cur.M || 'Transaction').slice(0, 80), montant: montant });
          }
        }
        cur = {};
      } else if ('DTPM'.indexOf(code) > -1) cur[code] = val;
    });
    return res;
  }

  // ───────── MT940 (SWIFT) ─────────
  function _transactionsMT940(texte) {
    var res = [];
    var lignes = texte.split(/\r?\n/);
    for (var i = 0; i < lignes.length; i++) {
      var m = lignes[i].match(/^:61:(\d{2})(\d{2})(\d{2})(?:\d{4})?(R?[CD])[A-Z]?([\d,]+)/);
      if (!m) continue;
      var libelle = '';
      var k = i + 1;
      if (lignes[k] && lignes[k].indexOf(':86:') === 0) {
        libelle = lignes[k].slice(4);
        k++;
        while (lignes[k] && !/^:\d{2}[A-Z]?:/.test(lignes[k]) && lignes[k] !== '-') { libelle += ' ' + lignes[k]; k++; }
      }
      var montant = parseFloat(m[5].replace(',', '.'));
      if (isNaN(montant)) continue;
      if (m[4].indexOf('D') > -1) montant = -montant;
      res.push({ dateBrute: m[3] + '/' + m[2] + '/20' + m[1], description: (libelle.replace(/\?\d{2}/g, ' ').replace(/\s+/g, ' ').trim() || 'Transaction').slice(0, 80), montant: montant });
    }
    return res;
  }

  // ───────── HTML (tableau enregistré depuis l'e-banking) ─────────
  function _transactionsHTML(texte) {
    var doc = new DOMParser().parseFromString(texte, 'text/html');
    var rangees = [];
    doc.querySelectorAll('tr').forEach(function (tr) {
      var cells = Array.prototype.map.call(tr.querySelectorAll('th,td'), function (c) { return c.textContent.replace(/\s+/g, ' ').trim(); });
      if (cells.length) rangees.push(cells);
    });
    var t = _transactionsDepuisRangees(rangees);
    return t.length ? t : _extraireTransactionsReleve(doc.body ? doc.body.innerText || doc.body.textContent || '' : '');
  }

  // ───────── Excel / ODS (tous les onglets) ─────────
  async function _transactionsExcel(octets) {
    if (typeof _chargerSheetJS === 'function') await _chargerSheetJS();
    if (typeof XLSX === 'undefined') {
      STATE._derniereErreurLectureReleve = 'La bibliothèque de lecture Excel (SheetJS) n\'a pas pu être chargée — vérifiez votre connexion internet et réessayez.';
      return null;
    }
    var classeur = XLSX.read(octets, { type: 'array', cellDates: true });
    var meilleures = [];
    for (var s = 0; s < classeur.SheetNames.length; s++) {
      var feuille = classeur.Sheets[classeur.SheetNames[s]];
      var rangees = XLSX.utils.sheet_to_json(feuille, { header: 1, defval: '', raw: true });
      var t = _transactionsDepuisRangees(rangees);
      if (!t.length) {
        // Ancienne méthode (première ligne = en-têtes) en secours
        var lignes = XLSX.utils.sheet_to_json(feuille, { defval: '' });
        t = _extraireTransactionsReleveExcel(lignes);
      }
      if (t.length > meilleures.length) meilleures = t;
    }
    return meilleures;
  }

  // ───────── PDF : texte, puis OCR si le PDF est un scan ─────────
  async function _transactionsPDF(octets) {
    try { await _chargerPdfJs(); } catch (e) {
      STATE._derniereErreurLectureReleve = 'La bibliothèque de lecture PDF (PDF.js) n\'a pas pu être chargée — vérifiez votre connexion internet et réessayez.';
      return null;
    }
    var doc = await pdfjsLib.getDocument({ data: octets.slice() }).promise;
    var texte = '';
    var nbPages = Math.min(doc.numPages, 20);
    for (var p = 1; p <= nbPages; p++) {
      var page = await doc.getPage(p);
      var contenu = await page.getTextContent();
      // Regroupe par ligne (même hauteur) pour garder date + libellé + montant ensemble
      var lignes = {};
      contenu.items.forEach(function (it) {
        var y = Math.round(it.transform[5] / 3);
        (lignes[y] = lignes[y] || []).push(it);
      });
      Object.keys(lignes).map(Number).sort(function (a, b) { return b - a; }).forEach(function (y) {
        texte += lignes[y].sort(function (a, b) { return a.transform[4] - b.transform[4]; }).map(function (it) { return it.str; }).join(' ') + '\n';
      });
    }
    var t = _extraireTransactionsReleve(texte);
    if (t.length) return t;
    // Pas de texte exploitable -> PDF scanné : lecture par OCR
    if (texte.replace(/\s/g, '').length < 80) {
      try { if (typeof _chargerTesseract === 'function') await _chargerTesseract(); } catch (e) {}
      if (typeof Tesseract === 'undefined') {
        STATE._derniereErreurLectureReleve = 'PDF scanné : la reconnaissance de texte (Tesseract.js) n\'a pas pu être chargée — vérifiez votre connexion internet.';
        return null;
      }
      var ocr = '';
      var pagesOCR = Math.min(doc.numPages, 8);
      for (var q = 1; q <= pagesOCR; q++) {
        var pg = await doc.getPage(q);
        var vp = pg.getViewport({ scale: 2 });
        var cv = document.createElement('canvas');
        cv.width = vp.width; cv.height = vp.height;
        await pg.render({ canvasContext: cv.getContext('2d'), viewport: vp }).promise;
        var r = await Tesseract.recognize(cv, 'fra', { logger: function () {} });
        ocr += (r.data.text || '') + '\n';
      }
      return _extraireTransactionsReleve(ocr);
    }
    return t;
  }

  async function _transactionsImage(dataUrl) {
    return await _lireReleveBancaireImage(dataUrl);
  }

  // ───────── Routeur principal ─────────
  function _normaliserDates(transactions) {
    if (!transactions) return transactions;
    transactions.forEach(function (t) {
      var m = String(t.dateBrute || '').match(/^(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})/);
      if (m) t.dateBrute = m[3].padStart(2, '0') + '/' + m[2].padStart(2, '0') + '/' + m[1];
    });
    return transactions;
  }

  var _lireBrut = null;
  window.lireReleveBancaire = async function (fichierDataUrl, nomFichier) {
    return _normaliserDates(await _lireReleveBancaireTousFormats(fichierDataUrl, nomFichier));
  };

  async function _lireReleveBancaireTousFormats(fichierDataUrl, nomFichier) {
    STATE._derniereErreurLectureReleve = null;
    try {
      var mime = ((String(fichierDataUrl).match(/^data:([^;,]*)/) || [])[1] || '').toLowerCase();
      var ext = _extension(nomFichier);
      var octets = _octetsDepuisDataUrl(fichierDataUrl);
      var debut = String.fromCharCode.apply(null, Array.prototype.slice.call(octets.slice(0, 8)));

      var estPDF = ext === 'pdf' || mime === 'application/pdf' || debut.indexOf('%PDF') === 0;
      var estImage = /^(jpg|jpeg|png|webp|bmp|gif|tif|tiff|heic|heif)$/.test(ext) || /^image\//.test(mime);
      var estExcel = /^(xlsx|xls|xlsm|xlsb|ods)$/.test(ext) || (debut.indexOf('PK') === 0 && ext !== 'docx') || debut.indexOf('\xD0\xCF\x11\xE0') === 0;

      if (/^(heic|heif)$/.test(ext) || /image\/hei[cf]/.test(mime)) {
        STATE._derniereErreurLectureReleve = 'Format photo HEIC (iPhone) non lisible par le navigateur. Réglez l\'appareil photo sur "Le plus compatible" (JPG) ou faites une capture d\'écran.';
        return null;
      }
      if (/^(doc|docx)$/.test(ext)) {
        STATE._derniereErreurLectureReleve = 'Les fichiers Word ne sont pas lisibles. Exportez le relevé en PDF, Excel ou CSV depuis votre banque.';
        return null;
      }
      if (estPDF) return await _transactionsPDF(octets);
      if (estImage) return await _transactionsImage(fichierDataUrl);
      if (estExcel) {
        var tx = await _transactionsExcel(octets);
        if (tx && tx.length) return tx;
        if (ext === 'xls' || ext === 'xlsx' || ext === 'xlsm' || ext === 'xlsb' || ext === 'ods') return tx;
      }

      // Formats texte : OFX, QIF, MT940, CSV, TXT, HTML...
      var texte = _texteDepuisOctets(octets);
      var t;
      if (/<OFX>|OFXHEADER|<STMTTRN>/i.test(texte)) { t = _transactionsOFX(texte); if (t.length) return t; }
      if (/^:20:|:61:/m.test(texte)) { t = _transactionsMT940(texte); if (t.length) return t; }
      if (/^!Type:/mi.test(texte) || ext === 'qif') { t = _transactionsQIF(texte); if (t.length) return t; }
      if (/<table|<html|<tr/i.test(texte) && /^(html|htm)$/.test(ext || 'html')) { t = _transactionsHTML(texte); if (t.length) return t; }
      t = _transactionsDepuisRangees(_parserCSV(texte));
      if (t.length) { STATE._dernierTexteReleveBrut = texte; return t; }
      // Dernier recours : texte brut (relevé copié-collé dans un .txt)
      return _extraireTransactionsReleve(texte);
    } catch (e) {
      console.warn('lireReleveBancaire:', e);
      STATE._derniereErreurLectureReleve = 'Fichier illisible : ' + (e && e.message || 'erreur inconnue');
      return null;
    }
  }

  // Exposé pour les tests
  window._releveFormats = { parserCSV: _parserCSV, transactionsDepuisRangees: _transactionsDepuisRangees, transactionsOFX: _transactionsOFX, transactionsQIF: _transactionsQIF, transactionsMT940: _transactionsMT940, nombre: _nombre };
})();
