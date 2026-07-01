// One-off campaign: email every registered StrikeFeed user inviting them back.
//
// Pulls recipients from PocketBase (superuser auth) and sends via the Resend
// batch API. Reuses the Resend account you already configured for SMTP.
//
// USAGE
//   node scripts/email-users.mjs --preview   # render the email and open it in a browser
//   node scripts/email-users.mjs --dry-run   # list recipients, send nothing
//   node scripts/email-users.mjs --test      # send only to TEST_EMAIL (or the superuser)
//   node scripts/email-users.mjs --send      # send to EVERYONE (required; no flag = refuses)
//
// REQUIRED ENV (put in .env or export inline)
//   PB_SUPERUSER_EMAIL      PocketBase superuser email
//   PB_SUPERUSER_PASSWORD   PocketBase superuser password
//   RESEND_API_KEY          re_... (same key used as the SMTP password)
// OPTIONAL ENV
//   PB_URL        default https://strikefeed.tech
//   EMAIL_FROM    default "StrikeFeed <noreply@strikefeed.tech>" (must be on a Resend-verified domain)
//   TEST_EMAIL    where --test sends (default: PB_SUPERUSER_EMAIL)
//   ONLY_VERIFIED set to "1" to skip users whose email isn't verified

import 'dotenv/config';
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import PocketBase from 'pocketbase';

const PB_URL = process.env.PB_URL || 'https://strikefeed.tech';
const FROM = process.env.EMAIL_FROM || 'StrikeFeed <noreply@strikefeed.tech>';
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const PLAY_URL = 'https://play.google.com/store/apps/details?id=com.strikefeed.myapp';

const DRY_RUN = process.argv.includes('--dry-run');
const TEST = process.argv.includes('--test');
const PREVIEW = process.argv.includes('--preview');
const SEND = process.argv.includes('--send');

// Guard against typos (e.g. "-test" instead of "--test") silently sending to
// everyone. Any flag we don't recognize aborts before anything is sent.
const KNOWN_FLAGS = new Set(['--dry-run', '--test', '--preview', '--send']);
const unknownFlags = process.argv.slice(2).filter((a) => a.startsWith('-') && !KNOWN_FLAGS.has(a));
if (unknownFlags.length > 0) {
  console.error(`Unknown flag(s): ${unknownFlags.join(', ')}`);
  console.error('Valid flags: --preview | --dry-run | --test | --send');
  console.error('(Did you mean a double dash? e.g. --test, not -test)');
  process.exit(1);
}

// ---- Email copy (edit freely) ---------------------------------------------
const SUBJECT = "What's new in StrikeFeed 🎣 / Что нового в StrikeFeed";

function html() {
  return `<!doctype html>
<html><body style="margin:0;background:#0f172a;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
  <div style="max-width:480px;margin:0 auto;padding:32px 24px;color:#e2e8f0;">
    <h1 style="font-size:22px;font-weight:800;margin:0 0 16px;color:#e6eef8;">We've shipped new updates 🎣</h1>
    <p style="font-size:15px;line-height:22px;color:#cbd5e1;margin:0 0 12px;">
      Hey! StrikeFeed got a fresh round of improvements: faster, smoother, and a few new things to try.
      Log back in to check them out and log your next catch.
    </p>
    <hr style="border:none;border-top:1px solid #1e293b;margin:28px 0;" />
    <h2 style="font-size:18px;font-weight:800;margin:0 0 12px;color:#e6eef8;">Мы выпустили обновления 🎣</h2>
    <p style="font-size:15px;line-height:22px;color:#cbd5e1;margin:0 0 12px;">
      Привет! В StrikeFeed появились улучшения: быстрее, удобнее и пара новых функций.
      Зайдите снова, чтобы посмотреть и отметить свой следующий улов.
    </p>
    <div style="background:#0c2a3f;border:1px solid #1a4a6b;border-radius:12px;padding:16px 18px;margin:24px 0;">
      <p style="font-size:15px;line-height:22px;color:#e2e8f0;font-weight:700;margin:0 0 6px;">
        The first 10 anglers to add a catch get verified status on their profile.
      </p>
      <p style="font-size:15px;line-height:22px;color:#e2e8f0;font-weight:700;margin:0;">
        Первые 10 рыболовов, кто добавит улов, получат статус верификации в профиле.
      </p>
    </div>
    <div style="text-align:center;margin:28px 0;">
      <a href="${PLAY_URL}" style="display:inline-block;background:#0284c7;color:#ffffff;text-decoration:none;font-size:16px;font-weight:700;padding:14px 32px;border-radius:12px;">Open StrikeFeed / Открыть</a>
    </div>
    <p style="font-size:12px;line-height:18px;color:#64748b;margin:32px 0 0;text-align:center;">
      You're receiving this because you have a StrikeFeed account.<br/>
      To stop these emails, reply with "unsubscribe".
    </p>
  </div>
</body></html>`;
}

function text() {
  return [
    "We've shipped new updates to StrikeFeed!",
    'Log back in to check them out and log your next catch.',
    'The first 10 anglers to add a catch get verified status on their profile:',
    PLAY_URL,
    '',
    'Мы выпустили обновления StrikeFeed!',
    'Зайдите снова, чтобы посмотреть и отметить свой следующий улов.',
    'Первые 10 рыболовов, кто добавит улов, получат статус верификации в профиле:',
    PLAY_URL,
    '',
    'You have a StrikeFeed account. To stop these emails, reply "unsubscribe".',
  ].join('\n');
}
// ---------------------------------------------------------------------------

async function authSuperuser(pb) {
  const email = process.env.PB_SUPERUSER_EMAIL;
  const password = process.env.PB_SUPERUSER_PASSWORD;
  if (!email || !password) throw new Error('Set PB_SUPERUSER_EMAIL and PB_SUPERUSER_PASSWORD');
  try {
    await pb.collection('_superusers').authWithPassword(email, password); // PB >= 0.23
  } catch {
    await pb.admins.authWithPassword(email, password); // older PB
  }
}

async function getRecipients(pb) {
  const onlyVerified = process.env.ONLY_VERIFIED === '1';
  const users = await pb.collection('users').getFullList({ batch: 500, fields: 'email,verified' });
  const seen = new Set();
  const out = [];
  for (const u of users) {
    const email = (u.email || '').trim().toLowerCase();
    if (!email || !email.includes('@')) continue;
    if (onlyVerified && !u.verified) continue;
    if (seen.has(email)) continue;
    seen.add(email);
    out.push(email);
  }
  return out;
}

function chunk(arr, n) {
  const r = [];
  for (let i = 0; i < arr.length; i += n) r.push(arr.slice(i, i + n));
  return r;
}

async function sendBatch(emails) {
  const payload = emails.map((to) => ({
    from: FROM,
    to: [to],
    subject: SUBJECT,
    html: html(),
    text: text(),
    headers: { 'List-Unsubscribe': '<mailto:unsubscribe@strikefeed.tech>' },
  }));
  const res = await fetch('https://api.resend.com/emails/batch', {
    method: 'POST',
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const body = await res.text();
  if (!res.ok) throw new Error(`Resend ${res.status}: ${body}`);
  return body;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  if (PREVIEW) {
    const file = join(tmpdir(), 'strikefeed-email-preview.html');
    writeFileSync(file, html());
    console.log(`Subject: ${SUBJECT}`);
    console.log(`Wrote ${file}`);
    try {
      execSync(`open "${file}"`); // macOS: opens in default browser
    } catch {
      console.log('Open the file above in your browser to view it.');
    }
    return;
  }

  const pb = new PocketBase(PB_URL);
  pb.autoCancellation(false);
  await authSuperuser(pb);

  let recipients = await getRecipients(pb);
  console.log(`Found ${recipients.length} recipient(s) on ${PB_URL}`);

  if (TEST) {
    const testTo = (process.env.TEST_EMAIL || process.env.PB_SUPERUSER_EMAIL).toLowerCase();
    recipients = [testTo];
    console.log(`--test: sending only to ${testTo}`);
  }

  if (DRY_RUN) {
    recipients.forEach((e) => console.log('  ' + e));
    console.log('--dry-run: nothing sent.');
    return;
  }

  // A real send to every user must be explicitly requested with --send.
  // Without it (and without --test), refuse, so a typo can't blast everyone.
  if (!TEST && !SEND) {
    console.error(`Refusing to email all ${recipients.length} users without --send.`);
    console.error('Run one of:');
    console.error('  node scripts/email-users.mjs --preview     # view in browser');
    console.error('  node scripts/email-users.mjs --dry-run     # list recipients');
    console.error('  node scripts/email-users.mjs --test        # send only to you');
    console.error('  node scripts/email-users.mjs --send        # send to EVERYONE');
    process.exit(1);
  }

  if (!RESEND_API_KEY) throw new Error('Set RESEND_API_KEY');

  const batches = chunk(recipients, 100); // Resend batch limit = 100
  let sent = 0;
  for (let i = 0; i < batches.length; i++) {
    await sendBatch(batches[i]);
    sent += batches[i].length;
    console.log(`Sent batch ${i + 1}/${batches.length} (${sent}/${recipients.length})`);
    if (i < batches.length - 1) await sleep(700); // stay under Resend rate limit
  }
  console.log(`Done. ${sent} email(s) sent.`);
}

main().catch((e) => {
  console.error('FAILED:', e.message);
  process.exit(1);
});
