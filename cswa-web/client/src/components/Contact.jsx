import { useState } from 'react';
import { sendContact } from '../api.js';
import Icon from './Icon.jsx';
import Reveal from './Reveal.jsx';
import './Contact.css';

const EMPTY_FORM = { name: '', email: '', phone: '', message: '' };

/**
 * Contact section: office details plus a consultation request form that
 * posts to POST /api/contact.
 */
export default function Contact({ company }) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [status, setStatus] = useState({ state: 'idle', message: '' });

  const update = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setStatus({ state: 'loading', message: '' });
    try {
      const res = await sendContact(form);
      setStatus({ state: 'success', message: res.message });
      setForm(EMPTY_FORM);
    } catch (err) {
      setStatus({ state: 'error', message: err.message });
    }
  };

  const details = [
    { icon: 'phone', label: 'Call us', value: company.phone, href: `tel:${company.phone.replace(/\s/g, '')}` },
    { icon: 'mail', label: 'Email', value: company.email, href: `mailto:${company.email}` },
    { icon: 'pin', label: 'Visit', value: company.address },
    { icon: 'clock', label: 'Hours', value: company.hours },
  ];

  return (
    <section id="contact" className="section contact">
      <div className="container contact__inner">
        <Reveal className="contact__info">
          <span className="eyebrow">Contact</span>
          <h2>Let’s talk about your finances</h2>
          <p>Tell us what you need and a CSWA specialist will reach out within one working day.</p>
          <ul>
            {details.map((d) => (
              <li key={d.label}>
                <span className="contact__icon"><Icon name={d.icon} size={20} /></span>
                <span>
                  <small>{d.label}</small>
                  {d.href ? <a href={d.href}>{d.value}</a> : <span>{d.value}</span>}
                </span>
              </li>
            ))}
          </ul>
        </Reveal>

        <Reveal as="form" className="contact__form" delay={120} onSubmit={handleSubmit} noValidate>
          <div className="field-row">
            <label className="field">
              <span>Full name *</span>
              <input name="name" value={form.name} onChange={update} required autoComplete="name" />
            </label>
            <label className="field">
              <span>Phone</span>
              <input name="phone" value={form.phone} onChange={update} type="tel" autoComplete="tel" />
            </label>
          </div>
          <label className="field">
            <span>Email *</span>
            <input name="email" value={form.email} onChange={update} type="email" required autoComplete="email" />
          </label>
          <label className="field">
            <span>How can we help? *</span>
            <textarea name="message" value={form.message} onChange={update} rows="4" required />
          </label>

          <button className="btn btn--primary btn--lg" disabled={status.state === 'loading'}>
            {status.state === 'loading' ? 'Sending…' : 'Request a consultation'}
          </button>

          {status.message && (
            <p className={`form-status form-status--${status.state}`} role="status">
              {status.message}
            </p>
          )}
        </Reveal>
      </div>
    </section>
  );
}
