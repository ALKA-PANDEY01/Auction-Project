export const auctionCategories = [
  { value: "electronics", label: "Electronics" },
  { value: "fashion", label: "Fashion" },
  { value: "vehicles", label: "Vehicles" },
  { value: "collectibles", label: "Collectibles" },
  { value: "furniture", label: "Furniture" },
  { value: "art", label: "Art" },
  { value: "other", label: "Other" },
];

export function getAuctionCategoryLabel(value) {
  return auctionCategories.find((category) => category.value === value)?.label || "Other";
}
