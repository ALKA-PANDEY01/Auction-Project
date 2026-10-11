import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { createAuctionCheckout, createAuctionCodOrder, getAuction, getAuctionResult, getMyAuctionPayment, verifyAuctionPayment } from "../api/auction";
import { useAuth } from "../context/AuthContext";
import "./AuctionResult.css";
import "./MarketDesign.css";

function formatPrice(value) {
  const amount = Number(value);
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(Number.isFinite(amount) ? amount : 0);
}

function AuctionResult() {
  const { auctionId } = useParams();
  const { user, signOut } = useAuth();
  const [auction, setAuction] = useState(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [paymentState, setPaymentState] = useState(null);
  const [isPaying, setIsPaying] = useState(false);
  const [paymentMessage, setPaymentMessage] = useState("");
  const [mockCheckout, setMockCheckout] = useState(null);

  useEffect(() => {
    let isCurrent = true;
    async function loadResult() {
      setIsLoading(true);
      setError("");
      try {
        // Fetching the auction first refreshes its time-derived status before asking for the result.
        const auctionData = await getAuction(auctionId);
        const resultData = await getAuctionResult(auctionId);
        if (isCurrent) {
          setAuction(auctionData);
          setResult(resultData);
        }
        if (resultData.winner_id && resultData.winner_id === user?.id) {
          try {
            const paymentData = await getMyAuctionPayment(auctionId);
            if (isCurrent) setPaymentState(paymentData);
          } catch {
            // Payment status is supplementary; a lookup failure must not hide the auction result.
          }
        }
      } catch (requestError) {
        const detail = requestError.response?.data?.detail;
        if (isCurrent) {
          setError(detail || "We couldn't load this auction result. Please try again.");
        }
      } finally {
        if (isCurrent) setIsLoading(false);
      }
    }
    loadResult();
    return () => { isCurrent = false; };
  }, [auctionId, user?.id]);

  async function handlePayNow() {
    setIsPaying(true);
    setPaymentMessage("");
    try {
      const checkout = await createAuctionCheckout(auctionId);
      setMockCheckout(checkout);
    } catch (requestError) {
      setPaymentMessage(requestError.response?.data?.detail || requestError.message || "Unable to start checkout.");
    } finally {
      setIsPaying(false);
    }
  }

  async function handleMockGatewayOutcome(outcome) {
    if (!mockCheckout) return;
    setIsPaying(true);
    setPaymentMessage("");
    try {
      const order = await verifyAuctionPayment({
        payment_id: mockCheckout.payment_id,
        mock_payment_id: `mock_payment_${Date.now()}_${Math.random().toString(16).slice(2)}`,
        outcome,
      });
      setPaymentState({ status: "SUCCESS", method: "MOCK_ONLINE", order });
      setMockCheckout(null);
      setPaymentMessage("Mock payment verified. Your order is confirmed.");
    } catch (requestError) {
      setPaymentMessage(requestError.response?.data?.detail || "The mock payment could not be verified. Please try again.");
      if (outcome === "failure") setMockCheckout(null);
    } finally {
      setIsPaying(false);
    }
  }

  async function handleCashOnDelivery() {
    setIsPaying(true);
    setPaymentMessage("");
    try {
      const state = await createAuctionCodOrder(auctionId);
      setPaymentState(state);
      setPaymentMessage("");
    } catch (requestError) {
      setPaymentMessage(requestError.response?.data?.detail || "Could not place the COD order. Please try again.");
    } finally {
      setIsPaying(false);
    }
  }

  return (
    <main className="auction-result-page">
      <header className="result-header">
        <Link className="create-brand" to="/auctions"><span>B</span> bidhouse</Link>
        <Link className="result-back" to="/auctions">← All lots</Link>
        <div className="create-account"><span>Hi, {user?.name?.split(" ")[0]}</span><button type="button" onClick={() => signOut().catch(() => {})}>Sign out</button></div>
      </header>

      {isLoading ? (
        <div className="result-message" role="status">Loading auction result…</div>
      ) : error ? (
        <div className="result-message result-error" role="alert">
          <h1>Result unavailable</h1><p>{error === "Auction result is available after the auction ends" ? "This auction is still open. The winner will appear here once it ends." : error}</p><Link to="/auctions">Return to all lots</Link>
        </div>
      ) : auction && result ? (
        <section className="result-content">
          <div className="result-banner"><span className="result-kicker">THE AUCTION IS COMPLETE</span><h1>A new chapter<br />begins.</h1><p>{auction.title}</p></div>
          <article className="result-card">
            <div className="result-image">
              {auction.image_url ? <img src={auction.image_url} alt={auction.title} /> : <span>{auction.title?.charAt(0)?.toUpperCase() || "B"}</span>}
              <span className="result-sold-stamp">SOLD</span>
            </div>
            <div className="result-info">
              <span className="result-kicker">WINNING BIDDER</span>
              {result.winner_name ? (
                <>
                  <h2>{result.winner_name}</h2>
                  <div className="result-price-label">Winning bid</div>
              <strong className="result-price">{formatPrice(result.winning_bid)}</strong>
                  {result.winner_id === user?.id && (
                    <div className="winner-payment" aria-live="polite">
                      {paymentState?.order && paymentState.method === "CASH_ON_DELIVERY" ? (
                        <><span className="payment-success">Order confirmed</span><p>Cash on delivery selected. Pay when your lot arrives.</p>{paymentState.order?.id && <small>Order #{paymentState.order.id.slice(0, 8)}</small>}</>
                      ) : paymentState?.status === "SUCCESS" ? (
                        <><span className="payment-success">Payment complete</span><p>Your order is confirmed.</p>{paymentState.order?.id && <small>Order #{paymentState.order.id.slice(0, 8)}</small>}</>
                      ) : (
                        <>
                          <p>You won this lot. Choose how you want to pay.</p>
                          <button type="button" className="pay-now-button" onClick={handlePayNow} disabled={isPaying || Boolean(mockCheckout)}>{isPaying ? "Preparing checkout…" : `Pay ${formatPrice(result.winning_bid)} online`}</button>
                          <button type="button" className="cod-button" onClick={handleCashOnDelivery} disabled={isPaying || Boolean(mockCheckout)}>Cash on delivery</button>
                          {mockCheckout && <div className="mock-gateway" aria-live="polite"><strong>Mock payment gateway</strong><span>Test checkout for {formatPrice(result.winning_bid)}. No real payment will be taken.</span><button type="button" onClick={() => handleMockGatewayOutcome("success")} disabled={isPaying}>Simulate successful payment</button><button type="button" className="mock-fail-button" onClick={() => handleMockGatewayOutcome("failure")} disabled={isPaying}>Simulate declined payment</button><button type="button" className="mock-cancel-button" onClick={() => setMockCheckout(null)} disabled={isPaying}>Cancel</button></div>}
                          {paymentMessage && <p className="payment-feedback" role="status">{paymentMessage}</p>}
                        </>
                      )}
                    </div>
                  )}
                </>
              ) : (
                <>
                  <h2>No bids were placed</h2>
                  <p className="result-no-bids">This lot ended without a winning bidder.</p>
                </>
              )}
              <Link className="result-continue" to="/auctions">Explore more lots <span aria-hidden="true">→</span></Link>
            </div>
          </article>
          <Link className="result-lot-link" to={`/auctions/${auction.id}`}>View lot details</Link>
        </section>
      ) : null}

      <footer className="create-footer"><span>Good things deserve a second story.</span><span>© 2026 BIDHOUSE</span></footer>
    </main>
  );
}

export default AuctionResult;
