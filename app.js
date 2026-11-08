// Daily Digest demo: the ops console UI. The engine lives in ops.js (window.Ops).
(function () {
  'use strict';
  const O = window.Ops;
  const $ = s => document.querySelector(s);
  const esc = O.esc;
  const MIN = O.MIN;
  const reduced = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const params = new URLSearchParams(location.search);

  let st = O.createState();
  let running = false;
  let runToken = 0;
  let lastScenario = { auto: 'vendorsync', outcome: 'recover' };
  let logLimit = 40;
  let seenLogIds = new Set(st.log.map(e => e.id));
  let freshAlerts = new Set();

  // Per-viewer conveniences only (remembered filters / digest view).
  const prefs = (() => {
    let p = {};
    try { p = JSON.parse(localStorage.getItem('m2-digest-prefs') || '{}') || {}; } catch (e) { p = {}; }
    return {
      get: (k, d) => (p[k] != null ? p[k] : d),
      set: (k, v) => { p[k] = v; try { localStorage.setItem('m2-digest-prefs', JSON.stringify(p)); } catch (e) { /* private mode */ } },
    };
  })();
  let edition = prefs.get('edition', 'morning');
  let plain = false;

  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const toneChip = (tone, label) => `<span class="chip ${tone}">${esc(label)}</span>`;
  const when = t => O.fmtWhen(t, st.now);

  // ---------- Status bar ----------
  function renderStatus() {
    const autos = O.AUTOMATIONS.map(d => ({ d, s: O.statusOf(st, d) }));
    const bad = autos.filter(a => a.s.key === 'failed');
    const warn = autos.filter(a => a.s.key === 'warning');
    const need = bad.concat(warn);
    const bar = $('#statusbar');
    bar.classList.toggle('tone-bad', bad.length > 0);
    bar.classList.toggle('tone-warn', !bad.length && warn.length > 0);
    $('#sbIcon').textContent = need.length ? '!' : '✓';
    const live = O.AUTOMATIONS.filter(d => d.mode !== 'shadow' && !st.paused[d.id]).length;
    $('#sbHead').textContent = need.length ? `${need.length} automation${need.length > 1 ? 's need' : ' needs'} attention` : 'All systems normal';
    const lines = need.map(({ d, s }) => {
      const alert = O.openAlerts(st).find(a => a.auto === d.id);
      const texted = alert ? ` Ted was texted at ${O.fmtTime(alert.raisedAt)}.` : '';
      if (s.key === 'failed') return `${d.name} failed after 3 retries. ${O.plural(st.held[d.id] || 0, d.noun)} held.${texted}`;
      if (s.hb && s.hb.late) return `${d.name} hasn't run since ${when(s.hb.lastRun)}.${texted}`;
      return `${d.name} is retrying after an error.`;
    });
    $('#sbSub').textContent = need.length ? lines.join(' ') + ' Everything else is running on schedule.' : `All ${live} live automations are running on schedule.`;

    const today = O.at(0);
    let runs = 0, items = 0;
    O.AUTOMATIONS.forEach(d => { const s = O.dayStats(st, d.id, today, st.now); runs += s.attempts; items += d.mode === 'shadow' || d.id === 'backup' ? 0 : s.items; });
    const held = O.heldTotal(st);
    const alerts = O.openAlerts(st).length;
    $('#sbStats').innerHTML = [
      ['Live', `${live}<span class="muted small"> / ${O.AUTOMATIONS.length}</span>`],
      ['Runs today', runs.toLocaleString('en-US')],
      ['Items handled', items.toLocaleString('en-US')],
      ['Held', held, held > 0],
      ['Open alerts', alerts, alerts > 0],
    ].map(([k, v, hot]) => `<div><dt>${k}</dt><dd${hot ? ' class="hot"' : ''}>${v}</dd></div>`).join('');
    $('#clock').textContent = O.fmtTime(st.now);
  }

  // ---------- Automations ----------
  function spark(st, d) {
    const data = O.sparkline(st, d.id, st.now);
    const W = 6, G = 2, H = 26;
    const max = Math.max(1, ...data.filter(Boolean).map(x => x.items));
    const bars = data.map((x, i) => {
      const xPos = i * (W + G);
      const label = x ? `${x.day === 0 ? 'Today so far' : x.day === -1 ? 'Yesterday' : (-x.day) + ' days ago'}: ${x.runs} runs, ${x.items.toLocaleString('en-US')} ${d.noun[1]}${x.issue === 'retry' ? ', recovered on retry' : x.issue === 'failed' ? ', failed, a person stepped in' : ''}` : 'Not running yet';
      if (!x) return `<line class="none" x1="${xPos}" x2="${xPos + W}" y1="${H - 1}" y2="${H - 1}"><title>${label}</title></line>`;
      const h = Math.max(3, Math.round((x.items / max) * (H - 2)));
      const cls = 'b' + (x.issue ? ' ' + x.issue : '') + (x.day === 0 ? ' today' : '');
      return `<g><rect class="hit" x="${xPos - 1}" y="0" width="${W + 2}" height="${H}" fill="transparent"><title>${label}</title></rect><path class="${cls}" d="M${xPos},${H} v-${h - 2} q0,-2 2,-2 h${W - 4} q2,0 2,2 v${h - 2} z"><title>${label}</title></path></g>`;
    }).join('');
    const issues = data.filter(x => x && x.issue).length;
    const aria = `${d.name}, last 14 days: ${issues ? issues + ' day' + (issues > 1 ? 's' : '') + ' with a problem' : 'no problems'}.`;
    return `<svg class="spark" width="${14 * (W + G) - G}" height="${H}" viewBox="0 0 ${14 * (W + G) - G} ${H}" role="img" aria-label="${esc(aria)}">${bars}</svg>`;
  }

  function renderAutos() {
    const today = O.at(0);
    let healthy = 0;
    $('#autoList').innerHTML = O.AUTOMATIONS.map(d => {
      const s = O.statusOf(st, d);
      if (s.key === 'healthy') healthy++;
      const t = O.dayStats(st, d.id, today, st.now);
      const last = s.last;
      const hb = O.heartbeat(st, d, st.now);
      const meta = [
        `<span class="chip">${esc(d.platform)}</span>`,
        d.module ? `<span class="chip">${esc(d.module)}</span>` : '',
        `<span>${esc(d.scheduleText)}</span>`,
        last ? `<span>Last run ${esc(when(last.ts))}</span>` : '',
        hb.late ? `<span class="late">Missed ${hb.missed.length} run${hb.missed.length > 1 ? 's' : ''}</span>` : '',
        d.mode === 'shadow' ? `<span>Logging only since ${esc(new Date(O.at(d.since)).toLocaleDateString('en-US', { weekday: 'short' }))}</span>` : '',
      ].join('');
      const isPaused = !!st.paused[d.id];
      return `<article class="auto" data-id="${d.id}">
        <div class="auto-main">
          <div class="auto-title"><span class="sdot ${s.tone}" aria-hidden="true"></span><h3>${esc(d.name)}</h3>${toneChip(s.tone, s.label)}</div>
          <p class="auto-does">${esc(d.does)}</p>
          <div class="auto-meta">${meta}<span class="auto-actions">
            <button class="linkbtn" type="button" data-act="runs" data-id="${d.id}" aria-label="Show runs for ${esc(d.name)}">Runs</button>
            <button class="linkbtn" type="button" data-act="pause" data-id="${d.id}" aria-pressed="${isPaused}" aria-label="${isPaused ? 'Resume' : 'Pause'} ${esc(d.name)}" ${running || st.broken[d.id] ? 'disabled' : ''}>${isPaused ? 'Resume' : 'Pause'}</button></span></div>
        </div>
        <div class="auto-nums">
          <div><b>${t.runs}</b><small>runs today</small></div>
          <div><b>${t.items.toLocaleString('en-US')}</b><small>${esc(d.mode === 'shadow' ? 'logged' : d.noun[1])}</small></div>
        </div>
        <div class="auto-spark">${spark(st, d)}<small>14 days</small></div>
      </article>`;
    }).join('');
    $('#autosSummary').textContent = `${healthy} healthy of ${O.AUTOMATIONS.length}`;
  }

  // ---------- Heartbeat ----------
  function renderHeartbeat() {
    $('#hbBody').innerHTML = O.AUTOMATIONS.map(d => {
      const hb = O.heartbeat(st, d, st.now);
      let check;
      if (!hb.checked) check = '<span class="hb-off">Paused, not checked</span>';
      else if (hb.late) check = `<span class="hb-late">Late: ${esc(hb.text)}</span>`;
      else check = '<span class="hb-ok">On time</span>';
      return `<tr><td>${esc(d.name)}</td><td>${esc(d.scheduleText)}</td><td class="mono small">${hb.lastRun ? esc(when(hb.lastRun)) : '–'}</td><td>${check}</td></tr>`;
    }).join('');
  }

  // ---------- Alerts ----------
  const ICON_SMS = '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="4" y="1" width="8" height="14" rx="2" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M7 12.5h2" stroke="currentColor" stroke-width="1.5"/></svg>';
  const ICON_MAIL = '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="1.5" y="3" width="13" height="10" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M2 4l6 5 6-5" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>';

  function renderAlerts() {
    const open = O.openAlerts(st);
    const resolved = st.alerts.filter(a => a.resolvedAt).slice(-2).reverse();
    $('#alertsCount').textContent = open.length ? `${open.length} open` : 'none open';
    const cards = open.slice().reverse().map(a => {
      const d = O.byId(a.auto);
      const hb = a.kind === 'heartbeat' ? O.heartbeat(st, d, st.now) : null;
      const ctx = a.context.slice();
      if (hb && hb.late) ctx.splice(2, 0, ['Missed so far', `${hb.missed.length} run${hb.missed.length > 1 ? 's' : ''} (${hb.missed.slice(-4).map(O.fmtTime).join(', ')})`]);
      if (a.kind === 'exhausted') ctx.splice(3, 0, ['Held now', `${O.plural(st.held[a.auto] || 0, d.noun)}, will be re-processed`]);
      const sms = a.notified.find(n => n.channel === 'sms'), eml = a.notified.find(n => n.channel === 'email');
      const tone = a.kind === 'exhausted' ? 'bad' : 'warn';
      return `<article class="alert tone-${tone}${freshAlerts.has(a.id) ? ' fresh' : ''}" data-alert="${a.id}" aria-labelledby="h-${a.id}">
        <div class="alert-top">${toneChip(tone, a.kind === 'exhausted' ? 'Failed after 3 retries' : 'Heartbeat: missed run')}<h3 id="h-${a.id}">${esc(a.title)}</h3><time>${esc(when(a.raisedAt))}</time></div>
        <p>${esc(a.summary)}</p>
        <dl class="ctx">${ctx.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>
        <div class="fix"><b>Suggested fix</b>${esc(a.fix)}</div>
        <div class="notify">
          <div><div class="nlabel">${ICON_SMS}Texted Ted · ${esc(O.fmtTime(sms.at))}</div><div class="bubble">${esc(sms.body)}</div></div>
          <div><div class="nlabel">${ICON_MAIL}Emailed the office · ${esc(O.fmtTime(eml.at))}</div><div class="eml-box"><b>${esc(eml.subject)}</b><span class="eto">to ${esc(eml.to)}</span><br>${esc(eml.body)}</div></div>
        </div>
        <div class="alert-actions">
          ${a.ackAt ? `<span class="ack-note">Taken by Ted at ${esc(O.fmtTime(a.ackAt))}</span>` : `<button class="btn ghost small" type="button" data-act="ack" data-id="${a.id}">Acknowledge</button>`}
          <button class="btn small" type="button" data-act="fix" data-id="${a.id}" ${running ? 'disabled' : ''}>${a.kind === 'heartbeat' ? 'Mark fixed and run catch-up' : 'Mark fixed and re-process held items'}</button>
        </div>
      </article>`;
    });
    const done = resolved.map(a => `<div class="resolved"><b>Resolved ${esc(when(a.resolvedAt))}</b> · ${esc(a.title)}. ${esc(a.resolution)}</div>`);
    $('#alertList').innerHTML = (cards.length ? cards.join('') : '<div class="no-alerts">No open alerts. When retries can\'t fix something, the alert shows up here, and as a text and an email.</div>') + done.join('');
    freshAlerts = new Set();
  }

  // ---------- Run log ----------
  const RESULT = {
    ok: ['good', 'Success'], recovered: ['good', 'Recovered'], held: ['warn', 'Held for a person'],
    shadow: ['info', 'Shadow, logged only'], missed: ['warn', 'Missed run'], alerted: ['bad', 'Alert sent'], admin: ['muted', 'Change'],
  };
  function resultChip(e) {
    if (e.result === 'failed') return e.exhausted ? toneChip('bad', 'Failed') : toneChip('warn', 'Failed, will retry');
    const [t, l] = RESULT[e.result] || ['muted', e.result];
    return toneChip(t, l);
  }
  function logMatches(e, a, r) {
    if (a !== 'all' && e.auto !== a) return false;
    switch (r) {
      case 'work': return e.items > 0 || !['ok', 'shadow'].includes(e.result) || e.kind !== 'run';
      case 'problems': return ['failed', 'held', 'missed', 'alerted'].includes(e.result);
      case 'retries': return e.kind === 'retry' || (e.result === 'failed' && !e.exhausted);
      case 'ok': return e.result === 'ok' || e.result === 'recovered';
      case 'shadow': return e.result === 'shadow';
      case 'checks': return ['heartbeat', 'alert', 'admin'].includes(e.kind);
      default: return true;
    }
  }
  function renderLog() {
    const a = $('#logAuto').value, r = $('#logResult').value;
    const rows = st.log.filter(e => logMatches(e, a, r)).slice().reverse();
    const shown = rows.slice(0, logLimit);
    $('#logBody').innerHTML = shown.map(e => {
      const d = O.byId(e.auto);
      const isNotice = ['heartbeat', 'alert', 'admin'].includes(e.kind);
      const label = e.kind === 'retry' ? `Retry ${e.attempt - 1}` : e.kind === 'reprocess' ? 'Re-process' : e.kind === 'heartbeat' ? 'Watchdog' : '';
      const items = isNotice ? '' : e.items.toLocaleString('en-US');
      const dur = isNotice ? '' : O.fmtDur(e.durMs);
      const err = e.error ? `<span class="err">${esc(e.error)}.</span> ` : '';
      return `<tr class="${seenLogIds.has(e.id) ? '' : 'new'}"><td class="t">${esc(when(e.ts))}</td><td class="a">${esc(d.name)}${label ? ` <span class="muted small">· ${label}</span>` : ''}</td><td class="r">${resultChip(e)}</td><td class="n">${items}</td><td class="n">${dur}</td><td class="d">${err}${esc(e.note || '')}${isNotice ? '' : ` <span class="meta muted small">· ${O.plural(e.items, ['item', 'items'])} · ${dur}</span>`}</td></tr>`;
    }).join('') || '<tr><td colspan="6" class="muted">No runs match these filters.</td></tr>';
    st.log.forEach(e => seenLogIds.add(e.id));
    $('#logCount').textContent = `Showing ${shown.length} of ${rows.length}`;
    $('#logMore').hidden = rows.length <= logLimit;
  }

  // ---------- Digest ----------
  let lastDigestHtml = '';
  let currentDigest = null;
  function renderDigest() {
    const asOf = edition === 'now' ? st.now : O.DIGEST_AT;
    const dg = O.buildDigest(st, asOf);
    currentDigest = dg;
    $('#mailSubject').textContent = dg.subject;
    $('#mailTime').textContent = O.fmtTime(asOf);
    document.querySelectorAll('[data-edition]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.edition === edition)));
    $('#editionNote').textContent = edition === 'now'
      ? `Preview built from everything logged up to ${O.fmtTime(st.now)}. Try a failure on the left and watch it land here.`
      : 'Sent at 6:30 AM. Payment proofing stopped quietly at 7:00, after this went out. The watchdog caught it and texted Ted. Switch to “If sent now” to see tomorrow’s version.';
    $('#mailText').textContent = dg.text;
    if (dg.html !== lastDigestHtml) {
      lastDigestHtml = dg.html;
      const f = $('#mailFrame');
      f.srcdoc = dg.html;
    }
    $('#mailFrame').hidden = plain;
    $('#mailText').hidden = !plain;
    $('#plainBtn').textContent = plain ? 'View as HTML' : 'View as plain text';
    $('#plainBtn').setAttribute('aria-pressed', String(plain));
  }
  function sizeFrame() {
    const f = $('#mailFrame');
    try {
      const doc = f.contentDocument;
      if (doc && doc.body) { f.style.height = '0px'; f.style.height = Math.ceil(doc.documentElement.scrollHeight) + 'px'; }
    } catch (e) { /* cross-origin fallback keeps the default height */ }
  }

  // ---------- Live scenario ----------
  function renderHeld() {
    const total = O.heldTotal(st);
    const box = $('#heldBox');
    box.classList.toggle('has', total > 0);
    const parts = Object.entries(st.held).filter(([, n]) => n > 0).map(([id, n]) => `${O.plural(n, O.byId(id).noun)} from ${O.byId(id).name}`);
    box.innerHTML = `<span>Held items</span> <b>${total}</b> <span>${total ? esc(parts.join(', ')) + '. Kept safe and re-processed on the next good run, never dropped.' : 'Nothing waiting. When a run fails, its work is parked here, not thrown away.'}</span>`;
  }
  function renderSimOptions() {
    const sel = $('#simAuto');
    const cur = sel.value || lastScenario.auto;
    sel.innerHTML = O.AUTOMATIONS.filter(d => d.mode !== 'shadow').map(d => {
      const off = st.broken[d.id] || st.paused[d.id];
      return `<option value="${d.id}"${off ? ' disabled' : ''}>${esc(d.name)}${st.broken[d.id] ? ' (has an open alert)' : st.paused[d.id] ? ' (paused)' : ''}</option>`;
    }).join('');
    const opt = [...sel.options].find(o => o.value === cur && !o.disabled) || [...sel.options].find(o => !o.disabled);
    if (opt) sel.value = opt.value;
  }
  function setRunning(v) {
    running = v;
    $('#replayBtn').disabled = v;
    $('#simBtn').disabled = v;
    document.querySelectorAll('[data-act="fix"], [data-act="pause"]').forEach(b => { b.disabled = v; });
  }
  function steps(states) {
    document.querySelectorAll('#steps li').forEach((li, i) => {
      li.className = states[i] ? 'is-' + states[i] : '';
      li.setAttribute('aria-current', states[i] === 'active' ? 'step' : 'false');
    });
  }
  function say(text) { $('#liveTime').textContent = O.fmtTime(st.now); $('#liveText').textContent = text; }
  function bar(ms) {
    const b = $('#progressBar');
    b.style.transition = 'none'; b.style.width = '0';
    if (!ms) return;
    void b.offsetWidth;
    b.style.transition = `width ${ms}ms linear`; b.style.width = '100%';
  }

  function renderAll() {
    renderStatus(); renderAutos(); renderHeartbeat(); renderAlerts(); renderLog(); renderHeld(); renderSimOptions(); renderDigest();
    if (running) setRunning(true);
  }

  // Move the demo clock to time t over `ms` milliseconds, running other automations on the way.
  async function tickTo(t, ms, token) {
    const start = st.now, frames = Math.max(1, Math.round(ms / 120));
    for (let i = 1; i <= frames; i++) {
      if (token !== runToken) return false;
      const next = Math.round(start + ((t - start) * i) / frames);
      O.advanceTo(st, next);
      $('#clock').textContent = O.fmtTime(st.now);
      await sleep(ms / frames);
    }
    renderAll();
    return token === runToken;
  }
  const realMs = simMin => (reduced ? 500 : 650 + simMin * 170);

  async function runScenario(cfg) {
    if (running) return;
    const d = O.byId(cfg.auto);
    if (!d || st.broken[d.id] || st.paused[d.id]) { toast('Resolve that automation’s open alert first.'); return; }
    lastScenario = cfg;
    const token = ++runToken;
    setRunning(true);
    const f = O.FAILURES[d.id];
    st.lock = d.id;
    steps([]);
    $('#outcomeLabel').textContent = 'Outcome'; $('#outcomeSub').textContent = 'recover or alert';
    const next = O.slots(d, st.now, st.now + 2 * O.DAY)[0];
    say(`Next scheduled run of ${d.name} is at ${O.fmtTime(next)}…`);
    if (!await tickTo(next, reduced ? 300 : 900, token)) return;

    steps(['active']); say(`${d.name} is running…`); bar(0);
    await sleep(reduced ? 200 : 650);
    const firstAt = st.now;
    st.held[d.id] = f.held;
    O.push(st, d.id, { ts: st.now, kind: 'run', result: 'failed', attempt: 1, items: 0, held: f.held, durMs: 30000, error: f.error,
      note: `${f.plain} ${O.plural(f.held, d.noun)} held. Retrying in 1 min.` });
    O.sortLog(st);
    steps(['fail']); renderAll();
    say(`Failed: ${f.error}. ${O.plural(f.held, d.noun)} held, not dropped. Retry 1 in 1 min.`);

    let recovered = false;
    for (let i = 0; i < 3; i++) {
      const delay = O.RETRY_DELAYS[i];
      steps(['fail'].concat(Array(i).fill('fail'), ['active']));
      const ms = realMs(delay);
      bar(ms);
      if (!await tickTo(st.now + delay * MIN, ms, token)) return;
      say(`Retry ${i + 1} of 3 running…`);
      await sleep(reduced ? 150 : 450);
      const succeed = cfg.outcome === 'recover' && i === 1;
      if (succeed) {
        const n = st.held[d.id];
        O.push(st, d.id, { ts: st.now, kind: 'retry', result: 'recovered', attempt: i + 2, items: n, durMs: 9400, note: `Recovered on retry ${i + 1}. Sent ${O.plural(n, d.noun)} that were held` });
        st.held[d.id] = 0; O.sortLog(st);
        recovered = true;
        steps(['fail', 'fail', 'ok', 'skip', 'ok']);
        $('#outcomeLabel').textContent = 'Recovered'; $('#outcomeSub').textContent = 'logged, no one woken';
        say(`Recovered on retry ${i + 1}. ${O.plural(n, d.noun)} sent. Logged it, nobody needed to be texted.`);
        break;
      }
      const last = i === 2;
      O.push(st, d.id, { ts: st.now, kind: 'retry', result: 'failed', attempt: i + 2, items: 0, held: st.held[d.id], durMs: 30000, error: f.error, exhausted: last,
        note: last ? 'Retries used up. Alerting a person.' : `Still failing. Retry ${i + 2} in ${O.RETRY_DELAYS[i + 1]} min.` });
      O.sortLog(st);
      steps(Array(i + 2).fill('fail'));
      renderAll();
      if (!last) say(`Retry ${i + 1} failed (${f.error}). Waiting ${O.RETRY_DELAYS[i + 1]} min before retry ${i + 2}.`);
    }
    bar(0);
    if (!recovered) {
      const held = st.held[d.id];
      const nextTry = O.slots(d, st.now, st.now + 2 * O.DAY)[0];
      const body = `${d.name} failed 4 times since ${O.fmtTime(firstAt)} (${f.error}). ${O.plural(held, d.noun)} held, nothing lost. Suggested: ${f.fix.split('. ')[0]}.`;
      const a = {
        id: 'AL-' + (++st.seq), auto: d.id, kind: 'exhausted', raisedAt: st.now,
        title: `${d.name} failed after 3 retries`,
        summary: `${f.plain} The run and 3 retries over ${Math.round((st.now - firstAt) / MIN)} minutes all failed, so a person needs to look.`,
        context: [['Error', f.error], ['First failure', O.fmtTime(firstAt)], ['Attempts', '4 (1 run, retries after 1, 5 and 15 min)'], ['Next try', `${O.fmtTime(nextTry)} on schedule, with the held items`], ['Platform', d.platform]],
        fix: f.fix, held, notified: O.notifications(d.id, st.now, body, `${d.name} failed after 3 retries`),
      };
      st.alerts.push(a); freshAlerts.add(a.id);
      st.broken[d.id] = 'failing';
      O.push(st, d.id, { ts: st.now, kind: 'alert', result: 'alerted', note: 'Texted Ted and emailed the office with the error, the held items and a suggested fix.' });
      O.sortLog(st);
      steps(['fail', 'fail', 'fail', 'fail', 'alert']);
      $('#outcomeLabel').textContent = 'Person alerted'; $('#outcomeSub').textContent = 'texted + emailed';
      say(`Retries ran out. Texted Ted and emailed the office. ${O.plural(held, d.noun)} stay held until it's fixed.`);
      toast(`Alert sent: ${d.name} needs a person`);
    } else {
      toast(`${d.name} recovered on retry 2`);
    }
    st.lock = null;
    setRunning(false);
    renderAll();
    if (!recovered) { const el = document.querySelector(`[data-alert="${st.alerts[st.alerts.length - 1].id}"]`); if (el && el.getBoundingClientRect().top > innerHeight) el.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'nearest' }); }
  }

  function fixAlert(id) {
    const a = st.alerts.find(x => x.id === id);
    if (!a || running) return;
    O.advanceTo(st, st.now + 2 * MIN);
    O.resolveAlert(st, id, st.now);
    toast('Fixed. Held items re-processed, nothing lost.');
    renderAll();
  }

  // ---------- Toast & copy ----------
  let toastTimer;
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg; t.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 2800);
  }
  async function copyText(text) {
    try { await navigator.clipboard.writeText(text); return true; } catch (e) { /* fall through */ }
    try {
      const ta = document.createElement('textarea'); ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select(); const ok = document.execCommand('copy'); ta.remove(); return ok;
    } catch (e) { return false; }
  }

  // ---------- Events ----------
  $('#logAuto').innerHTML += O.AUTOMATIONS.map(d => `<option value="${d.id}">${esc(d.name)}</option>`).join('');
  $('#logAuto').value = prefs.get('logAuto', 'all');
  $('#logResult').value = prefs.get('logResult', 'work');
  if (!$('#logAuto').value) $('#logAuto').value = 'all';
  if (!$('#logResult').value) $('#logResult').value = 'all';
  $('#logAuto').addEventListener('change', e => { logLimit = 40; prefs.set('logAuto', e.target.value); renderLog(); });
  $('#logResult').addEventListener('change', e => { logLimit = 40; prefs.set('logResult', e.target.value); renderLog(); });
  $('#logMore').addEventListener('click', () => { logLimit += 40; renderLog(); });

  $('#replayBtn').addEventListener('click', () => {
    const cfg = st.broken[lastScenario.auto] ? { auto: 'vendorsync', outcome: 'recover' } : lastScenario;
    if (st.broken[cfg.auto]) { toast('Resolve the open alert first, then replay.'); return; }
    runScenario(cfg);
  });
  $('#simForm').addEventListener('submit', e => { e.preventDefault(); runScenario({ auto: $('#simAuto').value, outcome: $('#simOutcome').value }); });

  document.addEventListener('click', e => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const id = b.dataset.id;
    if (b.dataset.act === 'runs') {
      $('#logAuto').value = id; logLimit = 40; prefs.set('logAuto', id); renderLog();
      $('#log').scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
    } else if (b.dataset.act === 'pause') {
      const d = O.byId(id);
      if (st.paused[id]) {
        delete st.paused[id];
        O.push(st, id, { ts: st.now, kind: 'admin', result: 'admin', note: 'Resumed by Ted. Heartbeat checks are back on.' });
        O.push(st, id, Object.assign({ ts: st.now + 1000, kind: 'run' }, { result: d.mode === 'shadow' ? 'shadow' : 'ok', items: 0, durMs: 4200, note: 'First run after resume, nothing waiting' }));
        toast(`${d.name} resumed`);
      } else {
        st.paused[id] = true;
        O.push(st, id, { ts: st.now, kind: 'admin', result: 'admin', note: 'Paused by Ted. Not running, and the heartbeat check is off until it is resumed.' });
        toast(`${d.name} paused. It shows as paused in the digest too.`);
      }
      O.sortLog(st); renderAll();
    } else if (b.dataset.act === 'ack') {
      const a = st.alerts.find(x => x.id === id); if (a) { a.ackAt = st.now; renderAlerts(); toast('Acknowledged. The office can see Ted has it.'); }
    } else if (b.dataset.act === 'fix') {
      fixAlert(id);
    }
  });

  document.querySelectorAll('[data-edition]').forEach(b => b.addEventListener('click', () => { edition = b.dataset.edition; prefs.set('edition', edition); renderDigest(); }));
  $('#plainBtn').addEventListener('click', () => { plain = !plain; renderDigest(); if (!plain) setTimeout(sizeFrame, 30); });
  $('#copyBtn').addEventListener('click', async () => {
    const ok = await copyText(currentDigest.html);
    toast(ok ? `Copied the email HTML (${Math.round(currentDigest.html.length / 1024)} KB, inline styles, ready for any mail tool)` : 'Copy was blocked by the browser');
  });
  $('#mailFrame').addEventListener('load', sizeFrame);
  let lastW = 0;
  if ('ResizeObserver' in window) new ResizeObserver(es => {
    const w = Math.round(es[0].contentRect.width);
    if (w !== lastW) { lastW = w; requestAnimationFrame(sizeFrame); }
  }).observe($('#mail'));

  // Expose for tests / curious visitors
  window.DigestDemo = { get state() { return st; }, runScenario, fixAlert, get running() { return running; } };

  renderAll();
  say('Ready. Press Replay, or pick an automation and simulate a failure.');
  if (params.get('autoplay') !== '0') setTimeout(() => runScenario({ auto: 'vendorsync', outcome: 'recover' }), 1400);
})();
