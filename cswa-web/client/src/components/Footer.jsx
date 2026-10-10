import { useState } from 'react';
import { subscribe } from '../api.js';
import Icon from './Icon.jsx';
import './Footer.css';

/** Footer: brand blurb, quick links, contact info, socials and newsletter signup. */
export default function Footer({ company, services }) {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState({ state: 'idle', message: '' });

  const handleSubscribe = async (e) => {
    e.preventDefault();
    setStatus({ state: 'loading', message: '' });
    try {
      const res = await subscribe(email);
      setStatus({ state: 'success', message: res.message });
      setEmail('');
    } catch (err) {
      setStatus({ state: 'error', message: err.message });
    }
  };

  const socials = Object.entries(company.social ?? {});

  return (
    <footer className="footer">
      <div className="container footer__grid">
        <div className="footer__brand">
          <div className="brand">
            <span className="brand__mark">{company.name.charAt(0)}</span>
            <span className="brand__text">
              <strong>{company.name}</strong>
              <small>{company.tagline}</small>
            </span>
          </div>
          <p>{company.fullName} — helping clients stay compliant, informed and ready to grow.</p>
          <div className="footer__social">
            {socials.map(([network, url]) => (
              <a key={network} href={url} target="_blank" rel="noreferrer" aria-label={network}>
                <Icon name={network} size={18} />
              </a>
            ))}
          </div>
        </div>

        <div>
          <h4>Services</h4>
          <ul className="footer__links">
            {services.slice(0, 5).map((s) => (
              <li key={s.title}><a href="#services">{s.title}</a></li>
            ))}
          </ul>
        </div>

        <div>
          <h4>Contact</h4>
          <ul className="footer__contact">
            <li><Icon name="phone" size={16} /> <a href={`tel:${company.phone.replace(/\s/g, '')}`}>{company.phone}</a></li>
            <li><Icon name="mail" size={16} /> <a href={`mailto:${company.email}`}>{company.email}</a></li>
            <li><Icon name="pin" size={16} /> <span>{company.address}</span></li>
          </ul>
        </div>

        <div>
          <h4>Newsletter</h4>
          <p className="footer__note">Monthly compliance calendar and tax updates, straight to your inbox.</p>
          <form className="newsletter" onSubmit={handleSubscribe}>
            <input
              type="email"
              placeholder="Your email address"
              aria-label="Email address"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <button className="btn btn--accent" disabled={status.state === 'loading'}>
              {status.state === 'loading' ? '…' : 'Subscribe'}
            </button>
          </form>
          {status.message && (
            <p className={`footer__status footer__status--${status.state}`} role="status">
              {status.message}
            </p>
          )}
        </div>
      </div>

      <div className="container footer__bottom">
        <span>© {new Date().getFullYear()} {company.fullName}. All rights reserved.</span>
        <a href="#home">Back to top ↑</a>
      </div>
    </footer>
  );
}
