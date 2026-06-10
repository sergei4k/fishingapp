import Filter from 'bad-words';

const filter = new Filter();

// Russian profanity (latin transliteration + common bypass attempts)
filter.addWords(
  'huy', 'khuy', 'hui', 'chuy', 'pizda', 'pizdа', 'blyad', 'bliad', 'ebat',
  'ebal', 'suka', 'mudak', 'pidor', 'pederast', 'xyй', 'залупа', 'ёбаный',
  'пиздец', 'блядь', 'хуй', 'пизда', 'ебать', 'сука', 'мудак', 'пидор'
);

export function isProfane(text: string): boolean {
  try {
    return filter.isProfane(text);
  } catch {
    return false;
  }
}
