import React from "react";

export const DEFAULT_SETTINGS = {
  metaLink: "https://facebook.com/",
  messengerUsername: "",
  whatsappLink: "",
  discordLink: "",
  instagramLink: "",
  paymentsEnabled: true, // admin can hide the whole Payments page (nav, footer and route)
  cashoutEnabled: true,
  cashoutMetaLink: "",
  chatEnabled: false, // stays off until the Firebase chat setup in the README is done
  cashoutMessageTemplate: "Hello, I would like to request a cash-out.\n\nGame: {game}\nGame Username: {username}\nCash-Out Amount: ${amount}\nPayment Method: {method}\nPayment Details: {details}\nRequest ID: {requestId}",
};

/* Editable site text (admin can change every label/heading) */
export const DEFAULT_TEXT = {
  siteName: "Digital Entertainment",
  siteTag: "Gaming hub",
  navGames: "Games",
  navPayments: "Payments",
  navCashout: "Cash Out",

  heroBadge: "Now live",
  heroTitle: "Enter the digital arena. Level up.",
  heroSubtitle: "Download top games, get your account in minutes, and handle payments and cash-outs in one secure place.",
  heroPrimaryBtn: "Browse games",
  heroSecondaryBtn: "Cash out",

  homeEyebrow: "Game library",
  homeTitle: "Our games",
  homeSubtitle: "Pick a game to download, or reach out if you need an account.",
  searchPlaceholder: "Search games...",
  noGamesText: "No games added yet.",
  downloadBtn: "Download now",
  needAccountBtn: "Need account?",

  howEyebrow: "How it works",
  howTitle: "Three steps to get started",
  how1Title: "Pick a game",
  how1Text: "Browse the library and download the game that fits your style.",
  how2Title: "Get your account",
  how2Text: "Tap \"Need account?\" and we set you up on Messenger in minutes.",
  how3Title: "Play & cash out",
  how3Text: "Add funds any time and request your cash-out when you're ready.",
  ctaTitle: "Ready to cash out?",
  ctaText: "Submit your request in under a minute and we'll take it from there.",

  paymentsEyebrow: "Payments",
  paymentsTitle: "Payment methods",
  paymentsSubtitle: "Use any of the options below to send payment.",
  paymentsNote: "After you pay, send a screenshot of the receipt in Live Chat or Messenger so we can confirm it.",
  noPaymentsText: "No payment methods added yet.",
  openLinkBtn: "Open link",
  paymentsOffTitle: "Payments unavailable",
  paymentsOffText: "The payments page is closed right now. Please contact support.",

  chatTitle: "Live support",
  chatSubtitle: "We usually reply within a few minutes",
  chatWelcome: "Hi! How can we help you today?",
  chatPlaceholder: "Type your message...",

  loginTitle: "Admin access",
  loginUsernamePlaceholder: "Admin email",
  loginPasswordPlaceholder: "Password",
  loginBtn: "Log in",
  footerConnectText: "Connect with us",
};

/* Admin "Site Text" editor is generated from this list. [key, label] */
export const TEXT_GROUPS = [
  { title: "Brand & navigation", fields: [["siteName", "Site name"], ["siteTag", "Small tag under the site name"], ["navGames", "Nav: Games label"], ["navPayments", "Nav: Payments label"], ["navCashout", "Nav: Cash Out button"]] },
  { title: "Home hero", fields: [["heroBadge", "Badge"], ["heroTitle", "Headline"], ["heroSubtitle", "Subtitle"], ["heroPrimaryBtn", "Primary button"], ["heroSecondaryBtn", "Secondary button"]] },
  { title: "Games section", fields: [["homeEyebrow", "Eyebrow (small label above title)"], ["homeTitle", "Title"], ["homeSubtitle", "Subtitle"], ["searchPlaceholder", "Search box placeholder"], ["noGamesText", "\"No games\" message"], ["downloadBtn", "\"Download now\" button"], ["needAccountBtn", "\"Need account?\" button"]] },
  { title: "How it works", fields: [["howEyebrow", "Eyebrow"], ["howTitle", "Title"], ["how1Title", "Step 1 title"], ["how1Text", "Step 1 text"], ["how2Title", "Step 2 title"], ["how2Text", "Step 2 text"], ["how3Title", "Step 3 title"], ["how3Text", "Step 3 text"], ["ctaTitle", "Bottom banner title"], ["ctaText", "Bottom banner text"]] },
  { title: "Payments page", fields: [["paymentsEyebrow", "Eyebrow"], ["paymentsTitle", "Title"], ["paymentsSubtitle", "Subtitle"], ["paymentsNote", "Note shown above the methods"], ["noPaymentsText", "\"No payment methods\" message"], ["openLinkBtn", "\"Open link\" button"], ["paymentsOffTitle", "Title when the page is switched off"], ["paymentsOffText", "Text when the page is switched off"]] },
  { title: "Live chat", fields: [["chatTitle", "Chat window title"], ["chatSubtitle", "Chat window subtitle"], ["chatWelcome", "Welcome message (shown before the first reply)"], ["chatPlaceholder", "Message box placeholder"]] },
  { title: "Login page", fields: [["loginTitle", "Title"], ["loginUsernamePlaceholder", "Username field placeholder"], ["loginPasswordPlaceholder", "Password field placeholder"], ["loginBtn", "\"Log in\" button"]] },
  { title: "Footer", fields: [["footerConnectText", "\"Connect with us\" text"]] },
];

export const SAMPLE_GAMES = [
  { id: "sample-1", name: "Free Fire", flyer: "", downloadLink: "https://www.freefiremobile.com/" },
  { id: "sample-2", name: "PUBG Mobile", flyer: "", downloadLink: "https://www.pubgmobile.com/" },
];

export const DEFAULT_CASHOUT_FIELDS = [
  { id: "cashapp", name: "Cash App", type: "payment", placeholder: "$cashtag", required: true, active: true },
  { id: "chime", name: "Chime", type: "payment", placeholder: "Chime username / phone / email", required: true, active: true },
  { id: "paypal", name: "PayPal", type: "payment", placeholder: "PayPal email", required: true, active: true },
];

export const TextContext = React.createContext(DEFAULT_TEXT);
export function useText() {
  return React.useContext(TextContext);
}
