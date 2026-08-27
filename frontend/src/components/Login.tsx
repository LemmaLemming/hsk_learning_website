import { useState } from "react";
import { Navigate } from "react-router-dom";
import {
  signInWithGoogle,
  signInWithEmail,
} from "../firebase/firebaseConfig";
import { useAuth } from "../contexts/AuthContext";

export default function Login() {
  const { user } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (user) {
    return <Navigate to="/dashboard" replace />;
  }

  const handleEmailSignIn = async () => {
    setLoading(true);
    setError(null);
    try {
      await signInWithEmail(email, password);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setLoading(true);
    setError(null);
    try {
      await signInWithGoogle();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="brand-seal">字</div>
      <h2>HSK Learning App</h2>
      <p className="placeholder">Sign in to keep learning your vocabulary.</p>
      <div className="email-login">
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <button onClick={handleEmailSignIn} disabled={loading}>
          Sign in with Email
        </button>
      </div>
      <hr />
      <button className="google-btn" onClick={handleGoogleSignIn} disabled={loading}>
        Sign in with Google
      </button>
      {error && <p className="error">{error}</p>}
    </div>
  );
}
