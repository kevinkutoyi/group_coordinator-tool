/**
 * emailValidator.js
 *
 * Three layers of email validation:
 *
 *  1. FORMAT CHECK   — RFC-5321 regex, length limits, no consecutive dots
 *  2. DISPOSABLE     — blocklist of ~100 known throwaway providers
 *  3. DNS MX LOOKUP  — checks the domain actually has mail servers
 *
 * Plus a confirmation token system for Level 2 ownership proof.
 */

const dns    = require("dns").promises;
const crypto = require("crypto");

// ── 1. FORMAT VALIDATION ──────────────────────────────────────────────────
// Stricter than a simple @-check. Rejects:
//   - Missing local part or domain
//   - Consecutive dots (..)
//   - Leading/trailing dots on local or domain
//   - Domain with no TLD
const EMAIL_REGEX = /^[a-zA-Z0-9](?:[a-zA-Z0-9._%+\-]*[a-zA-Z0-9])?@[a-zA-Z0-9](?:[a-zA-Z0-9\-]*[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9\-]*[a-zA-Z0-9])?)*\.[a-zA-Z]{2,}$/;

function isValidFormat(email) {
  if (!email || typeof email !== "string") return false;
  const trimmed = email.trim().toLowerCase();
  if (trimmed.length > 254)  return false;   // RFC 5321 max
  if (trimmed.includes("..")) return false;  // no consecutive dots
  return EMAIL_REGEX.test(trimmed);
}

// ── 2. DISPOSABLE EMAIL BLOCKLIST ─────────────────────────────────────────
// Common throwaway / temporary email providers
const DISPOSABLE_DOMAINS = new Set([
  "mailinator.com", "guerrillamail.com", "guerrillamail.net", "guerrillamail.org",
  "guerrillamail.de", "guerrillamailblock.com", "grr.la", "spam4.me",
  "trashmail.com", "trashmail.me", "trashmail.net", "trashmail.org",
  "trashmail.io", "trashmail.at", "trashmail.xyz",
  "throwam.com", "throwam.net", "throwaway.email",
  "yopmail.com", "yopmail.fr", "yopmail.net",
  "tempmail.com", "tempmail.net", "tempmail.org", "temp-mail.org",
  "10minutemail.com", "10minutemail.net", "10minutemail.org",
  "10minutemail.de", "10minutemail.co.uk",
  "mailnull.com", "mailnull.org",
  "sharklasers.com", "guerrillamail.info", "grr.la",
  "fakeinbox.com", "fakeinbox.net",
  "dispostable.com", "dispostable.net",
  "mailnesia.com", "mailnesia.net",
  "maildrop.cc", "maildrop.net",
  "spamgourmet.com", "spamgourmet.org", "spamgourmet.net",
  "spamspot.com", "spamspot.net",
  "spamfree24.org", "spamfree24.de",
  "binkmail.com", "bobmail.info", "chammy.info",
  "chong-mail.net", "clixser.com",
  "courriel.fr.nf", "courrieltemporaire.com",
  "crapmail.org", "cubiclink.com",
  "dacoolest.com", "dandikmail.com",
  "dayrep.com", "dingbone.com",
  "discard.email", "discardmail.com", "discardmail.de",
  "disposableaddress.com", "disposableinbox.com",
  "dodgeit.com", "dodgit.com",
  "dontreg.com", "dontsendmespam.de",
  "drdrb.com", "dump-email.info",
  "dumpandfuck.com", "dumpmail.de",
  "dumpyemail.com", "e4ward.com",
  "emailias.com", "emailinfive.com",
  "emailmiser.com", "emailsensei.com",
  "emailtemporanea.com", "emailtemporanea.net",
  "emailtemporario.com.br", "emailto.de",
  "emailwarden.com", "emailx.at.hm",
  "emailxfer.com", "emz.net",
  "enterto.com", "ephemail.net",
  "etranquil.com", "etranquil.net",
  "etranquil.org", "explodemail.com",
  "fakemail.fr", "fast-email.com",
  "fast-mail.fr", "fastacura.com",
  "filzmail.com", "fleckens.hu",
  "freeblackbootytube.com", "fuckingduh.com",
  "fudgerub.com", "fyii.de",
  "galafsen.com", "garbagemail.org",
  "get2mail.fr", "getairmail.com",
  "getmails.eu", "getonemail.com",
  "getonemail.net", "ghosttexter.de",
  "gishpuppy.com", "gowikibooks.com",
  "hatespam.org", "herp.in",
  "hidemail.de", "hidzz.com",
  "hmamail.com", "hopemail.biz",
  "ieatspam.eu", "ieatspam.info",
  "imail.ru", "inboxalias.com",
  "inoutmail.de", "inoutmail.eu",
  "inoutmail.info", "inoutmail.net",
  "insorg-mail.info", "instmail.it",
  "internet-e-mail.de", "internet-mail.de",
  "internetemails.net", "internetmailing.net",
  "jetable.com", "jetable.fr.nf",
  "jetable.net", "jetable.org",
  "jnxjn.com", "joliemeil.com",
  "junk.to", "kasmail.com",
  "kaspop.com", "keepmymail.com",
  "killmail.com", "killmail.net",
  "kismail.ru", "klzlk.com",
  "koszmail.pl", "kulturbetrieb.info",
  "kurzepost.de", "letthemeatspam.com",
  "lol.ovpn.to", "lookugly.com",
  "lortemail.dk", "lukemail.com",
  "lukop.dk", "m21.cc",
  "mail-filter.com", "mail-temporaire.fr",
  "mail.by", "mail2rss.org",
  "mail333.com", "mailbidon.com",
  "mailbiz.biz", "mailblocks.com",
  "mailbucket.org", "mailcat.biz",
  "mailcatch.com", "mailde.de",
  "mailde.info", "maildu.de",
  "maileater.com", "mailexpire.com",
  "mailf5.com", "mailfall.com",
  "mailfreeonline.com", "mailguard.me",
  "mailimate.com", "mailin8r.com",
  "mailinater.com", "mailismagic.com",
  "mailme.lv", "mailme24.com",
  "mailmetrash.com", "mailmoat.com",
  "mailms.com", "mailnew.com",
  "mailnull.com", "mailorg.org",
  "mailpick.biz", "mailplush.com",
  "mailpooch.com", "mailproxsy.com",
  "mailquack.com", "mailrock.biz",
  "mailsiphon.com", "mailslapping.com",
  "mailslite.com", "mailsnull.com",
  "mailspam.me", "mailspam.xyz",
  "mailsponge.com", "mailspreed.com",
  "mailsquirt.org", "mailsto.com",
  "mailsuck.com", "mailsurf.com",
  "mailtome.de", "mailtothis.com",
  "mailtrash.net", "mailtv.net",
  "mailtv.tv", "mailzilla.com",
  "makemetheking.com", "mankyrecords.com",
  "mbx.cc", "mcrmail.com",
  "mega.zik.dj", "meinspamschutz.de",
  "meltmail.com", "messagebeamer.de",
  "mezimails.com", "mierdamail.com",
  "migmail.pl", "migumail.com",
  "mikesingh.me", "minimail.eu",
  "mintemail.com", "misterpinball.de",
  "mmail.igg.biz", "moakt.com",
  "mobi.web.id", "mobileninja.co.uk",
  "moncourrier.fr.nf", "monemail.fr.nf",
  "monmail.fr.nf", "monumentmail.com",
  "mox.pp.ua", "mt2009.com",
  "mt2014.com", "mt2015.com",
  "muimail.com", "mycard.net.ua",
  "mycleaninbox.net", "mypartyclip.de",
  "myphantomemail.com", "mysamp.de",
  "mytemp.email", "mytempemail.com",
  "mytempmail.com", "mytrashmail.com",
  "nabuma.com", "neomailbox.com",
  "nepwk.com", "nervmich.net",
  "nervtmich.net", "netmails.com",
  "netmails.net", "netzidiot.de",
  "nevermail.de", "newbpotato.tk",
  "nezdiro.org", "nguyenusedcars.com",
  "nik.io", "nmail.cf",
  "no-spam.ws", "nobulk.com",
  "noclickemail.com", "nomail.pw",
  "nomail.xl.cx", "nomail2me.com",
  "nomorespamemails.com", "nonspam.eu",
  "nonspammer.de", "noref.in",
  "nospam.ze.tc", "nospam4.us",
  "nospamfor.us", "nospammail.net",
  "nospamthanks.info", "nothingtoseehere.ca",
  "notmailinator.com", "notsharingmy.info",
  "nowmymail.com", "nurfuerspam.de",
  "nwldx.com", "o2.co.uk",
  "objectmail.com", "obobbo.com",
  "odnorazovoe.ru", "one-time.email",
  "oneoffemail.com", "oneoffmail.com",
  "onewaymail.com", "onlatedotcom.info",
  "online.ms", "oopi.org",
  "opayq.com", "opentrash.com",
  "ordinaryamerican.net", "otherinbox.coml",
  "ourklips.com", "ourpreviewdomain.com",
  "outlawspam.com", "owlpic.com",
  "paplease.com", "pepbot.com",
  "pfui.ru", "phentermine-mortgages.com",
  "photo-impact.eu", "photomark.net",
  "pimpedupmyride.com", "pookmail.com",
  "postfach2go.de", "powered.name",
  "propscore.com", "proxymail.eu",
  "prtnx.com", "punkass.com",
  "putthisinyourspamdatabase.com", "pwrby.com",
  "quickinbox.com", "quickmail.nl",
  "r4nd0m.de", "rcpt.at",
  "reallymymail.com", "receiveee.com",
  "recipeforfailure.com", "recode.me",
  "recursor.net", "regbypass.com",
  "regbypass.coml", "rejectmail.com",
  "reliable-mail.com", "rklips.com",
  "rmqkr.net", "rppkn.com",
  "rtrtr.com", "s0ny.net",
  "safe-mail.net", "safersignup.de",
  "safetymail.info", "safetypost.de",
  "sandelf.de", "saynotospams.com",
  "schafmail.de", "schrott-email.de",
  "secretemail.de", "secure-mail.biz",
  "selfdestructingmail.com", "sendspamhere.com",
  "senseless-entertainment.com", "services391.com",
  "sharklasers.com", "shitmail.me",
  "shitmail.org", "shitware.nl",
  "shmeriously.com", "shortmail.net",
  "sibmail.com", "sinnlos-mail.de",
  "slapsfromlastnight.com", "slaskpost.se",
  "slopsbox.com", "smapfree24.com",
  "smapfree24.de", "smapfree24.eu",
  "smapfree24.info", "smapfree24.net",
  "smapfree24.org", "smellfear.com",
  "smellrear.com", "smokemail.net",
  "sms.at", "snkmail.com",
  "sofimail.com", "sofort-mail.de",
  "softpls.asia", "sogetthis.com",
  "soisz.com", "solvemail.info",
  "soodonims.com", "spam.la",
  "spam.mn", "spam.su",
  "spam4.me", "spamavert.com",
  "spambob.com", "spambob.net",
  "spambob.org", "spambog.com",
  "spambog.de", "spambog.ru",
  "spamcom.de", "spamcorpse.com",
  "spamd.de", "spamdecoy.net",
  "spamex.com", "spamfree.eu",
  "spamgoes.in", "spamgourmet.com",
  "spamgourmet.net", "spamgourmet.org",
  "spamherelots.com", "spamhereplease.com",
  "spamhole.com", "spamify.com",
  "spamit.xyz", "spamkill.info",
  "spaml.com", "spaml.de",
  "spammotel.com", "spamobox.com",
  "spamoff.de", "spamspot.com",
  "spamthis.co.uk", "spamthisplease.com",
  "spamtrail.com", "spamtrap.ro",
  "speed.1s.fr", "spikio.com",
  "spoofmail.de", "spray.se",
  "spteam.ru", "squizzy.de",
  "ssoia.com", "startkeys.com",
  "stinkefinger.net", "stop-my-spam.com",
  "streetwisemail.com", "stuckmail.com",
  "stuffmail.de", "super-auswahl.de",
  "supergreatmail.com", "supermailer.jp",
  "superrito.com", "superstachel.de",
  "suremail.info", "svk.jp",
  "sweetxxx.de", "tafmail.com",
  "tagyourself.com", "teewars.org",
  "teleworm.com", "teleworm.us",
  "temp-email.com", "temp.emeraldwebmail.com",
  "temp.headstrong.de", "tempail.com",
  "tempalias.com", "tempe-mail.com",
  "tempemail.biz", "tempemail.co.za",
  "tempemail.com", "tempemail.net",
  "tempemail.us", "tempinbox.co.uk",
  "tempinbox.com", "tempmail.com",
  "tempmail.de", "tempmail.eu",
  "tempmail.it", "tempmail.net",
  "tempmail.us", "tempmail2.com",
  "tempr.email", "tempsky.com",
  "tempthe.net", "tempymail.com",
  "thanksnospam.info", "thc.st",
  "thelimestones.com", "thisisnotmyrealemail.com",
  "thismail.net", "thismail.ru",
  "throwam.com", "throwaway.email",
  "tilien.com", "tittbit.in",
  "tmailinator.com", "toiea.com",
  "toomail.biz", "totalvista.com",
  "tradermail.info", "trash-amil.com",
  "trash-mail.at", "trash-mail.com",
  "trash-mail.de", "trash-mail.ga",
  "trash-mail.io", "trash-mail.me",
  "trash2009.com", "trashdevil.com",
  "trashdevil.de", "trashemail.de",
  "trashinbox.com", "trashmail.at",
  "trashmail.com", "trashmail.io",
  "trashmail.me", "trashmail.net",
  "trashmail.org", "trashmail.xyz",
  "trashmailer.com", "trashme.org",
  "trashymail.com", "treatmentb.de",
  "trophymail.net", "tte.com",
  "turual.com", "twinmail.de",
  "tyldd.com", "uggsrock.com",
  "umail.net", "unmail.ru",
  "upliftnow.com", "uploadnow.org",
  "uroid.com", "us.af",
  "venompen.com", "veryday.ch",
  "vidchart.com", "viditag.com",
  "viewcastmedia.com", "viewcastmedia.net",
  "viewcastmedia.org", "viroleni.cu.cc",
  "vomoto.com", "vpn.st",
  "vsimcard.com", "vubby.com",
  "wasteland.rfc822.org", "watchfull.net",
  "wazabi.club", "webemail.me",
  "webm4il.info", "webuser.in",
  "wegwerfadresse.de", "wegwerfemail.com",
  "wegwerfemail.de", "wegwerfemail.net",
  "wegwerfemail.org", "wegwerfmail.de",
  "wegwerfmail.info", "wegwerfmail.net",
  "wegwerfmail.org", "welikecookies.com",
  "weltflug.com", "wh4f.org",
  "whyspam.me", "wilemail.com",
  "willhackforfood.biz", "willselfdestruct.com",
  "winemaven.info", "wmail.cf",
  "writeme.us", "wronghead.com",
  "wuzupmail.net", "www.e4ward.com",
  "www.mailinator.com", "wwwnew.eu",
  "xagloo.com", "xemaps.com",
  "xents.com", "xmaily.com",
  "xoxy.net", "xyzfree.net",
  "yapped.net", "yeah.net",
  "yepmail.net", "yert.ye.vc",
  "yomail.info", "yopmail.com",
  "yopmail.fr", "yopmail.gq",
  "yopmail.net", "yourdomain.com",
  "ypmail.webarnak.fr.eu.org", "yuurok.com",
  "z1p.biz", "za.com",
  "zebins.com", "zebins.eu",
  "zehnminuten.de", "zehnminutenmail.de",
  "zetmail.com", "zil.cr",
  "zippiex.com", "zippymail.info",
  "zlazyweb.com", "zoemail.com",
  "zoemail.net", "zoemail.org",
  "zomg.info", "zxcv.com",
  "zxcvbnm.com", "zzz.com",
]);

function isDisposable(email) {
  const domain = email.toLowerCase().split("@")[1];
  return DISPOSABLE_DOMAINS.has(domain);
}

// ── 3. DNS MX LOOKUP ──────────────────────────────────────────────────────
// Resolves whether the domain has mail exchange records.
// Returns true if MX records exist, false if none or DNS error.
async function hasMxRecord(email) {
  const domain = email.toLowerCase().split("@")[1];
  if (!domain) return false;
  try {
    const records = await dns.resolveMx(domain);
    return records && records.length > 0;
  } catch {
    // DNS lookup failed — domain likely doesn't exist
    return false;
  }
}

// ── MASTER VALIDATION FUNCTION ────────────────────────────────────────────
/**
 * validateEmail(email)
 * Returns: { valid: bool, reason: string|null }
 *
 * Runs all three checks in order:
 *   1. Format
 *   2. Disposable domain
 *   3. DNS MX record
 */
async function validateEmail(email) {
  const trimmed = (email || "").trim().toLowerCase();

  // Layer 1: format
  if (!isValidFormat(trimmed)) {
    return { valid: false, reason: "Please enter a valid email address." };
  }

  // Layer 2: disposable
  if (isDisposable(trimmed)) {
    return { valid: false, reason: "Disposable/temporary email addresses are not allowed. Please use a real email." };
  }

  // Layer 3: DNS MX
  const mxOk = await hasMxRecord(trimmed);
  if (!mxOk) {
    return { valid: false, reason: `The email domain "${trimmed.split("@")[1]}" does not appear to exist. Please check for typos.` };
  }

  return { valid: true, reason: null };
}

// ── EMAIL CONFIRMATION TOKEN SYSTEM ──────────────────────────────────────
// Generates a short-lived token for email ownership verification.
// Store these in db.emailVerifications[].

const TOKEN_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 hours

function generateConfirmToken() {
  return crypto.randomBytes(32).toString("hex");
}

function isTokenExpired(createdAt) {
  return Date.now() - new Date(createdAt).getTime() > TOKEN_EXPIRY_MS;
}

module.exports = {
  validateEmail,
  isValidFormat,
  isDisposable,
  hasMxRecord,
  generateConfirmToken,
  isTokenExpired,
  TOKEN_EXPIRY_MS,
};
