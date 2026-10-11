import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useAuctionStore } from "../store/auctionStore";
import { useAuctionWebSocket } from "../hooks/useAuctionWebSocket";
import { getAuctionStatus } from "../utils/auctionTime";
import { getAuctionCategoryLabel } from "../constants/auctionCategories";
import { endAuction, placeBid } from "../api/auction";
import { addToWatchlist, getWatchlist, removeFromWatchlist } from "../api/watchlist";
import "./AuctionDetails.css";
import "./MarketDesign.css";

function formatPrice(value) {
  const amount = Number(value);
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(Number.isFinite(amount) ? amount : 0);
}

function formatDate(value) {
  if (!value) return "â€”";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "â€”";
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function statusLabel(status) {
  if (status === "active") return "Live auction";
  if (status === "scheduled") return "Coming up";
  if (status === "ended") return "Auction ended";
  if (status === "cancelled") return "Cancelled";
  return status || "Auction";
}

function AuctionDetails() {
  const { auctionId } = useParams();
  const navigate = useNavigate();
  useAuctionWebSocket(auctionId);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 15000);
    return () => window.clearInterval(timer);
  }, []);
  const { user, signOut } = useAuth();
  const [bidAmount, setBidAmount] = useState("");
  const [bidError, setBidError] = useState("");
  const [isBidSubmitting, setIsBidSubmitting] = useState(false);
  const [endAuctionError, setEndAuctionError] = useState("");
  const [isEndingAuction, setIsEndingAuction] = useState(false);
  const [isOnWishlist, setIsOnWishlist] = useState(false);
  const [isSavingWishlist, setIsSavingWishlist] = useState(false);
  const [wishlistError, setWishlistError] = useState("");
  const auction = useAuctionStore((state) => state.auction);
  const bids = useAuctionStore((state) => state.bids);
  const isLoading = useAuctionStore((state) => state.isAuctionLoading);
  const error = useAuctionStore((state) => state.auctionError);
  const fetchAuctionDetails = useAuctionStore((state) => state.fetchAuctionDetails);
  const clearAuctionDetails = useAuctionStore((state) => state.clearAuctionDetails);
  const applyIncomingBid = useAuctionStore((state) => state.applyIncomingBid);

  useEffect(() => {
    fetchAuctionDetails(auctionId).catch(() => {});
    return clearAuctionDetails;
  }, [auctionId, fetchAuctionDetails, clearAuctionDetails]);

  useEffect(() => {
    if (!user?.id) return undefined;
    let isCurrent = true;
    getWatchlist()
      .then((savedAuctions) => {
        if (isCurrent) setIsOnWishlist(savedAuctions.some((savedAuction) => savedAuction.id === auctionId));
      })
      .catch(() => {});
    return () => { isCurrent = false; };
  }, [auctionId, user?.id]);

  const newestBids = [...bids].reverse();
  const status = getAuctionStatus(auction, now);
  const highestBid = bids.reduce(
    (highest, bid) => Math.max(highest, Number(bid.amount) || 0),
    Number(auction?.starting_price) || 0,
  );
  const minimumBid = bids.length
    ? highestBid + (Number(auction?.minimum_increment) || 0)
    : Number(auction?.starting_price) || 0;
  const isSeller = Boolean(auction && user?.id === auction.seller_id);

  async function handleBidSubmit(event) {
    event.preventDefault();
    setBidError("");
    if (Number(bidAmount) < minimumBid) {
      setBidError(`Your bid must be at least ${formatPrice(minimumBid)}.`);
      return;
    }

    setIsBidSubmitting(true);
    try {
      const bid = await placeBid(auction.id, bidAmount);
      applyIncomingBid({ auctionId: auction.id, bid });
      setBidAmount("");
    } catch (requestError) {
      const detail = requestError.response?.data?.detail;
      setBidError(Array.isArray(detail) ? detail.map((item) => item.msg).join(" ") : detail || "Your bid could not be placed. Please try again.");
    } finally {
      setIsBidSubmitting(false);
    }
  }

  async function handleEndAuction() {
    const confirmed = window.confirm("End this auction now? Bidding will stop and the highest bid will win.");
    if (!confirmed) return;

    setEndAuctionError("");
    setIsEndingAuction(true);
    try {
      await endAuction(auction.id);
      navigate(`/auctions/${auction.id}/result`);
    } catch (requestError) {
      const detail = requestError.response?.data?.detail;
      setEndAuctionError(detail || "The auction couldn't be ended. Please try again.");
    } finally {
      setIsEndingAuction(false);
    }
  }

  async function handleWishlistToggle() {
    if (!auction) return;
    setIsSavingWishlist(true);
    setWishlistError("");
    try {
      if (isOnWishlist) await removeFromWatchlist(auction.id);
      else await addToWatchlist(auction.id);
      setIsOnWishlist((saved) => !saved);
    } catch (requestError) {
      setWishlistError(requestError.response?.data?.detail || "Could not update your wishlist. Please try again.");
    } finally {
      setIsSavingWishlist(false);
    }
  }

  return (
    <main className="auction-detail-page">
      <header className="detail-header">
        <Link className="market-brand" to="/auctions"><span className="market-brand-mark">B</span> bidhouse</Link>
        <Link className="detail-back-link" to="/auctions"><span aria-hidden="true">â†</span> All lots</Link>
        <div className="detail-account">
          <span>Hi, {user?.name?.split(" ")[0]}</span>
          <button type="button" onClick={() => signOut().catch(() => {})}>Sign out</button>
        </div>
      </header>

      {isLoading && <div className="detail-message" role="status">Loading auction detailsâ€¦</div>}

      {!isLoading && error && (
        <div className="detail-message detail-error" role="alert">
          <h1>{error === "Auction not found" ? "Lot not found" : "We hit a snag"}</h1>
          <p>{error}</p>
          <button type="button" onClick={() => fetchAuctionDetails(auctionId).catch(() => {})}>Try again</button>
          <Link to="/auctions">Return to all lots</Link>
        </div>
      )}

      {!isLoading && !error && auction && (
        <>
          <div className="detail-breadcrumb"><Link to="/auctions">Explore lots</Link><span>/</span><span>{auction.title}</span></div>
          <section className="detail-main">
            <div className="detail-visual">
              <div className="detail-image-stage">
                {auction.image_url ? (
                  <img src={auction.image_url} alt={auction.title} />
                ) : (
                  <div className="detail-image-placeholder" aria-label="No item image available"><span>{auction.title?.charAt(0)?.toUpperCase() || "âœ³"}</span><small>IMAGE COMING SOON</small></div>
                )}
                <span className={`detail-status detail-status-${status}`}>
                  {status === "active" && <i />}{statusLabel(status)}
                </span>
                <button className={`detail-wishlist-toggle${isOnWishlist ? " is-saved" : ""}`} type="button" onClick={handleWishlistToggle} disabled={isSavingWishlist} aria-pressed={isOnWishlist} aria-label={isOnWishlist ? "Remove from wishlist" : "Add to wishlist"}>
                  {isSavingWishlist ? "Saving..." : isOnWishlist ? "♥ Saved" : "♡ Save lot"}
                </button>
                <span className="detail-image-count">01 <span>/</span> 01</span>
              </div>
              <p className="detail-image-note"><span aria-hidden="true">âœ³</span> A considered collection of objects with a story.</p>
            </div>

            <div className="detail-information">
              <span className="detail-eyebrow"><span className="detail-category-label">{getAuctionCategoryLabel(auction.category)}</span>BIDHOUSE SELECTS <span>Â·</span> LOT {auction.id.slice(0, 6).toUpperCase()}</span>
              <h1>{auction.title}</h1>
              <p className="detail-description">{auction.description || "A one-of-a-kind find, ready for its next chapter."}</p>
              {wishlistError && <p className="detail-bid-error" role="alert">{wishlistError}</p>}

              <div className="detail-price-block">
                <span>{bids.length ? "CURRENT HIGHEST BID" : "STARTING BID"}</span>
                <strong>{formatPrice(bids.length ? bids.reduce((highest, bid) => Math.max(highest, Number(bid.amount) || 0), Number(auction.starting_price) || 0) : auction.starting_price)}</strong>
                <small>{bids.length ? `${bids.length} ${bids.length === 1 ? "bid" : "bids"} placed` : "No bids yet"}</small>
              </div>

              <div className="detail-facts">
                <div><span>Minimum next bid</span><strong>{formatPrice(minimumBid)}</strong></div>
                <div><span>{status === "scheduled" ? "Bidding opens" : "Auction ends"}</span><strong>{formatDate(status === "scheduled" ? auction.start_time : auction.end_time)}</strong></div>
              </div>

              {status === "active" ? (
                <>
                  <div className="detail-next-step"><span className="detail-live-dot" /> Bidding is live</div>
                  {isSeller ? (
                    <div className="seller-auction-controls">
                      <p className="detail-bid-note">You can’t bid on your own auction.</p>
                      <button className="detail-end-auction-button" type="button" onClick={handleEndAuction} disabled={isEndingAuction}>
                        {isEndingAuction ? "Ending auction..." : "End auction now"}
                      </button>
                      {endAuctionError && <p className="detail-bid-error" role="alert">{endAuctionError}</p>}
                    </div>
                  ) : (
                    <form className="detail-bid-form" onSubmit={handleBidSubmit}>
                      <label htmlFor="bid-amount">Place your bid <span>Minimum {formatPrice(minimumBid)}</span></label>
                      <div className="detail-bid-controls">
                        <span aria-hidden="true">₹</span>
                        <input
                          id="bid-amount"
                          type="number"
                          min={minimumBid}
                          step="0.01"
                          value={bidAmount}
                          onChange={(event) => { setBidError(""); setBidAmount(event.target.value); }}
                          placeholder={String(minimumBid)}
                          required
                        />
                        <button type="submit" disabled={isBidSubmitting || !bidAmount || Number(bidAmount) < minimumBid}>
                          {isBidSubmitting ? "Placing..." : "Place bid"}
                        </button>
                      </div>
                      {bidError && <p className="detail-bid-error" role="alert">{bidError}</p>}
                    </form>
                  )}
                </>
              ) : status === "ended" ? (
                <div className="detail-ended-actions">
                  <div className="detail-next-step detail-ended-note">This auction has ended.</div>
                  <Link className="detail-result-link" to={`/auctions/${auction.id}/result`}>See winner and auction result <span aria-hidden="true">→</span></Link>
                </div>
              ) : status === "scheduled" ? (
                <div className="detail-next-step detail-scheduled-note">Get ready. This auction opens soon.</div>
              ) : null}

              <div className="detail-seller-note"><span className="seller-seal">B</span><p><strong>Thoughtfully found.</strong><br />Every lot deserves a second story.</p></div>
            </div>
          </section>

          <section className="detail-bid-history">
            <div className="history-heading">
              <div><span className="detail-eyebrow">THE AUCTION SO FAR</span><h2>Bid history <span>{bids.length}</span></h2></div>
              <span className="history-order">MOST RECENT FIRST</span>
            </div>
            {newestBids.length === 0 ? (
              <div className="history-empty"><span aria-hidden="true">âœ³</span><p>No bids yet. Be the first when bidding opens.</p></div>
            ) : (
              <ol className="history-list">
                {newestBids.map((bid, index) => (
                  <li key={bid.id}>
                    <span className="history-number">{String(newestBids.length - index).padStart(2, "0")}</span>
                    <span className="history-bid-label">{bid.bidder_name || "Bidder"}</span>
                    <time dateTime={bid.created_at}>{formatDate(bid.created_at)}</time>
                    <strong>{formatPrice(bid.amount)}</strong>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </>
      )}

      <footer className="detail-footer"><Link className="market-brand market-brand-footer" to="/auctions"><span className="market-brand-mark">B</span> bidhouse</Link><span>Good things deserve a second story.</span><span>Â© 2026 BIDHOUSE</span></footer>
    </main>
  );
}

export default AuctionDetails;


