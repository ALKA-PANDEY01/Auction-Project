import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import "./Auth.css";

function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const { signIn } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);
    try {
      await signIn({ email, password });
      const destination = location.state?.from;
      navigate(destination ? `${destination.pathname}${destination.search || ""}${destination.hash || ""}` : "/auctions", { replace: true });
    } catch (requestError) {
      const detail = requestError.response?.data?.detail;
      setError(Array.isArray(detail) ? detail.map((item) => item.msg).join(" ") : detail || "Could not connect to the server. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-story" aria-label="About BidHouse">
        <Link className="auth-brand auth-brand-light" to="/auctions">
          <span className="brand-mark" aria-hidden="true">B</span> bidhouse
        </Link>
        <div className="story-copy">
          <span className="eyebrow"><span className="live-dot" /> THE GOOD FINDS GO FAST</span>
          <h1>Find it.<br />Bid for it.<br /><em>Make it yours.</em></h1>
          <p>A better way to discover one-of-a-kind pieces and give them a new story.</p>
        </div>
        <div className="story-footer"><span>01 / 03</span><span className="story-rule" /><span>Discover something different</span></div>
        <span className="story-orbit orbit-one" aria-hidden="true" />
        <span className="story-orbit orbit-two" aria-hidden="true" />
      </section>

      <section className="auth-panel">
        <div className="auth-panel-top"><span>Already part of the community?</span><Link to="/register">Create account <span aria-hidden="true">↗</span></Link></div>
        <div className="auth-card-wrap">
          <div className="auth-heading">
            <span className="auth-kicker">WELCOME BACK</span>
            <h2>Good to see you.</h2>
            <p>Sign in to pick up where the bidding gets good.</p>
          </div>
          {location.state?.message && <div className="auth-alert auth-success" role="status">{location.state.message}</div>}
          {error && <div className="auth-alert auth-error" role="alert">{error}</div>}
          <form className="auth-form" onSubmit={handleSubmit}>
            <label htmlFor="login-email">Email address</label>
            <input id="login-email" type="email" name="email" autoComplete="email" placeholder="you@example.com" value={email} onChange={(event) => setEmail(event.target.value)} required />
            <div className="field-label-row"><label htmlFor="login-password">Password</label></div>
            <input id="login-password" type="password" name="password" autoComplete="current-password" placeholder="Enter your password" value={password} onChange={(event) => setPassword(event.target.value)} required />
            <button className="auth-submit" type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Signing in…" : "Sign in"}<span aria-hidden="true">→</span>
            </button>
          </form>
          <div className="auth-divider"><span>YOUR NEXT GREAT FIND AWAITS</span></div>
          <p className="auth-switch">New to BidHouse? <Link to="/register">Create an account</Link></p>
          <p className="auth-legal">By continuing, you agree to our <a href="#terms">Terms</a> and <a href="#privacy">Privacy Policy</a>.</p>
        </div>
        <div className="auth-panel-bottom"><span>© 2026 BIDHOUSE</span><Link to="/auctions">Explore auctions <span aria-hidden="true">↗</span></Link></div>
      </section>
    </main>
  );
}

export default Login;
