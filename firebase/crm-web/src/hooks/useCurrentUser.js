/**
 * Current User hook
 *
 * Fetches the user document from Firestore and provides role-based info.
 * Combines Firebase Auth user with the users collection document.
 */

import { useState, useEffect } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../config/firebase';
import { useAuth } from './useAuth';

/**
 * Custom hook to get current user profile from Firestore
 * @returns {{ currentUser: object|null, loading: boolean, error: string|null }}
 */
export function useCurrentUser() {
  const { user: authUser, loading: authLoading } = useAuth();
  const [userProfile, setUserProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    // If auth is still loading, wait
    if (authLoading) {
      return;
    }

    // If no auth user, clear profile
    if (!authUser) {
      setUserProfile(null);
      setLoading(false);
      return;
    }

    // Subscribe to user document
    const userRef = doc(db, 'users', authUser.uid);
    const unsubscribe = onSnapshot(
      userRef,
      (snapshot) => {
        if (snapshot.exists()) {
          setUserProfile({
            id: snapshot.id,
            ...snapshot.data(),
            // Include auth info
            email: authUser.email,
            emailVerified: authUser.emailVerified,
          });
          setError(null);
        } else {
          // User authenticated but no profile document
          setUserProfile(null);
          setError('User profile not found. Please contact an administrator.');
        }
        setLoading(false);
      },
      (err) => {
        console.error('Error fetching user profile:', err);
        setError('Failed to load user profile');
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [authUser, authLoading]);

  // Combine loading states
  const isLoading = authLoading || loading;

  // Derived role checks
  const isAdmin = userProfile?.role === 'admin';
  const isLoanOfficer = userProfile?.role === 'loan_officer';
  const isDealer = userProfile?.role === 'dealer';
  const isTLCStaff = isAdmin || isLoanOfficer;
  const isActive = userProfile?.active === true;

  return {
    currentUser: userProfile,
    loading: isLoading,
    error,
    // Role helpers
    isAdmin,
    isLoanOfficer,
    isDealer,
    isTLCStaff,
    isActive,
    // Check if user can perform actions
    canClaimLeads: isTLCStaff && isActive,
    canReassignLeads: isAdmin && isActive,
    canViewAllLeads: isTLCStaff && isActive,
  };
}

export default useCurrentUser;
