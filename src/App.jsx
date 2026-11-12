import React, { useState, useEffect, useCallback, Suspense } from "react";
import { Routes, Route, Link, NavLink, useLocation } from "react-router-dom";
import { loadDoc, saveDoc, watchDoc, loadCollection, saveItem, deleteItem, watchCollection, watchCounters, auth, signOut, onAuthStateChanged } from "./firebase.js";
import { DEFAULT_SETTINGS, DEFAULT_TEXT, DEFAULT_CASHOUT_FIELDS, SAMPLE_GAMES, TextContext, useText } from "./text.js";
import { Icon, Crest, ToastProvider, useSpotlight } from "./ui.jsx";
import HomePage from "./Home.jsx";
import PaymentsPage from "./Payments.jsx";
import CashOutPage from "./CashOut.jsx";
import LegalPage from "./Legal.jsx";
import { LoginPage, AdminPage } from "./Admin.jsx";
import { isAdminUser } from "./chat.js";
import "./styles.css";

const LOAD_TIMEOUT_MS = 8000;

/* ---------- Age notice: asked once per browser, never on the admin page ---------- */
const AGE_KEY = "de_age_ok";
function AgeGate() {
  const t = useText();
  const location = useLocation();
  const [ok, setOk] = useState(() => {
    try { return localStorage.getItem(AGE_KEY) === "1"; } catch { return false; }
  });
  if (ok || location.pathname.startsWith("/admin")) return null;
  const confirm = () => {
    try { localStorage.setItem(AGE_KEY, "1"); } catch { /* the notice just shows again next visit */ }
    setOk(true);
  };
  return (
    <div className="modal-backdrop age-gate">
      <div className="card modal" role="alertdialog" aria-modal="true" aria-labelledby="age-title" style={{ textAlign: "center" }}>
        <div style={{ display: "inline-block", marginBottom: 12 }}><Crest size={56} /></div>
        <h3 id="age-title" className="display" style={{ fontSize: 24, margin: "0 0 8px" }}>{t.ageTitle}</h3>
        <p className="muted" style={{ margin: "0 0 22px" }}>{t.ageText}</p>
        <div style={{ display: "flex", gap: 10, flexDirection: "column" }}>
          <button type="button" className="btn btn-primary btn-lg" onClick={confirm} autoFocus>{t.ageYes}</button>
          <button type="button" className="btn btn-ghost" onClick={() => { window.location.href = "https://www.google.com/"; }}>{t.ageNo}</button>
        </div>
      </div>
    </div>
  );
}

// Loaded only when live chat is switched on, so sites without chat do not pay for it.
const ChatWidget = React.lazy(() => import("./ChatWidget.jsx"));

/* ---------- Background ---------- */
function Ambient() {
  return (
    <div className="ambient" aria-hidden="true">
      <div className="orb o1" />
      <div className="orb o2" />
      <div className="orb o3" />
      <div className="grid-lines" />
      <div className="noise" />
      <div className="vignette" />
    </div>
  );
}

/* ---------- Nav ---------- */
function TopBar({ paymentsEnabled }) {
  const t = useText();
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        setScrolled(window.scrollY > 12);
        const max = document.documentElement.scrollHeight - window.innerHeight;
        document.documentElement.style.setProperty("--p", max > 0 ? (window.scrollY / max).toFixed(4) : "0");
      });
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);


  return (
    <>
      <div className="scroll-progress" aria-hidden="true" />
      <header className={`nav ${scrolled ? "scrolled" : ""}`}>
        <div className="nav-inner">
          <Link to="/" className="brand" aria-label={t.siteName}>
            <Crest size={36} />
            <span className="brand-name">{t.siteName}<small>{t.siteTag}</small></span>
          </Link>
          <nav className="nav-links" aria-label="Main">
            <NavLink to="/" end className={({ isActive }) => `nav-link ${isActive ? "active" : ""}`}><Icon name="gamepad" size={17} /> {t.navGames}</NavLink>
            {paymentsEnabled ? <NavLink to="/payments" className={({ isActive }) => `nav-link ${isActive ? "active" : ""}`}><Icon name="wallet" size={17} /> {t.navPayments}</NavLink> : null}
            <Link to="/cashout" className="btn btn-primary btn-sm nav-cta"><Icon name="cash" size={16} /> {t.navCashout}</Link>
          </nav>
        </div>
      </header>
    </>
  );
}

function Dock({ paymentsEnabled }) {
  const t = useText();
  return (
    <nav className="dock" aria-label="Quick navigation">
      <NavLink to="/" end className={({ isActive }) => (isActive ? "active" : "")}><Icon name="gamepad" size={22} />Games</NavLink>
      {paymentsEnabled ? <NavLink to="/payments" className={({ isActive }) => (isActive ? "active" : "")}><Icon name="wallet" size={22} />Pay</NavLink> : null}
      <NavLink to="/cashout" className={({ isActive }) => `primary ${isActive ? "active" : ""}`}><Icon name="cash" size={24} />Cash</NavLink>
    </nav>
  );
}

/* ---------- Footer ---------- */
function Footer({ settings }) {
  const t = useText();
  const { whatsappLink, discordLink, instagramLink, metaLink, messengerUsername } = settings;
  // The Meta page link still holds the placeholder until the admin sets a real one: do not show a button for it.
  const facebookLink = metaLink && !/^https?:\/\/(www\.)?facebook\.com\/?$/i.test(metaLink.trim()) ? metaLink : "";
  const socials = [
    facebookLink ? { href: facebookLink, label: "Facebook", icon: "facebook" } : null,
    messengerUsername ? { href: `https://m.me/${messengerUsername}`, label: "Messenger", icon: "message" } : null,
    whatsappLink ? { href: whatsappLink, label: "WhatsApp", icon: "whatsapp" } : null,
    discordLink ? { href: discordLink, label: "Discord", icon: "users" } : null,
    instagramLink ? { href: instagramLink, label: "Instagram", icon: "instagram" } : null,
  ].filter(Boolean);

  return (
    <footer className="footer">
      <div className="footer-glow" />
      <div className="container">
        <div className="footer-inner">
          <div>
            <Link to="/" className="brand" style={{ marginBottom: 16 }}>
              <Crest size={40} />
              <span className="brand-name">{t.siteName}<small>{t.siteTag}</small></span>
            </Link>
            <p className="muted" style={{ maxWidth: 38 + "ch", margin: 0 }}>{t.heroSubtitle}</p>
          </div>
          <div>
            <h4>Explore</h4>
            <div className="footer-links">
              <Link to="/">{t.navGames}</Link>
              {settings.paymentsEnabled !== false ? <Link to="/payments">{t.navPayments}</Link> : null}
              {settings.cashoutEnabled !== false ? <Link to="/cashout">{t.navCashout}</Link> : null}
              <Link to="/terms">{t.termsTitle}</Link>
              <Link to="/privacy">{t.privacyTitle}</Link>
            </div>
          </div>
          <div>
            <h4>{t.footerConnectText}</h4>
            <div className="socials">
              {socials.map((s) => (
                <a key={s.label} href={s.href} target="_blank" rel="noopener noreferrer" className="social" aria-label={s.label}>
                  <Icon name={s.icon} size={18} />
                  <span>{s.label}</span>
                </a>
              ))}
            </div>
          </div>
        </div>
        <div className="footer-bottom">
          <span>&copy; {new Date().getFullYear()} {t.siteName}. All rights reserved.</span>
          <span>{t.ageFooter}</span>
        </div>
      </div>
    </footer>
  );
}

/* ---------- Admin route guard ---------- */
function AdminRoute({ isAdmin, setIsAdmin, ...rest }) {
  if (!isAdmin) {
    // onAuthStateChanged flips isAdmin once the sign-in completes; nothing to do here.
    return <LoginPage onLogin={() => {}} />;
  }
  return <AdminPage {...rest} onLogout={() => signOut(auth)} />;
}

/* ---------- App ---------- */
export default function App() {
  const [loaded, setLoaded] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [games, setGamesState] = useState(SAMPLE_GAMES);
  const [payments, setPaymentsState] = useState([]);
  const [settings, setSettingsState] = useState(DEFAULT_SETTINGS);
  const [siteText, setSiteTextState] = useState(DEFAULT_TEXT);
  const [stats, setStats] = useState({});
  const [cashoutFields, setCashoutFieldsState] = useState(DEFAULT_CASHOUT_FIELDS);
  const [cashouts, setCashouts] = useState([]);
  const location = useLocation();
  const paymentsEnabled = settings.paymentsEnabled !== false;

  useSpotlight();

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0 });
  }, [location.pathname]);

  useEffect(() => {
    let mounted = true;
    // Chat visitors (guests / chat accounts) are signed in too, so "signed in" no longer means admin.
    // This only decides whether to show the admin panel; Firestore rules are the real gate.
    const unsubAuth = onAuthStateChanged(auth, (user) => setIsAdmin(isAdminUser(user)));
    (async () => {
      // If Firestore is slow or unreachable, show the site with its built-in defaults after a few seconds instead of
      // leaving the visitor on the splash screen. The live listeners below fill in the real data when it arrives.
      const timeout = new Promise((resolve) => setTimeout(() => resolve(null), LOAD_TIMEOUT_MS));
      const initial = await Promise.race([
        Promise.all([
          loadCollection("games", SAMPLE_GAMES),
          loadCollection("payments", []),
          loadDoc("settings", DEFAULT_SETTINGS),
          loadDoc("siteText", DEFAULT_TEXT),
          loadDoc("cashoutFields", null),
        ]),
        timeout,
      ]);
      if (!mounted) return;
      if (initial) {
        const [g, p, s, txt, cf] = initial;
        setGamesState(g);
        setPaymentsState(p);
        setSettingsState({ ...DEFAULT_SETTINGS, ...s });
        setSiteTextState({ ...DEFAULT_TEXT, ...txt });
        if (cf && Array.isArray(cf) && cf.length) setCashoutFieldsState(cf);
      }
      setLoaded(true);
    })();

    const unsubGames = watchCollection("games", (v) => setGamesState(v));
    const unsubPayments = watchCollection("payments", (v) => setPaymentsState(v));
    const unsubSettings = watchDoc("settings", (v) => setSettingsState({ ...DEFAULT_SETTINGS, ...v }));
    const unsubText = watchDoc("siteText", (v) => setSiteTextState({ ...DEFAULT_TEXT, ...v }));
    const unsubCashoutFields = watchDoc("cashoutFields", (v) => { if (Array.isArray(v) && v.length) setCashoutFieldsState(v); });

    return () => {
      mounted = false;
      unsubGames();
      unsubPayments();
      unsubSettings();
      unsubText();
      unsubCashoutFields();
      unsubAuth();
    };
  }, []);

  // Cash-out requests and stats are admin-only in the rules. Subscribe only once the admin is
  // signed in (a listener started while signed out is rejected and never retries after login).
  useEffect(() => {
    if (!isAdmin) {
      setCashouts([]);
      setStats({});
      return undefined;
    }
    const unsubStats = watchCounters((v) => setStats(v));
    const unsubCashouts = watchCollection("cashouts", (v) => setCashouts(v));
    return () => {
      unsubStats();
      unsubCashouts();
    };
  }, [isAdmin]);

  const saveGameItem = useCallback((item) => saveItem("games", item), []);
  const removeGameItem = useCallback((id) => { deleteItem("games", id); }, []);
  const savePaymentItem = useCallback((item) => { saveItem("payments", item); }, []);
  const removePaymentItem = useCallback((id) => { deleteItem("payments", id); }, []);
  const setSettings = useCallback((next) => { setSettingsState(next); saveDoc("settings", next); }, []);
  const setSiteText = useCallback((next) => { setSiteTextState(next); saveDoc("siteText", next); }, []);
  const saveCashoutFields = useCallback((next) => { setCashoutFieldsState(next); saveDoc("cashoutFields", next); }, []);
  const saveCashoutRequest = useCallback((item) => saveItem("cashouts", item), []);
  const updateCashoutRequest = useCallback((item) => saveItem("cashouts", item), []);

  if (!loaded) {
    return (
      <>
        <Ambient />
        <div className="splash" style={{ background: "transparent" }}>
          <div className="splash-inner">
            <div className="splash-777" aria-label="777"><span>7</span><span>7</span><span>7</span></div>
            <div className="splash-name display">
              Digital <span className="accent-text">Entertainment</span>
            </div>
            <div className="splash-bar" />
          </div>
        </div>
      </>
    );
  }

  return (
    <TextContext.Provider value={siteText}>
      <ToastProvider>
        <Ambient />
        <div className="app">
          <TopBar paymentsEnabled={paymentsEnabled} />
          <main className="main" key={location.pathname}>
            <Routes>
              <Route path="/" element={<HomePage games={games} payments={payments} settings={settings} />} />
              <Route path="/payments" element={<PaymentsPage payments={payments} enabled={paymentsEnabled} />} />
              <Route path="/terms" element={<LegalPage kind="terms" />} />
              <Route path="/privacy" element={<LegalPage kind="privacy" />} />
              <Route path="/cashout" element={<CashOutPage games={games} settings={settings} cashoutFields={cashoutFields} saveCashoutRequest={saveCashoutRequest} />} />
              <Route
                path="/admin"
                element={
                  <AdminRoute
                    isAdmin={isAdmin}
                    setIsAdmin={setIsAdmin}
                    games={games}
                    saveGameItem={saveGameItem}
                    removeGameItem={removeGameItem}
                    payments={payments}
                    savePaymentItem={savePaymentItem}
                    removePaymentItem={removePaymentItem}
                    settings={settings}
                    setSettings={setSettings}
                    siteText={siteText}
                    setSiteText={setSiteText}
                    stats={stats}
                    cashoutFields={cashoutFields}
                    saveCashoutFields={saveCashoutFields}
                    cashouts={cashouts}
                    onUpdateCashoutRequest={updateCashoutRequest}
                  />
                }
              />
              <Route path="*" element={<HomePage games={games} payments={payments} settings={settings} />} />
            </Routes>
          </main>
          <Footer settings={settings} />
        </div>
        <Dock paymentsEnabled={paymentsEnabled} />
        <AgeGate />
        {settings.chatEnabled && !isAdmin && !location.pathname.startsWith("/admin") ? (
          <Suspense fallback={null}>
            <ChatWidget avatars={settings.chatAvatars} away={!!settings.chatAway} awayText={settings.chatAwayText} />
          </Suspense>
        ) : null}
      </ToastProvider>
    </TextContext.Provider>
  );
}
