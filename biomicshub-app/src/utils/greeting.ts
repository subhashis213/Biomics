/** Returns a time-of-day greeting with emoji for the home header. */
export function getTimeGreeting(date = new Date()) {
  const hour = date.getHours();
  if (hour < 12) return 'Good morning ☀️';
  if (hour < 17) return 'Good afternoon 🌤️';
  if (hour < 21) return 'Good evening 🌆';
  return 'Good night 🌙';
}
