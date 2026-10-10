import Icon from './Icon.jsx';
import Reveal from './Reveal.jsx';
import SectionHeading from './SectionHeading.jsx';
import './Services.css';

/** Grid of service cards. Content comes from `services` in content.js. */
export default function Services({ services }) {
  return (
    <section id="services" className="section services">
      <div className="container">
        <SectionHeading
          eyebrow="What we do"
          title="Financial services, end to end"
          intro="From day-to-day compliance to long-term strategy, our specialists keep your finances accurate, current and working for you."
        />

        <div className="services__grid">
          {services.map((service, i) => (
            <Reveal as="article" key={service.title} className="service-card" delay={i * 80}>
              <div className="service-card__icon">
                <Icon name={service.icon} size={28} />
              </div>
              <h3>{service.title}</h3>
              <p>{service.description}</p>
              <a href="#contact" className="service-card__link">
                Enquire <Icon name="arrow" size={16} />
              </a>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
