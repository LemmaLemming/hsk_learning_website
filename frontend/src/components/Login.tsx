import { useState } from "react";
import { Navigate } from "react-router-dom";
import {
  signInWithGoogle,
  signInWithEmail,
  registerWithEmail,
} from "../firebase/firebaseConfig";
import { useAuth } from "../contexts/AuthContext";

const CATS = `       /\\_/\\     /\\_/\\     /\\_/\\
      ( o.o )   ( o.o )   ( o.o )
       > ^ <     > ^ <     > ^ <
      /|   |\\   /|   |\\   /|   |\\
     (_|   |_) (_|   |_) (_|   |_)`;

export default function Login() {
  const { user } = useAuth();

  // Login form state
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  // Registration form state
  const [regEmail, setRegEmail] = useState("");
  const [regPassword, setRegPassword] = useState("");
  const [regConfirm, setRegConfirm] = useState("");

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

  const handleRegister = async () => {
    setError(null);
    if (regPassword !== regConfirm) {
      setError("Passwords do not match. Please try again.");
      return;
    }
    if (regPassword.length < 6) {
      setError("Password must be at least 6 characters long.");
      return;
    }
    setLoading(true);
    try {
      // On success the onAuthStateChanged listener auto-logs the user in.
      await registerWithEmail(regEmail, regPassword);
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
      <pre className="ascii-cats">{CATS}</pre>
      <h1>=== HSK Vocab Learner ===</h1>
      <p className="login-sub">Your retro guide to all 1-9 HSK levels.</p>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void handleEmailSignIn();
        }}
      >
        <fieldset>
          <legend>Login</legend>
          <label htmlFor="login-email">Email</label>
          <br />
          <input
            id="login-email"
            className="retro-input"
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <br />
          <br />
          <label htmlFor="login-password">Password</label>
          <br />
          <input
            id="login-password"
            className="retro-input"
            type="password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <br />
          <br />
          <button
            type="submit"
            className="retro-btn"
            disabled={loading || !email || !password}
          >
            [ Sign In ]
          </button>
        </fieldset>
      </form>

      <div className="google-row">
        <button
          type="button"
          className="retro-btn google-btn"
          onClick={handleGoogleSignIn}
          disabled={loading}
        >
          <img
            src="/old_google_button.png"
            alt="Google"
            className="google-logo"
          />
          Sign in
        </button>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void handleRegister();
        }}
      >
        <fieldset>
          <legend>New User? Register</legend>
          <label htmlFor="reg-email">Email</label>
          <br />
          <input
            id="reg-email"
            className="retro-input"
            type="email"
            placeholder="you@example.com"
            value={regEmail}
            onChange={(e) => setRegEmail(e.target.value)}
          />
          <br />
          <br />
          <label htmlFor="reg-password">Password</label>
          <br />
          <input
            id="reg-password"
            className="retro-input"
            type="password"
            placeholder="at least 6 characters"
            value={regPassword}
            onChange={(e) => setRegPassword(e.target.value)}
          />
          <br />
          <br />
          <label htmlFor="reg-confirm">Confirm password</label>
          <br />
          <input
            id="reg-confirm"
            className="retro-input"
            type="password"
            placeholder="type it again"
            value={regConfirm}
            onChange={(e) => setRegConfirm(e.target.value)}
          />
          <br />
          <br />
          <button
            type="submit"
            className="retro-btn"
            disabled={loading || !regEmail || !regPassword || !regConfirm}
          >
            [ Register ]
          </button>
        </fieldset>
      </form>

      {error && <pre className="error-pre">*** ERROR: {error} ***</pre>}

      <hr />
      <p className="login-footer">
        Dawn without the w is Dan, that's pretty cool | © 2026 HSK Vocab Trainer
      </p>
    </div>
  );
}