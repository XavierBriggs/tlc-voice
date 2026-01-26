/**
 * Header Component
 *
 * Top header bar with user menu and mobile navigation toggle.
 */

import { Fragment } from 'react';
import { Menu, Transition } from '@headlessui/react';
import {
  Bars3Icon,
  UserCircleIcon,
  ArrowRightOnRectangleIcon,
} from '@heroicons/react/24/outline';
import { useAuth } from '../../hooks/useAuth';
import { useCurrentUser } from '../../hooks/useCurrentUser';
import { getInitials } from '../../lib/formatters';

export function Header({ onMenuClick }) {
  const { signOut } = useAuth();
  const { currentUser, isAdmin, isLoanOfficer, isDealer } = useCurrentUser();

  const getRoleBadge = () => {
    if (isAdmin) return 'Admin';
    if (isLoanOfficer) return 'Loan Officer';
    if (isDealer) return 'Dealer';
    return 'User';
  };

  return (
    <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
      <div className="px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          {/* Left side - mobile menu button */}
          <div className="flex items-center lg:hidden">
            <button
              type="button"
              className="inline-flex items-center justify-center p-2 rounded-md text-gray-500 hover:text-gray-700 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary"
              onClick={onMenuClick}
            >
              <span className="sr-only">Open sidebar</span>
              <Bars3Icon className="h-6 w-6" aria-hidden="true" />
            </button>

            {/* Mobile logo */}
            <img
              className="ml-4 h-8 w-auto"
              src="/logo.png"
              alt="TLC"
            />
          </div>

          {/* Right side - user menu */}
          <div className="flex items-center ml-auto">
            <Menu as="div" className="relative">
              <Menu.Button className="flex items-center space-x-3 p-2 rounded-lg hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-primary">
                {/* Avatar */}
                <div className="flex-shrink-0">
                  {currentUser?.avatar_url ? (
                    <img
                      className="h-9 w-9 rounded-full"
                      src={currentUser.avatar_url}
                      alt=""
                    />
                  ) : (
                    <div className="h-9 w-9 rounded-full bg-primary flex items-center justify-center">
                      <span className="text-sm font-medium text-white">
                        {getInitials(currentUser?.full_name)}
                      </span>
                    </div>
                  )}
                </div>

                {/* Name and role */}
                <div className="hidden md:block text-left">
                  <p className="text-sm font-medium text-gray-900">
                    {currentUser?.full_name || 'Loading...'}
                  </p>
                  <p className="text-xs text-gray-500">{getRoleBadge()}</p>
                </div>
              </Menu.Button>

              <Transition
                as={Fragment}
                enter="transition ease-out duration-100"
                enterFrom="transform opacity-0 scale-95"
                enterTo="transform opacity-100 scale-100"
                leave="transition ease-in duration-75"
                leaveFrom="transform opacity-100 scale-100"
                leaveTo="transform opacity-0 scale-95"
              >
                <Menu.Items className="absolute right-0 mt-2 w-56 origin-top-right rounded-lg bg-white shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none">
                  <div className="px-4 py-3 border-b border-gray-100">
                    <p className="text-sm font-medium text-gray-900">
                      {currentUser?.full_name}
                    </p>
                    <p className="text-sm text-gray-500 truncate">
                      {currentUser?.email}
                    </p>
                  </div>

                  <div className="py-1">
                    <Menu.Item>
                      {({ active }) => (
                        <a
                          href="/settings"
                          className={`${
                            active ? 'bg-gray-50' : ''
                          } flex items-center px-4 py-2 text-sm text-gray-700`}
                        >
                          <UserCircleIcon className="mr-3 h-5 w-5 text-gray-400" />
                          Your Profile
                        </a>
                      )}
                    </Menu.Item>
                  </div>

                  <div className="py-1 border-t border-gray-100">
                    <Menu.Item>
                      {({ active }) => (
                        <button
                          onClick={signOut}
                          className={`${
                            active ? 'bg-gray-50' : ''
                          } flex items-center w-full px-4 py-2 text-sm text-gray-700`}
                        >
                          <ArrowRightOnRectangleIcon className="mr-3 h-5 w-5 text-gray-400" />
                          Sign out
                        </button>
                      )}
                    </Menu.Item>
                  </div>
                </Menu.Items>
              </Transition>
            </Menu>
          </div>
        </div>
      </div>
    </header>
  );
}

export default Header;
