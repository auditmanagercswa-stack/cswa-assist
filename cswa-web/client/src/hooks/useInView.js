import { useEffect, useRef, useState } from 'react';

/**
 * Returns [ref, inView]. `inView` flips to true the first time the element
 * scrolls into the viewport (and stays true), which drives the fade-in
 * reveal animations and starts the statistics counters.
 */
export default function useInView(options = { threshold: 0.2 }) {
  const ref = useRef(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || inView) return;

    // Older browsers without IntersectionObserver: just show the content.
    if (!('IntersectionObserver' in window)) {
      setInView(true);
      return;
    }

    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setInView(true);
        observer.disconnect();
      }
    }, options);

    observer.observe(el);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inView]);

  return [ref, inView];
}
