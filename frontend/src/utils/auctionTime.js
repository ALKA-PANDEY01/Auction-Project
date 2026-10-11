export function getAuctionStatus(auction, now = Date.now()) {
  if (!auction) return "scheduled";
  if (auction.status === "cancelled" || auction.status === "ended") return auction.status;
  const startsAt = new Date(auction.start_time).getTime();
  const endsAt = new Date(auction.end_time).getTime();
  if (Number.isFinite(startsAt) && now < startsAt) return "scheduled";
  if (Number.isFinite(endsAt) && now >= endsAt) return "ended";
  return "active";
}
