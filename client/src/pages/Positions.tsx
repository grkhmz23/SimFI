import { useEffect } from 'react';
import { useLocation } from 'wouter';

export default function Positions() {
  const [, setLocation] = useLocation();
  useEffect(() => {
    setLocation('/portfolio', { replace: true });
  }, [setLocation]);
  return null;
}
