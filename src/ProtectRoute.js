import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { supabase } from './supabaseClient';

const ProtectedRoute = ({ children }) => {
  const [session, setSession] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    supabase.auth.getSession().then(({ data: { session: currentSession } }) => {
      if (isMounted) {
        setSession(currentSession);
        setIsLoading(false);
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, currentSession) => {
      if (isMounted) {
        setSession(currentSession);
        setIsLoading(false);
      }
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  if (isLoading) {
    return <div className="page">Loading...</div>;
  }

  if (!session) {
    return <Navigate to="/login" replace />;
  }

  return children;
};

export default ProtectedRoute;
