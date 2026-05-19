import { useState, useEffect } from 'react';

export function useWindowSize() {
  const [sz, setSz] = useState({
    w: typeof window !== 'undefined' ? window.innerWidth : 1200,
    h: typeof window !== 'undefined' ? window.innerHeight : 800,
  });
  useEffect(() => {
    const h = () => setSz({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener('resize', h);
    return () => window.removeEventListener('resize', h);
  }, []);
  return sz;
}
