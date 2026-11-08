import { PrismaClient } from '@prisma/client';

type SeedQuote = { language: 'en' | 'pl'; text: string; source: string };

// Public domain only: authors who died before 1929 (or whose works are in the public domain),
// and traditional proverbs.
const QUOTES: SeedQuote[] = [
  // English
  { language: 'en', text: 'It is a truth universally acknowledged, that a single man in possession of a good fortune, must be in want of a wife.', source: 'Jane Austen, Pride and Prejudice (1813)' },
  { language: 'en', text: 'I could easily forgive his pride, if he had not mortified mine.', source: 'Jane Austen, Pride and Prejudice (1813)' },
  { language: 'en', text: 'Happy families are all alike; every unhappy family is unhappy in its own way.', source: 'Leo Tolstoy, Anna Karenina (trans. Constance Garnett)' },
  { language: 'en', text: 'It was the best of times, it was the worst of times, it was the age of wisdom, it was the age of foolishness, it was the epoch of belief, it was the epoch of incredulity, it was the season of Light, it was the season of Darkness.', source: 'Charles Dickens, A Tale of Two Cities (1859)' },
  { language: 'en', text: 'Marley was dead: to begin with.', source: 'Charles Dickens, A Christmas Carol (1843)' },
  { language: 'en', text: 'God bless us, every one!', source: 'Charles Dickens, A Christmas Carol (1843)' },
  { language: 'en', text: 'Please, sir, I want some more.', source: 'Charles Dickens, Oliver Twist (1838)' },
  { language: 'en', text: 'Whatever I have tried to do in life, I have tried with all my heart to do well; whatever I have devoted myself to, I have devoted myself to completely.', source: 'Charles Dickens, David Copperfield (1850)' },
  { language: 'en', text: 'I went to the woods because I wished to live deliberately, to front only the essential facts of life, and see if I could not learn what it had to teach, and not, when I came to die, discover that I had not lived.', source: 'Henry David Thoreau, Walden (1854)' },
  { language: 'en', text: 'Our life is frittered away by detail. Simplify, simplify.', source: 'Henry David Thoreau, Walden (1854)' },
  { language: 'en', text: 'Beware of all enterprises that require new clothes.', source: 'Henry David Thoreau, Walden (1854)' },
  { language: 'en', text: 'Whoso would be a man, must be a nonconformist.', source: 'Ralph Waldo Emerson, Self-Reliance (1841)' },
  { language: 'en', text: 'Imitation is suicide.', source: 'Ralph Waldo Emerson, Self-Reliance (1841)' },
  { language: 'en', text: 'Call me Ishmael.', source: 'Herman Melville, Moby-Dick (1851)' },
  { language: 'en', text: 'I am no bird; and no net ensnares me: I am a free human being with an independent will, which I now exert to leave you.', source: 'Charlotte Brontë, Jane Eyre (1847)' },
  { language: 'en', text: 'Beware; for I am fearless, and therefore powerful.', source: 'Mary Shelley, Frankenstein (1818)' },
  { language: 'en', text: 'Curiouser and curiouser!', source: 'Lewis Carroll, Alice\'s Adventures in Wonderland (1865)' },
  { language: 'en', text: 'We\'re all mad here.', source: 'Lewis Carroll, Alice\'s Adventures in Wonderland (1865)' },
  { language: 'en', text: 'Why, sometimes I\'ve believed as many as six impossible things before breakfast.', source: 'Lewis Carroll, Through the Looking-Glass (1871)' },
  { language: 'en', text: 'Once upon a midnight dreary, while I pondered, weak and weary, over many a quaint and curious volume of forgotten lore.', source: 'Edgar Allan Poe, The Raven (1845)' },
  { language: 'en', text: 'Quoth the Raven, "Nevermore."', source: 'Edgar Allan Poe, The Raven (1845)' },
  { language: 'en', text: 'Hope is the thing with feathers that perches in the soul, and sings the tune without the words, and never stops at all.', source: 'Emily Dickinson, poem (published 1891)' },
  { language: 'en', text: 'Tell all the truth but tell it slant.', source: 'Emily Dickinson, poem (published 1890)' },
  { language: 'en', text: 'A thing of beauty is a joy for ever.', source: 'John Keats, Endymion (1818)' },
  { language: 'en', text: 'The best-laid schemes o\' mice an\' men gang aft agley.', source: 'Robert Burns, To a Mouse (1785)' },
  { language: 'en', text: 'To be, or not to be, that is the question.', source: 'William Shakespeare, Hamlet (1603)' },
  { language: 'en', text: 'This above all: to thine own self be true.', source: 'William Shakespeare, Hamlet (1603)' },
  { language: 'en', text: 'All the world\'s a stage, and all the men and women merely players.', source: 'William Shakespeare, As You Like It (1623)' },
  { language: 'en', text: 'The course of true love never did run smooth.', source: 'William Shakespeare, A Midsummer Night\'s Dream (1600)' },
  { language: 'en', text: 'I can resist everything except temptation.', source: 'Oscar Wilde, Lady Windermere\'s Fan (1892)' },
  { language: 'en', text: 'Experience is the name everyone gives to their mistakes.', source: 'Oscar Wilde, Lady Windermere\'s Fan (1892)' },
  { language: 'en', text: 'Life is far too important a thing ever to talk seriously about.', source: 'Oscar Wilde, The Importance of Being Earnest (1895)' },
  { language: 'en', text: 'You don\'t know about me without you have read a book by the name of The Adventures of Tom Sawyer; but that ain\'t no matter.', source: 'Mark Twain, Adventures of Huckleberry Finn (1884)' },
  { language: 'en', text: 'If you can keep your head when all about you are losing theirs and blaming it on you.', source: 'Rudyard Kipling, If- (1910)' },
  { language: 'en', text: 'Early to bed and early to rise, makes a man healthy, wealthy and wise.', source: 'Benjamin Franklin, Poor Richard\'s Almanack (1735)' },
  { language: 'en', text: 'A journey of a thousand miles begins with a single step.', source: 'Laozi, Tao Te Ching (traditional)' },
  { language: 'en', text: 'Fortune favours the bold.', source: 'Virgil, Aeneid (traditional)' },
  { language: 'en', text: 'Well begun is half done.', source: 'Traditional proverb' },
  { language: 'en', text: 'Actions speak louder than words.', source: 'Traditional proverb' },
  { language: 'en', text: 'Practice makes perfect.', source: 'Traditional proverb' },
  { language: 'en', text: 'Rome was not built in a day.', source: 'Traditional proverb' },
  { language: 'en', text: 'Many hands make light work.', source: 'Traditional proverb' },
  // Polish
  { language: 'pl', text: 'Litwo! Ojczyzno moja! ty jesteś jak zdrowie. Ile cię trzeba cenić, ten tylko się dowie, kto cię stracił. Dziś piękność twą w całej ozdobie widzę i opisuję, bo tęsknię po tobie.', source: 'Adam Mickiewicz, Pan Tadeusz (1834)' },
  { language: 'pl', text: 'Co nagle, to po diable.', source: 'Przysłowie polskie' },
  { language: 'pl', text: 'Lepszy wróbel w garści niż gołąb na dachu.', source: 'Przysłowie polskie' },
  { language: 'pl', text: 'Kto pyta, nie błądzi.', source: 'Przysłowie polskie' },
  { language: 'pl', text: 'Strach ma wielkie oczy.', source: 'Przysłowie polskie' },
  { language: 'pl', text: 'Bez pracy nie ma kołaczy.', source: 'Przysłowie polskie' },
  { language: 'pl', text: 'Gdzie kucharek sześć, tam nie ma co jeść.', source: 'Przysłowie polskie' },
  { language: 'pl', text: 'Nie chwal dnia przed zachodem słońca.', source: 'Przysłowie polskie' },
  { language: 'pl', text: 'Czas to pieniądz.', source: 'Przysłowie polskie' },
  { language: 'pl', text: 'Kropla drąży skałę.', source: 'Przysłowie polskie' },
  { language: 'pl', text: 'Jak sobie pościelisz, tak się wyśpisz.', source: 'Przysłowie polskie' },
  { language: 'pl', text: 'Dla chcącego nic trudnego.', source: 'Przysłowie polskie' },
  { language: 'pl', text: 'Lepiej późno niż wcale.', source: 'Przysłowie polskie' },
  { language: 'pl', text: 'Z deszczu pod rynnę.', source: 'Przysłowie polskie' },
  { language: 'pl', text: 'Co dwie głowy, to nie jedna.', source: 'Przysłowie polskie' },
  { language: 'pl', text: 'Nie od razu Kraków zbudowano.', source: 'Przysłowie polskie' },
  { language: 'pl', text: 'Kto szuka, ten znajdzie.', source: 'Przysłowie polskie' },
  { language: 'pl', text: 'Nie ma róży bez kolców.', source: 'Przysłowie polskie' },
  { language: 'pl', text: 'Mądry Polak po szkodzie.', source: 'Przysłowie polskie' },
];

const prisma = new PrismaClient();

async function main(): Promise<void> {
  // Replace the whole quote set in one transaction, so re-running the seed is idempotent.
  await prisma.$transaction([
    prisma.quote.deleteMany(),
    prisma.quote.createMany({
      data: QUOTES.map((q) => ({ ...q, length: q.text.length })),
    }),
  ]);
  console.log(`Seeded ${QUOTES.length} quotes.`);
}

main()
  .catch((err: unknown) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
