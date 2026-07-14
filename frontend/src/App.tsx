import { Link } from 'react-router-dom'

// When reached via the public tunnel domain, Stage 3 has its own stable
// subdomain. Otherwise (same-WiFi/LAN access) fall back to swapping the
// port on whatever host/IP loaded this page, since the shop PC's LAN IP
// is DHCP-assigned and can change.
const STAGE3_URL = window.location.hostname.endsWith('shubhada.live')
  ? 'https://dc.shubhada.live'
  : `${window.location.protocol}//${window.location.hostname}:3001`

const BILLING_URL = window.location.hostname.endsWith('shubhada.live')
  ? 'https://sales.shubhada.live'
  : `${window.location.protocol}//${window.location.hostname}:5173`

const EVENTS_URL = window.location.hostname.endsWith('shubhada.live')
  ? 'https://events.shubhada.live'
  : `${window.location.protocol}//${window.location.hostname}:8010`

const ORDERS_URL = window.location.hostname.endsWith('shubhada.live')
  ? 'https://orders.shubhada.live'
  : `${window.location.protocol}//${window.location.hostname}:8000`

// TODO: no local/LAN port known yet for this one — always points at the
// tunnel domain until a fallback port is provided.
const DPS_URL = 'https://dps.shubhada.live'

interface HubCardProps {
  to?: string
  href?: string
  icon: JSX.Element
  title: string
  sub: string
  color: string
  bg: string
}

function HubCard({ to, href, icon, title, sub, color, bg }: HubCardProps) {
  const content = (
    <>
      <div className="hub-icon-wrap" style={{ background: bg, color }}>
        {icon}
      </div>
      <span className="hub-sub">{sub}</span>
      <span className="hub-title">{title}</span>
    </>
  )

  if (href) {
    return (
      <a className="hub-card" href={href} target="_blank" rel="noreferrer">
        {content}
      </a>
    )
  }

  return (
    <Link className="hub-card" to={to!}>
      {content}
    </Link>
  )
}

export default function App() {
  return (
    <div className="page">
      {/* Brand header */}
      <div className="hub-brand">
        <div className="hub-brand-logo">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#fff"
            strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
            <polyline points="3.27 6.96 12 12.01 20.73 6.96"/>
            <line x1="12" y1="22.08" x2="12" y2="12"/>
          </svg>
        </div>
        <h1>Shubhada Pharma</h1>
        <p>Tools</p>
      </div>

      {/* Hub cards */}
      <div style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: '28px 16px 40px',
      }}>
        <p style={{
          fontSize: 11,
          fontWeight: 700,
          color: 'var(--text-muted)',
          textTransform: 'uppercase',
          letterSpacing: '0.1em',
          marginBottom: 20,
        }}>
          Select Workflow
        </p>

        <div className="hub-grid">
          <HubCard
            to="/dc"
            icon={
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/>
                <rect x="8" y="2" width="8" height="4" rx="1"/>
                <path d="M9 12h6M9 16h4"/>
              </svg>
            }
            title="DC Checking & Verification"
            sub="Stage 1 + 2"
            color="#2563eb"
            bg="#eff6ff"
          />
          <HubCard
            href={STAGE3_URL}
            icon={
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="3" width="20" height="14" rx="2"/>
                <path d="M8 21h8M12 17v4"/>
              </svg>
            }
            title="Item Entry"
            sub="Stage 3 · CRM"
            color="#7c3aed"
            bg="#f5f3ff"
          />
          <HubCard
            href={BILLING_URL}
            icon={
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect width="20" height="14" x="2" y="5" rx="2"/>
                <line x1="2" x2="22" y1="10" y2="10"/>
              </svg>
            }
            title="Billing"
            sub="Sales"
            color="#0d9488"
            bg="#f0fdfa"
          />
          <HubCard
            to="/dashboard"
            icon={
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="20" x2="18" y2="10"/>
                <line x1="12" y1="20" x2="12" y2="4"/>
                <line x1="6" y1="20" x2="6" y2="14"/>
              </svg>
            }
            title="Dashboard"
            sub="Reports"
            color="#d97706"
            bg="#fffbeb"
          />
          <HubCard
            href={DPS_URL}
            icon={
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8"/>
                <line x1="21" y1="21" x2="16.65" y2="16.65"/>
              </svg>
            }
            title="Distributor Product Search"
            sub="Search"
            color="#0891b2"
            bg="#ecfeff"
          />
          <HubCard
            href={ORDERS_URL}
            icon={
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 2 5 6v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V6l-4-4Z"/>
                <path d="M3 6h18"/>
                <path d="M16 10a4 4 0 0 1-8 0"/>
              </svg>
            }
            title="Orders"
            sub="Purchase"
            color="#4f46e5"
            bg="#eef2ff"
          />
          <HubCard
            href={EVENTS_URL}
            icon={
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                <line x1="16" y1="2" x2="16" y2="6"/>
                <line x1="8" y1="2" x2="8" y2="6"/>
                <line x1="3" y1="10" x2="21" y2="10"/>
              </svg>
            }
            title="Events"
            sub="Calendar"
            color="#db2777"
            bg="#fdf2f8"
          />
        </div>
      </div>

      <footer style={{
        textAlign: 'center',
        padding: '12px 20px',
        fontSize: 11,
        color: 'var(--text-muted)',
        borderTop: '1px solid var(--border)',
        fontWeight: 500,
        letterSpacing: '0.02em',
      }}>
         Shubhada Pharma 2026
      </footer>
    </div>
  )
}
