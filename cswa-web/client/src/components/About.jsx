import Icon from './Icon.jsx';
import Reveal from './Reveal.jsx';
import './About.css';

/** About section: firm story on one side, highlight checklist on the other. */
export default function About({ about, company }) {
  return (
    <section id="about" className="section about">
      <div className="container about__inner">
        <Reveal className="about__copy">
          <span className="eyebrow">About {company.name}</span>
          <h2>{about.title}</h2>
          {about.paragraphs.map((text) => (
            <p key={text}>{text}</p>
          ))}
        </Reveal>

        <Reveal className="about__panel" delay={120}>
          <h3>Why clients choose us</h3>
          <ul>
            {about.highlights.map((item) => (
              <li key={item}>
                <span className="about__tick"><Icon name="check" size={16} /></span>
                {item}
              </li>
            ))}
          </ul>
        </Reveal>
      </div>
    </section>
  );
}
