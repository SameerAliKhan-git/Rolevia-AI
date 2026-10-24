// Rolevia AI · Synthetic Resume Generator for Cross-Layout Verification (FEAT-003)
// Generates distinct realistic PDF layouts using pdf-lib:
// 1. Two-Column Modern Design
// 2. Dense Academic Research CV

const fs = require('node:fs');
const path = require('node:path');
const { PDFDocument, rgb, StandardFonts } = require('pdf-lib');

async function generateTestResumes() {
  const fixturesDir = path.join(__dirname, '..', 'fixtures');
  if (!fs.existsSync(fixturesDir)) {
    fs.mkdirSync(fixturesDir, { recursive: true });
  }

  // ==========================================
  // Layout 1: Two-Column Modern Tech Resume
  // ==========================================
  const doc1 = await PDFDocument.create();
  const fontRegular = await doc1.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc1.embedFont(StandardFonts.HelveticaBold);
  const page1 = doc1.addPage([612, 792]);

  // Sidebar background (Two-Column visual divider)
  page1.drawRectangle({
    x: 0,
    y: 0,
    width: 200,
    height: 792,
    color: rgb(0.95, 0.96, 0.98)
  });

  // Sidebar Content (Contact & Skills)
  page1.drawText('ALEX R. CHEN', { x: 25, y: 740, size: 16, font: fontBold, color: rgb(0.1, 0.2, 0.3) });
  page1.drawText('Cloud Systems Architect', { x: 25, y: 722, size: 10, font: fontRegular, color: rgb(0.3, 0.4, 0.5) });

  page1.drawText('CONTACT', { x: 25, y: 680, size: 11, font: fontBold, color: rgb(0.1, 0.2, 0.3) });
  page1.drawText('alex.chen@cloudarch.io', { x: 25, y: 660, size: 9, font: fontRegular });
  page1.drawText('+1-415-555-0142', { x: 25, y: 645, size: 9, font: fontRegular });
  page1.drawText('Seattle, WA, USA', { x: 25, y: 630, size: 9, font: fontRegular });
  page1.drawText('linkedin.com/in/alexrchen', { x: 25, y: 615, size: 9, font: fontRegular });
  page1.drawText('github.com/alexrchen', { x: 25, y: 600, size: 9, font: fontRegular });

  page1.drawText('CORE SKILLS', { x: 25, y: 560, size: 11, font: fontBold, color: rgb(0.1, 0.2, 0.3) });
  const skills = ['Kubernetes', 'Go / Golang', 'Terraform', 'AWS Architecture', 'Python', 'Docker', 'gRPC', 'PostgreSQL', 'Prometheus', 'CI/CD Pipelines'];
  let ySkill = 540;
  for (const s of skills) {
    page1.drawText(`• ${s}`, { x: 25, y: ySkill, size: 9, font: fontRegular });
    ySkill -= 16;
  }

  // Main Column Content (Experience, Education, Projects)
  const mx = 220;
  page1.drawText('PROFESSIONAL EXPERIENCE', { x: mx, y: 740, size: 13, font: fontBold, color: rgb(0.1, 0.2, 0.3) });

  page1.drawText('Lead Infrastructure Engineer · Datastream Networks', { x: mx, y: 715, size: 11, font: fontBold });
  page1.drawText('March 2022 - Present | Seattle, WA', { x: mx, y: 700, size: 9, font: fontRegular, color: rgb(0.4, 0.4, 0.4) });
  page1.drawText('• Engineered multi-region Kubernetes clusters handling 45,000 requests per second with 99.99% uptime.', { x: mx, y: 685, size: 9, font: fontRegular });
  page1.drawText('• Reduced AWS infrastructure operational expenses by 32% ($180,000 annual savings) via Karpenter autoscaling.', { x: mx, y: 670, size: 9, font: fontRegular });
  page1.drawText('• Implemented zero-trust mTLS service mesh using Istio across 120 internal microservices.', { x: mx, y: 655, size: 9, font: fontRegular });

  page1.drawText('Senior DevOps Engineer · CloudScale Solutions', { x: mx, y: 625, size: 11, font: fontBold });
  page1.drawText('June 2019 - February 2022 | San Francisco, CA', { x: mx, y: 610, size: 9, font: fontRegular, color: rgb(0.4, 0.4, 0.4) });
  page1.drawText('• Automated zero-downtime deployment pipelines for 80+ engineering team members using ArgoCD.', { x: mx, y: 595, size: 9, font: fontRegular });
  page1.drawText('• Cut deployment failure rate from 14% to under 0.8% with automated canary analysis.', { x: mx, y: 580, size: 9, font: fontRegular });

  page1.drawText('EDUCATION', { x: mx, y: 540, size: 13, font: fontBold, color: rgb(0.1, 0.2, 0.3) });
  page1.drawText('Bachelor of Science (B.S.) in Computer Science', { x: mx, y: 518, size: 10, font: fontBold });
  page1.drawText('University of Washington, Seattle | 2015 - 2019 | GPA 3.82 / 4.0', { x: mx, y: 504, size: 9, font: fontRegular, color: rgb(0.4, 0.4, 0.4) });

  page1.drawText('KEY PROJECTS', { x: mx, y: 465, size: 13, font: fontBold, color: rgb(0.1, 0.2, 0.3) });
  page1.drawText('KubeCost Optimizer (Open Source)', { x: mx, y: 445, size: 10, font: fontBold });
  page1.drawText('• Built Go CLI analyzing pod resource allocations; downloaded by 5,000+ GitHub developers.', { x: mx, y: 430, size: 9, font: fontRegular });

  const pdfBytes1 = await doc1.save();
  const path1 = path.join(fixturesDir, 'resume_two_column_modern.pdf');
  fs.writeFileSync(path1, pdfBytes1);
  console.log(`[Fixture Created] Two-Column Modern Resume: ${path1} (${pdfBytes1.length} bytes)`);

  // ==========================================
  // Layout 2: Dense Academic Research CV
  // ==========================================
  const doc2 = await PDFDocument.create();
  const fontReg2 = await doc2.embedFont(StandardFonts.TimesRoman);
  const fontBold2 = await doc2.embedFont(StandardFonts.TimesRomanBold);
  const page2 = doc2.addPage([612, 792]);

  let ay = 740;
  page2.drawText('DR. ELIZABETH MORGAN, Ph.D.', { x: 50, y: ay, size: 15, font: fontBold2 });
  ay -= 18;
  page2.drawText('Postdoctoral Researcher in Machine Learning & Computational Linguistics', { x: 50, y: ay, size: 10, font: fontReg2 });
  ay -= 16;
  page2.drawText('Email: e.morgan@stanford.edu | Phone: +1-650-555-0188 | Location: Stanford, CA | Web: stanford.edu/~emorgan', { x: 50, y: ay, size: 9, font: fontReg2 });
  ay -= 25;

  page2.drawText('EDUCATION', { x: 50, y: ay, size: 11, font: fontBold2 });
  ay -= 16;
  page2.drawText('Ph.D. in Computer Science (Artificial Intelligence Specialization) — Stanford University, 2020 - 2024', { x: 50, y: ay, size: 9.5, font: fontBold2 });
  ay -= 14;
  page2.drawText('Dissertation: "Scalable Attention Mechanisms for Efficient Sequence Modeling" | Advisor: Prof. Andrew Ng', { x: 60, y: ay, size: 9, font: fontReg2 });
  ay -= 16;
  page2.drawText('B.S. in Mathematics and Computer Science (Summa Cum Laude) — MIT, 2016 - 2020 | GPA: 4.9 / 5.0', { x: 50, y: ay, size: 9.5, font: fontBold2 });
  ay -= 25;

  page2.drawText('RESEARCH & WORK EXPERIENCE', { x: 50, y: ay, size: 11, font: fontBold2 });
  ay -= 16;
  page2.drawText('Research Scientist Intern — Google DeepMind, Mountain View, CA (June 2023 - Dec 2023)', { x: 50, y: ay, size: 9.5, font: fontBold2 });
  ay -= 14;
  page2.drawText('• Developed sparse cross-attention layers speeding transformer context processing by 4.2x while preserving 99.1% perplexity.', { x: 60, y: ay, size: 9, font: fontReg2 });
  ay -= 14;
  page2.drawText('• Published primary author paper at NeurIPS 2023 with 210 citations in first 10 months.', { x: 60, y: ay, size: 9, font: fontReg2 });
  ay -= 18;
  page2.drawText('Graduate Research Assistant — Stanford AI Lab (SAIL) (Sept 2020 - May 2024)', { x: 50, y: ay, size: 9.5, font: fontBold2 });
  ay -= 14;
  page2.drawText('• Led 6 PhD researchers on NSF Grant #182901 ($750,000 funding) developing robust self-supervised training algorithms.', { x: 60, y: ay, size: 9, font: fontReg2 });
  ay -= 14;
  page2.drawText('• Mentored 14 undergraduate students in PyTorch, distributed CUDA training, and empirical evaluation frameworks.', { x: 60, y: ay, size: 9, font: fontReg2 });
  ay -= 25;

  page2.drawText('TECHNICAL & ACADEMIC SKILLS', { x: 50, y: ay, size: 11, font: fontBold2 });
  ay -= 16;
  page2.drawText('Languages & Frameworks: Python, PyTorch, JAX, C++, CUDA, Triton, HuggingFace, NumPy, Git, Linux HPC', { x: 50, y: ay, size: 9, font: fontReg2 });
  ay -= 14;
  page2.drawText('Methodologies: Self-Supervised Learning, Sparse Attention, Mathematical Optimization, Statistical Analysis', { x: 50, y: ay, size: 9, font: fontReg2 });

  const pdfBytes2 = await doc2.save();
  const path2 = path.join(fixturesDir, 'resume_academic_dense.pdf');
  fs.writeFileSync(path2, pdfBytes2);
  console.log(`[Fixture Created] Academic Dense CV: ${path2} (${pdfBytes2.length} bytes)`);
}

generateTestResumes()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Error generating resumes:', err);
    process.exit(1);
  });
