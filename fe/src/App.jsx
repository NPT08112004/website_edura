import React from "react";
import { Routes, Route, Navigate, useNavigate, useParams } from "react-router-dom";

import HomePage from "./components/HomePage.jsx";
import HomePageAdmin from "./components/HomePageAdmin.jsx";
import AdminDashboard from "./components/AdminDashboard.jsx";
import AdminPage from "./components/AdminPage.jsx";
import AdminDocumentPage from "./components/AdminDocumentPage.jsx";
import LoginForm from "./components/LoginForm.jsx";
import RegisterForm from "./components/RegisterForm.jsx";
import DocumentViewer from "./components/DocumentViewer.jsx";
import UploadPage from "./components/UploadPage.jsx";
import QuizUpload from "./components/QuizUpload.jsx";
import QuizList from "./components/QuizList.jsx";
import QuizTake from "./components/QuizTake.jsx";
import ProfilePage from "./components/Profile.jsx";
import MessagesPage from "./pages/MessagesPage.jsx";
import Trangchu from "./pages/Trangchu.jsx";
import SchoolExplorer from "./pages/SchoolExplorer.jsx";
import SchoolDetail from "./pages/SchoolDetail.jsx";


function HomeWrapper() {
  const navigate = useNavigate();
  const user = (() => {
    try { return JSON.parse(localStorage.getItem('edura_user') || '{}'); }
    catch { return {}; }
  })();
  const isAdmin = user?.role === 'admin';
  const onDocClick = (id) => navigate(`/document/${id}`);

  // Người có role admin vào HomePageAdmin, còn lại HomePage
  return isAdmin
    ? <HomePageAdmin
        switchToLogin={() => navigate('/login')}
        switchToRegister={() => navigate('/register')}
        switchToUpload={() => navigate('/upload')}
        onDocumentClick={onDocClick}
      />
    : <HomePage
        switchToLogin={() => navigate('/login')}
        switchToRegister={() => navigate('/register')}
        switchToUpload={() => navigate('/upload')}
        onDocumentClick={onDocClick}
      />;
}

function UploadWrapper() {
  const navigate = useNavigate();
  return <UploadPage 
    onBack={() => navigate('/')} 
    switchToLogin={() => navigate('/login')} 
  />;
}

function AdminWrapper() {
  const isLoggedIn = !!localStorage.getItem('edura_token');
  const user = (() => {
    try { return JSON.parse(localStorage.getItem('edura_user') || '{}'); }
    catch { return {}; }
  })();
  const isAdmin = user?.role === 'admin';
  if (!isLoggedIn) return <Navigate to="/login" />;
  if (!isAdmin)    return <Navigate to="/" />;
  return <AdminDashboard />;
}

function AdminUsersWrapper() {
  const isLoggedIn = !!localStorage.getItem('edura_token');
  const user = (() => {
    try { return JSON.parse(localStorage.getItem('edura_user') || '{}'); }
    catch { return {}; }
  })();
  const isAdmin = user?.role === 'admin';
  if (!isLoggedIn) return <Navigate to="/login" />;
  if (!isAdmin)    return <Navigate to="/" />;
  return <AdminPage />;
}

function AdminDocsWrapper() {
  const isLoggedIn = !!localStorage.getItem('edura_token');
  const user = (() => {
    try { return JSON.parse(localStorage.getItem('edura_user') || '{}'); }
    catch { return {}; }
  })();
  const isAdmin = user?.role === 'admin';
  if (!isLoggedIn) return <Navigate to="/login" />;
  if (!isAdmin)    return <Navigate to="/" />;
  return <AdminDocumentPage />;
}

function DocumentRoute() {
  const { id } = useParams();
  const navigate = useNavigate();
  return <DocumentViewer documentId={id} onBack={() => navigate(-1)} />;
}

export default function App() {
  const isLoggedIn = !!localStorage.getItem('edura_token');

  return (
    <Routes>
      {/* Trang chủ */}
      <Route path="/" element={<Trangchu />} />
      <Route path="/trangchu" element={<Trangchu />} />
      <Route path="/schools" element={<SchoolExplorer />} />
      <Route path="/schools/:schoolId" element={<SchoolDetail />} />
      <Route path="/home" element={<HomeWrapper />} />

      {/* Auth */}
      <Route path="/login" element={
        isLoggedIn ? <Navigate to="/" /> :
        <LoginForm
          switchToRegister={() => window.location.href = '/register'}
          switchToHome={() => window.location.href = '/'}
          bgImage="/images/96129c04-ea0b-4b5e-9f92-0710e3b6c647.png"
        />
      }/>
      <Route path="/register" element={
        isLoggedIn ? <Navigate to="/" /> :
        <RegisterForm
          switchToLogin={() => window.location.href = '/login'}
          switchToHome={() => window.location.href = '/'}
          bgImage="/images/96129c04-ea0b-4b5e-9f92-0710e3b6c647.png"
        />
      }/>

      {/* Upload */}
      <Route path="/upload" element={<UploadWrapper />} />

      {/* Admin */}
      <Route path="/admin" element={<AdminWrapper />} />
      <Route path="/admin/users" element={<AdminUsersWrapper />} />
      <Route path="/admin/documents" element={<AdminDocsWrapper />} />

      {/* Xem tài liệu */}
      <Route path="/document/:id" element={<DocumentRoute />} />

      {/* Fallback */}
      <Route path="*" element={<Navigate to="/" />} />

      {/* Quiz */}
      <Route path="/quizzes/new" element={<QuizUpload />} />
      <Route path="/quizzes" element={<QuizList />} />
      <Route path="/quiz/:id" element={<QuizTake />} />
      
      {/* Profile */}
      <Route path="/profile" element={localStorage.getItem('edura_token') ? <ProfilePage /> : <Navigate to="/login" />} />

      {/* Messages */}
      <Route path="/message" element={localStorage.getItem('edura_token') ? <MessagesPage /> : <Navigate to="/login" />} />


    </Routes>
  );
}
