import React, { Suspense, lazy } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import 'bootstrap/dist/css/bootstrap.min.css';
import './theme.css';
import './App.css';
import LandingPage from './pages/LandingPage';
import Toaster from './components/Toaster';
import RouteLogger from './components/RouteLogger';

// Route-level code splitting: each screen ships only when visited
const PaymentPage = lazy(() => import('./pages/PaymentPage'));
const LMSPage = lazy(() => import('./pages/LMSPage'));
const StudentDashboard = lazy(() => import('./pages/StudentDashboard'));
const AdminDashboard = lazy(() => import('./pages/AdminDashboard'));
const AuthPage = lazy(() => import('./pages/AuthPage'));
const CoursesPage = lazy(() => import('./pages/CoursesPage'));
const CourseDetailPage = lazy(() => import('./pages/CourseDetailPage'));
const WishlistPage = lazy(() => import('./pages/WishlistPage'));
const OrdersPage = lazy(() => import('./pages/OrdersPage'));
const InvoicePage = lazy(() => import('./pages/InvoicePage'));
const QuizPage = lazy(() => import('./pages/QuizPage'));
const CertificatesPage = lazy(() => import('./pages/CertificatesPage'));
const CertificatePage = lazy(() => import('./pages/CertificatePage'));
const ProfilePage = lazy(() => import('./pages/ProfilePage'));
const SupportPage = lazy(() => import('./pages/SupportPage'));
const MentorsPage = lazy(() => import('./pages/MentorsPage'));
const MentorDetailPage = lazy(() => import('./pages/MentorDetailPage'));
const EventsPage = lazy(() => import('./pages/EventsPage'));
const BookingsPage = lazy(() => import('./pages/BookingsPage'));
const NotFoundPage = lazy(() => import('./pages/NotFoundPage'));

// Protected Route Component
const ProtectedRoute = ({ children }) => {
  const user = localStorage.getItem('user');

  if (!user) {
    return <Navigate to="/auth" replace state={{ from: window.location.pathname }} />;
  }

  return children;
};

const protect = (element) => <ProtectedRoute>{element}</ProtectedRoute>;

function App() {
  return (
    <Router>
      <div className="App">
        <RouteLogger />
        <Suspense fallback={<div className="edu-loading"><span className="edu-spinner" /></div>}>
          <Routes>
            {/* Public */}
            <Route path="/" element={<LandingPage />} />
            <Route path="/auth" element={<AuthPage />} />
            <Route path="/courses" element={<CoursesPage />} />
            <Route path="/courses/:courseId" element={<CourseDetailPage />} />
            <Route path="/mentors" element={<MentorsPage />} />
            <Route path="/mentors/:mentorId" element={<MentorDetailPage />} />
            <Route path="/events" element={<EventsPage />} />
            <Route path="/support" element={<SupportPage />} />

            {/* Learner */}
            <Route path="/payment/:courseId" element={protect(<PaymentPage />)} />
            <Route path="/dashboard" element={protect(<StudentDashboard />)} />
            <Route path="/lms" element={protect(<LMSPage />)} />
            <Route path="/lms/:courseId" element={protect(<LMSPage />)} />
            <Route path="/lms/:courseId/quiz" element={protect(<QuizPage />)} />
            <Route path="/wishlist" element={protect(<WishlistPage />)} />
            <Route path="/orders" element={protect(<OrdersPage />)} />
            <Route path="/orders/:orderId" element={protect(<InvoicePage />)} />
            <Route path="/certificates" element={protect(<CertificatesPage />)} />
            <Route path="/certificates/:courseId" element={protect(<CertificatePage />)} />
            <Route path="/bookings" element={protect(<BookingsPage />)} />
            <Route path="/profile" element={protect(<ProfilePage />)} />

            {/* Admin */}
            <Route path="/admin-upload" element={protect(<AdminDashboard />)} />

            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </Suspense>
        <Toaster />
      </div>
    </Router>
  );
}

export default App;
