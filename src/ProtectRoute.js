import { Navigate } from 'react-router-dom';
import { supabase } from './supabaseClient';

const ProtectedRoute = ({ children }) => {
  const user = supabase.auth.getUser(); // this is a promise, we fix it below

  // Because supabase.auth.getUser() is async, we need a small trick
  // Better solution: we use session directly

  const session = supabase.auth.session(); // should be available immediately

  if (!session) {
    // Not logged in → Redirect to login
    return <Navigate to="/login" replace />;
  }

  // Logged in → Allow access
  return children;
};

export default ProtectedRoute;