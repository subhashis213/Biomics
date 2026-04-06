import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { StreamChat } from 'stream-chat';
import {
  Channel,
  ChannelHeader,
  Chat,
  MessageInput,
  MessageList,
  Thread,
  Window
} from 'stream-chat-react';
import 'stream-chat-react/dist/css/v2/index.css';
import { fetchCommunityChatToken } from '../api';
import AppShell from '../components/AppShell';

export default function CommunityChatPage() {
  const navigate = useNavigate();
  const [client, setClient] = useState(null);
  const [channel, setChannel] = useState(null);
  const [loading, setLoading] = useState(true);
  const [errorText, setErrorText] = useState('');

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
            </header>

            <div className="community-chat-frame">
              <Chat client={client} theme="str-chat__theme-light">
                <Channel channel={channel}>
                  <Window>
                    <ChannelHeader />
                    <MessageList />
                    <MessageInput focus />
                  </Window>
                  <Thread />
                </Channel>
              </Chat>
            </div>
          </section>
        ) : null}
      </main>
    </AppShell>
  );
}
