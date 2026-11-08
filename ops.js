// Daily Digest demo: the automation-ops engine.
// Pure state + functions (window.Ops). No DOM here, so it can be tested in Node:
//   global.window = global; require('shared/data.js'); const Ops = require('./ops.js');
//
// Model: every automation writes one log entry per run (and per retry). Everything
// else, status, heartbeat checks, the alert list and the morning digest, is derived
// from that log. That is the whole safety idea: if it isn't in the log, it didn't happen.

(function (root) {
  'use strict';
  const MIN = 60000, HOUR = 3600000, DAY = 86400000;
  const S = root.SUMMIT;
  const NOTICE = { heartbeat: 1, alert: 1, admin: 1 };   // log entries that are not runs
  const T0 = +new Date(S.today);                       // today 00:00 local
  const at = (day, h = 0, m = 0) => { const t = new Date(T0); t.setDate(t.getDate() + day); t.setHours(h, m, 0, 0); return +t; };
  const NOW0 = at(0, 9, 42);                            // the demo clock starts here
  const DIGEST_AT = at(0, 6, 30);                       // when the morning email goes out

  // ---------- The automations Summit runs ----------
  // every/from/to are minutes (from/to are minutes after midnight, inclusive).
  const AUTOMATIONS = [
    { id: 'intake', name: 'Email intake → tickets', module: 'M1', platform: 'n8n',
      does: 'Reads the work-order inbox and turns each request into a ticket.',
      every: 10, from: 360, to: 1200, scheduleText: 'Every 10 min, 6 AM–8 PM', noun: ['email', 'emails'], dur: [3, 11] },
    { id: 'firstcall', name: 'First-call reminder texts', platform: 'Zapier',
      does: 'Texts the tech when a warranty job is close to its first-call deadline.',
      every: 30, from: 420, to: 1140, scheduleText: 'Every 30 min, 7 AM–7 PM', noun: ['reminder', 'reminders'], dur: [2, 6] },
    { id: 'vendorsync', name: 'Vendor portal status sync', platform: 'n8n',
      does: 'Pushes job status changes to the Northstar, Bluepeak and Harbor portals.',
      every: 30, from: 0, to: 1410, scheduleText: 'Every 30 min, around the clock', noun: ['status update', 'status updates'], dur: [6, 19] },
    { id: 'completion', name: 'Completion report sender', platform: 'Apps Script',
      does: 'Emails the warranty company a completion report with photos when a job closes.',
      every: 15, from: 420, to: 1200, scheduleText: 'Every 15 min, 7 AM–8 PM', noun: ['report', 'reports'], dur: [4, 14] },
    { id: 'payments', name: 'Payment proofing', platform: 'Apps Script',
      does: 'Reads bank deposit emails and marks the matching jobs paid.',
      every: 60, from: 360, to: 1320, scheduleText: 'Every hour, 6 AM–10 PM', noun: ['deposit', 'deposits'], dur: [5, 16] },
    { id: 'parts', name: 'Parts order tracker', platform: 'Zapier',
      does: 'Reads supplier order confirmations and adds ETAs to “waiting on parts” jobs.',
      every: 120, from: 420, to: 1140, scheduleText: 'Every 2 hours, 7 AM–7 PM', noun: ['order', 'orders'], dur: [3, 9] },
    { id: 'backup', name: 'Nightly backup of the jobs sheet', platform: 'Apps Script',
      does: 'Copies the Jobs sheet to a dated file in Drive and keeps 30 days.',
      every: 1440, from: 120, to: 120, scheduleText: 'Daily at 2:00 AM', noun: ['row', 'rows'], dur: [21, 34], grace: 30 },
    { id: 'reviews', name: 'Review request after job complete', platform: 'n8n', mode: 'shadow', since: -5,
      does: 'Texts the customer a review link the day after a job is completed.',
      every: 30, from: 480, to: 1200, scheduleText: 'Every 30 min, 8 AM–8 PM', noun: ['review text', 'review texts'], dur: [2, 5] },
  ];
  const byId = id => AUTOMATIONS.find(a => a.id === id);

  // What can go wrong, in plain English, with the fix a person would make.
  const FAILURES = {
    intake: { error: 'Gmail API returned 429 (too many requests)', plain: 'Google asked us to slow down reading the inbox.', held: 3,
      fix: 'Usually clears by itself within the hour. If it repeats, slow polling to every 15 minutes in the n8n trigger.' },
    firstcall: { error: 'SMS provider timed out after 30 seconds', plain: 'The text-message service did not answer.', held: 2,
      fix: 'Check the SMS provider status page. Queued reminders go out on the next good run.' },
    vendorsync: { error: 'Vendor portal returned 503 Service Unavailable', plain: 'The Northstar warranty portal was down.', held: 6,
      fix: 'Check the Northstar portal status page. If the portal is up, re-connect the portal login in n8n (Credentials → Northstar portal). Held updates are sent automatically on the next good run.' },
    completion: { error: 'Report template not found in Google Drive', plain: 'Someone moved or renamed the report template file.', held: 2,
      fix: 'Move “Completion report template” back to Shared drive › Ops, or update TEMPLATE_ID in Script properties.' },
    payments: { error: 'Bank email format changed: amount not found', plain: 'The bank changed the layout of its deposit emails.', held: 3,
      fix: 'Forward one deposit email to Ted so he can update the pattern. Deposits stay unmatched until then, not lost.' },
    parts: { error: 'Google Sheets quota exceeded', plain: 'Google limited how often we can write to the sheet.', held: 2,
      fix: 'Normally clears within 2 minutes. If it keeps happening, batch the writes (one update per run instead of one per row).' },
    backup: { error: 'Drive storage full: backup file could not be written', plain: 'Google Drive ran out of space.', held: 1,
      fix: 'Free some space in Google Drive or delete backups older than 30 days, then run the backup once by hand.' },
  };
  const RETRY_DELAYS = [1, 5, 15];   // minutes between attempts (backoff)

  // ---------- Helpers ----------
  function rng(seed) {
    return function () {
      seed |= 0; seed = seed + 0x6D2B79F5 | 0;
      let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  const pick = (r, arr) => arr[Math.floor(r() * arr.length)];
  const plural = (n, noun) => `${n.toLocaleString('en-US')} ${n === 1 ? noun[0] : noun[1]}`;
  const dayStart = t => { const d = new Date(t); d.setHours(0, 0, 0, 0); return +d; };
  const nextDay = t => { const d = new Date(t); d.setDate(d.getDate() + 1); return +d; };

  function fmtTime(t) {
    return new Date(t).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  }
  function fmtWhen(t, ref) {
    const dd = Math.round((dayStart(t) - dayStart(ref)) / DAY);
    if (dd === 0) return fmtTime(t);
    if (dd === -1) return 'Yesterday ' + fmtTime(t);
    if (dd === 1) return 'Tomorrow ' + fmtTime(t);
    return new Date(t).toLocaleDateString('en-US', { weekday: 'short' }) + ' ' + fmtTime(t);
  }
  function fmtSpan(ms) {
    const h = Math.round(ms / HOUR);
    if (h < 1) return Math.max(1, Math.round(ms / MIN)) + ' min';
    if (h < 24) return h + ' h';
    const d = Math.floor(h / 24), rem = h % 24;
    return d + ' day' + (d > 1 ? 's' : '') + (rem ? ' ' + rem + ' h' : '');
  }
  function fmtDur(ms) { return ms < 60000 ? (ms / 1000).toFixed(1) + ' s' : Math.round(ms / 60000) + ' min'; }

  // Scheduled slots for an automation in (a, b]
  function slots(def, a, b) {
    const out = [];
    for (let day = dayStart(a); day <= b; day = nextDay(day)) {
      for (let m = def.from; m <= def.to; m += def.every) {
        const t = new Date(day); t.setHours(0, m, 0, 0);
        if (+t > a && +t <= b) out.push(+t);
      }
    }
    return out;
  }

  // ---------- Normal-run notes ----------
  function normalRun(def, t, r) {
    const n = (() => {
      switch (def.id) {
        case 'intake': return pick(r, [0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 2]);
        case 'firstcall': return pick(r, [0, 0, 0, 1, 2]);
        case 'vendorsync': return new Date(t).getHours() < 6 ? pick(r, [0, 0, 1]) : pick(r, [1, 2, 3, 4, 5, 6]);
        case 'completion': return pick(r, [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1]);
        case 'payments': return pick(r, [0, 0, 0, 0, 1, 1, 2]);
        case 'parts': return pick(r, [0, 1, 1, 2]);
        case 'backup': return 1238 + Math.round((t - at(-14)) / DAY);
        case 'reviews': return pick(r, [0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1]);
        default: return 0;
      }
    })();
    const notes = {
      intake: n ? `Read ${plural(n, ['new email', 'new emails'])}, created ${plural(n, ['ticket', 'tickets'])}` : 'Inbox checked, nothing new',
      firstcall: n ? `Texted ${n} tech${n > 1 ? 's' : ''} about deadlines inside 4 hours` : 'No deadlines inside 4 hours',
      vendorsync: n ? `Sent ${plural(n, def.noun)} to vendor portals` : 'No status changes to send',
      completion: n ? `Emailed ${plural(n, def.noun)} with photos` : 'No newly closed jobs',
      payments: n ? `Matched ${plural(n, def.noun)}, marked jobs paid` : 'No new bank emails',
      parts: n ? `Updated ${plural(n, def.noun)} with ETAs` : 'No new supplier emails',
      backup: `Backed up ${plural(n, def.noun)} to Drive, 30 copies kept`,
      reviews: n ? `Would have texted ${plural(n, ['customer', 'customers'])} a review link. Logged only, nothing sent` : 'No completed jobs due a review text',
    };
    return {
      result: def.mode === 'shadow' ? 'shadow' : 'ok',
      items: n, durMs: Math.round((def.dur[0] + r() * (def.dur[1] - def.dur[0])) * 1000), note: notes[def.id],
    };
  }

  // ---------- Initial state ----------
  function createState() {
    const st = { now: NOW0, log: [], alerts: [], paused: {}, broken: {}, retrying: {}, lock: null, seq: 0, held: {} };
    const r = rng(20261108);

    // Things that happened overnight and yesterday, by "automation@time".
    const special = {
      [`backup@${at(0, 2)}`]: () => [
        { result: 'failed', attempt: 1, items: 0, held: 1, durMs: 4100, error: 'Google Sheets quota exceeded', note: 'Google limited reads on the sheet. Retrying in 1 min.' },
        { ts: at(0, 2, 1), kind: 'retry', result: 'recovered', attempt: 2, items: 1252, durMs: 27400, note: 'Recovered on retry 1. Backed up 1,252 rows to Drive' },
      ],
      [`vendorsync@${at(0, 3, 30)}`]: () => [
        { result: 'failed', attempt: 1, items: 0, held: 4, durMs: 30000, error: 'Vendor portal returned 503 Service Unavailable', note: 'Northstar portal was down. 4 status updates held. Retrying in 1 min.' },
        { ts: at(0, 3, 31), kind: 'retry', result: 'failed', attempt: 2, items: 0, held: 4, durMs: 30000, error: 'Vendor portal returned 503 Service Unavailable', note: 'Still down. Retrying in 5 min.' },
        { ts: at(0, 3, 36), kind: 'retry', result: 'recovered', attempt: 3, items: 4, durMs: 11800, note: 'Recovered on retry 2. Sent 4 held status updates' },
      ],
      [`intake@${at(-1, 16, 10)}`]: () => [
        { result: 'held', items: 3, held: 1, durMs: 9200, person: 'Harbor Appliance Care email for Owen Pritchard (dishwasher) has no claim number. Ticket started, waiting for the claim number.',
          note: 'Created 2 tickets. 1 email held for a person: Harbor request has no claim number' },
      ],
      [`parts@${at(-1, 15)}`]: () => [
        { result: 'held', items: 2, held: 1, durMs: 6100, error: 'Email had no attachment', person: 'Ridgeline Supply order confirmation had no attachment, so the tracking number could not be read.',
          note: 'Updated 1 order. 1 held for a person: confirmation email had no attachment' },
      ],
    };
    const reminderNote = 'Texted 3 reminders: SH-1050 (no tech yet, sent to office), SH-1051 (Marcus R.), SH-1052 (Jake M.)';
    [at(-1, 9), at(-1, 14), at(0, 7)].forEach(t => {
      special[`firstcall@${t}`] = () => [{ result: 'ok', items: 3, durMs: 3900, note: reminderNote }];
    });

    const from = at(-1, 0) - 1;
    AUTOMATIONS.forEach(def => {
      slots(def, from, NOW0).forEach(t => {
        if (def.id === 'payments' && t > at(0, 6)) return;           // it silently stopped after 6:00 AM
        const sp = special[`${def.id}@${t}`];
        if (sp) sp().forEach(e => push(st, def.id, Object.assign({ ts: t, kind: 'run' }, e)));
        else push(st, def.id, Object.assign({ ts: t, kind: 'run' }, normalRun(def, t, r)));
      });
    });
    // The watchdog caught the silent stop
    push(st, 'payments', { ts: at(0, 7, 5), kind: 'heartbeat', result: 'missed', items: 0, durMs: 0,
      note: 'Watchdog: no run since 6:00 AM, expected every hour. Texted Ted, emailed the office.' });
    st.broken.payments = 'stopped';
    st.alerts.push({
      id: 'AL-' + (++st.seq), auto: 'payments', kind: 'heartbeat', raisedAt: at(0, 7, 5),
      title: 'Payment proofing stopped running',
      summary: 'No run since 6:00 AM. It is expected every hour.',
      context: [['Last good run', '6:00 AM, matched 2 deposits'], ['First missed run', '7:00 AM'], ['Platform', 'Google Apps Script, hourly trigger'], ['Waiting', 'Bank emails stay in the inbox until it runs, so nothing is lost']],
      fix: 'Apps Script turns a trigger off after a Google password change (“Authorization is required”). Open Extensions → Apps Script → Triggers, re-authorize, then run once. The catch-up run picks up every bank email since 6:00 AM.',
      held: 0, notified: notifications('payments', at(0, 7, 5), 'Payment proofing has not run since 6:00 AM (expected hourly). Bank emails are waiting in the inbox, nothing lost. Likely fix: re-authorize the Apps Script trigger.', 'Payment proofing stopped running'),
    });
    sortLog(st);
    st.history = buildHistory();
    return st;
  }

  function notifications(auto, t, body, subject) {
    return [
      { channel: 'sms', to: 'Ted (on call)', at: t, body: `Summit Ops: ${body} Reply ACK to take it.` },
      { channel: 'email', to: 'office@summit-home.example', at: t, subject: `[Action needed] ${subject}`, body },
    ];
  }

  function push(st, auto, e) {
    const entry = Object.assign({ id: 'R' + (++st.seq), auto, kind: 'run', items: 0, durMs: 0, attempt: 1 }, e);
    st.log.push(entry);
    return entry;
  }
  function sortLog(st) { st.log.sort((a, b) => a.ts - b.ts || (a.id < b.id ? -1 : 1)); }

  // 14-day history for the sparklines: days -13..-2 synthetic, -1 and 0 from the log.
  function buildHistory() {
    const r = rng(77);
    const issues = { 'firstcall:-9': 'retry', 'parts:-6': 'failed', 'intake:-11': 'retry', 'payments:-4': 'retry', 'vendorsync:-12': 'retry' };
    const h = {};
    AUTOMATIONS.forEach(def => {
      h[def.id] = [];
      for (let d = -13; d <= -2; d++) {
        if (def.since != null && d < def.since) { h[def.id].push(null); continue; }
        const runs = slots(def, at(d) - 1, at(d, 23, 59)).length;
        const base = { intake: 20, firstcall: 5, vendorsync: 70, completion: 4, payments: 9, parts: 4, backup: 1240, reviews: 3 }[def.id];
        const wk = new Date(at(d)).getDay() % 6 === 0 ? 0.55 : 1;           // weekends are quieter
        const items = def.id === 'backup' ? base + d + 13 : Math.max(0, Math.round(base * wk * (0.7 + r() * 0.6)));
        h[def.id].push({ day: d, runs, items, issue: issues[`${def.id}:${d}`] || null });
      }
    });
    return h;
  }

  function sparkline(st, id, t) {
    const out = st.history[id].slice();
    [-1, 0].forEach(d => {
      const a = at(d), b = Math.min(at(d + 1), t);
      const es = st.log.filter(e => e.auto === id && e.ts >= a && e.ts < b && !NOTICE[e.kind]);
      const exhausted = es.some(e => e.exhausted);
      const issue = exhausted ? 'failed' : es.some(e => e.result === 'failed' || e.result === 'held') ? 'retry' : null;
      out.push({ day: d, runs: es.filter(e => e.kind === 'run').length, items: es.reduce((s, e) => s + (e.result === 'failed' ? 0 : e.items), 0), issue, partial: d === 0 });
    });
    return out;
  }

  // ---------- Derived state ----------
  const runsOf = (st, id, t) => st.log.filter(e => e.auto === id && e.ts <= t && !NOTICE[e.kind]);

  function heartbeat(st, def, t) {
    if (st.paused[def.id]) return { checked: false, late: false };
    const grace = (def.grace || 5) * MIN;
    const runs = runsOf(st, def.id, t);
    const last = runs[runs.length - 1];
    const lastRun = last ? last.ts : 0;
    const expected = slots(def, t - 3 * DAY, t - grace);
    const due = expected[expected.length - 1];
    const missed = expected.filter(s => s > lastRun + 30000);
    const late = due != null && lastRun + 30000 < due;
    const nextSlot = slots(def, t, t + 2 * DAY)[0];
    return { checked: true, late, lastRun, missed, next: nextSlot,
      text: late ? `No run since ${fmtWhen(lastRun, t)}, expected ${def.scheduleText.toLowerCase().split(',')[0]}` : 'On time' };
  }

  function statusOf(st, def, t) {
    t = t == null ? st.now : t;
    if (st.paused[def.id]) return { key: 'paused', label: 'Paused', tone: 'muted' };
    const runs = runsOf(st, def.id, t);
    const last = runs[runs.length - 1];
    if (def.mode === 'shadow') return { key: 'shadow', label: 'Shadow mode', tone: 'info', last };
    if (last && last.result === 'failed' && last.exhausted) return { key: 'failed', label: 'Failed', tone: 'bad', last };
    if (last && last.result === 'failed') return { key: 'warning', label: 'Retrying', tone: 'warn', last };
    const hb = heartbeat(st, def, t);
    if (hb.late) return { key: 'warning', label: 'Late', tone: 'warn', last, hb };
    return { key: 'healthy', label: 'Healthy', tone: 'good', last };
  }

  function dayStats(st, id, a, b) {
    const es = st.log.filter(e => e.auto === id && e.ts >= a && e.ts <= b && !NOTICE[e.kind]);
    return {
      runs: es.filter(e => e.kind === 'run').length,
      attempts: es.length,
      items: es.reduce((s, e) => s + (e.result === 'failed' ? 0 : e.items), 0),
      failures: es.filter(e => e.result === 'failed'),
      recovered: es.filter(e => e.result === 'recovered'),
      heldForPerson: es.filter(e => e.person),
      shadow: es.filter(e => e.result === 'shadow').reduce((s, e) => s + e.items, 0),
    };
  }

  function openAlerts(st, t) {
    t = t == null ? st.now : t;
    return st.alerts.filter(a => a.raisedAt <= t && !(a.resolvedAt && a.resolvedAt <= t));
  }
  function heldTotal(st) { return Object.values(st.held).reduce((s, n) => s + n, 0); }

  // ---------- Mutations used by the live scenario ----------
  // Move the clock forward, running every healthy automation's scheduled slots on the way.
  function advanceTo(st, t, seedExtra = 0) {
    const r = rng(Math.floor(t / MIN) + seedExtra);
    AUTOMATIONS.forEach(def => {
      if (st.paused[def.id] || st.lock === def.id) return;
      slots(def, st.now, t).forEach(s => {
        if (st.broken[def.id] === 'stopped') return;                  // silently stopped: no runs at all
        if (st.broken[def.id] === 'failing') {                         // still failing: log it, but don't re-text anyone
          const f = FAILURES[def.id];
          st.held[def.id] = (st.held[def.id] || 0) + 1;
          push(st, def.id, { ts: s, result: 'failed', exhausted: true, items: 0, held: st.held[def.id], durMs: 30000, error: f.error,
            note: `Still failing. ${plural(st.held[def.id], def.noun)} held. Alert already open, no new text sent.` });
          return;
        }
        push(st, def.id, Object.assign({ ts: s, kind: 'run' }, normalRun(def, s, r)));
      });
    });
    st.now = t;
    sortLog(st);
  }

  function resolveAlert(st, alertId, t) {
    const a = st.alerts.find(x => x.id === alertId);
    if (!a || a.resolvedAt) return null;
    const def = byId(a.auto);
    const held = st.held[a.auto] || 0;
    let note;
    if (a.kind === 'heartbeat') {
      const missed = heartbeat(st, def, t).missed.length;
      const n = 5;
      note = `Catch-up run after fix: read ${plural(n, ['bank email', 'bank emails'])} since the last run (${missed} missed hour${missed === 1 ? '' : 's'}), marked 4 jobs paid. Nothing lost.`;
      push(st, a.auto, { ts: t, kind: 'reprocess', result: 'recovered', items: n, durMs: 18400, note });
    } else {
      note = `Fixed. Re-processed ${plural(held, def.noun)} that were held. Nothing lost.`;
      push(st, a.auto, { ts: t, kind: 'reprocess', result: 'recovered', items: held, durMs: 14200, note });
    }
    delete st.broken[a.auto];
    st.held[a.auto] = 0;
    a.resolvedAt = t;
    a.resolution = note;
    sortLog(st);
    return a;
  }

  // ---------- The daily digest ----------
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function overdueJobs(asOf) {
    return S.jobs
      .filter(j => +new Date(j.createdAt) <= asOf && !['completed', 'invoiced'].includes(j.status))
      .filter(j => !j.firstCallAt || +new Date(j.firstCallAt) > asOf)
      .map(j => {
        const v = S.byId(S.vendors, j.vendorId);
        const due = +new Date(j.createdAt) + v.firstCallHours * HOUR;
        return { job: j, vendor: v, due, late: asOf - due, customer: S.byId(S.customers, j.customerId), tech: j.techId ? S.byId(S.techs, j.techId) : null };
      })
      .sort((a, b) => a.due - b.due);
  }

  function digestData(st, asOf) {
    const overdue = overdueJobs(asOf);
    const firstCallWindow = overdue.filter(o => o.due < asOf);
    const dueSoon = overdue.filter(o => o.due >= asOf && o.due - asOf < 12 * HOUR);
    const health = AUTOMATIONS.map(def => {
      const status = statusOf(st, def, asOf);
      const s = dayStats(st, def.id, asOf - DAY, asOf);
      const hb = heartbeat(st, def, asOf);
      const alert = st.alerts.find(a => a.auto === def.id && a.raisedAt <= asOf && !(a.resolvedAt && a.resolvedAt <= asOf));
      let line;
      if (status.key === 'paused') line = 'Paused. Not running and not checked until it is turned back on.';
      else if (status.key === 'shadow') line = `Shadow mode: ${plural(s.runs, ['run', 'runs'])}, would have sent ${plural(s.shadow, def.noun)}. Logged only, nothing sent.`;
      else if (status.key === 'failed') line = `Failed at ${fmtWhen(status.last.ts, asOf)}: ${status.last.error}. Retries ran out. ${plural(st.held[def.id] || status.last.held || 0, def.noun)} held${alert ? ', Ted alerted' : ''}.`;
      else if (status.key === 'warning' && hb.late) line = `${hb.text}.${alert ? ` Ted alerted at ${fmtTime(alert.raisedAt)}.` : ''}`;
      else if (status.key === 'warning') line = `Retrying after: ${status.last.error}.`;
      else {
        line = `${plural(s.runs, ['run', 'runs'])}, ${plural(s.items, def.noun)}.`;
        const rec = s.recovered.map(e => `failed at ${fmtWhen(s.failures.find(f => f.ts < e.ts && f.attempt === 1 && f.ts >= e.ts - HOUR)?.ts || e.ts, asOf)}, recovered on retry ${e.attempt - 1}`);
        if (rec.length) line += ' ' + rec.join('; ').replace(/^./, c => c.toUpperCase()) + '.';
        else line += ' No failures.';
      }
      return { def, status, line, stats: s, recovered: s.recovered.length };
    });
    const needsAttention = health.filter(h => h.status.key === 'failed' || h.status.key === 'warning');
    const recoveredCount = health.reduce((n, h) => n + h.recovered, 0);

    // Items waiting on a person
    const waiting = [];
    st.log.filter(e => e.person && e.ts <= asOf && e.ts > asOf - 2 * DAY).forEach(e => {
      waiting.push({ kind: e.auto === 'intake' ? 'Intake' : 'Parts', text: e.person, since: e.ts });
    });
    S.jobs.filter(j => j.status === 'waiting_parts').forEach(j => {
      const c = S.byId(S.customers, j.customerId);
      waiting.push({ kind: 'Parts', text: `${j.id} ${c.name}: ${j.issue.toLowerCase()}. Waiting on parts, check the ETA with the supplier.`, since: +new Date(j.scheduledStart) });
    });
    waiting.push({ kind: 'Approval', text: 'SH-1042 Brian Okafor: water heater replacement quote ($1,890) sent yesterday, not yet approved.', since: at(-1, 16) });
    const shadow = health.find(h => h.status.key === 'shadow');
    if (shadow && shadow.stats.shadow) waiting.push({ kind: 'Review', text: `Review request texts (shadow mode): ${plural(shadow.stats.shadow, shadow.def.noun)} logged in the last 24 h. Check them, then decide whether to switch it live.`, since: asOf });
    health.filter(h => h.status.key === 'failed' && st.held[h.def.id]).forEach(h => {
      waiting.push({ kind: 'Held', text: `${h.def.name}: ${plural(st.held[h.def.id], h.def.noun)} held until the fix. They will be re-processed, not dropped.`, since: h.status.last.ts });
    });

    // Today's schedule
    const dayA = dayStart(asOf), dayB = nextDay(dayA);
    const todays = S.jobs.filter(j => j.scheduledStart && +new Date(j.scheduledStart) >= dayA && +new Date(j.scheduledStart) < dayB && j.techId);
    const schedule = S.techs.map(t => {
      const js = todays.filter(j => j.techId === t.id).sort((a, b) => new Date(a.scheduledStart) - new Date(b.scheduledStart));
      const hrs = js.reduce((s, j) => s + j.durationHrs, 0);
      return { tech: t, jobs: js, hrs, first: js[0] ? +new Date(js[0].scheduledStart) : null };
    });
    const unassigned = S.jobs.filter(j => j.status === 'new' && !j.techId && +new Date(j.createdAt) <= asOf).length;

    // Yesterday in numbers
    const yA = dayA - DAY + 0, yB = dayA;
    const inY = iso => iso && +new Date(iso) >= yA && +new Date(iso) < yB;
    const yLog = st.log.filter(e => e.ts >= yA && e.ts < yB && !NOTICE[e.kind]);
    const completedY = S.jobs.filter(j => inY(j.completedAt));
    const yesterday = {
      newJobs: S.jobs.filter(j => inY(j.createdAt)).length,
      firstCalls: S.jobs.filter(j => inY(j.firstCallAt)).length,
      completed: completedY.length,
      revenue: completedY.reduce((s, j) => s + j.revenue, 0),
      runs: yLog.length,
      items: yLog.reduce((s, e) => s + (e.result === 'failed' || e.result === 'shadow' ? 0 : e.items), 0),
      failures: yLog.filter(e => e.result === 'failed').length,
      held: yLog.filter(e => e.person).length,
    };

    const live = AUTOMATIONS.filter(d => d.mode !== 'shadow' && !st.paused[d.id]).length;
    let tone = 'good', headline = 'All systems normal';
    if (needsAttention.length) {
      tone = needsAttention.some(h => h.status.key === 'failed') ? 'bad' : 'warn';
      headline = `${needsAttention.length} automation${needsAttention.length > 1 ? 's need' : ' needs'} attention`;
    }
    const sub = needsAttention.length
      ? needsAttention.map(h => `${h.def.name}: ${h.status.key === 'failed' ? 'failed after retries' : h.status.label.toLowerCase()}.`).join(' ') + ' Ted has been alerted. Everything else ran normally.'
      : `All ${live} live automations ran on schedule.${recoveredCount ? ` ${recoveredCount} overnight hiccup${recoveredCount > 1 ? 's' : ''} fixed ${recoveredCount > 1 ? 'themselves' : 'itself'} on retry.` : ''}`;

    return { asOf, tone, headline, sub, overdue: firstCallWindow, dueSoon, health, waiting, schedule, unassigned, yesterday, live, todayCount: todays.length };
  }

  function buildDigest(st, asOf) {
    const D = digestData(st, asOf);
    const dateLong = new Date(asOf).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
    const dateShort = new Date(asOf).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    const parts = [D.headline];
    if (D.overdue.length) parts.push(`${D.overdue.length} overdue first call${D.overdue.length > 1 ? 's' : ''}`);
    const subject = `Summit daily digest · ${dateShort} · ${parts.join(' · ')}`;
    return { subject, data: D, html: digestHtml(D, dateLong), text: digestText(D, dateLong, subject) };
  }

  const TONES = {
    good: { fg: '#0f6b51', bg: '#e3f3ec', bar: '#0f7a5c', mark: 'OK' },
    warn: { fg: '#8a5a00', bg: '#fbf0d9', bar: '#c98a12', mark: '!' },
    bad: { fg: '#a1281c', bg: '#fbe6e3', bar: '#b42318', mark: '!' },
    info: { fg: '#2c4a8a', bg: '#e6edfb', bar: '#3b63c4', mark: 'S' },
    muted: { fg: '#5b6661', bg: '#eef0ec', bar: '#9aa59f', mark: '–' },
  };

  function digestHtml(D, dateLong) {
    const F = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
    const tone = TONES[D.tone];
    const sec = (title, count, body) => `
      <tr><td style="padding:26px 28px 0 28px;" class="px">
        <h2 style="margin:0 0 10px 0;font-family:${F};font-size:15px;line-height:20px;color:#15201b;font-weight:700;">${esc(title)}${count != null ? ` <span style="display:inline-block;margin-left:6px;padding:1px 8px;border-radius:10px;background:#eef0ec;color:#55605b;font-size:12px;font-weight:600;">${count}</span>` : ''}</h2>
        ${body}
      </td></tr>`;
    const row = (left, right, sub, first) => `
      <tr><td style="padding:10px 0;${first ? '' : 'border-top:1px solid #e6e9e3;'}font-family:${F};font-size:14px;line-height:20px;color:#15201b;vertical-align:top;">${left}${sub ? `<div style="color:#55605b;font-size:13px;line-height:18px;margin-top:2px;">${sub}</div>` : ''}</td>
      <td style="padding:10px 0 10px 12px;${first ? '' : 'border-top:1px solid #e6e9e3;'}font-family:${F};font-size:13px;line-height:20px;color:#55605b;text-align:right;vertical-align:top;white-space:nowrap;">${right || ''}</td></tr>`;
    const list = rows => `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">${rows.join('')}</table>`;
    const pill = (t, text) => `<span style="display:inline-block;padding:1px 7px;border-radius:9px;background:${TONES[t].bg};color:${TONES[t].fg};font-size:11px;font-weight:700;letter-spacing:.02em;">${esc(text)}</span>`;
    const dot = t => `<span style="display:inline-block;width:8px;height:8px;border-radius:4px;background:${TONES[t].bar};margin-right:8px;vertical-align:1px;"></span>`;
    const stat = (n, label, t) => `<td width="33%" style="padding:14px 8px;text-align:center;background:#f6f7f4;border-radius:8px;font-family:${F};" class="stat">
        <div style="font-size:26px;line-height:30px;font-weight:700;color:${t ? TONES[t].fg : '#15201b'};">${n}</div>
        <div style="font-size:12px;line-height:16px;color:#55605b;margin-top:2px;">${label}</div></td>`;

    const overdue = D.overdue.length
      ? list(D.overdue.map((o, i) => row(
          `<strong>${esc(o.job.id)}</strong> ${esc(o.customer.name)} <span style="color:#55605b;">· ${esc(o.vendor.short)} ${esc(o.job.claim || '')}</span>`,
          pill('bad', fmtSpan(o.late) + ' late'),
          `${esc(o.job.issue)}. First call was due ${esc(fmtWhen(o.due, D.asOf))} (${o.vendor.firstCallHours} h rule). ${o.tech ? 'Tech: ' + esc(o.tech.name) + (o.job.scheduledStart ? ', booked ' + esc(fmtWhen(+new Date(o.job.scheduledStart), D.asOf)) : '') : 'No tech assigned yet'}. Reminder texted, no call logged.`, i === 0)))
      : `<p style="margin:0;font-family:${F};font-size:14px;color:#0f6b51;">Every job has had its first call on time.</p>`;
    const dueSoon = D.dueSoon.length ? `<p style="margin:10px 0 0 0;font-family:${F};font-size:13px;color:#55605b;">Due in the next 12 hours: ${D.dueSoon.map(o => `${esc(o.job.id)} (${esc(fmtWhen(o.due, D.asOf))})`).join(', ')}.</p>` : '';

    const waiting = list(D.waiting.map((w, i) => row(
      `${pill(w.kind === 'Held' ? 'bad' : w.kind === 'Review' ? 'info' : 'warn', w.kind)} <span style="margin-left:4px;">${esc(w.text)}</span>`, '', '', i === 0)));

    const sched = list(D.schedule.map((s, i) => row(
      `<strong>${esc(s.tech.name)}</strong> <span style="color:#55605b;">· ${esc(s.tech.trade)}</span>`,
      s.jobs.length ? `${s.jobs.length} job${s.jobs.length > 1 ? 's' : ''} · ${s.hrs} h` : 'Open',
      s.jobs.length ? `First at ${esc(fmtTime(s.first))}: ${s.jobs.map(j => esc(j.id)).join(', ')}` : 'No jobs booked', i === 0)));
    const unassigned = D.unassigned ? `<p style="margin:10px 0 0 0;font-family:${F};font-size:13px;color:#55605b;">${D.unassigned} new job${D.unassigned > 1 ? 's' : ''} not yet assigned to a tech.</p>` : '';

    const health = list(D.health.map((h, i) => row(
      `${dot(h.status.tone)}<strong>${esc(h.def.name)}</strong>`,
      pill(h.status.tone, h.status.label),
      `<span style="padding-left:16px;display:block;">${esc(h.line)}</span>`, i === 0)));

    const y = D.yesterday;
    const num = (n, label) => `<td width="25%" style="padding:10px 4px;font-family:${F};vertical-align:top;" class="num"><div style="font-size:20px;line-height:24px;font-weight:700;color:#15201b;">${n}</div><div style="font-size:12px;line-height:16px;color:#55605b;">${label}</div></td>`;
    const nums = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
        ${num(y.newJobs, 'new work orders')}${num(y.firstCalls, 'first calls made')}${num(y.completed, 'jobs completed')}${num('$' + y.revenue.toLocaleString('en-US'), 'completed revenue')}
      </tr><tr>
        ${num(y.runs, 'automation runs')}${num(y.items.toLocaleString('en-US'), 'items handled')}${num(y.failures, 'failed attempts')}${num(y.held, 'held for a person')}
      </tr></table>`;

    return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light">
<title>Summit daily digest</title>
<style>
  body{margin:0;padding:0;background:#eceee8;}
  @media (max-width:480px){ .outer{padding:0!important;} .card{border-radius:0!important;border:0!important;} .px{padding-left:18px!important;padding-right:18px!important;} .stat div:first-child{font-size:22px!important;} .num{width:50%!important;display:inline-block!important;box-sizing:border-box;} .hide-sm{display:none!important;} }
</style></head>
<body style="margin:0;padding:0;background:#eceee8;">
<div style="display:none;max-height:0;overflow:hidden;">${esc(D.headline)}. ${D.overdue.length} overdue first calls, ${D.waiting.length} items waiting on a person, ${D.todayCount} jobs today.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#eceee8;">
<tr><td align="center" style="padding:14px 8px;" class="outer">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #d9ddd5;" class="card">
  <tr><td style="padding:20px 28px 16px 28px;border-bottom:1px solid #e6e9e3;" class="px">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
      <td style="font-family:${F};font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#0f7a5c;font-weight:700;">Summit Home Services</td>
      <td style="font-family:${F};font-size:12px;color:#55605b;text-align:right;">Daily digest</td>
    </tr></table>
    <div style="font-family:${F};font-size:13px;color:#55605b;margin-top:4px;">${esc(dateLong)} · as of ${esc(fmtTime(D.asOf))}</div>
  </td></tr>
  <tr><td style="padding:22px 28px 0 28px;" class="px">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${tone.bg};border-left:4px solid ${tone.bar};border-radius:8px;">
      <tr><td style="padding:16px 18px;font-family:${F};">
        <div style="font-size:20px;line-height:26px;font-weight:700;color:${tone.fg};">${esc(D.headline)}</div>
        <div style="font-size:14px;line-height:20px;color:#2b3631;margin-top:4px;">${esc(D.sub)}</div>
      </td></tr>
    </table>
  </td></tr>
  <tr><td style="padding:14px 28px 0 28px;" class="px">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;border-spacing:6px 0;margin:0 -6px;"><tr>
      ${stat(D.overdue.length, 'overdue first calls', D.overdue.length ? 'bad' : null)}
      ${stat(D.waiting.length, 'waiting on a person', D.waiting.length ? 'warn' : null)}
      ${stat(D.todayCount, 'jobs on today’s board', null)}
    </tr></table>
  </td></tr>
  ${sec('Overdue: no first call past the vendor deadline', D.overdue.length, overdue + dueSoon)}
  ${sec('Waiting on a person', D.waiting.length, waiting)}
  ${sec('Today’s schedule', D.todayCount + ' jobs', sched + unassigned)}
  ${sec('Automation health, last 24 hours', null, health)}
  ${sec('Yesterday in numbers', null, nums)}
  <tr><td style="padding:24px 28px 26px 28px;" class="px">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td style="border-radius:20px;background:#0f7a5c;">
      <a href="https://tedkelly.dev/projects/daily-digest/" target="_blank" rel="noopener" style="display:inline-block;padding:10px 20px;font-family:${F};font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;">Open the ops console</a>
    </td></tr></table>
  </td></tr>
  <tr><td style="padding:16px 28px 20px 28px;background:#f6f7f4;border-top:1px solid #e6e9e3;font-family:${F};font-size:12px;line-height:18px;color:#6b7570;" class="px">
    Sent by Summit Ops Bot every morning at 6:30 AM, built from the Jobs sheet and the automation run log. If this email has not arrived by 7:00 AM, Ted gets a text: the digest has its own heartbeat check.<br>
    Summit Home Services is a fictional company. All names and numbers are made up.
  </td></tr>
</table>
</td></tr></table>
</body></html>`;
  }

  function digestText(D, dateLong, subject) {
    const L = [];
    const hr = '-'.repeat(48);
    L.push(`SUMMIT HOME SERVICES · DAILY DIGEST`, `${dateLong}, as of ${fmtTime(D.asOf)}`, '', `>> ${D.headline.toUpperCase()}`, D.sub, '');
    L.push(`${D.overdue.length} overdue first calls · ${D.waiting.length} waiting on a person · ${D.todayCount} jobs today`, '');
    L.push(hr, `OVERDUE: NO FIRST CALL PAST THE VENDOR DEADLINE (${D.overdue.length})`, hr);
    if (!D.overdue.length) L.push('Every job has had its first call on time.');
    D.overdue.forEach(o => {
      L.push(`* ${o.job.id} ${o.customer.name} · ${o.vendor.short} ${o.job.claim || ''} · ${fmtSpan(o.late)} late`);
      L.push(`  ${o.job.issue}. Due ${fmtWhen(o.due, D.asOf)} (${o.vendor.firstCallHours} h rule). ${o.tech ? 'Tech: ' + o.tech.name : 'No tech assigned yet'}.`);
    });
    if (D.dueSoon.length) L.push(`Due in the next 12 hours: ${D.dueSoon.map(o => o.job.id).join(', ')}`);
    L.push('', hr, `WAITING ON A PERSON (${D.waiting.length})`, hr);
    D.waiting.forEach(w => L.push(`* [${w.kind}] ${w.text}`));
    L.push('', hr, `TODAY'S SCHEDULE (${D.todayCount} jobs)`, hr);
    D.schedule.forEach(s => L.push(`* ${s.tech.name.padEnd(16)} ${s.jobs.length ? `${s.jobs.length} jobs, ${s.hrs} h, first at ${fmtTime(s.first)}` : 'open'}`));
    if (D.unassigned) L.push(`  ${D.unassigned} new jobs not yet assigned.`);
    L.push('', hr, 'AUTOMATION HEALTH, LAST 24 HOURS', hr);
    D.health.forEach(h => L.push(`[${h.status.label.toUpperCase()}] ${h.def.name}`, `   ${h.line}`));
    const y = D.yesterday;
    L.push('', hr, 'YESTERDAY IN NUMBERS', hr,
      `New work orders: ${y.newJobs}   First calls: ${y.firstCalls}   Completed: ${y.completed} ($${y.revenue.toLocaleString('en-US')})`,
      `Automation runs: ${y.runs}   Items handled: ${y.items.toLocaleString('en-US')}   Failed attempts: ${y.failures}   Held for a person: ${y.held}`,
      '', 'Open the ops console: https://tedkelly.dev/projects/daily-digest/', '',
      '-- Sent by Summit Ops Bot at 6:30 AM. If this email has not arrived by 7:00 AM, Ted gets a text.',
      'Summit Home Services is fictional. All names and numbers are made up.');
    return L.join('\n');
  }

  const Ops = {
    MIN, HOUR, DAY, NOW0, DIGEST_AT, RETRY_DELAYS, AUTOMATIONS, FAILURES, at, byId,
    createState, statusOf, heartbeat, dayStats, sparkline, openAlerts, heldTotal, slots,
    advanceTo, push, sortLog, resolveAlert, notifications, overdueJobs, digestData, buildDigest,
    fmtTime, fmtWhen, fmtSpan, fmtDur, plural, esc,
  };
  root.Ops = Ops;
  if (typeof module !== 'undefined' && module.exports) module.exports = Ops;
})(typeof window !== 'undefined' ? window : globalThis);
