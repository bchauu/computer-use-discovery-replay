import { useEffect, useState } from 'react';
import { currentRoute } from '../lib/routes.ts';

export function useBankRoute(onMemberDirectory: () => void) {
  const [route, setRoute] = useState(currentRoute);

  useEffect(() => {
    function changeRoute() {
      const nextRoute = currentRoute();
      if (nextRoute === '/members') onMemberDirectory();
      setRoute(nextRoute);
    }

    window.addEventListener('hashchange', changeRoute);
    return () => window.removeEventListener('hashchange', changeRoute);
  }, [onMemberDirectory]);

  useEffect(() => {
    window.scrollTo(0, 0);
    document.getElementById('content')?.focus();
  }, [route]);

  return route;
}
