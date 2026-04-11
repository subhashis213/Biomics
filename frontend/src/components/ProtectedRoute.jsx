import { Navigate } from 'react-router-dom';
import { getSession } from '../session';

export default function ProtectedRoute({ role, children }) {
  const session = getSession();
  if (!session || session.role !== role || !session.token) {
    return <Navigate to="/auth" replace />;
  }
  return children;
}
