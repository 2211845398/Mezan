import { RouterProvider } from 'react-router-dom';

import { router } from '@/routes/router';

/**
 * Kept for backward compatibility with any importer that still pulls `App`
 * directly (e.g. Storybook, tests). The production entry point (`main.tsx`)
 * wraps the router in providers; this shim simply exposes the router so a
 * hot-render of `<App />` inside an existing provider tree works.
 */
export default function App() {
  return <RouterProvider router={router} />;
}
