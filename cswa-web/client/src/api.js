/**
 * Small wrapper around fetch for the Express API.
 * Every call resolves to the parsed JSON body, or throws an Error whose
 * message is the server's error text.
 *
 * Static preview mode (`npm run build:preview`) has no server: content is
 * bundled in and the forms validate locally without sending anything.
 */
import * as bundledContent from '../../server/data/content.js';

const STATIC = import.meta.env.VITE_STATIC === 'true';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function request(path, options = {}) {
  const res = await fetch(`/api${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Something went wrong. Please try again.');
  return data;
}

export const getContent = () =>
  STATIC ? Promise.resolve(bundledContent) : request('/content');

export const sendContact = async (form) => {
  if (!STATIC) return request('/contact', { method: 'POST', body: JSON.stringify(form) });
  if (!form.name.trim() || !EMAIL_RE.test(form.email) || !form.message.trim()) {
    throw new Error('Please provide your name, a valid email and a message.');
  }
  return { ok: true, message: 'Preview only: the form works, but nothing was sent.' };
};

export const subscribe = async (email) => {
  if (!STATIC) return request('/newsletter', { method: 'POST', body: JSON.stringify({ email }) });
  if (!EMAIL_RE.test(email)) throw new Error('Please enter a valid email address.');
  return { ok: true, message: 'Preview only: the signup works, but nothing was saved.' };
};
