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

    /* Applications carrying rate requests. Real ones are the tracking links the onboarding
       page stored on submit; the seeded pair stands in for applications that were already
       sitting with the Rate Approval desk before this demo started. */
    const SEEDED = [
      {
        id: 'APP-00000001', leadId: 'L-001', biz: 'Cairo Fresh Market', actor: 'Mostafa Khaled',
        ts: '2026-09-06T14:20:00.000Z',
        summary: {
          email: 'ops@cairofresh.eg', phone: '+20 100 123 4567',
          entity: 'Registered Business', industry: 'Retail & E-commerce',
          services: ['Online Card'], serviceConfigs: [{ service: 'Online Card', configs: [{ bank: 'Bank Misr', module: 'PSP' }] }],
          posTerminals: '', docsDone: '6', docsTotal: '6',
        },
        requests: [
          { id: 'Online Card::Bank Misr::national-onus', service: 'Online Card', bank: 'Bank Misr',
            rate: 'National — On-us rate', tier: 'manager', from: 1, to: 1.5, requested: 1.2, standard: 1.5, requestedFee: 1, standardFee: 2,
            note: 'Processes 450K EGP/month across 3 branches — matching the rate their current provider quoted.' },
        ],
      },
      {
        id: 'APP-00000007', leadId: 'L-007', biz: 'Mansoura Tech Studio', actor: 'Mostafa Khaled',
        ts: '2026-09-05T11:00:00.000Z',
        summary: {
          email: 'karim@mansouratech.eg', phone: '+20 122 998 7766',
          entity: 'Registered Business', industry: 'Software & SaaS',
          services: ['Online Card'], serviceConfigs: [{ service: 'Online Card', configs: [{ bank: 'QNB', module: 'PF' }] }],
          posTerminals: '', docsDone: '7', docsTotal: '7',
        },
        requests: [
          { id: 'Online Card::QNB::national-offus', service: 'Online Card', bank: 'QNB',
            rate: 'National — Off-us rate', tier: 'head', from: 1, to: 1.5, requested: 0.9, standard: 2, requestedFee: 2, standardFee: 2,
            note: 'Subscription product on thin margins — Karim negotiated this rate before signing.' },
          { id: 'Online Card::QNB::intl', service: 'Online Card', bank: 'QNB',
            rate: 'International rate', tier: 'manager', from: 2, to: 2.5, requested: 2.2, standard: 2.5, requestedFee: 1.5, standardFee: 2,
            note: 'Half their volume is international clients paying in USD.' },
        ],
      },
    ];

    /* The seeded applications have no stored tracking link, so rebuild the one the lead page
       would hand out — that is what Review opens, and where the decision is actually made. */
    function seededURL(a) {
      const s = a.summary;
      const qs = new URLSearchParams({
        id: a.id, leadId: a.leadId, biz: a.biz, actor: a.actor, ts: a.ts,
        email: s.email, phone: s.phone, entity: s.entity, industry: s.industry,
        services: s.services.join(','),
        serviceConfigs: JSON.stringify(s.serviceConfigs),
        pricingRequests: JSON.stringify(a.requests),
        total: s.docsTotal, done: s.docsDone,
        needsApproval: a.requests.length, status: 'pending-rate-approval',
      });
      return 'application-status.html?' + qs.toString();
    }

    function loadApplications() {
      const apps = [];
      const stored = readStore('kashierLeadApplications');
      const seenLeads = new Set();
      Object.entries(stored).forEach(([leadId, url]) => {
        const qs = new URLSearchParams(String(url).split('?')[1] || '');
        let requests = [];
        try { requests = JSON.parse(qs.get('pricingRequests') || '[]'); } catch (e) { requests = []; }
        if (!requests.length) return;
        seenLeads.add(leadId);
        let serviceConfigs = [];
        try { serviceConfigs = JSON.parse(qs.get('serviceConfigs') || '[]'); } catch (e) { serviceConfigs = []; }
        apps.push({
          id: qs.get('id') || '—', leadId, url,
          biz: qs.get('biz') || 'Untitled Application',
          actor: qs.get('actor') || 'Unknown',
          ts: qs.get('ts') || new Date().toISOString(),
          requests,
          // Everything the drawer shows about the application behind the request.
          summary: {
            email: qs.get('email') || '', phone: qs.get('phone') || '',
            entity: qs.get('entity') || '', industry: qs.get('industry') || '',
            services: (qs.get('services') || '').split(',').filter(Boolean),
            serviceConfigs,
            posTerminals: qs.get('posTerminals') || '',
            docsDone: qs.get('done') || '0', docsTotal: qs.get('total') || '0',
          },
        });
      });
      SEEDED.forEach(a => {
        if (seenLeads.has(a.leadId)) return;
        apps.push(Object.assign({}, a, { url: seededURL(a) }));
      });
      return apps;
    }

    /* Look up one request and the application it belongs to. */
    function findRequest(appId, reqId) {
      const app = loadApplications().filter(a => a.id === appId)[0];
      if (!app) return null;
      const req = app.requests.filter(r => r.id === reqId)[0];
      return req ? { app: app, req: req } : null;
    }

  return {
    ROLES: ROLES, TIER_LABEL: TIER_LABEL, TIER_OWNER: TIER_OWNER,
    readStore: readStore, writeStore: writeStore,
    getRole: getRole, setRole: setRole,
    decisionsFor: decisionsFor, canRoleAct: canRoleAct,
    statusFor: statusFor, recordDecision: recordDecision,
    loadApplications: loadApplications, findRequest: findRequest,
  };
})();
