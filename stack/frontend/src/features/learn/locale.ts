// i18n namespace owned by the learn feature (`learn`). Merged into i18next by src/i18n/index.ts.
// Lesson titles and hints are keyed by lesson id (see lib/text/lessons.ts) and live in lessonCopy.json.
import copy from './lessonCopy.json';

export const learnLocale = {
  en: {
    learn: {
      navLabel: 'Learn',
      heading: 'Learn',
      intro: 'A guided path. Each lesson adds a few keys, and passing one opens the next. Lessons use English words.',
      emulatedNote: 'Lessons follow your emulated layout.',
      status: { locked: 'Locked', available: 'Not passed yet', passed: 'Passed' },
      best: 'Best {{wpm}} wpm, {{acc}}% accuracy',
      blocked: 'Pass lesson {{number}} first',
      shift: 'Shift',
      list: { label: 'Lessons', goal: 'Goal {{wpm}} wpm, {{acc}}%' },
      lesson: {
        back: 'All lessons',
        newKeys: 'New keys:',
        noNewKeys: 'No new keys this time.',
        caps: 'Hold Shift with the opposite hand for each capital letter.',
        goal: 'Goal: {{wpm}} wpm at {{acc}}% accuracy.',
        passed: 'Passed. {{wpm}} wpm at {{acc}}% accuracy.',
        failed: 'Not yet. {{wpm}} wpm at {{acc}}% accuracy. Keep going or try again.',
        replay: 'Replay',
        tryAgain: 'Try again',
        next: 'Next lesson',
        lastDone: 'That was the last lesson.',
        loadError: "Couldn't save your progress in this browser.",
      },
      lessons: copy.en,
    },
  },
  pl: {
    learn: {
      navLabel: 'Nauka',
      heading: 'Nauka',
      intro: 'Prowadzona ścieżka. Każda lekcja dodaje kilka klawiszy, a zaliczenie jednej otwiera następną. Lekcje używają angielskich słów.',
      emulatedNote: 'Lekcje działają zgodnie z emulowanym układem.',
      status: { locked: 'Zablokowana', available: 'Jeszcze nie zaliczona', passed: 'Zaliczona' },
      best: 'Najlepiej {{wpm}} wpm, {{acc}}% dokładności',
      blocked: 'Najpierw zalicz lekcję {{number}}',
      shift: 'Shift',
      list: { label: 'Lekcje', goal: 'Cel {{wpm}} wpm, {{acc}}%' },
      lesson: {
        back: 'Wszystkie lekcje',
        newKeys: 'Nowe klawisze:',
        noNewKeys: 'Tym razem bez nowych klawiszy.',
        caps: 'Każdą wielką literę pisz, przytrzymując Shift drugą ręką.',
        goal: 'Cel: {{wpm}} wpm przy {{acc}}% dokładności.',
        passed: 'Zaliczone. {{wpm}} wpm przy {{acc}}% dokładności.',
        failed: 'Jeszcze nie. {{wpm}} wpm przy {{acc}}% dokładności. Próbuj dalej albo spróbuj ponownie.',
        replay: 'Powtórz',
        tryAgain: 'Spróbuj ponownie',
        next: 'Następna lekcja',
        lastDone: 'To była ostatnia lekcja.',
        loadError: 'Nie udało się zapisać postępu w tej przeglądarce.',
      },
      lessons: copy.pl,
    },
  },
};
