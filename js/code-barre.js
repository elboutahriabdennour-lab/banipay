// Tafir — codes-barres des articles : scan par la caméra ou par un lecteur USB / Bluetooth.
// Un lecteur de code-barres se comporte comme un clavier : il tape le code puis « Entrée ».
// La caméra utilise le détecteur du navigateur, ou à défaut une bibliothèque locale (js/vendor/zxing-library.min.js).
(function () {
  var FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'itf', 'qr_code'];
  var _zxingPromesse = null;

  function e(s) { return escapeHTML(String(s == null ? '' : s)); }
  function norm(s) { return String(s == null ? '' : s).replace(/[\u0000-\u001F\u007F\s]+/g, '').slice(0, 64); }

  function chargerZXing() {
    if (window.ZXing) return Promise.resolve(window.ZXing);
    if (_zxingPromesse) return _zxingPromesse;
    _zxingPromesse = new Promise(function (ok, ko) {
      var s = document.createElement('script');
      s.src = 'js/vendor/zxing-library.min.js?v=1';
      s.onload = function () { window.ZXing ? ok(window.ZXing) : ko(new Error('zxing')); };
      s.onerror = function () { _zxingPromesse = null; ko(new Error('zxing')); };
      document.head.appendChild(s);
    });
    return _zxingPromesse;
  }

  // Cherche un article par code-barres (puis par référence exacte).
  function trouver(code) {
    code = norm(code); if (!code) return null;
    var l = STATE.produits || [];
    return l.filter(function (p) { return norm(p.code_barre) === code; })[0]
        || l.filter(function (p) { return p.reference && norm(p.reference).toLowerCase() === code.toLowerCase(); })[0]
        || null;
  }

  // Ouvre l'écran de scan. surCode(code) est appelé une fois ; on ferme ensuite.
  function scanner(titre, surCode) {
    var ancien = document.getElementById('cb-scan'); if (ancien) ancien.remove();
    var ov = document.createElement('div');
    ov.id = 'cb-scan';
    ov.style.cssText = 'position:fixed;inset:0;z-index:100000;background:rgba(15,31,26,.96);display:flex;flex-direction:column;align-items:center;padding:16px;overflow:auto;font-family:inherit';
    ov.innerHTML =
      '<div style="width:100%;max-width:440px">'
      + '<div style="display:flex;align-items:center;gap:8px;margin-bottom:10px"><div style="flex:1;color:#fff;font-size:15px;font-weight:700">' + e(titre || 'Scanner un code-barres') + '</div>'
      + '<button type="button" id="cb-fermer" style="background:rgba(255,255,255,.15);color:#fff;border:none;border-radius:8px;padding:8px 12px;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit">Fermer</button></div>'
      + '<div style="position:relative;background:#000;border-radius:14px;overflow:hidden;aspect-ratio:4/3">'
      + '<video id="cb-video" playsinline muted style="width:100%;height:100%;object-fit:cover"></video>'
      + '<div style="position:absolute;left:12%;right:12%;top:50%;height:2px;background:#E24B3B;box-shadow:0 0 8px #E24B3B"></div></div>'
      + '<div id="cb-etat" style="color:#C9D6CF;font-size:12px;margin:8px 0;min-height:16px">Placez le code-barres devant la caméra.</div>'
      + '<div style="background:#fff;border-radius:12px;padding:12px"><div style="font-size:12px;font-weight:600;margin-bottom:6px;color:#14241F">Ou tapez le code / utilisez votre lecteur</div>'
      + '<div style="display:flex;gap:8px"><input id="cb-manuel" inputmode="text" autocomplete="off" autocapitalize="off" placeholder="Code-barres" style="flex:1;min-width:0;padding:11px;border:1.5px solid #DDE3DA;border-radius:10px;font-size:15px;font-family:inherit">'
      + '<button type="button" id="cb-valider" style="padding:11px 16px;border:none;border-radius:10px;background:#1B5E4B;color:#fff;font-weight:700;font-size:14px;cursor:pointer;font-family:inherit">OK</button></div></div>'
      + '</div>';
    document.body.appendChild(ov);

    var flux = null, arret = false, lecteur = null, boucle = null, fini = false;
    function nettoyer() {
      arret = true; if (boucle) clearTimeout(boucle);
      try { if (lecteur && lecteur.reset) lecteur.reset(); } catch (x) {}
      try { if (flux) flux.getTracks().forEach(function (t) { t.stop(); }); } catch (x) {}
      ov.remove();
    }
    function trouve(code) {
      code = norm(code); if (!code || fini) return;
      fini = true; nettoyer();
      try { surCode(code); } catch (x) { console.warn('scan:', x); }
    }
    ov.querySelector('#cb-fermer').onclick = nettoyer;
    var champ = ov.querySelector('#cb-manuel');
    ov.querySelector('#cb-valider').onclick = function () { trouve(champ.value); };
    champ.onkeydown = function (ev) { if (ev.key === 'Enter') { ev.preventDefault(); trouve(champ.value); } };
    setTimeout(function () { try { champ.focus(); } catch (x) {} }, 100);

    function etat(t) { var n = ov.querySelector('#cb-etat'); if (n) n.textContent = t; }
    var video = ov.querySelector('#cb-video');
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { etat('Caméra indisponible ici : utilisez le champ ci-dessous ou un lecteur.'); return; }

    if ('BarcodeDetector' in window) {
      navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false }).then(function (s) {
        if (arret) { s.getTracks().forEach(function (t) { t.stop(); }); return; }
        flux = s; video.srcObject = s; video.play().catch(function () {});
        var det;
        try { det = new BarcodeDetector({ formats: FORMATS }); } catch (x) { det = new BarcodeDetector(); }
        (function tour() {
          if (arret) return;
          det.detect(video).then(function (r) { if (r && r.length && r[0].rawValue) trouve(r[0].rawValue); else boucle = setTimeout(tour, 180); })
            .catch(function () { boucle = setTimeout(tour, 400); });
        })();
      }).catch(function () { etat('Caméra refusée : utilisez le champ ci-dessous ou un lecteur.'); });
    } else {
      chargerZXing().then(function (Z) {
        if (arret) return;
        var hints = new Map();
        hints.set(Z.DecodeHintType.POSSIBLE_FORMATS, [Z.BarcodeFormat.EAN_13, Z.BarcodeFormat.EAN_8, Z.BarcodeFormat.UPC_A, Z.BarcodeFormat.UPC_E, Z.BarcodeFormat.CODE_128, Z.BarcodeFormat.CODE_39, Z.BarcodeFormat.ITF, Z.BarcodeFormat.QR_CODE]);
        lecteur = new Z.BrowserMultiFormatReader(hints, 300);
        lecteur.decodeFromConstraints({ video: { facingMode: { ideal: 'environment' } }, audio: false }, video, function (res) {
          if (res && res.getText) trouve(res.getText());
        }).catch(function () { etat('Caméra refusée : utilisez le champ ci-dessous ou un lecteur.'); });
      }).catch(function () { etat('Scan caméra indisponible : utilisez le champ ci-dessous ou un lecteur.'); });
    }
  }

  // Remplit un champ de formulaire avec un code scanné.
  function scannerDansChamp(idChamp) {
    scanner('Scanner le code-barres de l\'article', function (code) {
      var c = document.getElementById(idChamp); if (c) { c.value = code; c.dispatchEvent(new Event('input', { bubbles: true })); }
      var p = trouver(code);
      var courant = window.STATE && STATE.currentProduit;
      if (p && !(courant && courant.id === p.id)) showToast('⚠️ Ce code est déjà utilisé par : ' + p.nom, 'error');
      else showToast('✅ Code lu : ' + code, 'success');
    });
  }

  // Code interne Tafir (EAN-13 de la plage 200-299, réservée à l'usage interne) avec clé de contrôle.
  function genererInterne(idChamp) {
    var base = '2' + String(Date.now()).slice(-6) + String(Math.floor(Math.random() * 1e5)).padStart(5, '0');
    base = base.slice(0, 12).padEnd(12, '0');
    var s = 0; for (var i = 0; i < 12; i++) s += Number(base[i]) * (i % 2 ? 3 : 1);
    var code = base + ((10 - (s % 10)) % 10);
    var c = document.getElementById(idChamp); if (c) c.value = code;
    return code;
  }

  // Produits : scan → ajuster le stock de l'article trouvé.
  function scannerPourStock() {
    scanner('Scanner pour le stock (entrée / sortie)', function (code) {
      var p = trouver(code);
      if (!p) { if (confirm('Aucun article avec le code ' + code + '. Créer cet article maintenant ?')) { window._cbCodeAttente = code; goScreen('nouveau-produit', null); } return; }
      if (typeof ouvrirAjustementStock === 'function') ouvrirAjustementStock(p.id);
    });
  }

  // Facture / achat : scan → ajoute l'article (ou +1 s'il est déjà dans la facture).
  function scannerPourLigne() {
    scanner('Scanner un article', function (code) {
      var p = trouver(code);
      if (!p) { showToast('Aucun article avec le code ' + code, 'error'); return; }
      var achat = !!window._catalogueModePourAchat;
      if (!achat && Array.isArray(STATE.lignesF)) {
        var l = STATE.lignesF.filter(function (x) { return x.produit_id === p.id; })[0];
        if (l) { l.qte = (Number(l.qte) || 0) + 1; if (typeof closeAllModals === 'function') closeAllModals(); if (typeof renderLignesF === 'function') renderLignesF(); showToast('✅ ' + p.nom + ' : quantité ' + l.qte); return; }
      }
      if (!achat && p.stock != null && Number(p.stock) <= 0) showToast('⚠️ ' + p.nom + ' : stock à 0');
      if (typeof ajouterDepuisCatalogue === 'function') ajouterDepuisCatalogue(p.id);
    });
  }

  window.CB = { norm: norm, trouver: trouver, scanner: scanner, scannerDansChamp: scannerDansChamp, genererInterne: genererInterne, scannerPourStock: scannerPourStock, scannerPourLigne: scannerPourLigne };
})();
