/**
 * Sidebar Navigation Component
 *
 * Main navigation sidebar with TLC branding.
 */

import { NavLink } from 'react-router-dom';
import {
  QueueListIcon,
  ViewColumnsIcon,
  MagnifyingGlassIcon,
  ClockIcon,
  Cog6ToothIcon,
} from '@heroicons/react/24/outline';
import { useCurrentUser } from '../../hooks/useCurrentUser';

const navigation = [
  { name: 'Lead Queue', href: '/queue', icon: QueueListIcon },
  { name: 'My Pipeline', href: '/pipeline', icon: ViewColumnsIcon },
  { name: 'Search', href: '/search', icon: MagnifyingGlassIcon },
  { name: 'History', href: '/history', icon: ClockIcon },
];

const adminNavigation = [
  { name: 'Settings', href: '/settings', icon: Cog6ToothIcon },
];

export function Sidebar() {
  const { isAdmin } = useCurrentUser();

  return (
    <aside className="hidden lg:flex lg:flex-shrink-0">
      <div className="flex flex-col w-64">
        <div className="flex flex-col flex-grow bg-white border-r border-gray-200 pt-5 pb-4 overflow-y-auto">
          {/* Logo */}
          <div className="flex items-center flex-shrink-0 px-4">
            <img
              className="h-10 w-auto"
              src="/logo.png"
              alt="TLC Manufactured Home Loans"
            />
          </div>

          {/* Navigation */}
          <nav className="mt-8 flex-1 px-2 space-y-1">
            {navigation.map((item) => (
              <NavLink
                key={item.name}
                to={item.href}
                className={({ isActive }) =>
                  `group flex items-center px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
                    isActive
                      ? 'bg-primary-50 text-primary border-l-4 border-primary'
                      : 'text-gray-700 hover:bg-gray-50 hover:text-gray-900'
                  }`
                }
              >
                <item.icon
                  className="mr-3 flex-shrink-0 h-5 w-5"
                  aria-hidden="true"
                />
                {item.name}
              </NavLink>
            ))}

            {/* Admin Navigation */}
            {isAdmin && (
              <>
                <div className="pt-4 mt-4 border-t border-gray-200">
                  <p className="px-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">
                    Admin
                  </p>
                </div>
                {adminNavigation.map((item) => (
                  <NavLink
                    key={item.name}
                    to={item.href}
                    className={({ isActive }) =>
                      `group flex items-center px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
                        isActive
                          ? 'bg-primary-50 text-primary border-l-4 border-primary'
                          : 'text-gray-700 hover:bg-gray-50 hover:text-gray-900'
                      }`
                    }
                  >
                    <item.icon
                      className="mr-3 flex-shrink-0 h-5 w-5"
                      aria-hidden="true"
                    />
                    {item.name}
                  </NavLink>
                ))}
              </>
            )}
          </nav>
        </div>
      </div>
    </aside>
  );
}

export default Sidebar;
