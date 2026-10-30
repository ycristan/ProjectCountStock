// Each Solo page renders its own AppHeader: only the session page knows the name the
// counter typed, and the login (team PIN + personal PIN) must never be shown instead.
export default function SoloLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-ground">{children}</div>
}
