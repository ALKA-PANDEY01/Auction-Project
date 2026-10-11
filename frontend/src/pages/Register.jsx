import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { register } from "../api/auth";
import "./Auth.css";

function Register() {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);
    try {
      await register({ name, email, password });
      navigate("/login", { replace: true, state: { message: "Your account is ready. Sign in to start bidding." } });
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
        <div className="auth-panel-top"><span>Already have an account?</span><Link to="/login">Sign in <span aria-hidden="true">↗</span></Link></div>
        <div className="auth-card-wrap">
          <div className="auth-heading">
            <span className="auth-kicker">JOIN THE HUNT</span>
            <h2>Your next find starts here.</h2>
            <p>Create an account and get in on the action.</p>
          </div>
          {error && <div className="auth-alert auth-error" role="alert">{error}</div>}
          <form className="auth-form" onSubmit={handleSubmit}>
            <label htmlFor="register-name">Your name</label>
            <input id="register-name" type="text" name="name" autoComplete="name" placeholder="How should we call you?" value={name} onChange={(event) => setName(event.target.value)} required />
            <label htmlFor="register-email">Email address</label>
            <input id="register-email" type="email" name="email" autoComplete="email" placeholder="you@example.com" value={email} onChange={(event) => setEmail(event.target.value)} required />
            <label htmlFor="register-password">Password</label>
            <input id="register-password" type="password" name="password" autoComplete="new-password" placeholder="Create a password" value={password} onChange={(event) => setPassword(event.target.value)} required />
            <button className="auth-submit" type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Creating account…" : "Create account"}<span aria-hidden="true">→</span>
            </button>
          </form>
          <div className="auth-divider"><span>GOOD THINGS ARE WORTH A BID</span></div>
          <p className="auth-switch">Already have an account? <Link to="/login">Sign in</Link></p>
          <p className="auth-legal">By creating an account, you agree to our <a href="#terms">Terms</a> and <a href="#privacy">Privacy Policy</a>.</p>
        </div>
        <div className="auth-panel-bottom"><span>© 2026 BIDHOUSE</span><Link to="/auctions">Explore auctions <span aria-hidden="true">↗</span></Link></div>
      </section>
    </main>
  );
}

export default Register;
