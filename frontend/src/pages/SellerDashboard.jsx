import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { deleteAuction, endAuction, getMyAuctions, getMyBids } from "../api/auction";
import { useAuth } from "../context/AuthContext";
import { getAuctionStatus } from "../utils/auctionTime";
import { getAuctionCategoryLabel } from "../constants/auctionCategories";
import "./SellerDashboard.css";

function formatPrice(value) {
  const amount = Number(value);
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(Number.isFinite(amount) ? amount : 0);
}

function formatDate(value) {
  if (!value) return "Date not set";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Date not set";
  return new Intl.DateTimeFormat("en-IN", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function SellerDashboard() {
  const { user, signOut } = useAuth();
  const [auctions, setAuctions] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [endingId, setEndingId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [myBids, setMyBids] = useState([]);
  const [bidsError, setBidsError] = useState("");
  const [now, setNow] = useState(Date.now());

  const loadAuctions = useCallback(async () => {
    setIsLoading(true);
    setError("");
    try {
      const ownedAuctions = await getMyAuctions();
      setAuctions(ownedAuctions.filter(
        (auction) => String(auction.seller_id).toLowerCase() === String(user?.id).toLowerCase(),
      ));
    } catch (requestError) {
      setError(requestError.response?.data?.detail || "We couldn't load your auctions. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    loadAuctions();
  }, [loadAuctions]);

  useEffect(() => {
    getMyBids()
      .then(setMyBids)
      .catch((requestError) => setBidsError(requestError.response?.data?.detail || "We couldn't load your bidding activity."));
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 15000);
    return () => window.clearInterval(timer);
  }, []);

  async function handleEndAuction(auction) {
    const confirmed = window.confirm(`End “${auction.title}” now? Bidding will stop and the highest bid will win.`);
    if (!confirmed) return;

    setActionError("");
    setEndingId(auction.id);
    try {
      const result = await endAuction(auction.id);
      setAuctions((current) => current.map((item) => item.id === auction.id
        ? {
            ...item,
            status: "ended",
            winner_id: result.winner_id,
            final_price: result.winning_bid,
            ...(result.winning_bid !== null ? { current_price: result.winning_bid } : {}),
          }
        : item));
    } catch (requestError) {
      setActionError(requestError.response?.data?.detail || "The auction couldn't be ended. Please try again.");
    } finally {
      setEndingId(null);
    }
  }

  async function handleDeleteAuction(auction) {
    const confirmed = window.confirm(`Permanently delete "${auction.title}"? Its bid history and wishlist entries will also be removed.`);
    if (!confirmed) return;
    setActionError("");
    setDeletingId(auction.id);
    try {
      await deleteAuction(auction.id);
      setAuctions((current) => current.filter((item) => item.id !== auction.id));
    } catch (requestError) {
      setActionError(requestError.response?.data?.detail || "The auction couldn't be deleted. Please try again.");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <main className="seller-dashboard-page">
      <header className="seller-dashboard-header">
        <Link className="seller-dashboard-brand" to="/auctions"><span>B</span> bidhouse</Link>
        <nav aria-label="Dashboard navigation"><Link to="/auctions">Explore lots</Link><Link className="seller-nav-current" to="/dashboard">Dashboard</Link></nav>
        <div className="seller-dashboard-account"><span>Hi, {user?.name?.split(" ")[0]}</span><button type="button" onClick={() => signOut().catch(() => {})}>Sign out</button></div>
      </header>

      <section className="seller-dashboard-content">
        <div className="seller-dashboard-heading">
          <div><span className="seller-dashboard-kicker">SELLER WORKSPACE</span><h1>Your auctions</h1><p>Keep track of your lots and manage live bidding.</p></div>
          <Link className="seller-create-button" to="/auctions/create">Create new auction <span aria-hidden="true">+</span></Link>
        </div>

        {actionError && <div className="seller-dashboard-error" role="alert">{actionError}</div>}
        {isLoading ? (
          <div className="seller-dashboard-message" role="status">Loading your auctions...</div>
        ) : error ? (
          <div className="seller-dashboard-message seller-dashboard-error" role="alert"><p>{error}</p><button type="button" onClick={loadAuctions}>Try again</button></div>
        ) : auctions.length === 0 ? (
          <div className="seller-dashboard-empty"><span>01</span><h2>Your first lot starts here.</h2><p>Create an auction and invite bidders to discover it.</p><Link className="seller-create-button" to="/auctions/create">Create your first auction <span aria-hidden="true">+</span></Link></div>
        ) : (
          <div className="seller-auction-list">
            {auctions.map((auction) => {
              const status = getAuctionStatus(auction, now);
              return (
                <article className="seller-auction-card" key={auction.id}>
                  <Link className="seller-auction-image" to={`/auctions/${auction.id}`}>
                    {auction.image_url ? <img src={auction.image_url} alt={auction.title} /> : <span>{auction.title?.charAt(0)?.toUpperCase() || "B"}</span>}
                  </Link>
                  <div className="seller-auction-info">
                    <div className="seller-auction-title-row"><div><span className={`seller-status seller-status-${status}`}>{status === "active" ? "Live" : status === "scheduled" ? "Coming up" : status}</span><span className="seller-category-label">{getAuctionCategoryLabel(auction.category)}</span><h2>{auction.title}</h2></div><span className="seller-lot-id">LOT {auction.id.slice(0, 6).toUpperCase()}</span></div>
                    <div className="seller-auction-metrics">
                      <div><span>Starting price</span><strong>{formatPrice(auction.starting_price)}</strong></div>
                      <div><span>Current / highest bid</span><strong>{formatPrice(auction.current_price)}</strong></div>
                      <div><span>{status === "scheduled" ? "Opens" : "Ends"}</span><strong>{formatDate(status === "scheduled" ? auction.start_time : auction.end_time)}</strong></div>
                    </div>
                    <div className="seller-auction-actions">
                      <Link to={`/auctions/${auction.id}`}>Manage auction <span aria-hidden="true">→</span></Link>
                      {status === "active" && <button type="button" onClick={() => handleEndAuction(auction)} disabled={endingId === auction.id}>{endingId === auction.id ? "Ending..." : "End early"}</button>}
                      {status === "ended" && <button className="seller-delete-auction-button" type="button" onClick={() => handleDeleteAuction(auction)} disabled={deletingId === auction.id}>{deletingId === auction.id ? "Deleting..." : "Delete auction"}</button>}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
        <section className="seller-bid-activity" aria-labelledby="seller-bid-activity-title">
          <div className="seller-bid-activity-heading"><div><span className="seller-dashboard-kicker">BIDDER WORKSPACE</span><h2 id="seller-bid-activity-title">Your bidding activity</h2><p>Review every bid you have placed, including auctions that have ended.</p></div></div>
          {bidsError ? <div className="seller-dashboard-error" role="alert">{bidsError}</div> : myBids.length === 0 ? (
            <div className="seller-bids-empty">You haven’t placed any bids yet. <Link to="/auctions">Explore live auctions</Link></div>
          ) : (
            <div className="seller-bid-list">
              {myBids.map((bid) => (
                <Link className="seller-bid-row" to={`/auctions/${bid.auction_id}`} key={bid.id}>
                  <span className={`seller-status seller-status-${bid.auction_status}`}>{bid.auction_status === "active" ? "Live" : bid.auction_status}</span>
                  <strong>{bid.auction_title}</strong>
                  <span className="seller-bid-amount">{formatPrice(bid.amount)}</span>
                  <time dateTime={bid.created_at}>{formatDate(bid.created_at)}</time>
                  <span className="seller-bid-open">View lot</span>
                </Link>
              ))}
            </div>
          )}
        </section>
      </section>

      <footer className="seller-dashboard-footer"><Link className="seller-dashboard-brand" to="/auctions"><span>B</span> bidhouse</Link><span>Good things deserve a second story.</span><span>© 2026 BIDHOUSE</span></footer>
    </main>
  );
}

export default SellerDashboard;
