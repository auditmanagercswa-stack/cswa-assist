/**
 * Site content — the single place to customise what the website shows.
 *
 * The React client fetches all of this from GET /api/content, so editing
 * this file (and restarting the server) updates the site without touching
 * any component code.
 *
 * NOTE: the statistics and testimonials below are SAMPLE placeholders.
 * Replace them with CSWA's real figures and genuine client feedback
 * (with the clients' permission) before going live.
 */

export const company = {
  name: 'CSWA',
  fullName: 'CSWA Group of Companies',
  tagline: 'Tax, Audit & Business Advisory',
  email: 'info@cswa.in',
  phone: '+91 00000 00000',
  address: 'Your office address, City, State — PIN',
  hours: 'Mon – Sat, 9:30 AM – 6:30 PM',
  social: {
    linkedin: 'https://www.linkedin.com/',
    facebook: 'https://www.facebook.com/',
    instagram: 'https://www.instagram.com/',
    x: 'https://x.com/',
  },
};

export const hero = {
  eyebrow: 'Trusted financial partners',
  headline: 'Clarity in every number. Confidence in every decision.',
  description:
    'CSWA helps businesses and individuals stay compliant, plan smarter and grow with confidence — from GST and income tax to audits and strategic advisory.',
  primaryCta: { label: 'Book a Consultation', href: '#contact' },
  secondaryCta: { label: 'Explore Services', href: '#services' },
};

/**
 * `icon` must match a key in client/src/components/Icon.jsx.
 */
export const services = [
  {
    icon: 'receipt',
    title: 'GST Compliance',
    description:
      'Registration, monthly GSTR-1 / 3B filings, 2B reconciliation and notice handling — all on schedule.',
  },
  {
    icon: 'calculator',
    title: 'Income Tax & TDS',
    description:
      'ITR preparation for individuals and businesses, TDS returns, 26AS / AIS reconciliation and tax planning.',
  },
  {
    icon: 'shield',
    title: 'Audit & Assurance',
    description:
      'Statutory, tax and internal audits with clear findings that strengthen controls and stakeholder trust.',
  },
  {
    icon: 'book',
    title: 'Accounting & Bookkeeping',
    description:
      'Accurate books in Tally and modern tools, monthly MIS and clean financial statements.',
  },
  {
    icon: 'chart',
    title: 'Business Advisory',
    description:
      'Budgeting, cash-flow forecasting and growth strategy built around your numbers and goals.',
  },
  {
    icon: 'building',
    title: 'Company Formation & ROC',
    description:
      'Incorporation, LLP and partnership setup, annual ROC filings and secretarial compliance.',
  },
];

export const about = {
  title: 'A firm built on precision and partnership',
  paragraphs: [
    'CSWA Group of Companies brings together tax consultants, auditors and advisors who treat every client’s finances as carefully as their own.',
    'We combine deep regulatory knowledge with modern tools, so you get timely filings, transparent reporting and advice you can act on.',
  ],
  highlights: [
    'Dedicated relationship manager',
    'Deadline tracking for every filing',
    'Transparent, fixed-fee engagements',
    'Secure handling of your documents',
  ],
};

/** `value` is animated from 0; `suffix` is appended after the number. */
export const stats = [
  { value: 500, suffix: '+', label: 'Clients served' },
  { value: 12000, suffix: '+', label: 'Returns filed' },
  { value: 15, suffix: '+', label: 'Years of experience' },
  { value: 98, suffix: '%', label: 'Client retention' },
];

/**
 * `avatar` may be an image URL (e.g. '/avatars/priya.jpg' placed in
 * client/public/avatars). When empty, an initials avatar is drawn instead.
 */
export const testimonials = [
  {
    name: 'Sample Client A',
    role: 'Founder, Retail Business',
    avatar: '',
    rating: 5,
    review:
      'CSWA took GST completely off my plate. Filings are always on time and they explain every notice in plain language.',
  },
  {
    name: 'Sample Client B',
    role: 'Director, Manufacturing Firm',
    avatar: '',
    rating: 5,
    review:
      'Their audit team was thorough yet practical. The recommendations genuinely improved our internal controls.',
  },
  {
    name: 'Sample Client C',
    role: 'Salaried Professional',
    avatar: '',
    rating: 5,
    review:
      'My income tax return and capital-gains planning were handled smoothly. Quick responses every time I had a question.',
  },
];
