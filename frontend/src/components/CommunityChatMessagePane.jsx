import { MessageInput, MessageList } from 'stream-chat-react';

export default function CommunityChatMessagePane() {
  return (
    <>
      <MessageList />
      <MessageInput focus />
    </>
  );
}