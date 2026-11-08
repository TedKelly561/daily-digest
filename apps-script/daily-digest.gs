/**
 * Summit Home Services: Health check + 6:30 AM Daily Digest (Google Apps Script)
 * ------------------------------------------------------------------------------
 * What it does, every morning:
 *   1. Reads the "Jobs" sheet and finds jobs past their vendor's first-call deadline.
 *   2. Reads the "Automation Log" sheet (one row per run, written by every automation)
 *      and works out each automation's health: failures, retries, missed runs (heartbeat).
 *   3. Builds an HTML + plain-text digest and emails it to the owner and the office.
 *
 * Safety rules it follows:
 *   - If anything in here throws, it emails a failure alert to a person (failToPerson).
 *     A digest that silently doesn't arrive is exactly the problem we're solving.
 *   - SHADOW_MODE=true (Script property) logs the digest instead of sending it.
 *     Use it for the first week so you can compare it with reality before it goes live.
 *   - It writes its own row to the Automation Log, so the digest has a heartbeat too.
 *
 * Setup (about 10 minutes):
 *   1. Open the Google Sheet that holds "Jobs" and "Automation Log" → Extensions → Apps Script.
 *   2. Paste this file. Project Settings → Script properties, add:
 *        DIGEST_TO      owner@example.com,office@example.com
 *        ALERT_TO       ted@example.com
 *        SHADOW_MODE    true          (switch to false when you're happy with it)
 *        TIMEZONE       America/Denver (optional; defaults to the script's time zone)
 *   3. Run installTrigger() once and approve the permissions. It schedules sendDailyDigest
 *      for about 6:30 AM every day.
 *
 * Sheet layouts (row 1 = headers, names must match; extra columns are ignored):
 *   Jobs:            Job ID | Customer | Vendor | Status | Tech | Created At | First Call At | Scheduled Start | Duration Hrs | Issue
 *   Automation Log:  Timestamp | Automation | Result | Attempt | Items | Duration Ms | Error | Note
 *                    Result is one of: ok, failed, recovered, held, shadow
 *   Automations:     Name | Every Minutes | Active From | Active To | Mode   (Mode: live, shadow, paused)
 *
 * No secrets live in this file. Addresses come from Script properties (example.com placeholders above).
 */

// ---------- Settings ----------
var SHEETS = { jobs: 'Jobs', log: 'Automation Log', automations: 'Automations' };

// First-call deadline per vendor, in hours. Anything not listed uses DEFAULT_FIRST_CALL_HOURS.
var FIRST_CALL_HOURS = {
  'Northstar Home Warranty': 24,
  'Bluepeak Protection Plans': 48,
  'Harbor Appliance Care': 24,
  'Direct customer': 4
};
var DEFAULT_FIRST_CALL_HOURS = 24;
var HEARTBEAT_GRACE_MIN = 5;   // how late a run may be before we call it "missed"
var DONE_STATUSES = ['completed', 'invoiced', 'cancelled'];

// ---------- Entry points ----------

/** Time-driven trigger target. Wrapped so any failure reaches a person. */
function sendDailyDigest() {
  var started = new Date();
  try {
    var props = PropertiesService.getScriptProperties();
    var tz = props.getProperty('TIMEZONE') || Session.getScriptTimeZone();
    var shadow = String(props.getProperty('SHADOW_MODE') || 'true').toLowerCase() === 'true';
    var to = props.getProperty('DIGEST_TO');
    if (!to) throw new Error('Script property DIGEST_TO is not set.');

    var now = new Date();
    var jobs = readSheet_(SHEETS.jobs);
    var log = readSheet_(SHEETS.log);
    var automations = readSheet_(SHEETS.automations);

    var overdue = findOverdueJobs_(jobs, now);
    var health = automationHealth_(automations, log, now);
    var today = todaysSchedule_(jobs, now, tz);

    var digest = buildDigest_({ now: now, tz: tz, overdue: overdue, health: health, today: today });

    if (shadow) {
      // Shadow mode: do everything except send. Check the log, then flip SHADOW_MODE to false.
      console.log('[SHADOW] Would send to %s\nSubject: %s\n\n%s', to, digest.subject, digest.text);
    } else {
      MailApp.sendEmail({ to: to, subject: digest.subject, body: digest.text, htmlBody: digest.html, name: 'Summit Ops Bot' });
    }
    logRun_('Daily digest', shadow ? 'shadow' : 'ok', overdue.length, new Date() - started, '', shadow ? 'Shadow mode: logged, not sent' : 'Sent to ' + to);
  } catch (err) {
    failToPerson_(err, started);
  }
}

/** Run once by hand: schedules the digest for about 6:30 AM every day. */
function installTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'sendDailyDigest') ScriptApp.deleteTrigger(t);
  });
  // Apps Script runs daily triggers within a 15-minute window, so this lands roughly 6:30 to 6:45.
  ScriptApp.newTrigger('sendDailyDigest').timeBased().everyDays(1).atHour(6).nearMinute(30).create();
  console.log('Daily digest trigger installed.');
}

// ---------- Reading data ----------

/** Returns the sheet as an array of objects keyed by the header row. */
function readSheet_(name) {
  var sheet = SpreadsheetApp.getActive().getSheetByName(name);
  if (!sheet) throw new Error('Sheet "' + name + '" not found.');
  var values = sheet.getDataRange().getValues();
  var headers = values.shift().map(function (h) { return String(h).trim(); });
  return values
    .filter(function (row) { return row.join('') !== ''; })
    .map(function (row) {
      var o = {};
      headers.forEach(function (h, i) { o[h] = row[i]; });
      return o;
    });
}

function toDate_(v) {
  if (v instanceof Date) return v;
  if (v === '' || v == null) return null;
  var d = new Date(v);
  return isNaN(d) ? null : d;
}

// ---------- Overdue first calls ----------

/** Open jobs with no first call logged, past the vendor's first-call deadline. */
function findOverdueJobs_(jobs, now) {
  return jobs
    .filter(function (j) { return DONE_STATUSES.indexOf(String(j['Status']).toLowerCase()) === -1; })
    .filter(function (j) { return !toDate_(j['First Call At']); })
    .map(function (j) {
      var created = toDate_(j['Created At']);
      var hours = FIRST_CALL_HOURS[j['Vendor']] || DEFAULT_FIRST_CALL_HOURS;
      var due = created ? new Date(created.getTime() + hours * 3600000) : null;
      return { id: j['Job ID'], customer: j['Customer'], vendor: j['Vendor'], tech: j['Tech'] || 'Unassigned',
               issue: j['Issue'], due: due, hoursLate: due ? Math.round((now - due) / 3600000) : 0, rule: hours };
    })
    .filter(function (o) { return o.due && o.due < now; })
    .sort(function (a, b) { return a.due - b.due; });
}

// ---------- Automation health ----------

/**
 * For each automation: runs, items, failures and recoveries in the last 24 h, plus a
 * heartbeat check: did it run at its last expected time? A silent stop shows up here
 * even though nothing ever errored.
 */
function automationHealth_(automations, log, now) {
  var since = new Date(now.getTime() - 24 * 3600000);
  return automations.map(function (a) {
    var name = a['Name'];
    var mode = String(a['Mode'] || 'live').toLowerCase();
    var rows = log.filter(function (r) { return r['Automation'] === name; });
    var recent = rows.filter(function (r) { var t = toDate_(r['Timestamp']); return t && t >= since; });
    var last = rows.reduce(function (m, r) { var t = toDate_(r['Timestamp']); return t && (!m || t > m.t) ? { t: t, r: r } : m; }, null);

    var failures = recent.filter(function (r) { return r['Result'] === 'failed'; });
    var recovered = recent.filter(function (r) { return r['Result'] === 'recovered'; });
    var items = recent.reduce(function (s, r) { return s + (r['Result'] === 'failed' ? 0 : Number(r['Items']) || 0); }, 0);

    var status = 'healthy', line = recent.length + ' runs, ' + items + ' items.';
    if (mode === 'paused') {
      status = 'paused'; line = 'Paused. Not running and not checked.';
    } else if (mode === 'shadow') {
      status = 'shadow'; line = 'Shadow mode: ' + recent.length + ' runs logged, nothing sent.';
    } else if (last && last.r['Result'] === 'failed' && Number(last.r['Attempt']) >= 4) {
      status = 'failed'; line = 'Failed after 3 retries: ' + last.r['Error'] + '.';
    } else {
      var expected = lastExpectedRun_(a, now);
      if (expected && (!last || last.t < expected)) {
        status = 'late';
        line = 'No run since ' + (last ? fmtTime_(last.t) : 'ever') + ', expected every ' + a['Every Minutes'] + ' min.';
      } else if (recovered.length) {
        line += ' ' + recovered.length + ' failure(s) fixed on retry.';
      } else {
        line += ' No failures.';
      }
    }
    return { name: name, status: status, line: line, failures: failures.length, recovered: recovered.length };
  });
}

/** The most recent time the automation should have run (minus grace), or null if outside its hours. */
function lastExpectedRun_(a, now) {
  var every = Number(a['Every Minutes']);
  if (!every) return null;
  var from = minutesOf_(a['Active From'] || '00:00'), to = minutesOf_(a['Active To'] || '23:59');
  var t = new Date(now.getTime() - HEARTBEAT_GRACE_MIN * 60000);
  var mins = t.getHours() * 60 + t.getMinutes();
  if (mins < from) return null;                       // before today's first run
  var lastSlot = Math.min(to, from + Math.floor((mins - from) / every) * every);
  var d = new Date(t); d.setHours(0, lastSlot, 0, 0);
  return d;
}
function minutesOf_(v) {
  if (v instanceof Date) return v.getHours() * 60 + v.getMinutes();
  var p = String(v).split(':');
  return Number(p[0]) * 60 + Number(p[1] || 0);
}

// ---------- Today's schedule ----------

function todaysSchedule_(jobs, now, tz) {
  var key = Utilities.formatDate(now, tz, 'yyyy-MM-dd');
  var byTech = {};
  jobs.forEach(function (j) {
    var s = toDate_(j['Scheduled Start']);
    if (!s || Utilities.formatDate(s, tz, 'yyyy-MM-dd') !== key || !j['Tech']) return;
    var t = byTech[j['Tech']] || (byTech[j['Tech']] = { tech: j['Tech'], jobs: 0, hours: 0, first: s });
    t.jobs++; t.hours += Number(j['Duration Hrs']) || 0;
    if (s < t.first) t.first = s;
  });
  return Object.keys(byTech).sort().map(function (k) { return byTech[k]; });
}

// ---------- Building the email ----------

function buildDigest_(d) {
  var problems = d.health.filter(function (h) { return h.status === 'failed' || h.status === 'late'; });
  var headline = problems.length ? problems.length + ' automation' + (problems.length > 1 ? 's need' : ' needs') + ' attention' : 'All systems normal';
  var tone = problems.some(function (h) { return h.status === 'failed'; }) ? ['#a1281c', '#fbe6e3'] : problems.length ? ['#8a5a00', '#fbf0d9'] : ['#0f6b51', '#e3f3ec'];
  var date = Utilities.formatDate(d.now, d.tz, 'EEE, MMM d');
  var subject = 'Summit daily digest · ' + date + ' · ' + headline + (d.overdue.length ? ' · ' + d.overdue.length + ' overdue first calls' : '');
  var F = 'font-family:Arial,Helvetica,sans-serif;';

  function section(title, rows) {
    return '<h2 style="' + F + 'font-size:15px;margin:24px 0 8px;color:#15201b;">' + esc_(title) + '</h2>' +
      '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">' + rows.join('') + '</table>';
  }
  function row(left, right, sub) {
    return '<tr><td style="' + F + 'padding:8px 0;border-top:1px solid #e6e9e3;font-size:14px;color:#15201b;">' + left +
      (sub ? '<div style="font-size:13px;color:#55605b;">' + sub + '</div>' : '') + '</td>' +
      '<td style="' + F + 'padding:8px 0 8px 12px;border-top:1px solid #e6e9e3;font-size:13px;color:#55605b;text-align:right;white-space:nowrap;">' + (right || '') + '</td></tr>';
  }

  var overdueRows = d.overdue.length ? d.overdue.map(function (o) {
    return row('<b>' + esc_(o.id) + '</b> ' + esc_(o.customer) + ' · ' + esc_(o.vendor), o.hoursLate + ' h late',
      esc_(o.issue) + '. Due ' + fmtTime_(o.due) + ' (' + o.rule + ' h rule). Tech: ' + esc_(o.tech) + '.');
  }) : [row('Every job has had its first call on time.')];
  var healthRows = d.health.map(function (h) { return row('<b>' + esc_(h.name) + '</b>', h.status.toUpperCase(), esc_(h.line)); });
  var todayRows = d.today.length ? d.today.map(function (t) {
    return row('<b>' + esc_(t.tech) + '</b>', t.jobs + ' jobs · ' + t.hours + ' h', 'First at ' + fmtTime_(t.first));
  }) : [row('No jobs booked today.')];

  var html =
    '<div style="background:#eceee8;padding:16px 8px;">' +
    '<div style="max-width:600px;margin:0 auto;background:#fff;border:1px solid #d9ddd5;border-radius:12px;padding:22px 26px;">' +
    '<div style="' + F + 'font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#0f7a5c;font-weight:bold;">Summit Home Services · Daily digest</div>' +
    '<div style="' + F + 'font-size:13px;color:#55605b;margin-top:4px;">' + esc_(date) + '</div>' +
    '<div style="margin-top:16px;padding:14px 16px;border-left:4px solid ' + tone[0] + ';background:' + tone[1] + ';border-radius:8px;' + F + '">' +
    '<div style="font-size:20px;font-weight:bold;color:' + tone[0] + ';">' + esc_(headline) + '</div>' +
    '<div style="font-size:14px;color:#2b3631;margin-top:4px;">' + d.overdue.length + ' overdue first calls · ' + d.today.reduce(function (s, t) { return s + t.jobs; }, 0) + ' jobs today</div></div>' +
    section('Overdue: no first call past the vendor deadline', overdueRows) +
    section('Today’s schedule', todayRows) +
    section('Automation health, last 24 hours', healthRows) +
    '<p style="' + F + 'font-size:12px;color:#6b7570;margin-top:24px;">Sent by Summit Ops Bot. If this email has not arrived by 7:00 AM, a separate check texts Ted.</p>' +
    '</div></div>';

  var text = ['SUMMIT DAILY DIGEST · ' + date, '', '>> ' + headline.toUpperCase(), '', 'OVERDUE FIRST CALLS (' + d.overdue.length + ')']
    .concat(d.overdue.map(function (o) { return '* ' + o.id + ' ' + o.customer + ' (' + o.vendor + '), ' + o.hoursLate + ' h late'; }))
    .concat(['', "TODAY'S SCHEDULE"], d.today.map(function (t) { return '* ' + t.tech + ': ' + t.jobs + ' jobs, ' + t.hours + ' h'; }))
    .concat(['', 'AUTOMATION HEALTH'], d.health.map(function (h) { return '[' + h.status.toUpperCase() + '] ' + h.name + ': ' + h.line; }))
    .join('\n');

  return { subject: subject, html: html, text: text };
}

// ---------- Fail to a person ----------

/**
 * Something broke inside the digest itself. Tell a human, with enough context to act,
 * and log it. Never swallow the error silently.
 */
function failToPerson_(err, started) {
  var to = PropertiesService.getScriptProperties().getProperty('ALERT_TO');
  var body = [
    'The Summit daily digest did not go out.',
    '',
    'Error: ' + (err && err.message ? err.message : err),
    'When: ' + started,
    'Where: ' + (err && err.stack ? String(err.stack).split('\n').slice(0, 3).join(' | ') : 'unknown'),
    '',
    'Suggested fix: check that the Jobs, Automation Log and Automations sheets exist with the expected headers,',
    'and that DIGEST_TO is set in Script properties. Then run sendDailyDigest() by hand once.',
    '',
    'Nothing was lost: the digest only reads data. It will try again tomorrow at 6:30 AM.'
  ].join('\n');
  try {
    if (to) MailApp.sendEmail(to, '[Action needed] Summit daily digest failed', body);
  } finally {
    console.error(body);
    try { logRun_('Daily digest', 'failed', 0, new Date() - started, String(err && err.message || err), 'Alert emailed to ' + (to || 'nobody: ALERT_TO missing')); } catch (e) { /* the log sheet itself may be the problem */ }
  }
}

/** Every run writes one row. If it isn't in the log, it didn't happen. */
function logRun_(automation, result, items, durMs, error, note) {
  var sheet = SpreadsheetApp.getActive().getSheetByName(SHEETS.log);
  if (!sheet) return;
  sheet.appendRow([new Date(), automation, result, 1, items, durMs, error || '', note || '']);
}

// ---------- Small helpers ----------
function fmtTime_(d) {
  var tz = PropertiesService.getScriptProperties().getProperty('TIMEZONE') || Session.getScriptTimeZone();
  return Utilities.formatDate(d, tz, 'EEE h:mm a');
}
function esc_(s) {
  return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; });
}
