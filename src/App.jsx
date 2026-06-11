import { BrowserRouter, Routes, Route } from "react-router-dom";

import Home from "./pages/Home";
import CreateCapsule from "./pages/CreateCapsule";
import LockedCapsule from "./pages/LockedCapsule";
import UnlockedCapsule from "./pages/UnlockedCapsule";
import Login from "./pages/Login";
import Profile from "./pages/Profile";
import CapsuleDetail from "./pages/CapsuleDetail";
import CapsulePage from "./pages/CapsulePage";
import CapsuleViewer from "./pages/CapsuleViewer";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/create" element={<CreateCapsule />} />
        <Route path="/locked" element={<LockedCapsule />} />
        <Route path="/unlocked" element={<UnlockedCapsule />} />
        <Route path="/login" element={<Login />} />
        <Route path="/profile" element={<Profile />} />
        {/* ID-based route moved to its own prefix so it doesn't shadow slug */}
        <Route path="/capsule/id/:id" element={<CapsuleDetail />} />
        {/* Slug-based shareable link — handles both locked and unlocked state */}
        <Route path="/capsule/:slug" element={<CapsuleViewer />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
