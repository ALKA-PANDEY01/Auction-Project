import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useAuctionStore } from "../store/auctionStore";
import { getAuctionStatus } from "../utils/auctionTime";
import { auctionCategories, getAuctionCategoryLabel } from "../constants/auctionCategories";
import { addToWatchlist, getWatchlist, removeFromWatchlist } from "../api/watchlist";
import "./Auctions.css";
import "./MarketDesign.css";

const filters = [
  { id: "all", label: "All lots" },
  { id: "active", label: "Live now" },
  { id: "scheduled", label: "Coming up" },
  { id: "ended", label: "Recently ended" },
];

function formatPrice(value) {
  const amount = Number(value);
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(Number.isFinite(amount) ? amount : 0);
}

function formatDate(value) {
  if (!value) return "Date to be announced";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Date to be announced";
  return new Intl.DateTimeFormat("en-IN", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function Auctions() {
  const navigate = useNavigate();
  const { user, isAuthenticated, signOut } = useAuth();
  const auctions = useAuctionStore((state) => state.auctions);
  const isLoading = useAuctionStore((state) => state.isAuctionsLoading);
  const error = useAuctionStore((state) => state.auctionsError);
  const fetchAuctions = useAuctionStore((state) => state.fetchAuctions);
  const [activeFilter, setActiveFilter] = useState("all");
  const [activeCategory, setActiveCategory] = useState("all");
  const [search, setSearch] = useState("");
  const [now, setNow] = useState(Date.now());
  const [watchlistIds, setWatchlistIds] = useState(() => new Set());
  const [savingWishlistIds, setSavingWishlistIds] = useState(() => new Set());
  const [wishlistError, setWishlistError] = useState("");

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 15000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    fetchAuctions().catch(() => {});
  }, [fetchAuctions]);

  useEffect(() => {
    if (!isAuthenticated) {
      setWatchlistIds(new Set());
      return undefined;
    }
    let isCurrent = true;
    getWatchlist()
      .then((savedAuctions) => {
        if (isCurrent) setWatchlistIds(new Set(savedAuctions.map((auction) => auction.id)));
      })
      .catch(() => {
        if (isCurrent) setWishlistError("Wishlist controls couldn't be loaded.");
      });
    return () => { isCurrent = false; };
  }, [isAuthenticated]);

  async function toggleWatchlist(auctionId) {
    if (!isAuthenticated) {
      navigate("/login", { state: { from: { pathname: "/auctions" } } });
      return;
    }
    const wasSaved = watchlistIds.has(auctionId);
    setWishlistError("");
    setSavingWishlistIds((current) => new Set(current).add(auctionId));
    try {
      if (wasSaved) await removeFromWatchlist(auctionId);
      else await addToWatchlist(auctionId);
      setWatchlistIds((current) => {
        const updated = new Set(current);
        if (wasSaved) updated.delete(auctionId);
        else updated.add(auctionId);
        return updated;
      });
    } catch (requestError) {
      setWishlistError(requestError.response?.data?.detail || "Could not update your wishlist. Please try again.");
    } finally {
      setSavingWishlistIds((current) => {
        const updated = new Set(current);
        updated.delete(auctionId);
        return updated;
      });
    }
  }

  const visibleAuctions = useMemo(() => {
    const query = search.trim().toLowerCase();
    return auctions.filter((auction) => {
      const status = getAuctionStatus(auction, now);
      const matchesStatus = activeFilter === "all" || status === activeFilter;
      const matchesCategory = activeCategory === "all" || auction.category === activeCategory;
      const matchesSearch = !query || `${auction.title} ${auction.description || ""} ${getAuctionCategoryLabel(auction.category)}`.toLowerCase().includes(query);
      return matchesStatus && matchesCategory && matchesSearch;
    });
  }, [auctions, activeFilter, activeCategory, search, now]);

  return (
    <main className="auction-market">
      <header className="market-header">
        <Link className="market-brand" to="/auctions"><span className="market-brand-mark">B</span> bidhouse</Link>
        <nav className="market-nav" aria-label="Main navigation">
          <a className="market-nav-active" href="#lots">Explore lots</a>
          <a href="#how-it-works">How it works</a>
        </nav>
        <div className="market-account">
          {isAuthenticated ? (
            <>
              <Link className="market-signin" to="/dashboard">Dashboard</Link>
              <Link className="market-signin" to="/wishlist">My Wishlist</Link>
              <Link className="market-signin" to="/auctions/create">Sell a lot</Link>
              <span className="market-greeting">Hi, {user?.name?.split(" ")[0]}</span>
              <button className="market-signin" type="button" onClick={() => signOut().catch(() => {})}>Sign out</button>
            </>
          ) : (
            <>
              <Link className="market-signin" to="/login">Sign in</Link>
              <Link className="market-register" to="/register">Create account <span aria-hidden="true">↗</span></Link>
            </>
          )}
        </div>
      </header>

      <section className="market-hero">
        <div className="market-hero-copy">
          <span className="market-eyebrow"><span className="market-pulse" /> A MARKETPLACE FOR THE REMARKABLE</span>
          <h1>Good things<br />find <em>new homes.</em></h1>
          <p>Discover pieces with a past, and give them a future. Your next favorite thing is one bid away.</p>
          <a className="market-hero-link" href="#lots">Explore the lots <span aria-hidden="true">↓</span></a>
        </div>
        <div className="market-hero-art" aria-hidden="true">
          <div className="art-sun" />
          <div className="art-vase"><span /></div>
          <div className="art-pedestal" />
          <div className="art-caption"><span>OBJECTS WITH A STORY</span><span>CURATED FINDS · 001</span></div>
        </div>
        <div className="market-hero-index">DISCOVER / BID / COLLECT</div>
      </section>

      <section className="market-lots" id="lots">
        <div className="lots-heading">
          <div>
            <span className="market-section-kicker">THE COLLECTION</span>
            <h2>Find your next <em>favorite.</em></h2>
          </div>
          <label className="lot-search">
            <span className="search-icon" aria-hidden="true">⌕</span>
            <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search the collection" aria-label="Search auctions" />
            <span className="search-shortcut">↵</span>
          </label>
        </div>

        <div className="lot-controls">
          <div className="lot-filters" role="tablist" aria-label="Filter auctions">
            {filters.map((filter) => (
              <button key={filter.id} className={activeFilter === filter.id ? "lot-filter is-selected" : "lot-filter"} type="button" role="tab" aria-selected={activeFilter === filter.id} onClick={() => setActiveFilter(filter.id)}>
                {filter.id === "active" && <span className="filter-live-dot" />}{filter.label}
              </button>
            ))}
          </div>
          <span className="lot-count">{isLoading ? "Loading lots…" : `${visibleAuctions.length} ${visibleAuctions.length === 1 ? "lot" : "lots"}`}</span>
        </div>

        <div className="category-filters" role="tablist" aria-label="Filter auctions by category">
          <button type="button" role="tab" aria-selected={activeCategory === "all"} className={activeCategory === "all" ? "category-filter is-selected" : "category-filter"} onClick={() => setActiveCategory("all")}>All categories</button>
          {auctionCategories.map((category) => (
            <button type="button" role="tab" key={category.value} aria-selected={activeCategory === category.value} className={activeCategory === category.value ? "category-filter is-selected" : "category-filter"} onClick={() => setActiveCategory(category.value)}>{category.label}</button>
          ))}
        </div>

        {wishlistError && <div className="wishlist-inline-error" role="alert">{wishlistError}</div>}

        {error && (
          <div className="market-message market-error" role="alert">
            <p>{error}</p><button type="button" onClick={() => fetchAuctions().catch(() => {})}>Try again</button>
          </div>
        )}

        {isLoading && !error && <div className="market-message" role="status">Gathering the latest lots…</div>}

        {!isLoading && !error && visibleAuctions.length === 0 && (
          <div className="market-message market-empty">
            <span className="empty-sparkle" aria-hidden="true">✳</span>
            <h3>{search ? "No lots found" : "Nothing in this collection just yet"}</h3>
            <p>{search ? "Try another search or choose a different filter." : "Check back soon. There’s always something good coming up."}</p>
            {(search || activeFilter !== "all" || activeCategory !== "all") && <button type="button" onClick={() => { setSearch(""); setActiveFilter("all"); setActiveCategory("all"); }}>See all lots</button>}
          </div>
        )}

        {!isLoading && !error && visibleAuctions.length > 0 && (
          <div className="lot-grid">
            {visibleAuctions.map((auction, index) => {
              const status = getAuctionStatus(auction, now);
              return (
              <article className="lot-card" key={auction.id}>
                <div className={`lot-image lot-image-tone-${index % 4}`}>
                  {auction.image_url ? <img src={auction.image_url} alt={auction.title} loading="lazy" /> : <span className="lot-image-initial" aria-hidden="true">{auction.title?.charAt(0)?.toUpperCase() || "✳"}</span>}
                  <span className={`lot-status status-${status}`}>
                    {status === "active" && <span className="filter-live-dot" />}
                    {status === "active" ? "Live auction" : status === "scheduled" ? "Coming up" : status}
                  </span>
                  <span className="lot-category-badge">{getAuctionCategoryLabel(auction.category)}</span>
                  <span className="lot-card-arrow" aria-hidden="true">↗</span>
                </div>
                <Link className="lot-card-body lot-card-body-link" to={`/auctions/${auction.id}`}>
                  <div className="lot-card-title-row"><h3>{auction.title}</h3><span className="lot-number">LOT {String(index + 1).padStart(2, "0")}</span></div>
                  <p className="lot-description">{auction.description || "A one-of-a-kind find, ready for its next chapter."}</p>
                  <div className="lot-card-meta">
                    <div><span>{status === "ended" ? "Winning bid" : "Current bid"}</span><strong>{formatPrice(auction.current_price)}</strong></div>
                    <div className="lot-time"><span>{status === "ended" ? "Ended" : status === "scheduled" ? "Starts" : "Ends"}</span><strong>{formatDate(status === "scheduled" ? auction.start_time : auction.end_time)}</strong></div>
                  </div>
                </Link>
                <button className={`wishlist-toggle${watchlistIds.has(auction.id) ? " is-saved" : ""}`} type="button" onClick={() => toggleWatchlist(auction.id)} disabled={savingWishlistIds.has(auction.id)} aria-pressed={watchlistIds.has(auction.id)} aria-label={watchlistIds.has(auction.id) ? "Remove from wishlist" : "Add to wishlist"}>
                  <span aria-hidden="true">{savingWishlistIds.has(auction.id) ? "…" : watchlistIds.has(auction.id) ? "♥" : "♡"}</span>
                  {watchlistIds.has(auction.id) ? "Saved" : "Save to wishlist"}
                </button>
              </article>
            );})}
          </div>
        )}
      </section>

      <footer className="market-footer" id="how-it-works">
        <Link className="market-brand market-brand-footer" to="/auctions"><span className="market-brand-mark">B</span> bidhouse</Link>
        <span>Good things deserve a second story.</span>
        <span>© 2026 BIDHOUSE</span>
      </footer>
    </main>
  );
}

export default Auctions;
