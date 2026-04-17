import React, { useState } from "react";
import { auth } from "./api";
import Header from "./components/Header";
import HomePage from "./pages/HomePage";
import GroupsPage from "./pages/GroupsPage";
import GroupDetailPage from "./pages/GroupDetailPage";
import CreateGroupPage from "./pages/CreateGroupPage";
import PaymentCallbackPage from "./pages/PaymentCallbackPage";
import EarningsPage from "./pages/EarningsPage";
import AdminLoginPage from "./pages/AdminLoginPage";
import "./App.css";

export default function App() {
  const [page, setPage] = useState(() => {
    if (window.location.pathname === "/payment-callback") return "payment-callback";
    return "home";
  });
  const [pageParam, setPageParam] = useState(() => {
    if (window.location.pathname === "/payment-callback") {
      return Object.fromEntries(new URLSearchParams(window.location.search));
    }
    return null;
  });

  function navigate(target, param = null) {
    // Guard earnings page — redirect to login if not authenticated
    if (target === "earnings" && !auth.isLoggedIn()) {
      target = "admin-login";
    }
    setPage(target);
    setPageParam(param);
    window.scrollTo({ top: 0, behavior: "smooth" });
    const url = target === "payment-callback" ? "/payment-callback" : "/";
    window.history.pushState({}, "", url);
  }

  return (
    <div className="app">
      <Header page={page} navigate={navigate} />
      <main className="main-content">
        {page === "home"          && <HomePage            navigate={navigate} />}
        {page === "groups"        && <GroupsPage          navigate={navigate} />}
        {page === "group"         && <GroupDetailPage     id={pageParam}      navigate={navigate} />}
        {page === "create"        && <CreateGroupPage     navigate={navigate} />}
        {page === "payment-callback" && <PaymentCallbackPage params={pageParam} navigate={navigate} />}
        {page === "earnings"      && <EarningsPage        navigate={navigate} />}
        {page === "admin-login"   && <AdminLoginPage      navigate={navigate} />}
      </main>
      <footer className="footer">
        <p>⚡ SplitPass — Share legally, save smartly. All group buys must comply with each service's official family/group plan terms.</p>
      </footer>
    </div>
  );
}
