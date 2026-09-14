/* Shared rate-approval rules, used by the Rate Approvals queue and the application page
   so both agree on who may sign off and what a decision does to the application.

   Rates between the Manager and Standard rate are a Pricing Manager's call; anything under
   the Manager rate needs the Head of Sales, who can also cover the Manager band. */
window.KashierRates = (function () {
  const ROLES = {
    sales:   { label: 'Salesperson',     name: 'Aya Muhammed', initials: 'AM', approves: [] },
    manager: { label: 'Pricing Manager', name: 'Nadia Salah',  initials: 'NS', approves: ['manager'] },
    head:    { label: 'Head of Sales',   name: 'Tarek Fahmy',  initials: 'TF', approves: ['manager', 'head'] },
  };
  const TIER_LABEL = { manager: 'Manager approval', head: 'Head approval' };
  const TIER_OWNER = { manager: 'Pricing Manager', head: 'Head of Sales' };

  function readStore(key) {
    try { return JSON.parse(localStorage.getItem(key) || '{}'); } catch (e) { return {}; }
  }
  function writeStore(key, obj) {
    try { localStorage.setItem(key, JSON.stringify(obj)); } catch (e) { /* storage unavailable */ }
  }

  function getRole() {
    try {
      const saved = localStorage.getItem('kashierDemoRole');
      if (saved && ROLES[saved]) return saved;
    } catch (e) { /* storage unavailable */ }
    return 'sales';
  }
  function setRole(role) {
    if (!ROLES[role]) return;
    try { localStorage.setItem('kashierDemoRole', role); } catch (e) { /* storage unavailable */ }
  }

  function decisionsFor(appId) { return readStore('kashierRateDecisions')[appId] || {}; }
  function canRoleAct(role, tier) { return ROLES[role].approves.indexOf(tier) !== -1; }

  /* Where the application sits once a decision lands: any rejection sends it back to the
     salesperson, a clean sweep pushes it on to Onboarding Review. */
  function statusFor(requests, decisions) {
    const rejected = requests.filter(r => decisions[r.id] && decisions[r.id].decision === 'rejected');
    const pending = requests.filter(r => !decisions[r.id]);
    if (rejected.length) return 'returned-to-sales';
    if (!pending.length) return 'pending-onboarding-review';
    return 'pending-rate-approval';
  }
  const LEAD_STATUS = {
    'returned-to-sales': 'application',
    'pending-onboarding-review': 'onboarding-review',
    'pending-rate-approval': 'rate-approval',
  };

  /* Record one decision and carry the consequence through to the application and its lead. */
  function recordDecision(opts) {
    const app = opts.app, role = opts.role;
    const req = app.requests.filter(r => r.id === opts.reqId)[0];
    if (!req || !canRoleAct(role, req.tier)) return null;

    const all = readStore('kashierRateDecisions');
    const decisions = all[app.id] || {};
    decisions[opts.reqId] = {
      decision: opts.decision,
      reason: opts.reason || '',
      by: ROLES[role].name,
      roleLabel: ROLES[role].label,
      ts: new Date().toISOString(),
    };
    all[app.id] = decisions;
    writeStore('kashierRateDecisions', all);

    const status = statusFor(app.requests, decisions);
    const statuses = readStore('kashierAppStatus');
    statuses[app.id] = status;
    writeStore('kashierAppStatus', statuses);

    if (app.leadId) {
      const leadStatuses = readStore('kashierLeadStatusOverrides');
      leadStatuses[app.leadId] = LEAD_STATUS[status];
      writeStore('kashierLeadStatusOverrides', leadStatuses);

      // Leave a trail on the lead so the salesperson sees why it came back.
      const rejected = app.requests.filter(r => decisions[r.id] && decisions[r.id].decision === 'rejected');
      const notes = readStore('kashierLeadReturnNote');
      if (rejected.length) {
        notes[app.leadId] = {
          ts: new Date().toISOString(),
          text: rejected.map(r => {
            const d = decisions[r.id];
            return [r.service, r.bank].filter(Boolean).join(' · ') + ' — ' + r.rate + ' rejected by ' + d.by + ': ' + d.reason;
          }).join(' | '),
        };
      } else {
        delete notes[app.leadId];
      }
      writeStore('kashierLeadReturnNote', notes);
    }
    return { status: status, request: req };
  }

  return {
    ROLES: ROLES, TIER_LABEL: TIER_LABEL, TIER_OWNER: TIER_OWNER,
    readStore: readStore, writeStore: writeStore,
    getRole: getRole, setRole: setRole,
    decisionsFor: decisionsFor, canRoleAct: canRoleAct,
    statusFor: statusFor, recordDecision: recordDecision,
  };
})();
