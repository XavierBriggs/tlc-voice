/**
 * Login Page
 *
 * Authentication page with email/password login.
 */

import { useNavigate, useLocation, Navigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { LoginForm } from '../components/auth/LoginForm';

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { isAuthenticated, loading } = useAuth();

  // Get the intended destination or default to queue
  const from = location.state?.from?.pathname || '/queue';

  // If already authenticated, redirect
  if (!loading && isAuthenticated) {
    return <Navigate to={from} replace />;
  }

  const handleSuccess = () => {
    navigate(from, { replace: true });
  };

  return (
    <div className="min-h-screen flex">
      {/* Left side - branding */}
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-primary-light to-primary items-center justify-center p-12">
        <div className="max-w-md text-center">
          <img
            src="/logo.png"
            alt="TLC Manufactured Home Loans"
            className="h-16 w-auto mx-auto mb-8 brightness-0 invert"
          />
          <h1 className="text-3xl font-bold text-white mb-4">
            Welcome to TLC CRM
          </h1>
          <p className="text-primary-100 text-lg">
            Manage your leads, track your pipeline, and close more loans.
          </p>
        </div>
      </div>

      {/* Right side - login form */}
      <div className="flex-1 flex items-center justify-center p-8 bg-background">
        <div className="w-full max-w-md">
          {/* Mobile logo */}
          <div className="lg:hidden text-center mb-8">
            <img
              src="/logo.png"
              alt="TLC Manufactured Home Loans"
              className="h-12 w-auto mx-auto mb-4"
            />
          </div>

          <div className="card p-8">
            <div className="mb-8">
              <h2 className="text-2xl font-bold text-gray-900">Sign in</h2>
              <p className="mt-2 text-sm text-gray-600">
                Enter your credentials to access the CRM
              </p>
            </div>

            <LoginForm onSuccess={handleSuccess} />
          </div>

          <p className="mt-6 text-center text-xs text-gray-500">
            Need help? Contact your administrator.
          </p>
        </div>
      </div>
    </div>
  );
}

export default LoginPage;
