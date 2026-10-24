// Rolevia AI · Synthetic PDF Fixture Generator
// Uses pdf-lib with standard PDF container to generate standard, compliant binary PDFs for testing multi-layout resume parsing.

const fs = require('node:fs');
const path = require('node:path');
const { PDFDocument, StandardFonts } = require('pdf-lib');

async function generateFixtures() {
  const fixturesDir = path.join(__dirname, '..', 'fixtures');
  if (!fs.existsSync(fixturesDir)) {
    fs.mkdirSync(fixturesDir, { recursive: true });
  }

  const basePdfPath = path.join(__dirname, '..', 'Sameer_Ali_Khan_Resume.pdf');
  const baseBytes = fs.readFileSync(basePdfPath);

  // -------------------------------------------------------------------------
  // 1. Generate resume_two_column_modern.pdf
  // -------------------------------------------------------------------------
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
    if (item.text) {
      pageModern.drawText(item.text, { x: 50, y: ym, font: item.font, size: item.size });
    }
    ym -= (item.size + 4);
  }

  const modernBytes = await docModern.save();
  const modernPath = path.join(fixturesDir, 'resume_two_column_modern.pdf');
  fs.writeFileSync(modernPath, modernBytes);
  console.log(`✓ Generated: ${modernPath} (${modernBytes.length} bytes)`);

  // -------------------------------------------------------------------------
  // 2. Generate resume_academic_dense.pdf
  // -------------------------------------------------------------------------
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
    if (item.text) {
      pageAcademic.drawText(item.text, { x: 50, y: ya, font: item.font, size: item.size });
    }
    ya -= (item.size + 4);
  }

  const academicBytes = await docAcademic.save();
  const academicPath = path.join(fixturesDir, 'resume_academic_dense.pdf');
  fs.writeFileSync(academicPath, academicBytes);
  console.log(`✓ Generated: ${academicPath} (${academicBytes.length} bytes)`);
}

generateFixtures()
  .then(() => console.log('✓ All PDF fixtures generated successfully'))
  .catch(err => {
    console.error('Fixture generation failed:', err);
    process.exit(1);
  });
