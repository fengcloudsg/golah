import { NavLink } from "react-router-dom";
import { useAuth } from "../lib/auth";

export function TopBar() {
  const { user, ready } = useAuth();

  return (
    <header className="topbar">
      <div className="brand">
        GoLah!<span> nearby, lah</span>
      </div>
      <nav className="nav">
        <NavLink to="/" end>
          Map
        </NavLink>
        <NavLink to="/favorites">Favourites</NavLink>
        <NavLink to="/cloud">Cloud</NavLink>
        {ready && user ? (
          <NavLink to="/account" title={user.email}>
            {user.email.split("@")[0]}
          </NavLink>
        ) : (
          <NavLink to="/account" className="nav-signin">
            Sign in
          </NavLink>
        )}
      </nav>
    </header>
  );
}
