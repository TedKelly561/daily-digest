// Shared demo data for the Service Business Toolkit.
// Summit Home Services is a FICTIONAL company. Every person, company, address,
// phone number and claim number below is made up for demonstration only.
// Dates are generated relative to "today" so the demos always look current.

(function () {
  const DAY = 86400000;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = (offsetDays, hour = 9, minute = 0) => {
    const t = new Date(today.getTime() + offsetDays * DAY);
    t.setHours(hour, minute, 0, 0);
    return t.toISOString();
  };

  const company = {
    name: 'Summit Home Services',
    tagline: 'HVAC · Plumbing · Appliance Repair',
    phone: '(555) 010-4400',
    email: 'office@summit-home.example',
    address: '200 Industrial Way, Suite 4',
    taxRate: 0.0825,
    laborRate: 125,       // per hour, standard
    afterHoursRate: 185,  // per hour, nights & weekends
    tripCharge: 89,
    partsMarkup: 0.45,    // 45% over cost
    fictional: true,
  };

  const techs = [
    { id: 'T1', name: 'Marcus Reyes',  initials: 'MR', trade: 'HVAC',      color: '#2563eb', phone: '(555) 010-4411' },
    { id: 'T2', name: 'Dana Whitfield', initials: 'DW', trade: 'Plumbing',  color: '#0f7a5c', phone: '(555) 010-4412' },
    { id: 'T3', name: 'Luis Ortega',   initials: 'LO', trade: 'Appliance', color: '#c2410c', phone: '(555) 010-4413' },
    { id: 'T4', name: 'Priya Nair',    initials: 'PN', trade: 'HVAC',      color: '#7c3aed', phone: '(555) 010-4414' },
    { id: 'T5', name: 'Jake Morrow',   initials: 'JM', trade: 'Appliance', color: '#be185d', phone: '(555) 010-4415' },
  ];

  // Fictional warranty / partner companies that send work orders.
  const vendors = [
    { id: 'V1', name: 'Northstar Home Warranty', short: 'Northstar', claimPrefix: 'NS-', firstCallHours: 24, payTerms: 'Net 30' },
    { id: 'V2', name: 'Bluepeak Protection Plans', short: 'Bluepeak', claimPrefix: 'BP',  firstCallHours: 48, payTerms: 'Net 45' },
    { id: 'V3', name: 'Harbor Appliance Care', short: 'Harbor', claimPrefix: 'HAC-', firstCallHours: 24, payTerms: 'Net 30' },
    { id: 'V0', name: 'Direct customer', short: 'Direct', claimPrefix: '', firstCallHours: 4, payTerms: 'Due on completion' },
  ];

  const customers = [
    { id: 'C01', name: 'Alicia Moreno',    phone: '(555) 013-2201', address: '1420 Maple Ave',      zip: '80011' },
    { id: 'C02', name: 'Brian Okafor',     phone: '(555) 013-2202', address: '88 Juniper Ct',        zip: '80012' },
    { id: 'C03', name: 'Carla Jensen',     phone: '(555) 013-2203', address: '3107 Ridge Rd',        zip: '80014' },
    { id: 'C04', name: 'Derek Huang',      phone: '(555) 013-2204', address: '45 Willow Bend',       zip: '80011' },
    { id: 'C05', name: 'Elena Petrova',    phone: '(555) 013-2205', address: '920 Aspen Way',        zip: '80015' },
    { id: 'C06', name: 'Frank DeLuca',     phone: '(555) 013-2206', address: '17 Harbor View Dr',    zip: '80016' },
    { id: 'C07', name: 'Grace Whitman',    phone: '(555) 013-2207', address: '2290 Elm St, Apt 3B',  zip: '80012' },
    { id: 'C08', name: 'Hector Salinas',   phone: '(555) 013-2208', address: '611 Cedar Loop',       zip: '80013' },
    { id: 'C09', name: 'Irene Castillo',   phone: '(555) 013-2209', address: '74 Birch Hollow',      zip: '80014' },
    { id: 'C10', name: 'James Thornton',   phone: '(555) 013-2210', address: '1501 Summit Pkwy',     zip: '80016' },
    { id: 'C11', name: 'Kara Lindqvist',   phone: '(555) 013-2211', address: '39 Meadowlark Ln',     zip: '80015' },
    { id: 'C12', name: 'Leon Mbeki',       phone: '(555) 013-2212', address: '808 Quarry St',        zip: '80011' },
    { id: 'C13', name: 'Maria Gonzalez',   phone: '(555) 013-2213', address: '2716 Pine Crest Dr',   zip: '80013' },
    { id: 'C14', name: 'Nate Abernathy',   phone: '(555) 013-2214', address: '5 Foxglove Pl',        zip: '80012' },
    { id: 'C15', name: 'Olivia Brennan',   phone: '(555) 013-2215', address: '1188 Riverbend Rd',    zip: '80014' },
    { id: 'C16', name: 'Paul Szymanski',   phone: '(555) 013-2216', address: '430 Granite Ave',      zip: '80016' },
    { id: 'C17', name: 'Quinn Harper',     phone: '(555) 013-2217', address: '96 Sagebrush Trl',     zip: '80015' },
    { id: 'C18', name: 'Rosa Delgado',     phone: '(555) 013-2218', address: '2045 Lakeview Ter',    zip: '80011' },
    { id: 'C19', name: 'Sam Whitaker',     phone: '(555) 013-2219', address: '312 Copper Canyon Rd', zip: '80013' },
    { id: 'C20', name: 'Tanya Kowalski',   phone: '(555) 013-2220', address: '67 Orchard Hill',      zip: '80012' },
  ];

  // Price book: what a quote is built from. cost = what Summit pays; price = cost * (1 + markup).
  const priceBook = [
    { sku: 'LAB-STD',   type: 'labor', name: 'Labor (standard rate)',        unit: 'hr',  price: 125 },
    { sku: 'LAB-AH',    type: 'labor', name: 'Labor (after hours)',          unit: 'hr',  price: 185 },
    { sku: 'TRIP',      type: 'fee',   name: 'Trip / diagnostic charge',     unit: 'ea',  price: 89 },
    { sku: 'HV-CAP45',  type: 'part',  name: 'Dual run capacitor 45/5 µF',   unit: 'ea',  cost: 18,  trade: 'HVAC' },
    { sku: 'HV-CONT',   type: 'part',  name: 'Contactor, 2-pole 30A',         unit: 'ea',  cost: 22,  trade: 'HVAC' },
    { sku: 'HV-FMOT',   type: 'part',  name: 'Condenser fan motor 1/4 HP',    unit: 'ea',  cost: 145, trade: 'HVAC' },
    { sku: 'HV-IGN',    type: 'part',  name: 'Furnace hot surface igniter',   unit: 'ea',  cost: 38,  trade: 'HVAC' },
    { sku: 'HV-FLAME',  type: 'part',  name: 'Flame sensor',                  unit: 'ea',  cost: 15,  trade: 'HVAC' },
    { sku: 'HV-R410',   type: 'part',  name: 'R-410A refrigerant',            unit: 'lb',  cost: 28,  trade: 'HVAC' },
    { sku: 'HV-FILT',   type: 'part',  name: 'Pleated filter 16x25x1 (MERV 11)', unit: 'ea', cost: 9, trade: 'HVAC' },
    { sku: 'PL-WH50',   type: 'part',  name: '50 gal gas water heater',       unit: 'ea',  cost: 780, trade: 'Plumbing' },
    { sku: 'PL-TPR',    type: 'part',  name: 'T&P relief valve',              unit: 'ea',  cost: 16,  trade: 'Plumbing' },
    { sku: 'PL-WAXR',   type: 'part',  name: 'Toilet wax ring & bolts kit',   unit: 'ea',  cost: 8,   trade: 'Plumbing' },
    { sku: 'PL-FILL',   type: 'part',  name: 'Toilet fill valve',             unit: 'ea',  cost: 14,  trade: 'Plumbing' },
    { sku: 'PL-DISP',   type: 'part',  name: 'Garbage disposal 3/4 HP',       unit: 'ea',  cost: 165, trade: 'Plumbing' },
    { sku: 'PL-PEX',    type: 'part',  name: 'PEX fittings & pipe (repair)',  unit: 'set', cost: 24,  trade: 'Plumbing' },
    { sku: 'AP-DRPUMP', type: 'part',  name: 'Washer drain pump',             unit: 'ea',  cost: 62,  trade: 'Appliance' },
    { sku: 'AP-IGNB',   type: 'part',  name: 'Oven bake igniter',             unit: 'ea',  cost: 48,  trade: 'Appliance' },
    { sku: 'AP-DEFRST', type: 'part',  name: 'Refrigerator defrost heater',   unit: 'ea',  cost: 41,  trade: 'Appliance' },
    { sku: 'AP-ICEMK',  type: 'part',  name: 'Ice maker assembly',            unit: 'ea',  cost: 118, trade: 'Appliance' },
    { sku: 'AP-DWPUMP', type: 'part',  name: 'Dishwasher circulation pump',   unit: 'ea',  cost: 96,  trade: 'Appliance' },
    { sku: 'AP-BELT',   type: 'part',  name: 'Dryer drum belt & idler kit',   unit: 'ea',  cost: 27,  trade: 'Appliance' },
  ].map(p => (p.type === 'part' ? { ...p, price: Math.round(p.cost * (1 + company.partsMarkup) * 100) / 100 } : p));

  // Job statuses, in workflow order.
  const statuses = ['new', 'scheduled', 'en_route', 'in_progress', 'waiting_parts', 'completed', 'invoiced'];
  const statusLabels = {
    new: 'New', scheduled: 'Scheduled', en_route: 'En route', in_progress: 'In progress',
    waiting_parts: 'Waiting on parts', completed: 'Completed', invoiced: 'Invoiced',
  };

  // Jobs. createdAt/firstCallAt/scheduledStart are relative to today.
  // firstCallAt: null means the tech hasn't called the customer yet.
  const J = (id, customer, vendor, trade, issue, status, o) => ({
    id, customerId: customer, vendorId: vendor, trade, issue, status,
    claim: o.claim || null, priority: o.priority || 'normal', techId: o.tech || null,
    createdAt: o.created, firstCallAt: o.firstCall ?? null,
    scheduledStart: o.start || null, durationHrs: o.hrs || 2,
    revenue: o.rev || 0, completedAt: o.done || null, callback: !!o.callback,
  });

  const jobs = [
    J('SH-1041', 'C01', 'V1', 'HVAC',      'AC blowing warm air, outdoor unit humming', 'scheduled',     { claim: 'NS-448213', tech: 'T1', created: d(-1, 8), firstCall: d(-1, 10), start: d(0, 8), hrs: 2, priority: 'high' }),
    J('SH-1042', 'C02', 'V0', 'Plumbing',  'Water heater leaking from bottom',          'scheduled',     { tech: 'T2', created: d(-1, 15), firstCall: d(-1, 15, 40), start: d(0, 9), hrs: 3, priority: 'high' }),
    J('SH-1043', 'C03', 'V3', 'Appliance', 'Washer not draining, error code 5E',        'scheduled',     { claim: 'HAC-77102', tech: 'T3', created: d(-2, 11), firstCall: d(-2, 16), start: d(0, 10), hrs: 1.5 }),
    J('SH-1044', 'C04', 'V2', 'HVAC',      'Furnace short cycling, shuts off after 2 min', 'scheduled',  { claim: 'BP2209184', tech: 'T4', created: d(-2, 9), firstCall: d(-1, 9), start: d(0, 13), hrs: 2 }),
    J('SH-1045', 'C05', 'V1', 'Appliance', 'Refrigerator not cooling, freezer frosted', 'scheduled',     { claim: 'NS-448377', tech: 'T5', created: d(-1, 13), firstCall: d(-1, 14), start: d(0, 11), hrs: 2 }),
    J('SH-1046', 'C06', 'V0', 'Plumbing',  'Kitchen sink clogged, disposal jammed',     'scheduled',     { tech: 'T2', created: d(0, 7, 30), firstCall: d(0, 7, 45), start: d(0, 14), hrs: 1.5 }),
    J('SH-1047', 'C07', 'V3', 'Appliance', 'Oven not heating, bake element glows?',     'new',           { claim: 'HAC-77188', created: d(0, 8, 15) }),
    J('SH-1048', 'C08', 'V1', 'HVAC',      'Thermostat blank, no heat',                  'new',           { claim: 'NS-448402', created: d(0, 9, 5), priority: 'high' }),
    J('SH-1049', 'C09', 'V2', 'Plumbing',  'Toilet running constantly',                  'new',           { claim: 'BP2209301', created: d(-1, 16) }),
    J('SH-1050', 'C10', 'V1', 'Appliance', 'Dishwasher leaves dishes dirty, loud hum',  'new',           { claim: 'NS-448099', created: d(-3, 10), priority: 'normal' }),
    J('SH-1051', 'C11', 'V2', 'HVAC',      'Heat pump iced over',                        'scheduled',     { claim: 'BP2209077', tech: 'T1', created: d(-3, 9), firstCall: null, start: d(1, 8), hrs: 2 }),
    J('SH-1052', 'C12', 'V3', 'Appliance', 'Dryer squealing and not tumbling',           'scheduled',     { claim: 'HAC-77015', tech: 'T5', created: d(-3, 14), firstCall: null, start: d(1, 10), hrs: 1.5 }),
    J('SH-1053', 'C13', 'V1', 'Plumbing',  'Low water pressure whole house',             'scheduled',     { claim: 'NS-448150', tech: 'T2', created: d(-2, 10), firstCall: d(-2, 12), start: d(1, 13), hrs: 2 }),
    J('SH-1054', 'C14', 'V0', 'HVAC',      'Annual furnace tune-up',                     'scheduled',     { tech: 'T4', created: d(-5, 10), firstCall: d(-5, 11), start: d(1, 9), hrs: 1 }),
    J('SH-1055', 'C15', 'V3', 'Appliance', 'Ice maker not making ice',                    'waiting_parts', { claim: 'HAC-76944', tech: 'T3', created: d(-6, 9), firstCall: d(-6, 13), start: d(-4, 10), hrs: 1.5 }),
    J('SH-1056', 'C16', 'V2', 'HVAC',      'Condenser fan not spinning',                 'waiting_parts', { claim: 'BP2208890', tech: 'T1', created: d(-5, 8), firstCall: d(-5, 9), start: d(-3, 14), hrs: 2 }),
    J('SH-1057', 'C17', 'V1', 'Appliance', 'Microwave sparking',                          'in_progress',   { claim: 'NS-447990', tech: 'T5', created: d(-2, 9), firstCall: d(-2, 10), start: d(0, 8), hrs: 1 }),
    J('SH-1058', 'C18', 'V2', 'HVAC',      'No airflow from upstairs vents',              'scheduled',     { claim: 'BP2209233', tech: 'T1', created: d(-2, 13), firstCall: d(-2, 15), start: d(0, 11), hrs: 2 }),
    J('SH-1059', 'C19', 'V0', 'HVAC',      'Seasonal AC maintenance',                      'scheduled',     { tech: 'T1', created: d(-6, 10), firstCall: d(-6, 10, 20), start: d(0, 14, 30), hrs: 1.5 }),
    J('SH-1060', 'C20', 'V3', 'Appliance', 'Range burner won\'t light',                    'scheduled',     { claim: 'HAC-77150', tech: 'T3', created: d(-1, 9), firstCall: d(-1, 11), start: d(0, 13), hrs: 1.5 }),
    J('SH-1061', 'C02', 'V1', 'Appliance', 'Dryer takes 3 cycles to dry',                  'scheduled',     { claim: 'NS-448290', tech: 'T3', created: d(-2, 10), firstCall: d(-2, 14), start: d(0, 15, 30), hrs: 1.5 }),
    J('SH-1062', 'C04', 'V0', 'HVAC',      'Furnace tune-up + filter change',              'scheduled',     { tech: 'T4', created: d(-4, 9), firstCall: d(-4, 9, 30), start: d(0, 9), hrs: 1.5 }),
    J('SH-1063', 'C06', 'V2', 'HVAC',      'Heat pump making grinding noise',              'scheduled',     { claim: 'BP2209260', tech: 'T4', created: d(-1, 14), firstCall: d(-1, 16), start: d(0, 15, 30), hrs: 2 }),
    J('SH-1064', 'C08', 'V0', 'Plumbing',  'Replace shut-off valves under sinks',          'scheduled',     { tech: 'T2', created: d(-3, 11), firstCall: d(-3, 11, 15), start: d(0, 16), hrs: 1.5 }),
    J('SH-1065', 'C10', 'V3', 'Appliance', 'Ice maker leaking onto floor',                 'scheduled',     { claim: 'HAC-77166', tech: 'T5', created: d(-1, 10), firstCall: d(-1, 12), start: d(0, 13, 30), hrs: 1.5 }),
    // Completed history (for the dashboard): last ~5 weeks
    J('SH-1001', 'C18', 'V1', 'HVAC',      'AC not cooling',            'invoiced',  { claim: 'NS-446010', tech: 'T1', created: d(-34, 9), firstCall: d(-34, 13), start: d(-33, 9), done: d(-33, 11), rev: 412 }),
    J('SH-1002', 'C19', 'V0', 'Plumbing',  'Water heater replacement',  'invoiced',  { tech: 'T2', created: d(-33, 8), firstCall: d(-33, 8, 30), start: d(-32, 8), done: d(-32, 13), rev: 1890 }),
    J('SH-1003', 'C20', 'V3', 'Appliance', 'Washer drain pump',         'invoiced',  { claim: 'HAC-75510', tech: 'T3', created: d(-31, 10), firstCall: d(-30, 15), start: d(-29, 10), done: d(-29, 11), rev: 268 }),
    J('SH-1004', 'C01', 'V2', 'HVAC',      'Furnace igniter',           'invoiced',  { claim: 'BP2207710', tech: 'T4', created: d(-30, 9), firstCall: d(-29, 9), start: d(-28, 13), done: d(-28, 14), rev: 296 }),
    J('SH-1005', 'C03', 'V1', 'Appliance', 'Fridge defrost heater',     'invoiced',  { claim: 'NS-446201', tech: 'T5', created: d(-29, 11), firstCall: d(-29, 12), start: d(-27, 10), done: d(-27, 12), rev: 341 }),
    J('SH-1006', 'C05', 'V0', 'Plumbing',  'Disposal replacement',      'invoiced',  { tech: 'T2', created: d(-27, 14), firstCall: d(-27, 14, 20), start: d(-26, 9), done: d(-26, 10), rev: 489 }),
    J('SH-1007', 'C07', 'V1', 'HVAC',      'Capacitor replacement',     'invoiced',  { claim: 'NS-446355', tech: 'T1', created: d(-26, 9), firstCall: d(-25, 16), start: d(-25, 9), done: d(-25, 10), rev: 238 }),
    J('SH-1008', 'C09', 'V3', 'Appliance', 'Oven igniter',              'invoiced',  { claim: 'HAC-75650', tech: 'T3', created: d(-24, 10), firstCall: d(-24, 11), start: d(-23, 13), done: d(-23, 14), rev: 254 }),
    J('SH-1009', 'C11', 'V2', 'HVAC',      'Refrigerant recharge',      'invoiced',  { claim: 'BP2207990', tech: 'T4', created: d(-23, 8), firstCall: d(-21, 9), start: d(-20, 9), done: d(-20, 11), rev: 520 }),
    J('SH-1010', 'C13', 'V0', 'Plumbing',  'Toilet rebuild',            'invoiced',  { tech: 'T2', created: d(-21, 9), firstCall: d(-21, 9, 30), start: d(-20, 14), done: d(-20, 15), rev: 215 }),
    J('SH-1011', 'C15', 'V1', 'Appliance', 'Dryer belt',                'invoiced',  { claim: 'NS-446580', tech: 'T5', created: d(-20, 13), firstCall: d(-20, 15), start: d(-19, 10), done: d(-19, 11), rev: 199 }),
    J('SH-1012', 'C17', 'V3', 'Appliance', 'Dishwasher pump',           'invoiced',  { claim: 'HAC-75801', tech: 'T3', created: d(-19, 9), firstCall: d(-18, 10), start: d(-17, 9), done: d(-17, 10), rev: 377, callback: true }),
    J('SH-1013', 'C19', 'V2', 'HVAC',      'Condenser fan motor',       'invoiced',  { claim: 'BP2208120', tech: 'T1', created: d(-17, 8), firstCall: d(-16, 8), start: d(-15, 9), done: d(-15, 11), rev: 610 }),
    J('SH-1014', 'C02', 'V1', 'HVAC',      'Flame sensor clean',        'invoiced',  { claim: 'NS-446720', tech: 'T4', created: d(-15, 9), firstCall: d(-15, 10), start: d(-14, 13), done: d(-14, 14), rev: 189 }),
    J('SH-1015', 'C04', 'V0', 'Plumbing',  'PEX leak repair',           'completed', { tech: 'T2', created: d(-13, 10), firstCall: d(-13, 10, 15), start: d(-12, 9), done: d(-12, 11), rev: 364 }),
    J('SH-1016', 'C06', 'V3', 'Appliance', 'Ice maker assembly',        'completed', { claim: 'HAC-75990', tech: 'T5', created: d(-12, 11), firstCall: d(-11, 9), start: d(-10, 10), done: d(-10, 11), rev: 402 }),
    J('SH-1017', 'C08', 'V1', 'HVAC',      'Contactor replacement',     'completed', { claim: 'NS-446901', tech: 'T1', created: d(-10, 9), firstCall: d(-10, 11), start: d(-9, 9), done: d(-9, 10), rev: 251 }),
    J('SH-1018', 'C10', 'V2', 'Appliance', 'Washer drain pump',         'completed', { claim: 'BP2208450', tech: 'T3', created: d(-9, 10), firstCall: d(-7, 10), start: d(-6, 13), done: d(-6, 14), rev: 268, callback: true }),
    J('SH-1019', 'C12', 'V0', 'HVAC',      'Furnace tune-up',           'completed', { tech: 'T4', created: d(-8, 9), firstCall: d(-8, 9, 10), start: d(-7, 9), done: d(-7, 10), rev: 149 }),
    J('SH-1020', 'C14', 'V1', 'Plumbing',  'T&P valve replacement',     'completed', { claim: 'NS-447105', tech: 'T2', created: d(-7, 13), firstCall: d(-7, 14), start: d(-6, 9), done: d(-6, 10), rev: 223 }),
    J('SH-1021', 'C16', 'V3', 'Appliance', 'Oven igniter',              'completed', { claim: 'HAC-76210', tech: 'T5', created: d(-6, 9), firstCall: d(-6, 10), start: d(-5, 10), done: d(-5, 11), rev: 254 }),
    J('SH-1022', 'C18', 'V2', 'HVAC',      'Capacitor + contactor',     'completed', { claim: 'BP2208610', tech: 'T1', created: d(-5, 8), firstCall: d(-4, 15), start: d(-4, 9), done: d(-4, 11), rev: 398 }),
    J('SH-1023', 'C20', 'V0', 'Plumbing',  'Disposal jam clear',        'completed', { tech: 'T2', created: d(-4, 10), firstCall: d(-4, 10, 20), start: d(-3, 13), done: d(-3, 14), rev: 179 }),
    J('SH-1024', 'C01', 'V1', 'Appliance', 'Fridge not cooling',        'completed', { claim: 'NS-447300', tech: 'T3', created: d(-3, 9), firstCall: d(-3, 11), start: d(-2, 9), done: d(-2, 11), rev: 341 }),
    J('SH-1025', 'C03', 'V2', 'HVAC',      'Thermostat replacement',    'completed', { claim: 'BP2208777', tech: 'T4', created: d(-2, 9), firstCall: d(-2, 10), start: d(-1, 13), done: d(-1, 14), rev: 276 }),
  ];

  // Sample incoming emails for the Work Order Intake demo.
  const sampleEmails = [
    {
      label: 'Warranty company dispatch',
      from: 'dispatch@northstar-warranty.example',
      subject: 'New Service Request - Claim NS-448519 - HVAC',
      body: `Hello Summit Home Services,

You have been assigned a new service request.

Claim #: NS-448519
Contract holder: Rebecca Lindgren
Property: 4410 Thistle Ridge Dr, 80014
Phone: (555) 013-5521  Alt: (555) 013-5522
Item: Central AC - outdoor condenser
Customer reports: unit running but house will not cool below 82. Started yesterday. Elderly resident in home.

Please make first contact within 24 hours and update the portal.
Service fee collected: $100

Northstar Home Warranty Dispatch`,
    },
    {
      label: 'Messy customer email',
      from: 'mike.t.renner@example.com',
      subject: 'help!! water everywhere',
      body: `hi, my neighbor gave me your info. our water heater in the garage is leaking pretty bad, theres like an inch of water on the floor. i turned the valve off on top i think?? its a 50 gallon gas one maybe 12 yrs old. can someone come today or tomorrow morning. im at 77 Kestrel Way, 80012. cell is 555-013-6610. thanks - Mike Renner`,
    },
    {
      label: 'Forwarded vendor email, no claim number',
      from: 'service@harbor-appliance.example',
      subject: 'FW: Dishwasher issue',
      body: `---------- Forwarded message ----------
From: Harbor Appliance Care Customer Support

Please schedule service for the customer below. Claim number to follow.

Name: Owen Pritchard
Address: 1902 Saltgrass Ln, 80016
Best phone: 555.013.7734
Appliance: Bosch dishwasher, approx 4 yrs
Problem: not draining, standing water in bottom, makes grinding noise

Thanks,
Harbor Appliance Care`,
    },
  ];

  window.SUMMIT = {
    company, techs, vendors, customers, priceBook, jobs, statuses, statusLabels, sampleEmails,
    today: today.toISOString(),
    byId: (list, id) => list.find(x => x.id === id),
    money: n => '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
  };
})();
