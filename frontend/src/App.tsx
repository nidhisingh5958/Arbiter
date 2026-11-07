import { lazy, Suspense, type ReactNode } from 'react';
import { Route, Routes, useLocation } from 'react-router-dom';
import { AppShell } from './components/layout/AppShell';
import { NotFoundPage } from './pages/NotFoundPage';

// Route-level code splitting: AG Grid, GSAP and the review console load only where they are used.
const HomePage = lazy(() => import('./pages/HomePage').then((m) => ({ default: m.HomePage })));
const ContractsPage = lazy(() => import('./pages/ContractsPage').then((m) => ({ default: m.ContractsPage })));
const NewContractPage = lazy(() => import('./pages/NewContractPage').then((m) => ({ default: m.NewContractPage })));
const ContractDetailPage = lazy(() => import('./pages/ContractDetailPage').then((m) => ({ default: m.ContractDetailPage })));
const ReviewPage = lazy(() => import('./pages/ReviewPage').then((m) => ({ default: m.ReviewPage })));
const DashboardPage = lazy(() => import('./pages/DashboardPage').then((m) => ({ default: m.DashboardPage })));
const FundingReturnPage = lazy(() => import('./pages/FundingPages').then((m) => ({ default: m.FundingReturnPage })));
const FundingCancelPage = lazy(() => import('./pages/FundingPages').then((m) => ({ default: m.FundingCancelPage })));
const MockCheckoutPage = lazy(() => import('./pages/MockCheckoutPage').then((m) => ({ default: m.MockCheckoutPage })));

function PageFallback() {
  return (
    <div className="grid min-h-[50vh] place-items-center" aria-busy="true">
      <div className="h-1 w-40 overflow-hidden rounded-full bg-white/5">
        <div className="shine h-full w-full" />
      </div>
    </div>
  );
}

const page = (el: ReactNode) => <Suspense fallback={<PageFallback />}>{el}</Suspense>;

export function App() {
  const location = useLocation();

  // The checkout simulator stands in for an external page, so it renders without app chrome.
  if (location.pathname.startsWith('/mock-paypal')) {
    return (
      <Routes location={location}>
        <Route path="/mock-paypal/checkout" element={page(<MockCheckoutPage />)} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    );
  }

  return (
    <AppShell>
      <Routes location={location}>
        <Route path="/" element={page(<HomePage />)} />
        <Route path="/contracts" element={page(<ContractsPage />)} />
        <Route path="/contracts/new" element={page(<NewContractPage />)} />
        <Route path="/contracts/:id" element={page(<ContractDetailPage />)} />
        <Route path="/milestones/:id" element={page(<ReviewPage />)} />
        <Route path="/dashboard" element={page(<DashboardPage />)} />
        <Route path="/funding/return" element={page(<FundingReturnPage />)} />
        <Route path="/funding/cancel" element={page(<FundingCancelPage />)} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </AppShell>
  );
}
