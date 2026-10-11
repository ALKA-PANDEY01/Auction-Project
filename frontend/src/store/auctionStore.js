import { create } from "zustand";
import { getAuction, getAuctionBids, getAuctions } from "../api/auction";

let auctionsRequestId = 0;
let detailsRequestId = 0;

export const useAuctionStore = create((set, get) => ({
  auctions: [],
  auction: null,
  bids: [],
  isAuctionsLoading: false,
  auctionsError: null,
  isAuctionLoading: false,
  auctionError: null,

  fetchAuctions: async () => {
    const requestId = ++auctionsRequestId;
    set({ isAuctionsLoading: true, auctionsError: null });
    try {
      const auctions = await getAuctions();
      if (requestId === auctionsRequestId) {
        set({ auctions, isAuctionsLoading: false });
      }
      return auctions;
    } catch (error) {
      if (requestId === auctionsRequestId) {
        set({
          auctionsError: error.response?.data?.detail || "We couldn't load the auctions. Please try again.",
          isAuctionsLoading: false,
        });
      }
      throw error;
    }
  },

  fetchAuctionDetails: async (auctionId) => {
    const requestId = ++detailsRequestId;
    set({ auction: null, bids: [], isAuctionLoading: true, auctionError: null });
    try {
      const [auction, bids] = await Promise.all([
        getAuction(auctionId),
        getAuctionBids(auctionId),
      ]);
      if (requestId === detailsRequestId) {
        set({ auction, bids, isAuctionLoading: false });
      }
      return { auction, bids };
    } catch (error) {
      if (requestId === detailsRequestId) {
        set({
          auctionError: error.response?.data?.detail || "We couldn't load this auction. Please try again.",
          isAuctionLoading: false,
        });
      }
      throw error;
    }
  },

  applyIncomingBid: ({ auctionId, bid }) => {
    const { auction, bids } = get();
    if (!auction || auction.id !== auctionId) return;

    const bidId = bid.id || bid.bid_id;
    const alreadyPresent = bidId && bids.some((item) => item.id === bidId);
    set({
      auction: {
        ...auction,
        current_price: bid.amount,
      },
      bids: alreadyPresent ? bids : [...bids, { ...bid, id: bidId, auction_id: auctionId }],
    });
  },

  applyAuctionEnded: ({ auctionId, result }) => {
    const { auction, auctions } = get();
    const endedAuction = (item) => item.id === auctionId
      ? {
          ...item,
          status: "ended",
          winner_id: result.winner_id,
          final_price: result.winning_bid,
          ...(result.winning_bid !== null && result.winning_bid !== undefined
            ? { current_price: result.winning_bid }
            : {}),
        }
      : item;

    set({
      auction: auction?.id === auctionId ? endedAuction(auction) : auction,
      auctions: auctions.map(endedAuction),
    });
  },

  clearAuctionDetails: () => {
    ++detailsRequestId;
    set({ auction: null, bids: [], isAuctionLoading: false, auctionError: null });
  },
}));
