import { createHashRouter, RouterProvider, Outlet, useLocation } from "react-router-dom";
import { Capacitor } from "@capacitor/core";

import Home           from "./pages/Home";
import CreateCapsule  from "./pages/CreateCapsule";
import LockedCapsule  from "./pages/LockedCapsule";
import UnlockedCapsule from "./pages/UnlockedCapsule";
import Login          from "./pages/Login";
import Profile        from "./pages/Profile";
import EditProfile    from "./pages/EditProfile";
import CapsuleDetail  from "./pages/CapsuleDetail";
import CapsuleViewer  from "./pages/CapsuleViewer";
import Messages       from "./pages/Messages";
import Search         from "./pages/Search";
import BottomNav      from "./components/BottomNav";

// Pages that should NOT show the bottom nav
const NO_NAV_ROUTES = ["/login"];

function Layout() {
  const location = useLocation();
  const showNav = !NO_NAV_ROUTES.includes(location.pathname);
  return (
    <>
      <Outlet />
      {showNav && <BottomNav />}
    </>
  );
}

// HashRouter is required for Capacitor (file:// protocol).
// On web it also works fine — the URL just shows /#/route.
const router = createHashRouter([
  {
    element: <Layout />,
    children: [
      { path: "/",                  element: <Home /> },
      { path: "/create",            element: <CreateCapsule /> },
      { path: "/search",            element: <Search /> },
      { path: "/messages",          element: <Messages /> },
      { path: "/locked",            element: <LockedCapsule /> },
      { path: "/unlocked",          element: <UnlockedCapsule /> },
      { path: "/login",             element: <Login /> },
      { path: "/profile",           element: <Profile /> },
      { path: "/profile/:userId",   element: <Profile /> },
      { path: "/profile/edit",      element: <EditProfile /> },
      { path: "/capsule/id/:id",    element: <CapsuleDetail /> },
      { path: "/capsule/:slug",     element: <CapsuleViewer /> },
    ],
  },
]);

export default function App() {
  return <RouterProvider router={router} />;
}
