/** Seven live paperwork packets sent via P102–P106 (validation cohort). */
export const P107_LIVE_CANDIDATE_IDS = [
  "6d548b240ab0", // Gary Smigocki
  "9f8231817090", // John Sykes
  "c0c920caa44f", // Malcolm Cooper
  "773445c489a7", // Terrel Andrews
  "cfcd1b8179ba", // Ryley Umbel
  "09c38dd6b79b", // Lara Gh
  "84d51041e750", // Alexandra Ridel
] as const;

export const P107_LIVE_CANDIDATE_NAMES: Record<(typeof P107_LIVE_CANDIDATE_IDS)[number], string> = {
  "6d548b240ab0": "Gary Smigocki",
  "9f8231817090": "John Sykes",
  "c0c920caa44f": "Malcolm Cooper",
  "773445c489a7": "Terrel Andrews",
  "cfcd1b8179ba": "Ryley Umbel",
  "09c38dd6b79b": "Lara Gh",
  "84d51041e750": "Alexandra Ridel",
};
