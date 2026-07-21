export const USER_DISCOVER_TABS = [
  { key: "ideas", label: "创意", procedure: "ideas.listPublic" },
  { key: "funding", label: "新品筹措", procedure: "fundingCampaigns.publicList" },
  { key: "needs", label: "需求", procedure: "needs.list" },
  { key: "engineers", label: "工程师", procedure: "engineers.list" },
  { key: "listings", label: "旧物", procedure: "listings.list" },
  { key: "giveaway", label: "免费赠送", procedure: "listings.list" },
  { key: "recycling", label: "回收", procedure: "recycling.openRequests" },
] as const;
