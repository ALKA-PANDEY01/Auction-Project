import { useEffect } from "react";
import { useAuctionStore } from "../store/auctionStore";

function getWebSocketUrl(auctionId) {
  const configuredApiBase = import.meta.env.VITE_API_BASE_URL || "/api";
  const apiBase = new URL(configuredApiBase, window.location.origin);
  apiBase.protocol = apiBase.protocol === "https:" ? "wss:" : "ws:";
  apiBase.pathname = `${apiBase.pathname.replace(/\/$/, "")}/auctions/${encodeURIComponent(auctionId)}/ws`;
  apiBase.search = "";
  apiBase.hash = "";
  return apiBase.toString();
}

export function useAuctionWebSocket(auctionId) {
  useEffect(() => {
    if (!auctionId) return undefined;

    const socket = new WebSocket(getWebSocketUrl(auctionId));

    socket.addEventListener("message", (messageEvent) => {
      try {
        const event = JSON.parse(messageEvent.data);
        if (event.auction_id !== auctionId) return;

        if (event.event === "auction_ended") {
          useAuctionStore.getState().applyAuctionEnded({
            auctionId,
            result: {
              winner_id: event.winner_id,
              winner_name: event.winner_name,
              winning_bid: event.winning_bid,
            },
          });
          return;
        }

        if (event.event !== "bid_placed") return;

        useAuctionStore.getState().applyIncomingBid({
          auctionId,
          bid: {
            id: event.bid_id,
            bidder_name: event.bidder_name,
            amount: event.amount,
            created_at: event.created_at,
          },
        });
      } catch (error) {
        console.error("Could not process auction WebSocket message", error);
      }
    });

    return () => socket.close();
  }, [auctionId]);
}
