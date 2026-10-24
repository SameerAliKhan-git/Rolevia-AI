// Rolevia AI · Synthetic Multi-Layout PDF & Ground-Truth Benchmark Generator
// Generates 4 diverse resume layouts + independent ground-truth JSON benchmarks to evaluate:
// 1. Parsing Quality (Extraction Fidelity)
// 2. Document-Format Quality (ATS Readability Rubric)
// 3. Job-Specific Resume Relevance (Semantic Alignment)

const fs = require('node:fs');
const path = require('node:path');
const { PDFDocument, StandardFonts } = require('pdf-lib');

async function generateFixtures() {
  const fixturesDir = path.join(__dirname, '..', 'fixtures');
  const benchDir = path.join(fixturesDir, 'benchmarks');
  if (!fs.existsSync(fixturesDir)) fs.mkdirSync(fixturesDir, { recursive: true });
  if (!fs.existsSync(benchDir)) fs.mkdirSync(benchDir, { recursive: true });

  const basePdfPath = path.join(__dirname, '..', 'Sameer_Ali_Khan_Resume.pdf');
  const baseBytes = fs.readFileSync(basePdfPath);

  // =========================================================================
  // 1. Layout 1: Modern Two-Column Tech Resume (resume_two_column_modern.pdf)
  // =========================================================================
  const docModern = await PDFDocument.load(baseBytes);
  while (docModern.getPageCount() > 0) docModern.removePage(0);
  const pageModern = docModern.addPage([612, 792]);
  const fontHelvetica = await docModern.embedFont(StandardFonts.Helvetica);
  const fontBold = await docModern.embedFont(StandardFonts.HelveticaBold);

  const linesModern = [
    { text: 'Alexander Chen', font: fontBold, size: 20 },
    { text: 'alexander.chen@techmail.io | +1-415-555-0182 | San Francisco, CA | linkedin.com/in/alenchen | github.com/alenchen', font: fontHelvetica, size: 9 },
    { text: '', font: fontHelvetica, size: 6 },
    { text: 'Professional Summary', font: fontBold, size: 12 },
    { text: 'Senior Full Stack & Cloud Infrastructure Engineer with 6+ years building high-throughput microservices and APIs.', font: fontHelvetica, size: 9.5 },
    { text: '', font: fontHelvetica, size: 6 },
    { text: 'Technical Skills', font: fontBold, size: 12 },
    { text: 'Skills: TypeScript, React, Node.js, Go, Python, PostgreSQL, GraphQL, Docker, Kubernetes, AWS', font: fontHelvetica, size: 9.5 },
    { text: '', font: fontHelvetica, size: 6 },
    { text: 'Professional Experience', font: fontBold, size: 12 },
    { text: 'Lead Platform Engineer | CloudScale Inc. | Jan 2021 - Present', font: fontBold, size: 10 },
    { text: '• Architected distributed ingestion pipeline processing 50k+ requests/sec across 14 Kubernetes clusters.', font: fontHelvetica, size: 9 },
    { text: '• Reduced average end-to-end API latency by 35% and cloud infrastructure expenditure by $180,000 annually.', font: fontHelvetica, size: 9 },
    { text: '• Led engineering migration from monolith to decoupled event-driven services with 99.99% system uptime.', font: fontHelvetica, size: 9 },
    { text: '', font: fontHelvetica, size: 4 },
    { text: 'Software Engineer | Datacore Systems | Jun 2018 - Dec 2020', font: fontBold, size: 10 },
    { text: '• Developed streaming telemetry service processing $12M+ in transactions daily using Go and PostgreSQL.', font: fontHelvetica, size: 9 },
    { text: '• Automated CI/CD deployment pipelines, cutting release cycle times by 60% across 8 engineering teams.', font: fontHelvetica, size: 9 },
    { text: '', font: fontHelvetica, size: 6 },
    { text: 'Education', font: fontBold, size: 12 },
    { text: 'Bachelor of Science in Computer Science | University of California, Berkeley | Aug 2014 - May 2018', font: fontHelvetica, size: 9.5 },
    { text: '', font: fontHelvetica, size: 6 },
    { text: 'Projects', font: fontBold, size: 12 },
    { text: 'OpenMesh: High-performance distributed in-memory cache written in Go handling 100k queries/sec.', font: fontHelvetica, size: 9.5 }
  ];

  let ym = 740;
  for (const item of linesModern) {
    if (item.text) pageModern.drawText(item.text, { x: 50, y: ym, font: item.font, size: item.size });
    ym -= (item.size + 4);
  }
  fs.writeFileSync(path.join(fixturesDir, 'resume_two_column_modern.pdf'), await docModern.save());

  fs.writeFileSync(path.join(benchDir, 'resume_modern.json'), JSON.stringify({
    id: 'resume_two_column_modern',
    layoutType: 'Two-Column Modern Tech',
    expectedFidelity: {
      name: 'Alexander Chen',
      email: 'alexander.chen@techmail.io',
      phone: '+1-415-555-0182',
      location: 'San Francisco, CA',
      requiredSkills: ['TypeScript', 'React', 'Node.js', 'Go', 'Python', 'PostgreSQL', 'Docker', 'Kubernetes', 'AWS'],
      minimumSkillCount: 6,
      hasEducation: true,
      hasExperience: true
    },
    formatQualityExpectedRange: { minScore: 85, maxScore: 100 },
    relevanceBenchmarks: {
      targetJobRole: 'Senior Backend Engineer',
      targetSkills: ['Go', 'PostgreSQL', 'Kubernetes', 'Docker', 'AWS'],
      expectedMatchRateMin: 0.80
    }
  }, null, 2));

  // =========================================================================
  // 2. Layout 2: Dense Academic CV (resume_academic_dense.pdf)
  // =========================================================================
  const docAcademic = await PDFDocument.load(baseBytes);
  while (docAcademic.getPageCount() > 0) docAcademic.removePage(0);
  const pageAcademic = docAcademic.addPage([612, 792]);
  const fontTimes = await docAcademic.embedFont(StandardFonts.TimesRoman);
  const fontTimesBold = await docAcademic.embedFont(StandardFonts.TimesRomanBold);

  const linesAcademic = [
    { text: 'Dr. Elena Rostova', font: fontTimesBold, size: 18 },
    { text: 'elena.rostova@stanford.edu | +1-650-555-0199 | Stanford, CA | elenarostova.dev', font: fontTimes, size: 9.5 },
    { text: '', font: fontTimes, size: 6 },
    { text: 'Academic Summary', font: fontTimesBold, size: 12 },
    { text: 'Postdoctoral Fellow in Computer Science specializing in Distributed Consensus and High-Throughput Replication.', font: fontTimes, size: 9.5 },
    { text: '', font: fontTimes, size: 6 },
    { text: 'Education', font: fontTimesBold, size: 12 },
    { text: 'Ph.D. in Computer Science | Stanford University | 2019 - 2024', font: fontTimesBold, size: 10 },
    { text: 'Dissertation: Byzantine Fault Tolerant Consensus Protocols for High-Latency Wide-Area Networks', font: fontTimes, size: 9 },
    { text: 'Master of Science in Applied Mathematics | MIT | 2017 - 2019', font: fontTimes, size: 9.5 },
    { text: 'Bachelor of Science in Computer Science | ETH Zurich | 2013 - 2017', font: fontTimes, size: 9.5 },
    { text: '', font: fontTimes, size: 6 },
    { text: 'Research Experience', font: fontTimesBold, size: 12 },
    { text: 'Postdoctoral Research Fellow | Stanford Distributed Systems Lab | Sep 2024 - Present', font: fontTimesBold, size: 10 },
    { text: '• Investigated asynchronous state machine replication protocols scaling to 5,000 distributed nodes.', font: fontTimes, size: 9 },
    { text: '• Formally verified consensus invariants using TLA+ and discovered 3 edge cases in prior literature.', font: fontTimes, size: 9 },
    { text: '', font: fontTimes, size: 6 },
    { text: 'Skills & Technical Competencies', font: fontTimesBold, size: 12 },
    { text: 'Skills: Distributed Systems, Formal Verification, Rust, C++, Python, Linux, TLA+, Paxos, Raft, Docker, PostgreSQL', font: fontTimes, size: 9.5 },
    { text: '', font: fontTimes, size: 6 },
    { text: 'Selected Publications & Projects', font: fontTimesBold, size: 12 },
    { text: '• E. Rostova et al., "Adaptive Quorum Protocols for Global Consensus", ACM SOSP, 2023.', font: fontTimes, size: 9 },
    { text: '• E. Rostova et al., "Formally Verified Asynchronous Replication in Rust", IEEE S&P, 2022.', font: fontTimes, size: 9 }
  ];

  let ya = 740;
  for (const item of linesAcademic) {
    if (item.text) pageAcademic.drawText(item.text, { x: 50, y: ya, font: item.font, size: item.size });
    ya -= (item.size + 4);
  }
  fs.writeFileSync(path.join(fixturesDir, 'resume_academic_dense.pdf'), await docAcademic.save());

  fs.writeFileSync(path.join(benchDir, 'resume_academic.json'), JSON.stringify({
    id: 'resume_academic_dense',
    layoutType: 'Academic Dense CV',
    expectedFidelity: {
      name: 'Dr. Elena Rostova',
      email: 'elena.rostova@stanford.edu',
      phone: '+1-650-555-0199',
      location: 'Stanford, CA',
      requiredSkills: ['Distributed Systems', 'Formal Verification', 'Rust', 'C++', 'Python', 'Linux', 'Docker'],
      minimumSkillCount: 4,
      hasEducation: true,
      hasExperience: true
    },
    formatQualityExpectedRange: { minScore: 65, maxScore: 85 },
    relevanceBenchmarks: {
      targetJobRole: 'Research Scientist - Systems',
      targetSkills: ['Distributed Systems', 'Rust', 'Formal Verification', 'C++'],
      expectedMatchRateMin: 0.75
    }
  }, null, 2));

  // =========================================================================
  // 3. Layout 3: Creative / UI-UX Resume (resume_creative_columns.pdf)
  // =========================================================================
  const docCreative = await PDFDocument.load(baseBytes);
  while (docCreative.getPageCount() > 0) docCreative.removePage(0);
  const pageCreative = docCreative.addPage([612, 792]);
  const fontCreativeHelv = await docCreative.embedFont(StandardFonts.Helvetica);
  const fontCreativeBold = await docCreative.embedFont(StandardFonts.HelveticaBold);

  const linesCreative = [
    { text: 'Maya Lin', font: fontCreativeBold, size: 22 },
    { text: 'maya.lin@designtech.io | +1-206-555-0143 | Seattle, WA | portfolio: mayadesign.io | github.com/mayalin-ui', font: fontCreativeHelv, size: 9 },
    { text: '', font: fontCreativeHelv, size: 6 },
    { text: 'Profile Summary', font: fontCreativeBold, size: 12 },
    { text: 'Senior Product Designer and Creative Technologist merging interactive UI/UX with modern frontend code.', font: fontCreativeHelv, size: 9.5 },
    { text: '', font: fontCreativeHelv, size: 6 },
    { text: 'Core Competencies & Skills', font: fontCreativeBold, size: 12 },
    { text: 'Skills: Figma, Design Systems, JavaScript, TypeScript, React, CSS3, Tailwind CSS, HTML5, User Research', font: fontCreativeHelv, size: 9.5 },
    { text: '', font: fontCreativeHelv, size: 6 },
    { text: 'Work Experience', font: fontCreativeBold, size: 12 },
    { text: 'Staff UI Designer | StudioPixel | 2021 - Present', font: fontCreativeBold, size: 10 },
    { text: '• Redesigned SaaS web application serving 1.2M active users, increasing onboarding completion by 28%.', font: fontCreativeHelv, size: 9 },
    { text: '• Created universal token-based Design System adopted across 14 cross-platform product squads.', font: fontCreativeHelv, size: 9 },
    { text: '', font: fontCreativeHelv, size: 4 },
    { text: 'UI Developer | Lumina Creative | 2018 - 2021', font: fontCreativeBold, size: 10 },
    { text: '• Built responsive component libraries in React and TypeScript achieving 100% WCAG 2.1 AA accessibility.', font: fontCreativeHelv, size: 9 },
    { text: '', font: fontCreativeHelv, size: 6 },
    { text: 'Education', font: fontCreativeBold, size: 12 },
    { text: 'Bachelor of Fine Arts in Interaction Design | University of Washington | 2014 - 2018', font: fontCreativeHelv, size: 9.5 },
    { text: '', font: fontCreativeHelv, size: 6 },
    { text: 'Projects', font: fontCreativeBold, size: 12 },
    { text: 'DesignTokens.dev: Open source CLI token generator with over 45k monthly downloads.', font: fontCreativeHelv, size: 9.5 }
  ];

  let yc = 740;
  for (const item of linesCreative) {
    if (item.text) pageCreative.drawText(item.text, { x: 50, y: yc, font: item.font, size: item.size });
    yc -= (item.size + 4);
  }
  fs.writeFileSync(path.join(fixturesDir, 'resume_creative_columns.pdf'), await docCreative.save());

  fs.writeFileSync(path.join(benchDir, 'resume_creative.json'), JSON.stringify({
    id: 'resume_creative_columns',
    layoutType: 'Creative UI/UX Resume',
    expectedFidelity: {
      name: 'Maya Lin',
      email: 'maya.lin@designtech.io',
      phone: '+1-206-555-0143',
      location: 'Seattle, WA',
      requiredSkills: ['Figma', 'Design Systems', 'JavaScript', 'React', 'TypeScript', 'CSS3', 'Tailwind CSS'],
      minimumSkillCount: 5,
      hasEducation: true,
      hasExperience: true
    },
    formatQualityExpectedRange: { minScore: 80, maxScore: 98 },
    relevanceBenchmarks: {
      targetJobRole: 'Lead UI/UX Engineer',
      targetSkills: ['Figma', 'Design Systems', 'React', 'CSS3', 'TypeScript'],
      expectedMatchRateMin: 0.80
    }
  }, null, 2));

  // =========================================================================
  // 4. Layout 4: Entry-Level / Early-Career (resume_entry_level.pdf)
  // =========================================================================
  const docEntry = await PDFDocument.load(baseBytes);
  while (docEntry.getPageCount() > 0) docEntry.removePage(0);
  const pageEntry = docEntry.addPage([612, 792]);
  const fontEntryHelv = await docEntry.embedFont(StandardFonts.Helvetica);
  const fontEntryBold = await docEntry.embedFont(StandardFonts.HelveticaBold);

  const linesEntry = [
    { text: 'Jordan Taylor', font: fontEntryBold, size: 20 },
    { text: 'jordan.taylor@university.edu | +1-512-555-0188 | Austin, TX | github.com/jordantaylor-dev', font: fontEntryHelv, size: 9 },
    { text: '', font: fontEntryHelv, size: 6 },
    { text: 'Objective', font: fontEntryBold, size: 12 },
    { text: 'Motivated Computer Science graduate seeking Junior Software Engineer role to leverage algorithms and web backend skills.', font: fontEntryHelv, size: 9.5 },
    { text: '', font: fontEntryHelv, size: 6 },
    { text: 'Education', font: fontEntryBold, size: 12 },
    { text: 'Bachelor of Science in Computer Science | University of Texas at Austin | 2020 - 2024', font: fontEntryBold, size: 10 },
    { text: 'GPA: 3.82/4.0 | Dean\'s Honor List | Coursework: Data Structures, Operating Systems, Computer Networks, Database Systems', font: fontEntryHelv, size: 9 },
    { text: '', font: fontEntryHelv, size: 6 },
    { text: 'Technical Skills', font: fontEntryBold, size: 12 },
    { text: 'Skills: Python, Java, C++, JavaScript, React, PostgreSQL, SQLite, Git, Linux, Docker, REST APIs', font: fontEntryHelv, size: 9.5 },
    { text: '', font: fontEntryHelv, size: 6 },
    { text: 'Experience', font: fontEntryBold, size: 12 },
    { text: 'Software Engineering Intern | Austin TechLab | May 2023 - Aug 2023', font: fontEntryBold, size: 10 },
    { text: '• Built automated test suite using Python and pytest covering 45 REST endpoints with 92% coverage.', font: fontEntryHelv, size: 9 },
    { text: '• Optimized SQL query join performance in PostgreSQL, decreasing average execution time by 40%.', font: fontEntryHelv, size: 9 },
    { text: '', font: fontEntryHelv, size: 6 },
    { text: 'Projects', font: fontEntryBold, size: 12 },
    { text: 'CampusMeal Tracker: Full-stack web application in React and PostgreSQL used by 1,200 students.', font: fontEntryHelv, size: 9.5 }
  ];

  let ye = 740;
  for (const item of linesEntry) {
    if (item.text) pageEntry.drawText(item.text, { x: 50, y: ye, font: item.font, size: item.size });
    ye -= (item.size + 4);
  }
  fs.writeFileSync(path.join(fixturesDir, 'resume_entry_level.pdf'), await docEntry.save());

  fs.writeFileSync(path.join(benchDir, 'resume_entry.json'), JSON.stringify({
    id: 'resume_entry_level',
    layoutType: 'Entry-Level Graduate',
    expectedFidelity: {
      name: 'Jordan Taylor',
      email: 'jordan.taylor@university.edu',
      phone: '+1-512-555-0188',
      location: 'Austin, TX',
      requiredSkills: ['Python', 'Java', 'C++', 'JavaScript', 'React', 'PostgreSQL', 'Git', 'Linux'],
      minimumSkillCount: 5,
      hasEducation: true,
      hasExperience: true
    },
    formatQualityExpectedRange: { minScore: 80, maxScore: 98 },
    relevanceBenchmarks: {
      targetJobRole: 'Junior Software Engineer',
      targetSkills: ['Python', 'Java', 'PostgreSQL', 'Git'],
      expectedMatchRateMin: 0.75
    }
  }, null, 2));

  console.log('✓ All 4 diverse PDF layouts + benchmark JSON files generated successfully.');
}

generateFixtures()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Fixture generation failed:', err);
    process.exit(1);
  });
