import { useEffect, useState } from 'react';

/** True when document root is RTL — used to flip categorical axis ordering. */
export function useChartRtl(): boolean {
  const [rtl, setRtl] = useState(
    () => typeof document !== 'undefined' && document.documentElement.getAttribute('dir') === 'rtl',
  );

  useEffect(() => {
    const root = document.documentElement;
    const obs = new MutationObserver(() => {
      setRtl(root.getAttribute('dir') === 'rtl');
    });
    obs.observe(root, { attributes: true, attributeFilter: ['dir'] });
    setRtl(root.getAttribute('dir') === 'rtl');
    return () => obs.disconnect();
  }, []);

  return rtl;
}
