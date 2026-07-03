import { useEffect, useState } from 'react';

export function useServerAnnouncement(serverUrl) {
  const [serverAnnouncement, setServerAnnouncement] = useState(null);

  useEffect(() => {
    if (typeof window === 'undefined' || !serverUrl) return undefined;
    const announcementUrl = `${serverUrl.replace(/\/$/, '')}/api/announcement`;
    let cancelled = false;

    async function syncAnnouncement() {
      try {
        const res = await fetch(announcementUrl, { cache: 'no-store' });
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) setServerAnnouncement(data?.announcement || null);
      } catch {
        // Announcement polling is a multiplayer fallback and should not affect solo play.
      }
    }

    syncAnnouncement();
    const intervalId = setInterval(syncAnnouncement, 15000);
    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, [serverUrl]);

  return [serverAnnouncement, setServerAnnouncement];
}
