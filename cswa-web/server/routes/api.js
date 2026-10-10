/**
 * API routes
 *
 *   GET  /api/content     → all site content (hero, services, stats, …)
 *   POST /api/contact     → consultation / contact request
 *   POST /api/newsletter  → newsletter signup
 *
 * Submissions are kept in memory for this simple demo backend. To persist
 * them, replace the `submissions` arrays with a database, a spreadsheet
 * integration or an email service (e.g. Nodemailer).
 */
import { Router } from 'express';
import * as content from '../data/content.js';

const router = Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const submissions = { contact: [], newsletter: [] };

router.get('/content', (_req, res) => {
  res.json(content);
});

router.post('/contact', (req, res) => {
  const { name = '', email = '', phone = '', message = '' } = req.body ?? {};

  if (!name.trim() || !EMAIL_RE.test(email) || !message.trim()) {
    return res
      .status(400)
      .json({ ok: false, error: 'Please provide your name, a valid email and a message.' });
  }

  submissions.contact.push({
    name: name.trim(),
    email: email.trim(),
    phone: phone.trim(),
    message: message.trim(),
    receivedAt: new Date().toISOString(),
  });
  console.log(`[contact] new request from ${email}`);
  res.json({ ok: true, message: 'Thank you! Our team will get back to you within one working day.' });
});

router.post('/newsletter', (req, res) => {
  const email = String(req.body?.email ?? '').trim().toLowerCase();

  if (!EMAIL_RE.test(email)) {
    return res.status(400).json({ ok: false, error: 'Please enter a valid email address.' });
  }
  if (submissions.newsletter.includes(email)) {
    return res.json({ ok: true, message: 'You are already subscribed — thank you!' });
  }

  submissions.newsletter.push(email);
  console.log(`[newsletter] subscribed ${email}`);
  res.json({ ok: true, message: 'Subscribed! Look out for our monthly compliance updates.' });
});

export default router;
