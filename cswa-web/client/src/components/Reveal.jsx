import { useEffect, useState } from 'react';
import useInView from '../hooks/useInView.js';

/**
 * Wraps any content so it fades and slides up when scrolled into view.
 * `delay` (ms) staggers items in a grid. The delay is dropped once the
 * reveal has finished so it doesn't slow down later hover transitions.
 */
export default function Reveal({ as: Tag = 'div', delay = 0, className = '', children, ...rest }) {
  const [ref, inView] = useInView();
  const [settled, setSettled] = useState(false);

  useEffect(() => {
    if (!inView || !delay) return;
    const timer = setTimeout(() => setSettled(true), delay + 750);
    return () => clearTimeout(timer);
  }, [inView, delay]);

  return (
    <Tag
      ref={ref}
      className={`reveal ${inView ? 'is-visible' : ''} ${className}`}
      style={delay && !settled ? { transitionDelay: `${delay}ms` } : undefined}
      {...rest}
    >
      {children}
    </Tag>
  );
}
