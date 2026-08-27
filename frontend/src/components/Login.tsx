import { useState } from "react";
import {
  signInWithGoogle,
  signInWithEmail,
} from "../firebase/firebaseConfig";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      <h2>HSK Learning App – Sign In</h2>
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
