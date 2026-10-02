import React from "react";
import ReactDOM from "react-dom/client";
import { HashRouter, Routes, Route } from "react-router-dom";
import "./index.css";
import App from "./App.tsx";
import PredictionTest from "./pages/PredictionTest";
import PredictionPage from "./pages/PredictionPage";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <HashRouter>
    <Routes>
      <Route path="/" element={<App />} />
      <Route path="/prediction-test" element={<PredictionTest />} />
      <Route path="/prediction" element={<PredictionPage />} />
    </Routes>
  </HashRouter>
);
