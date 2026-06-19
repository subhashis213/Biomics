/** Official BiomicsHub Telegram community — keep in sync with biomicshub-app/src/constants/socialLinks.ts */
export const TELEGRAM_GROUP_URL = 'https://t.me/+kUUdTvXAZ7ExZDY1';
export const TELEGRAM_GROUP_INVITE = 'kUUdTvXAZ7ExZDY1';

export const SOCIAL_LINKS = {
  telegram: {
    label: 'Telegram',
    handle: 'Join Channel',
    href: TELEGRAM_GROUP_URL,
    invite: TELEGRAM_GROUP_INVITE
  },
  whatsapp: {
    label: 'WhatsApp',
    handle: 'Join group',
    href: 'https://chat.whatsapp.com/Fc8P3ZUDhfYDw6swMKDHOI'
  },
  youtube: {
    label: 'YouTube',
    handle: '@biomicshub5733',
    href: 'https://www.youtube.com/@biomicshub5733'
  },
  instagram: {
    label: 'Instagram',
    handle: '@biomics_hub',
    href: 'https://www.instagram.com/biomics_hub?igsh=aGJyNzhrOWZkeWV5'
  }
};

/** Student dashboard Connect section — order & copy */
export const CONNECT_PLATFORMS = [
  {
    id: 'telegram',
    label: SOCIAL_LINKS.telegram.label,
    handle: 'Official updates channel',
    blurb: 'Live alerts, notes & community drops',
    href: SOCIAL_LINKS.telegram.href,
    tone: 'telegram'
  },
  {
    id: 'whatsapp',
    label: SOCIAL_LINKS.whatsapp.label,
    handle: SOCIAL_LINKS.whatsapp.handle,
    blurb: 'Peer doubts & quick support',
    href: SOCIAL_LINKS.whatsapp.href,
    tone: 'whatsapp'
  },
  {
    id: 'youtube',
    label: SOCIAL_LINKS.youtube.label,
    handle: SOCIAL_LINKS.youtube.handle,
    blurb: 'Free lectures & revision playlists',
    href: SOCIAL_LINKS.youtube.href,
    tone: 'youtube'
  },
  {
    id: 'instagram',
    label: SOCIAL_LINKS.instagram.label,
    handle: SOCIAL_LINKS.instagram.handle,
    blurb: 'Reels, tips & visual revision',
    href: SOCIAL_LINKS.instagram.href,
    tone: 'instagram'
  }
];
