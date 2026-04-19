import React from 'react';
import { Routes, Route, Link, useLocation } from 'react-router-dom';
import { MarketListPage } from './pages/MarketListPage.js';
import { MarketDetailPage } from './pages/MarketDetailPage.js';
import { EdgesPage } from './pages/EdgesPage.js';
import { CalibrationPage } from './pages/CalibrationPage.js';
import { SavedPage } from './pages/SavedPage.js';
import { StatusPage } from './pages/StatusPage.js';

function NavLink({ to, children }: { to: string; children: React.ReactNode }) {
  const { pathname } = useLocation();
  const active = pathname === to;
  return (
    <Link
      to={to}
      className={`transition-colors ${active ? 'text-white' : 'text-gray-400 hover:text-white'}`}
    >
      {children}
    </Link>
  );
}

export function App() {
  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="border-b border-gray-800 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <Link to="/" className="text-xl font-bold text-white hover:text-cyan-400 transition-colors">
            Prediction Market Scanner
          </Link>
          <nav className="flex gap-6 text-sm">
            <NavLink to="/">Markets</NavLink>
            <NavLink to="/watchlist">Watchlist</NavLink>
            <NavLink to="/saved">Saved</NavLink>
            <NavLink to="/calibration">Calibration</NavLink>
            <NavLink to="/status">Status</NavLink>
          </nav>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 max-w-7xl mx-auto w-full px-6 py-6">
        <Routes>
          <Route path="/" element={<MarketListPage />} />
          <Route path="/watchlist" element={<EdgesPage />} />
          <Route path="/saved" element={<SavedPage />} />
          <Route path="/calibration" element={<CalibrationPage />} />
          <Route path="/status" element={<StatusPage />} />
          <Route path="/market/:platform/:id" element={<MarketDetailPage />} />
        </Routes>
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-800 px-6 py-4 text-center text-gray-600 text-xs">
        Data from Polymarket and Kalshi. Not financial advice.
      </footer>
    </div>
  );
}
