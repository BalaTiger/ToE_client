import { useState, useEffect } from 'react';

export function Ellipsis() {
  const [dots, setDots] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setDots((prev) => (prev + 1) % 4);
    }, 500);

    return () => clearInterval(interval);
  }, []);

  return <span>{'.'.repeat(dots)}</span>;
}
