// ─── HRIS Platform — Database Seed ───────────────────────────────────
// Run: node prisma/seed.js
// Seeds: users, departments, grade bands, positions, candidates,
//        applications, scorecard templates, scorecards, offers

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting HRIS seed...\n');

  // ── 1. Users ────────────────────────────────────────────────────────
  console.log('Creating users...');

  const hashPw = (pw) => bcrypt.hashSync(pw, 12);

  const [sara, nour, karim, elena, james, finance_user] = await Promise.all([
    prisma.user.upsert({
      where: { email: 'sara.mostafa@company.com' },
      update: {},
      create: {
        email: 'sara.mostafa@company.com',
        passwordHash: hashPw('HRDirector@2026'),
        firstName: 'Sara', lastName: 'Mostafa',
        role: 'admin',
        accessScope: 'all_data',
        canViewSalary: true,
        canApproveOffers: true,
        canApproveRequisitions: true,
        entities: ['egypt','cyprus','uk','tunisia'],
      },
    }),
    prisma.user.upsert({
      where: { email: 'nour.elsayed@company.com' },
      update: {},
      create: {
        email: 'nour.elsayed@company.com',
        passwordHash: hashPw('Recruiter@2026'),
        firstName: 'Nour', lastName: 'Elsayed',
        role: 'recruiter',
        accessScope: 'recruitment_data',
        canViewSalary: true,
        entities: ['egypt','cyprus','uk','tunisia'],
      },
    }),
    prisma.user.upsert({
      where: { email: 'karim.hassan@company.com' },
      update: {},
      create: {
        email: 'karim.hassan@company.com',
        passwordHash: hashPw('Manager@2026'),
        firstName: 'Karim', lastName: 'Hassan',
        role: 'hiring_manager',
        accessScope: 'assigned_jobs',
        canApproveRequisitions: true,
        entities: ['egypt'],
      },
    }),
    prisma.user.upsert({
      where: { email: 'elena.papadopoulos@company.com' },
      update: {},
      create: {
        email: 'elena.papadopoulos@company.com',
        passwordHash: hashPw('Manager@2026'),
        firstName: 'Elena', lastName: 'Papadopoulos',
        role: 'hiring_manager',
        accessScope: 'assigned_jobs',
        canApproveRequisitions: true,
        entities: ['cyprus'],
      },
    }),
    prisma.user.upsert({
      where: { email: 'james.thornton@company.com' },
      update: {},
      create: {
        email: 'james.thornton@company.com',
        passwordHash: hashPw('Manager@2026'),
        firstName: 'James', lastName: 'Thornton',
        role: 'hiring_manager',
        accessScope: 'assigned_jobs',
        canApproveRequisitions: true,
        entities: ['uk'],
      },
    }),
    prisma.user.upsert({
      where: { email: 'finance@company.com' },
      update: {},
      create: {
        email: 'finance@company.com',
        passwordHash: hashPw('Finance@2026'),
        firstName: 'Finance', lastName: 'Team',
        role: 'admin',
        accessScope: 'all_data',
        canViewSalary: true,
        canApproveOffers: true,
        entities: ['egypt','cyprus','uk','tunisia'],
      },
    }),
  ]);

  console.log('  ✓ 6 users created');

  // ── 2. Departments ───────────────────────────────────────────────────
  console.log('Creating departments...');

  const deptData = [
    { name: 'Engineering',  entity: 'egypt' },
    { name: 'Finance',      entity: 'egypt' },
    { name: 'Finance',      entity: 'cyprus' },
    { name: 'Operations',   entity: 'egypt' },
    { name: 'Operations',   entity: 'uk' },
    { name: 'HR',           entity: 'egypt' },
    { name: 'Technology',   entity: 'egypt' },
    { name: 'Commercial',   entity: 'egypt' },
    { name: 'Commercial',   entity: 'cyprus' },
  ];

  const depts = {};
  for (const d of deptData) {
    const dept = await prisma.department.upsert({
      where: { name_entity: { name: d.name, entity: d.entity } },
      update: {},
      create: { name: d.name, entity: d.entity, costCenter: `CC-${d.entity.toUpperCase()}-${d.name.slice(0,3).toUpperCase()}` },
    });
    depts[`${d.name}_${d.entity}`] = dept;
  }

  console.log('  ✓ 9 departments created');

  // ── 3. Grade bands ───────────────────────────────────────────────────
  console.log('Creating grade bands...');

  const grades = [
    // Egypt (EGP)
    { grade: 'IC3', entity: 'egypt',  currency: 'EGP', salaryMin: 40000,  salaryMax: 65000  },
    { grade: 'IC4', entity: 'egypt',  currency: 'EGP', salaryMin: 60000,  salaryMax: 95000  },
    { grade: 'IC5', entity: 'egypt',  currency: 'EGP', salaryMin: 85000,  salaryMax: 140000 },
    { grade: 'M1',  entity: 'egypt',  currency: 'EGP', salaryMin: 110000, salaryMax: 170000 },
    { grade: 'M2',  entity: 'egypt',  currency: 'EGP', salaryMin: 150000, salaryMax: 220000 },
    { grade: 'D1',  entity: 'egypt',  currency: 'EGP', salaryMin: 200000, salaryMax: 320000 },
    // Cyprus (EUR)
    { grade: 'IC3', entity: 'cyprus', currency: 'EUR', salaryMin: 22000,  salaryMax: 35000  },
    { grade: 'IC4', entity: 'cyprus', currency: 'EUR', salaryMin: 32000,  salaryMax: 50000  },
    { grade: 'IC5', entity: 'cyprus', currency: 'EUR', salaryMin: 45000,  salaryMax: 68000  },
    { grade: 'M1',  entity: 'cyprus', currency: 'EUR', salaryMin: 55000,  salaryMax: 80000  },
    { grade: 'M2',  entity: 'cyprus', currency: 'EUR', salaryMin: 70000,  salaryMax: 100000 },
    { grade: 'D1',  entity: 'cyprus', currency: 'EUR', salaryMin: 90000,  salaryMax: 140000 },
    // UK (GBP)
    { grade: 'IC3', entity: 'uk',     currency: 'GBP', salaryMin: 28000,  salaryMax: 42000  },
    { grade: 'IC4', entity: 'uk',     currency: 'GBP', salaryMin: 38000,  salaryMax: 58000  },
    { grade: 'IC5', entity: 'uk',     currency: 'GBP', salaryMin: 52000,  salaryMax: 75000  },
    { grade: 'M1',  entity: 'uk',     currency: 'GBP', salaryMin: 65000,  salaryMax: 90000  },
    { grade: 'M2',  entity: 'uk',     currency: 'GBP', salaryMin: 80000,  salaryMax: 115000 },
    { grade: 'D1',  entity: 'uk',     currency: 'GBP', salaryMin: 105000, salaryMax: 150000 },
  ];

  const gradeBands = {};
  for (const g of grades) {
    const band = await prisma.gradeBand.upsert({
      where: { grade_entity: { grade: g.grade, entity: g.entity } },
      update: {},
      create: g,
    });
    gradeBands[`${g.grade}_${g.entity}`] = band;
  }

  console.log('  ✓ 18 grade bands created');

  // ── 4. Scorecard templates ───────────────────────────────────────────
  console.log('Creating scorecard templates...');

  const engTemplate = await prisma.scorecardTemplate.upsert({
    where: { id: 'tpl-engineering-v1' },
    update: {},
    create: {
      id:          'tpl-engineering-v1',
      name:        'Engineering — Technical',
      icon:        '⚙️',
      description: 'For software, data, and infrastructure roles. Heavy weighting on technical depth.',
      appliesTo:   ['Engineering','Technology'],
      categories: {
        create: [
          { name: 'Technical depth',      weight: 40, order: 0, colorHex: '#3a5a8a',
            description: 'Hands-on knowledge, system design, code quality judgment.',
            levels: ['No relevant experience','Basic awareness','Solid fundamentals','Strong practitioner','Expert-level'] },
          { name: 'Problem solving',      weight: 25, order: 1, colorHex: '#0d7d6e',
            description: 'Novel problem approach, breaking down ambiguity, structured solutions.',
            levels: ['Unable to approach novel problems','Needs heavy guidance','Structured approach','Creative and systematic','Exceptional clarity'] },
          { name: 'Communication',        weight: 20, order: 2, colorHex: '#7c3aed',
            description: 'Clear explanation to technical and non-technical audiences.',
            levels: ['Poor clarity','Communicates basics','Clear on familiar topics','Articulate and adapts','Exceptional'] },
          { name: 'Culture & collaboration', weight: 15, order: 3, colorHex: '#d97706',
            description: 'Team values alignment, collaborative mindset, handling feedback.',
            levels: ['Significant concerns','Some misalignment','Neutral fit','Positive signals','Exceptional cultural add'] },
        ],
      },
    },
  });

  const finTemplate = await prisma.scorecardTemplate.upsert({
    where: { id: 'tpl-finance-v1' },
    update: {},
    create: {
      id:          'tpl-finance-v1',
      name:        'Finance — Professional',
      icon:        '📊',
      description: 'For finance, accounting, and control roles. Emphasises technical judgment.',
      appliesTo:   ['Finance'],
      categories: {
        create: [
          { name: 'Technical & regulatory', weight: 40, order: 0, colorHex: '#3a5a8a',
            description: 'IFRS/GAAP, tax, audit, compliance, ERP fluency.',
            levels: ['No qualification','Basic knowledge','Solid practitioner','Strong practitioner','Expert'] },
          { name: 'Commercial judgment',   weight: 30, order: 1, colorHex: '#0d7d6e',
            description: 'Financial data to business insight and decision support.',
            levels: ['Operational only','Limited business partnering','Can support decisions','Strong partner','Exceptional strategic finance'] },
          { name: 'Stakeholder management',weight: 20, order: 2, colorHex: '#7c3aed',
            description: 'Manages relationships with Finance, HR, Board, external.',
            levels: ['Avoids stakeholders','Reactive','Manages adequately','Builds strong relationships','Trusted advisor'] },
          { name: 'Culture & integrity',   weight: 10, order: 3, colorHex: '#d97706',
            description: 'Professional ethics, confidentiality, values alignment.',
            levels: ['Concerns raised','Minor signals','Acceptable','Positive — reliable','Exceptional trustworthiness'] },
        ],
      },
    },
  });

  const opsTemplate = await prisma.scorecardTemplate.upsert({
    where: { id: 'tpl-operations-v1' },
    update: {},
    create: {
      id:          'tpl-operations-v1',
      name:        'Operations — Leadership',
      icon:        '🏗️',
      description: 'For operations, supply chain, and project management roles.',
      appliesTo:   ['Operations'],
      categories: {
        create: [
          { name: 'Operational leadership', weight: 35, order: 0, colorHex: '#3a5a8a',
            description: 'Managing teams, P&L, cross-functional operations at scale.',
            levels: ['No leadership','Limited to small teams','Department level','Strong multi-site','Transformed operations'] },
          { name: 'Process & execution',    weight: 35, order: 1, colorHex: '#0d7d6e',
            description: 'Design, implement, improve operational processes.',
            levels: ['No process experience','Follows existing','Improves with guidance','Designs independently','Expert process architect'] },
          { name: 'Culture & team building',weight: 30, order: 2, colorHex: '#7c3aed',
            description: 'Building teams, handling underperformance, culture of accountability.',
            levels: ['Avoidant on people','Reactive','Functional team dynamics','Builds high-performing teams','Creates exceptional culture'] },
        ],
      },
    },
  });

  console.log('  ✓ 3 scorecard templates created');

  // ── 5. Positions ─────────────────────────────────────────────────────
  console.log('Creating positions...');

  const engDept   = depts['Engineering_egypt'];
  const finCyDept = depts['Finance_cyprus'];
  const hrDept    = depts['HR_egypt'];
  const ukOpsDept = depts['Operations_uk'];
  const techDept  = depts['Technology_egypt'];

  const [p1, p2, p3, p4, p5] = await Promise.all([
    prisma.position.upsert({
      where: { id: 'pos-senior-swe-egypt' },
      update: {},
      create: {
        id: 'pos-senior-swe-egypt',
        title: 'Senior Software Engineer',
        departmentId: engDept.id,
        entity: 'egypt',
        seniority: 'senior',
        employmentType: 'full_time',
        gradeBandId: gradeBands['IC5_egypt'].id,
        currency: 'EGP',
        salaryMin: 120000, salaryMax: 160000,
        status: 'open',
        priority: 'urgent',
        headcountStatus: 'approved',
        headcountApprovedAt: new Date('2026-02-28'),
        headcountApprovedBy: sara.id,
        openDate: new Date('2026-03-01'),
        targetCloseDate: new Date('2026-05-15'),
        recruiterId: nour.id,
        scorecardTemplateId: engTemplate.id,
        description: 'Senior software engineer role leading technical design of key product features.',
        requirements: ['5+ years React & Node.js', 'System design & scalability', 'AWS or GCP experience'],
      },
    }),
    prisma.position.upsert({
      where: { id: 'pos-fin-ctrl-cyprus' },
      update: {},
      create: {
        id: 'pos-fin-ctrl-cyprus',
        title: 'Financial Controller',
        departmentId: finCyDept.id,
        entity: 'cyprus',
        seniority: 'senior',
        employmentType: 'full_time',
        gradeBandId: gradeBands['M1_cyprus'].id,
        currency: 'EUR',
        salaryMin: 55000, salaryMax: 70000,
        status: 'open',
        priority: 'high',
        headcountStatus: 'approved',
        headcountApprovedAt: new Date('2026-02-10'),
        headcountApprovedBy: sara.id,
        openDate: new Date('2026-02-15'),
        targetCloseDate: new Date('2026-04-30'),
        recruiterId: nour.id,
        scorecardTemplateId: finTemplate.id,
        requirements: ['ACA or ACCA qualified', 'IFRS 9/16 knowledge', 'Big 4 background preferred'],
      },
    }),
    prisma.position.upsert({
      where: { id: 'pos-hrbp-egypt' },
      update: {},
      create: {
        id: 'pos-hrbp-egypt',
        title: 'HR Business Partner',
        departmentId: hrDept.id,
        entity: 'egypt',
        seniority: 'mid',
        employmentType: 'full_time',
        gradeBandId: gradeBands['IC5_egypt'].id,
        currency: 'EGP',
        salaryMin: 60000, salaryMax: 85000,
        status: 'open',
        priority: 'normal',
        headcountStatus: 'approved',
        headcountApprovedAt: new Date('2026-03-05'),
        headcountApprovedBy: sara.id,
        openDate: new Date('2026-03-10'),
        recruiterId: nour.id,
        requirements: ['4+ years HR generalist', 'Egypt labor law knowledge', 'Arabic & English bilingual'],
      },
    }),
    prisma.position.upsert({
      where: { id: 'pos-ops-mgr-uk' },
      update: {},
      create: {
        id: 'pos-ops-mgr-uk',
        title: 'Operations Manager',
        departmentId: ukOpsDept.id,
        entity: 'uk',
        seniority: 'lead',
        employmentType: 'full_time',
        gradeBandId: gradeBands['M1_uk'].id,
        currency: 'GBP',
        salaryMin: 65000, salaryMax: 80000,
        status: 'open',
        priority: 'high',
        headcountStatus: 'approved',
        headcountApprovedAt: new Date('2026-03-25'),
        headcountApprovedBy: sara.id,
        openDate: new Date('2026-04-01'),
        targetCloseDate: new Date('2026-06-01'),
        recruiterId: nour.id,
        scorecardTemplateId: opsTemplate.id,
        requirements: ['10+ years operations management', 'P&L ownership', 'Right to work in UK'],
      },
    }),
    prisma.position.upsert({
      where: { id: 'pos-devops-egypt' },
      update: {},
      create: {
        id: 'pos-devops-egypt',
        title: 'DevOps Engineer',
        departmentId: techDept.id,
        entity: 'egypt',
        seniority: 'mid',
        employmentType: 'full_time',
        gradeBandId: gradeBands['IC4_egypt'].id,
        currency: 'EGP',
        salaryMin: 80000, salaryMax: 110000,
        status: 'draft',
        priority: 'normal',
        headcountStatus: 'pending',
        headcountRationale: 'Team capacity at 80%. Need dedicated DevOps to manage infra and CI/CD pipelines.',
        openDate: new Date('2026-04-10'),
        recruiterId: nour.id,
        requirements: ['3+ years DevOps/SRE', 'Kubernetes & Docker', 'AWS or GCP', 'Terraform'],
      },
    }),
  ]);

  console.log('  ✓ 5 positions created');

  // ── 6. Candidates ────────────────────────────────────────────────────
  console.log('Creating candidates...');

  const candidates = await Promise.all([
    prisma.candidate.upsert({
      where: { email: 'ahmed.mahmoud@gmail.com' },
      update: {},
      create: {
        firstName: 'Ahmed',     lastName: 'Mahmoud',
        email: 'ahmed.mahmoud@gmail.com', phone: '+20 100 123 4567',
        linkedinUrl: 'linkedin.com/in/ahmedmahmoud',
        currentTitle: 'Software Engineer', currentCompany: 'Instabug',
        totalYearsExp: 6, location: 'Cairo, Egypt', nationality: 'Egyptian',
        noticePeriodDays: 30, salaryExpectation: 145000, salaryCurrency: 'EGP',
        source: 'linkedin', tags: ['react','node','strong-candidate'],
      },
    }),
    prisma.candidate.upsert({
      where: { email: 'yara.saleh@outlook.com' },
      update: {},
      create: {
        firstName: 'Yara',      lastName: 'Saleh',
        email: 'yara.saleh@outlook.com', phone: '+20 112 987 6543',
        currentTitle: 'Full Stack Developer', currentCompany: 'Vodafone Egypt',
        totalYearsExp: 5, location: 'Cairo, Egypt', nationality: 'Egyptian',
        noticePeriodDays: 60, salaryExpectation: 130000, salaryCurrency: 'EGP',
        source: 'referral', tags: ['react','python'],
      },
    }),
    prisma.candidate.upsert({
      where: { email: 'c.nikolaou@gmail.com' },
      update: {},
      create: {
        firstName: 'Christos',  lastName: 'Nikolaou',
        email: 'c.nikolaou@gmail.com', phone: '+357 99 123456',
        currentTitle: 'Finance Manager', currentCompany: 'Deloitte Cyprus',
        totalYearsExp: 9, location: 'Nicosia, Cyprus', nationality: 'Cypriot',
        noticePeriodDays: 90, salaryExpectation: 62000, salaryCurrency: 'EUR',
        source: 'direct', tags: ['acca','ifrs','big4'],
      },
    }),
    prisma.candidate.upsert({
      where: { email: 'layla.ibrahim@gmail.com' },
      update: {},
      create: {
        firstName: 'Layla',     lastName: 'Ibrahim',
        email: 'layla.ibrahim@gmail.com', phone: '+20 101 555 7788',
        currentTitle: 'HR Generalist', currentCompany: 'Majid Al Futtaim',
        totalYearsExp: 4, location: 'Cairo, Egypt', nationality: 'Egyptian',
        noticePeriodDays: 30, salaryExpectation: 72000, salaryCurrency: 'EGP',
        source: 'linkedin', tags: ['hrbp','talent'],
      },
    }),
    prisma.candidate.upsert({
      where: { email: 'o.pemberton@protonmail.com' },
      update: {},
      create: {
        firstName: 'Oliver',    lastName: 'Pemberton',
        email: 'o.pemberton@protonmail.com', phone: '+44 7911 123456',
        currentTitle: 'Operations Director', currentCompany: 'DHL Supply Chain',
        totalYearsExp: 14, location: 'London, UK', nationality: 'British',
        noticePeriodDays: 90, salaryExpectation: 78000, salaryCurrency: 'GBP',
        source: 'job_board', tags: ['supply-chain','p-l-owner'],
      },
    }),
  ]);

  console.log('  ✓ 5 candidates created');

  // ── 7. Applications ──────────────────────────────────────────────────
  console.log('Creating applications...');

  const apps = await Promise.all([
    // Ahmed → Senior SWE → Offer stage
    prisma.application.upsert({
      where: { candidateId_positionId: { candidateId: candidates[0].id, positionId: p1.id } },
      update: {},
      create: {
        candidateId: candidates[0].id, positionId: p1.id,
        stage: 'offer',
        stageEnteredAt: new Date('2026-04-10'),
        appliedAt:      new Date('2026-03-15'),
      },
    }),
    // Yara → Senior SWE → Assessment
    prisma.application.upsert({
      where: { candidateId_positionId: { candidateId: candidates[1].id, positionId: p1.id } },
      update: {},
      create: {
        candidateId: candidates[1].id, positionId: p1.id,
        stage: 'assessment',
        stageEnteredAt: new Date('2026-04-01'),
        appliedAt:      new Date('2026-03-18'),
      },
    }),
    // Christos → Financial Controller → Interview
    prisma.application.upsert({
      where: { candidateId_positionId: { candidateId: candidates[2].id, positionId: p2.id } },
      update: {},
      create: {
        candidateId: candidates[2].id, positionId: p2.id,
        stage: 'interview',
        stageEnteredAt: new Date('2026-03-20'),
        appliedAt:      new Date('2026-02-28'),
      },
    }),
    // Layla → HRBP → Applied
    prisma.application.upsert({
      where: { candidateId_positionId: { candidateId: candidates[3].id, positionId: p3.id } },
      update: {},
      create: {
        candidateId: candidates[3].id, positionId: p3.id,
        stage: 'applied',
        stageEnteredAt: new Date('2026-03-22'),
        appliedAt:      new Date('2026-03-22'),
      },
    }),
    // Oliver → Ops Manager → Interview
    prisma.application.upsert({
      where: { candidateId_positionId: { candidateId: candidates[4].id, positionId: p4.id } },
      update: {},
      create: {
        candidateId: candidates[4].id, positionId: p4.id,
        stage: 'interview',
        stageEnteredAt: new Date('2026-04-18'),
        appliedAt:      new Date('2026-04-05'),
      },
    }),
  ]);

  console.log('  ✓ 5 applications created');

  // ── 8. Scorecards ────────────────────────────────────────────────────
  console.log('Creating scorecards...');

  // Get template categories
  const engCats = await prisma.scorecardTemplateCategory.findMany({
    where: { templateId: engTemplate.id },
    orderBy: { order: 'asc' },
  });

  // Ahmed — Technical interview scorecard (strong-yes, 4.8)
  const ahmedScorecard = await prisma.scorecard.create({
    data: {
      applicationId: apps[0].id,
      templateId:    engTemplate.id,
      interviewerId: karim.id,
      interviewType: 'technical',
      recommendation: 'strong_yes',
      compositeScore: 4.8,
      strengthsSummary: 'Exceptional system design. Proposed distributed caching layer. Thinks in trade-offs.',
      concernsSummary:  'Notice period 30 days — manageable. Salary expectation within band.',
      submittedAt: new Date('2026-03-25'),
      ratings: {
        create: [
          { categoryId: engCats[0].id, score: 5, notes: 'Exceptional system design — nailed distributed systems questions.' },
          { categoryId: engCats[1].id, score: 5, notes: 'Broke down a novel problem in under 5 minutes. Thinks in trade-offs.' },
          { categoryId: engCats[2].id, score: 4, notes: 'Very clear. Occasionally goes deep without checking audience, but self-corrects.' },
          { categoryId: engCats[3].id, score: 5, notes: 'Energetic, humble, asked great questions about team challenges.' },
        ],
      },
    },
  });

  console.log('  ✓ Scorecards created');

  // ── 9. Offers ────────────────────────────────────────────────────────
  console.log('Creating offers...');

  await prisma.offer.create({
    data: {
      applicationId: apps[0].id,
      positionId:    p1.id,
      gradeBandId:   gradeBands['IC5_egypt'].id,
      currency:      'EGP',
      baseSalary:    148000,
      bonusTargetPct: 15,
      signingBonus:  0,
      annualLeaveDays: 21,
      startDate:     new Date('2026-06-01'),
      respondByDate: new Date('2026-04-24'),
      status:        'sent',
      sentAt:        new Date('2026-04-10'),
      bandException: true,
      bandExceptionNote: 'EGP 148K is 5.7% above IC5 max (EGP 140K). Approved by HR Director — exceptional scorecard 4.8/5.',
      onboardingTriggered: false,
      approvalSteps: {
        create: [
          { stepOrder: 1, role: 'Recruiter',       approverId: nour.id,  status: 'approved', note: 'Strong yes from HM. Composite 4.8.',          actedAt: new Date('2026-04-10') },
          { stepOrder: 2, role: 'Hiring Manager',  approverId: karim.id, status: 'approved', note: 'Best candidate I\'ve seen in 2 years. Approve.', actedAt: new Date('2026-04-10') },
          { stepOrder: 3, role: 'HR Director',     approverId: sara.id,  status: 'approved', note: 'Exception approved. Within acceptable range.',   actedAt: new Date('2026-04-10') },
          { stepOrder: 4, role: 'Finance (auto)',  approverId: null,     status: 'approved', note: 'Band exception noted and approved by HR Director.', actedAt: new Date('2026-04-10') },
        ],
      },
      history: {
        create: [
          { event: 'Offer created',                  actorName: 'Nour Elsayed',  actorId: nour.id, createdAt: new Date('2026-04-09') },
          { event: 'Recruiter approved',             actorName: 'Nour Elsayed',  actorId: nour.id, createdAt: new Date('2026-04-10T08:00:00Z') },
          { event: 'Hiring Manager approved',        actorName: 'Karim Hassan',  actorId: karim.id, createdAt: new Date('2026-04-10T09:00:00Z') },
          { event: 'HR Director approved',           actorName: 'Sara Mostafa',  actorId: sara.id, createdAt: new Date('2026-04-10T09:30:00Z') },
          { event: 'Offer sent to Ahmed Mahmoud',    actorName: 'System',        createdAt: new Date('2026-04-10T10:00:00Z') },
          { event: 'Offer viewed by candidate',      actorName: 'Ahmed Mahmoud', createdAt: new Date('2026-04-11T14:00:00Z') },
        ],
      },
    },
  });

  console.log('  ✓ 1 offer created (Ahmed Mahmoud — sent)');

  console.log('\n✅ Seed complete!\n');
  console.log('Test accounts:');
  console.log('  HR Director:  sara.mostafa@company.com    / HRDirector@2026');
  console.log('  Recruiter:    nour.elsayed@company.com    / Recruiter@2026');
  console.log('  Manager (EG): karim.hassan@company.com    / Manager@2026');
  console.log('  Manager (CY): elena.papadopoulos@company.com / Manager@2026');
  console.log('  Manager (UK): james.thornton@company.com  / Manager@2026');
  console.log('  Finance:      finance@company.com          / Finance@2026');
}

main()
  .catch(err => { console.error('Seed failed:', err); process.exit(1); })
  .finally(() => prisma.$disconnect());
