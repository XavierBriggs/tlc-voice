/**
 * PageHeader Component
 *
 * Consistent page header with title, description, and optional actions.
 */

export function PageHeader({ title, description, children }) {
  return (
    <div className="mb-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-bold text-gray-900 sm:truncate">
            {title}
          </h1>
          {description && (
            <p className="mt-1 text-sm text-gray-500">{description}</p>
          )}
        </div>

        {children && (
          <div className="mt-4 flex sm:ml-4 sm:mt-0">{children}</div>
        )}
      </div>
    </div>
  );
}

export default PageHeader;
