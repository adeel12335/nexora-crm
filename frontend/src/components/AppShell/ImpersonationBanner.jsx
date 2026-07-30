import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';

/** Sticky bar shown while an admin is browsing as another user. */
export default function ImpersonationBanner() {
  const { user, impersonating, exitImpersonation } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);

  if (!impersonating || !user) return null;

  async function handleSwitchBack() {
    setBusy(true);
    try {
      const admin = await exitImpersonation();
      showToast(`Switched back to ${admin.name}`);
      navigate(`/${admin.role}`, { replace: true });
    } catch (err) {
      showToast(err.message || 'Could not switch back');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="impersonation-banner" role="status">
      <p>
        Viewing as <strong>{user.name}</strong>
        <span className="impersonation-role"> ({user.role})</span>
      </p>
      <button type="button" className="tool-btn" disabled={busy} onClick={handleSwitchBack}>
        {busy ? 'Switching…' : `Switch back to ${impersonating.name}`}
      </button>
    </div>
  );
}
