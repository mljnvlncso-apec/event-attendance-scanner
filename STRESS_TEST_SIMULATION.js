'use strict';

/**
 * Local model-based stress tests for the APEC Gala attendance commit rules.
 *
 * IMPORTANT: This is not a live Google Apps Script / Google Sheets test. It
 * simulates the critical ScriptLock + Registration-ID idempotency contract so
 * regressions in the intended behavior can be caught before staging tests.
 * The live multi-device plan is in LIVE_DEVICE_TEST_PLAN.md.
 */
const assert = require('node:assert/strict');

class AttendanceModel {
  constructor() {
    this.rows = new Map();
    this.ticketCounter = 0;
    this.lockTail = Promise.resolve();
    this.busyResponses = 0;
  }

  async acquireLock() {
    let release;
    const gate = new Promise(resolve => { release = resolve; });
    const previous = this.lockTail;
    this.lockTail = previous.then(() => gate);
    await previous;
    return release;
  }

  async checkIn({ registrationId, type = 'CONTRACTOR', companions = [], loseResponse = false }) {
    if (this.busyResponses > 0) {
      this.busyResponses -= 1;
      return { status: 'BUSY', retryable: true };
    }
    const release = await this.acquireLock();
    try {
      const existing = this.rows.get(registrationId);
      if (existing) {
        return {
          status: 'ALREADY_CHECKED_IN',
          registrationId,
          companions: existing.companions.slice(),
          raffleTicketNumber: existing.raffleTicketNumber || ''
        };
      }
      const raffleTicketNumber = type === 'COMMITTEE'
        ? ''
        : String(++this.ticketCounter).padStart(4, '0');
      const row = {
        registrationId,
        type,
        companions: companions.slice(),
        raffleTicketNumber,
        committedAt: new Date().toISOString()
      };
      this.rows.set(registrationId, row);
      if (loseResponse) throw new Error('Simulated response loss after server commit');
      return { status: 'SUCCESS', ...row };
    } finally {
      release();
    }
  }
}

function classifyOfflineResult(queueItem, result) {
  const status = String(result && result.status || 'ERROR').toUpperCase();
  if (status === 'SUCCESS') return 'RESOLVED';
  if (status === 'ALREADY_CHECKED_IN') {
    const a = (queueItem.companions || []).map(x => String(x).trim().toLowerCase()).sort();
    const b = (result.companions || []).map(x => String(x).trim().toLowerCase()).sort();
    return a.length === b.length && a.every((x, i) => x === b[i]) ? 'RESOLVED' : 'NEEDS_REVIEW';
  }
  if (['BUSY', 'TEMPORARY_ERROR', 'TIMEOUT', 'SYSTEM_ERROR'].includes(status)) return 'PENDING';
  return 'NEEDS_REVIEW';
}

function batches(items, size = 25) {
  const out = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

async function main() {
  const report = [];

  // Case 1: eight devices scan the same contractor QR simultaneously.
  {
    const model = new AttendanceModel();
    const attempts = await Promise.all(Array.from({ length: 8 }, (_, i) =>
      model.checkIn({ registrationId: 'CONTRACTOR-DUP-001', companions: ['Companion A'] })
    ));
    assert.equal(model.rows.size, 1);
    assert.equal(attempts.filter(x => x.status === 'SUCCESS').length, 1);
    assert.equal(attempts.filter(x => x.status === 'ALREADY_CHECKED_IN').length, 7);
    assert.equal(model.rows.get('CONTRACTOR-DUP-001').raffleTicketNumber, '0001');
    report.push('PASS — 8 concurrent duplicate scans produce exactly 1 Attendance row and 1 raffle ticket');
  }

  // Case 2: eight devices process different registrations concurrently.
  {
    const model = new AttendanceModel();
    const jobs = Array.from({ length: 8 }, (_, device) =>
      Array.from({ length: 20 }, (_, n) => model.checkIn({
        registrationId: `DEVICE-${device + 1}-REG-${n + 1}`,
        companions: n % 3 ? [] : ['Named Companion']
      }))
    ).flat();
    const results = await Promise.all(jobs);
    assert.equal(results.filter(x => x.status === 'SUCCESS').length, 160);
    assert.equal(model.rows.size, 160);
    assert.equal(new Set([...model.rows.keys()]).size, 160);
    assert.equal(model.ticketCounter, 160);
    report.push('PASS — 8 simulated devices × 20 distinct registrations produce 160 unique rows and 160 unique contractor tickets');
  }

  // Case 3: committee members must not consume contractor raffle tickets.
  {
    const model = new AttendanceModel();
    await model.checkIn({ registrationId: 'COMMITTEE-001', type: 'COMMITTEE' });
    await model.checkIn({ registrationId: 'CONTRACTOR-001', type: 'CONTRACTOR' });
    assert.equal(model.rows.get('COMMITTEE-001').raffleTicketNumber, '');
    assert.equal(model.rows.get('CONTRACTOR-001').raffleTicketNumber, '0001');
    assert.equal(model.ticketCounter, 1);
    report.push('PASS — committee Attendance receives no raffle ticket and does not advance contractor ticket counter');
  }

  // Case 4: response is lost after the server commits; reconciliation is idempotent.
  {
    const model = new AttendanceModel();
    const queueItem = { registrationId: 'LOST-RESPONSE-001', companions: ['A', 'B'] };
    let localStatus = 'PENDING';
    await assert.rejects(() => model.checkIn({
      registrationId: queueItem.registrationId,
      companions: queueItem.companions,
      loseResponse: true
    }), /response loss/);
    assert.equal(model.rows.size, 1);
    const retry = await model.checkIn({ registrationId: queueItem.registrationId, companions: queueItem.companions });
    assert.equal(retry.status, 'ALREADY_CHECKED_IN');
    localStatus = classifyOfflineResult(queueItem, retry);
    assert.equal(localStatus, 'RESOLVED');
    assert.equal(model.rows.size, 1);
    report.push('PASS — lost response after commit resolves as ALREADY_CHECKED_IN on retry without a duplicate row');
  }

  // Case 5: a queue whose companions differ from the server's existing group is not silently cleared.
  {
    const model = new AttendanceModel();
    await model.checkIn({ registrationId: 'MISMATCH-001', companions: ['Existing Companion'] });
    const queueItem = { registrationId: 'MISMATCH-001', companions: ['Different Companion'] };
    const retry = await model.checkIn({ registrationId: queueItem.registrationId, companions: queueItem.companions });
    assert.equal(classifyOfflineResult(queueItem, retry), 'NEEDS_REVIEW');
    assert.equal(model.rows.size, 1);
    report.push('PASS — ALREADY_CHECKED_IN with different companions is routed to NEEDS_REVIEW');
  }

  // Case 6: transient lock contention leaves the local queue retryable.
  {
    const model = new AttendanceModel();
    model.busyResponses = 2;
    const queueItem = { registrationId: 'BUSY-001', companions: [] };
    let result = await model.checkIn(queueItem);
    assert.equal(classifyOfflineResult(queueItem, result), 'PENDING');
    result = await model.checkIn(queueItem);
    assert.equal(classifyOfflineResult(queueItem, result), 'PENDING');
    result = await model.checkIn(queueItem);
    assert.equal(classifyOfflineResult(queueItem, result), 'RESOLVED');
    assert.equal(model.rows.size, 1);
    report.push('PASS — two simulated BUSY responses retain a retryable queue; the next retry commits exactly once');
  }

  // Case 7: reconciliation batches respect the server's 25-row limit.
  {
    const input = Array.from({ length: 27 }, (_, i) => ({ registrationId: `BATCH-${i + 1}` }));
    const grouped = batches(input, 25);
    assert.deepEqual(grouped.map(x => x.length), [25, 2]);
    report.push('PASS — 27 queued records are sent as batches of 25 and 2');
  }

  // Case 8: duplicate queue IDs in one request must be rejected by the backend.
  {
    const ids = ['Q-1', 'Q-2', 'Q-1'];
    const seen = new Set();
    const accepted = ids.map(id => {
      if (seen.has(id)) return false;
      seen.add(id); return true;
    });
    assert.deepEqual(accepted, [true, true, false]);
    report.push('PASS — repeated queue IDs in one reconciliation batch are detected');
  }

  console.log('APEC GALA LOCAL STRESS SIMULATION');
  console.log('NOTE: Model-based simulation only; not a live Apps Script / Sheets test.');
  for (const line of report) console.log(line);
  console.log(`RESULT: ${report.length}/${report.length} model checks passed`);
}

main().catch(err => { console.error(err); process.exitCode = 1; });
