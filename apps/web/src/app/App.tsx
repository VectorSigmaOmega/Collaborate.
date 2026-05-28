import { BrowserRouter, Route, Routes } from "react-router-dom";

import { AppErrorBoundary } from "../components/AppErrorBoundary";
import { HomePage } from "../pages/HomePage";
import { RoomPage } from "../pages/RoomPage";

export function App() {
  return (
    <AppErrorBoundary>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/:roomId" element={<RoomPage />} />
        </Routes>
      </BrowserRouter>
    </AppErrorBoundary>
  );
}
