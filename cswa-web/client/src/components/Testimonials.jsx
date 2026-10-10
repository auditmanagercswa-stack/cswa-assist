import { useEffect, useRef, useState } from 'react';
import Icon from './Icon.jsx';
import Reveal from './Reveal.jsx';
import SectionHeading from './SectionHeading.jsx';
import './Testimonials.css';

/** Soft background colours for initials avatars, picked by name. */
const AVATAR_COLORS = ['#5b8bc4', '#7a9e9f', '#8b8fc7', '#6fa3b8', '#9a8fb5'];

/** Profile picture: shows the photo when provided, else the person's initials. */
function Avatar({ name, src }) {
  const [failed, setFailed] = useState(false);
  const initials = name
    .split(' ')
    .map((part) => part[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
  const color = AVATAR_COLORS[name.length % AVATAR_COLORS.length];

  if (src && !failed) {
    return <img className="avatar" src={src} alt={name} onError={() => setFailed(true)} />;
  }
  return (
    <span className="avatar avatar--initials" style={{ background: color }} aria-hidden="true">
      {initials}
    </span>
  );
}

function Stars({ rating = 5 }) {
  return (
    <div className="stars" aria-label={`${rating} out of 5 stars`}>
      {Array.from({ length: 5 }, (_, i) => (
        <span key={i} className={i < rating ? 'is-on' : ''}>★</span>
      ))}
    </div>
  );
}

/**
 * Testimonials: a responsive card grid on desktop, and a swipeable
 * carousel with dots on mobile (CSS scroll-snap; dots sync with scroll).
 */
export default function Testimonials({ testimonials }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const trackRef = useRef(null);

  // Keep the mobile dots in sync with the scrolled card.
  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    const onScroll = () => {
      const card = track.firstElementChild;
      if (!card) return;
      setActiveIndex(Math.round(track.scrollLeft / (card.offsetWidth + 20)));
    };
    track.addEventListener('scroll', onScroll, { passive: true });
    return () => track.removeEventListener('scroll', onScroll);
  }, [testimonials]);

  const scrollTo = (index) => {
    const track = trackRef.current;
    const card = track?.children[index];
    if (card) track.scrollTo({ left: card.offsetLeft - track.offsetLeft, behavior: 'smooth' });
  };

  return (
    <section className="section testimonials" aria-label="Testimonials">
      <div className="container">
        <SectionHeading
          eyebrow="Client voices"
          title="Trusted by businesses and individuals"
          intro="What our clients say about working with the CSWA team."
        />

        <div ref={trackRef} className="testimonials__track">
          {testimonials.map((t, i) => (
            <Reveal as="figure" key={t.name} className="testimonial" delay={i * 100}>
              <Icon name="quote" size={30} className="testimonial__quote" />
              <Stars rating={t.rating} />
              <blockquote>{t.review}</blockquote>
              <figcaption>
                <Avatar name={t.name} src={t.avatar} />
                <span>
                  <strong>{t.name}</strong>
                  <small>{t.role}</small>
                </span>
              </figcaption>
            </Reveal>
          ))}
        </div>

        <div className="testimonials__dots">
          {testimonials.map((t, i) => (
            <button
              key={t.name}
              className={i === activeIndex ? 'is-active' : ''}
              aria-label={`Show testimonial ${i + 1}`}
              onClick={() => scrollTo(i)}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
