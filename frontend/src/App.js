import React, { useState, useEffect } from "react";
import { session } from "./api";
import Header from "./components/Header";
import HomePage from "./pages/HomePage";
import GroupsPage from "./pages/GroupsPage";
import GroupDetailPage from "./pages/GroupDetailPage";
import CreateGroupPage from "./pages/CreateGroupPage";
import SignupPage from "./pages/SignupPage";
import LoginPage from "./pages/LoginPage";
import AdminLoginPage from "./pages/AdminLoginPage";
import AdminDashboardPage from "./pages/AdminDashboardPage";
import EarningsPage from "./pages/EarningsPage";
import PaymentCallbackPage from "./pages/PaymentCallbackPage";
import MyGroupsPage from "./pages/MyGroupsPage";
import Footer from "./components/Footer";
import "./App.css";

export default function App() {
  const [page, setPage]       = useState("home");
  const [pageParam, setParam] = useState(null);
  const [user, setUser]       = useState(session.getUser());

  useEffect(() => {
    if (window.location.pathname === "/payment-callback") {
      setPage("payment-callback");
      setParam(Object.fromEntries(new URLSearchParams(window.location.search)));
    }
    return session.onChange(setUser);
  }, []);

  function navigate(target, param = null) {
    const role = session.getRole();
    if (target === "create"    && !["moderator","superadmin"].includes(role)) { setPage("login"); setParam({ redirect:"create" }); return; }
    if (target === "my-groups" && !session.isLoggedIn())  { setPage("login"); return; }
    if (target === "earnings"  && role !== "superadmin")  { setPage("admin-login"); return; }
    if (target === "admin"     && role !== "superadmin")  { setPage("admin-login"); return; }
    setPage(target);
    setParam(param);
    window.scrollTo({ top:0, behavior:"smooth" });
    window.history.pushState({}, "", target === "payment-callback" ? "/payment-callback" : "/");
  }

  return (
    <div className="app">
      <Header page={page} navigate={navigate} user={user} />
      <main className="main-content">
        {page === "home"             && <HomePage             navigate={navigate} />}
        {page === "groups"           && <GroupsPage           navigate={navigate} />}
        {page === "group"            && <GroupDetailPage      id={pageParam}      navigate={navigate} user={user} />}
        {page === "create"           && <CreateGroupPage      navigate={navigate} />}
        {page === "signup"           && <SignupPage           navigate={navigate} params={pageParam} />}
        {page === "login"            && <LoginPage            navigate={navigate} params={pageParam} />}
        {page === "admin-login"      && <AdminLoginPage       navigate={navigate} />}
        {page === "admin"            && <AdminDashboardPage   navigate={navigate} />}
        {page === "earnings"         && <EarningsPage         navigate={navigate} />}
        {page === "my-groups"        && <MyGroupsPage         navigate={navigate} user={user} />}
        {page === "payment-callback" && <PaymentCallbackPage  params={pageParam}  navigate={navigate} />}
      </main>
      <Footer navigate={navigate} />
    </div>
  );
}
