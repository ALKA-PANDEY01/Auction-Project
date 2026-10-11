import api from "./axios";

export const getWatchlist = async () => {
  const response = await api.get("/watchlist");
  return response.data;
};

export const addToWatchlist = async (auctionId) => {
  await api.post(`/watchlist/${auctionId}`);
};

export const removeFromWatchlist = async (auctionId) => {
  await api.delete(`/watchlist/${auctionId}`);
};
