import { useEffect, useRef, type ReactNode } from 'react';

type RevealProps = { children: ReactNode; className?: string; delay?: number; once?: boolean };

export default function Reveal({ children, className = '', delay = 0, once = true }: RevealProps) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        element.classList.add('is-visible');
        if (once) observer.unobserve(element);
      } else if (!once) element.classList.remove('is-visible');
    }, { threshold: 0.13, rootMargin: '0px 0px -4% 0px' });
    observer.observe(element);
    return () => observer.disconnect();
  }, [once]);
  return <div ref={ref} className={`reveal ${className}`} style={{ '--reveal-delay': `${delay}ms` } as React.CSSProperties}>{children}</div>;
}
