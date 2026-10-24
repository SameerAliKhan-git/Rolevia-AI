// Rolevia AI · Official Centralized Brand Configuration (Frontend & Shared Module)
// Do NOT hardcode domain addresses throughout the codebase.

const BRAND_CONFIG = {
  productName: 'Rolevia AI',
  brandId: 'RoleviaAI',
  brandShort: 'Rolevia',
  intendedDomain: 'https://roleviaai.co.in',
  publicDomain: 'roleviaai.co.in',
  tagline: 'Your Career, Intelligently Accelerated.',
  description: 'AI-Powered Job Discovery, Resume Optimization & Application Automation Platform.',
  supportEmail: 'support@roleviaai.co.in',
  version: '0.1.0',
  legalEntity: 'Rolevia AI Technologies',
  copyrightYear: 2026,
  domainStatus: 'Domain configuration prepared for roleviaai.co.in pending official DNS verification.'
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = BRAND_CONFIG;
}

if (typeof window !== 'undefined') {
  window.BRAND_CONFIG = BRAND_CONFIG;
}
