'use strict';
const fs = require('fs');
const path = require('path');
const root = __dirname;
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
let passed = 0;
function check(name, condition) {
  if (!condition) throw new Error('FAIL — ' + name);
  passed++;
  process.stdout.write('PASS — ' + name + '\n');
}
const code = read('Code.gs');
const scanner = read('Scanner.html');
const webScanner = read('index.html');
const admin = read('Admin.html');
const serviceWorker = read('sw.js');

check('Apps Script and GitHub scanner bridge versions both set to 15', /SCANNER_BRIDGE_VERSION\s*=\s*'15'/.test(scanner) && /BRIDGE_VERSION\s*=\s*'15'/.test(webScanner));
check('P1 has all four operator lane choices', ['ALL','CONTRACTOR','COMMITTEE','ASSISTANCE'].every(x => webScanner.includes('data-lane="' + x + '"')));
check('P1 blocks wrong-lane online QR before rendering the confirmation form', /if\(!laneMatches\(response\)\)\{setResult\('warning','WRONG ENTRANCE LANE'/.test(webScanner) && webScanner.indexOf("if(!laneMatches(response))") < webScanner.indexOf("renderRegistrant(response,'ONLINE','QR')"));
check('P1 blocks wrong-lane offline QR before rendering the confirmation form', /if\(!laneMatches\(record\)\)\{setResult\('warning','WRONG ENTRANCE LANE'/.test(webScanner));
check('P1 manual search is role-filtered and assistance opens the manual fallback', webScanner.includes('results=results.filter(r=>laneMatches(r))') && webScanner.includes("if(laneMode==='ASSISTANCE'){byId('manualFallback').open=true"));
check('Committee express flow keeps companion entry suppressed when allocation is zero', /companionInputSection'\)\.style\.display=max>0\?'block':'none'/.test(webScanner) && webScanner.includes("(isCommittee?'CONFIRM COMMITTEE CHECK-IN'"));
check('P2 heartbeat endpoint requires a signed scanner session', /function recordScannerDeviceHeartbeat\(payload, staffToken\)[\s\S]*?const actor = requireStaff_\(staffToken\)/.test(code));
check('P2 bridge routes heartbeat using the in-memory scanner token', /recordScannerDeviceHeartbeat\(payload, scannerToken\)/.test(scanner));
check('P2 scanner sends periodic device heartbeat', webScanner.includes('setInterval(sendDeviceHeartbeat,45000)') && webScanner.includes('navigator.onLine===true'));
check('P2 device registry is bounded', code.includes('EA_SCANNER_DEVICE_MAX = 30') && /while \(ids\.length > EA_SCANNER_DEVICE_MAX\)/.test(code));
check('P2 device health Admin panel is wired to the backend endpoint', admin.includes('adminGetScannerDeviceHealth()') && code.includes('function adminGetScannerDeviceHealth('));
check('P2 device heartbeat reports queue/roster state without contact or medical fields', /queuePending:[\s\S]*?queueReview:[\s\S]*?rosterCount:[\s\S]*?rosterGeneratedAt:/.test(webScanner) && !/medicalConditions|foodAllergies|contactNumber/.test(webScanner.slice(webScanner.indexOf('async function sendDeviceHeartbeat'), webScanner.indexOf('function scheduleDeviceHeartbeat'))));
check('P3 analytics has 15-minute arrival buckets and peak arrival window', code.includes('arrivalsBy15Minutes: buckets') && code.includes('peak15MinuteWindow: peak'));
check('P3 no-shows use the event close in Asia/Manila and remain zero beforehand', code.includes("Utilities.parseDate('2026-12-19 23:59:59', 'Asia/Manila'") && code.includes("Utilities.parseDate(text, 'Asia/Manila'") && code.includes('const noShowContractors = eventClosed ? pendingContractors : 0'));
check('P3 analytics CSV export and audit action aggregation are present', admin.includes('function exportPostEventAnalytics()') && code.includes('auditActions: Object.keys(auditActions)'));
check('P3 archive ZIP includes source sheets, analytics JSON and manifest', ['Registrations','Attendance','Companions','Audit Log','Not Attending','Invited_MasterList','Shuttle_Sites','Shuttle_Marshals'].every(x => code.includes("'"+x+"'")) && code.includes('Post_Event_Analytics.json') && code.includes('MANIFEST.json'));
check('P3 archive folder rejects non-private general sharing', code.includes('existing.getSharingAccess()') && code.includes('DriveApp.Access.PRIVATE'));
check('P3 archive does not grant public Drive sharing', !/setSharing\(DriveApp\.Access\.ANYONE/.test(code) && !/setSharing\(DriveApp\.Access\.ANYONE_WITH_LINK/.test(code));
check('Service worker cache invalidates previous scanner shell', serviceWorker.includes("apec-gala-scanner-shell-v15"));
check('Open Admin remains no-PIN/no-login and existing scanner auth remains separate', code.includes("function requireAdmin_(_legacyToken)") && code.includes('function requireStaff_(token)') && code.includes('validateSignedScannerToken_(key)'));
check('V13 original CSV mapping and seat fallback remain intact', code.includes("'ATTENDEES NAME'") && code.includes("'TABLE #'") && code.includes("'PROJECTION COUNT'") && code.includes("'INITIAL COUNT'"));
check('V14.3 pickup-site and marshal directories remain integrated', code.includes('Shuttle_Sites') && code.includes('Shuttle_Marshals') && code.includes('Marshal Contact Number'));
check('V14.4 bilingual contractor form translations remain present', read('RegisterForm.html').includes('label-translation') && read('RegisterForm.html').includes('Primary Representative / Invited Attendee'));
check('Committee Pass and separate RSVP route remain in the V14.4 baseline', read('CommitteeForm.html').includes('COMMITTEE PASS') && code.includes("committee: { file: 'CommitteeForm'"));

console.log('RESULT: ' + passed + '/24 V15 static acceptance checks passed.');
