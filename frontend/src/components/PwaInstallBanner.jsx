import { useEffect, useState } from 'react';
import { Icon } from '../icons/IconSprite.jsx';

/**
 * Shows a one-time install banner when the browser fires beforeinstallprompt.
 * Hidden once installed / dismissed for this browser.
 */
export default function PwaInstallBanner() {
  const [deferred, setDeferred] = useState(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    if (window.matchMedia('(display-mode: standalone)').matches) return undefined;
    if (localStorage.getItem('pwa-install-dismissed') === '1') return undefined;

    function onPrompt(e) {
      e.preventDefault();
      setDeferred(e);
      setVisible(true);
    }

    function onInstalled() {
      setVisible(false);
      setDeferred(null);
    }

    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  if (!visible || !deferred) return null;

  async function install() {
    deferred.prompt();
    const choice = await deferred.userChoice;
    setDeferred(null);
    setVisible(false);
    if (choice?.outcome === 'dismissed') {
      localStorage.setItem('pwa-install-dismissed', '1');
    }
  }

  function dismiss() {
    localStorage.setItem('pwa-install-dismissed', '1');
    setVisible(false);
  }

  return (
    <div className="pwa-install-banner" role="dialog" aria-label="Install Wiki Studio app">
      <img src="/icons/icon-192.png" alt="" width={40} height={40} />
      <div className="pwa-install-copy">
        <strong>Install Wiki Studio</strong>
        <span>Add to your home screen for faster access</span>
      </div>
      <button type="button" className="primary-btn pwa-install-btn" onClick={install}>
        Install
      </button>
      <button type="button" className="plain-icon" aria-label="Dismiss" onClick={dismiss}>
        <Icon id="i-close" />
      </button>
    </div>
  );
}
