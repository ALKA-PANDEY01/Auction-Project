import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getAuctionStatus } from "../utils/auctionTime";
import { getAuctionCategoryLabel } from "../constants/auctionCategories";
import { getWatchlist, removeFromWatchlist } from "../api/watchlist";
import { useAuth } from "../context/AuthContext";
import "./Auctions.css";
import "./MarketDesign.css";
import "./Wishlist.css";

function formatPrice(value) {
  const amount = Number(value);
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(Number.isFinite(amount) ? amount : 0);
}

function Wishlist() {
  const { user, signOut } = useAuth();
  const [auctions, setAuctions] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [removingId, setRemovingId] = useState(null);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    let isCurrent = true;
    getWatchlist()
      .then((items) => { if (isCurrent) setAuctions(items); })
      .catch((requestError) => {
        if (isCurrent) setError(requestError.response?.data?.detail || "We couldn't load your wishlist.");
      })
      .finally(() => { if (isCurrent) setIsLoading(false); });
    return () => { isCurrent = false; };
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 15000);
    return () => window.clearInterval(timer);
  }, []);

  async function handleRemove(auctionId) {
    setRemovingId(auctionId);
    setError("");
    try {
      await removeFromWatchlist(auctionId);
      setAuctions((current) => current.filter((auction) => auction.id !== auctionId));
    } catch (requestError) {
      setError(requestError.response?.data?.detail || "Could not remove this lot from your wishlist.");
    } finally {
      setRemovingId(null);
    }
  }

  return (
    <main className="auction-market wishlist-page">
      <header className="market-header">
        <Link className="market-brand" to="/auctions"><span className="market-brand-mark">B</span> bidhouse</Link>
        <nav className="market-nav" aria-label="Main navigation"><Link to="/auctions">Explore lots</Link><Link className="market-nav-active" to="/wishlist">My Wishlist</Link></nav>
        <div className="market-account"><span className="market-greeting">Hi, {user?.name?.split(" ")[0]}</span><button className="market-signin" type="button" onClick={() => signOut().catch(() => {})}>Sign out</button></div>
      </header>

      <section className="market-lots wishlist-content">
        <div className="lots-heading"><div><span className="market-section-kicker">YOUR SAVED LOTS</span><h2>For another <em>look.</em></h2><p>Keep track of the auctions you want to come back to.</p></div><Link className="wishlist-explore-link" to="/auctions">Explore auctions <span aria-hidden="true">→</span></Link></div>
        {error && <div className="market-message market-error" role="alert">{error}</div>}
        {isLoading ? (
          <div className="market-message" role="status">Loading your wishlist...</div>
        ) : auctions.length === 0 ? (
          <div className="market-message wishlist-empty"><span className="empty-sparkle" aria-hidden="true">♡</span><h3>Your wishlist is waiting.</h3><p>Save a lot that catches your eye and it will be here.</p><Link to="/auctions">Browse the collection</Link></div>
        ) : (
          <div className="lot-grid">
            {auctions.map((auction, index) => {
              const status = getAuctionStatus(auction, now);
              return (
                <article className="lot-card wishlist-card" key={auction.id}>
                  <Link className="wishlist-card-link" to={`/auctions/${auction.id}`}>
                    <div className={`lot-image lot-image-tone-${index % 4}`}>
                      {auction.image_url ? <img src={auction.image_url} alt={auction.title} loading="lazy" /> : <span className="lot-image-initial" aria-hidden="true">{auction.title?.charAt(0)?.toUpperCase() || "♡"}</span>}
                      <span className={`lot-status status-${status}`}>{status === "active" ? "Live auction" : status === "scheduled" ? "Coming up" : status}</span>
                      <span className="lot-category-badge">{getAuctionCategoryLabel(auction.category)}</span>
                    </div>
                    <div className="lot-card-body">
                      <div className="lot-card-title-row"><h3>{auction.title}</h3><span className="lot-number">LOT {auction.id.slice(0, 6).toUpperCase()}</span></div>
                      <p className="lot-description">{auction.description || "A one-of-a-kind find, ready for its next chapter."}</p>
                      <div className="lot-card-meta"><div><span>{status === "ended" ? "Final price" : "Current bid"}</span><strong>{formatPrice(status === "ended" && auction.final_price != null ? auction.final_price : auction.current_price)}</strong></div><div className="lot-time"><span>{status === "scheduled" ? "Opens" : status === "ended" ? "Ended" : "Ends"}</span><strong>{new Intl.DateTimeFormat("en-IN", { month: "short", day: "numeric", year: "numeric" }).format(new Date(status === "scheduled" ? auction.start_time : auction.end_time))}</strong></div></div>
                    </div>
                  </Link>
                  <button className="wishlist-remove-button" type="button" onClick={() => handleRemove(auction.id)} disabled={removingId === auction.id}>{removingId === auction.id ? "Removing..." : "Remove from wishlist"}</button>
                </article>
              );
            })}
          </div>
        )}
      </section>

      <footer className="market-footer"><Link className="market-brand market-brand-footer" to="/auctions"><span className="market-brand-mark">B</span> bidhouse</Link><span>Good things deserve a second story.</span><span>© 2026 BIDHOUSE</span></footer>
    </main>
  );
}

export default Wishlist;
