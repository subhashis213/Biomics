import { useChannelStateContext } from 'stream-chat-react';

export default function CommunityChatChannelHeader({ registeredMemberCount = 0 }) {
  const { channel } = useChannelStateContext();
  const title = channel?.data?.name || 'Biomics Community';
  const count = Math.max(0, Number(registeredMemberCount || 0));

  return (
    <div className="community-chat-stream-header">
      <div>
        <p className="community-chat-stream-kicker">Live community</p>
        <h3 className="community-chat-stream-title">{title}</h3>
        <p className="community-chat-stream-meta">
          {count} registered member{count === 1 ? '' : 's'}
        </p>
      </div>
      <div className="community-chat-stream-live">
        <span className="community-chat-dot" aria-hidden="true" />
        Live
      </div>
    </div>
  );
}
