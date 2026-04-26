import { Suspense, lazy, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { StreamChat } from 'stream-chat';
import {
  Channel,
  ChannelHeader,
  Chat,
  Window
} from 'stream-chat-react';
import 'stream-chat-react/dist/css/v2/index.css';
import { fetchCommunityChatToken, fetchCommunityChatUnreadCount } from '../api';
import AppShell from '../components/AppShell';

const CommunityChatMessagePane = lazy(() => import('../components/CommunityChatMessagePane'));
const CommunityChatThreadPane = lazy(() => import('../components/CommunityChatThreadPane'));

export default function CommunityChatPage() {
  const navigate = useNavigate();
  const [client, setClient] = useState(null);
  const [channel, setChannel] = useState(null);
  const [loading, setLoading] = useState(true);
  const [errorText, setErrorText] = useState('');
  const [unreadCount, setUnreadCount] = useState(0);
  const [isUnreadRefreshing, setIsUnreadRefreshing] = useState(false);

  useEffect(() => {
    let mounted = true;
    let streamClient = null;

    async function initCommunityChat() {
      setLoading(true);
      setErrorText('');
      try {
        const data = await fetchCommunityChatToken();
        if (!mounted) return;

        if (!data?.apiKey || !data?.token || !data?.user?.id) {
          throw new Error('Community chat configuration is incomplete. Please re-login and try again.');
        }

        // Use a fresh client instance to avoid stale singleton key/token mismatches.
        streamClient = new StreamChat(data.apiKey);
        await streamClient.connectUser(data.user, data.token);

        const nextChannel = streamClient.channel(data.channel.type, data.channel.id);
        await nextChannel.watch();
        await nextChannel.markRead().catch(() => {});

        if (!mounted) return;
        setClient(streamClient);
        setChannel(nextChannel);
      } catch (error) {
        if (!mounted) return;
        const message = String(error?.message || 'Failed to open community chat.');
        setErrorText(message);
      } finally {
        if (mounted) setLoading(false);
      }
    }

    initCommunityChat();

    return () => {
      mounted = false;
      if (streamClient) {
        streamClient.disconnectUser().catch(() => {});
      }
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const syncUnread = async (manual = false) => {
      if (manual) setIsUnreadRefreshing(true);
      try {
        const data = await fetchCommunityChatUnreadCount();
        if (!cancelled) setUnreadCount(Math.max(0, Number(data?.unreadCount || 0)));
      } catch {
        if (!cancelled) setUnreadCount(0);
      } finally {
        if (!cancelled && manual) setIsUnreadRefreshing(false);
      }
    };

    syncUnread();
    const timer = window.setInterval(syncUnread, 15000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  return (
    <AppShell
      title="Community Chat"
      subtitle="Real-time discussion space for admin and all students"
      roleLabel="Live"
      showThemeSwitch
      actions={(
        <button type="button" className="secondary-btn" onClick={() => navigate(-1)}>
          ← Back
        </button>
      )}
    >
      <main className="admin-workspace-page community-chat-page">
        {loading ? <p className="empty-note">Connecting to community chat...</p> : null}
        {errorText ? <p className="banner error">{errorText}</p> : null}

        {!loading && !errorText && client && channel ? (
          <section className="card community-chat-shell">
            <header className="community-chat-topbar">
              <div>
                <p className="community-chat-kicker">Biomics Hub Community</p>
                <h2>General Discussion Space</h2>
              </div>
              <div className="community-chat-presence">
                <span className="community-chat-dot" aria-hidden="true" />
                Live
              </div>
              <div className="community-chat-meta-actions">
                <span className="community-chat-unread-pill" aria-label={`${unreadCount} unread messages`}>
                  Unread: {unreadCount > 99 ? '99+' : unreadCount}
                </span>
                <button
                  type="button"
                  className="secondary-btn community-chat-refresh-btn"
                  disabled={isUnreadRefreshing}
                  onClick={() => {
                    setIsUnreadRefreshing(true);
                    fetchCommunityChatUnreadCount()
                      .then((data) => setUnreadCount(Math.max(0, Number(data?.unreadCount || 0))))
                      .catch(() => setUnreadCount(0))
                      .finally(() => setIsUnreadRefreshing(false));
                  }}
                >
                  {isUnreadRefreshing ? 'Refreshing...' : 'Refresh'}
                </button>
              </div>
            </header>

            <div className="community-chat-frame">
              <Chat client={client} theme="str-chat__theme-light">
                <Channel channel={channel}>
                  <Window>
                    <ChannelHeader />
                    <Suspense fallback={<div className="empty-note">Loading chat messages...</div>}>
                      <CommunityChatMessagePane />
                    </Suspense>
                  </Window>
                  <Suspense fallback={null}>
                    <CommunityChatThreadPane />
                  </Suspense>
                </Channel>
              </Chat>
            </div>
          </section>
        ) : null}
      </main>
    </AppShell>
  );
}
