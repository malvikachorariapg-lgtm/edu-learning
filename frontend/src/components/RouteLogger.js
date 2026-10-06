import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { uiLog } from '../services/uiLog';

// Logs a page view on every route change (for journey analysis in the logs backend)
const RouteLogger = () => {
  const location = useLocation();
  const previous = useRef(document.referrer || '');

  useEffect(() => {
    uiLog('info', 'ui.page_view', {
      'url.path': location.pathname,
      'url.query': location.search || undefined,
      'app.previous_route': previous.current || undefined
    });
    previous.current = location.pathname;
  }, [location.pathname, location.search]);

  return null;
};

export default RouteLogger;
