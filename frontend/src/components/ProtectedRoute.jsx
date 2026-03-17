import { Navigate } from 'react-router-dom';
import { getSession } from '../session';

export default function ProtectedRoute({ role, children }) {
  const session = getSession();
  if (!session || session.role !== role || !session.token) {
    return <Navigate to="/" replace />;
  }
  return children;
}
