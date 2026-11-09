import { PrismaClient } from '@prisma/client';

export type SeedQuote = { language: 'en' | 'pl' | 'de' | 'es'; text: string; source: string };

// Public domain only: authors who died before 1929 (or whose works are in the public domain),
// and traditional proverbs.
export const QUOTES: SeedQuote[] = [
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
  { language: 'en', text: 'It is a truth universally acknowledged, that a single man in possession of a good fortune, must be in want of a wife. However little known the feelings or views of such a man may be on his first entering a neighbourhood, this truth is so well fixed in the minds of the surrounding families, that he is considered the rightful property of some one or other of their daughters.', source: 'Jane Austen, Pride and Prejudice (1813)' },
  { language: 'en', text: 'Call me Ishmael. Some years ago\u2014never mind how long precisely\u2014having little or no money in my purse, and nothing particular to interest me on shore, I thought I would sail about a little and see the watery part of the world. It is a way I have of driving off the spleen and regulating the circulation.', source: 'Herman Melville, Moby-Dick (1851)' },
  { language: 'en', text: 'Happy families are all alike; every unhappy family is unhappy in its own way. Everything was in confusion in the Oblonskys\' house. The wife had discovered that the husband was carrying on an intrigue with a French girl, who had been a governess in their family, and she had announced to her husband that she could not go on living in the same house with him.', source: 'Leo Tolstoy, Anna Karenina (trans. Constance Garnett)' },
  { language: 'en', text: 'Marley was dead: to begin with. There is no doubt whatever about that. The register of his burial was signed by the clergyman, the clerk, the undertaker, and the chief mourner. Scrooge signed it: and Scrooge\'s name was good upon \'Change, for anything he chose to put his hand to.', source: 'Charles Dickens, A Christmas Carol (1843)' },
  { language: 'en', text: 'YOU don\'t know about me without you have read a book by the name of The Adventures of Tom Sawyer; but that ain\'t no matter. That book was made by Mr. Mark Twain, and he told the truth, mainly. There was things which he stretched, but mainly he told the truth. That is nothing. I never seen anybody but lied, one time or another, without it was Aunt Polly, or the widow, or maybe Mary.', source: 'Mark Twain, Adventures of Huckleberry Finn (1884)' },
  { language: 'en', text: 'There were a king with a large jaw and a queen with a plain face, on the throne of England; there were a king with a large jaw and a queen with a fair face, on the throne of France. In both countries it was clearer than crystal to the lords of the State preserves of loaves and fishes, that things in general were settled for ever.', source: 'Charles Dickens, A Tale of Two Cities (1859)' },
  { language: 'en', text: 'I went to the woods because I wished to live deliberately, to front only the essential facts of life, and see if I could not learn what it had to teach, and not, when I came to die, discover that I had not lived. I did not wish to live what was not life, living is so dear; nor did I wish to practise resignation, unless it was quite necessary. I wanted to live deep and suck out all the marrow of life, to live so sturdily and Spartan-like as to put to rout all that was not life, to cut a broad swath and shave close, to drive life into a corner, and reduce it to its lowest terms, and, if it proved to be mean, why then to get the whole and genuine meanness of it, and publish its meanness to the world; or if it were sublime, to know it by experience, and be able to give a true account of it in my next excursion.', source: 'Henry David Thoreau, Walden (1854)' },
  // German (public domain: pre-1929 works, or pre-1900 for Nietzsche, and traditional proverbs)
  { language: 'de', text: 'Sapere aude! Habe Mut, dich deines eigenen Verstandes zu bedienen!', source: 'Immanuel Kant, Was ist Aufklärung? (1784)' },
  { language: 'de', text: 'Gott ist tot! Gott bleibt tot! Und wir haben ihn getötet!', source: 'Friedrich Nietzsche, Die fröhliche Wissenschaft (1882)' },
  { language: 'de', text: 'Was mich nicht umbringt, macht mich stärker.', source: 'Friedrich Nietzsche, Götzen-Dämmerung (1888)' },
  { language: 'de', text: 'Ich ging im Walde so für mich hin, und nichts zu suchen, das war mein Sinn.', source: 'Johann Wolfgang von Goethe, Gefunden (1813)' },
  { language: 'de', text: 'Das war ein Vorspiel nur, dort wo man Bücher verbrennt, verbrennt man auch am Ende Menschen.', source: 'Heinrich Heine, Almansor (1821)' },
  { language: 'de', text: 'Spieglein, Spieglein an der Wand, wer ist die Schönste im ganzen Land?', source: 'Brothers Grimm, Schneewittchen (1812)' },
  { language: 'de', text: 'Übung macht den Meister.', source: 'Sprichwort' },
  { language: 'de', text: 'Wer rastet, der rostet.', source: 'Sprichwort' },
  { language: 'de', text: 'Wer reitet so spät durch Nacht und Wind? Es ist der Vater mit seinem Kind; Er hat den Knaben wohl in dem Arm, Er faßt ihn sicher, er hält ihn warm.', source: 'Johann Wolfgang von Goethe, Erlkönig (1782)' },
  { language: 'de', text: 'Wer mit Ungeheuern kämpft, mag zusehn, dass er nicht dabei zum Ungeheuer wird. Und wenn du lange in einen Abgrund blickst, blickt der Abgrund auch in dich hinein.', source: 'Friedrich Nietzsche, Jenseits von Gut und Böse (1886)' },
  { language: 'de', text: 'Ich weiß nicht, was soll es bedeuten, daß ich so traurig bin; ein Märchen aus alten Zeiten, das kommt mir nicht aus dem Sinn. Die Luft ist kühl und es dunkelt, und ruhig fließt der Rhein; der Gipfel des Berges funkelt im Abendsonnenschein. Die schönste Jungfrau sitzet dort oben wunderbar, ihr goldnes Geschmeide blitzet, sie kämmt ihr goldenes Haar.', source: 'Heinrich Heine, Die Loreley (1824)' },
  { language: 'de', text: 'Habe nun, ach! Philosophie, Juristerei und Medizin, und leider auch Theologie! Durchaus studiert, mit heißem Bemühn.', source: 'Johann Wolfgang von Goethe, Faust I (1808)' },
  { language: 'de', text: 'Fest gemauert in der Erden steht die Form, aus Lehm gebrannt. Heute muß die Glocke werden! Frisch, Gesellen, seid zur Hand!', source: 'Friedrich Schiller, Das Lied von der Glocke (1799)' },
  { language: 'de', text: 'Aufklärung ist der Ausgang des Menschen aus seiner selbstverschuldeten Unmündigkeit. Unmündigkeit ist das Unvermögen, sich seines Verstandes ohne Leitung eines anderen zu bedienen. Selbstverschuldet ist diese Unmündigkeit, wenn die Ursache derselben nicht am Mangel des Verstandes, sondern der Entschließung und des Mutes liegt, sich seiner ohne Leitung eines anderen zu bedienen. Sapere aude! Habe Mut, dich deines eigenen Verstandes zu bedienen! ist also der Wahlspruch der Aufklärung.', source: 'Immanuel Kant, Was ist Aufklärung? (1784)' },
  { language: 'de', text: 'Freude, schöner Götterfunken, Tochter aus Elysium, Wir betreten feuertrunken, Himmlische, dein Heiligtum! Deine Zauber binden wieder, Was die Mode streng geteilt; Alle Menschen werden Brüder, Wo dein sanfter Flügel weilt.', source: 'Friedrich Schiller, An die Freude (1785)' },
  { language: 'de', text: 'Zwei Seelen wohnen, ach! in meiner Brust, Die eine will sich von der andern trennen; Die eine hält, in derber Liebeslust, Sich an die Welt mit klammernden Organen; Die andre hebt gewaltsam sich vom Dust Zu den Gefilden hoher Ahnen.', source: 'Johann Wolfgang von Goethe, Faust I (1808)' },
  { language: 'de', text: 'Es war mitten im Winter, und die Schneeflocken fielen wie Federn vom Himmel herab, da saß eine Königin an einem Fenster, das einen Rahmen von schwarzem Ebenholz hatte, und nähte. Und wie sie so nähte und nach dem Schnee aufsah, stach sie sich mit der Nadel in den Finger, und es fielen drei Tropfen Blut in den Schnee.', source: 'Brothers Grimm, Schneewittchen (1812)' },
  // Spanish (public domain: pre-1929 works, or older, and traditional proverbs)
  { language: 'es', text: 'Cada uno es artífice de su ventura.', source: 'Miguel de Cervantes, Don Quijote de la Mancha, Parte II (1615)' },
  { language: 'es', text: 'Polvo serán, mas polvo enamorado.', source: 'Francisco de Quevedo, soneto (siglo XVII)' },
  { language: 'es', text: 'En boca cerrada no entran moscas.', source: 'Refrán' },
  { language: 'es', text: 'No hay mal que por bien no venga.', source: 'Refrán' },
  { language: 'es', text: 'Más vale pájaro en mano que cien volando.', source: 'Refrán' },
  { language: 'es', text: 'Quien mucho abarca, poco aprieta.', source: 'Refrán' },
  { language: 'es', text: 'Al mal tiempo, buena cara.', source: 'Refrán' },
  { language: 'es', text: 'Camarón que se duerme, se lo lleva la corriente.', source: 'Refrán' },
  { language: 'es', text: 'Caminante, son tus huellas el camino y nada más; caminante, no hay camino, se hace camino al andar. Al andar se hace el camino, y al volver la vista atrás se ve la senda que nunca se ha de volver a pisar.', source: 'Antonio Machado, Campos de Castilla (1912)' },
  { language: 'es', text: 'Volverán las oscuras golondrinas en tu balcón sus nidos a colgar, y, otra vez, con el ala a sus cristales, jugando llamarán; pero aquellas que el vuelo refrenaban tu hermosura y mi dicha a contemplar, aquellas que aprendieron nuestros nombres, ésas... ¡ésas no volverán!', source: 'Gustavo Adolfo Bécquer, Rimas (1871)' },
  { language: 'es', text: 'Miré los muros de la patria mía, si un tiempo fuertes, ya desmoronados, de la carrera de la edad cansados, por quien caduca ya su valentía.', source: 'Francisco de Quevedo, soneto (siglo XVII)' },
  { language: 'es', text: '¿Qué es la vida? Un frenesí. ¿Qué es la vida? Una ilusión, una sombra, una ficción, y el mayor bien es pequeño; que toda la vida es sueño, y los sueños, sueños son.', source: 'Pedro Calderón de la Barca, La vida es sueño (1635)' },
  { language: 'es', text: 'En un lugar de la Mancha, de cuyo nombre no quiero acordarme, no ha mucho tiempo que vivía un hidalgo de los de lanza en astillero, adarga antigua, rocín flaco y galgo corredor. Una olla de algo más vaca que carnero, salpicón las más noches, duelos y quebrantos los sábados, lentejas los viernes, algún palomino de añadidura los domingos, consumían las tres partes de su hacienda.', source: 'Miguel de Cervantes, Don Quijote de la Mancha (1605)' },
  { language: 'es', text: 'La libertad, Sancho, es uno de los más preciosos dones que a los hombres dieron los cielos; con ella no se pueden igualar los tesoros que encierra la tierra ni el mar encubre; por la libertad, así como por la honra, se puede y debe aventurar la vida; y, por el contrario, el cautiverio es el mayor mal que puede venir a los hombres.', source: 'Miguel de Cervantes, Don Quijote de la Mancha, Parte II (1615)' },
  { language: 'es', text: 'Podrá nublarse el sol eternamente; podrá secarse en un instante el mar; podrá romperse el eje de la tierra como un débil cristal. ¡Todo sucederá! Podrá la muerte cubrirme con su fúnebre crespón; pero jamás en mí podrá apagarse la llama de tu amor.', source: 'Gustavo Adolfo Bécquer, Rimas (1871)' },
  // Polish
  { language: 'pl', text: 'Litwo! Ojczyzno moja! ty jesteś jak zdrowie. Ile cię trzeba cenić, ten tylko się dowie, Kto cię stracił. Dziś piękność twą w całej ozdobie Widzę i opisuję, bo tęsknię po tobie. Panno Święta, co jasnej bronisz Częstochowy I w Ostrej świecisz Bramie! Ty, co gród zamkowy Nowogródzki ochraniasz z jego wiernym ludem!', source: 'Adam Mickiewicz, Pan Tadeusz (1834)' },
  { language: 'pl', text: 'Wielkieś mi uczyniła pustki w domu moim, Moja droga Orszulo, tym zniknienim swoim. Pełno nas, a jakoby nikogo nie było: Jedną maluczką duszą tak wiele ubyło. Tyś za wszytki mówiła, za wszytki śpiewała, Wszytkie w domu kąciki zawżdy pobiegała.', source: 'Jan Kochanowski, Tren VIII (1580)' },
  { language: 'pl', text: 'Żyłem z wami, cierpiałem i płakałem z wami, Nigdy mi, kto szlachetny, nie był obojętny, Dziś was rzucam i dalej idę w cień — z duchami — A jak gdyby tu szczęście było — idę smętny.', source: 'Juliusz Słowacki, Testament mój (1840)' },
  { language: 'pl', text: 'Bez serc, bez ducha, to szkieletów ludy; Młodości! dodaj mi skrzydła! Niech nad martwym wzlecę światem W rajską dziedzinę ułudy: Kędy zapał tworzy cudy, Nowości potrząsa kwiatem I obleka w nadziei złote malowidła!', source: 'Adam Mickiewicz, Oda do młodości (1820)' },
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

async function main(): Promise<void> {
  const prisma = new PrismaClient();
  try {
    // Replace the whole quote set in one transaction, so re-running the seed is idempotent.
    await prisma.$transaction([
      prisma.quote.deleteMany(),
      prisma.quote.createMany({
        data: QUOTES.map((q) => ({ ...q, length: q.text.length })),
      }),
    ]);
    console.log(`Seeded ${QUOTES.length} quotes.`);
  } finally {
    await prisma.$disconnect();
  }
}

// Only when run directly (prisma db seed), so the quote list can be imported by tests.
if (require.main === module) {
  main().catch((err: unknown) => {
    console.error(err);
    process.exitCode = 1;
  });
}
