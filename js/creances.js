// Tafir — créances clients : ce que chaque client doit encore, avec relance WhatsApp groupée.
// Lecture seule sur les factures déjà enregistrées (aucune table nouvelle).
(function () {
  function r2(n) { return Math.round((Number(n) + Number.EPSILON) * 100) / 100; }
  function e(s) { return escapeHTML(String(s == null ? '' : s)); }
  function mad(n) { return (typeof fmt === 'function' ? fmt(n) : String(r2(n))) + ' MAD'; }
  function jourISO() { var d = new Date(); return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }

  function reste(f) { return Math.max(0, r2((Number(f.ttc) || 0) - (Number(f.montant_recu) || 0))); }
  function ouverte(f) { return f && ['payee', 'annulee', 'brouillon'].indexOf(f.statut) < 0 && reste(f) > 0.009; }

  // Regroupe les factures ouvertes par client.
  function calculer() {
    var auj = jourISO(), m = {};
    (STATE.factures || []).filter(ouverte).forEach(function (f) {
      var nom = String(f.client || '—'), k = nom.trim().toLowerCase();
      var o = m[k] || (m[k] = { nom: nom, du: 0, retard: 0, n: 0, factures: [], plusAncienne: null });
      var r = reste(f); o.du += r; o.n++;
      var enRetard = f.statut === 'retard' || (f.echeance && String(f.echeance).slice(0, 10) < auj);
      if (enRetard) { o.retard += r; f._enRetard = true; } else f._enRetard = false;
      o.factures.push(f);
      var d = String(f.date_emission || '').slice(0, 10);
      if (d && (!o.plusAncienne || d < o.plusAncienne)) o.plusAncienne = d;
    });
    return Object.keys(m).map(function (k) {
      var o = m[k]; o.du = r2(o.du); o.retard = r2(o.retard);
      var c = (STATE.clients || []).filter(function (x) { return String(x.nom || '').trim().toLowerCase() === k; })[0];
      o.client = c || null;
      o.limite = c && Number(c.limite_credit) > 0 ? Number(c.limite_credit) : 0;
      return o;
    }).sort(function (a, b) { return b.retard - a.retard || b.du - a.du; });
  }

  function message(o) {
    var lignes = o.factures.map(function (f) {
      return '• ' + (f.ref || '') + ' : ' + mad(reste(f)) + (f.echeance ? ' (échéance ' + String(f.echeance).slice(0, 10) + ')' : '');
    }).join('\n');
    var ent = (STATE.profil && (STATE.profil.nom_entreprise || STATE.profil.nom)) || '';
    return 'Bonjour ' + o.nom + ',\nSauf erreur de notre part, il reste ' + mad(o.du) + ' à régler :\n' + lignes
      + '\nMerci de votre retour.' + (ent ? '\n' + ent : '');
  }

  function relancer(i) {
    var o = (window._creancesListe || [])[i]; if (!o) return;
    var msg = message(o), tel = o.client && o.client.tel;
    if (tel) {
      var t = String(tel).replace(/[^0-9+]/g, '').replace(/^\+/, '').replace(/^00/, '').replace(/^0/, '212');
      window.open('https://wa.me/' + t + '?text=' + encodeURIComponent(msg), '_blank');
    } else {
      try { navigator.clipboard && navigator.clipboard.writeText(msg); } catch (x) {}
      showToast('Pas de numéro pour ce client : message copié, collez-le où vous voulez');
    }
  }

  function basculer(i) {
    var z = document.getElementById('cr-det-' + i); if (!z) return;
    z.style.display = z.style.display === 'none' ? 'block' : 'none';
  }

  window.initCreances = function () {
    var cont = document.getElementById('creances-contenu'); if (!cont) return;
    var liste = calculer(); window._creancesListe = liste;
    var total = r2(liste.reduce(function (s, o) { return s + o.du; }, 0));
    var retard = r2(liste.reduce(function (s, o) { return s + o.retard; }, 0));
    var h = '<div style="display:flex;gap:8px;margin-bottom:12px">'
      + '<div style="flex:1;background:#fff;border:1px solid #DDE3DA;border-radius:12px;padding:12px"><div style="font-size:11px;color:#8E9C95">Total à encaisser</div><div style="font-size:18px;font-weight:800;color:#14241F">' + e(mad(total)) + '</div></div>'
      + '<div style="flex:1;background:#fff;border:1px solid #DDE3DA;border-radius:12px;padding:12px"><div style="font-size:11px;color:#8E9C95">Dont en retard</div><div style="font-size:18px;font-weight:800;color:' + (retard > 0 ? '#B3402F' : '#14241F') + '">' + e(mad(retard)) + '</div></div></div>';
    if (!liste.length) h += '<div style="text-align:center;color:#6B7A72;font-size:13px;padding:30px 10px">Aucun client ne vous doit d\'argent. 🎉</div>';
    liste.forEach(function (o, i) {
      var depasse = o.limite && o.du > o.limite;
      h += '<div style="background:#fff;border:1px solid #DDE3DA;border-radius:12px;margin-bottom:8px;overflow:hidden">'
        + '<div data-cr-ouvrir="' + i + '" style="display:flex;align-items:center;gap:10px;padding:12px;cursor:pointer">'
        + '<div style="flex:1;min-width:0"><div style="font-size:14px;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + e(o.nom) + '</div>'
        + '<div style="font-size:11px;color:#6B7A72">' + o.n + ' facture' + (o.n > 1 ? 's' : '') + (o.plusAncienne ? ' · depuis le ' + e(o.plusAncienne) : '') + '</div>'
        + (o.retard > 0 ? '<div style="font-size:11px;color:#B3402F;font-weight:600">En retard : ' + e(mad(o.retard)) + '</div>' : '')
        + (depasse ? '<div style="font-size:11px;color:#B8860B;font-weight:600">⚠️ Au-dessus de la limite de crédit (' + e(mad(o.limite)) + ')</div>' : '')
        + '</div><div style="font-size:15px;font-weight:800">' + e(mad(o.du)) + '</div></div>'
        + '<div id="cr-det-' + i + '" style="display:none;border-top:1px solid #EAE4DA;padding:8px 12px">'
        + o.factures.map(function (f) {
          return '<div data-cr-facture="' + e(f.id) + '" style="display:flex;gap:8px;padding:7px 0;font-size:12px;cursor:pointer"><div style="flex:1">' + e(f.ref || '') + (f._enRetard ? ' <span style="color:#B3402F">· en retard</span>' : '')
            + '<div style="font-size:10px;color:#8E9C95">émise le ' + e(String(f.date_emission || '').slice(0, 10)) + (f.echeance ? ' · échéance ' + e(String(f.echeance).slice(0, 10)) : '') + '</div></div><div style="font-weight:700">' + e(mad(reste(f))) + '</div></div>';
        }).join('')
        + '<div style="display:flex;gap:8px;margin-top:8px"><button type="button" data-cr-relance="' + i + '" style="flex:1;padding:10px;border:none;border-radius:10px;background:#25D366;color:#fff;font-weight:700;font-size:13px;cursor:pointer;font-family:inherit">📱 Relancer sur WhatsApp</button>'
        + (o.client ? '<button type="button" data-cr-fiche="' + e(o.client.id) + '" style="padding:10px 14px;border:none;border-radius:10px;background:#E7F2EC;color:#1B5E4B;font-weight:700;font-size:13px;cursor:pointer;font-family:inherit">Fiche</button>' : '')
        + '</div></div></div>';
    });
    cont.innerHTML = h;
    cont.querySelectorAll('[data-cr-ouvrir]').forEach(function (b) { b.onclick = function () { basculer(b.getAttribute('data-cr-ouvrir')); }; });
    cont.querySelectorAll('[data-cr-relance]').forEach(function (b) { b.onclick = function () { relancer(+b.getAttribute('data-cr-relance')); }; });
    cont.querySelectorAll('[data-cr-facture]').forEach(function (b) { b.onclick = function () { var id = b.getAttribute('data-cr-facture'); var f = (STATE.factures || []).filter(function (x) { return String(x.id) === id; })[0]; if (f && typeof openDetail === 'function') openDetail(f.id); }; });
    cont.querySelectorAll('[data-cr-fiche]').forEach(function (b) { b.onclick = function () { var id = b.getAttribute('data-cr-fiche'); var c = (STATE.clients || []).filter(function (x) { return String(x.id) === id; })[0]; if (c && typeof openDetailClient === 'function') openDetailClient(c.id); }; });
  };
  window.CREANCES = { calculer: calculer, reste: reste };
})();
