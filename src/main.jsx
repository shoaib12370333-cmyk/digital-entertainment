import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { firebaseConfigured } from "./firebase.js";
import App from "./App.jsx";

function SetupNotice() {
  return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24, background: "#04060d", color: "#e9f2ff", fontFamily: "system-ui, sans-serif" }}>
      <div style={{ maxWidth: 520, lineHeight: 1.6 }}>
        <h1 style={{ margin: "0 0 12px", fontSize: 24 }}>Digital Entertainment: setup needed</h1>
        <p style={{ margin: "0 0 12px", color: "#9db0cf" }}>
          Firebase is not connected yet. Copy <code>.env.example</code> to <code>.env</code>, paste your Firebase project keys
          into it, then restart the dev server (or redeploy). The README has the step-by-step guide.
        </p>
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    {firebaseConfigured ? (
      <BrowserRouter>
        <App />
      </BrowserRouter>
    ) : (
      <SetupNotice />
    )}
  </React.StrictMode>
);
