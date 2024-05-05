import React, { useState } from 'react';
import TypingTest from './Home/TypingTest';
import { Navbar } from './Home/Navbar';
import { Footer } from './Home/Footer';
import { Translator } from '@utils/translator';

const Home: React.FC = () => {
    const [timeLeft, setTimeLeft] = useState<number>(30);
    const [language, setLanguage] = useState<number>(1);

    const handleLanguageChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
        setLanguage(Number(event.target.value));
    };

    return (
    <div className="flex flex-col min-h-screen">
        <Navbar />
        <div className="flex-1 flex flex-col gap-4 items-center justify-center">
            <div className='flex flex-row justify-center items-center gap-8 w-10/12 p-2 rounded-lg bg-black bg-opacity-25'>
                <div className='flex flex-col justify-center self-center'>
                    <label className="whitespace-nowrap">{Translator('typingtest.timelimit')} : {timeLeft}s</label>
                    <input
                        className='w-full range accent-green-400'
                        type="range"
                        min="1"
                        max="120"
                        value={timeLeft}
                        onChange={(e) => setTimeLeft(Number(e.target.value))}
                    />
                </div>
                <div className='flex flex-col'>
                    <label className="whitespace-nowrap">{Translator('typingtest.language')}</label>
                    <select
                        className='w-full border-2 bg-green-400 border-green-600 accent-green-500 rounded-md p-1 font-semibold'
                        value={language}
                        onChange={handleLanguageChange}
                    >
                        <option value={1}>{Translator('typingtest.languages.pl')}</option>
                        <option value={2}>{Translator('typingtest.languages.en')}</option>
                    </select>
                </div>
            </div>
            <TypingTest key={`${timeLeft}-${language}`} initialTimeLeft={timeLeft} language={language} />
        </div>
        <Footer />
    </div>
  );
};

export default Home;
