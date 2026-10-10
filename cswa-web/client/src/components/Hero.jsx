import Icon from './Icon.jsx';
import './Hero.css';

/**
 * Hero section: headline, description and call-to-action buttons on the
 * left; a decorative "dashboard" card on the right (pure CSS, no images).
 */
export default function Hero({ hero, stats = [] }) {
  return (
    <section id="home" className="hero">
      <div className="hero__blob hero__blob--one" aria-hidden="true" />
      <div className="hero__blob hero__blob--two" aria-hidden="true" />

      <div className="container hero__inner">
        <div className="hero__copy">
          <span className="eyebrow">{hero.eyebrow}</span>
          <h1>{hero.headline}</h1>
          <p className="hero__lead">{hero.description}</p>
          <div className="hero__actions">
            <a href={hero.primaryCta.href} className="btn btn--primary btn--lg">
              {hero.primaryCta.label}
              <Icon name="arrow" size={18} />
            </a>
            <a href={hero.secondaryCta.href} className="btn btn--ghost btn--lg">
              {hero.secondaryCta.label}
            </a>
          </div>
        </div>

        {/* Decorative visual — illustrates "financial clarity" */}
        <div className="hero__visual" aria-hidden="true">
          <div className="hero-card">
            <div className="hero-card__head">
              <span>Compliance overview</span>
              <span className="hero-card__pill">On track</span>
            </div>
            <div className="hero-card__bars">
              {[45, 62, 52, 78, 70, 92].map((h, i) => (
                <span key={i} style={{ height: `${h}%`, animationDelay: `${i * 90}ms` }} />
              ))}
            </div>
            <ul className="hero-card__list">
              <li><Icon name="check" size={16} /> GSTR-3B filed</li>
              <li><Icon name="check" size={16} /> TDS return submitted</li>
              <li><Icon name="check" size={16} /> Books reconciled</li>
            </ul>
          </div>
          {stats[0] && (
            <div className="hero-badge">
              <strong>{stats[0].value.toLocaleString('en-IN')}{stats[0].suffix}</strong>
              <span>{stats[0].label}</span>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
