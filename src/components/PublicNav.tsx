import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { Menu, X } from "lucide-react";

export default function PublicNav() {
  const [open, setOpen] = useState(false);
  return (
    <header className="sticky top-0 z-40 bg-background/80 backdrop-blur border-b">
      <div className="max-w-7xl mx-auto px-4 md:px-6 h-16 flex items-center justify-between">
        <Link to="/" className="text-xl font-bold"><span className="text-primary">Comart</span>+</Link>
        <nav className="hidden md:flex items-center gap-7 text-sm">
          <Link to="/" hash="features" className="hover:text-primary">Features</Link>
          <Link to="/pricing" className="hover:text-primary">Pricing</Link>
          <Link to="/" hash="how" className="hover:text-primary">How it Works</Link>
        </nav>
        <div className="hidden md:flex items-center gap-3">
          <Link to="/auth" className="text-sm font-medium hover:text-primary">Sign In</Link>
          <Link to="/auth" className="text-sm font-medium bg-primary text-primary-foreground px-4 py-2 rounded-md hover:opacity-90">Get Started</Link>
        </div>
        <button className="md:hidden p-2" onClick={() => setOpen(!open)} aria-label="Menu">
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>
      {open && (
        <div className="md:hidden border-t bg-background px-4 py-3 space-y-2 text-sm">
          <Link to="/pricing" className="block py-2" onClick={() => setOpen(false)}>Pricing</Link>
          <Link to="/auth" className="block py-2" onClick={() => setOpen(false)}>Sign In</Link>
          <Link to="/auth" className="block py-2 font-medium text-primary" onClick={() => setOpen(false)}>Get Started</Link>
        </div>
      )}
    </header>
  );
}
