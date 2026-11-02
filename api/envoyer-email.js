// Tafir — api/envoyer-email.js
// Envoie par email, via Resend, un lien vers une facture / un devis / un bon de commande, ou un rappel de paiement.
// Sécurité : connexion obligatoire, un seul destinataire, texte construit ICI (l'utilisateur ne peut pas envoyer
// n'importe quoi), liens limités à tafir.fr, plafond par jour.
// Variables à définir dans Vercel (jamais dans le code) : RESEND_API_KEY ; facultatives : EMAIL_EXPEDITEUR, EMAIL_LIMITE_JOUR.

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://samojsvlfcrhdpspngsp.supabase.co';
// Clé publique « anon » : déjà visible dans le site, ce n'est pas un secret.
const SUPABASE_ANON = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNhbW9qc3ZsZmNyaGRwc3BuZ3NwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIyODEwNTgsImV4cCI6MjA5Nzg1NzA1OH0.ulmUmEysD4BYZDFAtWADteuw6UUKwFCkD9ebLxoZS9w';
const LIMITE_JOUR = parseInt(process.env.EMAIL_LIMITE_JOUR || '40', 10);
const EXPEDITEUR = process.env.EMAIL_EXPEDITEUR || 'factures@tafir.fr';
const HOTES_OK = ['tafir.fr', 'www.tafir.fr'].concat((process.env.EMAIL_HOTES_LIENS || '').split(',').map(function (s) { return s.trim().toLowerCase(); }).filter(Boolean));
const TYPES = { document: 1, relance: 1, test: 1 };

function ligne(s, max) { return String(s == null ? '' : s).replace(/[\r\n\t<>"]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max); }
function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
function emailOk(e) { return typeof e === 'string' && e.length <= 160 && /^[^\s@<>",;]+@[^\s@<>",;]+\.[A-Za-z]{2,}$/.test(e); }
function montant(n, devise) {
  const x = Number(n);
  if (!isFinite(x)) return '';
  return x.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ' + ligne(devise || 'MAD', 5);
}
function lienOk(l) {
  try { const u = new URL(String(l)); return u.protocol === 'https:' && HOTES_OK.indexOf(u.hostname.toLowerCase()) >= 0 && String(l).length < 600 ? u.toString() : null; } catch (e) { return null; }
}

function construire(b, entreprise) {
  const ref = ligne(b.ref, 40), client = ligne(b.client, 80), libelle = ['facture', 'devis', 'bon de commande'].indexOf(b.libelle) >= 0 ? b.libelle : 'document';
  const mt = montant(b.montant, b.devise), lien = lienOk(b.lien);
  const tel = ligne(b.tel, 30);
  let sujet, lignes;
  if (b.type === 'test') {
    sujet = 'Test d\'envoi Tafir';
    lignes = ['Ceci est un email de test envoyé depuis Tafir.', 'Si vous le lisez, l\'envoi d\'emails fonctionne.'];
  } else if (b.type === 'relance') {
    sujet = 'Rappel de paiement : ' + libelle + ' ' + ref;
    lignes = ['Bonjour ' + client + ',', 'Sauf erreur de notre part, le règlement de notre ' + libelle + ' ' + ref + (mt ? ' (' + mt + ' TTC)' : '') + ' n\'est pas encore parvenu.', 'Si vous avez déjà payé, merci d\'ignorer ce message.'];
  } else {
    sujet = libelle.charAt(0).toUpperCase() + libelle.slice(1) + ' ' + ref + ' de ' + entreprise;
    lignes = ['Bonjour ' + client + ',', 'Veuillez trouver notre ' + libelle + ' ' + ref + (mt ? ' d\'un montant de ' + mt + ' TTC' : '') + '.'];
  }
  const message = ligne(b.message, 400);
  if (message) lignes.push(message);
  const signature = 'Cordialement,\n' + entreprise + (tel ? '\n' + tel : '');
  const texte = lignes.join('\n\n') + (lien ? '\n\nConsulter le document : ' + lien : '') + '\n\n' + signature + '\n\n— Envoyé avec Tafir (tafir.fr)';
  const html = '<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.55;color:#14241F;max-width:560px">' +
    lignes.map(function (l) { return '<p style="margin:0 0 14px">' + esc(l) + '</p>'; }).join('') +
    (lien ? '<p style="margin:18px 0"><a href="' + esc(lien) + '" style="background:#1B5E4B;color:#fff;text-decoration:none;padding:12px 18px;border-radius:8px;display:inline-block;font-weight:bold">Consulter le document</a></p>' : '') +
    '<p style="margin:0 0 14px;white-space:pre-line">' + esc(signature) + '</p>' +
    '<p style="margin:22px 0 0;font-size:12px;color:#7A8A83">Envoyé avec Tafir (tafir.fr). Si ce message ne vous est pas destiné, vous pouvez l\'ignorer.</p></div>';
  return { sujet: sujet, texte: texte, html: html };
}

async function utilisateur(jeton) {
  const r = await fetch(SUPABASE_URL + '/auth/v1/user', { headers: { apikey: SUPABASE_ANON, Authorization: 'Bearer ' + jeton } });
  if (!r.ok) return null;
  const u = await r.json();
  return u && u.id ? u : null;
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).json({ erreur: 'Méthode non autorisée.' }); }
  const cle = process.env.RESEND_API_KEY;
  if (!cle) return res.status(503).json({ erreur: 'L\'envoi d\'emails n\'est pas encore activé.' });

  const jeton = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!jeton) return res.status(401).json({ erreur: 'Connexion requise.' });
  let user;
  try { user = await utilisateur(jeton); } catch (e) { return res.status(502).json({ erreur: 'Vérification impossible, réessayez.' }); }
  if (!user) return res.status(401).json({ erreur: 'Session expirée, reconnectez-vous.' });

  let b = req.body;
  if (typeof b === 'string') { try { b = JSON.parse(b); } catch (e) { b = null; } }
  if (!b || typeof b !== 'object' || !TYPES[b.type]) return res.status(400).json({ erreur: 'Demande incorrecte.' });
  // Le test part toujours vers l'adresse du compte, jamais ailleurs.
  const destinataire = b.type === 'test' ? user.email : String(b.destinataire || '').trim();
  if (!emailOk(destinataire)) return res.status(400).json({ erreur: 'Adresse email du destinataire invalide.' });
  if (b.type !== 'test' && !lienOk(b.lien) && b.type === 'document') return res.status(400).json({ erreur: 'Lien du document invalide.' });

  const entreprise = ligne(b.entreprise, 60) || 'Tafir';
  const reponse = emailOk(String(b.reponse_a || '').trim()) ? String(b.reponse_a).trim() : user.email;

  const jour = new Date().toISOString().slice(0, 10);
  const hSb = { apikey: SUPABASE_ANON, Authorization: 'Bearer ' + jeton, 'Content-Type': 'application/json' };
  try {
    const c = await fetch(SUPABASE_URL + '/rest/v1/ia_usage?jour=eq.' + jour + '&type=eq.email&select=id&limit=' + (LIMITE_JOUR + 1), { headers: hSb });
    if (!c.ok) return res.status(503).json({ erreur: 'Service momentanément indisponible.' });
    const deja = await c.json();
    if (Array.isArray(deja) && deja.length >= LIMITE_JOUR) return res.status(429).json({ erreur: 'Limite du jour atteinte (' + LIMITE_JOUR + ' emails). Revenez demain.' });
    const ins = await fetch(SUPABASE_URL + '/rest/v1/ia_usage', { method: 'POST', headers: Object.assign({ Prefer: 'return=minimal' }, hSb), body: JSON.stringify({ user_id: user.id, type: 'email' }) });
    if (!ins.ok) return res.status(503).json({ erreur: 'Service momentanément indisponible.' });
  } catch (e) { return res.status(503).json({ erreur: 'Service momentanément indisponible.' }); }

  const m = construire(b, entreprise);
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + cle, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: entreprise.replace(/[^\p{L}\p{N} .&'-]/gu, '') + ' via Tafir <' + EXPEDITEUR + '>', to: [destinataire], reply_to: reponse, subject: m.sujet, text: m.texte, html: m.html })
    });
    if (!r.ok) {
      const d = await r.json().catch(function () { return {}; });
      const domaine = /domain|verify|not verified/i.test(String(d && (d.message || d.name)));
      return res.status(502).json({ erreur: domaine ? 'Le domaine d\'envoi n\'est pas encore validé chez Resend.' : 'L\'email n\'a pas pu être envoyé, réessayez.' });
    }
    return res.status(200).json({ ok: true });
  } catch (e) {
    return res.status(502).json({ erreur: 'L\'email n\'a pas pu être envoyé, réessayez.' });
  }
};

module.exports._construire = construire;
module.exports._lienOk = lienOk;
module.exports._emailOk = emailOk;
