import Reveal from './Reveal.jsx';

/** Shared eyebrow + title + intro used at the top of each section. */
export default function SectionHeading({ eyebrow, title, intro, align = 'center' }) {
  return (
    <Reveal className={`section-heading section-heading--${align}`}>
      {eyebrow && <span className="eyebrow">{eyebrow}</span>}
      <h2>{title}</h2>
      {intro && <p>{intro}</p>}
    </Reveal>
  );
}
