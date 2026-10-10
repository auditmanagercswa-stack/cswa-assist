/**
 * Small wrapper around fetch for the Express API.
 * Every call resolves to the parsed JSON body, or throws an Error whose
 * message is the server's error text.
 */
async function request(path, options = {}) {
  const res = await fetch(`/api${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Something went wrong. Please try again.');
  return data;
}

export const getContent = () => request('/content');

export const sendContact = (form) =>
  request('/contact', { method: 'POST', body: JSON.stringify(form) });

export const subscribe = (email) =>
  request('/newsletter', { method: 'POST', body: JSON.stringify({ email }) });
