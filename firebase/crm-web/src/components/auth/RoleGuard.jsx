/**
 * RoleGuard Component
 *
 * Conditionally renders children based on user role.
 */

import { useCurrentUser } from '../../hooks/useCurrentUser';

/**
 * Guard component that only renders children if user has allowed role
 * @param {object} props
 * @param {string[]} props.allowedRoles - Array of roles that can see the content
 * @param {React.ReactNode} props.children - Content to render if authorized
 * @param {React.ReactNode} props.fallback - Content to render if not authorized
 */
export function RoleGuard({ allowedRoles, children, fallback = null }) {
  const { currentUser, loading } = useCurrentUser();

  if (loading) {
    return null;
  }

  if (!currentUser || !allowedRoles.includes(currentUser.role)) {
    return fallback;
  }

  return children;
}

/**
 * Guard that only shows content to admins
 */
export function AdminOnly({ children, fallback = null }) {
  return (
    <RoleGuard allowedRoles={['admin']} fallback={fallback}>
      {children}
    </RoleGuard>
  );
}

/**
 * Guard that only shows content to TLC staff (LOs and admins)
 */
export function TLCStaffOnly({ children, fallback = null }) {
  return (
    <RoleGuard allowedRoles={['loan_officer', 'admin']} fallback={fallback}>
      {children}
    </RoleGuard>
  );
}

export default RoleGuard;
