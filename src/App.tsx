import { BrowserRouter as Router, Navigate, Route, Routes } from "react-router-dom";
import Dashboard from "@/pages/Dashboard";
import Reports from "@/pages/Reports";
import SearchPage from "@/pages/SearchPage";
import Targets from "@/pages/Targets";
import RadarPage from "@/pages/RadarPage";
import Institutions from "@/pages/Institutions";
import Watchlist from "@/pages/Watchlist";
import IndexPage from "@/pages/IndexPage";
import { APP_BASENAME, APP_ROUTES } from "@/lib/appPaths";

export default function App() {
  return (
    <Router basename={APP_BASENAME}>
      <Routes>
        <Route path={APP_ROUTES.dashboard} element={<Dashboard />} />
        <Route path={APP_ROUTES.reports} element={<Reports />} />
        <Route path={APP_ROUTES.search} element={<SearchPage />} />
        <Route path={APP_ROUTES.targets} element={<Targets />} />
        <Route path={APP_ROUTES.radar} element={<RadarPage />} />
        <Route path={APP_ROUTES.institutions} element={<Institutions />} />
        <Route path={APP_ROUTES.watchlist} element={<Watchlist />} />
        <Route path={APP_ROUTES.manage} element={<IndexPage />} />
        <Route path={APP_ROUTES.legacyIndex} element={<Navigate to={APP_ROUTES.manage} replace />} />
      </Routes>
    </Router>
  );
}
