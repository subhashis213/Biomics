/**
 * Android system notifications render HTML via Notifee (bold / color / size).
 * Same markup as admin Notify screen: [b], [red], [big], [h], [accent], [blue], [green]
 */

export function stripRichMarkup(text?: string) {
  return String(text || '')
    .replace(/\[(\/)?(b|red|big|h|accent|blue|green)\]/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function richMarkupToHtml(text?: string) {
  let s = String(text || '');
  if (!s) return '';

  const replacements: Array<[RegExp, string]> = [
    [/\[b\]([\s\S]*?)\[\/b\]/gi, '<b>$1</b>'],
    [/\[red\]([\s\S]*?)\[\/red\]/gi, '<font color="#d64545"><b>$1</b></font>'],
    [/\[blue\]([\s\S]*?)\[\/blue\]/gi, '<font color="#2563eb"><b>$1</b></font>'],
    [/\[green\]([\s\S]*?)\[\/green\]/gi, '<font color="#1f9d57"><b>$1</b></font>'],
    [/\[accent\]([\s\S]*?)\[\/accent\]/gi, '<font color="#0d9488"><b>$1</b></font>'],
    [/\[big\]([\s\S]*?)\[\/big\]/gi, '<big><b>$1</b></big>'],
    [/\[h\]([\s\S]*?)\[\/h\]/gi, '<big><b>$1</b></big>']
  ];

  let prev = '';
  let guard = 0;
  while (prev !== s && guard < 12) {
    prev = s;
    guard += 1;
    replacements.forEach(([pattern, repl]) => {
      s = s.replace(pattern, repl);
    });
  }
  return s.trim();
}

export function wrapRichTag(tag: 'b' | 'red' | 'big' | 'h' | 'accent' | 'blue' | 'green', sample = 'your text') {
  return `[${tag}]${sample}[/${tag}]`;
}
