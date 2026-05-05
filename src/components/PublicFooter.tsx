import { Link } from "@tanstack/react-router";
import { Facebook, Twitter, Instagram, Linkedin } from "lucide-react";

export default function PublicFooter() {
  return (
    <footer className="border-t bg-muted/30 mt-20">
      <div className="max-w-7xl mx-auto px-4 md:px-6 py-12 grid md:grid-cols-4 gap-8">
        <div>
          <div className="text-xl font-bold mb-3"><span className="text-primary">Comart</span>+</div>
          <p className="text-sm text-muted-foreground">Run your entire Nigerian business from one place.</p>
        </div>
        <div>
          <h4 className="font-semibold text-sm mb-3">Product</h4>
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li><Link to="/pricing" className="hover:text-primary">Pricing</Link></li>
            <li><Link to="/" hash="features" className="hover:text-primary">Features</Link></li>
            <li><Link to="/auth" className="hover:text-primary">Sign In</Link></li>
          </ul>
        </div>
        <div>
          <h4 className="font-semibold text-sm mb-3">Company</h4>
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li><a href="#" className="hover:text-primary">About</a></li>
            <li><a href="#" className="hover:text-primary">Contact</a></li>
            <li><a href="#" className="hover:text-primary">Privacy</a></li>
          </ul>
        </div>
        <div>
          <h4 className="font-semibold text-sm mb-3">Follow</h4>
          <div className="flex gap-3 text-muted-foreground">
            <a href="#" aria-label="Facebook"><Facebook className="h-5 w-5 hover:text-primary" /></a>
            <a href="#" aria-label="Twitter"><Twitter className="h-5 w-5 hover:text-primary" /></a>
            <a href="#" aria-label="Instagram"><Instagram className="h-5 w-5 hover:text-primary" /></a>
            <a href="#" aria-label="LinkedIn"><Linkedin className="h-5 w-5 hover:text-primary" /></a>
          </div>
        </div>
      </div>
      <div className="border-t py-5 text-center text-xs text-muted-foreground">© 2025 Comart+. All rights reserved.</div>
    </footer>
  );
}
