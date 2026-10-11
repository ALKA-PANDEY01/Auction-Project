import api from "./axios";

export const createAuction = async (auction) => {
  const formData = new FormData();

  for (const field of [
    "title",
    "category",
    "description",
    "image_url",
    "starting_price",
    "minimum_increment",
    "start_time",
    "end_time",
  ]) {
    if (auction[field] !== undefined && auction[field] !== null && auction[field] !== "") {
      formData.append(field, auction[field]);
    }
  }

  if (auction.image) {
    formData.append("image", auction.image);
  }

  const response = await api.post("/auctions", formData);
  return response.data;
};

export const getAuctions = async () => {
  const response = await api.get("/auctions");
  return response.data;
};

export const getMyAuctions = async () => {
  const response = await api.get("/auctions/mine");
  return response.data;
};

export const getAuction = async (auctionId) => {
  const response = await api.get(`/auctions/${auctionId}`);
  return response.data;
};

export const getAuctionBids = async (auctionId) => {
  const response = await api.get(`/auctions/${auctionId}/bids`);
  return response.data;
};

export const getMyBids = async () => {
  const response = await api.get("/auctions/my-bids");
  return response.data;
};

export const deleteAuction = async (auctionId) => {
  await api.delete(`/auctions/${auctionId}`);
};

export const placeBid = async (auctionId, amount) => {
  const response = await api.post(`/auctions/${auctionId}/bids`, { amount });
  return response.data;
};

export const getAuctionResult = async (auctionId) => {
  const response = await api.get(`/auctions/${auctionId}/result`);
  return response.data;
};

export const endAuction = async (auctionId) => {
  const response = await api.post(`/auctions/${auctionId}/end`);
  return response.data;
};

export const createAuctionCheckout = async (auctionId) => {
  const response = await api.post(`/payments/auctions/${auctionId}/checkout`);
  return response.data;
};

export const verifyAuctionPayment = async (payload) => {
  const response = await api.post("/payments/verify", payload);
  return response.data;
};

export const createAuctionCodOrder = async (auctionId) => {
  const response = await api.post(`/payments/auctions/${auctionId}/cod`);
  return response.data;
};

export const getMyAuctionPayment = async (auctionId) => {
  const response = await api.get(`/payments/auctions/${auctionId}/mine`);
  return response.data;
};
