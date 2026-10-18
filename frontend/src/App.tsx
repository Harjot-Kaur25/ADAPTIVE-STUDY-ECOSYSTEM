import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useEffect } from 'react';
import LandingPage from './pages/LandingPage';
import AuthPage from './pages/AuthPage';
import DashboardPage from './pages/DashboardPage';
import SettingsPage from './pages/SettingsPage';
import BurnoutPage from './pages/BurnoutPage';
import ScrollEffects from './components/ScrollEffects';

function RouteFrame() {
  const location = useLocation();
  useEffect(() => { window.scrollTo({ top: 0, behavior: 'instant' }); }, [location.pathname]);
  return <><ScrollEffects /><Routes>
    <Route path="/" element={<LandingPage />} />
    <Route path="/login" element={<AuthPage />} />
    <Route path="/dashboard" element={<DashboardPage />} />
    <Route path="/settings" element={<SettingsPage />} />
    <Route path="/burnout" element={<BurnoutPage />} />
    <Route path="/signup" element={<AuthPage />} />
    <Route path="*" element={<Navigate to="/" replace />} />
  </Routes></>;
}

export default function App() {
  return <BrowserRouter><RouteFrame /></BrowserRouter>;
}
