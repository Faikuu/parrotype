import { useQuery } from '@tanstack/react-query';
import { apiCall } from '@utils/api';
import { Translator } from '@utils/translator';
import { useState, useEffect, useRef, } from 'react';

async function fetchData(language: number) {
  try {
    const result = await apiCall<any>({ url: `/model/random/${language}`, method: 'GET' });
    return result.data[0];
  } catch (error) {
    console.error(error);
    return '';
  }
}

async function submitData(data: any) {
  try {
    const result = await apiCall<any>({ url: `/stat/submit`, method: 'POST', body: data });
    return result.data;
  } catch (error) {
    console.error(error);
    return '';
  }
}

const TypingTest = ({ initialTimeLeft = 30, language = 1 }: { initialTimeLeft?: number, language?: number }) => {
  const [text, setText] = useState<string>('');
  const [startTime, setStartTime] = useState<Date | null>(null);
  const [endTime, setEndTime] = useState<Date | null>(null);
  const [timeLeft, setTimeLeft] = useState<number>(initialTimeLeft);
  const [wordsPerMinute, setWordsPerMinute] = useState<number>(0);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [userInput, setUserInput] = useState<string>('');
  const [feedback, setFeedback] = useState<string[]>([]);
  const cursorRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const interval = setInterval(() => {
      if (startTime){
        const timeLeft = endTime ? Math.round((endTime.getTime() - new Date().getTime()) / 1000) : 0;
        if (timeLeft >= 0){
          setTimeLeft(timeLeft);
        }
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [endTime]);

  useEffect(() => {
    const updateWordsPerMinute = () => {
      if (!startTime) return;
      const timeLeft = endTime ? Math.round((endTime.getTime() - new Date().getTime()) / 1000) : 0;
      if (timeLeft < 0) return;
      const words = userInput.split(' ');
      const numWords = words.length;
      const currentTime = new Date().getTime();
      const timeDiff = (currentTime - startTime!.getTime()) / 1000;
      const wpm = ((numWords / timeDiff) * 60).toFixed(2);
      setWordsPerMinute(parseFloat(wpm));
    };

    updateWordsPerMinute();
    // const interval = setInterval(updateWordsPerMinute, 1000);

    // return () => clearInterval(interval);
  }, [timeLeft]);

  const { data: textTemp } = useQuery({
    queryKey: ['models', language],
    queryFn: () => fetchData(language),
  });
  useEffect(() => {
    setText(textTemp?.model || '');
    handleIncorrectKey();
  }, [textTemp]);

  const isModifierKey = (key: string) => {
    return key.startsWith('Control') || key.startsWith('Alt') || key.startsWith('Shift');
  };

  const handleKeyPress = (e: KeyboardEvent) => {
    if (isModifierKey(e.key)) {
      return;
    }
    // console.log(text);
    // console.log(e.key, text[currentIndex]);

    if (e.key === 'Backspace') {
      handleBackspace();
    } else if (e.key === text[currentIndex]) {
      handleCorrectKey();
    } else {
      handleIncorrectKey();
    }
  };

  const handleCorrectKey = () => {
    setFeedback((prevFeedback) => [...prevFeedback, 'correct']);
    setCurrentIndex((prevCurrentIndex) => prevCurrentIndex + 1);
    setUserInput((prevUserInput) => `${prevUserInput}${text[currentIndex]}`);

    if (startTime === null) {
      setStartTime(new Date());
      setEndTime(new Date(new Date().getTime() + timeLeft * 1000));
    }
  };

  const handleIncorrectKey = () => {
    setFeedback((prevFeedback) => [...prevFeedback.slice(0, currentIndex), 'incorrect', ...prevFeedback.slice(currentIndex + 1)]);
  };

  const handleBackspace = () => {
    if (userInput.length > 0) {
      setFeedback((prevFeedback) => prevFeedback.slice(0, -1));
      setCurrentIndex((prevCurrentIndex) => prevCurrentIndex - 1);
      setUserInput((prevUserInput) => prevUserInput.slice(0, -1));
    }
  };

  useEffect(() => {
    document.addEventListener('keydown', handleKeyPress);

    return () => {
      document.removeEventListener('keydown', handleKeyPress);
    };
  }, [currentIndex, userInput, feedback]);

  useEffect(() => {
    const intervalId = setInterval(() => {
      if (cursorRef.current) {
        cursorRef.current.style.transition = 'opacity 0.5s ease-in-out, left 0.5s ease-in-out';
        cursorRef.current.style.opacity = cursorRef.current.style.opacity === '0' ? '1' : '0';
      }
    }, 500);

    return () => clearInterval(intervalId);
  }, []);

  const handleStatisticSave = async (shouldSave: boolean) => {
    if (shouldSave){
      await submitData({modelId: textTemp.id, wpm: wordsPerMinute});
      window.location.reload();
    } else {
      window.location.reload();
    }
  }

  return (
    <div className='flex flex-col justify-center items-center gap-4'>
      <div className={`transition-all ${timeLeft <= 0 ? 'translate-y-[-10vh] opacity-0' : ''} bg-transparent rounded-lg p-4 w-[75vw] h-[30vh] shadow-xl overflow-hidden`}>
        <div className="text-2xl text-gray-500 select-none">
          {text ? (
            <>
              {text.split('').map((char, index) => (
                <span
                  key={index}
                  className={`
                    ${index < currentIndex ? 'text-gray-300' : ''}
                    ${feedback[index] === 'incorrect' && index === currentIndex ? 'text-red-500' : ''}
                    inline-block
                  `}
                >
                  {index === currentIndex ? <span ref={cursorRef} className="absolute mt-[0.8vh] inline-block bg-green-500 w-[3px] h-[2.5vh] rounded"/> : ''}
                  {char === ' ' ? '\u00A0' : char}
                </span>
              ))}
            </>
          ) : (
            <p></p>
          )}
        </div>
      </div>
      <div className={`h-[1px] bg-white bg-opacity-75 rounded-lg transition-all duration-500 ${timeLeft <= 0 ? 'translate-y-[-15vh] w-0 h' : 'w-full'}`}/>
      <div className={`flex flex-col justify-center items-center p-2 bg-black bg-opacity-25 rounded-lg transition-all duration-500 ${timeLeft <= 0 ? 'translate-y-[-15vh]' : ''}`}>
        <p>{Translator('typingtest.wpm')}: {Math.floor(wordsPerMinute)}</p>
        <p>{Translator('typingtest.timeleft')}: {timeLeft}s</p>
        <div className={`transition-all duration-500 ${timeLeft > 0 ? 'opacity-0 h-0' : ''}`}>
          <p className='mt-8'>{Translator('typingtest.savescore')}</p>
          <div className='flex flex-row gap-8'>
            <button className="group relative w-full flex justify-center p-4 py-2 my-2 border border-transparent text-sm font-medium rounded-md text-white hover:bg-green-400 transition-all" onClick={() => handleStatisticSave(false)}>{Translator('common.no')}</button>
            <button className="group relative w-full flex justify-center p-4 py-2 my-2 border border-transparent text-sm font-medium rounded-md text-white hover:bg-green-400 transition-all" onClick={() => handleStatisticSave(true)}>{Translator('common.yes')}</button>
          </div>
        </div>
      </div>
    </div>
  );  
};

export default TypingTest;
