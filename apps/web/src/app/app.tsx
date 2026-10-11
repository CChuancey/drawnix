import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './lib/auth';
import { BoardListPage } from './pages/board-list-page';
import { BoardPage } from './pages/board-page';
import { LoginPage } from './pages/login-page';
import { SharePage } from './pages/share-page';

export function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/" element={<BoardListPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/b/:id" element={<BoardPage />} />
          <Route path="/s/:token" element={<SharePage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
