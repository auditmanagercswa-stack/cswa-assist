import { useEffect, useState } from 'react';
import { getContent } from './api.js';
import Header from './components/Header.jsx';
import Hero from './components/Hero.jsx';
import Services from './components/Services.jsx';
import About from './components/About.jsx';
import Stats from './components/Stats.jsx';
import Testimonials from './components/Testimonials.jsx';
import Contact from './components/Contact.jsx';
import Footer from './components/Footer.jsx';

/**
 * Root component.
 * Loads all site content from the Express API once, then renders the page
 * sections in order. To reorder or remove a section, edit the JSX below;
 * to change text, figures or services, edit server/data/content.js.
 */
export default function App() {
  const [content, setContent] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    getContent()
      .then(setContent)
      .catch(() => setError('We could not load the page. Please make sure the server is running and refresh.'));
  }, []);

  if (error) return <div className="page-state page-state--error">{error}</div>;
  if (!content) return <div className="page-state"><span className="spinner" aria-label="Loading" /></div>;

  const { company, hero, services, about, stats, testimonials } = content;

  return (
    <>
      <a href="#main" className="skip-link">Skip to content</a>
      <Header company={company} />
      <main id="main">
        <Hero hero={hero} stats={stats} />
        <Services services={services} />
        <Stats stats={stats} />
        <About about={about} company={company} />
        <Testimonials testimonials={testimonials} />
        <Contact company={company} />
      </main>
      <Footer company={company} services={services} />
    </>
  );
}
