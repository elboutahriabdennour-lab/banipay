// Tafir — api/reception-email.js
// Reçoit les emails envoyés à l'adresse de réception d'une entreprise (ex. abc123xyz9@in.tafir.fr)
// et range les pièces jointes (PDF, photos) dans « Documents reçus ». Rien n'est créé comme facture :
// l'utilisateur relit et valide lui-même.
// Format attendu : JSON « inbound » de Postmark (pièces jointes en base64).
// Variables à définir dans Vercel (jamais dans le code) : SUPABASE_SERVICE_KEY, RECEPTION_SECRET.

const crypto = require('crypto');
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://samojsvlfcrhdpspngsp.supabase.co';
const TYPES = { 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
const MAX_OCTETS = 4 * 1024 * 1024;   // par pièce jointe (Vercel accepte environ 4,5 Mo par requête)
const MAX_PIECES = 5;                  // par email
const MAX_PAR_JOUR = 30;               // par entreprise et par jour (anti-abus)
const DOMAINE = (process.env.RECEPTION_DOMAINE || 'in.tafir.fr').toLowerCase();

function memeSecret(a, b) {
  const x = Buffer.from(String(a || '')), y = Buffer.from(String(b || ''));
  return x.length === y.length && x.length > 0 && crypto.timingSafeEqual(x, y);
}
function texte(s, max) { return String(s == null ? '' : s).replace(/[<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, max); }
function nomSur(n, ext) {
  let base = String(n || 'document').replace(/\.[^.]*$/, '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 60);
  return (base || 'document') + '.' + ext;
}
function detecterType(octets, declare) {
  // On ne se fie pas au type annoncé : on regarde les premiers octets.
  if (octets.length > 4 && octets.slice(0, 4).toString('latin1') === '%PDF') return 'application/pdf';
  if (octets.length > 3 && octets[0] === 0xFF && octets[1] === 0xD8 && octets[2] === 0xFF) return 'image/jpeg';
  if (octets.length > 8 && octets.slice(1, 4).toString('latin1') === 'PNG') return 'image/png';
  if (octets.length > 12 && octets.slice(0, 4).toString('latin1') === 'RIFF' && octets.slice(8, 12).toString('latin1') === 'WEBP') return 'image/webp';
  return null;
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).json({ erreur: 'Méthode non autorisée.' }); }
  const secret = process.env.RECEPTION_SECRET, service = process.env.SUPABASE_SERVICE_KEY;
  if (!secret || !service) return res.status(503).json({ erreur: 'La réception par email n\'est pas encore activée.' });
  if (!memeSecret(req.query && req.query.cle, secret)) return res.status(401).json({ erreur: 'Accès refusé.' });

  let m = req.body;
  if (typeof m === 'string') { try { m = JSON.parse(m); } catch (e) { m = null; } }
  if (!m || typeof m !== 'object') return res.status(400).json({ erreur: 'Message illisible.' });

  const h = { apikey: service, Authorization: 'Bearer ' + service };
  // Destinataire : on cherche le code secret dans les adresses du domaine de réception.
  const adresses = [];
  (Array.isArray(m.ToFull) ? m.ToFull : []).forEach(function (a) { if (a && a.Email) adresses.push(String(a.Email)); });
  if (m.OriginalRecipient) adresses.push(String(m.OriginalRecipient));
  let code = null;
  adresses.forEach(function (a) {
    const p = a.toLowerCase().split('@');
    if (!code && p.length === 2 && p[1] === DOMAINE && /^[a-z0-9]{10,20}$/.test(p[0])) code = p[0];
  });
  // Réponse 200 même si l'adresse est inconnue : le fournisseur d'email ne doit pas réessayer sans fin.
  if (!code) return res.status(200).json({ ok: true, ignore: 'adresse inconnue' });

  try {
    const r = await fetch(SUPABASE_URL + '/rest/v1/reception_codes?code=eq.' + code + '&select=user_id&limit=1', { headers: h });
    const l = r.ok ? await r.json() : [];
    if (!l.length) return res.status(200).json({ ok: true, ignore: 'adresse inconnue' });
    const userId = l[0].user_id;

    const debut = new Date(); debut.setUTCHours(0, 0, 0, 0);
    const c = await fetch(SUPABASE_URL + '/rest/v1/documents_recus?user_id=eq.' + userId + '&source=eq.email&created_at=gte.' + encodeURIComponent(debut.toISOString()) + '&select=id&limit=' + (MAX_PAR_JOUR + 1), { headers: h });
    const deja = c.ok ? await c.json() : [];
    if (deja.length >= MAX_PAR_JOUR) return res.status(200).json({ ok: true, ignore: 'limite du jour' });

    const pieces = (Array.isArray(m.Attachments) ? m.Attachments : []).slice(0, MAX_PIECES);
    let ranges = 0;
    for (const p of pieces) {
      if (!p || typeof p.Content !== 'string') continue;
      const octets = Buffer.from(p.Content, 'base64');
      if (!octets.length || octets.length > MAX_OCTETS) continue;
      const mime = detecterType(octets, p.ContentType);
      if (!mime) continue;
      const nom = nomSur(p.Name, TYPES[mime]);
      const chemin = userId + '/' + crypto.randomUUID() + '-' + nom;
      const up = await fetch(SUPABASE_URL + '/storage/v1/object/reception/' + chemin, {
        method: 'POST', headers: Object.assign({ 'Content-Type': mime, 'x-upsert': 'false' }, h), body: octets
      });
      if (!up.ok) continue;
      const ins = await fetch(SUPABASE_URL + '/rest/v1/documents_recus', {
        method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json', Prefer: 'return=minimal' }, h),
        body: JSON.stringify({
          user_id: userId, source: 'email', expediteur: texte(m.FromFull && m.FromFull.Email || m.From, 160),
          sujet: texte(m.Subject, 200), nom_fichier: nom, type_mime: mime, taille: octets.length, chemin: chemin
        })
      });
      if (ins.ok) ranges++;
    }
    return res.status(200).json({ ok: true, ranges: ranges });
  } catch (e) {
    return res.status(500).json({ erreur: 'Traitement impossible.' });
  }
};

module.exports._detecterType = detecterType;
module.exports._nomSur = nomSur;
