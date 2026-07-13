import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import Dashboard from "@/pages/Dashboard";
import Reports from "@/pages/Reports";
import SearchPage from "@/pages/SearchPage";
import Targets from "@/pages/Targets";
import RadarPage from "@/pages/RadarPage";
import Institutions from "@/pages/Institutions";
import Watchlist from "@/pages/Watchlist";
import IndexPage from "@/pages/IndexPage";

export default function App() {
  return (
    <Router basename="/as">
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/reports" element={<Reports />} />
        <Route path="/search" element={<SearchPage />} />
        <Route path="/targets" element={<Targets />} />
        <Route path="/radar" element={<RadarPage />} />
        <Route path="/institutions" element={<Institutions />} />
        <Route path="/watchlist" element={<Watchlist />} />
        <Route path="/index" element={<IndexPage />} />
      </Routes>
    </Router>
  );
}
