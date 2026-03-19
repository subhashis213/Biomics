import { useEffect, useRef } from 'react';

/**
 * Embeds a Jitsi Meet room using the official External API.
 * This correctly enables camera, microphone, and screen sharing.
 */
export default function LiveClassRoom({ roomName, displayName, isHost }) {
  const containerRef = useRef(null);
  const apiRef = useRef(null);

  useEffect(() => {
    if (!roomName || !containerRef.current) return undefined;

    function initJitsi() {
      if (!window.JitsiMeetExternalAPI) return;
      if (apiRef.current) {
        try { apiRef.current.dispose(); } catch { /* ignore */ }
        apiRef.current = null;
      }

      apiRef.current = new window.JitsiMeetExternalAPI('meet.jit.si', {
        roomName,
        parentNode: containerRef.current,
        userInfo: { displayName: displayName || (isHost ? 'Admin' : 'Student') },
        configOverwrite: {
          startWithVideoMuted: false,
          startWithAudioMuted: false,
          disableDeepLinking: true,
          enableWelcomePage: false,
          prejoinPageEnabled: false,
          disableInviteFunctions: !isHost,
          enableInsecureRoomNameWarning: false,
          // Enable screen sharing by including 'desktop' in toolbar
          toolbarButtons: isHost
            ? ['microphone', 'camera', 'desktop', 'fullscreen', 'fodeviceselection',
               'hangup', 'chat', 'raisehand', 'videoquality', 'filmstrip',
               'tileview', 'videobackgroundblur', 'security', 'mute-everyone']
            : ['microphone', 'camera', 'desktop', 'fullscreen', 'fodeviceselection',
               'hangup', 'chat', 'raisehand', 'videoquality', 'filmstrip',
               'tileview', 'videobackgroundblur'],
        },
        interfaceConfigOverwrite: {
          TOOLBAR_ALWAYS_VISIBLE: true,
          DISABLE_JOIN_LEAVE_NOTIFICATIONS: false,
          SHOW_PROMOTIONAL_CLOSE_PAGE: false,
          MOBILE_APP_PROMO: false,
        },
        width: '100%',
        height: '100%',
      });
    }

    if (window.JitsiMeetExternalAPI) {
      initJitsi();
    } else {
      const existing = document.getElementById('jitsi-external-api-script');
      if (existing) {
        existing.addEventListener('load', initJitsi, { once: true });
      } else {
        const script = document.createElement('script');
        script.id = 'jitsi-external-api-script';
        script.src = 'https://meet.jit.si/external_api.js';
        script.async = true;
        script.onload = initJitsi;
        document.head.appendChild(script);
      }
    }

    return () => {
      if (apiRef.current) {
        try { apiRef.current.dispose(); } catch { /* ignore */ }
        apiRef.current = null;
      }
    };
  }, [roomName, displayName, isHost]);

  return (
    <div className="jitsi-container" ref={containerRef} aria-label="Live class video room" />
  );
}
