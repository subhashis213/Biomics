/** Official BiomicsHub Telegram community group (same link as website). */
export const TELEGRAM_GROUP_URL = 'https://t.me/+kUUdTvXAZ7ExZDY1';
export const TELEGRAM_GROUP_INVITE = 'kUUdTvXAZ7ExZDY1';

export const SOCIAL_LINKS = [
  {
    key: 'youtube',
    label: 'Youtube',
    url: 'https://www.youtube.com/@biomicshub5733',
    icon: 'logo-youtube' as const,
    color: '#FF0000'
  },
  {
    key: 'instagram',
    label: 'Instagram',
    url: 'https://www.instagram.com/biomics_hub?igsh=aGJyNzhrOWZkeWV5',
    icon: 'logo-instagram' as const,
    color: '#E1306C'
  },
  {
    key: 'telegram-group',
    label: 'Telegram',
    url: TELEGRAM_GROUP_URL,
    telegramInvite: TELEGRAM_GROUP_INVITE,
    icon: 'paper-plane' as const,
    color: '#229ED9'
  },
  {
    key: 'whatsapp',
    label: 'Chat',
    url: 'https://chat.whatsapp.com/Fc8P3ZUDhfYDw6swMKDHOI',
    icon: 'logo-whatsapp' as const,
    color: '#25D366'
  }
] as const;
