// Tafir — accessibilité au clavier : tout élément cliquable (div, span, li avec onclick) devient atteignable avec Tab
// et s'active avec Entrée ou Espace. Aucune donnée, aucun appel réseau.
(function () {
  var SEL = '[onclick]:not(button):not(a):not(input):not(select):not(textarea):not(label):not([tabindex])';
  function preparer(racine) {
    var l = (racine && racine.querySelectorAll) ? racine.querySelectorAll(SEL) : [];
    for (var i = 0; i < l.length; i++) {
      var n = l[i];
      if (n.closest('[aria-hidden="true"]')) continue;
      n.setAttribute('tabindex', '0');
      if (!n.getAttribute('role')) n.setAttribute('role', 'button');
    }
    if (racine && racine.matches && racine.matches(SEL)) { racine.setAttribute('tabindex', '0'); if (!racine.getAttribute('role')) racine.setAttribute('role', 'button'); }
  }
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    var n = e.target;
    if (!n || n.getAttribute('role') !== 'button' || !n.hasAttribute('onclick')) return;
    if (/^(INPUT|TEXTAREA|SELECT|BUTTON|A)$/.test(n.tagName)) return;
    e.preventDefault(); n.click();
  });
  function demarrer() {
    preparer(document.body);
    var t = null;
    new MutationObserver(function () { if (t) return; t = setTimeout(function () { t = null; preparer(document.body); }, 200); })
      .observe(document.body, { childList: true, subtree: true });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', demarrer); else demarrer();
})();
