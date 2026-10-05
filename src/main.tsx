import React from "react";
import ReactDOM from "react-dom/client";
import "@fontsource-variable/dm-sans";
// Handwriting for the onboarding correction (Latin; Kalam also covers Devanagari).
import "@fontsource/caveat/700.css";
import "@fontsource/kalam/700.css";
import App from "./App";
import "./styles.css";
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
