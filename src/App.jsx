import {
  createHashRouter,
  createBrowserRouter,
  RouterProvider,
  Outlet,
  useLocation,
} from "react-router-dom";
import { Capacitor } from "@capacitor/core";

import Home            from "./pages/Home";
import CreateCapsule   from "./pages/CreateCapsule";
import LockedCapsule   from "./pages/LockedCapsule";
import UnlockedCapsule from "./pages/UnlockedCapsule";
import Login           from "./pages/Login";
import Profile         from "./pages/Profile";
import EditProfile     from "./pages/EditProfile";
import CapsuleDetail   from "./pages/CapsuleDetail";
import CapsuleViewer   from "./pages/CapsuleViewer";
import Messages        from "./pages/Messages";
import Search          from "./pages/Search";
import Notifications   from "./pages/Notifications";
import WorldTree       from "./pages/WorldTree";
import BottomNav       from "./components/BottomNav";
import PetCompanion    from "./components/PetCompanion";
import { PetProvider } from "./contexts/PetContext";
import { AuthProvider } from "./contexts/AuthContext";
import PetPage         from "./pages/PetPage";
import ProtectedRoute  from "./components/ProtectedRoute";

// Pages that should NOT show the bottom nav
const NO_NAV_ROUTES = ["/login"];

function Layout() {
  const location = useLocation();
  const showNav = !NO_NAV_ROUTES.includes(location.pathname);
  return (
    <>
      <Outlet />
      {showNav && <BottomNav />}
      <PetCompanion />
    </>
  );
}

const routes = [
  {
    element: <Layout />,
    children: [
      // ── Public ──────────────────────────────────────────────
      { path: "/login",          element: <Login /> },
      { path: "/capsule/:slug",  element: <CapsuleViewer /> },  // shareable links stay public

      // ── Protected ────────────────────────────────────────────
      {
        element: <ProtectedRoute />,
        children: [
          { path: "/",                 element: <Home /> },
          { path: "/create",           element: <CreateCapsule /> },
          { path: "/search",           element: <Search /> },
          { path: "/messages",         element: <Messages /> },
          { path: "/notifications",    element: <Notifications /> },
          { path: "/locked",           element: <LockedCapsule /> },
          { path: "/unlocked",         element: <UnlockedCapsule /> },
          { path: "/profile",          element: <Profile /> },
          { path: "/profile/edit",     element: <EditProfile /> },
          { path: "/profile/:userId",  element: <Profile /> },
          { path: "/capsule/id/:id",   element: <CapsuleDetail /> },
          { path: "/pet",              element: <PetPage /> },
          { path: "/world-tree",       element: <WorldTree /> },
        ],
      },
    ],
  },
];

// On native Capacitor (Android/iOS), pages are served from file:// — the server
// never sees the URL, so BrowserRouter's history API is useless there.
// HashRouter works because the hash is handled entirely client-side.
//
// On the web (Vercel), BrowserRouter is required so that real paths like
// /capsule/grgr-3gd4t5 are sent to the server and matched by Vercel rewrites,
// then matched here by the router. HashRouter would hide the path behind #,
// causing shared links to always land on "/" instead of the correct route.
const isNative = Capacitor.isNativePlatform();

const router = isNative
  ? createHashRouter(routes)
  : createBrowserRouter(routes);

export default function App() {
  return (
    <AuthProvider>
      <PetProvider>
        <RouterProvider router={router} />
      </PetProvider>
    </AuthProvider>
  );
}
