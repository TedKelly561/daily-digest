// Node tests for the M2 engine. Run from the project folder:  node tests/ops.test.js
// No test framework needed. Exits with code 1 on the first failure.
// Runs as if "today" were Mon Nov 2 2026 in New York: the day after the clocks went back,
// so "yesterday" was 25 hours long.
'use strict';
process.env.TZ = 'America/New_York';
const RealDate = Date;
const FAKE_NOW = +new RealDate(2026, 10, 2, 12, 0);
global.Date = class extends RealDate {
  constructor(...a) { if (a.length) super(...a); else super(FAKE_NOW); }
  static now() { return FAKE_NOW; }
};
global.window = global;
require('../shared/data.js');
const O = require('../ops.js');

let passed = 0;
function ok(cond, msg) {
  if (!cond) { console.error('  FAIL -', msg); process.exit(1); }
  passed++; console.log('  ok -', msg);
}
const section = s => console.log('\n' + s);
const ymd = t => { const d = new Date(t); return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate(); };

section('Dates across a DST change');
{
  const S = window.SUMMIT;
  const job = id => S.jobs.find(j => j.id === id);
  ok(ymd(job('SH-1049').createdAt) === 20261101, 'a job created "yesterday" lands on Nov 1, not Oct 31');
  ok(ymd(job('SH-1051').scheduledStart) === 20261103, 'a job booked "tomorrow" lands on Nov 3, not today');
}

section('Yesterday in numbers');
{
  const st = O.createState();
  const D = O.buildDigest(st, O.DIGEST_AT).data;
  const NOTICE = { heartbeat: 1, alert: 1, admin: 1 };
  const want = st.log.filter(e => ymd(e.ts) === 20261101 && !NOTICE[e.kind]).length;
  ok(want > 0, 'the log has runs on Nov 1');
  ok(D.yesterday.runs === want, `yesterday counts every run of the 25-hour day (${D.yesterday.runs} of ${want})`);
  const firstHour = st.log.filter(e => ymd(e.ts) === 20261101 && new Date(e.ts).getHours() === 0).length;
  ok(firstHour > 0, 'there are runs between midnight and 1 AM on Nov 1');
}

console.log(`\n${passed} passed`);
