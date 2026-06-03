import React, { useState, useEffect } from "react";
import { session } from "./api";
import Header from "./components/Header";
import HomePage from "./pages/HomePage";
import GroupsPage from "./pages/GroupsPage";
import GroupDetailPage from "./pages/GroupDetailPage";
import CreateGroupPage from "./pages/CreateGroupPage";
import SignupPage from "./pages/SignupPage";
import LoginPage from "./pages/LoginPage";
import BlogEditorPage from "./pages/BlogEditorPage";
import ForgotPasswordPage from "./pages/ForgotPasswordPage";
import AdminLoginPage from "./pages/AdminLoginPage";
import AdminDashboardPage from "./pages/AdminDashboardPage";
import EarningsPage from "./pages/EarningsPage";
import PaymentCallbackPage from "./pages/PaymentCallbackPage";
import MyGroupsPage from "./pages/MyGroupsPage";
import GroupEmailPage from "./pages/GroupEmailPage";
import ModeratorDashboardPage from "./pages/ModeratorDashboardPage";
import ModeratorSettingsPage from "./pages/ModeratorSettingsPage";
import UnsubscribePage from "./pages/UnsubscribePage";
import WelcomeModal from "./components/WelcomeModal";
import Footer from "./components/Footer";
import "./App.css";

console.log("SplitSubs build", "1778098971");



























// ── URL <-> page mapping ──────────────────────────────────────────────────
const SIMPLE_PAGES = [
  "home", "groups", "create", "signup", "login", "admin-login", "blog-editor", "forgot-password",
  "admin", "earnings", "my-groups", "mod-dash", "mod-settings",
  "payment-callback", "unsubscribe",
];

function pathToPage(pathname, search) {
  const q = Object.fromEntries(new URLSearchParams(search || ""));

  if (!pathname || pathname === "/") return { page: "home", param: null };

  const g  = pathname.match(/^\/group\/([^/]+)\/?$/);
  if (g)  return { page: "group", param: g[1] };

  const ge = pathname.match(/^\/group-emails\/([^/]+)\/?$/);
  if (ge) return { page: "group-emails", param: ge[1] };

  const stripped = pathname.replace(/^\/|\/$/g, "");
  if (SIMPLE_PAGES.includes(stripped)) {
    const queryPages = ["payment-callback", "unsubscribe", "signup", "login"];
    return { page: stripped, param: queryPages.includes(stripped) ? q : null };
  }

  return { page: "home", param: null };
}

function pageToPath(target, param) {
  if (target === "home")          return "/";
  if (target === "group")         return `/group/${param || ""}`;
  if (target === "group-emails")  return `/group-emails/${param || ""}`;
  if (target === "unsubscribe" && param?.email) return `/unsubscribe?email=${encodeURIComponent(param.email)}`;
  return `/${target}`;
}

export default function App() {
  const initial = pathToPage(window.location.pathname, window.location.search);
  const [page, setPage]       = useState(initial.page);
  const [pageParam, setParam] = useState(initial.param);
  const [user, setUser]       = useState(session.getUser());

    const [showWelcome, setShowWelcome] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const dismissed = sessionStorage.getItem("ss_welcome_dismissed");
    if (dismissed === "1") return;
    if (window.location.pathname !== "/") return;
    const t = setTimeout(() => setShowWelcome(true), 6000);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    function onPop() {
      const next = pathToPage(window.location.pathname, window.location.search);
      setPage(next.page);
      setParam(next.param);
    }
    window.addEventListener("popstate", onPop);
    const off = session.onChange(setUser);
    return () => {
      window.removeEventListener("popstate", onPop);
      off && off();
    };
  }, []);

  function navigate(target, param = null) {
    const role = session.getRole();
    if (target === "mod-dash"     && !session.isModerator()) { return; }
    if (target === "mod-settings"  && !session.isModerator()) { return; }
    if (target === "group-emails" && !["moderator","superadmin"].includes(role)) { return; }
    if (target === "create"    && !["moderator","superadmin"].includes(role)) {
      setPage("login"); setParam({ redirect:"create" });
      window.history.pushState({}, "", "/login"); return;
    }
    if (target === "my-groups" && !session.isLoggedIn()) {
      setPage("login"); setParam(null);
      window.history.pushState({}, "", "/login"); return;
    }
    if (target === "earnings"  && role !== "superadmin")  {
      setPage("admin-login"); setParam(null);
      window.history.pushState({}, "", "/admin-login"); return;
    }
    if (target === "admin"     && role !== "superadmin")  {
      setPage("admin-login"); setParam(null);
      window.history.pushState({}, "", "/admin-login"); return;
    }

    setPage(target);
    setParam(param);
    window.scrollTo({ top:0, behavior:"smooth" });
    window.history.pushState({}, "", pageToPath(target, param));
  }

  return (
    <div className="app">
      {showWelcome && <WelcomeModal navigate={(t,p) => { sessionStorage.setItem("ss_welcome_dismissed","1"); setShowWelcome(false); navigate(t,p); }} onClose={() => { sessionStorage.setItem("ss_welcome_dismissed","1"); setShowWelcome(false); }} />}
      <Header page={page} navigate={navigate} user={user} />
      <main className="main-content">
        {page === "home"             && <HomePage             navigate={navigate} />}
        {page === "groups"           && <GroupsPage           navigate={navigate} />}
        {page === "group"            && <GroupDetailPage      id={pageParam}      navigate={navigate} user={user} />}
        {page === "create"           && <CreateGroupPage      navigate={navigate} />}
        {page === "signup"           && <SignupPage           navigate={navigate} params={pageParam} />}
        {page === "login"            && <LoginPage            navigate={navigate} params={pageParam} />}
        {page === "blog-editor"      && <BlogEditorPage      navigate={navigate} />}
        {page === "forgot-password"  && <ForgotPasswordPage  navigate={navigate} />}
        {page === "admin-login"      && <AdminLoginPage       navigate={navigate} />}
        {page === "admin"            && <AdminDashboardPage   navigate={navigate} />}
        {page === "earnings"         && <EarningsPage         navigate={navigate} />}
        {page === "my-groups"        && <MyGroupsPage         navigate={navigate} user={user} />}
        {page === "group-emails"     && <GroupEmailPage      groupId={pageParam}  navigate={navigate} />}
        {page === "mod-dash"         && <ModeratorDashboardPage navigate={navigate} />}
        {page === "mod-settings"     && <ModeratorSettingsPage  navigate={navigate} />}
        {page === "unsubscribe"      && <UnsubscribePage      email={pageParam?.email} navigate={navigate} />}
        {page === "payment-callback" && <PaymentCallbackPage  params={pageParam}  navigate={navigate} />}
      </main>
      <Footer navigate={navigate} />
    </div>
  );
}
// build 1777525710
