// Rolevia AI · Database Seed & Migration Script
// Migrates legacy store.json data into normalized Prisma models (Tenant, User, CandidateProfile, FactStore, Job, Application, CreditJournal)

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const bcrypt = require('bcryptjs');
const prisma = require('../backend/db');

function computeRequisitionHash(company, title, url) {
  const norm = `${(company || '').trim().toLowerCase()}|${(title || '').trim().toLowerCase()}|${(url || '').trim().toLowerCase()}`;
  return crypto.createHash('sha256').update(norm).digest('hex');
}

async function seed() {
  console.log('[Rolevia Migration] Starting Prisma database seed...');
  const storePath = path.join(__dirname, '..', 'backend', 'database', 'store.json');
  const storeData = JSON.parse(fs.readFileSync(storePath, 'utf8'));

  // 1. Create Default Tenant
  const tenant = await prisma.tenant.upsert({
    where: { subdomain: 'default' },
    update: {},
    create: {
      id: 'tenant-rolevia-default',
      name: 'Rolevia Primary Workspace',
      subdomain: 'default'
    }
  });
  console.log(`[Rolevia Migration] Tenant verified: ${tenant.name} (${tenant.id})`);

  // 2. Hash Password and Create User
  const salt = bcrypt.genSaltSync(10);
  const passwordHash = bcrypt.hashSync('RoleviaDemo2026!', salt);

  const userData = storeData.user;
  const user = await prisma.user.upsert({
    where: { email: userData.email },
    update: {
      name: userData.name,
      phone: userData.phone,
      location: userData.location,
      linkedin: userData.linkedin,
      github: userData.github,
      roleTitle: userData.roleTitle,
      yearsExp: userData.yearsExp,
      credits: userData.credits || 499
    },
    create: {
      id: 'usr-sameer-01',
      tenantId: tenant.id,
      email: userData.email,
      passwordHash: passwordHash,
      name: userData.name,
      phone: userData.phone,
      location: userData.location,
      linkedin: userData.linkedin,
      github: userData.github,
      roleTitle: userData.roleTitle,
      yearsExp: userData.yearsExp,
      credits: userData.credits || 499
    }
  });
  console.log(`[Rolevia Migration] User seeded: ${user.name} <${user.email}> (Credits: ${user.credits})`);

  // 3. Seed Candidate Profile
  const profile = await prisma.candidateProfile.upsert({
    where: { userId: user.id },
    update: {
      skills: JSON.stringify(userData.skills || []),
      certifications: JSON.stringify(userData.certifications || []),
      targetRoles: JSON.stringify(userData.roleFamilies || []),
      preferredLocations: JSON.stringify(userData.preferredLocations || []),
      needsSponsorship: userData.needsSponsorship || false,
      bachelors: userData.bachelors,
      education: userData.education,
      atsReadinessScore: 98,
      parsedAt: new Date()
    },
    create: {
      id: 'prof-sameer-01',
      userId: user.id,
      skills: JSON.stringify(userData.skills || []),
      certifications: JSON.stringify(userData.certifications || []),
      targetRoles: JSON.stringify(userData.roleFamilies || []),
      preferredLocations: JSON.stringify(userData.preferredLocations || []),
      needsSponsorship: userData.needsSponsorship || false,
      bachelors: userData.bachelors,
      education: userData.education,
      atsReadinessScore: 98,
      parsedAt: new Date()
    }
  });

  // 4. Seed FactStore Facts
  await prisma.factStore.deleteMany({ where: { candidateProfileId: profile.id } });

  const facts = [
    {
      candidateProfileId: profile.id,
      factType: 'EDUCATION',
      title: 'Master of Science (M.Sc) - Computer Science',
      organization: 'Osmania University, Hyderabad',
      startDate: '2024',
      endDate: '2026',
      highlights: JSON.stringify([
        'Specialization in Distributed Systems, Advanced Database Architectures, and Applied AI.',
        'Maintained 8.47 / 10.0 CGPA across all graduate coursework.'
      ]),
      metrics: 'CGPA 8.47 / 10.0',
      verified: true,
      confidence: 1.0
    },
    {
      candidateProfileId: profile.id,
      factType: 'EDUCATION',
      title: 'Bachelor of Science (B.Sc) - Computer Science',
      organization: 'Bhavans Vivekananda College, Osmania University',
      startDate: '2021',
      endDate: '2024',
      highlights: JSON.stringify([
        'Graduated with 8.44 / 10.0 CGPA with distinction in Software Engineering and Database Systems.'
      ]),
      metrics: 'CGPA 8.44 / 10.0',
      verified: true,
      confidence: 1.0
    },
    {
      candidateProfileId: profile.id,
      factType: 'WORK_EXPERIENCE',
      title: 'Python Developer Intern',
      organization: 'Mantarang Edtech LLP',
      startDate: 'July 2024',
      endDate: 'Dec 2024',
      highlights: JSON.stringify([
        'Architected modular Flask attendance tracking microservices managing 500+ daily active users.',
        'Designed optimized PostgreSQL schemas with relational foreign key constraints, reducing query response times by 35%.',
        'Implemented JWT token authentication with RBAC and automated daily event alerts handling 200+ triggers.'
      ]),
      metrics: '500+ DAU, 35% latency reduction, 200+ daily event alerts',
      verified: true,
      confidence: 1.0
    },
    {
      candidateProfileId: profile.id,
      factType: 'PROJECT',
      title: 'NGO Full-Stack Web Application',
      organization: 'Independent Engineering',
      startDate: 'Jan 2024',
      endDate: 'May 2024',
      highlights: JSON.stringify([
        'Engineered responsive React and TypeScript frontend with Node.js/Express and Prisma ORM backends.',
        'Constructed 25+ RESTful endpoints hardened with Helmet, CORS, and rate limiting.',
        'Integrated PostgreSQL with automated migrations and connection pooling.'
      ]),
      metrics: '25+ RESTful endpoints, 40% query performance optimization',
      verified: true,
      confidence: 1.0
    },
    {
      candidateProfileId: profile.id,
      factType: 'PROJECT',
      title: 'Academy Attendance Portal',
      organization: 'Independent Engineering',
      startDate: 'Aug 2023',
      endDate: 'Dec 2023',
      highlights: JSON.stringify([
        'Developed Python Flask attendance portal handling 2,000+ daily requests.',
        'Built automated analytical reporting pipelines with SQLAlchemy ORM and SQLite.'
      ]),
      metrics: '2,000+ daily requests',
      verified: true,
      confidence: 1.0
    }
  ];

  for (const fact of facts) {
    await prisma.factStore.create({ data: fact });
  }
  console.log(`[Rolevia Migration] FactStore populated with ${facts.length} verified candidate facts.`);

  // 5. Seed Credit Journal Entry
  const existingGrant = await prisma.creditJournal.findFirst({
    where: { userId: user.id, entryType: 'SUBSCRIPTION_GRANT' }
  });
  if (!existingGrant) {
    await prisma.creditJournal.create({
      data: {
        tenantId: tenant.id,
        userId: user.id,
        entryType: 'SUBSCRIPTION_GRANT',
        amount: 500,
        balanceAfter: 500,
        idempotencyKey: `seed-initial-grant-${user.id}`,
        referenceType: 'INVOICE',
        referenceId: 'INV-SEED-001'
      }
    });
    console.log('[Rolevia Migration] CreditJournal initial grant record logged.');
  }

  // 6. Seed Jobs with Requisition Hashes
  if (Array.isArray(storeData.jobs)) {
    for (const j of storeData.jobs) {
      const reqHash = computeRequisitionHash(j.company, j.title, j.url);
      await prisma.job.upsert({
        where: { requisitionHash: reqHash },
        update: {
          status: 'ACTIVE',
          lastCheckedAt: new Date()
        },
        create: {
          id: j.id || `job-${crypto.randomBytes(4).toString('hex')}`,
          company: j.company,
          title: j.title,
          url: j.url,
          applyUrl: j.applyUrl || j.url,
          ats: j.ats || 'custom',
          atsName: j.atsName || 'Direct Portal',
          location: j.location || 'Remote',
          jobType: j.jobType || 'Full-time',
          salary: typeof j.salary === 'object' ? JSON.stringify(j.salary) : (j.salary || '$120,000 - $160,000'),
          postedAt: j.postedAt || 'Recently',
          requirements: JSON.stringify(j.requirements || []),
          requisitionHash: reqHash,
          status: 'ACTIVE'
        }
      });
    }
    console.log(`[Rolevia Migration] Seeded ${storeData.jobs.length} jobs with SHA-256 requisition hashes.`);
  }

  // 7. Seed Applications
  if (Array.isArray(storeData.applications)) {
    for (const a of storeData.applications) {
      await prisma.application.upsert({
        where: { id: a.id },
        update: {
          status: a.status || 'SUBMITTED',
          confirmationNumber: a.receipt?.confirmationNumber || a.confirmationNumber
        },
        create: {
          id: a.id,
          tenantId: tenant.id,
          userId: user.id,
          company: a.company,
          position: a.position,
          ats: a.ats,
          url: a.url,
          status: (a.status || 'SUBMITTED').toUpperCase(),
          confirmationNumber: a.receipt?.confirmationNumber || null,
          receiptUrl: a.receipt?.applicationUrl || a.url,
          diffData: JSON.stringify(a.diff || []),
          receiptData: JSON.stringify(a.receipt || {})
        }
      });
    }
    console.log(`[Rolevia Migration] Seeded ${storeData.applications.length} candidate applications.`);
  }

  console.log('[Rolevia Migration] Migration completed successfully.');
}

if (require.main === module) {
  seed()
    .then(async () => {
      await prisma.$disconnect();
    })
    .catch(async (e) => {
      console.error('[Rolevia Migration Error]', e);
      await prisma.$disconnect();
      process.exit(1);
    });
}

module.exports = { seed, computeRequisitionHash };
