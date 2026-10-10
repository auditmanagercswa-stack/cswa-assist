import { useEffect, useState } from 'react';
import Icon from './Icon.jsx';
import './Header.css';

/** Navigation links — `href` points at the section ids used in App.jsx. */
const NAV_LINKS = [
  { label: 'Home', href: '#home' },
  { label: 'Services', href: '#services' },
  { label: 'About', href: '#about' },
  { label: 'Contact', href: '#contact' },
];

/**
 * Sticky header.
 * - Gains a shadow/solid background once the page is scrolled.
 * - Highlights the link for the section currently on screen.
 * - Collapses into a slide-down menu on small screens.
 */
export default function Header({ company }) {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [active, setActive] = useState('#home');

  useEffect(() => {
    const onScroll = () => {
      setScrolled(window.scrollY > 12);

      // The active section is the last one whose top has passed the header.
      let current = NAV_LINKS[0].href;
      for (const { href } of NAV_LINKS) {
        const el = document.querySelector(href);
        if (el && el.getBoundingClientRect().top <= 120) current = href;
      }
      setActive(current);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Prevent the page behind the mobile menu from scrolling.
  useEffect(() => {
    document.body.style.overflow = menuOpen ? 'hidden' : '';
  }, [menuOpen]);

  return (
    <header className={`header ${scrolled ? 'header--scrolled' : ''}`}>
      <div className="container header__inner">
        <a href="#home" className="brand" onClick={() => setMenuOpen(false)}>
          <span className="brand__mark">{company.name.charAt(0)}</span>
          <span className="brand__text">
            <strong>{company.name}</strong>
            <small>{company.tagline}</small>
          </span>
        </a>

        <button
          className="header__toggle"
          aria-label={menuOpen ? 'Close menu' : 'Open menu'}
          aria-expanded={menuOpen}
          aria-controls="primary-nav"
          onClick={() => setMenuOpen((open) => !open)}
        >
          <Icon name={menuOpen ? 'close' : 'menu'} />
        </button>

        <nav id="primary-nav" className={`nav ${menuOpen ? 'nav--open' : ''}`} aria-label="Primary">
          <ul>
            {NAV_LINKS.map((link) => (
              <li key={link.href}>
                <a
                  href={link.href}
                  className={active === link.href ? 'is-active' : ''}
                  onClick={() => setMenuOpen(false)}
                >
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
          <a href="#contact" className="btn btn--primary nav__cta" onClick={() => setMenuOpen(false)}>
            Get in touch
          </a>
        </nav>
      </div>
    </header>
  );
}
