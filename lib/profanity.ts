const BLOCKED = [
  // English
  'fuck', 'shit', 'nigga', 'niga', 'cunt', 'nigger', 'nigga', 'faggot', 'fag', 'bitch', 'asshole', 'bastard', 'whore', 'slut',
  // Russian (cyrillic)
  'хуй', 'хуя', 'хуем', 'хуйня', 'пизда', 'пизды', 'пиздец', 'пизде', 'ебать', 'ебал', 'ебаный', 'ёбаный',
  'блядь', 'бляди', 'сука', 'суки', 'мудак', 'мудаки', 'пидор', 'пидорас', 'залупа', 'ёб',
  // Russian (latin transliteration)
  'huy', 'khuy', 'hui', 'pizda', 'blyad', 'bliad', 'ebat', 'ebal', 'suka', 'mudak', 'pidor',
];

export function isProfane(text: string): boolean {
  const lower = text.toLowerCase();
  return BLOCKED.some((word) => lower.includes(word));
}
