import useInView from '../hooks/useInView.js';
import useCountUp from '../hooks/useCountUp.js';
import './Stats.css';

/** One animated figure. Counting starts when the section scrolls into view. */
function StatItem({ value, suffix, label, start }) {
  const current = useCountUp(value, start);
  return (
    <div className="stat">
      <span className="stat__value">
        {current.toLocaleString('en-IN')}
        <span className="stat__suffix">{suffix}</span>
      </span>
      <span className="stat__label">{label}</span>
    </div>
  );
}

/** Statistics band with animated counters. Figures come from `stats` in content.js. */
export default function Stats({ stats }) {
  const [ref, inView] = useInView({ threshold: 0.35 });

  return (
    <section className="stats" aria-label="Key figures">
      <div ref={ref} className="container stats__grid">
        {stats.map((stat) => (
          <StatItem key={stat.label} {...stat} start={inView} />
        ))}
      </div>
    </section>
  );
}
